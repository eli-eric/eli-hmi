# Convenience targets. Nothing here is required — the app is
# `uv run python -m core` with a handful of environment variables.
#
# Dependencies and the virtualenv are uv's job: every target below runs through
# `uv run`, which creates .venv from uv.lock if it is missing and updates it if
# pyproject.toml changed. There is no "activate the venv first" step, and no
# way to run against a half-installed one.

ZONE_CODE ?= TESTZ
PORT ?= 8082

# `uv run` for the app (simulator only) and for anything touching EPICS. The
# extras are declared in pyproject.toml; naming them here means a target
# installs exactly what it needs and nothing else.
UV ?= uv
RUN = $(UV) run
RUN_EPICS = $(UV) run --extra epics
RUN_IOC = $(UV) run --extra epics --extra ioc

.PHONY: install install-epics install-ioc lock upgrade \
        run run-zone run-epics run-ioc ioc ioc-db ioc-verify \
        components snapshot test

# Not usually needed — `uv run` syncs on its own — but useful to warm the venv
# before going offline, or to see what would be installed.
install:
	$(UV) sync

install-epics:
	$(UV) sync --extra epics

install-ioc:
	$(UV) sync --extra epics --extra ioc

# Resolve dependencies and write uv.lock. Commit the result: two zones running
# "the same version" has to mean the same dependency tree.
lock:
	$(UV) lock

# Move the pins forward deliberately, as a reviewable diff.
upgrade:
	$(UV) lock --upgrade

# The development zone against the built-in simulator. Templates reload on
# refresh, so editing a screen's YAML or a component's template is a reload.
# DEV=1 also turns on the built-in test/test account and generates a session
# key, so there is nothing to configure before signing in.
run:
	ZONE_CODE=$(ZONE_CODE) EPICS_BACKEND=sim DEV=1 PORT=$(PORT) $(RUN) python -m core

# Another zone, e.g. `make run-zone ZONE_CODE=01`.
run-zone: run

# The real control system. Needs a reachable network; the zone comes from the
# hostname unless ZONE_CODE says otherwise. No DEV here, so it wants
# SESSION_SECRET and LDAP_SERVER_URL — see the auth section of README.md. It
# says which one is missing and stops.
run-epics:
	EPICS_BACKEND=aioca PORT=$(PORT) $(RUN_EPICS) python -m core

# Against the local IOC (run `make ioc` in another shell first). The CA
# variables keep name resolution on the loopback instead of broadcasting to
# whatever network the machine happens to be on — which on site would find the
# real control system.
run-ioc:
	EPICS_CA_ADDR_LIST=127.0.0.1 EPICS_CA_AUTO_ADDR_LIST=NO \
	ZONE_CODE=$(ZONE_CODE)-IOC EPICS_BACKEND=aioca DEV=1 PORT=$(PORT) $(RUN_EPICS) python -m core

# The local IOC itself: a real EPICS database, generated from what the zone's
# components declare about their PVs.
ioc:
	$(RUN_IOC) python ioc/run_ioc.py --db ioc/db/$(shell echo $(ZONE_CODE) | tr A-Z a-z).db

# Regenerate the database and the <ZONE>-IOC zone after editing a screen.
ioc-db:
	$(RUN) python ioc/generate.py --zone $(ZONE_CODE)

ioc-verify:
	EPICS_CA_ADDR_LIST=127.0.0.1 EPICS_CA_AUTO_ADDR_LIST=NO \
	$(RUN_EPICS) python ioc/verify.py --zone $(ZONE_CODE)-IOC

# What a screen can be built out of, and one line about each.
components:
	@$(RUN) python -c "from core.components import registry; \
	rows = sorted(registry().items()); \
	[print(f'{name:14s} {cls.summary}') for name, cls in rows]"

# Freeze one render of every screen as plain HTML, for a layout review without
# a running IOC (see tools/snapshot.py).
snapshot:
	$(RUN) python tools/snapshot.py --zone $(ZONE_CODE) --out snapshot

test:
	$(RUN) --group dev python -m pytest
