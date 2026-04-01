# EPICS Test Environment

This folder contains a lightweight EPICS IOC setup used for development and manual testing of the HMI against a real EPICS Channel Access environment.

The current implementation is intentionally simple:

- It builds `epics-base` from the bundled `base-7.0.8.tar.gz` archive.
- It starts a soft IOC inside a container.
- It loads one sample database file, `test.db`.

Today this is mainly a shared sandbox for backend and frontend integration work. Over time, this folder should evolve into a small library of reusable EPICS test scenarios, including UI-specific databases and example datasets.

## Current Contents

- `example-epics.Dockerfile`
  Builds a container image with `epics-base` and the sample IOC setup.
- `startup_script.sh`
  Starts the IOC and loads the configured database.
- `test.db`
  The current sample database with automatically changing scalar values and live waveform history.
- `Makefile`
  Convenience targets for building and running the image.

## Current Database

The current sample database is `test.db`.

It contains a basic set of soft records intended for general HMI testing:

- analog input records such as `AI_0` to `AI_19`
- binary input records such as `BI_0` onward
- one analog input example with extra metadata and alarm thresholds, currently `AI_1`

This makes it suitable for validating:

- websocket subscriptions
- simple PV reads
- display of units, precision, and limits
- alarm and severity visualization

The current database is no longer purely static.

- `AI_*` records use several motion patterns with different ranges, directions, and update rates.
- `BI_*` records toggle in groups with different scan rates and phases.
- `WF_*` records are generated as rolling history buffers fed from changing `AI_*` and `BI_*` sources.

This makes the IOC more useful for testing subscriptions, charts, alarm transitions, and widgets that expect values to evolve over time.

## Build And Run

Build the image:

```bash
make build-image
```

Run the IOC container:

```bash
make run-image
```

The `run-image` target uses `--network=host`, so the IOC is exposed directly on the host network. This is convenient for local development, because the Python websocket server and other tools can connect to it without extra Docker networking setup.

## How It Works

The container entrypoint is `startup_script.sh`, which currently runs:

```bash
exec softIoc -d /usr/EPICS/db/test.db
```

That means the active database is fixed to `test.db` today, and `softIoc` remains the main process in the container. If you change the database filename or want to support multiple scenarios, the startup script and image layout should be updated accordingly.

## Intended Direction

This folder should become the place for curated EPICS test environments, not just a single generic database.

Useful next steps are:

- keep a shared generic database for broad smoke testing
- add dedicated databases for specific UI modules or control screens
- add scenario-based databases for alarms, invalid states, disconnected PVs, and edge values
- separate static examples from dynamic or behavior-oriented test setups

## Suggested Structure For Future Growth

One reasonable direction is to move from a single `test.db` file to named scenarios, for example:

```text
backend/epics/
	db/
		common.db
		l3bt-controls.db
		l4fbt-controls.db
		p3-controls.db
		alarms.db
	startup/
		startup-common.sh
		startup-l3bt.sh
```

This would make it easier to:

- start only the PV set needed for one UI
- keep record names understandable and scoped
- avoid growing one database into an unmaintainable catch-all file
- document test scenarios in a predictable way

## Recommended Conventions

If more databases are added, prefer these conventions:

- use database names that match the UI or scenario they support
- keep shared PVs in a common database and feature-specific PVs in separate files
- document expected PVs and example values near each database
- keep alarm examples explicit instead of hiding thresholds inside unrelated records
- update startup scripts so selecting a scenario is simple and reproducible

## When To Add A New Database

Add a new database when:

- a specific UI needs its own realistic PV namespace
- one screen requires alarm or metadata behavior that does not belong in the generic test set
- a test scenario would become confusing if added to `test.db`

Keep using the shared database when:

- the goal is a quick smoke test
- the PVs are generic and reusable across screens
- the new records are broadly useful for multiple UIs

## Notes

- This setup is for development and testing, not production IOC deployment.
- The EPICS base archive is committed locally in this folder, so image builds do not depend on downloading EPICS during the build.
- If this directory grows, the next sensible refactor is to support selecting the database to load through environment variables or separate make targets.
