package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func rootHandler(c echo.Context) error {
	return c.HTML(http.StatusOK, renderRootDocsHTML())
}

func renderRootDocsHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mock-up EPICS WebSocket Gateway</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --line: #d8e0ea;
      --text: #122033;
      --muted: #4d5c72;
      --accent: #0b6b72;
      --accent-soft: #e6f4f3;
      --shadow: 0 20px 45px rgba(18, 32, 51, 0.08);
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(11, 107, 114, 0.12), transparent 24%),
        linear-gradient(180deg, #fbfcfe 0%, var(--bg) 100%);
    }

    main {
      width: min(1100px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 40px;
    }

    .hero,
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
    }

    .hero {
      padding: 28px;
      margin-bottom: 20px;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1,
    h2,
    p,
    ul,
    pre {
      margin: 0;
    }

    h1 {
      font-size: clamp(2rem, 4vw, 3.1rem);
      line-height: 1.05;
      margin-bottom: 12px;
    }

    h2 {
      font-size: 1.15rem;
      margin-bottom: 14px;
    }

    p,
    li {
      color: var(--muted);
      line-height: 1.6;
    }

    code {
      padding: 0.15rem 0.4rem;
      border-radius: 8px;
      background: #f0f4f9;
      color: var(--text);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.95em;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .panel {
      padding: 22px;
    }

    .panel-wide {
      margin-top: 20px;
    }

    ul {
      padding-left: 18px;
    }

    .endpoint-list,
    .flow-list {
      display: grid;
      gap: 10px;
    }

    .endpoint,
    .flow-step {
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fbfdff;
    }

    pre {
      overflow-x: auto;
      padding: 14px;
      border-radius: 14px;
      background: #0f1e2b;
      color: #eff6ff;
      line-height: 1.5;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.92rem;
    }

    a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 700;
    }

    a:hover {
      text-decoration: underline;
    }

    .muted-note {
      margin-top: 10px;
      font-size: 0.96rem;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Mock Backend</div>
      <h1>Mock-up EPICS WebSocket Gateway</h1>
      <p>A lightweight Go service that fakes an EPICS gateway for local development and frontend integration work. It mirrors the mock server README at the root path so a browser hit to <code>/</code> immediately shows what the API is, how it works, and how to use it.</p>
      <p class="muted-note">Default address: <code>http://localhost:8080</code></p>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>What it does</h2>
        <ul>
          <li>One simulator per unique PV, shared across all subscribers.</li>
          <li>Auto-generated values for <code>AI_</code>, <code>BI_</code>, and <code>SI_</code> style PVs.</li>
          <li>Manual overrides over REST or POST writes, broadcast immediately over WebSocket.</li>
          <li>Speaks the real gateway's batched JSON protocol (<code>subscribe</code> / <code>unsubscribe</code> by <code>subscription_id</code>, <code>detail</code> levels).</li>
          <li>Random sticky severity episodes (MINOR/MAJOR/INVALID) to exercise alarm styling.</li>
        </ul>
      </article>

      <article class="panel">
        <h2>Quick start</h2>
        <pre>go run .</pre>
        <p class="muted-note">The server listens on <code>localhost:8080</code>. Run with Docker if needed, but for day-to-day use the source run is usually enough.</p>
      </article>
    </section>

    <section class="panel panel-wide">
      <h2>Core endpoints</h2>
      <div class="endpoint-list">
        <div class="endpoint"><strong>GET /ws/pvs?auth=jwt_token_please</strong><br />WebSocket endpoint for subscribing to PV updates. Any non-empty auth token is accepted by the mock.</div>
        <div class="endpoint"><strong>GET /pv/:name/:value</strong><br />Developer convenience endpoint for forcing a PV value from the browser or curl.</div>
        <div class="endpoint"><strong>PUT /pv/:name</strong><br />Realistic write contract that simulates EPICS latency and occasional failures.</div>
        <div class="endpoint"><strong>POST /pv/:name</strong><br />Primary write endpoint used by the frontend for direct writes and command PV effects.</div>
        <div class="endpoint"><strong>GET /mode/:name/:value</strong><br />Switch prefix groups between auto-simulate mode (<code>1</code>) and manual mode (<code>2</code>).</div>
        <div class="endpoint"><strong>GET /mode/fail-rate/:n</strong> and <strong>GET /waveforms</strong><br />Mock-only helpers for L4 OPCPA demos.</div>
      </div>
    </section>

    <section class="grid panel-wide">
      <article class="panel">
        <h2>WebSocket usage</h2>
        <div class="flow-list">
          <div class="flow-step">1. Connect to <code>ws://localhost:8080/ws/pvs?auth=jwt_token_please</code> — the server greets with a <code>connected</code> frame.</div>
          <div class="flow-step">2. Send a subscribe frame such as:</div>
          <pre>{
  "type": "subscribe",
  "subscription_id": "fe-1",
  "pvs": ["AI_TEMP", "BI_DOOR"],
  "detail": "time"
}</pre>
          <div class="flow-step">3. Read the <code>subscribed</code> ack, one <code>snapshot</code> per PV, then <code>event</code> frames: <code>pv</code>, <code>value</code>, <code>ok</code>, and <code>metadata</code> (severity/status/timestamp at <code>time</code>, plus units at <code>control</code>).</div>
          <div class="flow-step">4. Stop a subscription with:</div>
          <pre>{
  "type": "unsubscribe",
  "subscription_id": "fe-1"
}</pre>
        </div>
      </article>

      <article class="panel">
        <h2>Manual override examples</h2>
        <pre>curl http://localhost:8080/pv/AI_TEMP/37.0
curl http://localhost:8080/pv/BI_DOOR/1
curl http://localhost:8080/mode/ai/2</pre>
        <p class="muted-note">If a PV prefix is in manual mode, the simulator stops drifting values for that prefix until you switch it back.</p>
      </article>
    </section>

    <section class="panel panel-wide">
      <h2>How it works</h2>
      <ul>
        <li>The first client that mentions a PV creates a global <code>pvSim</code> instance.</li>
        <li>That simulator owns the latest value, a ticker loop, and the subscriber list.</li>
        <li>On each tick, the current value is drifted when autosimulation is enabled and then broadcast to all subscribers.</li>
        <li>Independent of value modes, each PV randomly enters sticky severity episodes (MINOR/MAJOR/INVALID for 5–15&nbsp;s). Disable with <code>/mode/severity/2</code>.</li>
        <li>When the last subscriber disconnects, the simulator is removed from the registry.</li>
      </ul>
      <p class="muted-note">For deeper background, see the mock server README and docs in the repository. This page is intentionally a concise root-path overview.</p>
    </section>
  </main>
</body>
</html>`
}
