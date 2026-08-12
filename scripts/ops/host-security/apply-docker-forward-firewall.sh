#!/usr/bin/env bash
set -euo pipefail

readonly CHAIN='GIRO-HOST-FILTER'
readonly IPTABLES="${IPTABLES:-iptables}"

external_interface="$(ip route show default | awk 'NR == 1 { print $5 }')"

if [[ -z "${external_interface}" ]]; then
  echo 'Unable to determine the default external interface.' >&2
  exit 1
fi

if ! "${IPTABLES}" -nL DOCKER-USER >/dev/null 2>&1; then
  echo 'Docker-managed DOCKER-USER chain is unavailable.' >&2
  exit 1
fi

if ! "${IPTABLES}" -nL "${CHAIN}" >/dev/null 2>&1; then
  "${IPTABLES}" -N "${CHAIN}"
fi

while "${IPTABLES}" -C DOCKER-USER -j "${CHAIN}" >/dev/null 2>&1; do
  "${IPTABLES}" -D DOCKER-USER -j "${CHAIN}"
done
"${IPTABLES}" -I DOCKER-USER 1 -j "${CHAIN}"

"${IPTABLES}" -F "${CHAIN}"
"${IPTABLES}" -A "${CHAIN}" -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
"${IPTABLES}" -A "${CHAIN}" -i "${external_interface}" -p tcp -m multiport --dports 80,443 -j RETURN
"${IPTABLES}" -A "${CHAIN}" -i "${external_interface}" -j DROP
"${IPTABLES}" -A "${CHAIN}" -j RETURN
