#!/usr/bin/env bash
# Pergunta, uma a uma, as variaveis do Reversa e grava em /etc/reversa.env.
# Enter = manter o valor atual. Segredos sao digitados sem aparecer na tela.
# Nao imprime nenhum valor. Faz copia de seguranca antes. Rodar como root na VPS.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/etc/reversa.env}"
[ -f "$ENV_FILE" ] || { echo "Nao achei $ENV_FILE"; exit 1; }
cp -p "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"

atual() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }
grava() { # nome valor
  local tmp; tmp="$(mktemp)"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
pergunta() { # nome segredo(s/n) descricao
  local n="$1" sec="$2" desc="$3" cur v estado
  cur="$(atual "$n")"
  if [ -n "$cur" ]; then estado="ja preenchido"; else estado="VAZIO"; fi
  echo; echo "$n - $desc [$estado]"
  if [ "$sec" = s ]; then read -rsp "  novo valor (Enter = manter): " v; echo
  else read -rp "  novo valor (Enter = manter): " v; fi
  [ -n "$v" ] && grava "$n" "$v" && echo "  gravado."
  return 0
}
echo "Enter mantem o que ja existe. Pode pular o que nao tiver agora."
pergunta APP_BASE_URL n "endereco publico (ex.: https://reversa.argusprime.com.br)"
pergunta REVERSA_MASTER_EMAILS n "e-mails dos administradores master, separados por virgula"
pergunta BOOTSTRAP_OWNER_EMAIL n "e-mail do dono inicial (so se for criar conta inicial)"
pergunta MS_TENANT_ID s "Microsoft 365: ID do locatario (envio de e-mail)"
pergunta MS_CLIENT_ID s "Microsoft 365: ID do aplicativo"
pergunta MS_CLIENT_SECRET s "Microsoft 365: segredo do aplicativo"
pergunta MS_GRAPH_USER_ID n "Microsoft 365: usuario/caixa que envia"
pergunta MAIL_FROM n "remetente dos e-mails"
pergunta EMAIL_FROM n "remetente (usado em alguns avisos)"
pergunta MAIL_REPLY_TO n "responder para"
pergunta RELATORIO_DESTINATARIOS n "quem recebe o relatorio semanal"
pergunta CONTRATADA_EMAIL n "e-mail da contratada (contratos)"
pergunta CONTRATADA_ENDERECO n "endereco da contratada"
pergunta CONTRATADA_REPRESENTANTE n "representante da contratada"
pergunta CNPJ_API_URL n "URL da API de consulta de CNPJ"
pergunta APOLLO_API_KEY s "chave da Apollo (se usar)"
pergunta APOLLO_MAX_DIA n "limite diario da Apollo"
pergunta LLM_API_KEY s "chave de IA (so se for usar; avalie a LGPD antes)"
pergunta LLM_BASE_URL n "endereco do servico de IA"
pergunta LLM_MODEL n "modelo de IA"
chmod 600 "$ENV_FILE"
echo; echo "Reiniciando o Reversa..."
systemctl restart reversa; sleep 3
curl -s http://127.0.0.1:3300/api/health; echo
