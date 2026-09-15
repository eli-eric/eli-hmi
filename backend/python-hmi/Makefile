# Convenience targets. Nothing here is required — the app is
# `python -m app` with a handful of environment variables.

ZONE_CODE ?= test
PORT ?= 8082

.PHONY: install install-epics install-dev run run-demo run-epics test lint

install:
	pip install -r requirements.txt

install-epics:
	pip install -r requirements-epics.txt

install-dev:
	pip install -r requirements-dev.txt

# Simulated EPICS, templates and config reloaded on refresh.
run:
	ZONE_CODE=$(ZONE_CODE) EPICS_BACKEND=sim DEV=1 PORT=$(PORT) python -m app

# Three lasers, to see the grid wrap.
run-demo:
	ZONE_CODE=demo EPICS_BACKEND=sim DEV=1 PORT=$(PORT) python -m app

# The real thing. Needs requirements-epics.txt and a reachable EPICS network.
run-epics:
	ZONE_CODE=$(ZONE_CODE) EPICS_BACKEND=aioca PORT=$(PORT) python -m app

test:
	PYTHONPATH=. python -m pytest tests -q
