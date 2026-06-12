############################
# Builder stage            #
############################
FROM harbor.eli-beams.eu/proxy-dockerhub/golang:1.22-alpine AS builder
WORKDIR /app

# Copy module metadata and vendored dependencies first for better cache utilisation
COPY go.mod go.sum ./
COPY vendor ./vendor

# Copy source code
COPY . .

# Build using vendored modules so the image does not fetch dependencies at build time
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -mod=vendor -o ws-mockup-server .

############################
# Runtime stage            #
############################
FROM harbor.eli-beams.eu/proxy-dockerhub/alpine:latest AS runtime
WORKDIR /app
COPY --from=builder /app/ws-mockup-server ./ws-mockup-server

# Expose REST/WebSocket port

ENTRYPOINT ["./ws-mockup-server"]
