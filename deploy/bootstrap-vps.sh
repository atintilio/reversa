#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 22.04 limpa para rodar o Reversa. Rode UMA vez, como root:
#   bash bootstrap-vps.sh "ssh-ed25519 AAAA... seu-email"
# O argumento é a sua CHAVE PÚBLICA SSH (nunca a privada). Depois do script o login por senha e o login
# do root por SSH ficam DESLIGADOS: teste o novo acesso em OUTRA janela antes de fechar a atual.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode como root."; exit 1; }
KEY="${1:-}"
case "$KEY" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;; *) echo "Informe a chave PÚBLICA SSH entre aspas como argumento."; exit 1;; esac
[ "$(lsb_release -rs 2>/dev/null || true)" = "22.04" ] || echo "Aviso: pensado para Ubuntu 22.04."

echo "== Conectividade (IPv4 e IPv6) =="
for u in https://github.com https://registry-1.docker.io https://download.docker.com; do
  v4=$(curl -4 -s -o /dev/null -m 8 -w '%{http_code}' "$u" || true); v6=$(curl -6 -s -o /dev/null -m 8 -w '%{http_code}' "$u" || true)
  echo "$u  IPv4=$v4  IPv6=$v6"
done
echo "(000 = sem resposta. Se GitHub e Docker só responderem por IPv6, avise antes de continuar.)"

echo "== Pacotes base =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

echo "== Usuário 'reversa' com chave SSH =="
id reversa >/dev/null 2>&1 || adduser --disabled-password --gecos "" reversa
usermod -aG sudo reversa
install -d -m 700 -o reversa -g reversa /home/reversa/.ssh
printf '%s\n' "$KEY" > /home/reversa/.ssh/authorized_keys
chown reversa:reversa /home/reversa/.ssh/authorized_keys; chmod 600 /home/reversa/.ssh/authorized_keys
# sudo sem senha: o usuário não tem senha, o acesso é só por chave.
echo "reversa ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-reversa; chmod 440 /etc/sudoers.d/90-reversa

echo "== Docker (repositório oficial) =="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker reversa   # atenção: quem está no grupo docker equivale a root na máquina

echo "== Firewall (portas SSH detectadas + 80 e 443) =="
SSH_PORTS=$(ss -tlnp 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | sort -u)
[ -n "$SSH_PORTS" ] || SSH_PORTS=22
ufw default deny incoming; ufw default allow outgoing
for p in $SSH_PORTS; do ufw allow "$p"/tcp; done
ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
ufw --force enable
# Aviso: o Docker publica portas por conta própria e pode driblar o ufw. O compose do Reversa só publica 80/443.

echo "== Atualizações automáticas de segurança =="
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

echo "== SSH: só chave, sem root =="
cat > /etc/ssh/sshd_config.d/99-reversa.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t && systemctl reload ssh

echo
echo "PRONTO. Antes de fechar esta janela, abra OUTRA e entre como: reversa (com a sua chave)."
echo "Portas SSH liberadas no firewall: $(echo $SSH_PORTS | tr '\n' ' ')"
