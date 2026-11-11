#!/usr/bin/env python3
"""What one camera frame costs the gateway, step by step.

    make cambench
    uv run python tools/cambench.py --bits 16 --size 2048x2048

Times each step the gateway runs per frame — the simulator (only in sim mode),
the statistics, the downscale-levels-JPEG encode at each scale, and the
lossless encode — on one core, and says how many frames a second of each one
core could do. Single-threaded on purpose: the gateway runs encodes on a
thread pool, and numpy and libjpeg-turbo release the GIL, so a station with
N cores has roughly N times this — `make camload` measures the whole process.
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cameras.encode import downscale, encode_lossless, encode_tile, frame_stats  # noqa: E402
from cameras.sim import BeamSimulator  # noqa: E402
from cameras.spec import CameraSpec, SimBeam  # noqa: E402


def timed(work, repeat: int) -> tuple[float, object]:
    """Median milliseconds over `repeat` runs, and the last result."""
    work()  # warm up: first-call allocation and caches are not steady state
    samples, result = [], None
    for _ in range(repeat):
        started = time.perf_counter()
        result = work()
        samples.append((time.perf_counter() - started) * 1000)
    return statistics.median(samples), result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--size", default="1024x1024", help="WIDTHxHEIGHT (default 1024x1024)")
    parser.add_argument("--bits", type=int, default=12, help="bits per pixel (default 12)")
    parser.add_argument("--repeat", type=int, default=30)
    args = parser.parse_args()
    width, height = (int(part) for part in args.size.lower().split("x"))

    print(f"{width}x{height}, {args.bits}-bit, median of {args.repeat}, one core\n")
    print(f"{'step':34s} {'ms':>7s} {'per core/s':>10s} {'bytes':>9s}")
    for profile, waist in (("gaussian", 0.04 * width), ("flattop", 0.3 * width)):
        spec = CameraSpec(
            pv=f"BENCH:{profile}", width=width, height=height, bits=args.bits,
            sim=SimBeam(profile=profile, waist=waist),
        )
        simulator = BeamSimulator(spec, seed=1)
        print(f"-- {profile} beam, waist {waist:.0f} px")
        rows: list[tuple[str, float, int | None]] = []
        ms, frame = timed(simulator.next, args.repeat)
        rows.append(("simulate a frame (sim mode only)", ms, None))
        ms, _ = timed(lambda: frame_stats(frame, spec), args.repeat)
        rows.append(("statistics (max, saturation)", ms, None))
        for factor in (2, 4, 8):
            ms, _ = timed(lambda: downscale(frame, factor), args.repeat)
            rows.append((f"  of which downscale /{factor}", ms, None))
        for factor in (1, 2, 4, 8):
            ms, tile = timed(lambda: encode_tile(frame, spec, factor=factor), args.repeat)
            rows.append((f"JPEG tile /{factor} ({tile.width}x{tile.height})", ms, len(tile.data)))
        for factor in (1, 2):
            ms, tile = timed(lambda: encode_lossless(frame, factor=factor), args.repeat)
            rows.append((f"16-bit lossless /{factor} ({tile.width}x{tile.height})", ms, len(tile.data)))
        for name, ms, size in rows:
            rate = f"{1000 / ms:10.0f}" if ms > 0 else "         -"
            print(f"{name:34s} {ms:7.2f} {rate} {'' if size is None else f'{size:9d}'}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
