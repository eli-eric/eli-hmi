"""`$(NAME)` in a component's YAML, from that component's own `macros:`.

A device's PVs share a start: every PV of a laser but its MSS begins
`L4-OPCPA-NL2:`. Writing that out on every line is how one line comes to name
the wrong laser, so a component can say it once:

    - component: laser-panel
      macros: {P: L4-OPCPA-NL2}
      pvs:
        fullPower: $(P):FullPower

The spelling is EPICS's own, as in a display file or a substitutions file. A
name without a macro is a full name, so a PV that lives elsewhere (the MSS)
needs no setting to say so.

Expanded in every string value of the block, however deeply nested — PVs,
commands, labels — before the component's config is validated, so no
component needs to know which of its fields are PV names. Mapping keys are
left alone. A component's macros are its own: nested components do not
inherit them.
"""

from __future__ import annotations

import re
from typing import Any

#: A macro's name: what `$(...)` can spell.
NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
#: One reference, `$(NAME)`.
REFERENCE = re.compile(r"\$\((" + NAME.pattern + r")\)")


class MacroError(ValueError):
    """A `macros:` block or a `$(...)` that cannot be used as written."""


def checked(macros: Any) -> dict[str, str]:
    """A component's `macros:` block, refused unless every entry is usable.

    A value is text, exactly as typed: YAML reads `22` as a number and `1:30`
    as ninety, and a macro that is part of a PV name cannot be either.
    """
    if macros is None:
        return {}
    if not isinstance(macros, dict):
        raise MacroError(f"macros: should map names to text, not {type(macros).__name__}")
    for name, value in macros.items():
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise MacroError(
                f"macros: {name!r} cannot be used — a name is a letter or _ "
                "followed by letters, digits or _, as $(NAME) spells it"
            )
        if not isinstance(value, str):
            raise MacroError(
                f"macros: {name} reads as {value!r}, not text — quote it "
                f"({name}: \"...\") so it is exactly what was typed"
            )
    return macros


def expand(value: Any, macros: dict[str, str]) -> Any:
    """`value` with every `$(NAME)` in its strings replaced by its macro."""
    if isinstance(value, str):
        expanded = REFERENCE.sub(lambda match: _lookup(match.group(1), macros), value)
        if "$(" in REFERENCE.sub("", value):
            raise MacroError(
                f"{value!r} has a $( that is not a reference — write $(NAME), "
                "NAME a letter or _ followed by letters, digits or _"
            )
        return expanded
    if isinstance(value, dict):
        return {key: expand(item, macros) for key, item in value.items()}
    if isinstance(value, list):
        return [expand(item, macros) for item in value]
    return value


def _lookup(name: str, macros: dict[str, str]) -> str:
    if name in macros:
        return macros[name]
    defined = ", ".join(sorted(macros)) or "none"
    raise MacroError(f"$({name}) is not defined (this component's macros: {defined})")
