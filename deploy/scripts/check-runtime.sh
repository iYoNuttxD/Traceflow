#!/usr/bin/env bash
# Read-only local diagnostics: no environment dump, journal contents, DB or mutations.
set -euo pipefail
if [[ $# != 0 ]]; then exit 2; fi
failed=0
for service in traceflow-api.service traceflow-github-worker.service; do
  systemctl show "$service" --property=ActiveState,SubState,Result,NRestarts,User,Group,MainPID
  systemctl is-active --quiet "$service" || failed=1
done
for endpoint in live ready; do
  # Never redirects; never prints a response body or uses proxy environment variables.
  curl --noproxy '*' --proto '=http' --connect-timeout 2 --max-time 5 --fail --silent --show-error \
    --output /dev/null --write-out "$endpoint HTTP %{http_code}\n" \
    "http://127.0.0.1:3001/health/$endpoint" || failed=1
done
printf '%s\n' 'Process health is not worker heartbeat. Use authorized sync/status as documented.'
exit "$failed"
