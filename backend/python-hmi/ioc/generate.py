#!/usr/bin/env python3
"""Generate an EPICS database for a zone, from what its components declare.

    python ioc/generate.py                  # the TESTZ zone
    python ioc/generate.py --zone 01
    python ioc/generate.py --zone 01 --screens motors

Nothing here knows what a laser, a chiller or a motor is. Every component says
what each of its PVs *is* (`Component.pv_specs()`), and this turns those
declarations into records:

    kind     record       simulated by
    float    calc         a random walk inside the band, with real alarm limits
    int      longin       held; written by a setpoint or a command
    bool     bi           held; ZSV makes a denied permission a MINOR alarm
    enum     mbbi         state names in ZRST…, so enum_string reads the name
    string   stringin     a code or a name
    command  bo + seq     one press, the declared writes, a delayed release

So a screen written purely in YAML gets a working IOC with no extra work — the
same declarations that let it run against the simulator. Add a component, and
the database knows about it the next time this runs.

Two files come out, and both have to be generated together or they drift:

* ``ioc/db/<zone>.db`` — the records.
* ``zones/<zone>-IOC/`` — a copy of the zone with the PVs that name a *field* of
  a record pointed at base-compatible stand-ins. A record name cannot contain a
  dot (Channel Access splits the name there to find the field), so an EPICS
  motor record's `.RBV` or an asyn record's `.CNCT` cannot be served by a
  base-only IOC. Run the HMI with `ZONE_CODE=<zone>-IOC` against this database.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Iterable

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.components import PvSpec  # noqa: E402
from core.zones import ZoneError, load_zone, zones_root  # noqa: E402

DB_DIR = ROOT / "ioc" / "db"
#: Suffix of the generated, IOC-compatible zone.
IOC_SUFFIX = "-IOC"

#: How often a drifting record is processed.
SCAN = "1 second"

MBB_STATE_FIELDS = (
    "ZRST", "ONST", "TWST", "THST", "FRST", "FVST", "SXST", "SVST",
    "EIST", "NIST", "TEST", "ELST", "TVST", "TTST", "FTST", "FFST",
)
#: A `seq` record holds 16 steps and a `dfanout` 16 outputs (EPICS base 7).
SEQ_STEPS = "0123456789ABCDEF"
DFANOUT_OUTPUTS = "ABCDEFGHIJKLMNOP"


@dataclass
class Db:
    """Accumulates records, emitting each PV exactly once.

    Sharing a PV is normal and expected: a site-wide interlock is read by every
    laser's screen, and a chiller's temperature may appear on both the laser
    panel and the plant screen. One signal, one record, however many components
    read it — so a repeat is skipped rather than duplicated (`dbLoadRecords`
    would otherwise silently keep the last definition).

    When two components describe the same PV *differently* — a different band,
    a different precision — the first description wins and the disagreement is
    reported. It is not an error: in the hall two screens showing one PV at
    different precisions is ordinary. But it is worth knowing, because the
    simulated value will follow whichever screen was read first.
    """

    lines: list[str] = dc_field(default_factory=list)
    blocks: dict[str, str] = dc_field(default_factory=dict)
    shared: set[str] = dc_field(default_factory=set)
    skipped: dict[str, str] = dc_field(default_factory=dict)
    disagreed: dict[str, tuple[str, str]] = dc_field(default_factory=dict)

    def comment(self, text: str = "") -> None:
        self.lines.append(f"# {text}" if text else "#")

    def section(self, title: str) -> None:
        self.lines.append("")
        self.lines.append("# " + "-" * 74)
        self.lines.append(f"# {title}")
        self.lines.append("# " + "-" * 74)

    def record(
        self,
        rtype: str,
        name: str,
        fields: Iterable[tuple[str, Any]],
        *,
        note: str | None = None,
    ) -> str:
        block = [f'record({rtype}, "{name}") {{']
        for key, value in fields:
            if value is None:
                continue
            block.append(f'    field({key}, "{value}")')
        block.append("}")
        rendered = "\n".join(block)

        if name in self.blocks:
            if self.blocks[name] != rendered:
                self.disagreed.setdefault(name, (self.blocks[name], rendered))
            self.shared.add(name)
            return name

        self.blocks[name] = rendered
        if note:
            self.lines.append(f"# {note}")
        self.lines.extend(block)
        return name

    @property
    def names(self) -> list[str]:
        return list(self.blocks)

    def render(self) -> str:
        return "\n".join(self.lines) + "\n"


# ---------------------------------------------------------------------------
# One PV -> one record
# ---------------------------------------------------------------------------


def apply_rewrite(spec: PvSpec, rewrite: dict[str, str]) -> PvSpec:
    """The same declaration, with field PVs pointed at their stand-ins.

    Applied to the name, to a command's effect targets and to its busy flags, so
    a motor's `.RBV`/`.VAL`/`.DMOV` trio stays wired together under the names
    the generated zone asks for.
    """
    if not rewrite:
        return spec
    return PvSpec(
        **{
            **spec.__dict__,
            "name": rewrite.get(spec.name, spec.name),
            "effects": tuple(
                (rewrite.get(target, target), value) for target, value in spec.effects
            ),
            "busy": tuple(rewrite.get(name, name) for name in spec.busy),
        }
    )


def emit(db: Db, spec: PvSpec) -> None:
    """Whichever record type says what this component declared."""
    if "." in spec.name:
        # Should be unreachable: `apply_rewrite` has already pointed these at a
        # stand-in. Reported rather than dropped in case a component invents a
        # name the rewrite did not see.
        db.skipped[spec.name] = "names a record field, which a record name cannot contain"
        return
    if spec.command:
        emit_command(db, spec)
    elif spec.kind == "float":
        emit_analog(db, spec)
    elif spec.kind == "int":
        emit_integer(db, spec)
    elif spec.kind == "bool":
        emit_bool(db, spec)
    elif spec.kind == "enum":
        emit_enum(db, spec)
    else:
        emit_string(db, spec)


def emit_analog(db: Db, spec: PvSpec) -> None:
    """A `calc` record: a random walk inside its band, with real alarm limits.

    ``INPA`` reads the record's own VAL, so each scan moves from where the last
    one left off — a drifting readout looks like a machine, while uniform noise
    looks like a fault. The limits are the point of doing this in a record at
    all: the panel's MINOR and MAJOR then come from EPICS evaluating a limit,
    through exactly the path a real alarm takes.
    """
    fields: list[tuple[str, Any]] = [("DESC", spec.desc[:40])]
    if spec.undefined:
        # Never processed, so Channel Access reports it UDF/INVALID. This is not
        # a trick: it is what an un-initialised record looks like in a real IOC,
        # and `PV INV` is the state an operator most needs to recognise.
        fields.append(("SCAN", "Passive"))
        note = "Deliberately never processed: reads INVALID/UDF (the panel shows PV INV)."
    elif spec.step > 0:
        mid = (spec.low + spec.high) / 2
        fields += [
            ("SCAN", SCAN),
            ("PINI", "YES"),
            ("VAL", spec.value if spec.value is not None else mid),
            ("INPA", f"{spec.name}.VAL NPP NMS"),
            ("B", spec.step * 2),
            ("C", spec.low),
            ("D", spec.high),
            ("CALC", "MIN(D,MAX(C,A+(RNDM-0.5)*B))"),
        ]
        note = None
    else:
        mid = (spec.low + spec.high) / 2
        fields += [("PINI", "YES"), ("VAL", spec.value if spec.value is not None else mid)]
        note = None
    fields += [
        ("EGU", spec.egu),
        ("PREC", spec.prec),
        ("LOPR", spec.low),
        ("HOPR", spec.high),
        ("HIGH", spec.high_alarm),
        ("HSV", "MINOR" if spec.high_alarm is not None else None),
        ("HIHI", spec.hihi),
        ("HHSV", "MAJOR" if spec.hihi is not None else None),
        ("LOW", spec.low_alarm),
        ("LSV", "MINOR" if spec.low_alarm is not None else None),
        ("LOLO", spec.lolo),
        ("LLSV", "MAJOR" if spec.lolo is not None else None),
    ]
    db.record("calc", spec.name, fields, note=note)


def emit_integer(db: Db, spec: PvSpec) -> None:
    """A soft `longin`: a readback that holds until something writes it.

    Input records with no INP keep whatever is written to VAL, which is how a
    simulation drives a readback without pretending to be device support.
    """
    # Every numeric field of a `longin` is a LONG: EPICS rejects "40000.0" for
    # HOPR with "Extraneous characters", which is a puzzling way to be told that
    # a float reached an integer field.
    value = spec.value if spec.value is not None else (spec.low + spec.high) / 2
    db.record(
        "longin",
        spec.name,
        [
            ("DESC", spec.desc[:40]),
            ("PINI", "NO" if spec.undefined else "YES"),
            ("VAL", None if spec.undefined else int(value)),
            ("EGU", spec.egu),
            ("LOPR", _int_or_none(spec.low)),
            ("HOPR", _int_or_none(spec.high)),
            ("HIGH", _int_or_none(spec.high_alarm)),
            ("HSV", "MINOR" if spec.high_alarm is not None else None),
            ("HIHI", _int_or_none(spec.hihi)),
            ("HHSV", "MAJOR" if spec.hihi is not None else None),
            ("LOW", _int_or_none(spec.low_alarm)),
            ("LSV", "MINOR" if spec.low_alarm is not None else None),
            ("LOLO", _int_or_none(spec.lolo)),
            ("LLSV", "MAJOR" if spec.lolo is not None else None),
        ],
    )


def emit_bool(db: Db, spec: PvSpec) -> None:
    """A soft `bi`. `ZSV` is how a denied permission becomes a MINOR alarm —
    the control system's own opinion, rather than a colour the UI chose.
    """
    # The component's own words where it gave them: a shutter record that reads
    # CLOSED/OPEN is what someone debugging with `camonitor` expects, and it
    # matches what the screen shows.
    zero, one = (list(spec.states) + ["off", "on"])[:2] if spec.states else ("off", "on")
    db.record(
        "bi",
        spec.name,
        [
            ("DESC", spec.desc[:40]),
            ("PINI", "NO" if spec.undefined else "YES"),
            ("VAL", None if spec.undefined else (1 if spec.value is None else int(spec.value))),
            ("ZNAM", zero),
            ("ONAM", one),
            ("ZSV", "MINOR" if spec.severity == 1 else None),
        ],
    )


def emit_enum(db: Db, spec: PvSpec) -> None:
    """A soft `mbbi` — the record type the panel asks for by state *name*
    (`datatype='enum_string'`), because reading it natively gives the index.
    """
    fields: list[tuple[str, Any]] = [
        ("DESC", spec.desc[:40]),
        ("PINI", "YES"),
        ("VAL", int(spec.value or 0)),
    ]
    for state_field, state in zip(MBB_STATE_FIELDS, spec.states):
        fields.append((state_field, state))
    db.record("mbbi", spec.name, fields)


def emit_string(db: Db, spec: PvSpec) -> None:
    db.record(
        "stringin",
        spec.name,
        [
            ("DESC", spec.desc[:40]),
            ("PINI", "NO" if spec.undefined else "YES"),
            ("VAL", None if spec.undefined else str(spec.value or "")),
        ],
    )


def emit_command(db: Db, spec: PvSpec) -> None:
    """A trigger and its chain: a `bo` whose FLNK runs a `seq` record.

    The delay lives in the record, not in a Python `sleep`, and the IOC keeps
    running while the sequence plays out. `busy` becomes the bracket: set at
    step 0, cleared by a step delayed `busy_seconds`, which is what gives a
    screen something to show between "pressed" and "finished".
    """
    steps: list[tuple[float, Any, str]] = []
    for name in spec.busy:
        steps.append((0, 1, name))

    # Writes that send the same value to several records become one `dfanout`:
    # "set all 14 flashlamps to RUN" is one write to one record, which is both
    # what a real IOC would do and the only way it fits in a seq record's 16
    # steps. Strings cannot go through a dfanout (its VAL is a double), so they
    # stay as individual steps.
    groups: dict[Any, list[str]] = {}
    for target, value in spec.effects:
        if not isinstance(target, str) or "." in target:
            continue
        # `None` means "write whatever the operator sent". A seq step carries a
        # constant, so a record can only write a fixed one; the simulator passes
        # the real value through. Called out in the note below so nobody reads a
        # stuck value as a bug.
        key = 1 if value is None else value
        groups.setdefault(key, []).append(target)

    for value, targets in groups.items():
        if len(targets) == 1 or isinstance(value, str):
            steps.extend((0, value, target) for target in targets)
            continue
        for chunk_index, chunk in enumerate(_chunks(targets, len(DFANOUT_OUTPUTS))):
            if len(chunk) == 1:
                steps.append((0, value, chunk[0]))
                continue
            fan = f"SIM:{spec.name.replace(':', '_')}:fan{chunk_index}{_value_tag(value)}"
            db.record(
                "dfanout",
                fan,
                [("DESC", f"{spec.name} -> {len(chunk)} records"[:40]), ("VAL", value)]
                + [
                    (f"OUT{letter}", f"{target} PP")
                    for letter, target in zip(DFANOUT_OUTPUTS, chunk)
                ],
                note=f"One write, {len(chunk)} records.",
            )
            steps.append((0, value, fan))

    for name in spec.busy:
        steps.append((spec.busy_seconds, 0, name))

    if not steps:
        db.skipped[spec.name] = "a command with no effects has nothing to write"
        return
    if len(steps) > len(SEQ_STEPS):
        # Chaining a second seq record would work; nothing needs it yet, and a
        # silent truncation would be worse than a loud stop.
        raise SystemExit(
            f"{spec.name}: {len(steps)} writes, but a seq record holds "
            f"{len(SEQ_STEPS)}. Split the command."
        )

    sequence = f"SIM:{spec.name.replace(':', '_')}:seq"
    operator_valued = any(value is None for _target, value in spec.effects)
    db.record(
        "stringout" if spec.kind == "string" else "bo",
        spec.name,
        [("DESC", spec.desc[:40]), ("FLNK", sequence)]
        + ([] if spec.kind == "string" else [("ZNAM", "IDLE"), ("ONAM", "GO")]),
        note=(
            # No PINI on a command record: it would fire the whole chain at IOC
            # start-up, which is how the first version of this database managed
            # to boot with the shutter open.
            "The panel writes here to run the chain below."
            + (
                " The operator's value cannot be carried by a seq step, so the "
                "chain writes a constant; the simulator passes the real value."
                if operator_valued
                else ""
            )
        ),
    )
    fields: list[tuple[str, Any]] = [("DESC", f"{spec.name} chain"[:40]), ("SELM", "All")]
    for index, (delay, value, target) in enumerate(steps):
        suffix = SEQ_STEPS[index]
        fields += [
            (f"DLY{suffix}", delay),
            (f"DO{suffix}", value),
            (f"LNK{suffix}", f"{target} PP"),
        ]
    db.record("seq", sequence, fields)


# ---------------------------------------------------------------------------
# The IOC-compatible zone
# ---------------------------------------------------------------------------


def field_pv_rewrite(specs: Iterable[PvSpec]) -> dict[str, str]:
    """PVs that name a record field, and the name the IOC serves instead.

    A dot in a PV name means "field of this record", and a record name cannot
    contain one — so any such PV is unreachable on a base-only IOC. The stand-in
    replaces the last dot with a colon, which is a normal PV name.
    """
    rewrite: dict[str, str] = {}
    for spec in specs:
        for name in (spec.name, *(target for target, _ in spec.effects)):
            if isinstance(name, str) and "." in name:
                head, _, tail = name.rpartition(".")
                rewrite[name] = f"{head}:{tail}"
    return rewrite


def rewrite_zone(source: Path, destination: Path, rewrite: dict[str, str], zone_code: str) -> None:
    """Copy a zone's folder, swapping the field PVs for their stand-ins.

    A textual swap on the YAML rather than a re-serialisation: the comments in a
    zone's files are half their value, and a generated copy that lost them would
    be useless to read beside the original.
    """
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    header = (
        f"# GENERATED by ioc/generate.py --zone {zone_code} — DO NOT EDIT.\n"
        f"#\n"
        f"# The `{zone_code}` zone with every PV that names a record *field*\n"
        f"# pointed at the base record the local IOC serves instead. A record\n"
        f"# name cannot contain a dot, so this is the only way to run this screen\n"
        f"# against a base-only IOC.\n"
        f"#\n"
    )
    if rewrite:
        header += "".join(
            f"#   {original}  ->  {served}\n" for original, served in sorted(rewrite.items())
        )
    else:
        header += "# (nothing needed rewriting for this zone.)\n"
    header += "#\n# Everything else is identical, so what the panel renders here is what it\n"
    header += f"# renders against `{zone_code}` in the hall.\n#\n"

    for path in sorted(source.rglob("*.yaml")):
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        text = path.read_text(encoding="utf-8")
        for original, served in rewrite.items():
            text = text.replace(original, served)
        if path.name == "zone.yaml":
            # The generated zone must not answer to the real zone's hostnames.
            data = yaml.safe_load(text) or {}
            data["hostnames"] = []
            data["title"] = f"{data.get('title', zone_code)} (local IOC)"
            text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
        target.write_text(header + text, encoding="utf-8")


# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--zone", default="TESTZ", help="source zone (default: TESTZ)")
    parser.add_argument(
        "--screens",
        nargs="*",
        help="only these screens (default: every screen in the zone)",
    )
    parser.add_argument("--db", type=Path, default=None, help="output database path")
    args = parser.parse_args()

    try:
        zone = load_zone(args.zone)
    except ZoneError as exc:
        parser.error(str(exc))

    guis = [gui for gui in zone.guis if not args.screens or gui.slug in args.screens]
    if not guis:
        parser.error(f"zone {args.zone} has no screen called {', '.join(args.screens or [])}")

    specs = [spec for gui in guis for spec in gui.all_pv_specs()]
    rewrite = field_pv_rewrite(specs)

    db = Db()
    db.comment(f"EPICS database for zone {zone.code} — GENERATED, DO NOT EDIT.")
    db.comment()
    db.comment(f"    python ioc/generate.py --zone {args.zone}")
    db.comment()
    db.comment("Built from what each component declares about its PVs")
    db.comment("(`Component.pv_specs()`), so a screen written in YAML gets a")
    db.comment("working IOC with no extra work.")
    db.comment()
    db.comment(f"Zone:    {zone.code} — {zone.title}")
    db.comment(f"Screens: {', '.join(gui.slug for gui in guis)}")
    db.comment()
    db.comment(f"Analogue records scan at {SCAN} and random-walk inside their band;")
    db.comment("their alarm limits are real, so the panel's MINOR and MAJOR arrive")
    db.comment("through the same path as an alarm from the hall.")

    for gui in guis:
        db.section(f"{gui.slug} — {gui.title}")
        for spec in gui.all_pv_specs():
            emit(db, apply_rewrite(spec, rewrite))

    db_path = args.db or (DB_DIR / f"{zone.code.lower()}.db")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.write_text(db.render(), encoding="utf-8")

    ioc_zone = f"{zone.code}{IOC_SUFFIX}"
    rewrite_zone(zone.path, zones_root() / ioc_zone, rewrite, zone.code)

    print(f"{_short(db_path)}: {len(db.names)} records")
    if db.shared:
        print(f"  {len(db.shared)} PV(s) read by more than one component, emitted once")
    print(f"zones/{ioc_zone}/: run the HMI with ZONE_CODE={ioc_zone}")
    for original, served in sorted(rewrite.items()):
        print(f"  renamed {original} -> {served}")
    for name, why in sorted(db.skipped.items()):
        print(f"  skipped {name}: {why}")
    for name in sorted(db.disagreed):
        print(
            f"  note: {name} is described differently by two components; "
            f"the first description is the one in the database"
        )
    return 0


def _int_or_none(value: float | None) -> int | None:
    """0 is a meaningful limit; `None` means "no limit"."""
    return None if value is None else int(value)


def _chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _value_tag(value: Any) -> str:
    """A suffix that keeps two fan-outs of the same command apart by value."""
    text = str(value).replace("-", "m").replace(".", "p")
    return f"_{text}" if text else ""


def _short(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    raise SystemExit(main())
