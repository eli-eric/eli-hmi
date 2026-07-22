#!/usr/bin/env bash
set -euo pipefail

# Load a shared image tarball and run the IOC via image-only compose.
# Usage: ./load-and-run.sh [image_archive] [image_tag]

IMAGE_ARCHIVE="${1:-laser-mockup-ioc-image.tar.gz}"
IMAGE_TAG="${2:-laser-mockup-ioc:ready}"
CHECKSUM_FILE="${IMAGE_ARCHIVE}.sha256"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "$IMAGE_ARCHIVE" ]]; then
  echo "Image archive '$IMAGE_ARCHIVE' not found."
  exit 1
fi

if [[ "$IMAGE_ARCHIVE" == *.gz ]]; then
  if ! gzip -t "$IMAGE_ARCHIVE"; then
    echo "Archive '$IMAGE_ARCHIVE' is corrupted or incomplete (gzip test failed)."
    echo "Re-export on producer side and re-transfer the file."
    exit 1
  fi
fi

if [[ -f "$CHECKSUM_FILE" ]]; then
  if ! sha256sum -c "$CHECKSUM_FILE"; then
    echo "Checksum verification failed for '$IMAGE_ARCHIVE'."
    echo "Re-transfer the archive and checksum file, or re-export on producer side."
    exit 1
  fi
else
  echo "Warning: checksum file '$CHECKSUM_FILE' not found; continuing without checksum verification."
fi

docker load -i "$IMAGE_ARCHIVE"

LASER_IOC_IMAGE="$IMAGE_TAG" docker compose -f docker-compose.image.yml up -d

echo "Container started from image '$IMAGE_TAG'"
