#!/usr/bin/env bash
# Syntax only, never reload. A complete staged config and disposable certs may be used.
set -euo pipefail
if [[ $# != 2 || $1 != /* || $2 != /* || ! -d $1 || ! -f $2 ]]; then
  printf '%s\n' 'Usage: validate-nginx.sh ABSOLUTE_PREFIX ABSOLUTE_MAIN_CONFIG' >&2
  exit 2
fi
nginx -t -p "$1/" -c "$2"
