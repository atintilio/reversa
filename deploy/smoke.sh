#!/usr/bin/env bash
# Teste rapido pos-instalacao. Uso: ./smoke.sh https://reversa.argusprime.com.br
# Confere que o site responde e que arquivos internos NAO sao servidos. Nao envia nenhum dado.
set -u
BASE="${1:?uso: smoke.sh https://host}"
ok=0; bad=0
chk() { # descricao, esperado(regex), url
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$3")"
  if [[ "$code" =~ ^($2)$ ]]; then echo "OK   $code  $1"; ok=$((ok+1)); else echo "FALHA $code (esperado $2)  $1"; bad=$((bad+1)); fi
}
chk "saude do app"                    "200"         "$BASE/api/health"
chk "pagina de login"                 "200"         "$BASE/login.html"
chk "pagina interna sem sessao"       "30[0-9]|401" "$BASE/clientes.html"
chk "API sem sessao"                  "401|403"     "$BASE/api/v1/clients"
chk "server.js nao e servido"         "30[0-9]|401|403|404" "$BASE/server.js"
chk "scripts de deploy nao servidos"  "30[0-9]|401|403|404" "$BASE/deploy/bootstrap-vps.sh"
chk "banco de controle nao servido"   "30[0-9]|401|403|404" "$BASE/coleta/db/001_controle.sql"
chk ".env nao e servido"              "30[0-9]|401|403|404" "$BASE/.env"
chk "package.json nao e servido"      "30[0-9]|401|403|404" "$BASE/package.json"
hdr="$(curl -sI --max-time 20 "$BASE/login.html" | tr -d '\r')"
for h in "x-content-type-options" "referrer-policy"; do
  if echo "$hdr" | grep -qi "^$h:"; then echo "OK   cabecalho $h"; ok=$((ok+1)); else echo "FALHA cabecalho $h ausente"; bad=$((bad+1)); fi
done
echo "---"; echo "$ok ok, $bad falha(s)"; [ "$bad" -eq 0 ]
