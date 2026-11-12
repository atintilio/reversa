# Roteiro: Vercel -> VPS + Cloudflare (passo a passo)

Regra de ouro: a Vercel e a Neon continuam ligadas ate o fim. So se desliga algo depois de 7 dias sem problema.
Nada aqui foi executado numa VPS real: a primeira instalacao pode pedir ajustes.

## 0. Antes de comecar (voce)
- [ ] Trocar a senha de root da VPS (ela foi exposta numa conversa) e, de preferencia, usar chave SSH.
- [ ] Ter a conexao da Neon em mao (`POSTGRES_URL` do painel da Vercel). Nao cole em conversa; use so no terminal da VPS.
- [ ] Ter o painel da Vercel aberto para copiar os valores das variaveis (lista no passo 3).
- [ ] Decidir onde vai o backup fora da VPS (ponto 9).

## 1. Preparar a VPS
1. Como root: `bash deploy/bootstrap-vps.sh "<sua chave publica ssh>"` (cria o usuario `reversa`, firewall 22/80/443, Docker).
2. Ao final ele mostra o teste de conexao IPv4/IPv6. **Me envie essa saida.** Se a VPS so tiver IPv6, o GitHub e o Docker Hub podem falhar: precisaremos de um ajuste (proxy, ou outra VPS).

## 2. Baixar o codigo
```
sudo git clone https://github.com/atintilio/reversa /opt/reversa
cd /opt/reversa/deploy
```

## 3. Segredos (.env)
```
cp ../.env.example .env && chmod 600 .env && nano .env
```
- `POSTGRES_PASSWORD` e `CRON_SECRET`: gerar com `openssl rand -hex 24` (novos).
- `POSTGRES_URL=postgres://reversa:<POSTGRES_PASSWORD>@db:5432/reversa` (aponta para o banco da VPS, nao para a Neon).
- Copiar da Vercel, sem alterar: `SESSION_SECRET`, `RESET_TOKEN_PEPPER`, `REVERSA_SECRET`, `REVERSA_USERS`, `REVERSA_USER_EMAILS`, `LEGACY_AUTH_UNTIL`, `REVERSA_MASTER_EMAILS`, `MS_*`, `MAIL_*`, `EMAIL_FROM`, `RELATORIO_DESTINATARIOS`, `CONTRATADA_*`, `CNPJ_API_URL`, `APOLLO_*`, `LLM_*`, `BOOTSTRAP_OWNER_*`. Trocar `SESSION_SECRET` derruba as sessoes abertas (todos precisam logar de novo).
- `APP_BASE_URL`, `REVERSA_HOST`, `GOV_HOST`: o endereco que estiver sendo testado.
- Atencao LGPD: `LLM_*` envia texto a um servico externo de IA. Mantenha so se ja era assim na Vercel.

## 4. Subir e testar sem DNS
```
docker compose up -d --build
docker compose ps          # tres servicos "healthy"
docker compose exec app node scripts/migrate.js
```

## 5. Copiar o banco da Neon (ensaio)
```
NEON_URL='<conexao da Neon>' ./migrar-neon-para-vps.sh
```
Ele le a Neon (nao altera), restaura na VPS e compara as linhas de cada tabela. So siga se terminar com "TUDO IGUAL".

## 6. Cloudflare
1. No Cloudflare crie um subdominio de TESTE, ex.: `teste.argusprime.com.br`, apontando para o IP da VPS (A para IPv4, AAAA para IPv6), nuvem laranja ligada.
2. SSL/TLS do dominio: modo **Full (strict)**.
3. Com a nuvem laranja, use o Caddy do Cloudflare:
   ```
   ./atualiza-cloudflare-ips.sh
   echo 'CADDYFILE=Caddyfile.cloudflare' >> .env
   echo 'REVERSA_HOST=teste.argusprime.com.br' >> .env
   docker compose up -d
   docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
   ```
   Sem isso o limite de tentativas de login passa a tratar todos os usuarios como um IP so.
4. Se o certificado nao for emitido por tras da nuvem laranja, usar um Certificado de Origem do Cloudflare (decisao a tomar na hora).
5. Teste: `./smoke.sh https://teste.argusprime.com.br` (tudo OK) e entre com sua conta real; abra Clientes, Teses e rode um SPED de teste, comparando o resultado com o da Vercel.

## 7. Dia da troca (so se o passo 6 passou)
1. Uma hora antes: baixar o TTL dos registros de `reversa` e `reversa-gov` no Cloudflare para 60 s.
2. Avisar a equipe: parar de usar o sistema por alguns minutos.
3. Rodar `migrar-neon-para-vps.sh` de novo (copia final) e conferir "TUDO IGUAL".
4. Colocar `REVERSA_HOST=reversa.argusprime.com.br` e `GOV_HOST=reversa-gov.argusprime.com.br` no `.env`, `docker compose up -d`.
5. No Cloudflare, apontar `reversa` e `reversa-gov` para a VPS (nuvem laranja). `./smoke.sh https://reversa.argusprime.com.br` e o mesmo para o gov.
6. Instalar os dois agendamentos (cron semanal e backup), como no README.

## 8. Voltar atras
Apontar o DNS de novo para a Vercel. Atencao: o que for gravado na VPS depois da troca nao volta para a Neon sozinho. Por isso a janela curta e a copia final no passo 7.

## 9. Pendencias abertas (nao resolvidas)
- Backup fora da VPS e criptografado: destino nao definido. Ate la, perder a VPS = perder os dados.
- Restauracao do backup nunca testada.
- Docker/Caddy/Postgres 16 nunca rodaram juntos: validar no passo 4.
- Dados de clientes hospedados na Franca: validar com o juridico (LGPD).
- Os 2 testes de ECD dependem de um arquivo que falta no repositorio.
