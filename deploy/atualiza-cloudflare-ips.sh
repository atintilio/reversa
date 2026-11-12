#!/usr/bin/env bash
# Baixa as faixas de IP OFICIAIS do Cloudflare e gera deploy/cloudflare-ips.caddy.
# Rode na VPS antes de subir com Caddyfile.cloudflare e repita de tempos em tempos (cron mensal).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
{ curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4; echo; curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6; } | tr -d '\r' | grep -E '^[0-9a-fA-F:.]+/[0-9]+$' > "$tmp"
n="$(wc -l < "$tmp")"
if [ "$n" -lt 10 ]; then echo "ERRO: so $n faixas baixadas; nao vou sobrescrever." >&2; exit 1; fi
{ echo "# Gerado em $(date -u +%FT%TZ) a partir de cloudflare.com/ips-v4 e ips-v6 ($n faixas)"; printf 'trusted_proxies static'; while read -r r; do printf ' %s' "$r"; done < "$tmp"; echo; } > "$DIR/cloudflare-ips.caddy"
echo "OK: $n faixas em $DIR/cloudflare-ips.caddy"
