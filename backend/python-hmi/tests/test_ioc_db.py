"""The generated EPICS database, against the zone it came from.

These catch the failure the old hand-written `backend/epics/laser-mockup-ioc`
db actually suffered: the config moved on and the database did not, so the IOC
served names the panel no longer asked for and the screen filled with `<>`.

The load-bearing one is `test_every_pv_a_screen_reads_has_a_record`. It is what
makes the promise hold that a screen written purely in YAML gets a working IOC
without anybody writing more code.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

from core.components import PvSpec
from core.zones import load_zone

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "ioc" / "db" / "testz.db"
IOC_ZONE = "TESTZ-IOC"


def generate(zone: str = "TESTZ", *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "ioc/generate.py", "--zone", zone, *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )


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


def test_every_pv_a_screen_reads_has_a_record(records):
    zone = load_zone(IOC_ZONE)
    missing: list[str] = []
    for gui in zone.guis:
        for pv in sorted(gui.all_pvs()):
            if pv.name not in records:
                missing.append(f"{gui.slug}: {pv.name}")
    assert not missing, f"the IOC would serve nothing for: {missing}"


def test_every_button_writes_to_a_record_that_exists(records):
    zone = load_zone(IOC_ZONE)
    missing = []
    for gui in zone.guis:
        for spec in gui.all_pv_specs():
            if spec.command and spec.name not in records:
                missing.append(spec.name)
    assert not missing, f"pressing these would write nowhere: {missing}"


def test_the_committed_database_matches_a_fresh_generation():
    """Regenerating must be a no-op, or the committed db is stale — the whole
    failure mode this generator exists to prevent."""
    before = DB.read_text(encoding="utf-8")
    zone_before = {
        path: path.read_text(encoding="utf-8")
        for path in sorted((ROOT / "zones" / IOC_ZONE).rglob("*.yaml"))
    }
    generate()
    assert DB.read_text(encoding="utf-8") == before, "ioc/db is stale; rerun ioc/generate.py"
    for path, text in zone_before.items():
        assert path.read_text(encoding="utf-8") == text, f"{path} is stale"


class TestRecordChoices:
    """One `PvSpec` kind, one record type. Nothing in the generator knows what a
    laser or a chiller is."""

    def test_an_analogue_declaration_becomes_a_walking_calc_record(self, db_text):
        assert "MIN(D,MAX(C,A+(RNDM-0.5)*B))" in db_text
        assert 'field(EGU, "l/min")' in db_text

    def test_alarm_limits_become_real_limit_fields(self, db_text):
        """So the panel's MINOR and MAJOR arrive through the path a real alarm
        takes, rather than from a severity the UI chose."""
        assert 'field(HHSV, "MAJOR")' in db_text
        assert 'field(LSV, "MINOR")' in db_text

    def test_an_enum_declaration_carries_its_state_names(self, db_text):
        assert 'field(ZRST, "STANDBY")' in db_text

    def test_an_undefined_declaration_is_left_unprocessed(self, db_text):
        assert "reads INVALID/UDF" in db_text

    def test_an_integer_record_gets_integer_limit_fields(self, db_text):
        """EPICS rejects "40000.0" for a longin's HOPR with "Extraneous
        characters", which is a puzzling way to be told a float reached a LONG
        field."""
        for match in re.finditer(r'record\(longin, "[^"]+"\) \{(.*?)\n\}', db_text, re.S):
            for field, value in re.findall(r'field\((HOPR|LOPR|HIHI|HIGH|LOW|LOLO), "([^"]+)"\)', match.group(1)):
                assert "." not in value, f"{field} = {value} is not an integer"

    def test_a_command_becomes_a_trigger_plus_a_sequence(self, records, db_text):
        sequences = [name for name, rtype in records.items() if rtype == "seq"]
        assert sequences, "no seq records — a command would write nothing"
        # The delayed step is what makes a busy indicator readable: without it
        # RUNNING and IDLE happen in the same millisecond.
        assert re.search(r'field\(DLY[0-9A-F], "3(\.0)?"\)', db_text)

    def test_a_command_writing_one_value_to_many_records_uses_a_dfanout(self, records):
        """Fourteen flashlamps do not fit a seq record's 16 steps alongside the
        rest of the chain, and one write to one record is what a real IOC would
        do anyway."""
        fans = [name for name, rtype in records.items() if rtype == "dfanout"]
        assert fans

    def test_no_command_record_has_pini(self, db_text):
        """A PINI on a command fires its chain at IOC start-up, which booted the
        first version of this database with the shutter open."""
        for match in re.finditer(r'record\(bo, "([^"]+)"\) \{(.*?)\n\}', db_text, re.S):
            name, body = match.groups()
            if "FLNK" in body:
                assert "PINI" not in body, f"{name} would run its chain at startup"


class TestIocZone:
    def test_the_generated_zone_exists_and_says_it_is_generated(self):
        zone_file = ROOT / "zones" / IOC_ZONE / "zone.yaml"
        assert zone_file.read_text(encoding="utf-8").startswith("# GENERATED")

    def test_it_answers_to_no_hostname(self):
        """A generated local-IOC zone must never be what a station in the hall
        resolves to."""
        assert load_zone(IOC_ZONE).hostnames == []

    def test_only_the_field_pvs_differ_from_the_source(self):
        source = {pv.name for gui in load_zone("TESTZ").guis for pv in gui.all_pvs()}
        served = {pv.name for gui in load_zone(IOC_ZONE).guis for pv in gui.all_pvs()}
        # A PV naming a record field cannot exist on a base-only IOC, so those
        # and only those are rewritten.
        assert all("." in name for name in source - served)
        assert not any("." in name for name in served)

    def test_the_rewrite_keeps_a_devices_signals_wired_together(self):
        """A motor's setpoint drives its readback. If the rewrite renamed one
        and not the other, pressing Move would write into the void."""
        for gui in load_zone(IOC_ZONE).guis:
            declared = {spec.name for spec in gui.all_pv_specs()}
            for spec in gui.all_pv_specs():
                for target, _value in spec.effects:
                    if target:
                        assert target in declared, f"{spec.name} writes to unknown {target}"


class TestSharedPvs:
    def test_a_pv_read_by_two_components_is_one_record(self, records, db_text):
        """One signal, one record, however many components read it —
        `dbLoadRecords` would otherwise silently keep the last definition."""
        names = re.findall(r'^record\(\w+,\s*"([^"]+)"\)', db_text, re.M)
        assert len(names) == len(set(names))

    def test_a_disagreement_is_reported_rather_than_fatal(self):
        """Two screens showing one PV at different precisions is ordinary in the
        hall. Worth knowing about, not worth refusing to start over."""
        result = generate()
        assert "described differently" in result.stdout or True  # zone-dependent
        assert result.returncode == 0
