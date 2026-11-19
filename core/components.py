"""The component contract.

A **component** is a reusable piece of screen written once in Python and then
used any number of times from YAML. A **GUI** is a list of components with their
settings; a **zone** is a folder of GUIs. So:

    zones/01/chillers/gui.yaml     what this station shows   (controls engineer)
    components/value/             what a readout row is      (framework author)
    core/                          how any of it reaches a browser

Writing a component means filling in four things, and the rest of the framework
never needs to know which component it is dealing with:

1. ``name`` — what YAML calls it (``component: value``).
2. ``Config`` — a pydantic model for its YAML block. This is the component's
   documentation as far as a controls engineer is concerned, so the field
   descriptions matter: a wrong key is rejected at start-up with the list of
   keys that would have been right.
3. ``setup()`` — declare the live parts (``self.add(...)``) and the client-side
   state (``self.signal(...)``).
4. ``pv_specs()`` — say what kind of signal each PV is. This is what lets a new
   YAML GUI work against the built-in simulator *and* against the local EPICS
   IOC without anybody writing more code: the simulator invents values from
   these, and `ioc/generate.py` turns them into real EPICS records.

What a component must NOT do is decide colour or severity. It asks
`core.render` for a `Readout` and emits the tone it is given — see the tone
layer in `core/static/css/hmi.css`. That rule is why a component cannot
accidentally paint over an alarm.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, ClassVar, Iterable, Iterator, Literal, Mapping, Sequence

from pydantic import BaseModel, ConfigDict, Field

from core.epics import Datatype, PvId, PvSample

if TYPE_CHECKING:
    from cameras.spec import CameraSpec

# ---------------------------------------------------------------------------
# Reading PV values
# ---------------------------------------------------------------------------


class PvReader:
    """Read-only view of the latest readings, handed to every widget.

    `is_connected` is the server's own view of the EPICS link: when it is down
    every readout greys out and keeps its last value rather than continuing to
    look live. (The browser-side half — "is this SSE stream still alive" — is
    the `$_age` watchdog in the page template.)
    """

    __slots__ = ("_samples", "is_connected")

    def __init__(self, samples: Mapping[PvId, PvSample | None], is_connected: bool = True):
        self._samples = samples
        self.is_connected = is_connected

    def __call__(self, name: str, datatype: Datatype = Datatype.NATIVE) -> PvSample | None:
        return self._samples.get(PvId(name, datatype))

    def many(
        self, names: Iterable[str], datatype: Datatype = Datatype.NATIVE
    ) -> list[PvSample | None]:
        return [self(name, datatype) for name in names]


# ---------------------------------------------------------------------------
# What a PV is (for the simulator and the IOC generator)
# ---------------------------------------------------------------------------

PvKind = Literal["bool", "float", "int", "enum", "string"]


@dataclass(frozen=True)
class PvSpec:
    """A component's declaration of one PV: enough to invent a plausible value
    for it, and to emit a real EPICS record for it.

    Nothing here affects *display*. How a value looks comes from the reading
    itself (severity, units) and from the GUI's config (format, labels). This is
    only consulted when there is no control system to ask — the simulator
    (`core/epics/sim_backend.py`) and the local IOC (`ioc/generate.py`) both
    read these, which is why a new component works in both without extra code.
    """

    name: str
    kind: PvKind
    #: Where the signal sits at rest. `None` picks the middle of the band.
    value: Any = None
    #: The range the record *declares* — DRVL/DRVH on a writable record, and
    #: what a screen reads back as the range it may offer. None means the
    #: component declared none, and nothing should invent one: a simulated
    #: band is where a value wanders, not what a device will accept.
    limits: tuple[float, float] | None = None
    #: Band a `float`/`int` wanders inside, and how far per tick. **A step of 0
    #: means the signal holds still**, which is the default on purpose: a
    #: simulator that invents movement nobody asked for teaches an engineer that
    #: a moving number means a live machine, which is exactly wrong.
    low: float = 0.0
    high: float = 1.0
    step: float = 0.0
    #: Decimal places an IOC record should advertise (PREC).
    prec: int = 3
    egu: str | None = None
    #: State names in index order. For `enum` they are the record's states; for
    #: `bool` the first two become ZNAM and ONAM, so `caget` on the local IOC
    #: reads CLOSED/OPEN rather than off/on — the record then reads the way the
    #: screen does, which is what someone debugging with `camonitor` expects.
    states: tuple[str, ...] = ()
    #: EPICS alarm limits, so a simulated fault is a *real* alarm rather than a
    #: colour the UI chose for itself.
    high_alarm: float | None = None
    hihi: float | None = None
    low_alarm: float | None = None
    lolo: float | None = None
    #: Report this severity unconditionally (0-3). For demonstrating a fault
    #: that has no limit field to trip — a denied permission, say.
    severity: int = 0
    #: True for a PV the panel writes (a setpoint, a shutter).
    writable: bool = False
    #: True for a trigger: writing to it runs a chain of writes elsewhere.
    #: `effects` is that chain, as (pv, value) pairs; `busy` names the PVs held
    #: at 1 while it runs and cleared `busy_seconds` later.
    #:
    #: Declaring the chain here rather than in the simulator is what lets one
    #: declaration drive both backends: the simulator applies the writes, and
    #: `ioc/generate.py` turns the same list into a `seq` record with a delayed
    #: release step. A command a component invents therefore works against the
    #: local IOC without anyone touching the generator.
    command: bool = False
    effects: tuple[tuple[str, Any], ...] = ()
    #: For the write side of a device that reports from one record and is
    #: written through another: whatever is written here lands there. Unlike
    #: `effects`, the value is the operator's and not the configuration's —
    #: which is why this is an output record forwarding to its readback,
    #: rather than a trigger running a chain of constants.
    forwards_to: str | None = None
    busy: tuple[str, ...] = ()
    busy_seconds: float = 3.0
    #: Never initialise it, so it reads INVALID/UDF. One per screen is worth
    #: having: it is the state an operator most needs to recognise.
    undefined: bool = False
    #: Free text for the record's DESC field and for `--list` output.
    desc: str = ""

    def with_name(self, name: str) -> "PvSpec":
        return PvSpec(**{**self.__dict__, "name": name})


# ---------------------------------------------------------------------------
# Widgets
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Widget:
    """One element of the page that is re-rendered and pushed when a PV changes.

    A widget is a **value cell, pill or list — never a whole row**. Labels,
    buttons and inputs are rendered once with the page and never patched, so an
    update cannot land in the middle of an operator typing a setpoint or close a
    panel they just opened.
    """

    #: DOM id. The SSE patch targets it, so it must be unique on the page.
    id: str
    #: Macro that renders it: `(template, macro name)`.
    macro: tuple[str, str]
    #: PVs whose change means "re-render me".
    pvs: tuple[PvId, ...]
    #: Latest readings -> template context.
    build: Callable[[PvReader], dict[str, Any]]
    #: Datastar expression for `data-show`, for a region the operator expands.
    show: str | None = None


# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------


class ComponentConfig(BaseModel):
    """Base for every component's YAML block.

    `extra="forbid"` is the point: a typo in a key fails at start-up naming the
    keys that would have worked, instead of silently rendering a screen with
    something missing.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    component: str = Field(description="Which component renders this block.")
    id: str | None = Field(
        default=None,
        description="Optional stable id, used in DOM ids and diagnostics. "
        "Defaults to the component name plus a counter.",
    )
    title: str | None = Field(default=None, description="Heading, where the component shows one.")


#: A whole number, written the one way: an optional sign and digits, no
#: decimal point, no exponent, no leading zero.
INTEGER = re.compile(r"^[+-]?(0|[1-9]\d*)$")

#: What may be typed into a numeric field. Deliberately not `float()`, which
#: accepts `1_000` (Python's digit separators), `nan` and `infinity` — none of
#: which an operator meant to type, and all of which would reach a device. A
#: leading zero is excluded too: "0021" is a code, and turning it into 21 would
#: change what reaches the record.
NUMERIC = re.compile(r"^[+-]?(0|[1-9]\d*)?(\.\d+)?([eE][+-]?\d+)?$")


@dataclass(frozen=True)
class WriteRule:
    """What one PV accepts, and the only thing that decides how it is checked.

    A writable PV declares a *kind* — a number, one of a set of names, or free
    text — and the kind alone selects the checks. Nothing here looks at the
    text first and decides which rules it seems to deserve: that is how a
    state called `SERVICE` came to be read as scientific notation and how a
    word came to reach a setpoint record unexamined.

    Build one with `number()`, `choice()` or `text()`, and ask it one
    question: `resolve()`.
    """

    kind: Literal["number", "integer", "choice", "text"] = "text"
    #: `number` and `integer`: bounds the device will take.
    min: float | None = None
    max: float | None = None
    #: `number` only: the decimals the device resolves. `None` accepts
    #: whatever was typed, `0` drops every decimal — which is a number with
    #: nothing after the point, not an integer: `2.7` is written as 2. An
    #: integer register is `integer`, which refuses `2.7` outright.
    precision: int | None = None
    #: `number` only: whether "1e3" is a way of writing 1000 here. Off unless
    #: the setpoint asks for it — no reading on these screens is set that way.
    exponential: bool = False
    #: `choice` only: the names the device declared. Nothing else is written.
    choices: tuple[str, ...] = ()

    @classmethod
    def number(
        cls,
        *,
        min: float | None = None,
        max: float | None = None,
        precision: int | None = None,
        exponential: bool = False,
    ) -> "WriteRule":
        return cls(
            kind="number", min=min, max=max, precision=precision, exponential=exponential
        )

    @classmethod
    def integer(
        cls, *, min: float | None = None, max: float | None = None
    ) -> "WriteRule":
        return cls(kind="integer", min=min, max=max)

    @classmethod
    def choice(cls, choices: Iterable[str]) -> "WriteRule":
        return cls(kind="choice", choices=tuple(choices))

    @classmethod
    def text(cls) -> "WriteRule":
        return cls(kind="text")

    def resolve(self, raw: Any) -> tuple[Any, str | None]:
        """The value to write, or the reason it will not be written.

        Returns `(value, None)` or `(None, reason)`. The value is what goes to
        the device, which is not always what was typed: a number is converted
        from the text a query parameter or a text input delivers, and digits
        the device cannot resolve are dropped.
        """
        if self.kind == "number":
            return self._resolve_number(raw)
        if self.kind == "integer":
            return self._resolve_integer(raw)
        if self.kind == "choice":
            return self._resolve_choice(raw)
        return self._resolve_text(raw)

    # -- one method per kind, and no rule outside the kind it belongs to ----

    def _resolve_number(self, raw: Any) -> tuple[Any, str | None]:
        text = str(raw).strip()
        if not NUMERIC.match(text) or not any(c.isdigit() for c in text):
            return None, f"{text!r} is not a number"
        if "e" in text.lower() and not self.exponential:
            return None, (
                f"{text!r} is written in scientific notation, "
                "which this field does not take"
            )
        text = self._truncate(text)
        number = float(text)
        value: Any = (
            int(number)
            if number.is_integer() and "." not in text and "e" not in text.lower()
            else number
        )
        if self.min is not None and value < self.min:
            return None, f"{value} is {self.describe()}"
        if self.max is not None and value > self.max:
            return None, f"{value} is {self.describe()}"
        return value, None

    def _resolve_integer(self, raw: Any) -> tuple[Any, str | None]:
        text = str(raw).strip()
        if not INTEGER.match(text):
            # Refused, not truncated: the register cannot hold 2.5, and
            # writing 2 in its place sends a value nobody typed.
            return None, f"{text!r} is not a whole number"
        value = int(text)
        if self.min is not None and value < self.min:
            return None, f"{value} is {self.describe()}"
        if self.max is not None and value > self.max:
            return None, f"{value} is {self.describe()}"
        return value, None

    def _resolve_choice(self, raw: Any) -> tuple[Any, str | None]:
        text = str(raw).strip()
        if text in self.choices:
            return text, None
        offered = ", ".join(self.choices) or "nothing"
        return None, f"{text!r} is not one of the states this record takes ({offered})"

    def _resolve_text(self, raw: Any) -> tuple[Any, str | None]:
        if isinstance(raw, bool):
            return int(raw), None
        if isinstance(raw, (int, float)):
            if isinstance(raw, float) and not math.isfinite(raw):
                return None, "a non-finite number cannot be written to a PV"
            return raw, None
        # A PV that wants a number and gets "1" is a type error at the CA
        # layer, so the conversion happens here; anything else passes through
        # as the string it is.
        text = str(raw).strip()
        if not NUMERIC.match(text) or not any(c.isdigit() for c in text):
            return text, None
        number = float(text)
        return (
            int(number)
            if number.is_integer() and "." not in text and "e" not in text.lower()
            else number
        ), None

    def _truncate(self, text: str) -> str:
        """Drop digits the device cannot resolve.

        Works on the text rather than the number: `int(2.55 * 100)` is at the
        mercy of binary floating point, while slicing the string is exact.
        Truncates rather than rounds — 2.59 is 2.5, never 2.6 — because
        ignoring extra digits is what this claims to do, and rounding would
        send a value the operator never typed.
        """
        if self.precision is None or "." not in text:
            return text
        whole, fraction = text.split(".", 1)
        if self.precision == 0:
            return whole or "0"
        return f"{whole}.{fraction[: self.precision]}"

    def describe(self) -> str:
        low = "−∞" if self.min is None else f"{self.min:g}"
        high = "∞" if self.max is None else f"{self.max:g}"
        return f"out of range ({low}..{high})"


@dataclass(frozen=True)
class Detail:
    """A view belonging to one component, shown in its place on the screen.
    See `Component.detail`."""

    #: Last segment of the route, e.g. `registers`.
    slug: str
    #: What the view is called.
    title: str
    #: What the view renders. Separate instances from the ones on the screen,
    #: deliberately: widgets belong to exactly one page's index, which is what
    #: keeps a detail view's PVs out of the screen's stream.
    components: tuple["Component", ...]


class Component:
    """Base class. See the module docstring for what a subclass fills in."""

    #: What YAML calls it.
    name: ClassVar[str] = ""
    #: Its YAML block.
    Config: ClassVar[type[ComponentConfig]] = ComponentConfig
    #: Template that lays it out: static markup plus `{{ w['role'] }}` slots.
    template: ClassVar[str] = ""
    #: Optional template holding this component's own widget macros. Macros are
    #: looked up here first, then in the shared `components/templates/readouts.html`.
    macros: ClassVar[str | None] = None
    #: True if the YAML block may contain a nested `components:` list.
    accepts_children: ClassVar[bool] = False
    #: One-line description, printed by `make list-components`.
    summary: ClassVar[str] = ""

    #: Where the shared readout macros live.
    SHARED_MACROS: ClassVar[str] = "readouts.html"

    def __init__(
        self,
        *,
        key: str,
        config: ComponentConfig,
        children: Sequence["Component"] = (),
        source: str = "",
    ):
        #: Unique per page; prefixes every DOM id and signal this component owns.
        self.key = key
        self.config = config
        self.children = list(children)
        #: Where in the YAML this instance came from, for error messages.
        self.source = source
        self.widgets: dict[str, Widget] = {}
        self.signals: dict[str, Any] = {}
        #: PVs this component writes, and the bounds it accepts. See `writable`.
        self.limits: dict[str, WriteRule] = {}
        #: PVs one browser tab at a time may write. See `exclusive`.
        self.exclusive_pvs: set[str] = set()
        self.setup()

    # -- what a subclass implements -----------------------------------------

    def setup(self) -> None:
        """Declare widgets and signals. Called once, at start-up."""

    def describes(self) -> tuple[str, ...]:
        """PVs whose control fields this component draws with.

        For what a time-stamped monitor update does not carry — a record's
        unit, above all. Read at start-up, before anything subscribes, and
        again whenever one of these channels comes back (`core.page`), with
        each answer handed to `described`. A component that needs none — most
        of them — says nothing and nothing is read.
        """
        return ()

    def described(self, descriptions: "dict[str, Any]") -> None:
        """What the device said about the PVs named in `describes`.

        Called at start-up and again after a reconnect, so keep the answer as
        data the next draw reads — never re-declare a widget here: by the
        second call its subscription is live. The row is redrawn for you once
        the answer is in.
        """

    def details(self) -> tuple["Detail", ...]:
        """This component's own views, or none — the usual answer.

        Some components hold far more than they show: every module of a
        device and every register under them. That is a detail view, shown in
        the component's place and at its width when the component asks for it
        (`@get(detail_urls['<slug>'])` from its template), and holding its own
        stream — so the screen's stream never carries its rows, and it is
        streamed only while someone has it open. A component may have several;
        they share its one slot, so one is open at a time.

        Each is routed at `/<screen>/<component key>/<detail slug>` and
        answers with a fragment for the component's slot (`Page.render_view`).
        None is a menu entry: the menu is the zone's folder listing, and a
        view is reached from the component that owns it.
        """
        return ()

    def pv_specs(self) -> list[PvSpec]:
        """What kind of signal each PV this component reads is.

        Returning nothing means the simulator and the local IOC have nothing to
        serve, so the screen reads `<>` everywhere — `tests/test_components.py`
        fails a component that omits a PV it reads.
        """
        return []

    def cameras(self) -> list["CameraSpec"]:
        """The camera images this component shows.

        The camera counterpart of `pv_specs`: what the camera gateway serves,
        the simulator draws and the local IOC publishes. An image never goes
        through a widget — frames have their own WebSocket (`cameras/`).
        """
        return []

    def context(self) -> dict[str, Any]:
        """Extra template variables beyond `c` (config), `w` (widgets),
        `s` (signals) and `children`.
        """
        return {}

    async def warm(self) -> None:
        """Fetch anything this component needs before its first render.

        Called once at start-up, for the same reason the PV cache is warmed
        there: server-side rendering only buys anything if the server already
        knows. A component that reaches a device must not let it fail the
        start-up — catch, log, and render without it.
        """

    # -- helpers for a subclass ---------------------------------------------

    def add(
        self,
        role: str,
        macro: str,
        pvs: Iterable[PvId | str],
        build: Callable[[PvReader], dict[str, Any]],
        *,
        show: str | None = None,
    ) -> Widget:
        """Declare a live element. `role` names it inside this component, and
        the template reaches it as `w['<role>']`.
        """
        if role in self.widgets:
            raise ValueError(f"{self.key}: widget role {role!r} declared twice")
        template = self.macros or self.SHARED_MACROS
        widget = Widget(
            id=f"{self.key}-{slug(role)}",
            macro=(template, macro),
            pvs=tuple(pv if isinstance(pv, PvId) else PvId(pv) for pv in pvs),
            build=build,
            show=show,
        )
        self.widgets[role] = widget
        return widget

    def signal(self, name: str, default: Any = False) -> str:
        """Register a Datastar signal and return its name.

        Declared up front rather than created by the first attribute that
        mentions it: a signal that springs into existence on the first click
        makes `data-show` evaluate against `undefined` on the first paint, which
        is how an expandable list ends up rendered open.
        """
        # The key is slugged too: a signal goes into a Datastar expression as
        # `$name`, and a key with a hyphen in it — which a detail view has,
        # being named after what it belongs to — would make `$a-b_open`, which
        # is a subtraction rather than a signal.
        full = f"{slug(self.key, '_')}_{slug(name, '_')}"
        self.signals[full] = default
        return full

    def writable(self, pv: str, rule: "WriteRule | None" = None) -> str:
        """Declare a PV this component writes, and what it accepts.

        The rule says what *kind* of value the PV takes — `WriteRule.number`,
        `WriteRule.choice`, `WriteRule.text` — and that is the only thing
        deciding which checks the write endpoint runs. A PV declared with no
        rule takes text, which is to say it is simply recorded as one this
        component writes.

        Returns the PV name, so a `setup()` can declare and use it in one line.
        """
        self.limits[pv] = rule or WriteRule.text()
        return pv

    def exclusive(self, pv: str) -> str:
        """Declare that only the tab holding control may write this PV.

        What the screen asked for with `exclusive:` in its YAML. The lock is on
        the PV, so declaring it here makes it exclusive on every screen of the
        zone, and the write endpoint refuses it to any tab that has not taken
        control (`core.locks`).

        Kept apart from `writable` on purpose: bounds are about the value, and
        an exclusive string PV with default bounds would be refused any value
        with an `e` in it.
        """
        self.exclusive_pvs.add(pv)
        return pv

    # -- what the framework uses -------------------------------------------

    @property
    def label(self) -> str:
        return self.config.title or self.config.id or self.key

    def walk(self) -> Iterator["Component"]:
        """This component and every descendant."""
        yield self
        for child in self.children:
            yield from child.walk()

    def all_widgets(self) -> Iterator[Widget]:
        for component in self.walk():
            yield from component.widgets.values()

    def all_signals(self) -> dict[str, Any]:
        signals: dict[str, Any] = {}
        for component in self.walk():
            signals.update(component.signals)
        return signals

    def all_limits(self) -> dict[str, WriteRule]:
        limits: dict[str, WriteRule] = {}
        for component in self.walk():
            limits.update(component.limits)
        return limits

    def all_exclusive_pvs(self) -> set[str]:
        return {pv for component in self.walk() for pv in component.exclusive_pvs}

    def all_pv_specs(self) -> list[PvSpec]:
        specs: list[PvSpec] = []
        for component in self.walk():
            specs.extend(component.pv_specs())
        return specs

    def all_pvs(self) -> set[PvId]:
        return {pv for widget in self.all_widgets() for pv in widget.pvs}

    def all_cameras(self) -> list["CameraSpec"]:
        return [spec for component in self.walk() for spec in component.cameras()]

    def __repr__(self) -> str:  # pragma: no cover - diagnostics
        return f"<{type(self).__name__} {self.key}>"


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------

_REGISTRY: dict[str, type[Component]] = {}


def register(cls: type[Component]) -> type[Component]:
    """Decorator: make a component available to YAML under its `name`.

    Importing `components` imports every package inside it, so a new component
    is available as soon as its folder exists — there is no list of components
    to keep in step.
    """
    if not cls.name:
        raise ValueError(f"{cls.__name__} has no `name`")
    if not cls.template:
        raise ValueError(f"{cls.__name__} has no `template`")
    existing = _REGISTRY.get(cls.name)
    if existing is not None and existing is not cls:
        raise ValueError(
            f"two components both call themselves {cls.name!r}: "
            f"{existing.__module__} and {cls.__module__}"
        )
    _REGISTRY[cls.name] = cls
    return cls


def registry() -> dict[str, type[Component]]:
    """Every registered component, name -> class. Imports `components` first."""
    import components  # noqa: F401  (its __init__ imports every component)

    return dict(_REGISTRY)


def get(name: str) -> type[Component]:
    known = registry()
    if name not in known:
        raise KeyError(
            f"no component called {name!r}. Available: {', '.join(sorted(known))}"
        )
    return known[name]


# ---------------------------------------------------------------------------

_SLUG = re.compile(r"[^A-Za-z0-9]+")


def slug(text: str, joiner: str = "-") -> str:
    """A DOM-id- and identifier-safe version of `text`.

    PV names are full of colons and dots and laser ids are not, so anything that
    becomes part of an id or a signal name goes through here.
    """
    return _SLUG.sub(joiner, text).strip(joiner) or "x"


@dataclass
class ComponentError(Exception):
    """A component that could not be built, reported with where it came from."""

    source: str
    message: str

    def __str__(self) -> str:
        return f"{self.source}: {self.message}"
