#!/usr/bin/env bash
set -euo pipefail
# Preparação restrita ao diretório documental e à variável do serviço nativo.
[ "$(id -u)" = 0 ] || { echo "Execute como root na VPS."; exit 1; }
id reversa >/dev/null
[ -f /etc/reversa.env ] || { echo "/etc/reversa.env não encontrado."; exit 1; }
install -d -m 700 -o reversa -g reversa /var/lib/reversa/documents
if ! grep -q '^REVERSA_DOCUMENT_ROOT=' /etc/reversa.env; then
  printf '\nREVERSA_DOCUMENT_ROOT=/var/lib/reversa/documents\n' >> /etc/reversa.env
fi
echo "Storage preparado. Reinicie o serviço após instalar a versão testada."
