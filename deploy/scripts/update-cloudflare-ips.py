#!/usr/bin/env python3
"""Fetch official HTTPS lists into a NEW candidate; never install or reload nginx."""
import argparse
from datetime import datetime, timezone
import hashlib
import ipaddress
from pathlib import Path
import ssl
import urllib.request

SOURCES = ("https://www.cloudflare.com/ips-v4", "https://www.cloudflare.com/ips-v6")


def parse_list(text, version):
    networks = []
    for line in text.strip().splitlines():
        network = ipaddress.ip_network(line.strip(), strict=True)
        if network.version != version or not network.is_global or network.prefixlen < (8 if version == 4 else 19):
            raise ValueError("unsafe or wrong-family network")
        if network in networks:
            raise ValueError("duplicate network")
        networks.append(network)
    if not 1 <= len(networks) <= 100:
        raise ValueError("unexpected network count")
    return networks


def render(v4, v6, checked_at):
    networks = parse_list(v4, 4) + parse_list(v6, 6)
    digest = hashlib.sha256((v4 + "\n" + v6).encode()).hexdigest()
    lines = ["# Official Cloudflare HTTPS lists; reviewed snapshot, no automatic reload.",
             "# Sources: " + " ".join(SOURCES), "# Checked: " + checked_at,
             "# Source SHA256: " + digest]
    lines += ["set_real_ip_from " + str(n) + ";" for n in networks]
    lines += ["geo $realip_remote_addr $tf_cloudflare_peer {", "    default 0;"]
    lines += ["    " + str(n) + " 1;" for n in networks]
    return "\n".join(lines + ["}", ""])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()
    context = ssl.create_default_context()
    values = []
    for url in SOURCES:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TraceFlow-Operations/1.0", "Accept": "text/plain"}), context=context, timeout=20) as response:
            if response.url != url:
                raise ValueError("unexpected redirect")
            data = response.read(16385)
            if len(data) > 16384:
                raise ValueError("oversize response")
            values.append(data.decode("ascii"))
    content = render(*values, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    with args.candidate.open("x") as target:
        target.write(content)
    print("Candidate created; review diff, test and authorize installation separately.")
