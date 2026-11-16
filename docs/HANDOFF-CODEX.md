# Handoff para o Codex — Reversa: catálogo de leiautes SPED e migração para a VPS

> Atualizado em 16/11/2026 pelo Claude (sessão de continuação).
> Leia este arquivo inteiro antes de mexer em qualquer coisa.

## 0. Regras que valem para tudo (André exigiu)

1. **Não faça merge em `main`.** Push em `main` publica em produção (o Vercel antigo ainda é o plano de recuo). Trabalhe só na branch `feat/motores-sped` (e `feat/migracao-vps` para a infraestrutura). Só mergeie com ordem explícita do André.
2. **Não invente campo, tipo, tamanho ou regra fiscal.** Se não estiver no PDF oficial ou no motor atual, deixe vazio e marque `[VALIDAR]`.
3. **Não copie código de terceiros sem licença.** python-sped, esociallib, mcp-fiscal-brasil e analise-sped-fiscal são MIT (manter o aviso em `THIRD_PARTY_NOTICES.md`). Os demais repositórios avaliados (processador_de_xml, edoc-gen, valor-fiscal, rag-notecraft) **não têm licença**: só ideias, nunca código.
4. **Não altere o que o pedido não mandou.** Mudança pequena = teste do trecho, não a suíte inteira, exceto antes de entregar.
5. **Nunca coloque segredo em arquivo ou em mensagem** (senhas, chaves, URL de banco, `MS_CLIENT_SECRET`). Não toque em `/etc/reversa.env`.
6. **Fundo claro/branco** em qualquer tela ou relatório; **sem referência à RZ3** no Reversa; textos em português do Brasil, objetivos.
7. André **não é desenvolvedor**: explique em linguagem simples, mostre o que vai fazer antes de executar mudanças grandes, e dê alternativas quando houver escolha de design.

## 1. Onde está o código

- Repositório: `atintilio/reversa` (GitHub). Produção = branch `main` (não mexer).
- Trabalho atual: branch **`feat/motores-sped`** (catálogo de leiautes + motores). Infra da VPS: branch `feat/migracao-vps` (já em produção na VPS, não mergeada em `main`).
- Node, JavaScript puro (sem build para os motores). Testes: `npm test` (`node --test tests/*.test.js`). A suíte completa demora mais de 2 min; rode por arquivo, por exemplo `node --test tests/motor-efd-icms.test.js`.

## 2. Estado atual (16/11/2026)

### 2.1 O que está pronto e testado

| Escrituração | Catálogo | Motor | Testes |
|---|---|---|---|
| EFD ICMS/IPI (leiaute 020, 2026) | ✅ 270/270 registros | ✅ lê catálogo + IND_BENEFICIO | ✅ 13 testes |
| EFD ICMS/IPI (leiaute 021, 2027) | ⚠️ 270 registros, validação parcial | — usa catálogo 020 + junta NT | — |
| EFD-Contribuições (Guia 1.35) | ✅ completo | ✅ lê catálogo | ✅ paridade |
| ECD (leiaute 9) | ✅ completo | ✅ lê catálogo | ✅ paridade |
| ECF (leiaute 12) | ✅ completo | ✅ lê catálogo | ✅ paridade |
| eSocial S-1.x | — sem catálogo JSON | ✅ v0.3.0 (XML) | ✅ parcial |

### 2.2 Pacote PIS operacional (novo na branch)

- `motor-creditos.js`: extrai `creditosApurados` (M100/M500 por mês e código de crédito) e `creditosPosicao` (blocos 1100/1500) — dados que o PER/DCOMP Web realmente pede.
- Fluxo PER/DCOMP: decisão de via (PER × DCOMP), cálculo de saldo, preparação de transmissão — com tela correspondente.
- Retificadora: trava de liberação consistente tela/servidor; M210 casa por `COD_CONT + alíquota`.
- Papel "Aprovador": renomeado de "contador" em toda a interface.

### 2.3 Testes (resultado da última rodada completa)

```
motor-efd-icms + creditos + ecd + ecf  → 41 testes (39 pass, 2 skip, 0 fail)
paridade + catálogos (3 arquivos)       → 16 testes (16 pass)
pacote-pis + pedido + retificadoras     → 34 testes (34 pass)
execução geral                          → 4 testes (4 pass)
```

Os 2 "skip" são `todo` marcados internamente, não falhas.

## 3. O que ainda falta (em ordem de prioridade)

### 3.1 Validação do leiaute NT 2026.001 (2027) — pendente

O arquivo `efd_icms_ipi.nt2026-001.json` foi gerado por script a partir do texto da NT. Erro conhecido: perdeu `VL_MERC` no C100. **Validar no PDF da NT antes de usar em produção** (acessar em `gov.br/sped`, EFD ICMS/IPI, manuais e documentos técnicos).

Registros críticos para validar primeiro: C100, C170, C591 (FCP NF3e, campos já inseridos do NT JSON), 1601 (ganhou `TOT_VS`, `TOT_ISS`, `TOT_OUTROS`).

### 3.2 eSocial S-1.3 — em análise

Ver relatório gerado em `lib/sped/leiautes/_extraidos/relatorio-esocial-gap.md` (criado pelo subagente desta sessão). O motor atual (v0.3.0) já suporta S-1.x para cálculo de créditos previdenciários. O gap exato para S-1.3 está nesse relatório.

Próximo passo: certificado digital do André (pré-requisito para assinar XML e transmitir ao SPED).

### 3.3 CBS/IBS 2027 — em construção

Ver `motor-cbs-ibs.js` e `tests/motor-cbs-ibs.test.js` (criados pelo subagente desta sessão). O motor projeta o impacto da Reforma Tributária (LC 214/2025) a partir dos dados EFD-Contribuições existentes.

Alíquotas de referência usadas: CBS ~8,8%, IBS ~17,7% (sujeitas a confirmação por regulamentação do CMN/CGSN).

### 3.4 Itens fora de escopo desta branch (próximas fases)

- Neon password rotation: só com OK do André, após atualizar `/etc/reversa.env` e `reversa-gov-suite`.
- Off-site backup além do pg_dump diário.
- Primeira validação do cron semanal (`api/cron-semanal`): **não execute à mão** — envia e-mails reais.
- Migrar `reversa-gov-suite` para a VPS.
- Remover Vercel: só depois de ~7 dias da virada (a integração Neon depende do projeto Vercel existir).

## 4. Como validar (checklist antes de dizer "pronto")

1. `node --test tests/motor-efd-icms.test.js tests/motor-creditos.test.js tests/motor-ecd.test.js tests/motor-ecf.test.js` sem falhas.
2. `node scripts/compara-leiautes.js` e `node scripts/junta-nt2026.js` para ver divergências motor × catálogo.
3. Para cada catálogo: toda posição 1..N presente, 1º campo `REG`; registros incompletos listados, não escondidos.
4. Rodar `git diff --stat` e conferir que nada fora do escopo mudou.
5. Antes de `git push`: confirmar que a branch é `feat/motores-sped` (`git branch --show-current`). Commit pequeno, mensagem clara em português.

## 5. Infra (VPS) — estado e pendências

- O Reversa roda **na VPS** (nginx → app na porta 3300, banco na **Neon**, não local). Domínios `reversa.argusprime.com.br` e `reversa-gov.argusprime.com.br` já apontam para a VPS (Cloudflare, SSL estrito). O Vercel antigo fica como plano de recuo por cerca de 7 dias; **não apague a conta nem o projeto no Vercel** (a integração com a Neon depende dele).
- Backup: espelho diário da Neon para um banco local + `pg_dump` (cron 03:15). Cron semanal chama `api/cron-semanal` (envia e-mails reais: **não execute à mão**).
- `reversa-gov-suite` é outro projeto (Vercel) que divide o banco; não foi migrado.
- **Endurecimento da VPS pendente** (aguarda André): limitar tentativas de login SSH a 4, com bloqueio de 1 hora (fail2ban), liberando antes o IP da sessão dele para não o trancar para fora; identificar o que são as portas 3110, 3111 e 2000 (abertas ao mundo, não são do Reversa) antes de qualquer firewall. A senha de root **não** será trocada hoje (decisão do André). Todo comando na VPS é executado pelo próprio André no terminal dele; senhas nunca passam pelo chat.

## 6. Como falar com o André

Respostas curtas, em português, sem jargão. Diga o que mudou, o que passou nos testes e o que ainda depende dele (ex.: PDFs, links, OK para mergear). Quando houver escolha, mostre 2 ou 3 alternativas antes de executar.
