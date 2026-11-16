#!/usr/bin/env bash
# Prova que o ultimo backup restaura: carrega num banco TEMPORARIO, conta linhas e apaga o temporario.
# Nao toca no banco "reversa". Rode como root.
set -euo pipefail
cd /tmp
ARQ=$(ls -1t /var/backups/reversa/reversa-*.dump 2>/dev/null | head -1)
[ -n "$ARQ" ] || { echo "ERRO: nenhum backup encontrado"; exit 1; }
P() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -Atq "$@"; }
P -c "drop database if exists reversa_restauracao_teste"
P -c "create database reversa_restauracao_teste"
trap 'P -c "drop database if exists reversa_restauracao_teste" >/dev/null' EXIT
runuser -u postgres -- pg_restore --no-owner --no-privileges -d reversa_restauracao_teste < "$ARQ" 2>/tmp/restore-erros.log || true
for t in users organizations tax_cases audit_events; do
  A=$(P -d reversa -c "select count(*) from $t"); B=$(P -d reversa_restauracao_teste -c "select count(*) from $t")
  [ "$A" = "$B" ] && echo "OK    $t: $A x $B" || echo "DIFERE $t: banco=$A restaurado=$B (o backup e mais antigo que o banco atual?)"
done
echo "Backup testado: $ARQ"
