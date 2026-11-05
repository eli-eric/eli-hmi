#!/usr/bin/env bash
set -euo pipefail

# Build and export a ready-to-share Docker image tarball of the IOC.
#
# Worth doing for a colleague who has neither Python nor EPICS: the image is
# self-contained, and `load-and-run.sh` on their side needs only Docker. For
# anyone with Python, `python ioc/run_ioc.py` is the same IOC and needs no
# image at all.
#
# Usage: ./export-image.sh [image_tag] [output_tar_gz]

IMAGE_TAG="${1:-l4-opcpa-ioc:ready}"
OUTPUT_FILE="${2:-l4-opcpa-ioc-image.tar.gz}"
CHECKSUM_FILE="${OUTPUT_FILE}.sha256"
TMP_OUTPUT_FILE="${OUTPUT_FILE}.tmp"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Build using the compose file in this folder.
docker compose up --build -d

# Tag the compose-built image with a stable handoff tag.
docker image tag ioc-l4-opcpa-ioc:latest "$IMAGE_TAG"

# Export compressed image archive for transfer.
# Use a temp file + integrity check to avoid handing out partial archives.
rm -f "$TMP_OUTPUT_FILE"
docker save "$IMAGE_TAG" | gzip -c > "$TMP_OUTPUT_FILE"
gzip -t "$TMP_OUTPUT_FILE"
mv "$TMP_OUTPUT_FILE" "$OUTPUT_FILE"

sha256sum "$OUTPUT_FILE" > "$CHECKSUM_FILE"

echo "Exported image '$IMAGE_TAG' to '$OUTPUT_FILE'"
echo "Checksum written to '$CHECKSUM_FILE'"
