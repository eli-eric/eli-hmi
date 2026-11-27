"""Zones: the folder layout, how a station knows which one it is, and the menu.

The hostname tests are the ones that matter most. Each zone is a separate
network and this app runs once per zone, so a station that resolves to the wrong
zone shows an operator another hall's PVs — and every value on that screen looks
plausible. Ambiguity therefore has to fail, not guess.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from core.zones import ZoneError, load_gui, load_zone, resolve_zone_code, zone_codes, zones_root


@pytest.fixture
def zones(tmp_path: Path, monkeypatch) -> Path:
    """A throwaway zones directory, so a test cannot depend on the real ones."""
    monkeypatch.setenv("ZONES_ROOT", str(tmp_path))
    monkeypatch.delenv("ZONE_CODE", raising=False)
    return tmp_path


def make_zone(root: Path, code: str, *, hostnames: list[str] | None = None, **extra) -> Path:
    folder = root / code
    folder.mkdir(parents=True, exist_ok=True)
    lines = [f"title: Zone {code}"]
    if hostnames is not None:
        lines.append("hostnames:")
        lines += [f'  - "{pattern}"' for pattern in hostnames]
    for key, value in extra.items():
        lines.append(f"{key}: {value}")
    (folder / "zone.yaml").write_text("\n".join(lines) + "\n")
    return folder


def make_gui(zone: Path, slug: str, body: str = "", *, title: str | None = None, order: int = 100) -> Path:
    folder = zone / slug
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "gui.yaml").write_text(
        textwrap.dedent(
            f"""
            title: {title or slug.title()}
            order: {order}
            components:
              - component: value
                label: A reading
                pv: X:{slug.upper()}
            """
        )
        + body
    )
    return folder


class TestDiscovery:
    def test_a_folder_is_a_zone(self, zones):
        make_zone(zones, "01")
        make_zone(zones, "TESTZ")
        assert zone_codes() == ["01", "TESTZ"]

    def test_a_folder_with_a_gui_yaml_is_a_screen(self, zones):
        zone = make_zone(zones, "01")
        make_gui(zone, "vacuum")
        make_gui(zone, "motors")
        loaded = load_zone("01")
        assert {gui.slug for gui in loaded.guis} == {"vacuum", "motors"}

    def test_a_folder_without_a_gui_yaml_is_not_a_screen(self, zones, caplog):
        """Almost always a misnamed gui.yaml, and the symptom — a missing menu
        entry — gives no hint on its own, so it is logged."""
        zone = make_zone(zones, "01")
        make_gui(zone, "vacuum")
        (zone / "notes").mkdir()
        loaded = load_zone("01")
        assert [gui.slug for gui in loaded.guis] == ["vacuum"]
        assert "notes" in caplog.text

    def test_the_menu_is_the_folder_listing(self, zones):
        zone = make_zone(zones, "01")
        make_gui(zone, "b", title="Bravo", order=20)
        make_gui(zone, "a", title="Alpha", order=10)
        assert [item["label"] for item in load_zone("01").menu()] == ["Alpha", "Bravo"]

    def test_an_explicit_menu_order_wins(self, zones):
        zone = make_zone(zones, "01", menu="[b, a]")
        make_gui(zone, "a", title="Alpha", order=10)
        make_gui(zone, "b", title="Bravo", order=20)
        assert [item["label"] for item in load_zone("01").menu()] == ["Bravo", "Alpha"]

    def test_extra_yaml_files_add_components(self, zones):
        """One file per device keeps a twenty-motor screen reviewable, and adding
        a device is adding a file."""
        zone = make_zone(zones, "01")
        folder = make_gui(zone, "motors")
        (folder / "extra.yaml").write_text(
            textwrap.dedent(
                """
                components:
                  - component: value
                    label: Another
                    pv: X:ANOTHER
                """
            )
        )
        gui = load_gui(folder)
        assert len(gui.components) == 2

    def test_an_extra_file_may_not_carry_screen_settings(self, zones):
        zone = make_zone(zones, "01")
        folder = make_gui(zone, "motors")
        (folder / "extra.yaml").write_text("title: Sneaky\ncomponents: []\n")
        with pytest.raises(ZoneError, match="only `components:` and `anchors:` belong"):
            load_gui(folder)


class TestHostnameResolution:
    def test_the_environment_wins(self, zones, monkeypatch):
        make_zone(zones, "01", hostnames=["*"])
        make_zone(zones, "TESTZ")
        monkeypatch.setenv("ZONE_CODE", "TESTZ")
        assert resolve_zone_code("anything") == ("TESTZ", "ZONE_CODE")

    def test_an_unknown_zone_code_names_the_ones_that_exist(self, zones, monkeypatch):
        make_zone(zones, "01")
        monkeypatch.setenv("ZONE_CODE", "99")
        with pytest.raises(ZoneError, match="Zones here: 01"):
            resolve_zone_code()

    def test_a_matching_hostname_selects_the_zone(self, zones):
        make_zone(zones, "01", hostnames=["eli-hmi-z01*"])
        make_zone(zones, "02", hostnames=["eli-hmi-z02*"])
        code, how = resolve_zone_code("eli-hmi-z02-ws3")
        assert code == "02"
        assert "eli-hmi-z02-ws3" in how

    def test_a_fully_qualified_hostname_still_matches(self, zones):
        """Otherwise every pattern would need a trailing `*` — the kind of
        detail that gets forgotten once and then costs an afternoon."""
        make_zone(zones, "01", hostnames=["hmi01"])
        assert resolve_zone_code("hmi01.eli-beams.eu")[0] == "01"

    def test_matching_is_case_insensitive(self, zones):
        make_zone(zones, "01", hostnames=["ELI-HMI-Z01*"])
        assert resolve_zone_code("eli-hmi-z01-a")[0] == "01"

    def test_matching_nothing_is_a_failure_not_a_default(self, zones):
        make_zone(zones, "01", hostnames=["eli-hmi-z01*"])
        make_zone(zones, "02", hostnames=["eli-hmi-z02*"])
        with pytest.raises(ZoneError, match="matches no zone"):
            resolve_zone_code("someone-laptop")

    def test_matching_several_is_a_failure_too(self, zones):
        """A screen quietly showing another zone's PVs is worse than one that
        did not start."""
        make_zone(zones, "01", hostnames=["*hmi*"])
        make_zone(zones, "02", hostnames=["*z02*"])
        with pytest.raises(ZoneError, match="matches several zones"):
            resolve_zone_code("hmi-z02")

    def test_the_error_says_what_to_do(self, zones):
        make_zone(zones, "01", hostnames=["eli*"])
        with pytest.raises(ZoneError) as caught:
            resolve_zone_code("laptop")
        assert "set ZONE_CODE" in str(caught.value)


class TestErrors:
    def test_a_zone_folder_needs_a_zone_yaml(self, zones):
        (zones / "03").mkdir()
        with pytest.raises(ZoneError, match="zone.yaml"):
            load_zone("03")

    @pytest.mark.parametrize("slug", ["monitor", "api", "login", "stats"])
    def test_a_screen_may_not_take_a_path_the_app_already_serves(self, zones, slug):
        """A folder is a route. One named like a fixed route would be shadowed
        by it — a screen that is in the menu and can never be opened."""
        zone = make_zone(zones, "01")
        make_gui(zone, "vacuum")
        make_gui(zone, slug)
        with pytest.raises(ZoneError, match=f"'{slug}'.*reserved"):
            load_zone("01")

    def test_a_component_typo_names_the_keys_that_would_have_worked(self, zones):
        zone = make_zone(zones, "01")
        folder = zone / "screen"
        folder.mkdir()
        (folder / "gui.yaml").write_text(
            "title: Screen\ncomponents:\n  - component: value\n    labl: Flow\n    pv: X:Y\n"
        )
        with pytest.raises(ZoneError) as caught:
            load_zone("01")
        message = str(caught.value)
        assert "labl" in message
        assert "keys 'value' accepts" in message

    def test_an_unknown_component_lists_the_ones_that_exist(self, zones):
        zone = make_zone(zones, "01")
        folder = zone / "screen"
        folder.mkdir()
        (folder / "gui.yaml").write_text("title: S\ncomponents:\n  - component: telepathy\n")
        with pytest.raises(ZoneError, match="no component called 'telepathy'"):
            load_zone("01")

    def test_a_block_with_no_component_key_says_so(self, zones):
        zone = make_zone(zones, "01")
        folder = zone / "screen"
        folder.mkdir()
        (folder / "gui.yaml").write_text("title: S\ncomponents:\n  - label: Orphan\n")
        with pytest.raises(ZoneError, match="missing `component:`"):
            load_zone("01")

    def test_nesting_under_a_component_that_takes_no_children_is_refused(self, zones):
        zone = make_zone(zones, "01")
        folder = zone / "screen"
        folder.mkdir()
        (folder / "gui.yaml").write_text(
            "title: S\ncomponents:\n  - component: value\n    label: L\n    pv: X:Y\n"
            "    components: [{component: value, label: N, pv: X:Z}]\n"
        )
        with pytest.raises(ZoneError, match="takes no nested"):
            load_zone("01")


class TestAnchors:
    """A screen's shared blocks under one key of their own, ahead of the
    components that use them.

    An anchor cannot live in a document of its own — YAML scopes anchors to
    one document — and defining it at its first use ties every later laser to
    the first one: delete NL1 and NL2..NL5 stop loading.
    """

    def test_a_screen_keeps_its_anchors_apart(self, zones):
        zone = make_zone(zones, "01")
        folder = zone / "screen"
        folder.mkdir()
        (folder / "gui.yaml").write_text(
            textwrap.dedent(
                """\
                title: S
                anchors:
                  gauge: &gauge
                    component: value
                    units: mbar
                components:
                  - <<: *gauge
                    label: Gauge 1
                    pv: X:G1
                  - <<: *gauge
                    label: Gauge 2
                    pv: X:G2
                """
            )
        )
        gui = load_zone("01").guis[0]
        assert [c.config.label for c in gui.components] == ["Gauge 1", "Gauge 2"]
        assert {c.config.units for c in gui.components} == {"mbar"}

    def test_an_extra_file_keeps_its_own(self, zones):
        """Anchors do not cross files either, so a file of its own has its
        own."""
        zone = make_zone(zones, "01")
        folder = make_gui(zone, "screen")
        (folder / "more.yaml").write_text(
            textwrap.dedent(
                """\
                anchors:
                  gauge: &gauge {component: value, units: mbar}
                components:
                  - {<<: *gauge, label: Gauge 3, pv: X:G3}
                """
            )
        )
        gui = load_zone("01").guis[0]
        assert "Gauge 3" in [c.config.label for c in gui.components]


class TestMacros:
    """`$(NAME)` in a component's YAML, from that component's own `macros:`.

    A device's PVs share a start — every PV of a laser but its MSS begins
    `L4-OPCPA-NL2:` — and writing it out on every line is how one line comes to
    name the wrong laser. A name without a macro is a full name, so a PV that
    lives elsewhere needs no setting to say so.
    """

    def screen(self, zones: Path, body: str) -> str:
        zone = make_zone(zones, "01")
        folder = zone / "screen"
        folder.mkdir()
        (folder / "gui.yaml").write_text("title: S\ncomponents:\n" + textwrap.dedent(body))
        return "01"

    @staticmethod
    def pvs(code: str) -> set[str]:
        return {pv.name for pv in load_zone(code).guis[0].all_pvs()}

    def test_a_name_is_expanded_from_its_components_macros(self, zones):
        code = self.screen(
            zones,
            """\
            - component: value
              label: Pressure
              macros: {P: L4-VAC-01}
              pv: $(P):Pressure
            """,
        )
        assert self.pvs(code) == {"L4-VAC-01:Pressure"}

    def test_every_string_is_expanded_however_deep(self, zones):
        """Labels too, and a button's PV inside a list of mappings: no
        component has to say which of its fields are names."""
        code = self.screen(
            zones,
            """\
            - component: value
              label: $(P) gauge
              macros: {P: L4-VAC-01}
              pv: $(P):Pressure
              actions:
                - {label: Vent, pv: $(P):Vent, value: 1}
            """,
        )
        config = load_zone(code).guis[0].components[0].config
        assert config.label == "L4-VAC-01 gauge"
        assert config.actions[0].pv == "L4-VAC-01:Vent"
        assert config.actions[0].value == 1, "a number is not a string to expand"

    def test_a_nested_component_does_not_inherit_them(self, zones):
        """Each component says its own: a reader of one block never has to
        look up the screen for what a name means."""
        code = self.screen(
            zones,
            """\
            - component: panel
              title: Vacuum
              macros: {P: L4-VAC-01}
              components:
                - component: value
                  label: Pressure
                  pv: $(P):Pressure
            """,
        )
        with pytest.raises(ZoneError, match=r"\$\(P\)"):
            load_zone(code)

    def test_an_undefined_macro_names_where_and_what(self, zones):
        code = self.screen(
            zones,
            """\
            - component: value
              label: Pressure
              macros: {P: L4-VAC-01}
              pv: $(Q):Pressure
            """,
        )
        with pytest.raises(ZoneError) as caught:
            load_zone(code)
        message = str(caught.value)
        assert "gui.yaml#0" in message, "which block"
        assert "'value'" in message, "which component"
        assert "$(Q)" in message and "not defined" in message
        assert "P" in message.split("not defined", 1)[1], "what is defined"

    @pytest.mark.parametrize("name", ["$(P:Pressure", "$(1P):Pressure", "$():Pressure"])
    def test_a_broken_reference_is_refused(self, zones, name):
        """Left alone it would be a PV called `$(P:Pressure`, which no IOC
        serves: the row would sit disconnected with nothing saying why."""
        code = self.screen(
            zones,
            f"""\
            - component: value
              label: Pressure
              macros: {{P: L4-VAC-01}}
              pv: "{name}"
            """,
        )
        with pytest.raises(ZoneError, match=r"\$\("):
            load_zone(code)

    def test_a_macro_is_text(self, zones):
        """YAML reads `22` as a number and `1:30` as ninety. A macro that is
        part of a PV name has to be exactly what was typed, so it is quoted."""
        code = self.screen(
            zones,
            """\
            - component: value
              label: Pressure
              macros: {P: L4-VAC-01, N: 1:30}
              pv: $(P):$(N)
            """,
        )
        with pytest.raises(ZoneError, match="quote"):
            load_zone(code)

    def test_a_macro_is_named_as_it_is_used(self, zones):
        """A name `$(...)` cannot spell is a macro nothing can use."""
        code = self.screen(
            zones,
            """\
            - component: value
              label: Pressure
              macros: {my-prefix: L4-VAC-01}
              pv: L4-VAC-01:Pressure
            """,
        )
        with pytest.raises(ZoneError, match="my-prefix"):
            load_zone(code)


class TestRealZones:
    """The zones this repository actually ships."""

    def test_every_shipped_zone_loads(self):
        codes = zone_codes()
        assert "TESTZ" in codes
        for code in codes:
            zone = load_zone(code)
            assert zone.guis, f"zone {code} has no screens"

    def test_no_two_zones_claim_the_same_hostname_pattern(self):
        """Not exhaustive — two globs can overlap without being equal — but it
        catches the copy-paste that would make a station ambiguous."""
        seen: dict[str, str] = {}
        for code in zone_codes():
            for pattern in load_zone(code).hostnames:
                assert pattern not in seen, f"{code} and {seen[pattern]} both claim {pattern!r}"
                seen[pattern] = code

    def test_every_screen_declares_a_pv_for_everything_it_reads(self):
        """A widget reading a PV no component declared shows `<>` for ever
        against the simulator and the local IOC. The declaration is what makes
        a YAML-only screen work without a mock."""
        for code in zone_codes():
            for gui in load_zone(code).guis:
                declared = {spec.name for spec in gui.all_pv_specs()}
                read = {pv.name for pv in gui.all_pvs()}
                missing = sorted(read - declared)
                assert not missing, f"{code}/{gui.slug}: undeclared PVs {missing}"


def camera_block(pv: str, width: int = 640, height: int = 480) -> str:
    """One `camera` entry, indented to follow `make_gui`'s component list."""
    block = textwrap.dedent(
        f"""\
        - component: camera
          label: Camera {pv}
          pv: {pv}
          width: {width}
          height: {height}
        """
    )
    return textwrap.indent(block, "  ")


class TestCameras:
    """Which cameras a zone shows: what the camera gateway will serve, and the
    only images a browser may ask it for."""

    def test_the_zone_lists_every_camera_once_across_its_screens(self, zones):
        zone = make_zone(zones, "Z1")
        make_gui(zone, "wall", camera_block("Z:CAM1:Image") + camera_block("Z:CAM2:Image"))
        make_gui(zone, "laser", camera_block("Z:CAM1:Image"))

        cameras = load_zone("Z1").cameras()

        assert sorted(cameras) == ["Z:CAM1:Image", "Z:CAM2:Image"]
        assert cameras["Z:CAM1:Image"].width == 640

    def test_two_screens_disagreeing_about_a_camera_fail_the_start(self, zones):
        zone = make_zone(zones, "Z1")
        make_gui(zone, "wall", camera_block("Z:CAM1:Image", width=640))
        make_gui(zone, "laser", camera_block("Z:CAM1:Image", width=1024))

        with pytest.raises(ZoneError, match="Z:CAM1:Image"):
            load_zone("Z1")
