"""Jinja environment, and the one function that renders a widget.

The important property here is that `render_widget` is used by **both** paths:
the server-side render of the whole page, and each Datastar `patch-elements`
event on the SSE stream. There is no second implementation of a value cell for
"the live version", which is the failure mode this whole rewrite exists to
avoid — in the React app the markup lived in TSX and the gateway shipped JSON,
so the two could never drift; here they could, unless one function owns it.
"""

from __future__ import annotations

from pathlib import Path
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
#: Where `app/static` is mounted (see `main.create_app`).
STATIC_URL = "/static"


def create_environment(*, auto_reload: bool = False) -> Environment:
    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(default_for_string=True, default=True),
        # StrictUndefined: a widget context that forgets a key must fail loudly
        # in development rather than render an empty cell in a control room.
        undefined=StrictUndefined,
        auto_reload=auto_reload,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    # Starlette's `url_for` is only available through its own Jinja integration,
    # and this app uses the environment directly (widgets are rendered outside
    # any request). One mount point, one helper.
    env.globals["static"] = lambda path: f"{STATIC_URL}{path}"
    return env


class WidgetRenderer:
    """Renders widgets from a macro file.

    The macro module is rebuilt per render when `auto_reload` is on (so template
    edits show up on refresh) and cached otherwise — a macro-only template body
    is just function definitions, so this is cheap either way.
    """

    def __init__(self, env: Environment, template_name: str):
        self._env = env
        self._template_name = template_name
        self._module: Any = None

    def _macros(self) -> Any:
        if self._env.auto_reload or self._module is None:
            module = self._env.get_template(self._template_name).module
            if not self._env.auto_reload:
                self._module = module
            return module
        return self._module

    def render(self, widget: Any, reader: Any) -> Markup:
        macro = getattr(self._macros(), widget.macro, None)
        if macro is None:  # pragma: no cover - a typo in a Widget definition
            raise RuntimeError(
                f"Widget {widget.id} wants macro '{widget.macro}', which "
                f"{self._template_name} does not define"
            )
        return Markup(macro(id=widget.id, show=widget.show, **widget.build(reader)))
