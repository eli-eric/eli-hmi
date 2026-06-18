#!/bin/bash

set -euo pipefail

HARBOR_HOST="${HARBOR_HOST:-harbor.eli-beams.eu}"
HARBOR_PROJECT="${HARBOR_PROJECT:-lcs}"

docker login "https://${HARBOR_HOST}"

cd backend/python-websocket-server
docker build . -t ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-backend-python:latest
docker push ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-backend-python:latest
cd ../..

cd backend/mockup-websocket-server
docker build . -t ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-backend-mockup:latest
docker push ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-backend-mockup:latest
cd ../..

cd frontend
: "${NEXT_PUBLIC_ZONE_CODE:?set NEXT_PUBLIC_ZONE_CODE for production frontend builds}"
: "${NEXT_PUBLIC_API_URL:?set NEXT_PUBLIC_API_URL for production frontend builds}"
docker build . --build-arg NEXT_PUBLIC_ZONE_CODE=${NEXT_PUBLIC_ZONE_CODE} --build-arg NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} -t ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:latest
docker push ${HARBOR_HOST}/${HARBOR_PROJECT}/eli-hmi-frontend:latest
cd ..
