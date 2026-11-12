#!/usr/bin/env bash
# Copia o banco da Neon para o Postgres da VPS e compara contagens. NAO altera a Neon (so le).
# Uso (na VPS, pasta deploy/, com o stack ja de pe):
#   NEON_URL='postgres://...' ./migrar-neon-para-vps.sh            # ensaio: copia e compara
# Para o dia da troca: pare as escritas no site antigo, rode de novo e so entao troque o DNS.
# O NEON_URL deve ser uma conexao SOMENTE LEITURA, se possivel. Nao grave o valor em arquivo.
set -euo pipefail
: "${NEON_URL:?defina NEON_URL}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR"
umask 077
OUT="${BACKUP_DIR:-/var/backups/reversa}"; mkdir -p "$OUT"
dump="$OUT/neon-$(date -u +%Y%m%d-%H%M%S).dump"
echo "1/4 dump da Neon (cliente postgres:16 em container; dump so le)..."
docker run --rm -e NEON_URL postgres:16 sh -c 'pg_dump "$NEON_URL" --no-owner --no-acl -Fc' > "$dump"
[ -s "$dump" ] || { echo "ERRO: dump vazio" >&2; exit 1; }
echo "   $(du -h "$dump" | cut -f1) em $dump"
echo "2/4 restaurando no Postgres da VPS (substitui o conteudo atual do banco da VPS)..."
read -r -p "   Digite SUBSTITUIR para continuar: " r; [ "$r" = "SUBSTITUIR" ] || { echo "cancelado"; exit 1; }
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < "$dump" || echo "   (avisos do pg_restore acima sao comuns; confira a comparacao abaixo)"
echo "3/4 contagem de linhas por tabela (Neon x VPS)..."
q="select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
tabs="$(docker run --rm -e NEON_URL postgres:16 sh -c 'psql "$NEON_URL" -Atc "'"$q"'"')"
dif=0
for t in $tabs; do
  a="$(docker run --rm -e NEON_URL postgres:16 sh -c 'psql "$NEON_URL" -Atc "select count(*) from public.\"'"$t"'\""')"
  b="$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from public.\"'"$t"'\""' | tr -d '\r')"
  if [ "$a" = "$b" ]; then printf 'OK    %-40s %s\n' "$t" "$a"; else printf 'DIFF  %-40s neon=%s vps=%s\n' "$t" "$a" "$b"; dif=$((dif+1)); fi
done
echo "4/4 migracoes pendentes na VPS..."
docker compose exec -T app node scripts/migrate.js
echo "---"; [ "$dif" -eq 0 ] && echo "TUDO IGUAL: $(echo "$tabs" | wc -w) tabelas conferidas" || { echo "$dif tabela(s) com diferenca: NAO troque o DNS"; exit 1; }
