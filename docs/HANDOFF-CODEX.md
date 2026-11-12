# Handoff para o Codex — Reversa: catálogo de leiautes SPED e migração para a VPS

> Escrito em 12/11/2026 (~16:40, horário de Brasília) pelo Claude, a pedido de André Tintilio, que chegou no limite semanal e precisa que o trabalho continue.
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

## 2. Objetivo desta frente

Criar um **catálogo único e oficial de leiautes SPED** (registro → campos com tipo, tamanho, decimais, obrigatoriedade) em `lib/sped/leiautes/`, fazer os motores do Reversa lerem dele, e manter os resultados **idênticos** nos dados de teste. Fontes oficiais fornecidas pelo André (PDFs anexados na conversa; se precisar, peça de novo):

| Escrituração | Documento oficial | Estado |
|---|---|---|
| EFD ICMS/IPI | Guia Prático v3.2.4 (30/07/2026), leiaute 020 (2026) | **Pronto**: `lib/sped/leiautes/efd_icms_ipi.json` (254 de 270 registros completos) |
| EFD ICMS/IPI 2027 | Nota Técnica 2026.001 v1.0, leiaute 021 (vigência 01/01/2027) | Extração por IA (menos confiável): `efd_icms_ipi.nt2026-001.json` |
| EFD-Contribuições | Guia Prático v1.35 | Em andamento por subagente → `efd_contribuicoes.json` |
| ECD | Manual leiaute 9 (jan/2026) | Em andamento por subagente → `ecd.json` |
| ECF | Manual leiaute 12 (AC 2025/2026) | Em andamento por subagente → `ecf.json` |

Os arquivos `*.base.json` são a base do python-sped (MIT), **sem tamanhos e com defeitos conhecidos** (ver `lib/sped/leiautes/LEIAME.md`). Não use como fonte final; só para comparação.

## 3. O que já foi feito (e está commitado na branch)

- `lib/sped/leiautes/efd_icms_ipi.json`: Guia 3.2.4 lido por script (`scripts/extrai-guia-efd.py` + `scripts/reconcilia-efd-icms.js`), sem IA. 97 nomes truncados pela quebra de linha do PDF foram reparados com a NT 2026.001.
- `motor-efd-icms.js`: passa a ler `IND_BENEFICIO` (C197 campo 9, E111 campo 5; Guia 3.2.3+, LC 214/2025). Arquivos sem o campo seguem válidos e **não geram aviso** (constante `CAMPOS_NOVOS`). Teste novo em `tests/motor-efd-icms.test.js`. 13 testes passando.
- `THIRD_PARTY_NOTICES.md` com o aviso MIT do python-sped.
- Achados confirmados: o C100 da EFD-Contribuições do python-sped está defeituoso (`COD_SIT;` e `CHV_NFE` duplicado); o M210 do python-sped é o leiaute antigo. **Onde catálogo e motor divergem, vale o motor atual até conferir no PDF.**

## 4. O que falta (em ordem)

### 4.1 Fechar os 3 catálogos que os subagentes estão gerando
Cada subagente deve entregar: `scripts/extrai-*.py`, o `.json` correspondente em `lib/sped/leiautes/` e um relatório em `lib/sped/leiautes/_extraidos/relatorio-*.md`. **Verifique se existem e se estão completos** (`git status`, `ls lib/sped/leiautes`). Se um deles não terminou:
- texto já extraído dos PDFs está em `/tmp/.../scratchpad/txt/*.txt` (pode ter sido apagado); para refazer: `pdftotext -layout <pdf> <txt>`;
- use `scripts/extrai-guia-efd.py` como modelo: lê linhas `Nº Campo Descrição Tipo Tam Dec Obrig`, detecta cabeçalho `REGISTRO XXXX:`, e marca `completo=false` com `posicoes_faltantes` quando a sequência 1..N não fecha;
- armadilhas do `pdftotext`: nome de campo cortado pela quebra de linha, coluna de decimais vazia ou com 1 dígito, linha de campo com o nome em outra linha, colunas de obrigatoriedade por perfil.

### 4.2 Completar os 15 registros incompletos da EFD ICMS/IPI
B035, C115, C165, C173, C180, C181, C185, C350, C500, D190, D690, D696, D750, K275, K280 (lista e posições faltantes em `efd_icms_ipi.json`, campo `posicoes_faltantes`). Abra a página do PDF (`pdftotext -layout -f N -l M` ou veja a imagem) e complete **só** o que estiver escrito. Registros que só existem na NT 2027 (por exemplo C591) ficam marcados como "só leiaute 021".

### 4.3 Migrar os motores para o catálogo, um por vez
Ordem sugerida: `motor-efd-icms.js` → `motor-creditos.js` (EFD-Contribuições, mapa `var L` na linha ~92) → `motor-ecd.js` → `motor-ecf.js`. Regra de aceite de cada migração: **mesmos resultados** nos testes atuais e nos arquivos de teste (inclui o conjunto GTW Transportes 2022–2025 que o André tem; os `demo-sped.js` do repositório servem de amostra). Primeiro escreva um teste de "paridade" (saída antes = saída depois), depois migre. Um motor por commit.

### 4.4 Suporte ao leiaute 021 (2027)
Depois que o 2026 estiver estável: ler `COD_VER` e escolher o catálogo do ano; tratar registros/campos novos (35 registros mudam entre o Guia 3.2.4 e a NT 021; o C591 é novo; o `1601` ganha `TOT_VS`, `TOT_ISS`, `TOT_OUTROS`). A NT 021 extraída por IA tem erros conhecidos (por exemplo, perdeu `VL_MERC` no C100): **valide no PDF da NT antes de usar** (pegar de `gov.br/sped`, EFD ICMS/IPI, manuais e documentos técnicos; o sandbox do Claude não conseguia baixar esses PDFs, mas o texto da NT 2026.001 abriu pelo WebFetch).

### 4.5 eSocial (próxima fase, ainda não começou)
Portar tabelas e validações S-1.3 do `erpbrasil/esociallib` (MIT) para `motor-esocial.js` e `retificadora-esocial.js`; preparar assinatura XML para o certificado digital que o André vai comprar (prioridade zero dele: certificado + procurações). Nada disso foi iniciado.

### 4.6 Reforma Tributária (CBS/IBS 2027)
Pedido do André: o motor lê o regime de 2026 e já se projeta para a CBS de 2027. Ainda não foi verificado se existe no código; usar o módulo de reforma do `mcp-fiscal-brasil` só como referência (reescrever, MIT).

## 5. Como validar (checklist antes de dizer "pronto")

1. `node --test tests/motor-efd-icms.test.js tests/motor-creditos.test.js tests/motor-ecd.test.js tests/motor-ecf.test.js` sem falhas.
2. `node scripts/compara-leiautes.js` e `node scripts/junta-nt2026.js` para ver divergências motor × catálogo.
3. Para cada catálogo: toda posição 1..N presente, 1º campo `REG`; registros incompletos listados, não escondidos.
4. Rodar `git diff --stat` e conferir que nada fora do escopo mudou.
5. Antes de `git push`: confirmar que a branch é `feat/motores-sped` (`git branch --show-current`). O repositório tem um hook que cobra commit/push de arquivos novos; commit pequeno, mensagem clara em português.

## 6. Infra (VPS) — estado e pendências, para não quebrar nada

- O Reversa roda **na VPS** (nginx → app na porta 3300, banco na **Neon**, não local). Domínios `reversa.argusprime.com.br` e `reversa-gov.argusprime.com.br` já apontam para a VPS (Cloudflare, SSL estrito). O Vercel antigo fica como plano de recuo por cerca de 7 dias; **não apague a conta nem o projeto no Vercel** (a integração com a Neon depende dele).
- Backup: espelho diário da Neon para um banco local + `pg_dump` (cron 03:15). Cron semanal chama `api/cron-semanal` (envia e-mails reais: **não execute à mão**).
- `reversa-gov-suite` é outro projeto (Vercel) que divide o banco; não foi migrado.
- **Endurecimento da VPS pendente** (aguarda André): limitar tentativas de login SSH a 4, com bloqueio de 1 hora (fail2ban), liberando antes o IP da sessão dele para não o trancar para fora; identificar o que são as portas 3110, 3111 e 2000 (abertas ao mundo, não são do Reversa) antes de qualquer firewall. A senha de root **não** será trocada hoje (decisão do André). Todo comando na VPS é executado pelo próprio André no terminal dele; senhas nunca passam pelo chat.
- Troca da senha da Neon: só depois de atualizar `/etc/reversa.env` e a `reversa-gov-suite`, e só com o OK do André.

## 7. Como falar com o André

Respostas curtas, em português, sem jargão. Diga o que mudou, o que passou nos testes e o que ainda depende dele (ex.: PDFs, links, OK para mergear). Quando houver escolha, mostre 2 ou 3 alternativas antes de executar.
