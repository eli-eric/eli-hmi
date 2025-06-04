#!/bin/bash

docker login https://harbor.eli-beams.eu

cd backend/mockup-websocket-server
docker build . -t harbor.eli-beams.eu/lcs/eli-hmi-backend-mockup:latest
docker push harbor.eli-beams.eu/lcs/eli-hmi-backend-mockup:latest
cd ../..

cd frontend
docker build . -t harbor.eli-beams.eu/lcs/eli-hmi-frontend:latest
docker push harbor.eli-beams.eu/lcs/eli-hmi-frontend:latest
cd ..
