#!/usr/bin/env bash
# Future installation only. Does not change enforcement, firewalld or certificates.
# Build/install the explicitly reviewed policy; never generate audit2allow rules.
set -euo pipefail
if [[ $# != 1 || ( $1 != --plan && $1 != --apply ) ]]; then
  printf '%s\n' 'Usage: configure-selinux.sh --plan|--apply' >&2
  exit 2
fi
if [[ $1 == --plan ]]; then
  printf '%s\n' \
    'Install traceflow_nginx policy: httpd_t may connect to traceflow_api_port_t only.' \
    'Assign tcp/3001 locally to traceflow_api_port_t (OL9 default range is ntop_port_t).' \
    'Label only public dist/current paths httpd_sys_content_t; backend remains usr_t.' \
    'Existing httpd_can_network_connect/relay booleans are not changed.' \
    'Review port users and local SELinux customizations before --apply.'
  exit 0
fi
[[ $(id -u) == 0 && $(getenforce) == Enforcing ]] || exit 1
base=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
work=$(mktemp -d /tmp/traceflow-selinux.XXXXXXXX)
# Only the newly allocated build directory is removed, never runtime data.
trap 'rm -f -- "$work/traceflow_nginx.mod" "$work/traceflow_nginx.pp"; rmdir -- "$work"' EXIT
checkmodule -M -m -o "$work/traceflow_nginx.mod" "$base/selinux/traceflow_nginx.te"
semodule_package -o "$work/traceflow_nginx.pp" -m "$work/traceflow_nginx.mod"
# Refuse a pre-existing exact port customization owned by another service.
local_ports=$(semanage port -l -C)
if printf '%s\n' "$local_ports" | awk '$2 == "tcp" && $NF == "3001" && $1 != "traceflow_api_port_t" {found=1} END {exit !found}'; then
  printf '%s\n' 'REFUSED: tcp/3001 has a different local customization' >&2
  exit 1
fi
semodule -i "$work/traceflow_nginx.pp"
if ! printf '%s\n' "$local_ports" | awk '$1 == "traceflow_api_port_t" && $2 == "tcp" && $NF == "3001" {found=1} END {exit !found}'; then
  semanage port -a -t traceflow_api_port_t -p tcp 3001
fi
# -a refuses conflicting local definitions instead of silently replacing them.
# On a repeated install, verify the recorded type before accepting an existing rule.
ensure_context() {
  local expression=$1 type=$2 existing
  existing=$(semanage fcontext -l -C | awk -v path="$expression" '$1 == path {print $NF}')
  if [[ -n $existing ]]; then
    [[ $existing == *":$type:"* ]] || { printf '%s\n' 'REFUSED: conflicting local file context' >&2; exit 1; }
  else
    semanage fcontext -a -t "$type" "$expression"
  fi
}
ensure_context '/var/www/traceflow(/.*)?' httpd_sys_content_t
ensure_context '/opt/traceflow/releases/[^/]+/frontend/dist(/.*)?' httpd_sys_content_t
# Follow no symlinks; labels on each real dist are required separately at activation.
restorecon -R /var/www/traceflow
printf '%s\n' 'Policy installed. restorecon real release dist after packaging; verify ps -eZ, port context and AVCs.'
