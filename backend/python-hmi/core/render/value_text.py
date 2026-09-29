"""Turning a raw PV value into the words shown for it.
Port of `components/hmi/laser-panel/value-text.ts`.

Boolean indicators report 1 and 0; a column of bare digits asks the operator to
remember what each bit means for each signal. The panel translates them, with
the config having the final say (`values:` in the YAML), because what a bit
means is domain knowledge that belongs beside the PV rather than in a widget.
"""

from __future__ import annotations

from typing import Any, Mapping

#: Default for a subsystem that is running or not.
ON_OFF_TEXT: Mapping[str, str] = {"0": "OFF", "1": "ON"}
#: Default for a permission / ready flag, matching the MSS overall pill.
YES_NO_TEXT: Mapping[str, str] = {"0": "NO", "1": "YES"}


def display_value(
    value: Any,
    values: Mapping[str, str] | None = None,
    defaults: Mapping[str, str] | None = None,
) -> str | None:
    """`values` from the config wins, then the caller's default, then the raw
    value itself. Falling through to the raw value is deliberate: a "boolean"
    that one day reports 7 must stay visible rather than vanish.

    Returns ``None`` when there is no value to show — a different thing from a
    value with no wording; the caller renders its own placeholder.
    """
    if value is None:
        return None
    raw = _stringify(value)
    if values and raw in values:
        return values[raw]
    if defaults and raw in defaults:
        return defaults[raw]
    return raw


def _stringify(value: Any) -> str:
    # A bit read as a float arrives as 1.0; the config keys it as "1".
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)
