#!/usr/bin/env python3
"""Smoke test against a running IOC, over Channel Access.

    python ioc/run_ioc.py &
    python ioc/verify.py

Replaces `backend/epics/laser-mockup-ioc/verify-epics.sh`, which shelled into a
container for `caget`/`caput`. This talks CA directly with the same client
library the HMI uses, so it works for both the pip IOC and the Docker one, and a
failure here means the HMI would fail too.

What it checks is what the panel depends on, in the order the questions come up
when something looks wrong:

1. every PV in the zone connects at all;
2. the readouts that should be alarmed are alarmed, with the right severity;
3. a write lands (the shutter);
4. a command actually runs its chain (Start Laser moves the flashlamps).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.zones import load_zone  # noqa: E402

PASS = "  ok   "
FAIL = "  FAIL "


async def run(zone: str, timeout: float) -> int:
    import aioca

    loaded = load_zone(zone)
    pvs = sorted({pv.name for gui in loaded.guis for pv in gui.all_pvs()})
    failures = 0

    print(
        f"zone {zone}: {len(pvs)} PVs across {len(loaded.guis)} screen(s) "
        f"({', '.join(gui.slug for gui in loaded.guis)})"
    )

    print("\n1. connections")
    # aioca's caget takes a list and returns one value per name.
    values = await aioca.caget(pvs, format=aioca.FORMAT_TIME, throw=False, timeout=timeout)
    missing = [pv for pv, value in zip(pvs, values) if not value.ok]
    if missing:
        failures += 1
        print(f"{FAIL} {len(missing)} of {len(pvs)} PVs did not connect:")
        for pv in missing[:10]:
            print(f"         {pv}")
        if len(missing) > 10:
            print(f"         … and {len(missing) - 10} more")
        print("       Is the IOC running, and is EPICS_CA_ADDR_LIST pointing at it?")
    else:
        print(f"{PASS} all {len(pvs)} PVs connected")

    print("\n2. injected faults (the panel's alarm paths)")
    by_severity: dict[int, list[str]] = {}
    for pv, value in zip(pvs, values):
        if value.ok and getattr(value, "severity", 0):
            by_severity.setdefault(int(value.severity), []).append(pv)
    for severity, label in ((1, "MINOR"), (2, "MAJOR"), (3, "INVALID")):
        found = by_severity.get(severity, [])
        if found:
            print(f"{PASS} {label}: {', '.join(found[:3])}")
        else:
            failures += 1
            print(f"{FAIL} no {label} reading — the database should inject one")

    spec = _first_laser(loaded)
    if spec is None:
        print("\n3. write path: skipped, no laser panel in this zone")
        print("\n4. command chain: skipped")
        return 1 if failures else 0
    print(f"\n3. write path ({spec.laser} shutter)")
    shutter = spec.pvs.shutter
    before = await aioca.caget(shutter, datatype=aioca.DBR_ENUM_STR, throw=False)
    await aioca.caput(shutter, 1, timeout=timeout)
    await asyncio.sleep(0.3)
    opened = await aioca.caget(shutter, datatype=aioca.DBR_ENUM_STR, throw=False)
    await aioca.caput(shutter, 0, timeout=timeout)
    if str(opened) == "OPEN":
        print(f"{PASS} {shutter}: {before!r} -> {opened!r} -> back to CLOSED")
    else:
        failures += 1
        print(f"{FAIL} {shutter} did not open (read back {opened!r})")

    print(f"\n4. command chain ({spec.laser} Start Laser)")
    if not spec.can("START_LASER") or not spec.flashlamps:
        print("       skipped: this laser exposes no START_LASER or no flashlamps")
    else:
        channel = spec.flashlamps[0].pv
        target = spec.resolve_command("START_LASER")
        await aioca.caput(target.pv_name, target.value, timeout=timeout)
        await asyncio.sleep(0.5)
        state = await aioca.caget(channel, datatype=aioca.DBR_ENUM_STR, throw=False)
        running = None
        if spec.pvs.sequencer_running:
            running = await aioca.caget(
                spec.pvs.sequencer_running, datatype=aioca.DBR_ENUM_STR, throw=False
            )
        if str(state) == "RUN":
            print(f"{PASS} {target.pv_name} -> {channel} reads {state!r}")
            if running is not None:
                print(f"{PASS} sequencer reads {running!r} while the seq record runs")
        else:
            failures += 1
            print(f"{FAIL} {channel} reads {state!r}, expected RUN")
        # Put the machine back, so running this twice is not surprising.
        stop = spec.resolve_command("STOP_LASER")
        if spec.can("STOP_LASER"):
            await aioca.caput(stop.pv_name, stop.value, timeout=timeout)

    print()
    if failures:
        print(f"{failures} check(s) failed.")
    else:
        print("All checks passed — the HMI will see the same thing.")
    return 1 if failures else 0


def _first_laser(zone):
    """The first laser panel in the zone, if it has one.

    Checks 3 and 4 press a real control and watch what moves, and a laser panel
    is the screen with a known one. A zone of generic screens gets checks 1 and
    2 — which are the ones that catch a stale database anyway.
    """
    for gui in zone.guis:
        for component in gui.walk():
            if component.name == "laser-panel":
                return component.config
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--zone", default="TESTZ-IOC", help="zone to check (default: TESTZ-IOC)"
    )
    parser.add_argument("--timeout", type=float, default=3.0, help="CA timeout in seconds")
    args = parser.parse_args()
    try:
        import aioca  # noqa: F401
    except ImportError:
        print("This needs aioca: pip install -r requirements-epics.txt", file=sys.stderr)
        return 2
    return asyncio.run(run(args.zone, args.timeout))


if __name__ == "__main__":
    raise SystemExit(main())
