# Operator stations

The browser-locked machines in the control room that operators use day-to-day. Each station is locked to a single **zone** ([zones](../frontend/zones.md)).

## Station-level configuration

1. **Browser.** Chromium or Firefox in kiosk mode pointing at `http://<frontend-host>:8082/`. Kiosk config is the OS distribution's job; the HMI itself doesn't enforce it.
2. **Zone.** The one global frontend image is deployed with `ZONE_CODE=<station-zone>`. The config ships inside the image, so there is no mount. Pointing a station at a *different existing zone* is a compose restart; changing config *content* is a PR and a redeploy — see [zones](../frontend/zones.md#one-image-every-station).
3. **Backend URL.** `API_URL=<backend-host>:<port>` in the same `docker-compose.yml`. The same host:port serves both the WebSocket (`/ws/pvs`) and the write endpoint (`/pv/<NAME>`).

## Adding a new station / zone

1. Decide which module pages that station needs.
2. Add the zone to `frontend/config/global.yaml`. The key is the zone code:

   ```yaml
   zones:
     l3bt-hall:
       title: L3BT Hall
       modules:
         - { key: l3bt, text: L3BT Controls }   # first entry = home route
         - { key: p3 }                          # reachable, hidden from the menu
   ```

   Routes are not written here — they come from the `MODULES` registry, so the
   menu cannot point at a page the zone did not enable.

3. Add that station's config for **every** module it enables:

   ```
   frontend/src/app/(modules)/l3bt-controls/config/zones/l3bt-hall.yaml
   frontend/src/app/(modules)/p3-controls/config/zones/l3bt-hall.yaml
   ```

   There is **no fallback to a shared default** — a missing file fails the
   build. That is deliberate: a new station silently coming up on another
   station's PV names would be worse. Copy the nearest existing zone's file and
   edit its PVs.

4. Add (or copy) a per-zone compose file under
   `deployments/zones/<zone-name>/docker-compose.yml` (see
   `deployments/zones/testz/docker-compose.yml`), setting:

   ```yaml
   environment:
     ZONE_CODE: l3bt-hall
     API_URL: epics-gateway.lcs.local:8080
   ```

5. Validate before opening the PR — this is also what `next build` runs, so a
   failure here is a failure in CI:

   ```bash
   cd frontend && npm run validate:config
   ```

   It prints the full zone → module → file resolution, which is how you confirm
   a station gets the config you think it does.

6. Merge, let CI publish the image, then deploy that compose file to the
   station.

The repository currently carries only the `test` zone. Production zone names
have not been chosen — do not treat example names above as assigned production
identifiers.

## Production image in CI

`.gitlab-ci.yml` job `docker-build-job-frontend` builds the production frontend image from `frontend/Dockerfile` and publishes:

- `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:${CI_COMMIT_REF_SLUG}`
- `${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:latest`

This job takes no zone-specific build args — it is the same image regardless of deployment target. `ZONE_CODE` and `API_URL` are supplied per station by Compose, not by CI. There is no built-in `production` zone: an unset or unknown code exposes no module routes. The container does **not** exit in that case; it logs the error with the list of valid zones and serves `/no-access`, because a crash-loop behind `restart: unless-stopped` looks like a dead port. Broken config never reaches a container — `validate:config` runs as `prebuild`, so it fails CI.

## Login

Operators authenticate via LDAP credentials. The dev bypass (`test`/`test`) only works because of a literal-string check in `ldap-auth.ts` — it is **not** disabled by `NODE_ENV=production`. Audit your build before shipping.

## When something breaks at the station

| Symptom                                                   | Likely cause                                                                     | First check                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Every page redirects to `/no-access`; nav bar empty       | `ZONE_CODE` unset or naming no zone                                              | Container logs — the startup line names the valid zones; then the station's `ZONE_CODE`                      |
| One link redirects to `/no-access`                        | That module is not in the zone's `modules:` list                                  | `frontend/config/global.yaml`                                                                                |
| A page shows an error instead of readings                 | That module's config for this zone is invalid                                     | `npm run validate:config` in the app repo (it should have failed the build)                                  |
| WebSocket spinner forever                                 | Backend unreachable or wrong host:port                                           | Station's `API_URL` (docker-compose env), network path to backend                                            |
| Backend reachable; readings show `<>` glyphs              | Subscribed PV doesn't exist on the backend                                       | Mock prefix conventions ([pv-naming](../reference/pv-naming.md)) or EPICS IOC reachability                   |
| Writes silently fail with error toast                     | Mock failure injection on, or write endpoint not yet implemented on prod backend | `curl http://<backend>/mode/fail-rate/0` (mock); [pv-write-endpoint](../backend/pv-write-endpoint.md) (prod) |

## Source-of-truth READMEs

- [frontend/README.md](../../frontend/README.md)
- [frontend/AGENTS.md](../../frontend/AGENTS.md)
