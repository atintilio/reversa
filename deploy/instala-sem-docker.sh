#!/usr/bin/env bash
# Instala o Reversa como servico da maquina (sem Docker), para VPS compartilhada.
# Toca SOMENTE em: usuario "reversa", banco/role "reversa" no Postgres, /etc/reversa.env,
# /etc/systemd/system/reversa.service e /opt/reversa. NAO mexe em nginx, DNS nem nas outras solucoes.
# Rode como root, de dentro de /opt/reversa:  bash deploy/instala-sem-docker.sh
set -euo pipefail
APP=/opt/reversa; ENVF=/etc/reversa.env; PORT=3300
[ "$(id -u)" = 0 ] || { echo "ERRO: rode como root"; exit 1; }
[ -f "$APP/server.js" ] || { echo "ERRO: $APP/server.js nao encontrado"; exit 1; }
NODE=$(command -v node || true)
[ -n "$NODE" ] || { echo "ERRO: node nao encontrado"; exit 1; }
case "$NODE" in /root/*) echo "ERRO: node em $NODE nao e acessivel ao usuario do servico"; exit 1;; esac
cd /tmp

echo "== 1/6 usuario do servico =="
id reversa >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin reversa

echo "== 2/6 banco e senha =="
if [ -f "$ENVF" ] && grep -q '^POSTGRES_URL=' "$ENVF"; then
  echo "$ENVF ja existe: mantendo a senha atual"
else
  PW=$(openssl rand -hex 24)
  PSQL() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -Atq "$@"; }
  if [ "$(PSQL -c "select 1 from pg_roles where rolname='reversa'")" = 1 ]; then
    PSQL -c "alter role reversa login password '$PW'"
  else
    PSQL -c "create role reversa login password '$PW'"
  fi
  if [ "$(PSQL -c "select 1 from pg_database where datname='reversa'")" != 1 ]; then
    PSQL -c "create database reversa owner reversa"
  fi
  PSQL -c "revoke all on database reversa from public"
  umask 077
  cat > "$ENVF" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
POSTGRES_URL=postgres://reversa:$PW@127.0.0.1:5432/reversa
SESSION_SECRET=$(openssl rand -hex 32)
RESET_TOKEN_PEPPER=$(openssl rand -hex 32)
REVERSA_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 24)
LEGACY_AUTH_UNTIL=off
APP_BASE_URL=http://reversa-teste.argusprime.com.br
EOF
  chmod 600 "$ENVF"
  umask 022
fi

echo "== 3/6 dependencias =="
umask 022
cd "$APP"
npm ci --omit=dev --ignore-scripts 2>&1 | tail -3

echo "== 4/6 tabelas (migracoes) =="
( set -a; . "$ENVF"; set +a; "$NODE" scripts/migrate.js ) 2>&1 | tail -8

echo "== 5/6 servico systemd =="
cat > /etc/systemd/system/reversa.service <<EOF
[Unit]
Description=Reversa (Argus Prime)
After=network.target postgresql.service

[Service]
User=reversa
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$NODE server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
MemoryMax=1500M

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now reversa
sleep 4

echo "== 6/6 teste =="
systemctl is-active reversa
curl -s -m 5 -w "\nhealth HTTP %{http_code}\n" "http://127.0.0.1:$PORT/api/health"
