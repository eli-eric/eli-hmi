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
import time
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
    env.globals["static"] = static_url
    return env


#: Files whose URL carries their own hash. Fonts do not: `@font-face` asks for
#: them by a fixed URL, and a preload must name exactly that URL or the browser
#: fetches the face twice.
VERSIONED = (".css", ".js")

#: A file modified this recently is hashed afresh rather than from the cache.
#: Linux stamps file times from a coarse clock that ticks every few
#: milliseconds, so a second edit within the same tick keeps the mtime, and if
#: it keeps the size too, stat cannot tell the two versions apart. Once the
#: mtime is this far in the past, any later edit gets a later timestamp, so
#: the cache is safe again. Git treats its index the same way ("racily clean").
RACY_NS = 2_000_000_000


def static_url(path: str, *, root: Path = STATIC_ROOT) -> str:
    """`/static/css/hmi.css?v=1a2b3c4d5e6f` — the URL of a static file, with a
    hash of its content for a stylesheet or a script.

    Static files are served with a twelve-hour cache. Without the hash, a
    browser that has the stylesheet keeps using it after a deploy has changed
    it, and the station shows today's markup in yesterday's styling until
    someone forces a reload. With it, a changed file is a new URL.

    The file is stat'ed on every call and hashed only when its size or mtime
    changed, so an edit in development is picked up on the next render. A file
    changed in the last two seconds is hashed every time (`RACY_NS`).
    """
    url = f"{STATIC_URL}{path}"
    if not path.endswith(VERSIONED):
        return url
    file = root / path.lstrip("/")
    try:
        stat = file.stat()
    except OSError:
        return url
    if time.time_ns() - stat.st_mtime_ns < RACY_NS:
        return f"{url}?v={_hash(file)}"
    return f"{url}?v={_digest(str(file), stat.st_mtime_ns, stat.st_size)}"


@lru_cache(maxsize=32)
def _digest(file: str, _mtime_ns: int, _size: int) -> str:
    return _hash(Path(file))


def _hash(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()[:12]


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
