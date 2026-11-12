#!/usr/bin/env bash
# Backup diario do plano B: copia a Neon (somente leitura) para o banco local "espelho" da VPS
# e gera o arquivo de backup (14 dias em /var/backups/reversa). Roda pelo cron como root.
# Se a copia falhar, NAO gera backup novo (os anteriores ficam intactos) e sai com erro.
set -euo pipefail
cd /opt/reversa
ENV_FILE=/etc/reversa.env
val() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-; }
ORIGEM_URL="$(val POSTGRES_URL)"; DESTINO_URL="$(val LOCAL_POSTGRES_URL)"
[ -n "$ORIGEM_URL" ] && [ -n "$DESTINO_URL" ] || { echo "$(date -Is) ERRO: faltam POSTGRES_URL/LOCAL_POSTGRES_URL"; exit 2; }
case "$ORIGEM_URL" in *neon.tech*) ;; *) echo "$(date -Is) ERRO: POSTGRES_URL nao e da Neon; nada a espelhar"; exit 3;; esac
export ORIGEM_URL DESTINO_URL
echo "$(date -Is) copiando Neon -> espelho local"
node scripts/copiar-banco.js --confirmar
bash deploy/backup-nativo.sh
