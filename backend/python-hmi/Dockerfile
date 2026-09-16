# One image, one process: the HMI and its EPICS gateway.
#
# The React app needed a Node build stage and shipped a bundler's output; there
# is nothing to build here, so the image is the source plus its dependencies.
# `ZONE_CODE` and `EPICS_BACKEND` are supplied at runtime by each deployment's
# compose file and are never baked in, so one image still serves every station
# (ADR-0012).
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

COPY app ./app
COPY config ./config

ENV ZONE_CODE=test \
    EPICS_BACKEND=aioca \
    HOST=0.0.0.0 \
    PORT=8082

EXPOSE 8082

# /health/ready reports 503 until the PV hub is up, so an orchestrator can tell
# "starting" from "serving".
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8082/health/ready').status == 200 else 1)"

CMD ["python", "-m", "app"]
