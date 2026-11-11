"""camera — one camera image, live.

    - component: camera
      label: NL1 near field
      pv: L4-OPCPA-NL1:CAM1:Image   # waveform: width*height 16-bit pixels, row-major
      width: 1024
      height: 1024
      bits: 12                      # a 12-bit sensor saturates at 4095
      rate: 10                      # frames per second the camera delivers
      filters: true                 # IOC on EPICS base >= 7.0.3 (see below)

Unlike every other component, the live part is not a widget. A frame is 2 MiB of
pixels, ten times a second, so it never goes through the hub or the SSE stream:
the page opens one WebSocket to the camera gateway (`cameras/`), says which
cameras are on screen and how big, and draws the frames it gets onto the canvas
here. A tile scrolled out of view, or in a hidden tab, costs nothing.

`filters: true` lets the gateway ask the IOC itself to drop frames a small tile
does not need (a server-side channel filter, `PV.{"dec":{"n":5}}`). Only IOCs
on EPICS base 7.0.3 or later understand that; leave it off for anything older
and the gateway thins the stream itself.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from cameras.spec import CameraSpec, SimBeam
from core.components import Component, ComponentConfig, register


class SimConfig(BaseModel):
    """How the built-in simulator draws this camera. Ignored on a real network."""

    model_config = ConfigDict(extra="forbid")

    profile: Literal["gaussian", "flattop"] = Field(
        default="gaussian",
        description="`gaussian` is a round TEM00 spot; `flattop` the flat-topped "
        "beam a high-power amplifier delivers.",
    )
    waist: float | None = Field(
        default=None, gt=0, description="Beam radius in pixels. Unset: picked from the PV name."
    )
    peak: float = Field(
        default=0.7, gt=0, description="Peak brightness at nominal energy, as a fraction of full scale."
    )
    jitter: float = Field(default=0.03, ge=0, description="Shot-to-shot energy fluctuation, relative RMS.")
    pointing: float = Field(default=2.0, ge=0, description="Pointing jitter, RMS pixels.")
    spikes: float = Field(
        default=0.0,
        ge=0,
        le=1,
        description="Chance per frame of an energy spike that saturates the sensor.",
    )


class Config(ComponentConfig):
    label: str = Field(description="Shown above the image.")
    pv: str = Field(description="The waveform PV holding the image: width*height pixels, row-major.")
    width: int = Field(gt=0, le=16384, description="Image width in pixels.")
    height: int = Field(gt=0, le=16384, description="Image height in pixels.")
    bits: int = Field(
        default=12,
        ge=1,
        le=16,
        description="Significant bits per pixel. A pixel at 2^bits-1 is saturated.",
    )
    rate: float = Field(default=10.0, gt=0, le=200, description="Frames per second the camera delivers.")
    levels: Literal["auto"] | tuple[int, int] = Field(
        default="auto",
        description="Black and white levels for display, e.g. [100, 4095]; `auto` "
        "stretches each frame from its background to its brightest pixel.",
    )
    filters: bool = Field(
        default=False,
        description="The IOC runs EPICS base >= 7.0.3, so the gateway may ask it to "
        "drop frames a small tile does not need. Leave off for older IOCs.",
    )
    sim: SimConfig = Field(
        default_factory=SimConfig, description="How the built-in simulator draws this camera."
    )

    @field_validator("levels")
    @classmethod
    def _levels_in_order(cls, value):
        if value != "auto" and value[0] >= value[1]:
            raise ValueError(f"black level {value[0]} must be below white level {value[1]}")
        return value


@register
class Camera(Component):
    name = "camera"
    summary = "A live camera image from a waveform PV."
    Config = Config
    template = "camera/camera.html"

    def cameras(self) -> list[CameraSpec]:
        cfg: Config = self.config  # type: ignore[assignment]
        return [
            CameraSpec(
                pv=cfg.pv,
                width=cfg.width,
                height=cfg.height,
                bits=cfg.bits,
                rate=cfg.rate,
                label=cfg.label,
                levels=None if cfg.levels == "auto" else tuple(cfg.levels),
                filters=cfg.filters,
                sim=SimBeam(**cfg.sim.model_dump()),
            )
        ]

    def context(self) -> dict[str, Any]:
        return {"camera": self.cameras()[0]}
