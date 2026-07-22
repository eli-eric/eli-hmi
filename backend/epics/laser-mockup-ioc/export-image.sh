#!/usr/bin/env bash
set -euo pipefail

# Build and export a ready-to-share Docker image tarball.
# Usage: ./export-image.sh [image_tag] [output_tar_gz]

IMAGE_TAG="${1:-laser-mockup-ioc:ready}"
OUTPUT_FILE="${2:-laser-mockup-ioc-image.tar.gz}"
CHECKSUM_FILE="${OUTPUT_FILE}.sha256"
TMP_OUTPUT_FILE="${OUTPUT_FILE}.tmp"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Build using the compose file in this folder.
docker compose up --build -d

# Tag the compose-built image with a stable handoff tag.
docker image tag laser-mockup-ioc-laser-mockup-ioc:latest "$IMAGE_TAG"

# Export compressed image archive for transfer.
# Use a temp file + integrity check to avoid handing out partial archives.
rm -f "$TMP_OUTPUT_FILE"
docker save "$IMAGE_TAG" | gzip -c > "$TMP_OUTPUT_FILE"
gzip -t "$TMP_OUTPUT_FILE"
mv "$TMP_OUTPUT_FILE" "$OUTPUT_FILE"

sha256sum "$OUTPUT_FILE" > "$CHECKSUM_FILE"

echo "Exported image '$IMAGE_TAG' to '$OUTPUT_FILE'"
echo "Checksum written to '$CHECKSUM_FILE'"
