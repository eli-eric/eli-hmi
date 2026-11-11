#!/usr/bin/env python3
"""Run the generated database as a real EPICS IOC.

    uv sync --extra epics --extra ioc      # make install-ioc
    python ioc/run_ioc.py

This is a genuine IOC: EPICS base's iocCore, loaded from the `epicscorelibs`
wheel by pythonSoftIOC, serving Channel Access on port 5064 with real record
processing, real alarm limits and real link semantics. The only thing it is not
is a *built* EPICS installation — which is the point, because that took a Rocky
container and a `make` of base 7.0.8 (see Dockerfile, which still does exactly
that if you want `caget`/`caput` and a stock `softIoc` binary alongside).

The records do the simulating; there is no Python in the loop — except for
cameras. A camera image is a waveform no database record can invent, so with
`--zone` each of the zone's cameras gets a waveform record (USHORT, width x
height elements) fed at the camera's rate by the same beam simulator the HMI
uses without an IOC (`cameras/sim.py`). The stock `softIoc` in the Dockerfile
has no Python and therefore serves no cameras.

Then point the HMI at the generated zone (the one whose field PVs were rewritten
to names a base-only IOC can serve):

    ZONE_CODE=TESTZ-IOC EPICS_BACKEND=aioca python -m core

`--list` prints every PV the IOC will serve, which is the quickest way to check
a config change reached the database.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
#: The development zone's database. `--db` picks another; `make ioc
#: ZONE_CODE=01` passes the right one.
DEFAULT_DB = HERE / "db" / "testz.db"


def record_names(db: Path) -> list[str]:
    return re.findall(r'^record\([a-z]+,\s*"([^"]+)"\)', db.read_text(encoding="utf-8"), re.M)


def camera_records(zone_code: str, builder) -> list[tuple[object, object]]:
    """One waveform record per camera of the zone, created before `iocInit`.

    Returns `(spec, record)` pairs for `feed_camera`. The record is named
    after the camera's PV exactly: the builder joins a device name and a
    record name with `:`, so the PV is split at its last colon.
    """
    import numpy as np

    from core.zones import load_zone

    pairs = []
    for spec in load_zone(zone_code).cameras().values():
        device, _, name = spec.pv.rpartition(":")
        builder.SetDeviceName(device)
        record = builder.WaveformIn(name, length=spec.pixels, datatype=np.uint16)
        pairs.append((spec, record))
    return pairs


async def feed_camera(spec, record) -> None:
    """Publish simulated frames of one camera at its rate, forever."""
    from cameras.sim import BeamSimulator, _camera_seed

    simulator = BeamSimulator(spec, seed=_camera_seed(1, spec.pv))
    loop = asyncio.get_running_loop()
    period = 1.0 / spec.rate
    next_at = loop.time()
    while True:
        pixels = await asyncio.to_thread(simulator.next)
        record.set(pixels.reshape(-1))
        next_at = max(next_at + period, loop.time())
        await asyncio.sleep(next_at - loop.time())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"database (default: {DEFAULT_DB.name})")
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="drop into the IOC shell (dbl, dbpr, dbpf) instead of just running",
    )
    parser.add_argument("--list", action="store_true", help="print the PVs and exit")
    parser.add_argument(
        "--zone",
        help="also serve this zone's cameras as waveform records fed by the beam simulator",
    )
    parser.add_argument(
        "--cameras-only",
        action="store_true",
        help="serve the zone's cameras and nothing else (no --db), e.g. as a second IOC on "
        "another EPICS_CA_SERVER_PORT for a camera load test",
    )
    args = parser.parse_args()

    if args.cameras_only and not args.zone:
        parser.error("--cameras-only needs --zone")
    if not args.cameras_only and not args.db.is_file():
        parser.error(f"{args.db} not found — run `python ioc/generate.py` first")

    names = [] if args.cameras_only else record_names(args.db)
    if args.list:
        print("\n".join(names))
        return 0

    try:
        from softioc import asyncio_dispatcher, builder, softioc
    except ImportError:
        print(
            "This needs pythonSoftIOC: uv sync --extra ioc\n"
            "(it brings EPICS base along as a wheel — nothing to build).",
            file=sys.stderr,
        )
        return 2

    # pythonSoftIOC always expects at least its own device support loaded, and
    # `LoadDatabase` is what registers the record types our .db uses.
    cameras = camera_records(args.zone, builder) if args.zone else []
    builder.LoadDatabase()
    if not args.cameras_only:
        softioc.dbLoadDatabase(args.db.name, str(args.db.parent))
    dispatcher = asyncio_dispatcher.AsyncioDispatcher()
    softioc.iocInit(dispatcher)
    for spec, record in cameras:
        asyncio.run_coroutine_threadsafe(feed_camera(spec, record), dispatcher.loop)

    served = f"{len(names)} records from {args.db.name}" if names else "no database"
    print(
        f"\nIOC serving {served} and {len(cameras)} camera(s) "
        f"on CA port {os.environ.get('EPICS_CA_SERVER_PORT', '5064')}.\n"
        f"Point the HMI at it with:  make run-ioc\n",
        flush=True,
    )

    if args.interactive:
        softioc.interactive_ioc(globals())
    else:
        softioc.non_interactive_ioc()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
