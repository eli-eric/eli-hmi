# Operator stations

The browser-locked machines in the control room that operators use day-to-day. Each station is locked to a single **zone** ([zones](../frontend/zones.md)).

## Station-level configuration

1. **Browser.** Chromium or Firefox in kiosk mode pointing at `http://<frontend-host>:8082/`. Kiosk config is the OS distribution's job; the HMI itself doesn't enforce it.
2. **Zone.** The one global frontend image is deployed with `ZONE_CODE=<station-zone>` and `CONFIG_DIR=/app/zone-config`; the station mounts its config checkout at that path read-only. Switching zones or changing config is a compose restart, not a rebuild — see [zones](../frontend/zones.md#runtime-not-build-time).
3. **Backend URL.** `API_URL=<backend-host>:<port>` in the same `docker-compose.yml`. The same host:port serves both the WebSocket (`/ws/pvs`) and the write endpoint (`/pv/<NAME>`).

## Adding a new station / zone

1. Decide which routes that station needs.
2. Add `zones/<station-zone>.yaml` to the config checkout. The filename stem is the zone code:

   ```yaml
   schemaVersion: 1
   navigationItems:
     - text: L4 OPCPA
       href: /l4-opcpa
   allowedRoutes:
     - /l4-opcpa
   modules:
     l4-opcpa:
       config: modules/l4-opcpa/lasers.yaml
     p3:
       config: modules/p3/config.yaml
     l3bt:
       config: modules/l3bt/config.yaml
     l4fbt:
       config: modules/l4fbt/config.yaml
   ```

   The first allowed route is the station home route. Every nav `href` must be
   allowed. Module references are validated even when their routes are not
   enabled; p3/l3bt/l4fbt bespoke bottom-row parts remain in the app image.

3. Add (or copy) a per-zone compose file under `deployments/zones/<zone-name>/docker-compose.yml` (see `deployments/zones/testz/docker-compose.yml`), setting:

   ```yaml
   environment:
     ZONE_CODE: l3bt-hall
     API_URL: epics-gateway.lcs.local:8080
     CONFIG_DIR: /app/zone-config
   volumes:
     - /opt/eli-hmi-config:/app/zone-config:ro
   ```

4. Validate the checkout from the matching app release: `npm run validate:config -- --dir /opt/eli-hmi-config --all`.
5. Deploy that compose file to the station — no image rebuild needed, since CI publishes one global `eli-hmi-frontend` image for every zone.

The repository currently carries only the `test` template. Creating the standalone controls-team config repository and choosing production zone names are follow-ups; do not treat example names above as assigned production identifiers.

## Production image in CI

`.gitlab-ci.yml` job `docker-build-job-frontend` builds the production frontend image from `frontend/Dockerfile` and publishes:

- `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:${CI_COMMIT_REF_SLUG}`
- `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:latest`

This job takes no zone/backend-specific build args — it is the same image regardless of deployment target. `ZONE_CODE`, `CONFIG_DIR`, and `API_URL` are supplied per station by Compose, not by CI. There is no built-in `production` zone: an unset code or a code without a matching YAML file exposes no module routes, and startup validation stops the production container with a readable error.

## Login

Operators authenticate via LDAP credentials. The dev bypass (`test`/`test`) only works because of a literal-string check in `ldap-auth.ts` — it is **not** disabled by `NODE_ENV=production`. Audit your build before shipping.

## When something breaks at the station

| Symptom                                                   | Likely cause                                                                     | First check                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend crash-loops or port is closed                    | Missing/invalid zone or module YAML, bad mount, or wrong `ZONE_CODE`              | Container logs; `CONFIG_DIR`; `zones/<ZONE_CODE>.yaml`; run `validate:config`                               |
| Login succeeds; nav bar empty                             | Zone has no `navigationItems`                                                     | Mounted `zones/<ZONE_CODE>.yaml`                                                                             |
| Login succeeds; clicking a link redirects to `/no-access` | Route not in `allowedRoutes` for the zone                                         | Same                                                                                                         |
| WebSocket spinner forever                                 | Backend unreachable or wrong host:port                                           | Station's `API_URL` (docker-compose env), network path to backend                                            |
| Backend reachable; readings show `<>` glyphs              | Subscribed PV doesn't exist on the backend                                       | Mock prefix conventions ([pv-naming](../reference/pv-naming.md)) or EPICS IOC reachability                   |
| Writes silently fail with error toast                     | Mock failure injection on, or write endpoint not yet implemented on prod backend | `curl http://<backend>/mode/fail-rate/0` (mock); [pv-write-endpoint](../backend/pv-write-endpoint.md) (prod) |

## Source-of-truth READMEs

- [frontend/README.md](../../frontend/README.md)
- [frontend/AGENTS.md](../../frontend/AGENTS.md)
