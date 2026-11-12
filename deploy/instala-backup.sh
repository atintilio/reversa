#!/usr/bin/env bash
# Agenda o backup diario (03:15) e roda o primeiro agora. Rode como root, em /opt/reversa.
set -euo pipefail
echo '15 3 * * * root /bin/bash /opt/reversa/deploy/backup-nativo.sh >> /var/log/reversa-backup.log 2>&1' > /etc/cron.d/reversa-backup
chmod 644 /etc/cron.d/reversa-backup
bash /opt/reversa/deploy/backup-nativo.sh
