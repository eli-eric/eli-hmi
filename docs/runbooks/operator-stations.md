# Operator stations

The browser-locked machines in the control room that operators use day-to-day. Each station is locked to a single **zone** ([zones](../frontend/zones.md)).

## Station-level configuration

1. **Browser.** Chromium or Firefox in kiosk mode pointing at `http://<frontend-host>:8082/`. Kiosk config is the OS distribution's job; the HMI itself doesn't enforce it.
2. **Zone.** The frontend bundle deployed to that station is built with `NEXT_PUBLIC_ZONE_CODE=<station-zone>` (e.g. `e3`, `l3bt-hall`, `p3-hall`). Switching zones requires a rebuild — `NEXT_PUBLIC_*` is baked at build time.
3. **Backend URL.** `NEXT_PUBLIC_API_URL=<backend-host>:<port>` baked into the same build. The same host:port serves both the WebSocket (`/ws/pvs`) and the write endpoint (`/pv/<NAME>`).

## Adding a new station / zone

1. Decide which routes that station needs.
2. Add a zone entry in `frontend/src/lib/settings/zone-config.ts`:

   ```ts
   'l3bt-hall': {
     navigationItems: [
       { text: 'L3BT', href: '/l3bt-controls' },
     ],
     allowedRoutes: ['/l3bt-controls'],
   }
   ```

3. Build the frontend with that zone:

   ```bash
   docker build \
     --build-arg NEXT_PUBLIC_ZONE_CODE=l3bt-hall \
     --build-arg NEXT_PUBLIC_API_URL=epics-gateway.lcs.local:8080 \
     -t harbor.eli-beams.eu/.../eli-hmi-frontend:l3bt-hall ...
   ```

4. Deploy that image to the station.

## Production image in CI

`.gitlab-ci.yml` job `docker-build-job-frontend` builds the production frontend image from `frontend/Dockerfile` and publishes:

- `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:${CI_COMMIT_REF_SLUG}`
- `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:latest`

That job expects these CI variables to be set:

- `NEXT_PUBLIC_ZONE_CODE`
- `NEXT_PUBLIC_API_URL`

Without `NEXT_PUBLIC_ZONE_CODE`, the frontend can build into the intentionally empty `production` zone and ship with no accessible routes.

The shipped `production` zone in `zone-config.ts` is **intentionally empty** — see [zones](../frontend/zones.md#production-override).

## Login

Operators authenticate via LDAP credentials. The dev bypass (`test`/`test`) only works because of a literal-string check in `ldap-auth.ts` — it is **not** disabled by `NODE_ENV=production`. Audit your build before shipping.

## When something breaks at the station

| Symptom                                                   | Likely cause                                                                     | First check                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Login succeeds; nav bar empty                             | Zone has no `navigationItems`                                                    | `zone-config.ts` for the station's zone                                                                      |
| Login succeeds; clicking a link redirects to `/no-access` | Route not in `allowedRoutes` for the zone                                        | Same                                                                                                         |
| WebSocket spinner forever                                 | Backend unreachable or wrong host:port                                           | `NEXT_PUBLIC_API_URL` baked in, network path to backend                                                      |
| Backend reachable; readings show `<>` glyphs              | Subscribed PV doesn't exist on the backend                                       | Mock prefix conventions ([pv-naming](../reference/pv-naming.md)) or EPICS IOC reachability                   |
| Writes silently fail with error toast                     | Mock failure injection on, or write endpoint not yet implemented on prod backend | `curl http://<backend>/mode/fail-rate/0` (mock); [pv-write-endpoint](../backend/pv-write-endpoint.md) (prod) |

## Source-of-truth READMEs

- [frontend/README.md](../../frontend/README.md)
- [frontend/AGENTS.md](../../frontend/AGENTS.md)
