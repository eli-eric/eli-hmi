#!/bin/bash
set -euo pipefail

DB_FILE=/usr/EPICS/db/test.db

echo "Starting EPICS IOC with custom DB: ${DB_FILE}"
exec softIoc -d "${DB_FILE}"
