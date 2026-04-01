from __future__ import annotations

from html import escape
from pathlib import Path
import re


DOCS_PATH = Path(__file__).with_name("root_docs.md")


def _render_inline(text: str) -> str:
    escaped = escape(text)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: f'<a href="{escape(match.group(2), quote=True)}">{match.group(1)}</a>',
        escaped,
    )
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    return escaped


def render_markdown(markdown: str) -> str:
    lines = markdown.splitlines()
    parts: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        if stripped.startswith("```"):
            language = stripped[3:].strip()
            code_lines: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            language_attr = f' class="language-{escape(language, quote=True)}"' if language else ""
            code_text = escape("\n".join(code_lines))
            parts.append(f"<pre><code{language_attr}>{code_text}</code></pre>")
            if index < len(lines):
                index += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            level = len(heading.group(1))
            parts.append(f"<h{level}>{_render_inline(heading.group(2))}</h{level}>")
            index += 1
            continue

        if stripped.startswith("- "):
            items: list[str] = []
            while index < len(lines) and lines[index].strip().startswith("- "):
                items.append(f"<li>{_render_inline(lines[index].strip()[2:])}</li>")
                index += 1
            parts.append("<ul>" + "".join(items) + "</ul>")
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate or candidate.startswith("```") or candidate.startswith("- ") or re.match(r"^(#{1,6})\s+", candidate):
                break
            paragraph_lines.append(candidate)
            index += 1
        parts.append(f"<p>{_render_inline(' '.join(paragraph_lines))}</p>")

    return "\n".join(parts)


def _read_root_docs() -> str:
    return DOCS_PATH.read_text(encoding="utf-8")


def render_root_docs_html(*, enable_docs: bool) -> str:
    docs_html = render_markdown(_read_root_docs())
    docs_state = "enabled" if enable_docs else "disabled"
    return f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>ELI HMI EPICS Gateway</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #eef2f5;
      --panel: rgba(255, 255, 255, 0.9);
      --line: rgba(15, 23, 42, 0.08);
      --text: #0f172a;
      --muted: #475569;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --soft: rgba(15, 118, 110, 0.08);
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      font-family: Inter, system-ui, sans-serif;
    }}

    * {{ box-sizing: border-box; }}

    body {{
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, rgba(15, 118, 110, 0.18), transparent 25%),
        linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
      color: var(--text);
    }}

    .page {{
      width: min(1200px, 100%);
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }}

    .hero, .panel, .link-card {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }}

    .hero {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 24px;
      align-items: flex-start;
    }}

    .eyebrow {{
      display: inline-block;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent-strong);
    }}

    h1, h2, h3, p {{ margin: 0; }}

    h1 {{
      font-size: clamp(2rem, 3vw, 3rem);
      line-height: 1;
    }}

    .subtitle {{
      max-width: 52rem;
      margin-top: 10px;
      color: var(--muted);
      line-height: 1.6;
    }}

    .state-badge {{
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--soft);
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      flex-shrink: 0;
    }}

    .links {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
    }}

    .link-card {{
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 18px;
      text-decoration: none;
      color: inherit;
      transition: transform 150ms ease;
    }}

    .link-card:hover {{
      transform: translateY(-1px);
    }}

    .link-label {{
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }}

    .link-target {{
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--text);
      word-break: break-word;
    }}

    .link-hint {{
      color: var(--muted);
      line-height: 1.5;
      font-size: 0.95rem;
    }}

    .panel {{
      padding: 24px;
    }}

    .doc-body {{
      display: flex;
      flex-direction: column;
      gap: 14px;
      line-height: 1.6;
    }}

    .doc-body h1, .doc-body h2, .doc-body h3 {{
      color: var(--text);
    }}

    .doc-body h1 {{ font-size: 1.9rem; }}
    .doc-body h2 {{ font-size: 1.3rem; margin-top: 0.5rem; }}
    .doc-body h3 {{ font-size: 1.05rem; margin-top: 0.25rem; }}

    .doc-body p, .doc-body li {{
      color: var(--text);
    }}

    .doc-body ul {{
      margin: 0;
      padding-left: 1.4rem;
    }}

    .doc-body a {{
      color: var(--accent-strong);
      text-decoration: none;
      font-weight: 700;
    }}

    .doc-body a:hover {{
      text-decoration: underline;
    }}

    .doc-body code {{
      padding: 0.15rem 0.4rem;
      border-radius: 8px;
      background: var(--soft);
      color: var(--accent-strong);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.92em;
    }}

    .doc-body pre {{
      margin: 0;
      padding: 14px;
      border-radius: 14px;
      background: #0f172a;
      overflow-x: auto;
    }}

    .doc-body pre code {{
      padding: 0;
      background: transparent;
      color: #e2e8f0;
    }}

    @media (max-width: 760px) {{
      .page {{ padding: 14px; }}
      .hero {{ flex-direction: column; }}
    }}
  </style>
</head>
<body>
  <main class=\"page\">
    <section class=\"hero\">
      <div>
        <span class=\"eyebrow\">API Overview</span>
        <h1>ELI HMI EPICS Gateway</h1>
        <p class=\"subtitle\">
          Root landing page for the API service. Use it as the first stop for
          endpoint discovery, quick examples, health checks, and internal diagnostics.
        </p>
      </div>
      <span class=\"state-badge\">Docs {docs_state}</span>
    </section>

    <section class=\"links\">
      <a class=\"link-card\" href=\"/docs\">
        <span class=\"link-label\">Interactive API Docs</span>
        <span class=\"link-target\">/docs</span>
        <span class=\"link-hint\">Swagger UI for the OpenAPI surface.</span>
      </a>
      <a class=\"link-card\" href=\"/redoc\">
        <span class=\"link-label\">Reference Docs</span>
        <span class=\"link-target\">/redoc</span>
        <span class=\"link-hint\">ReDoc view of the same API schema.</span>
      </a>
      <a class=\"link-card\" href=\"/stats/ui\">
        <span class=\"link-label\">Diagnostics UI</span>
        <span class=\"link-target\">/stats/ui</span>
        <span class=\"link-hint\">Internal dashboard with live runtime stats.</span>
      </a>
      <a class=\"link-card\" href=\"/stats\">
        <span class=\"link-label\">Diagnostics JSON</span>
        <span class=\"link-target\">/stats</span>
        <span class=\"link-hint\">Programmatic snapshot of connections and monitors.</span>
      </a>
      <a class=\"link-card\" href=\"/health/live\">
        <span class=\"link-label\">Liveness</span>
        <span class=\"link-target\">/health/live</span>
        <span class=\"link-hint\">Basic process liveness check.</span>
      </a>
      <a class=\"link-card\" href=\"/health/ready\">
        <span class=\"link-label\">Readiness</span>
        <span class=\"link-target\">/health/ready</span>
        <span class=\"link-hint\">Readiness state for serving traffic.</span>
      </a>
    </section>

    <section class=\"panel\">
      <div class=\"doc-body\">
        {docs_html}
      </div>
    </section>
  </main>
</body>
</html>
"""
