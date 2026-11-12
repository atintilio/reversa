#!/usr/bin/env bash
# Faz o Reversa da VPS usar o banco da Neon (plano B). Rode como root, em /opt/reversa.
# - guarda a conexao do banco local como LOCAL_POSTGRES_URL (vira o "espelho" de backup)
# - pede a conexao da Neon sem mostrar na tela, grava em /etc/reversa.env e reinicia
# Voltar atras: bash deploy/usa-neon.sh --voltar   (volta a usar o banco local da VPS)
set -euo pipefail
ENV_FILE=/etc/reversa.env
[ -f "$ENV_FILE" ] || { echo "Nao achei $ENV_FILE"; exit 1; }
cp -p "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
atual() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }
grava() { local t; t="$(mktemp)"; grep -vE "^$1=" "$ENV_FILE" > "$t" || true; printf '%s=%s\n' "$1" "$2" >> "$t"; cat "$t" > "$ENV_FILE"; rm -f "$t"; }
reinicia() { chmod 600 "$ENV_FILE"; systemctl restart reversa; sleep 4; echo -n "saude: "; curl -s http://127.0.0.1:3300/api/health; echo; }

if [ "${1:-}" = "--voltar" ]; then
  L="$(atual LOCAL_POSTGRES_URL)"; [ -n "$L" ] || { echo "Sem LOCAL_POSTGRES_URL: nada para voltar."; exit 1; }
  grava POSTGRES_URL "$L"; reinicia; echo "Voltou ao banco local da VPS."; exit 0
fi

CUR="$(atual POSTGRES_URL)"
if [ -z "$(atual LOCAL_POSTGRES_URL)" ]; then
  case "$CUR" in *neon.tech*) echo "ERRO: POSTGRES_URL ja e da Neon e nao ha LOCAL_POSTGRES_URL."; exit 1;; esac
  grava LOCAL_POSTGRES_URL "$CUR"
fi
read -rsp "Cole a conexao da Neon e tecle Enter (nao aparece na tela): " NEON; echo
case "$NEON" in postgres://*|postgresql://*) ;; *) echo "ERRO: nao parece uma conexao Postgres."; exit 1;; esac
case "$NEON" in *neon.tech*) ;; *) echo "ERRO: o endereco nao e da Neon (neon.tech)."; exit 1;; esac
grava POSTGRES_URL "$NEON"
reinicia
echo "Pronto. O Reversa agora usa a Neon. Para desfazer: bash deploy/usa-neon.sh --voltar"
