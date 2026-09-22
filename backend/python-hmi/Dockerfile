# One image, one process: the HMI and its EPICS gateway.
#
# The React app needed a Node build stage and shipped a bundler's output; there
# is nothing to build here, so the image is the source plus its dependencies.
#
# Every zone is in the image and the station picks itself: `core.zones` matches
# the machine's hostname against each zone's `hostnames:` patterns. So one image
# serves every zone, and a deployment needs no per-zone configuration at all.
#
# Dependencies come from uv.lock, installed with `--locked`: the build fails if
# the lockfile and pyproject.toml disagree, rather than quietly resolving
# something else. Two zones running "the same version" then means the same
# dependency tree, down to the patch.
FROM python:3.12-slim

# uv itself, from its own published image — no pip bootstrap, no version drift.
COPY --from=ghcr.io/astral-sh/uv:0.9.29 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Copy packages into the image rather than symlinking them into uv's cache,
    # which does not exist at runtime.
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    # The interpreter is the one in this image; uv must not fetch another.
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# `aioca` (the `epics` extra) brings `epicscorelibs`, which has wheels for
# linux/amd64 — the compilers are here for the architectures where it does not.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, as their own layer: the lockfile changes far less often
# than a screen does, so editing a zone's YAML does not reinstall EPICS.
# `--no-install-project` because the project itself is copied in below.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project --extra epics

COPY core ./core
COPY components ./components
COPY zones ./zones

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --extra epics

# No ZONE_CODE: a station works out which zone it is from its hostname, so one
# image serves every zone and nothing has to be set per deployment. Set it
# explicitly for a container whose hostname is not the station's.
#
# EPICS by default: this image is the production target, and a station that
# cannot reach Channel Access should fail loudly rather than quietly show
# simulated numbers. Local development runs from a checkout, not from here.
#
# No SESSION_SECRET either, and the app refuses to start without one (unless
# DEV=1) — a key baked into an image is a key every zone shares.
ENV EPICS_BACKEND=aioca \
    HOST=0.0.0.0 \
    PORT=8082

EXPOSE 8082

# /health/ready reports 503 until the PV hub is up, so an orchestrator can tell
# "starting" from "serving".
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8082/health/ready').status == 200 else 1)"

# Hypercorn, configured in `core.server.serve_config` — one place that knows
# the stream must not be closed as idle between heartbeats.
CMD ["python", "-m", "core"]
