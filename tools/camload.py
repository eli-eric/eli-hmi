#!/usr/bin/env python3
"""Load-test the camera gateway: N cameras, C browsers, what gets delivered.

    make camload CAMERAS=100 CLIENTS=4
    uv run --group dev python tools/camload.py --cameras 100 --clients 4 --seconds 15

Writes a throwaway zone with N simulated 1024x1024 cameras, starts the gateway
as its own process (`python -m cameras`, exactly as a station runs it), opens C
WebSocket clients and runs each scenario for a while:

* **wall**  — every client shows every camera as a small tile (2 fps);
* **focus** — every client also has one camera in full-resolution focus
  (10 fps), each a different camera;
* **lossless** — the same, with the focus view in 16-bit lossless mode.

For each it reports cameras open, frames delivered per second against frames
asked for, latency (frame timestamp to arrival at the client), bytes per
second into the gateway from its source (the network cost on a station) and
out to the clients, frames dropped by the latest-wins slots, the mean
encode time (wall clock, so including any wait for a free encoder thread)
and the gateway's CPU — in cores, from `ps`, so it counts every thread. With the simulator, that CPU
includes drawing the frames, which a real station spends on receiving them
over CA instead; `--ca` measures that path against `ioc/run_ioc.py` (needs
the `epics` and `ioc` extras).

Numbers depend on the machine; cameras/README.md records a run and says on
what.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import socket
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import httpx  # noqa: E402
from websockets.asyncio.client import connect  # noqa: E402

from cameras.protocol import SOCKET_PATH, STATS_PATH, unpack_frame  # noqa: E402
from core.auth import COOKIE_NAME, SessionCodec  # noqa: E402

SECRET = "camload-only-not-a-secret"
TILE_PX, TILE_FPS = 300, 2.0
FOCUS_PX, FOCUS_FPS = 1024, 10.0


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def write_zone(root: Path, cameras: int, filters: bool) -> list[str]:
    """A zone folder with one screen of `cameras` simulated cameras."""
    zone = root / "CAMLOAD"
    (zone / "wall").mkdir(parents=True)
    (zone / "zone.yaml").write_text("title: Camera load test\nhostnames: []\n")
    pvs = [f"CAMLOAD:CAM{n:03d}:Image" for n in range(cameras)]
    lines = ["title: Wall", "components:"]
    for n, pv in enumerate(pvs):
        profile = "flattop" if n % 3 == 0 else "gaussian"
        lines += [
            "  - component: camera",
            f"    label: Camera {n}",
            f"    pv: {pv}",
            "    width: 1024",
            "    height: 1024",
            f"    filters: {'true' if filters else 'false'}",
            f"    sim: {{ profile: {profile} }}",
        ]
    (zone / "wall" / "gui.yaml").write_text("\n".join(lines) + "\n")
    return pvs


def cpu_seconds(pid: int) -> float:
    """Cumulative CPU time of a process, all threads, from `ps` (macOS and Linux)."""
    text = subprocess.run(["ps", "-o", "time=", "-p", str(pid)], capture_output=True, text=True).stdout
    text = text.strip()
    days = 0
    if "-" in text:
        day, text = text.split("-", 1)
        days = int(day)
    parts = [float(part) for part in text.split(":")]
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + part
    return days * 86400 + seconds


class Client:
    def __init__(self, url: str, cookie: str, view: dict):
        self.url, self.cookie, self.view = url, cookie, view
        self.frames: dict[str, int] = {}
        self.latency: list[float] = []
        self.bytes = 0

    async def run(self, seconds: float) -> None:
        async with connect(
            self.url, additional_headers={"Cookie": f"{COOKIE_NAME}={self.cookie}"}, max_size=None
        ) as ws:
            hello = json.loads(await ws.recv())["hello"]
            await ws.send(json.dumps({"view": self.view}))
            deadline = time.monotonic() + seconds
            warm = time.monotonic() + min(2.0, seconds / 4)
            while time.monotonic() < deadline:
                try:
                    message = await asyncio.wait_for(ws.recv(), timeout=max(0.1, deadline - time.monotonic()))
                except asyncio.TimeoutError:
                    break
                if not isinstance(message, bytes) or time.monotonic() < warm:
                    continue  # the first seconds are subscriptions opening
                header, payload = unpack_frame(message)
                pv = hello["cameras"][header.camera]
                self.frames[pv] = self.frames.get(pv, 0) + 1
                self.bytes += len(message)
                self.latency.append(time.time() - header.timestamp)
        self.seconds = seconds - min(2.0, seconds / 4)


async def scenario(name: str, url: str, stats_url: str, cookie: str, pid: int, views: list[dict], seconds: float):
    clients = [Client(url, cookie, view) for view in views]
    cpu_before, wall_before = cpu_seconds(pid), time.monotonic()
    async with httpx.AsyncClient(cookies={COOKIE_NAME: cookie}) as http:
        before = (await http.get(stats_url)).json()
        running = asyncio.gather(*(client.run(seconds) for client in clients))
        await asyncio.sleep(seconds * 0.75)
        during = (await http.get(stats_url)).json()
        await running
        after = (await http.get(stats_url)).json()
    cores = (cpu_seconds(pid) - cpu_before) / (time.monotonic() - wall_before)

    asked = delivered = 0.0
    for client in clients:
        for pv, want in client.view.items():
            asked += want["fps"]
            delivered += client.frames.get(pv, 0) / client.seconds
    latencies = sorted(value for client in clients for value in client.latency)
    p50 = statistics.median(latencies) * 1000 if latencies else float("nan")
    p95 = latencies[int(len(latencies) * 0.95) - 1] * 1000 if latencies else float("nan")
    mib = sum(client.bytes for client in clients) / clients[0].seconds / 2**20
    received = sum(after["cameras"][pv]["bytes_in"] - before["cameras"][pv]["bytes_in"] for pv in after["cameras"])
    mib_in = received / seconds / 2**20
    dropped = sum(after["cameras"][pv]["dropped"] - before["cameras"][pv]["dropped"] for pv in after["cameras"])
    encodes = [item["encode_ms"] for item in during["cameras"].values() if item["open"]]
    open_cameras = sum(item["open"] for item in during["cameras"].values())
    print(
        f"{name:9s} {open_cameras:5d} {asked:8.0f} {delivered:9.1f} {100 * delivered / asked:5.0f}% "
        f"{p50:7.0f} {p95:7.0f} {mib_in:7.0f} {mib:8.2f} {dropped:8d} "
        f"{statistics.mean(encodes) if encodes else 0:7.2f} {cores:6.2f}"
    )


def wait_ready(port: int, process: subprocess.Popen, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise SystemExit(f"gateway exited:\n{process.stdout.read().decode()}")
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health/ready", timeout=1).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    raise SystemExit("gateway did not start")


async def run(args) -> int:
    with tempfile.TemporaryDirectory(prefix="camload-") as root:
        pvs = write_zone(Path(root), args.cameras, args.filters)
        port = free_port()
        env = {
            **os.environ,
            "ZONES_ROOT": root,
            "ZONE_CODE": "CAMLOAD",
            "CAMERA_PORT": str(port),
            "SESSION_SECRET": SECRET,
            "EPICS_BACKEND": "aioca" if args.ca else "sim",
            "LOG_LEVEL": "WARNING",
        }
        ioc = None
        if args.ca:
            env.update(EPICS_CA_ADDR_LIST="127.0.0.1:5065", EPICS_CA_AUTO_ADDR_LIST="NO")
            ioc = subprocess.Popen(
                [sys.executable, str(ROOT / "ioc" / "run_ioc.py"), "--zone", "CAMLOAD", "--cameras-only"],
                env={**env, "EPICS_CA_SERVER_PORT": "5065"},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
            )
            time.sleep(5)
        gateway = subprocess.Popen(
            [sys.executable, "-m", "cameras"], cwd=ROOT, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        try:
            wait_ready(port, gateway)
            cookie, _ = SessionCodec(SECRET, hours=1).issue("camload", "camload")
            url = f"ws://127.0.0.1:{port}{SOCKET_PATH}"
            stats_url = f"http://127.0.0.1:{port}{STATS_PATH}"
            source = "Channel Access (ioc/run_ioc.py)" if args.ca else "the built-in simulator"
            print(
                f"{args.cameras} cameras 1024x1024 12-bit at 10 Hz from {source}"
                f"{', IOC filters on' if args.filters else ''}; {args.clients} client(s); "
                f"{args.seconds:g} s per scenario; {os.cpu_count()} CPU(s)\n"
            )
            print(
                f"{'scenario':9s} {'open':>5s} {'asked/s':>8s} {'got/s':>9s} {'':>5s} "
                f"{'p50 ms':>7s} {'p95 ms':>7s} {'in MiB/s':>7s} {'out MiB/s':>8s} {'dropped':>8s} "
                f"{'enc ms':>7s} {'cores':>6s}"
            )
            tiles = {pv: {"px": TILE_PX, "fps": TILE_FPS} for pv in pvs}
            await scenario("wall", url, stats_url, cookie, gateway.pid, [dict(tiles)] * args.clients, args.seconds)
            for name, lossless in (("focus", False), ("lossless", True)):
                views = []
                for n in range(args.clients):
                    view = dict(tiles)
                    view[pvs[n % len(pvs)]] = {"px": FOCUS_PX, "fps": FOCUS_FPS, "lossless": lossless}
                    views.append(view)
                await scenario(name, url, stats_url, cookie, gateway.pid, views, args.seconds)
        finally:
            gateway.terminate()
            gateway.wait(timeout=10)
            if ioc is not None:
                ioc.terminate()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cameras", type=int, default=100)
    parser.add_argument("--clients", type=int, default=4)
    parser.add_argument("--seconds", type=float, default=12.0)
    parser.add_argument("--ca", action="store_true", help="frames over Channel Access from a local IOC")
    parser.add_argument("--filters", action="store_true", help="declare the cameras `filters: true`")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
