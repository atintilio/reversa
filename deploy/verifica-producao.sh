#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://reversa.argusprime.com.br}"
curl -fsS --max-time 15 "$BASE_URL/api/health" >/dev/null
test "$(systemctl is-active reversa)" = active
test -d /var/lib/reversa/documents
echo "Produção saudável: $BASE_URL"
