"""Numeric display format and engineering units.

Ports `lib/utils/pv-helpers.ts` (`getFormattedValue`), `lib/websocket/format.ts`
and `lib/websocket/units.ts`. The resolution order is unchanged, because it is
the answer to "who decides how this number looks" and operators rely on it:

format:  config  ->  component fallback  ->  DEFAULT_VALUE_FORMAT (3 decimals)
units:   config  ->  the PV's own EGU metadata  ->  component fallback
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

ValueFormat = Literal["exponential", "precision", "fixed", "raw"]


@dataclass(frozen=True)
class ValueFormatOptions:
    format: ValueFormat = "fixed"
    to_exponential: int = 2
    to_precision: int = 3
    to_fixed: int = 3


#: Applied when neither the config nor a call site says otherwise.
DEFAULT_VALUE_FORMAT = ValueFormatOptions(format="fixed", to_fixed=3)
#: Whole numbers, as-is — for readouts that were never rounded (trigger delay).
RAW_FORMAT = ValueFormatOptions(format="raw")


#: Bounds from `value-format-schema.ts`, enforced here for the same reason: a
#: `toFixed: -1` that passes validation becomes a `ValueError` inside
#: `format_value` at render time, which takes down the page and every open SSE
#: stream. Config mistakes belong to start-up, not to a control room.
_FIELD_BOUNDS = {
    "toExponential": (0, 100),
    "toPrecision": (1, 100),
    "toFixed": (0, 100),
}


def _bounded(raw: dict[str, Any], key: str, default: int) -> int:
    if key not in raw:
        return default
    value = raw[key]
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{key} must be a whole number")
    low, high = _FIELD_BOUNDS[key]
    if not low <= value <= high:
        raise ValueError(f"{key} must be between {low} and {high}, got {value}")
    return value


def parse_format(raw: Any) -> ValueFormatOptions | None:
    """Config -> options. Accepts the bare-number shorthand (`regenTemp: 1`
    means one decimal place) as well as the full mapping, matching
    `value-format-schema.ts`.
    """
    if raw is None:
        return None
    if isinstance(raw, bool):
        raise ValueError("format must be a number of decimals or a mapping")
    # `2.0` is an integer as far as YAML and `Number.isInteger` are concerned,
    # and the zod schema accepts it; rejecting it here would fail a file the
    # React app loaded.
    if isinstance(raw, float) and raw.is_integer():
        raw = int(raw)
    if isinstance(raw, int):
        if not 0 <= raw <= 100:
            raise ValueError(f"decimal places must be between 0 and 100, got {raw}")
        return ValueFormatOptions(format="fixed", to_fixed=raw)
    if isinstance(raw, dict):
        unknown = sorted(set(raw) - {"format", *_FIELD_BOUNDS})
        if unknown:
            raise ValueError(f"unknown key(s) {', '.join(unknown)}")
        name = raw.get("format")
        if name not in ("exponential", "precision", "fixed", "raw"):
            raise ValueError(f"unknown format {name!r}")
        defaults = ValueFormatOptions()
        return ValueFormatOptions(
            format=name,
            to_exponential=_bounded(raw, "toExponential", defaults.to_exponential),
            to_precision=_bounded(raw, "toPrecision", defaults.to_precision),
            to_fixed=_bounded(raw, "toFixed", defaults.to_fixed),
        )
    raise ValueError(f"format must be a number or a mapping, got {type(raw).__name__}")


def resolve_format(
    config: ValueFormatOptions | None = None,
    fallback: ValueFormatOptions | None = None,
) -> ValueFormatOptions:
    return config or fallback or DEFAULT_VALUE_FORMAT


def format_value(value: float | int | None, options: ValueFormatOptions | None = None) -> str:
    """`getFormattedValue` — including its `N/A`, which callers reach only when
    they have not already replaced a missing value with a placeholder.
    """
    if value is None:
        return "N/A"
    opts = options or DEFAULT_VALUE_FORMAT
    if opts.format == "exponential":
        return _js_exponential(float(value), opts.to_exponential)
    if opts.format == "precision":
        return _to_precision(float(value), opts.to_precision)
    if opts.format == "fixed":
        return f"{float(value):.{opts.to_fixed}f}"
    return _raw(value)


def _raw(value: float | int) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _to_precision(value: float, digits: int) -> str:
    """`Number.prototype.toPrecision` semantics: significant digits, switching
    to exponential when the fixed form would misrepresent the magnitude.
    """
    if value == 0:
        return f"{0:.{max(digits - 1, 0)}f}"
    exponent = math.floor(math.log10(abs(value)))
    if exponent < -6 or exponent >= digits:
        return _js_exponential(value, max(digits - 1, 0))
    decimals = max(digits - 1 - exponent, 0)
    return f"{value:.{decimals}f}"


def _js_exponential(value: float, digits: int) -> str:
    """`Number.prototype.toExponential` spells the exponent without padding —
    `1.23e+5`, where Python writes `1.23e+05`. Zones that ask for exponential
    output would otherwise read differently from the page they replace.
    """
    text = f"{value:.{digits}e}"
    mantissa, _, exponent = text.partition("e")
    sign, digits_part = exponent[0], exponent[1:].lstrip("0") or "0"
    return f"{mantissa}e{sign}{digits_part}"


def usable(unit: str | None) -> str | None:
    """Blank/whitespace-only counts as "not specified", not as an empty unit."""
    if unit is None:
        return None
    stripped = unit.strip()
    return stripped or None


def resolve_units(
    config: str | None = None,
    metadata: str | None = None,
    fallback: str | None = None,
) -> str | None:
    return usable(config) or usable(metadata) or usable(fallback)
