# Reversa na VPS - guia de instalacao e operacao

Este guia coloca o Reversa para rodar em uma VPS com Docker. Tres servicos sobem juntos:
`app` (o sistema), `db` (Postgres 16) e `caddy` (site com HTTPS). Todos os comandos
`docker compose` abaixo devem ser rodados dentro da pasta `deploy/`.

## 1. Pre-requisitos da VPS

- Linux (Ubuntu ou Debian LTS recomendado) com acesso root ou sudo.
- Docker Engine com o plugin Compose (`docker compose version` deve funcionar), git e curl.
- DNS: `reversa.argusprime.com.br` e `reversa-gov.argusprime.com.br` apontando (registro A) para o IP da VPS. Sem isso o HTTPS nao e emitido.
- Portas 80 e 443 livres na VPS.

## 2. Instalacao (primeira vez)

1. Clonar o projeto:
   ```
   sudo git clone <endereco-do-repositorio> /opt/reversa
   cd /opt/reversa/deploy
   ```
2. Criar o arquivo de segredos a partir do modelo (este arquivo NUNCA vai para o Git; o `.gitignore` ja o ignora):
   ```
   cp ../.env.example .env
   chmod 600 .env
   nano .env
   ```
   Preencha, no minimo:
   - `POSTGRES_PASSWORD`: acrescente esta linha, com uma senha longa e aleatoria (`openssl rand -hex 24`).
   - `POSTGRES_URL`: `postgres://reversa:<a-mesma-senha>@db:5432/reversa` (o servidor do banco se chama `db`). Se a senha tiver caracteres especiais, use apenas letras e numeros (como o `openssl rand -hex` gera).
   - `SESSION_SECRET` e `RESET_TOKEN_PEPPER`: valores aleatorios diferentes (`openssl rand -hex 32`).
   - `CRON_SECRET`: acrescente esta linha, com outro valor aleatorio.
   - Demais itens (`MS_*`, `MAIL_*`, usuarios legados): conforme o `.env.example`.
3. Subir tudo:
   ```
   docker compose up -d --build
   docker compose ps
   ```
   Aguarde os tres servicos ficarem `healthy` (ate 1 a 2 minutos).
4. Criar as tabelas do banco:
   ```
   docker compose exec app node scripts/migrate.js
   ```
5. Testar: abra `https://reversa.argusprime.com.br/api/health` no navegador. Deve responder com sucesso.
6. Instalar os dois agendamentos (`crontab -e`, como o usuario que roda o Docker):
   ```
   CRON_TZ=UTC
   0 23 * * 3 /opt/reversa/deploy/cron-semanal.sh >> /var/log/reversa-cron.log 2>&1
   0 3 * * * /opt/reversa/deploy/backup-db.sh >> /var/log/reversa-backup.log 2>&1
   ```
   O primeiro roda toda quarta as 23:00 UTC e chama o cron semanal do sistema. O segundo faz o backup diario do banco as 03:00 (hora do servidor; se `CRON_TZ=UTC` valer para ambas as linhas, sera 03:00 UTC). Para o backup, crie a pasta antes: `sudo mkdir -p /var/backups/reversa`.
   Teste cada um uma vez na mao: `./cron-semanal.sh` e `./backup-db.sh` (o codigo de saida 0 significa sucesso).

## 3. Atualizar a versao

```
cd /opt/reversa
git pull
cd deploy
./backup-db.sh                       # sempre faca backup antes
docker compose up -d --build
docker compose exec app node scripts/migrate.js
docker compose ps
```

## 4. Restaurar um backup

Os backups ficam em `/var/backups/reversa/reversa-AAAAMMDD-HHMMSS.dump` (os 14 mais recentes).
Restaurar SUBSTITUI os dados atuais. Antes, se possivel, faca um backup do estado atual.

```
cd /opt/reversa/deploy
docker compose stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < /var/backups/reversa/reversa-AAAAMMDD-HHMMSS.dump
docker compose start app
```

Depois confira `https://reversa.argusprime.com.br/api/health` e entre no sistema.
Em uma VPS nova, instale tudo (secao 2, passos 1 a 3), restaure o backup e so entao
rode o passo 4 (migrate) se houver versoes mais novas.

## 5. Checklist de seguranca

- [ ] Firewall liberando SOMENTE as portas 22, 80 e 443 (ex.: `ufw default deny incoming`, `ufw allow 22,80,443/tcp`, `ufw enable`). Atencao: o Docker pode furar o `ufw` ao publicar portas; por isso o `docker-compose.yml` so publica 80/443 (e 443/udp) no Caddy. Nao adicione `ports:` ao `app` nem ao `db`.
- [ ] SSH somente por chave (`PasswordAuthentication no` e `PermitRootLogin no` em `/etc/ssh/sshd_config`), depois `sudo systemctl reload ssh`. Teste uma segunda sessao antes de fechar a atual.
- [ ] Atualizacoes de seguranca automaticas (Ubuntu/Debian: pacote `unattended-upgrades`).
- [ ] `.env` com permissao 600 e fora do Git; senhas e segredos longos e unicos.
- [ ] A porta 3000 do app nunca exposta na internet (o limite de tentativas de login depende do cabecalho `X-Forwarded-For` definido pelo Caddy).
- [ ] Se o Cloudflare for colocado na frente, ajustar o Caddyfile (`trusted_proxies`), conforme o comentario no proprio arquivo.
- [ ] Atualizar a VPS e as imagens periodicamente (`docker compose pull && docker compose up -d`).

## 6. Pendente / nao verificado

- **Backup fora do servidor: NAO configurado.** Hoje os backups ficam na mesma VPS do banco. O destino externo e a criptografia sao decisao pendente do dono. Ate la, perder a VPS significa perder os dados.
- **Restauracao nunca testada.** Faca um teste de restauracao em uma maquina de teste antes de depender do backup.
- **Nenhum item deste pacote foi executado de ponta a ponta.** Foi validada apenas a sintaxe (scripts e `docker compose config`); a imagem nao foi construida nem os servicos foram subidos. Podem aparecer ajustes na primeira instalacao.
- **`server.js`** (servidor do app) fica na raiz do projeto, escuta na porta 3000 e responde 200 em `/api/health`. Testado em ambiente de teste, nao na VPS.
- **Conexao com o banco:** o app usa o driver Postgres comum quando o host nao e da Neon, sem SSL na rede interna (testado contra um Postgres de teste, nao contra o Postgres 16 do container). Para exigir SSL, defina `PGSSL=require`.
- **Certificados HTTPS** dependem do DNS correto e das portas 80/443 abertas; nao testados.
- **Cron:** o fuso (`CRON_TZ=UTC`) precisa ser conferido na VPS; o cron semanal chama a URL publica, entao o site precisa estar no ar.
- Versoes das imagens (Node, Postgres, Caddy) seguem as tags principais dos arquivos; fixar versoes exatas e uma decisao futura.
