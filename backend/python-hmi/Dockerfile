# One image, one process: the HMI and its EPICS gateway.
#
# The React app needed a Node build stage and shipped a bundler's output; there
# is nothing to build here, so the image is the source plus its dependencies.
#
# Every zone is in the image and the station picks itself: `core.zones` matches
# the machine's hostname against each zone's `hostnames:` patterns. So one image
# serves every zone, and a deployment needs no per-zone configuration at all.
#
# Dependencies are resolved against the internal mirror (see below), so this
# build does not install the committed lockfile verbatim: a `default` index
# changes the resolution, and `uv sync` runs without `--locked`. Versions
# already pinned are kept wherever the mirror offers them, but "the same
# version of the image" no longer guarantees the lockfile's dependency tree.

# Through Harbor's pull-through proxy, like every other image in this repo: a
# build runner has no route to docker.io.
FROM harbor.eli-beams.eu/proxy-dockerhub/python:3.12-slim

# uv itself, from the internal PyPI mirror rather than from uv's own published
# image: `ghcr.io` is a registry this network does not proxy, and the mirror is
# already the only route to packages here.
#
# Unpinned on purpose — a pinned version is only as good as the mirror's copy
# of it, and a build that fails because the mirror never cached 0.9.29 is worse
# than one that resolves dependencies with a newer uv. The cost is that two
# builds of the same commit can use different uv versions; with `uv sync`
# running unlocked below, the image's dependency tree already depends on when
# it was built.
RUN pip install --no-cache-dir \
    --index-url https://pypi-mirror.eli-beams.eu/root/pypi/+simple/ \
    --trusted-host pypi-mirror.eli-beams.eu \
    uv

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

# Packages come from the internal devpi mirror: a build runner has no route to
# pypi.org. Appended here rather than committed to pyproject.toml, so a
# checkout still resolves from PyPI — which is what a developer has, and what
# `make test` uses.
#
# `[tool.uv]` is declared here and nowhere else — TOML cannot reopen a table,
# so a second one in pyproject.toml would make the file unparseable. Nothing is
# lost by its absence there: `package` defaults to true for a project that has
# a `[build-system]`, which this one does.
RUN cat >> pyproject.toml <<'EOF'
[tool.uv]
allow-insecure-host = ["pypi-mirror.eli-beams.eu"]

[[tool.uv.index]]
name = "devpi"
url = "https://pypi-mirror.eli-beams.eu/root/pypi/+simple/"
default = true
EOF

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-install-project --extra epics

COPY core ./core
COPY components ./components
COPY zones ./zones

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --extra epics

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
