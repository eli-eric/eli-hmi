"""motor — a motor mover: where it is, where it is going, and how to stop it.

One row per motor, or a panel of them. Everything a motor screen needs is here
because a motor is always the same shape, whatever it moves:

    - component: motor
      label: Sample X
      prefix: L4-MOT-SAMPLE:X          # the record; fields are appended
      units: mm
      range: [-25, 25]
      presets: [-10, 0, 10]

    - component: motor                 # or name every signal yourself
      label: Attenuator
      readback: L4-OPCPA-NL2:ATT:Position
      setpoint: L4-OPCPA-NL2:ATT:Target
      moving: L4-OPCPA-NL2:ATT:Moving
      stop: L4-OPCPA-NL2:ATT:Stop
      limits: [L4-OPCPA-NL2:ATT:LowLimit, L4-OPCPA-NL2:ATT:HighLimit]

WHY TWO WAYS TO NAME THE PVS
`prefix:` follows the EPICS motor record, where the signals are *fields* of one
record: `.RBV`, `.VAL`, `.DMOV`, `.HLS`, `.LLS`, `.STOP`. That is what a real
motor looks like, so it is the default. But a record name cannot contain a dot —
Channel Access splits the name there to find the field — so a dotted PV cannot
be served by the local base-only IOC. Name the signals explicitly (the second
form) on a screen you want to run against `ioc/`, and use `prefix:` against the
real network. `ioc/generate.py` prints the ones it had to skip.

The row shows position, and a state pill that reads MOVING / AT LIMIT / STOPPED
— because "is it moving" and "did it hit something" are the two questions asked
of a motor, and neither is answerable from the position alone.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field, model_validator

from components.common import Alarm, Demo
from core.components import Component, ComponentConfig, PvId, PvReader, PvSpec, register
from core.render import (
    Readout,
    ValueFormatOptions,
    number_readout,
    parse_format,
    present_aggregate,
)

#: Field suffixes of the EPICS motor record, used when `prefix:` is given.
FIELDS = {
    "readback": ".RBV",
    "setpoint": ".VAL",
    "moving": ".DMOV",
    "stop": ".STOP",
    "low_limit": ".LLS",
    "high_limit": ".HLS",
}


class Config(ComponentConfig):
    label: str = Field(description="Row label: what this motor moves.")
    prefix: str | None = Field(
        default=None,
        description="Motor record name. The signals are its fields (.RBV, .VAL, "
        ".DMOV, .STOP, .HLS, .LLS). Cannot be served by the local IOC — see the "
        "module docstring.",
    )
    readback: str | None = Field(default=None, description="Position readback PV.")
    setpoint: str | None = Field(default=None, description="Position setpoint PV.")
    moving: str | None = Field(
        default=None,
        description="1 while the motor is moving. The EPICS motor record's .DMOV "
        "is the opposite (1 = done), which `done_when_zero` handles.",
    )
    stop: str | None = Field(default=None, description="PV written to stop the motor.")
    limits: tuple[str, str] | None = Field(
        default=None, description="Limit-switch PVs, [low, high]."
    )
    done_when_zero: bool | None = Field(
        default=None,
        description="True when the `moving` PV is really a 'done moving' flag, as "
        "the motor record's .DMOV is. Defaults to true when `prefix:` is used.",
    )
    units: str | None = Field(default=None, description="Engineering units, e.g. mm or deg.")
    format: Any = Field(default=None, description="Decimal places, or a {format: …} block.")
    range: tuple[float, float] | None = Field(
        default=None, description="Travel range [low, high]; also the simulated band."
    )
    alarm: Alarm = Field(default_factory=Alarm, description="EPICS alarm limits for the local IOC.")
    demo: Demo = Field(default_factory=Demo, description="Simulation behaviour.")
    presets: list[float] = Field(
        default_factory=list, description="Positions offered as one-press chips."
    )
    step: float = Field(default=0.1, description="Step of the setpoint field.")

    @model_validator(mode="after")
    def _addressable(self) -> "Config":
        if not self.prefix and not self.readback:
            raise ValueError("give either `prefix:` (a motor record) or at least `readback:`")
        if self.prefix and self.readback:
            raise ValueError("give `prefix:` or the individual PVs, not both")
        return self

    def pv(self, role: str) -> str | None:
        """The PV for one signal, from `prefix:` or the explicit field."""
        if self.prefix:
            return f"{self.prefix}{FIELDS[role]}"
        if role == "low_limit":
            return self.limits[0] if self.limits else None
        if role == "high_limit":
            return self.limits[1] if self.limits else None
        return getattr(self, role)

    @property
    def inverted(self) -> bool:
        return self.done_when_zero if self.done_when_zero is not None else bool(self.prefix)

    @property
    def value_format(self) -> ValueFormatOptions | None:
        return parse_format(self.format)

    @property
    def low(self) -> float:
        return self.range[0] if self.range else 0.0

    @property
    def high(self) -> float:
        return self.range[1] if self.range else 100.0


@register
class Motor(Component):
    name = "motor"
    summary = "A motor: position, setpoint, jog presets, stop, limit switches."
    Config = Config
    template = "motor/motor.html"

    config: Config

    def setup(self) -> None:
        cfg = self.config
        self.cog = self.signal("cog")
        self.set_signal = self.signal("set", "")

        readback = cfg.pv("readback")
        self.add("position", "value_cell", [PvId(readback)], self._position)

        state_pvs = [PvId(pv) for pv in self._state_pvs() if pv]
        if state_pvs:
            self.add("state", "pill", state_pvs, self._state)

    def _state_pvs(self) -> list[str | None]:
        cfg = self.config
        return [cfg.pv("moving"), cfg.pv("low_limit"), cfg.pv("high_limit")]

    # -- readings ----------------------------------------------------------

    def _position(self, read: PvReader) -> dict[str, Any]:
        cfg = self.config
        pv = cfg.pv("readback")
        return {
            "readout": number_readout(
                read(pv),
                pv_name=pv,
                value_format=cfg.value_format,
                units=cfg.units,
                is_connected=read.is_connected,
            )
        }

    def _state(self, read: PvReader) -> dict[str, Any]:
        """MOVING / AT LIMIT / STOPPED.

        A limit wins over movement: a motor sitting on a limit switch is the
        thing an operator needs to know about, and it is not going anywhere.
        The tone comes from the readings' own severity — a limit switch is a
        normal operating state, not an alarm, so this pill does not invent one.
        """
        cfg = self.config
        samples = [read(pv) for pv in self._state_pvs() if pv]
        moving_pv = cfg.pv("moving")
        low, high = cfg.pv("low_limit"), cfg.pv("high_limit")

        at_limit = any(
            read(pv) is not None and read(pv).ok and read(pv).value == 1
            for pv in (low, high)
            if pv
        )
        moving = None
        if moving_pv:
            sample = read(moving_pv)
            if sample is not None and sample.ok and sample.value is not None:
                flag = sample.value == 1
                moving = (not flag) if cfg.inverted else flag

        if at_limit:
            text = "AT LIMIT"
        elif moving is None:
            text = "<>"
        else:
            text = "MOVING" if moving else "STOPPED"

        severity = present_aggregate(samples, is_connected=read.is_connected)
        return {
            "readout": Readout(
                text=severity.text if severity.text is not None else text,
                tone=severity.tone,
                title=severity.title,
                placeholder=severity.text is not None,
            )
        }

    # -- declarations ------------------------------------------------------

    def pv_specs(self) -> list[PvSpec]:
        cfg = self.config
        readback = cfg.pv("readback")
        setpoint = cfg.pv("setpoint")
        moving = cfg.pv("moving")
        stop = cfg.pv("stop")
        span = cfg.high - cfg.low

        specs = [
            PvSpec(
                name=readback,
                kind="float",
                value=cfg.demo.value,
                low=cfg.low,
                high=cfg.high,
                # A motor at rest is *at rest*: a position that wandered on its
                # own would be a simulator inventing machine behaviour. It moves
                # when the setpoint is written, via the effect chain below.
                step=0.0,
                prec=_decimals(cfg),
                egu=cfg.units,
                high_alarm=cfg.alarm.high,
                hihi=cfg.alarm.hihi,
                low_alarm=cfg.alarm.low,
                lolo=cfg.alarm.lolo,
                severity=cfg.demo.severity,
                undefined=cfg.demo.undefined,
                desc=f"{cfg.label} position",
            )
        ]
        if setpoint and setpoint != readback:
            # Writing the setpoint moves the readback and raises `moving` for a
            # moment: that is the whole of "a motor moves" as far as a screen is
            # concerned, and it is declared once here for both backends.
            specs.append(
                PvSpec(
                    name=setpoint,
                    kind="float",
                    command=True,
                    value=None,
                    effects=((readback, None),),
                    busy=(moving,) if moving and not cfg.inverted else (),
                    busy_seconds=2.0,
                    egu=cfg.units,
                    desc=f"{cfg.label} setpoint",
                )
            )
        if moving:
            specs.append(
                PvSpec(
                    name=moving,
                    kind="bool",
                    # .DMOV reads 1 when the move is *done*, so at rest it is 1.
                    value=1 if cfg.inverted else 0,
                    desc=f"{cfg.label} {'done moving' if cfg.inverted else 'moving'}",
                )
            )
        for pv, which in ((cfg.pv("low_limit"), "low"), (cfg.pv("high_limit"), "high")):
            if pv:
                specs.append(
                    PvSpec(name=pv, kind="bool", value=0, desc=f"{cfg.label} {which} limit")
                )
        if stop:
            specs.append(
                PvSpec(
                    name=stop,
                    kind="int",
                    command=True,
                    value=1,
                    effects=((moving, 1 if cfg.inverted else 0),) if moving else (),
                    desc=f"{cfg.label} stop",
                )
            )
        return specs

    def context(self) -> dict[str, Any]:
        cfg = self.config
        return {
            "cog": self.cog,
            "set_signal": self.set_signal,
            "setpoint_pv": cfg.pv("setpoint"),
            "stop_pv": cfg.pv("stop"),
            "has_state": "state" in self.widgets,
        }


def _decimals(cfg: Config) -> int:
    options = cfg.value_format
    if options is None:
        return 3
    if options.format == "fixed":
        return options.to_fixed
    if options.format == "precision":
        return options.to_precision
    return 3
