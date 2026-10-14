"""Lasers that are not NL2.

NL2 was the reference while the panel was built, and the screen quietly
assumed every laser looks like it: a Modbox, two photodiodes, and NL2's own
device ids printed in the row labels. A hall does not work that way — one
laser has no Modbox at all, another has a different set of modules — so what
a laser *has* and what its rows are *called* both come from its config.

These render a real zone through the real server, because the thing under test
is what an operator sees, not what a component declares.
"""

from __future__ import annotations

import os
import re
import socket
import threading
from pathlib import Path

import httpx
import pytest
import yaml

from pydantic import ValidationError

from components.laser_panel.config import Config as LaserPanelConfig
from core.server import create_app, serve_config
from core.settings import Settings

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "zones" / "TESTZ"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def accepting(port: int, timeout: float = 15.0) -> bool:
    deadline = threading.Event()
    for _ in range(int(timeout * 20)):
        with socket.socket() as probe:
            probe.settimeout(0.2)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                return True
        deadline.wait(0.05)
    return False


def write_zone(root: Path, **changes) -> None:
    """The TESTZ laser-panel screen with a few things changed or removed."""
    (root / "VAR").mkdir(parents=True)
    (root / "VAR" / "zone.yaml").write_text(
        yaml.safe_dump({"title": "Variant", "hostnames": ["variant*"]}),
        encoding="utf-8",
    )
    gui = yaml.safe_load((REFERENCE / "l4-opcpa" / "gui.yaml").read_text(encoding="utf-8"))
    # One laser, so an assertion about what the screen does not show cannot be
    # answered by the laser next to it.
    gui["components"] = gui["components"][:1]
    laser = gui["components"][0]
    for name in changes.pop("pvs_drop", ()):
        laser["pvs"].pop(name, None)
    # Everything about one signal sits in that signal's own entry, so a test
    # that changes how a row reads writes it where the PV already is.
    for role, extra in changes.pop("signals", {}).items():
        laser["pvs"][role] = {"pv": laser["pvs"][role], **extra}
    for key, value in changes.items():
        laser[key] = value
    screen = root / "VAR" / "l4-opcpa"
    screen.mkdir()
    (screen / "gui.yaml").write_text(yaml.safe_dump(gui), encoding="utf-8")


@pytest.fixture
def page(tmp_path):
    """Serves one variant zone and returns its rendered screen."""

    def serve(**changes) -> str:
        write_zone(tmp_path, **changes)
        os.environ["ZONES_ROOT"] = str(tmp_path)
        settings = Settings(
            host="127.0.0.1",
            port=free_port(),
            zone_code="VAR",
            epics_backend="sim",
            log_level="WARNING",
            dev=True,
            session_secret="a-test-secret-long-enough-for-the-codec",
            prewarm=False,
        )
        app = create_app(settings)
        stop = threading.Event()

        def run() -> None:
            import asyncio

            from hypercorn.asyncio import serve as hypercorn

            async def shutdown() -> None:
                await asyncio.get_running_loop().run_in_executor(None, stop.wait)

            asyncio.run(hypercorn(app, serve_config(settings), shutdown_trigger=shutdown))

        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        assert accepting(settings.port), "variant zone server did not start"
        base = f"http://127.0.0.1:{settings.port}"
        try:
            with httpx.Client(base_url=base, follow_redirects=True) as client:
                client.post("/login", data={"username": "test", "password": "test"})
                return client.get("/l4-opcpa").text
        finally:
            stop.set()
            thread.join(timeout=10)
            os.environ.pop("ZONES_ROOT", None)

    return serve


class TestALaserWithoutAModbox:
    def test_the_section_is_not_there(self, page):
        html = page(modbox=[], pvs_drop=["loadedWaveform", "latestWaveform"])
        assert "Modbox State" not in html
        assert "Waveform Preset" not in html

    def test_the_rest_of_the_screen_still_renders(self, page):
        html = page(modbox=[], pvs_drop=["loadedWaveform", "latestWaveform"])
        assert "Overview" in html and "Chiller" in html


    def test_a_half_configured_modbox_is_refused(self):
        # All of it or none of it: a `modbox:` list whose waveform record
        # nobody named would render a row reading `<>` forever.
        gui = yaml.safe_load(
            (REFERENCE / "l4-opcpa" / "gui.yaml").read_text(encoding="utf-8")
        )
        laser = gui["components"][0]
        laser["pvs"].pop("loadedWaveform")
        with pytest.raises(ValidationError, match="loadedWaveform"):
            LaserPanelConfig.model_validate(laser)


class TestALaserWithoutASecondPhotodiode:
    def test_the_row_is_not_there(self, page):
        html = page(pvs_drop=["phd2Mean"])
        assert "PHD1K000:48/Mean" not in html
        assert "PHD1K000:49/Mean" in html, "the first photodiode went with it"


class TestTheSequencer:
    """Which sequences a laser has is the laser's business: the set was a
    constant in the component, copied from the reference laser."""

    def test_a_laser_lists_the_sequences_it_has(self, page):
        html = page(
            sequences=[
                {"label": "Start Laser", "pv": "L4-OPCPA-NL2:StartLaser:Busy"},
                {"label": "Warm Up", "pv": "L4-OPCPA-NL2:WarmUp:Busy"},
            ]
        )
        # Scoped to the list itself: several sequence names are also the names
        # of the buttons that start them, elsewhere on the panel.
        listed = re.search(r'<ul[^>]*class="sequence-list".*?</ul>', html, re.S)
        assert listed, "no sequence list"
        assert listed.group(0).count("sequence-item") == 2
        assert "Warm Up" in listed.group(0)
        assert "Set to Alignment Mode" not in listed.group(0), "the old built-in set"

    def test_a_laser_without_sequences_has_no_section(self, page):
        html = page(sequences=[])
        assert "Sequencer" not in html


class TestUnits:
    """What a reading is measured in follows from the reading, not from where
    it is deployed: every zone's file used to carry the same five lines."""

    def test_the_component_knows_without_being_told(self, page):
        # The chiller headers are the units a first paint can show: a value's
        # own unit waits for the value (see `test_laser_panel.py`).
        html = page()
        assert "(l/min)" in html, "chiller flow column header"
        assert "(°C)" in html, "chiller temperature column header"
        assert "(%)" in html, "chiller level column header"


class TestLabels:
    def test_a_laser_names_its_own_devices(self, page):
        html = page(
            signals={
                "phdMean": {"label": "PHD1K000:12/Mean"},
                "regenState": {"label": "Regen SY9PL20M:07"},
                "attenuator": {"label": "Atten. SM1:ATT3:22"},
            }
        )
        assert "PHD1K000:12/Mean" in html
        assert "Regen SY9PL20M:07" in html
        assert "Atten. SM1:ATT3:22" in html
        # Only the row label. The module-error list prints device ids too, but
        # those are its own `moduleErrors:` entries and are already per-laser.
        assert "Regen SY3PL50M:32" not in html, "NL2's device id is still printed"

    def test_unnamed_rows_keep_the_default(self, page):
        html = page(signals={"phdMean": {"label": "PHD1K000:12/Mean"}})
        assert "Regen Temp TK6:44" in html
