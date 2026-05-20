from __future__ import annotations


def render_stats_dashboard_html() -> str:
    return """<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>EPICS Gateway Stats</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef2f5;
      --panel: rgba(255, 255, 255, 0.9);
      --panel-strong: #ffffff;
      --line: rgba(15, 23, 42, 0.08);
      --text: #0f172a;
      --muted: #475569;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --warn: #b91c1c;
      --soft: rgba(15, 118, 110, 0.08);
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      font-family: Inter, system-ui, sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, rgba(15, 118, 110, 0.18), transparent 25%),
        linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
      color: var(--text);
    }

    .page {
      width: min(1400px, 100%);
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .hero,
    .panel,
    .metric,
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 24px;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent-strong);
    }

    h1, h2, h3, p {
      margin: 0;
    }

    h1 {
      font-size: clamp(2rem, 3vw, 3rem);
      line-height: 1;
    }

    .subtitle {
      max-width: 52rem;
      margin-top: 10px;
      color: var(--muted);
      line-height: 1.5;
    }

    .hero-side {
      min-width: 220px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }

    .meta-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .meta-value {
      font-size: 15px;
      color: var(--text);
    }

    button {
      border: 0;
      border-radius: 999px;
      padding: 12px 16px;
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.7;
      cursor: progress;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
    }

    .metric {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .metric-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .metric-value {
      font-size: 30px;
      font-weight: 800;
    }

    .metric-note {
      color: var(--muted);
      font-size: 14px;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
      gap: 16px;
    }

    .panel {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }

    .section-copy {
      color: var(--muted);
      margin-top: 6px;
      line-height: 1.5;
    }

    .stack,
    .grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .card {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }

    .title {
      font-size: 16px;
      font-weight: 800;
      word-break: break-word;
    }

    .text {
      color: var(--muted);
      line-height: 1.45;
    }

    .badge,
    .tag {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
    }

    .badge {
      padding: 6px 10px;
      background: var(--accent-strong);
      color: #fff;
      flex-shrink: 0;
    }

    .tag {
      padding: 6px 10px;
      background: var(--soft);
      color: var(--accent-strong);
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .group-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    pre {
      margin: 0;
      padding: 12px;
      border-radius: 14px;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-x: auto;
    }

    .pre-muted {
      background: rgba(15, 23, 42, 0.06);
      color: var(--text);
    }

    .empty,
    .error {
      padding: 14px;
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.05);
      color: var(--muted);
    }

    .error {
      background: rgba(185, 28, 28, 0.1);
      color: var(--warn);
    }

    .banner {
      display: none;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(185, 28, 28, 0.18);
      background: rgba(185, 28, 28, 0.08);
      color: var(--warn);
    }

    .banner.visible {
      display: block;
    }

    @media (max-width: 980px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .page {
        padding: 14px;
      }

      .hero {
        flex-direction: column;
      }

      .hero-side {
        min-width: 0;
        width: 100%;
        align-items: flex-start;
      }

      button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main class=\"page\">
    <section class=\"hero\">
      <div>
        <span class=\"eyebrow\">Internal Diagnostics</span>
        <h1>EPICS gateway runtime stats</h1>
        <p class=\"subtitle\">
          Live snapshot of websocket connections, shared monitors, active
          subscriptions, and cached monitor values. This page is served directly
          by the API process and refreshes itself periodically.
        </p>
      </div>
      <div class=\"hero-side\">
        <div>
          <div class=\"meta-label\">Last updated</div>
          <div class=\"meta-value\" id=\"last-updated\">Never</div>
        </div>
        <button id=\"refresh-button\" type=\"button\">Refresh now</button>
      </div>
    </section>

    <section class=\"banner\" id=\"error-banner\"></section>

    <section class=\"metrics\" id=\"metrics\"></section>

    <section class=\"layout\">
      <section class=\"panel\">
        <div>
          <h2>Connections</h2>
          <p class=\"section-copy\">Subscriptions grouped by websocket client.</p>
        </div>
        <div class=\"stack\" id=\"connections\"></div>
      </section>

      <section class=\"panel\">
        <div>
          <h2>Monitors</h2>
          <p class=\"section-copy\">Shared PV monitors and their cached latest value.</p>
        </div>
        <div class=\"grid\" id=\"monitors\"></div>
      </section>
    </section>
  </main>

  <script>
    const POLL_INTERVAL_MS = 5000;
    const metricsRoot = document.getElementById('metrics');
    const connectionsRoot = document.getElementById('connections');
    const monitorsRoot = document.getElementById('monitors');
    const errorBanner = document.getElementById('error-banner');
    const lastUpdated = document.getElementById('last-updated');
    const refreshButton = document.getElementById('refresh-button');

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatTimestamp(date) {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: 'short'
      }).format(date);
    }

    function formatPreview(value) {
      if (value === undefined) {
        return 'n/a';
      }

      const text = JSON.stringify(value, null, 2);
      if (!text) {
        return 'n/a';
      }

      return text.length > 180 ? `${text.slice(0, 177)}...` : text;
    }

    function setError(message) {
      if (!message) {
        errorBanner.textContent = '';
        errorBanner.classList.remove('visible');
        return;
      }

      errorBanner.textContent = message;
      errorBanner.classList.add('visible');
    }

    function renderMetrics(stats) {
      const items = [
        ['Gateway state', stats.ready ? 'Ready' : 'Starting', 'Backend readiness flag'],
        ['Connections', stats.active_connections, 'Open websocket clients'],
        ['Shared monitors', stats.active_monitors, 'Unique PV monitor registrations'],
        ['Client subscriptions', stats.total_client_subscriptions, 'Per-connection subscriptions'],
        ['Subscriber refs', stats.total_subscribers, 'Monitor to subscriber links']
      ];

      metricsRoot.innerHTML = items.map(([label, value, note]) => `
        <article class=\"metric\">
          <div class=\"metric-label\">${escapeHtml(label)}</div>
          <div class=\"metric-value\">${escapeHtml(value)}</div>
          <div class=\"metric-note\">${escapeHtml(note)}</div>
        </article>
      `).join('');
    }

    function renderConnections(stats) {
      if (!stats.connections.length) {
        connectionsRoot.innerHTML = '<div class=\"empty\">No active websocket connections.</div>';
        return;
      }

      connectionsRoot.innerHTML = stats.connections.map((connection) => `
        <article class=\"card\">
          <div class=\"row\">
            <div>
              <div class=\"title\">${escapeHtml(connection.connection_id)}</div>
              <div class=\"text\">
                ${escapeHtml(connection.subscription_count)}
                subscription${connection.subscription_count === 1 ? '' : 's'}
              </div>
            </div>
            <span class=\"badge\">${escapeHtml(connection.subscription_count)}</span>
          </div>
          ${connection.subscriptions.map((subscription) => `
            <section class=\"card\" style=\"box-shadow:none;background:rgba(15,23,42,0.03);\">
              <div class=\"row\">
                <div class=\"title\">${escapeHtml(subscription.subscription_id)}</div>
                <span class=\"tag\">${escapeHtml(subscription.detail)}</span>
              </div>
              <div class=\"text\">
                ${escapeHtml(subscription.monitor_count)} monitor
                ${subscription.monitor_count === 1 ? '' : 's'} · timeout
                ${escapeHtml(subscription.timeout ?? 'default')}
              </div>
              <div class=\"tags\">${subscription.pvs.map((pv) => `<span class=\"tag\">${escapeHtml(pv)}</span>`).join('')}</div>
            </section>
          `).join('')}
        </article>
      `).join('');
    }

    function renderMonitors(stats) {
      if (!stats.monitors.length) {
        monitorsRoot.innerHTML = '<div class=\"empty\">No active monitors.</div>';
        return;
      }

      monitorsRoot.innerHTML = stats.monitors.map((monitor) => `
        <article class=\"card\">
          <div class=\"row\">
            <div>
              <div class=\"title\">${escapeHtml(monitor.pv_name)}</div>
              <div class=\"text\">
                ${escapeHtml(monitor.detail)} · datatype
                ${escapeHtml(monitor.datatype ?? 'native')} · count
                ${escapeHtml(monitor.count)}
              </div>
            </div>
            <span class=\"badge\">${escapeHtml(monitor.subscriber_count)}</span>
          </div>
          <div class=\"tags\">
            <span class=\"tag\">timeout: ${escapeHtml(monitor.timeout ?? 'default')}</span>
            <span class=\"tag\">updates: ${escapeHtml(monitor.all_updates ? 'all' : 'coalesced')}</span>
            <span class=\"tag\">disconnect notify: ${escapeHtml(monitor.notify_disconnect ? 'on' : 'off')}</span>
          </div>
          <div>
            <div class=\"group-label\">Subscribers</div>
            <div class=\"tags\" style=\"margin-top:8px;\">
              ${monitor.subscribers.map((subscriber) => `
                <span class=\"tag\">
                  ${escapeHtml(subscriber.connection_id)}:${escapeHtml(subscriber.subscription_id)}
                </span>
              `).join('')}
            </div>
          </div>
          <div>
            <div class=\"group-label\">Cached value</div>
            <div style=\"margin-top:8px;\">${renderMonitorValue(monitor)}</div>
          </div>
        </article>
      `).join('');
    }

    function renderMonitorValue(monitor) {
      if (!monitor.last_value) {
        return '<div class=\"empty\">No cached value yet.</div>';
      }

      if (!monitor.last_value.ok) {
        return `<div class=\"error\">${escapeHtml(monitor.last_value.error?.message ?? 'Monitor error')}</div>`;
      }

      const metadata = monitor.last_value.metadata && Object.keys(monitor.last_value.metadata).length > 0
        ? `<pre class=\"pre-muted\">${escapeHtml(formatPreview(monitor.last_value.metadata))}</pre>`
        : '';

      return `<pre>${escapeHtml(formatPreview(monitor.last_value.value))}</pre>${metadata}`;
    }

    async function refreshStats() {
      refreshButton.disabled = true;
      try {
        const response = await fetch('/stats', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error ?? payload?.message ?? 'Failed to load gateway stats');
        }

        renderMetrics(payload);
        renderConnections(payload);
        renderMonitors(payload);
        lastUpdated.textContent = formatTimestamp(new Date());
        setError('');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load gateway stats');
      } finally {
        refreshButton.disabled = false;
      }
    }

    refreshButton.addEventListener('click', () => {
      void refreshStats();
    });

    void refreshStats();
    window.setInterval(() => {
      void refreshStats();
    }, POLL_INTERVAL_MS);
  </script>
</body>
</html>
"""
