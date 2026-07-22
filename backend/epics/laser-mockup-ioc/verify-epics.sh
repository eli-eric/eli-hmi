#!/usr/bin/env bash
set -euo pipefail

# Quick smoke test for the laser mockup IOC running in Docker.
# Usage: ./verify-epics.sh [container_name]

CONTAINER_NAME="${1:-laser-mockup-ioc}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Container '$CONTAINER_NAME' is not running."
  echo "Start it first with: docker compose up --build -d"
  exit 1
fi

if ! docker exec "$CONTAINER_NAME" sh -lc 'command -v caget >/dev/null 2>&1 && command -v caput >/dev/null 2>&1'; then
  echo "caget/caput not found inside container '$CONTAINER_NAME'."
  exit 1
fi

read_pv() {
  local pv="$1"
  docker exec "$CONTAINER_NAME" caget -t "$pv"
}

write_pv() {
  local pv="$1"
  local value="$2"
  docker exec "$CONTAINER_NAME" caput -t "$pv" "$value" >/dev/null
}

echo "== Read checks =="
echo -n "BI_NL2_CONN: "
read_pv "BI_NL2_CONN"

echo -n "AI_NL2_ATT: "
read_pv "AI_NL2_ATT"

echo -n "L4-NSOPCPA-NL1:PS1225:10:ErrorCode: "
read_pv "L4-NSOPCPA-NL1:PS1225:10:ErrorCode"

echo
echo "== Write checks =="
write_pv "BI_NL2_FULLP" "1"
echo -n "BI_NL2_FULLP after caput 1: "
read_pv "BI_NL2_FULLP"

write_pv "L4-NSOPCPA-NL1:PS5059:22:Ch1TriggeringDelay:SET" "55"
echo -n "L4-NSOPCPA-NL1:PS5059:22:Ch1TriggeringDelay after :SET 55: "
read_pv "L4-NSOPCPA-NL1:PS5059:22:Ch1TriggeringDelay"

echo
echo "EPICS smoke test passed."
