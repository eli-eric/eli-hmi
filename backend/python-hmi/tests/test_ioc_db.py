"""The generated EPICS database against the config it came from.

These are the checks that catch the failure the old hand-written
`backend/epics/laser-mockup-ioc/laser.db` actually suffered: the config moved on
and the database did not, so the IOC served names the panel no longer asked for
and the page filled with `<>`.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

from app.modules.l4_opcpa.config import load_laser_specs
from app.modules.l4_opcpa.widgets import build_panel

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "ioc" / "db" / "l4-opcpa.db"
ZONE = ROOT / "config" / "zones" / "ioc.yaml"


@pytest.fixture(scope="module")
def db_text() -> str:
    if not DB.is_file():  # pragma: no cover - the file is committed
        pytest.skip(f"{DB} not generated")
    return DB.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def records(db_text: str) -> dict[str, str]:
    """Record name -> record type."""
    return {
        name: rtype
        for rtype, name in re.findall(r'^record\((\w+),\s*"([^"]+)"\)', db_text, re.M)
    }


@pytest.fixture(scope="module")
def ioc_pvs() -> set[str]:
    specs = load_laser_specs("ioc", cache=False)
    return {pv.name for spec in specs for pv in build_panel(spec).all_pvs}


def test_every_pv_the_panel_reads_has_a_record(records, ioc_pvs):
    missing = sorted(ioc_pvs - set(records))
    assert not missing, f"the IOC would serve nothing for: {missing}"


def test_every_command_the_panel_writes_has_a_record(records):
    specs = load_laser_specs("ioc", cache=False)
    missing = []
    for spec in specs:
        for command in spec.commands:
            target = spec.resolve_command(command).pv_name
            if target not in records:
                missing.append(f"{command} -> {target}")
    assert not missing, f"pressing these buttons would write nowhere: {missing}"


def test_the_committed_database_matches_a_fresh_generation():
    """Regenerating must be a no-op, or the committed db is stale — which is the
    whole failure mode this generator exists to prevent."""
    before = DB.read_text(encoding="utf-8")
    zone_before = ZONE.read_text(encoding="utf-8")
    subprocess.run(
        [sys.executable, "ioc/generate.py", "--zone", "test"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    assert DB.read_text(encoding="utf-8") == before, "ioc/db is stale; rerun ioc/generate.py"
    assert ZONE.read_text(encoding="utf-8") == zone_before, "config/zones/ioc.yaml is stale"


class TestSimulation:
    def test_analogue_readouts_walk_and_carry_units(self, db_text):
        assert "MIN(D,MAX(C,A+(RNDM-0.5)*B))" in db_text
        assert 'field(EGU, "degC")' in db_text
        assert 'field(EGU, "l/min")' in db_text

    def test_real_alarm_limits_so_severities_come_from_the_control_system(self, db_text):
        assert 'field(HHSV, "MAJOR")' in db_text
        assert 'field(HSV, "MINOR")' in db_text

    def test_one_record_is_left_unprocessed_to_exercise_invalid(self, db_text):
        assert "reads INVALID/UDF" in db_text

    def test_a_command_fires_a_sequence_with_a_delayed_release(self, db_text, records):
        sequences = [name for name, rtype in records.items() if rtype == "seq"]
        assert sequences, "no seq records — a command would write nothing"
        # The delayed step is what makes the Sequencer row readable: without it
        # RUNNING and IDLE happen in the same millisecond.
        assert re.search(r'field\(DLY[0-9A-F], "3"\)', db_text)

    def test_one_write_reaches_every_flashlamp_channel(self, records):
        specs = load_laser_specs("ioc", cache=False)
        fans = [name for name, rtype in records.items() if rtype == "dfanout"]
        assert any("flashlampsAll" in name for name in fans)
        # SET_DELAY is the other one-to-many: both channels must stay equal.
        assert specs[0].resolve_command("SET_DELAY").pv_name in records

    def test_command_records_do_not_self_trigger_at_startup(self, db_text, records):
        """A PINI on a command record fires its whole chain at IOC start, which
        booted the first version of this database with the shutter open."""
        blocks = re.findall(r'record\(\w+, "([^"]+)"\) \{(.*?)\n\}', db_text, re.S)
        for name, body in blocks:
            if name.startswith("CMD_") or "FLNK" in body and name.startswith("CMD_"):
                assert "PINI" not in body, f"{name} would run its chain at startup"

    def test_the_waveform_swap_is_done_with_records(self, records):
        assert any(rtype == "fanout" for rtype in records.values())
        stringouts = [name for name, rtype in records.items() if rtype == "stringout"]
        assert any("wfSaveOld" in name for name in stringouts)


class TestIocZone:
    def test_only_the_field_pvs_differ_from_the_source_zone(self):
        source = load_laser_specs("test", cache=False)[0]
        served = load_laser_specs("ioc", cache=False)[0]
        assert source.laser == served.laser
        # A PV naming a record field cannot exist on a base-only IOC, so those
        # and only those are rewritten.
        source_names = set(source.pvs.all_names())
        served_names = set(served.pvs.all_names())
        changed = source_names ^ served_names
        assert all("." in name or ":" in name for name in changed)
        assert {name for name in source_names - served_names} == {
            name for name in source_names if "." in name
        }

    def test_the_rewritten_names_are_valid_pv_names(self):
        served = load_laser_specs("ioc", cache=False)[0]
        assert all("." not in name for name in served.pvs.all_names())

    def test_the_zone_file_says_it_is_generated(self):
        assert ZONE.read_text(encoding="utf-8").startswith("# GENERATED")


class TestSharedPvs:
    def test_a_site_wide_pv_read_by_several_lasers_is_one_record(self, tmp_path):
        """The `demo` zone's three lasers all watch the same MSS interlocks,
        because a site-wide permission is one signal however many lasers care
        about it. Emitting it once is correct; emitting it twice would let
        `dbLoadRecords` silently keep whichever came last."""
        db = tmp_path / "demo.db"
        result = subprocess.run(
            [sys.executable, "ioc/generate.py", "--zone", "demo", "--db", str(db)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        assert "shared between lasers" in result.stdout
        names = re.findall(r'^record\(\w+,\s*"([^"]+)"\)', db.read_text(encoding="utf-8"), re.M)
        assert len(names) == len(set(names)), "the database defines a record twice"
        assert "L4-PSS:NP2_PERMISSION_TO_OPERATE_CH1" in names
        # Regenerating for `demo` rewrites the shared `ioc` zone, so put the
        # committed pair back.
        subprocess.run(
            [sys.executable, "ioc/generate.py", "--zone", "test"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )

    def test_the_same_name_with_a_different_definition_is_refused(self):
        """A generator that quietly accepted that would be the drift this whole
        approach is meant to remove."""
        sys.path.insert(0, str(ROOT / "ioc"))
        import importlib

        generate = importlib.import_module("generate")
        db = generate.Db()
        db.record("bi", "X:Y", [("VAL", 1)])
        db.record("bi", "X:Y", [("VAL", 1)])  # identical: shared, fine
        assert db.shared == {"X:Y"}
        with pytest.raises(SystemExit, match="different definitions"):
            db.record("bi", "X:Y", [("VAL", 0)])
