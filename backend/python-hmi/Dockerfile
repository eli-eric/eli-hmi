# One image, one process: the HMI and its EPICS gateway.
#
# The React app needed a Node build stage and shipped a bundler's output; there
# is nothing to build here, so the image is the source plus its dependencies.
#
# Every zone is in the image and the station picks itself: `core.zones` matches
# the machine's hostname against each zone's `hostnames:` patterns. So one image
# serves every zone, and a deployment needs no per-zone configuration at all.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# EPICS by default: this image is the production target, and a station that
# cannot reach Channel Access should fail loudly rather than quietly show
# simulated numbers. Local development runs from a checkout, not from here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements-epics.txt ./
RUN pip install --no-cache-dir -r requirements-epics.txt

COPY core ./core
COPY components ./components
COPY zones ./zones

# No ZONE_CODE: a station works out which zone it is from its hostname, so one
# image serves every zone and nothing has to be set per deployment. Set it
# explicitly for a container whose hostname is not the station's.
ENV EPICS_BACKEND=aioca \
    HOST=0.0.0.0 \
    PORT=8082

EXPOSE 8082

# /health/ready reports 503 until the PV hub is up, so an orchestrator can tell
# "starting" from "serving".
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8082/health/ready').status == 200 else 1)"

CMD ["python", "-m", "core"]
