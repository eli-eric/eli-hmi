# Laser IOC Image Handoff

You can share a ready-to-run Docker image without requiring your colleague to build EPICS.

## Producer side (you)

1. Build and export image archive:

   ./export-image.sh

2. Send both generated files to your colleague:
   - `laser-mockup-ioc-image.tar.gz`
   - `laser-mockup-ioc-image.tar.gz.sha256`

## Consumer side (colleague)

1. Place the archive in this folder.
2. Load and run:

   ./load-and-run.sh

3. Optional smoke test:

   ./verify-epics.sh

## Notes

- This avoids build-time dependencies on colleague machines.
- `load-and-run.sh` verifies gzip integrity and checksum (if `.sha256` is present).
- Committing large image archives to Git is usually not recommended; use artifact storage or container registry when possible.
