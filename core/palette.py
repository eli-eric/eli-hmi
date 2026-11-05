"""Which colour palette a screen is painted in.

The goggles worn in a laser hall filter the wavelengths the panel signals
trouble with, so an alarm obvious to the naked eye can be invisible to the
person standing at the machine. A palette changes what the tones look like —
never which tone applies, which is decided in `core.render.severity` and is
the same in every palette.

The choice belongs to the person at the workstation, not to the deployment, so
it lives in a cookie this server reads while rendering: no client-side storage
to synchronise and no JavaScript of our own. `PALETTE` remains the station
default, for a room that is always in goggles.
"""

from __future__ import annotations

#: id -> what the operator picks it by. The empty id is "no palette applied",
#: which is the absence of the attribute rather than a value of its own.
PALETTES: dict[str, str] = {
    "default": "No goggles",
    "l4-goggles": "L4 goggles",
}

DEFAULT_PALETTE = "default"

#: Set by the header selector; read on every render.
PALETTE_COOKIE = "palette"


def usable(value: str | None) -> str | None:
    """The palette to paint with, or `None` for the default.

    Anything unrecognised — a hand-edited cookie, an id from an older build,
    a `PALETTE` typo — is the default rather than an attribute nothing styles.
    """
    if not value:
        return None
    value = value.strip()
    if value == DEFAULT_PALETTE or value not in PALETTES:
        return None
    return value
