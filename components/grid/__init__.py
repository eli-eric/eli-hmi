"""grid — a table of readings: devices down the side, quantities across the top.

For a bank of identical devices. Four chillers with flow, temperature and level
is twelve rows as `value` components and three columns as a grid, and the grid
is the one an operator can scan.

    - component: grid
      columns:
        - { key: flow,  label: Flow,  units: l/min, range: [11, 16] }
        - { key: temp,  label: Temp,  units: degC,  range: [22, 26], alarm: { hihi: 26.5 } }
        - { key: level, label: Water, units: "%",   range: [80, 99] }
      rows:
        - { label: "Chiller PS1225:11", flow: "…:11:MeasuredFlow", temp: "…:11:T_out", level: "…:11:MeasuredLevel" }
        - { label: "Chiller PS1225:12", flow: "…:12:MeasuredFlow", temp: "…:12:T_out", level: "…:12:MeasuredLevel" }

The unit goes in the column header once rather than on every cell: a cell is
about 3.9rem wide and a value like `24.810` already fills it.

A row may leave a column out. The cell is then not rendered at all, rather than
showing a placeholder for a device that has no such reading — a blank says "not
applicable" where `<>` would say "broken".
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from pydantic import Field, model_validator

from components.common import Alarm, Demo, Strict
from core.components import Component, ComponentConfig, PvId, PvReader, PvSpec, register
from core.render import ValueFormatOptions, number_readout, parse_format


class Column(Strict):
    key: str = Field(description="Name the rows use to give this column's PV.")
    label: str = Field(description="Column header. Short: the column is narrow.")
    units: str | None = Field(default=None, description="Appended to the header, not to each cell.")
    format: Any = Field(default=None, description="Decimal places, or a {format: …} block.")
    range: tuple[float, float] | None = Field(
        default=None, description="Engineering range; also the simulated band."
    )
    alarm: Alarm = Field(default_factory=Alarm, description="EPICS alarm limits for the local IOC.")
    integer: bool = Field(default=False, description="Round to whole numbers.")

    @property
    def value_format(self) -> ValueFormatOptions | None:
        return parse_format(self.format)

    @property
    def header(self) -> str:
        return f"{self.label} ({self.units})" if self.units else self.label


class Row(Strict):
    model_config = Strict.model_config | {"extra": "allow"}

    label: str = Field(description="Row label, e.g. the device name.")
    demo: dict[str, Demo] = Field(
        default_factory=dict,
        description="Simulation behaviour, per column: "
        "{temp: {value: 26.8}} to make this device the hot one. Per column "
        "rather than per row, because a fault is a fault of one reading.",
    )

    def pv_for(self, key: str) -> str | None:
        value = (self.__pydantic_extra__ or {}).get(key)
        return value if isinstance(value, str) and value.strip() else None

    def demo_for(self, key: str) -> Demo:
        return self.demo.get(key) or Demo()


class Config(ComponentConfig):
    columns: list[Column] = Field(min_length=1, description="The quantities, left to right.")
    rows: list[Row] = Field(min_length=1, description="The devices, top to bottom.")

    @model_validator(mode="after")
    def _rows_name_known_columns(self) -> "Config":
        keys = {column.key for column in self.columns}
        for row in self.rows:
            unknown = sorted(set(row.__pydantic_extra__ or {}) - keys)
            if unknown:
                raise ValueError(
                    f"row {row.label!r} gives PVs for {', '.join(unknown)}, which is "
                    f"not a column. Columns here: {', '.join(sorted(keys))}"
                )
            if not any(row.pv_for(key) for key in keys):
                raise ValueError(f"row {row.label!r} has no PV for any column")
            stray = sorted(set(row.demo) - keys)
            if stray:
                raise ValueError(
                    f"row {row.label!r}: demo names {', '.join(stray)}, which is "
                    f"not a column"
                )
        return self


@register
class Grid(Component):
    name = "grid"
    summary = "A table of readings: devices down, quantities across."
    Config = Config
    template = "grid/grid.html"

    config: Config

    def setup(self) -> None:
        for row_index, row in enumerate(self.config.rows):
            for column in self.config.columns:
                pv = row.pv_for(column.key)
                if pv is None:
                    continue
                self.add(
                    f"{row_index}-{column.key}",
                    "num_cell",
                    [PvId(pv)],
                    self._cell(pv, column, row),
                )

    def _cell(self, pv: str, column: Column, row: Row):
        def build(read: PvReader) -> dict[str, Any]:
            readout = number_readout(
                read(pv),
                pv_name=pv,
                value_format=column.value_format,
                integer=column.integer,
                is_connected=read.is_connected,
            )
            if readout.units:
                # No unit on the cell: the column header carries it once, and a
                # cell is about 3.9rem wide.
                readout = replace(readout, units=None)
            return {"readout": readout}

        return build

    def pv_specs(self) -> list[PvSpec]:
        specs: list[PvSpec] = []
        for row in self.config.rows:
            for column in self.config.columns:
                pv = row.pv_for(column.key)
                if pv is None:
                    continue
                low, high = column.range or (0.0, 100.0)
                demo = row.demo_for(column.key)
                specs.append(
                    PvSpec(
                        name=pv,
                        kind="int" if column.integer else "float",
                        value=demo.value,
                        low=low,
                        high=high,
                        step=max((high - low) / 40.0, 1e-9) if demo.moving else 0.0,
                        prec=_decimals(column),
                        egu=column.units,
                        high_alarm=column.alarm.high,
                        hihi=column.alarm.hihi,
                        low_alarm=column.alarm.low,
                        lolo=column.alarm.lolo,
                        severity=demo.severity,
                        undefined=demo.undefined,
                        desc=f"{row.label} {column.label}",
                    )
                )
        return specs

    def context(self) -> dict[str, Any]:
        """The layout: one entry per row, naming the widget role for each column.

        Roles rather than rendered HTML, because the template looks them up in
        `w` — which is where every component finds its widgets, so the grid
        needs no special case in the renderer. A column a row leaves out is
        `None`, and the template emits an empty cell: blank reads as "not
        applicable" where `<>` would read as "broken".
        """
        return {
            "table": [
                {
                    "label": row.label,
                    "cells": [
                        f"{index}-{column.key}" if row.pv_for(column.key) else None
                        for column in self.config.columns
                    ],
                }
                for index, row in enumerate(self.config.rows)
            ]
        }


def _decimals(column: Column) -> int:
    options = column.value_format
    if options is None:
        return 3
    if options.format == "fixed":
        return options.to_fixed
    if options.format == "precision":
        return options.to_precision
    return 3
