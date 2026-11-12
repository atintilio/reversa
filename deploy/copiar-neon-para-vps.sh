#!/usr/bin/env bash
# Copia os dados da Neon para o Postgres do Reversa na VPS (sem Docker). Rode como root, em /opt/reversa.
#   ensaio (nao altera nada):   bash deploy/copiar-neon-para-vps.sh
#   copia de verdade:           bash deploy/copiar-neon-para-vps.sh --confirmar
# A conexao da Neon e pedida aqui, no terminal (nao aparece na tela e nao e salva em arquivo).
set -euo pipefail
cd /opt/reversa
[ -f /etc/reversa.env ] || { echo "ERRO: /etc/reversa.env nao existe"; exit 1; }
read -rsp "Cole a conexao da Neon (somente leitura) e tecle Enter: " ORIGEM_URL; echo
[ -n "$ORIGEM_URL" ] || { echo "ERRO: conexao vazia"; exit 1; }
DESTINO_URL=$(grep '^POSTGRES_URL=' /etc/reversa.env | cut -d= -f2-)
export ORIGEM_URL DESTINO_URL
if [ "${1:-}" = "--confirmar" ]; then
  read -rp "Isto APAGA os dados do Reversa na VPS e copia os da Neon. Digite SUBSTITUIR: " R
  [ "$R" = "SUBSTITUIR" ] || { echo "Cancelado."; exit 1; }
  mkdir -p /var/backups/reversa
  runuser -u postgres -- pg_dump -Fc reversa > "/var/backups/reversa/antes-da-copia-$(date +%Y%m%d-%H%M%S).dump" 2>/dev/null || true
fi
node scripts/copiar-banco.js "$@"
