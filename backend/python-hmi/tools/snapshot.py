"""Render every screen of a zone as a self-contained static page.

Why this exists: the app's output is HTML pushed over a live stream, which makes
it awkward to look at without a running IOC and a browser on the same network.
`python tools/snapshot.py` freezes one render of each screen — values and all —
into a folder of plain files that open anywhere, so a layout can be reviewed,
diffed against the React page, or sent to someone for comment.

    python tools/snapshot.py --zone TESTZ --out /tmp/snapshot

The stream is removed (`data-init`), so nothing tries to connect and the page
stays exactly as it was rendered. Everything else — the markup, the stylesheet,
the tones — is byte-for-byte what an operator's browser receives.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zone", default=os.environ.get("ZONE_CODE", "TESTZ"))
    ap.add_argument("--out", default="snapshot", type=Path)
    args = ap.parse_args()

    os.environ["ZONE_CODE"] = args.zone
    os.environ.setdefault("EPICS_BACKEND", "sim")

    from fastapi.testclient import TestClient

    from core.server import create_app

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    static = HERE / "core" / "static"
    shutil.copytree(static / "css", out / "css", dirs_exist_ok=True)

    app = create_app()
    pages: list[tuple[str, str]] = []
    with TestClient(app) as client:
        stats = client.get("/stats").json()
        for slug, screen in stats["screens"].items():
            html = client.get(f"/{slug}").text
            # No stream, no vendored JS: a frozen page, and one less thing that
            # has to resolve for it to open from a file:// URL.
            html = re.sub(r'\s*data-init="[^"]*"', "", html)
            html = re.sub(r'\s*<script[^>]*></script>', "", html)
            html = html.replace('href="/static/css/hmi.css"', 'href="css/hmi.css"')
            (out / f"{slug}.html").write_text(html)
            pages.append((slug, screen["title"]))
            print(f"{out / (slug + '.html')}  ({len(html)} bytes)")

    index = out / "index.html"
    links = "\n".join(
        f'    <li><a href="{slug}.html">{title}</a></li>' for slug, title in pages
    )
    index.write_text(
        "<!doctype html>\n<html><head><meta charset='utf-8'>"
        f"<title>{args.zone} screens</title></head><body>\n"
        f"  <h1>zone {args.zone}</h1>\n  <ul>\n{links}\n  </ul>\n</body></html>\n"
    )
    print(index)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
