#!/usr/bin/env bash
# Backup do Postgres do Reversa (pg_dump, formato custom) em /var/backups/reversa.
# Mantem os ultimos 14 arquivos.
#
# ATENCAO - PENDENTE (decisao do dono): a copia CRIPTOGRAFADA FORA DO SERVIDOR
# AINDA NAO ESTA CONFIGURADA. Hoje os backups ficam no MESMO servidor do banco;
# se a VPS for perdida, os backups tambem serao. Nao considere o backup
# seguro ate definir o destino externo e a criptografia.
#
# Crontab sugerido (todo dia 03:00):
#   0 3 * * * /opt/reversa/deploy/backup-db.sh >> /var/log/reversa-backup.log 2>&1
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${BACKUP_DIR:-/var/backups/reversa}"
KEEP=14

umask 077
mkdir -p "$DEST"

cd "$DIR"
arquivo="$DEST/reversa-$(date -u +%Y%m%d-%H%M%S).dump"
tmp="$arquivo.parcial"
trap 'rm -f "$tmp"' EXIT

# -T: sem TTY (necessario no cron). O usuario/banco vem das variaveis do proprio container.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"

if [ ! -s "$tmp" ]; then
  echo "$(date -u +%FT%TZ) ERRO: backup vazio" >&2
  exit 1
fi
mv "$tmp" "$arquivo"
trap - EXIT

# Retencao: apaga tudo alem dos 14 mais recentes.
ls -1t "$DEST"/reversa-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f --

echo "$(date -u +%FT%TZ) backup OK: $arquivo ($(du -h "$arquivo" | cut -f1))"
