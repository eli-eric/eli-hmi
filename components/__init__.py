"""Reusable components — the vocabulary a screen is written in.

A controls engineer building a screen picks components and configures them in
YAML under `zones/`. Nobody has to open this folder to add a screen. You open
it to add a new *kind* of thing a screen can show.

    panel        a titled box that groups other components
    value        one row: label, reading, optional buttons and setpoint
    group        several related bits as one pill that expands into a list
    grid         a table of readings: devices down, quantities across
    tally        a count of PVs per state, expanding into the per-PV detail
    motor        a motor: position, setpoint, jog, stop, limits
    valve        a valve: state and open/close
    laser-panel  the L4 OPCPA laser column (the one bespoke screen)

Each is a folder with a Python file and a template. Importing this package
imports all of them, which is how they register themselves — there is no list of
components to keep in step with the folder.

To add one, copy `valve/` (the smallest) and read `core/components.py`.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _import_all() -> None:
    """Import every component package, so `@register` runs for each.

    Folders without an `__init__.py` (the shared `templates/` directory) are
    skipped, so a component author can keep templates and fixtures beside their
    code without them being mistaken for components.
    """
    for module in pkgutil.iter_modules([str(_HERE)]):
        if not module.ispkg:
            continue
        if not (_HERE / module.name / "__init__.py").is_file():
            continue
        importlib.import_module(f"{__name__}.{module.name}")


_import_all()
