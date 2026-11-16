#!/usr/bin/env bash
# Agenda o espelho+backup diario (03:15) e roda o primeiro agora. Rode como root, em /opt/reversa.
set -euo pipefail
rm -f /etc/cron.d/reversa-backup
echo '15 3 * * * root /bin/bash /opt/reversa/deploy/espelho-neon.sh >> /var/log/reversa-backup.log 2>&1' > /etc/cron.d/reversa-espelho
chmod 644 /etc/cron.d/reversa-espelho
bash /opt/reversa/deploy/espelho-neon.sh
