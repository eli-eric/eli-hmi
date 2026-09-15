# Convenience targets. Nothing here is required — the app is
# `python -m app` with a handful of environment variables.

ZONE_CODE ?= test
PORT ?= 8082

.PHONY: install install-epics install-dev install-ioc run run-demo run-epics run-ioc \
        ioc ioc-db ioc-verify test

install:
	pip install -r requirements.txt

install-epics:
	pip install -r requirements-epics.txt

install-dev:
	pip install -r requirements-dev.txt

# pythonSoftIOC — EPICS base as a wheel, so the local IOC needs nothing built.
install-ioc:
	pip install -r requirements-epics.txt -r ioc/requirements.txt

# Simulated EPICS, templates and config reloaded on refresh.
run:
	ZONE_CODE=$(ZONE_CODE) EPICS_BACKEND=sim DEV=1 PORT=$(PORT) python -m app

# Three lasers, to see the grid wrap.
run-demo:
	ZONE_CODE=demo EPICS_BACKEND=sim DEV=1 PORT=$(PORT) python -m app

# The real thing. Needs requirements-epics.txt and a reachable EPICS network.
run-epics:
	ZONE_CODE=$(ZONE_CODE) EPICS_BACKEND=aioca PORT=$(PORT) python -m app

# Against the local IOC (run `make ioc` in another shell first). The CA
# variables keep name resolution on the loopback instead of broadcasting to
# whatever network the machine happens to be on — which on site would find the
# real control system.
run-ioc:
	EPICS_CA_ADDR_LIST=127.0.0.1 EPICS_CA_AUTO_ADDR_LIST=NO \
	ZONE_CODE=ioc EPICS_BACKEND=aioca DEV=1 PORT=$(PORT) python -m app

# The local IOC itself: a real EPICS database, generated from the zone config.
ioc:
	python ioc/run_ioc.py

# Regenerate the database and the `ioc` zone after editing a zone file.
ioc-db:
	python ioc/generate.py --zone $(ZONE_CODE)

ioc-verify:
	EPICS_CA_ADDR_LIST=127.0.0.1 EPICS_CA_AUTO_ADDR_LIST=NO python ioc/verify.py

test:
	PYTHONPATH=. python -m pytest tests -q
