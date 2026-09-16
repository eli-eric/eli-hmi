# Convenience targets. Nothing here is required — the app is `python -m core`
# with a handful of environment variables.

ZONE_CODE ?= TESTZ
PORT ?= 8082

.PHONY: snapshot install install-epics install-dev install-ioc \
        run run-zone run-epics run-ioc ioc ioc-db ioc-verify \
        components test

install:
	pip install -r requirements.txt

install-epics:
	pip install -r requirements-epics.txt

install-dev:
	pip install -r requirements-dev.txt

# pythonSoftIOC — EPICS base as a wheel, so the local IOC needs nothing built.
install-ioc:
	pip install -r requirements-epics.txt -r ioc/requirements.txt

# The development zone against the built-in simulator. Templates reload on
# refresh, so editing a screen's YAML or a component's template is a reload.
run:
	ZONE_CODE=$(ZONE_CODE) EPICS_BACKEND=sim DEV=1 PORT=$(PORT) python -m core

# Another zone, e.g. `make run-zone ZONE_CODE=01`.
run-zone: run

# The real control system. Needs requirements-epics.txt and a reachable
# network; the zone comes from the hostname unless ZONE_CODE says otherwise.
run-epics:
	EPICS_BACKEND=aioca PORT=$(PORT) python -m core

# Against the local IOC (run `make ioc` in another shell first). The CA
# variables keep name resolution on the loopback instead of broadcasting to
# whatever network the machine happens to be on — which on site would find the
# real control system.
run-ioc:
	EPICS_CA_ADDR_LIST=127.0.0.1 EPICS_CA_AUTO_ADDR_LIST=NO \
	ZONE_CODE=$(ZONE_CODE)-IOC EPICS_BACKEND=aioca DEV=1 PORT=$(PORT) python -m core

# The local IOC itself: a real EPICS database, generated from what the zone's
# components declare about their PVs.
ioc:
	python ioc/run_ioc.py --db ioc/db/$(shell echo $(ZONE_CODE) | tr A-Z a-z).db

# Regenerate the database and the <ZONE>-IOC zone after editing a screen.
ioc-db:
	python ioc/generate.py --zone $(ZONE_CODE)

ioc-verify:
	EPICS_CA_ADDR_LIST=127.0.0.1 EPICS_CA_AUTO_ADDR_LIST=NO \
	python ioc/verify.py --zone $(ZONE_CODE)-IOC

# What a screen can be built out of, and one line about each.
components:
	@python -c "from core.components import registry; \
	rows = sorted(registry().items()); \
	[print(f'{name:14s} {cls.summary}') for name, cls in rows]"

# Freeze one render of every screen as plain HTML, for a layout review without
# a running IOC (see tools/snapshot.py).
snapshot:
	python tools/snapshot.py --zone $(ZONE_CODE) --out snapshot

test:
	python -m pytest tests -q
