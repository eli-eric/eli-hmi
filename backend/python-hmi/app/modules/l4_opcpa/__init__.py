"""L4 OPCPA operator page — the module ported from
`frontend/src/app/(modules)/l4-opcpa`.
"""

from app.modules.l4_opcpa.config import ConfigError, LaserSpec, load_laser_specs
from app.modules.l4_opcpa.view import L4OpcpaView

__all__ = ["ConfigError", "L4OpcpaView", "LaserSpec", "load_laser_specs"]
