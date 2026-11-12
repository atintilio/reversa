#!/usr/bin/env bash
# Chama o cron semanal do Reversa: GET /api/cron-semanal com Bearer CRON_SECRET.
# Sai com codigo diferente de 0 se o HTTP nao for 200.
#
# Crontab (quarta-feira 23:00 UTC; ajuste o caminho). O cron do servidor usa o
# fuso do servidor: confira com "date" e, se nao for UTC, use CRON_TZ=UTC acima da linha:
#   CRON_TZ=UTC
#   0 23 * * 3 /opt/reversa/deploy/cron-semanal.sh >> /var/log/reversa-cron.log 2>&1
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$DIR/.env}"
BASE_URL="${BASE_URL:-https://reversa.argusprime.com.br}"

# Le CRON_SECRET do .env sem executar o arquivo (nao usa "source").
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date -u +%FT%TZ) ERRO: CRON_SECRET vazio ou ausente em $ENV_FILE" >&2
  exit 2
fi

# O cabecalho vai por stdin para o segredo nao aparecer na lista de processos.
status="$(printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" \
  | curl --silent --show-error --max-time 300 --config - \
      --output /dev/null --write-out '%{http_code}' \
      "$BASE_URL/api/cron-semanal")" || { echo "$(date -u +%FT%TZ) ERRO: falha de conexao com $BASE_URL" >&2; exit 3; }

if [ "$status" != "200" ]; then
  echo "$(date -u +%FT%TZ) ERRO: cron-semanal respondeu HTTP $status" >&2
  exit 1
fi
echo "$(date -u +%FT%TZ) cron-semanal OK (HTTP 200)"
