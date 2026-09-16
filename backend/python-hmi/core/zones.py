"""Zones and GUIs: the folder layout, and how a station knows which zone it is.

Each control-system zone is a separate network, and this app is deployed once
per zone. So the repository is laid out the way the facility is:

    zones/
    ├── 01/
    │   ├── zone.yaml              which hostnames are this zone
    │   ├── l4-opcpa/gui.yaml      a screen  ->  /l4-opcpa  ->  a menu entry
    │   └── vacuum/gui.yaml        another   ->  /vacuum
    ├── 02/ …
    └── TESTZ/ …

Two consequences worth stating plainly, because they are the whole point:

* **A folder is a screen.** Adding a GUI to a zone is creating a folder with a
  `gui.yaml` in it; removing one is deleting the folder. There is no registry to
  edit, no route to declare, and the main menu is the folder listing — so the
  menu cannot disagree with what the app actually serves.
* **A zone owns its own identity.** `zone.yaml` lists the hostnames it runs on,
  so a new zone is still just a folder.

ZONE RESOLUTION
---------------
`ZONE_CODE` wins when it is set. Otherwise the machine's hostname is matched
against every zone's `hostnames:` globs. Matching none, or matching more than
one, is a **start-up failure**: a control room screen that is quietly showing
the wrong zone's PVs is worse than one that did not start, because every value
on it looks plausible.
"""

from __future__ import annotations

import fnmatch
import logging
import os
import socket
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from core.components import Component, ComponentConfig, ComponentError, get as get_component, slug

logger = logging.getLogger(__name__)

#: Repository root of this app (…/backend/python-hmi).
APP_ROOT = Path(__file__).resolve().parent.parent
#: Overridable so tests and containers can point elsewhere.
ZONES_ENV = "ZONES_ROOT"

ZONE_FILE = "zone.yaml"
GUI_FILE = "gui.yaml"


class ZoneError(Exception):
    """Something about the zone layout an operator or engineer must fix."""


def zones_root() -> Path:
    override = os.getenv(ZONES_ENV)
    return Path(override) if override else APP_ROOT / "zones"


# ---------------------------------------------------------------------------
# File shapes
# ---------------------------------------------------------------------------


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ZoneFile(Strict):
    """`zones/<CODE>/zone.yaml`."""

    title: str = Field(description="Shown in the header, so an operator can see which zone this is.")
    hostnames: list[str] = Field(
        default_factory=list,
        description="Glob patterns for the hosts that are this zone, e.g. '*-z01-*'. "
        "Matched case-insensitively against the machine's hostname when ZONE_CODE is unset.",
    )
    description: str = Field(default="", description="Free text for whoever reads the folder.")
    #: Menu order for GUIs that do not set one of their own.
    menu: list[str] = Field(
        default_factory=list,
        description="Optional explicit menu order, by folder name. Folders not "
        "listed follow, ordered by their own `order:` then name.",
    )


class GuiFile(Strict):
    """`zones/<CODE>/<slug>/gui.yaml`."""

    title: str = Field(description="Menu label and page heading.")
    order: int = Field(default=100, description="Menu position; lower comes first.")
    description: str = Field(default="", description="Free text, shown under the heading.")
    components: list[dict[str, Any]] = Field(
        default_factory=list,
        description="The screen: a list of component blocks. Each needs a "
        "`component:` naming which component renders it.",
    )


# ---------------------------------------------------------------------------
# Loaded objects
# ---------------------------------------------------------------------------


@dataclass
class Gui:
    """One screen in one zone."""

    #: Folder name: the URL path and the menu key.
    slug: str
    title: str
    order: int
    description: str
    path: Path
    #: Top-level components, already built.
    components: list[Component]

    @property
    def url(self) -> str:
        return f"/{self.slug}"

    @property
    def stream_url(self) -> str:
        return f"/{self.slug}/stream"

    def walk(self) -> Iterable[Component]:
        for component in self.components:
            yield from component.walk()

    def all_widgets(self):
        for component in self.components:
            yield from component.all_widgets()

    def all_pvs(self):
        pvs = set()
        for component in self.components:
            pvs |= component.all_pvs()
        return pvs

    def all_pv_specs(self):
        specs = []
        for component in self.components:
            specs.extend(component.all_pv_specs())
        return specs

    def signals(self) -> dict[str, Any]:
        signals: dict[str, Any] = {}
        for component in self.components:
            signals.update(component.all_signals())
        return signals


@dataclass
class Zone:
    code: str
    title: str
    description: str
    hostnames: list[str]
    path: Path
    guis: list[Gui] = field(default_factory=list)
    #: How this zone came to be selected, for `/stats` and the start-up log.
    resolved_by: str = "explicit"

    def gui(self, slug: str) -> Gui | None:
        return next((gui for gui in self.guis if gui.slug == slug), None)

    @property
    def home(self) -> str:
        return self.guis[0].url if self.guis else "/"

    def menu(self) -> list[dict[str, Any]]:
        """The main menu — literally this zone's folders."""
        return [{"href": gui.url, "label": gui.title, "slug": gui.slug} for gui in self.guis]


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ZoneError(f"{path} is not valid YAML: {exc}") from exc
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ZoneError(f"{path} should contain a mapping, not {type(data).__name__}")
    return data


def _prettify(error: ValidationError, path: Path) -> str:
    lines = [f"{path} is invalid:"]
    for item in error.errors():
        where = ".".join(str(part) for part in item["loc"]) or "(root)"
        lines.append(f"  {where}: {item['msg']}")
    return "\n".join(lines)


def zone_codes() -> list[str]:
    """Every zone folder, in the order a human would list them."""
    root = zones_root()
    if not root.is_dir():
        raise ZoneError(f"no zones directory at {root}")
    return sorted(
        path.name
        for path in root.iterdir()
        if path.is_dir() and (path / ZONE_FILE).is_file()
    )


def resolve_zone_code(hostname: str | None = None) -> tuple[str, str]:
    """Which zone this process is. Returns `(code, how)`.

    See the module docstring: the environment wins, then the hostname, and
    ambiguity is a failure rather than a guess.
    """
    explicit = os.getenv("ZONE_CODE", "").strip()
    if explicit:
        if explicit not in zone_codes():
            raise ZoneError(
                f"ZONE_CODE={explicit!r} has no folder. "
                f"Zones here: {', '.join(zone_codes()) or 'none'}"
            )
        return explicit, "ZONE_CODE"

    host = (hostname or socket.gethostname()).strip()
    matches = [code for code in zone_codes() if _host_matches(host, code)]
    if len(matches) == 1:
        return matches[0], f"hostname {host!r}"
    if not matches:
        raise ZoneError(
            f"this host ({host!r}) matches no zone's `hostnames:` patterns, and "
            f"ZONE_CODE is not set.\n"
            f"Either set ZONE_CODE, or add a pattern to one of: "
            f"{', '.join(zone_codes()) or 'no zones found'}"
        )
    raise ZoneError(
        f"this host ({host!r}) matches several zones: {', '.join(matches)}.\n"
        f"Tighten their `hostnames:` patterns, or set ZONE_CODE to settle it."
    )


def _host_matches(host: str, code: str) -> bool:
    patterns = load_zone_file(code).hostnames
    lowered = host.lower()
    # The short name too: a fully-qualified host would otherwise need every
    # pattern to end in `*`, which is the kind of detail that gets forgotten
    # once and then costs an afternoon.
    short = lowered.split(".")[0]
    return any(
        fnmatch.fnmatch(lowered, pattern.lower()) or fnmatch.fnmatch(short, pattern.lower())
        for pattern in patterns
    )


def load_zone_file(code: str) -> ZoneFile:
    path = zones_root() / code / ZONE_FILE
    if not path.is_file():
        raise ZoneError(f"{path} is missing — every zone folder needs a {ZONE_FILE}")
    try:
        return ZoneFile.model_validate(_read_yaml(path))
    except ValidationError as exc:
        raise ZoneError(_prettify(exc, path)) from exc


def load_zone(code: str, *, resolved_by: str = "explicit") -> Zone:
    """Read a zone folder: its `zone.yaml` and every GUI folder inside it."""
    path = zones_root() / code
    meta = load_zone_file(code)
    zone = Zone(
        code=code,
        title=meta.title,
        description=meta.description,
        hostnames=list(meta.hostnames),
        path=path,
        resolved_by=resolved_by,
    )

    folders = sorted(
        child for child in path.iterdir() if child.is_dir() and (child / GUI_FILE).is_file()
    )
    guis = [load_gui(folder) for folder in folders]

    # Explicit `menu:` order first, then everyone else by their own `order:`.
    explicit = {name: index for index, name in enumerate(meta.menu)}
    guis.sort(key=lambda gui: (explicit.get(gui.slug, len(explicit)), gui.order, gui.slug))
    zone.guis = guis

    stray = [
        child.name
        for child in path.iterdir()
        if child.is_dir() and not (child / GUI_FILE).is_file()
    ]
    if stray:
        # Not fatal, but it is almost always a GUI whose gui.yaml is misnamed,
        # and the symptom (a missing menu entry) gives no hint on its own.
        logger.warning(
            "zone %s: folder(s) with no %s, so they are not screens: %s",
            code,
            GUI_FILE,
            ", ".join(sorted(stray)),
        )
    return zone


def load_gui(folder: Path) -> Gui:
    """Read one GUI folder.

    `gui.yaml` carries the screen. Any *other* `*.yaml` in the folder is read
    for its `components:` too, in filename order — so a screen with one device
    per file (five lasers, twenty motors) can be split up, and adding a device
    is adding a file.
    """
    main = folder / GUI_FILE
    try:
        meta = GuiFile.model_validate(_read_yaml(main))
    except ValidationError as exc:
        raise ZoneError(_prettify(exc, main)) from exc

    blocks: list[tuple[str, dict[str, Any]]] = [
        (f"{main.name}#{index}", block) for index, block in enumerate(meta.components)
    ]
    for extra in sorted(folder.glob("*.yaml")):
        if extra.name == GUI_FILE:
            continue
        data = _read_yaml(extra)
        unknown = sorted(set(data) - {"components"})
        if unknown:
            raise ZoneError(
                f"{extra}: only `components:` belongs in an extra file "
                f"(found {', '.join(unknown)}). Screen-wide settings go in {GUI_FILE}."
            )
        for index, block in enumerate(data.get("components") or []):
            blocks.append((f"{extra.name}#{index}", block))

    counters: dict[str, int] = {}
    components = [build_component(block, source, counters) for source, block in blocks]

    return Gui(
        slug=folder.name,
        title=meta.title,
        order=meta.order,
        description=meta.description,
        path=folder,
        components=components,
    )


def build_component(
    block: dict[str, Any],
    source: str,
    counters: dict[str, int],
) -> Component:
    """Turn one YAML block into a component instance, children and all."""
    if not isinstance(block, dict):
        raise ZoneError(f"{source}: each component must be a mapping, not {type(block).__name__}")
    name = block.get("component")
    if not name:
        raise ZoneError(f"{source}: missing `component:` — what should render this block?")

    try:
        cls = get_component(name)
    except KeyError as exc:
        raise ZoneError(f"{source}: {exc.args[0]}") from exc

    nested = block.get("components")
    if nested and not cls.accepts_children:
        raise ZoneError(
            f"{source}: component {name!r} takes no nested `components:`. "
            f"Wrap them in a `panel` instead."
        )

    payload = {key: value for key, value in block.items() if key != "components"}
    try:
        config = cls.Config.model_validate(payload)
    except ValidationError as exc:
        raise ZoneError(_component_error(exc, source, cls)) from exc

    children: list[Component] = []
    if cls.accepts_children:
        children = [
            build_component(child, f"{source}.{index}", counters)
            for index, child in enumerate(nested or [])
        ]

    counters[name] = counters.get(name, 0) + 1
    key = slug(config.id) if config.id else f"{slug(name)}{counters[name]}"
    try:
        return cls(key=key, config=config, children=children, source=source)
    except ComponentError:
        raise
    except Exception as exc:  # noqa: BLE001 - reported with its origin
        raise ZoneError(f"{source}: component {name!r} failed to build: {exc}") from exc


def _component_error(exc: ValidationError, source: str, cls: type[Component]) -> str:
    known = ", ".join(sorted(cls.Config.model_fields))
    lines = [f"{source}: component {cls.name!r} is misconfigured:"]
    for item in exc.errors():
        where = ".".join(str(part) for part in item["loc"]) or "(root)"
        lines.append(f"  {where}: {item['msg']}")
    lines.append(f"  keys {cls.name!r} accepts: {known}")
    return "\n".join(lines)
