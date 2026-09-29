"""Jinja environment, and the one function that renders a widget.

The important property: `render_widget` is used by **both** the server-side
render of the whole page and every `patch-elements` event on the SSE stream.
There is no second implementation of a value cell for "the live version", which
is the failure mode this whole design avoids.

Templates are found in three places, searched in this order:

1. `core/templates/` — the page shell, the menu, the base layout.
2. `components/` — every component's own template and macros, addressed the way
   a component author would expect: `value/value.html`.
3. `components/templates/` — the shared readout macros, so a component can say
   `readouts.html` without knowing where it lives.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from jinja2 import ChoiceLoader, Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup

APP_ROOT = Path(__file__).resolve().parent.parent
CORE_TEMPLATES = APP_ROOT / "core" / "templates"
COMPONENTS_ROOT = APP_ROOT / "components"
SHARED_TEMPLATES = COMPONENTS_ROOT / "templates"
STATIC_ROOT = APP_ROOT / "core" / "static"
#: Where `core/static` is mounted (see `core.server.create_app`).
STATIC_URL = "/static"


def create_environment(*, auto_reload: bool = False) -> Environment:
    env = Environment(
        loader=ChoiceLoader(
            [
                FileSystemLoader(CORE_TEMPLATES),
                FileSystemLoader(COMPONENTS_ROOT),
                FileSystemLoader(SHARED_TEMPLATES),
            ]
        ),
        autoescape=select_autoescape(default_for_string=True, default=True),
        # StrictUndefined: a component that forgets a context key must fail
        # loudly in development rather than render an empty cell in a control
        # room.
        undefined=StrictUndefined,
        auto_reload=auto_reload,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    # Starlette's `url_for` is only available through its own Jinja integration,
    # and this app uses the environment directly (widgets render outside any
    # request). One mount point, one helper.
    env.globals["static"] = lambda path: f"{STATIC_URL}{path}"
    return env


class WidgetRenderer:
    """Renders widgets from whichever macro file declared them.

    A component's own macros win over the shared ones, so a component can add a
    shape the framework does not have without touching the framework — and
    without being able to break another component by picking the same name.
    """

    def __init__(self, env: Environment):
        self._env = env
        self._modules: dict[str, Any] = {}

    def _macros(self, template: str) -> Any:
        if self._env.auto_reload:
            return self._env.get_template(template).module
        module = self._modules.get(template)
        if module is None:
            module = self._env.get_template(template).module
            self._modules[template] = module
        return module

    def render(self, widget: Any, reader: Any) -> Markup:
        template, name = widget.macro
        macro = getattr(self._macros(template), name, None)
        if macro is None and template != "readouts.html":
            # Fall back to the shared library: a component declaring its own
            # macro file still gets `value_cell` and friends for free.
            macro = getattr(self._macros("readouts.html"), name, None)
        if macro is None:  # pragma: no cover - a typo in a component
            raise RuntimeError(
                f"widget {widget.id} wants macro {name!r}, which is defined "
                f"neither in {template} nor in readouts.html"
            )
        return Markup(macro(id=widget.id, show=widget.show, **widget.build(reader)))
