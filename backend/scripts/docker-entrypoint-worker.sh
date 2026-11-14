#!/bin/sh
set -eu
echo "Starting PMS BullMQ worker..."
exec node dist/worker.js
