#!/usr/bin/env bash
# No daemon-reload/start/enable. Verify both files as one service contract.
set -euo pipefail
if [[ $# != 1 || $1 != /* || ! -d $1 ]]; then
  printf '%s\n' 'Usage: validate-systemd.sh ABSOLUTE_UNIT_DIRECTORY' >&2
  exit 2
fi
systemd-analyze verify "$1/traceflow-api.service" "$1/traceflow-github-worker.service"
