#!/usr/bin/env bash
# Backup diario do banco "reversa" (Postgres nativo da VPS). Rode como root. Mantem 14 dias.
# Destino local: /var/backups/reversa (somente root). Copia FORA da VPS ainda nao configurada.
set -euo pipefail
DIR=/var/backups/reversa; KEEP_DIAS=14
mkdir -p "$DIR"; chmod 700 "$DIR"
ARQ="$DIR/reversa-$(date +%Y%m%d-%H%M%S).dump"
cd /tmp
runuser -u postgres -- pg_dump -Fc reversa > "$ARQ"
chmod 600 "$ARQ"
# confere que o arquivo e legivel e nao esta vazio
N=$(runuser -u postgres -- pg_restore -l < "$ARQ" | grep -c ' TABLE DATA ' || true)
[ "$N" -gt 0 ] || { echo "ERRO: backup invalido ($ARQ)"; rm -f "$ARQ"; exit 1; }
find "$DIR" -name 'reversa-*.dump' -mtime +"$KEEP_DIAS" -delete
echo "OK $(date -Is) $ARQ ($(du -h "$ARQ" | cut -f1), $N tabelas)"
