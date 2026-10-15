#!/bin/sh
set -eu
# No shell tracing, environment loading, credential arguments or production fallback.
exec python3 "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/backup.py" "$@"
