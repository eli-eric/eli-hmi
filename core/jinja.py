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

import hashlib
from functools import lru_cache
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


def asset_url(path: str, *, root: Path = STATIC_ROOT, versioned: bool = True) -> str:
    """The URL of a static file, named for what it holds.

    Quart serves static files to be kept for twelve hours, so a browser that
    has the stylesheet does not ask for it again — and after a change, a
    station renders new markup with old CSS until the cache runs out. A
    version taken from the content makes a changed file a new URL, fetched at
    once, while an unchanged one stays cached for as long as Quart says.

    Hashed once per version of the file on disk (its mtime and size), so a
    file edited under a running `make run` is a new URL on the next render
    and an unchanged one costs a `stat`.

    `versioned=False` for a URL that must match another byte for byte: a
    font preload is used only if it is the stylesheet's `url()` exactly.
    """
    url = f"{STATIC_URL}{path}"
    if not versioned:
        return url
    try:
        stat = (root / path.lstrip("/")).stat()
    except OSError:
        # Not there: the plain URL, and the 404 says why.
        return url
    return f"{url}?v={_content_version(root / path.lstrip('/'), stat.st_mtime_ns, stat.st_size)}"


@lru_cache(maxsize=64)
def _content_version(file: Path, _mtime_ns: int, _size: int) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()[:12]


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
    env.globals["static"] = asset_url
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
