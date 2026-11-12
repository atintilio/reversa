# Virada do Reversa: Vercel + Neon -> VPS (roteiro curto)

Pre-requisitos (ja feitos): app nativo na VPS (systemd `reversa`), nginx 80/443, certificado de origem Cloudflare,
backup diario + restauracao testada, `reversa-teste.argusprime.com.br` OK em Full (strict).
Regra de ouro: Vercel + Neon ficam intactos por 7 dias. Voltar atras = devolver o DNS.

## A. Antes (sem impacto para ninguem)
1. Anote os registros DNS atuais de `reversa` e `reversa-gov` (Cloudflare > DNS): tipo, destino, proxy ligado/desligado. Print de tela serve. E o seu "botao de volta".
2. Na VPS, edite `/etc/reversa.env` (nano) e preencha direto la as credenciais reais (e-mail EMAIL_FROM/SMTP, integracoes, REVERSA_MASTER_EMAILS, LLM_*). Nunca cole segredos no chat.
3. Ainda no `/etc/reversa.env`: `APP_BASE_URL=https://reversa.argusprime.com.br`. Depois `systemctl restart reversa` e `curl -s http://127.0.0.1:3300/api/health` (esperado status ok; mail true se o e-mail foi configurado).
4. Cloudflare > Regras > Configuration Rules: edite a regra "Reversa teste - Full strict" e troque a expressao por:
   `(http.host in {"reversa-teste.argusprime.com.br" "reversa.argusprime.com.br" "reversa-gov.argusprime.com.br"})`
   (so afeta esses 3 hosts; o resto da zona continua Flexible).
5. Baixe o TTL dos dois registros para 1 min (se estiverem em Auto no proxy laranja, ja e rapido).

## B. Virada (escolha horario de pouco uso; ~15 min)
1. Avise os usuarios: 15 min sem gravar dados.
2. Na VPS: `cd /opt/reversa && git pull && bash deploy/copiar-neon-para-vps.sh --confirmar`
   (pede a URL da Neon sem mostrar; digite SUBSTITUIR; esperado: "TUDO IGUAL").
3. Cloudflare > DNS: mude `reversa` e `reversa-gov` para o endereco da VPS: registro AAAA `2a0c:b641:1a0:800::256`, proxy LIGADO (nuvem laranja). Remova o CNAME da Vercel desses dois nomes (so um registro por nome).
4. Espere 1-2 min e rode (de qualquer lugar):
   `bash deploy/smoke.sh https://reversa.argusprime.com.br` e `bash deploy/smoke.sh https://reversa-gov.argusprime.com.br` (esperado: 0 falhas).
5. Entre no Reversa, abra um cliente, confira que os dados batem.

## C. Cron semanal (substitui o cron da Vercel)
Na VPS: `crontab -e` e acrescente
```
CRON_TZ=UTC
0 23 * * 3 ENV_FILE=/etc/reversa.env /opt/reversa/deploy/cron-semanal.sh >> /var/log/reversa-cron.log 2>&1
```
Teste uma vez agora: `ENV_FILE=/etc/reversa.env bash /opt/reversa/deploy/cron-semanal.sh; echo $?` (esperado 0).

## D. Voltar atras (se algo der errado)
Cloudflare > DNS: restaure os registros anotados em A.1. A Vercel continua com o app e a Neon com o banco.
ATENCAO: dados gravados na VPS depois da virada NAO voltam sozinhos para a Neon. Se precisar voltar depois de horas, avise antes (ha como copiar de volta).

## E. Depois de 7 dias estavel
- Trocar a senha da Neon e revisar o que mais usava aquele banco (o app reversa-gov-suite usa o mesmo banco: nao desligue a Neon antes de migra-lo).
- Fazer o merge da branch `feat/migracao-vps` em `main` (so com aprovacao; o push em `main` dispara deploy na Vercel).
- Definir copia externa criptografada dos backups (hoje so ficam na propria VPS).
