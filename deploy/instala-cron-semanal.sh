#!/usr/bin/env bash
# Agenda o cron semanal do Reversa (quarta 23:00 UTC) na VPS. Rode como root, em /opt/reversa.
set -euo pipefail
echo 'CRON_TZ=UTC
0 23 * * 3 root ENV_FILE=/etc/reversa.env BASE_URL=http://127.0.0.1:3300 /opt/reversa/deploy/cron-semanal.sh >> /var/log/reversa-cron.log 2>&1' > /etc/cron.d/reversa-semanal
chmod 644 /etc/cron.d/reversa-semanal
echo "Agendado:"; cat /etc/cron.d/reversa-semanal
