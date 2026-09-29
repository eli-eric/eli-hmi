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

The records do the simulating; there is no Python in the loop. This file loads
the database and hands control to the IOC shell.

Then point the HMI at the generated zone (the one whose field PVs were rewritten
to names a base-only IOC can serve):

    ZONE_CODE=TESTZ-IOC EPICS_BACKEND=aioca python -m core

`--list` prints every PV the IOC will serve, which is the quickest way to check
a config change reached the database.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
#: The development zone's database. `--db` picks another; `make ioc
#: ZONE_CODE=01` passes the right one.
DEFAULT_DB = HERE / "db" / "testz.db"


def record_names(db: Path) -> list[str]:
    return re.findall(r'^record\([a-z]+,\s*"([^"]+)"\)', db.read_text(encoding="utf-8"), re.M)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"database (default: {DEFAULT_DB.name})")
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="drop into the IOC shell (dbl, dbpr, dbpf) instead of just running",
    )
    parser.add_argument("--list", action="store_true", help="print the PVs and exit")
    args = parser.parse_args()

    if not args.db.is_file():
        parser.error(f"{args.db} not found — run `python ioc/generate.py` first")

    names = record_names(args.db)
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
    builder.LoadDatabase()
    softioc.dbLoadDatabase(args.db.name, str(args.db.parent))
    softioc.iocInit(asyncio_dispatcher.AsyncioDispatcher())

    print(
        f"\nIOC serving {len(names)} records from {args.db.name} "
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
