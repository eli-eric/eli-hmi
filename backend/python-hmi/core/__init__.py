"""The framework: how a zone's YAML becomes a live screen in a browser.

You rarely need to come in here. Adding a screen is a folder under `zones/`;
adding a new kind of thing a screen can show is a folder under `components/`.

    zones.py        the folder layout, hostname -> zone, GUI discovery
    components.py   the component contract: Config, setup(), pv_specs()
    page.py         a screen: full render, and the patch for a change
    routes.py       page / stream / write endpoints
    server.py       start-up: resolve the zone, seed the simulator, warm the cache
    epics/          monitors, cache, the simulator, aioca
    render/         severity -> tone, readouts, number formats
    jinja.py        template search path and the widget renderer
"""
