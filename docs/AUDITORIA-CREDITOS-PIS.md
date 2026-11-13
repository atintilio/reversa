# Auditoria do fluxo de créditos de PIS/COFINS — o que está funcional e o que não está

> Revisado em 13/11/2026, na branch `feat/motores-sped`, a partir do código do repositório
> (`motor-creditos.js`, `retificadora-efd.js`, `validador-efd.js`, `retificadora-guard.js`,
> `lib/domain/execucao.js`, `execucao.html`) e das fontes oficiais do Portal do SPED.
> Cada afirmação aqui aponta um arquivo ou um teste — nada aqui é afirmação sem prova.

## 1. A pergunta: o Reversa está preparado para créditos de PIS? É escalável?

**Resposta curta:** o caminho do cliente até o *pacote de transmissão* está fechado, testado e
com trava de segurança. A partir dali, transmissão e PER/DCOMP são passos manuais — por desenho,
porque dependem do certificado digital do cliente e dos sistemas da Receita (DCTFWeb e PER Web).
Ou seja: **escala no que é software e não escala no que é systems de governo.** O que estava
faltando era justamente a trava que impedia um arquivo quebrado de andar até o cliente — e ela
existia só pela metade. Foi corrigida nesta rodada (seção 4).

## 2. O caminho completo, etapa por etapa

| Etapa | Onde está | Situação | Como se prova |
|---|---|---|---|
| Ler a EFD-Contribuições | `motor-creditos.js` → `lerEfdContribuicoes` | **Funcional** | `tests/motor-creditos.test.js` |
| Apurar as teses (Tema 69, ICMS-ST, monofásicos, insumos, risco Lei 14.592, saldo credor) | `motor-creditos.js` → `apurar` | **Funcional** | `tests/motor-creditos.test.js` |
| Gerar a retificadora | `retificadora-efd.js` → `gerar` | **Funcional, com limites declarados** | `tests/retificadora.test.js` (RET-001 a RET-005) |
| Pré-validar (estrutura, somas, totalizadores) | `validador-efd.js` → `validar` | **Funcional** (é "PVA simulado", não substitui o PVA) | `tests/retificadora.test.js` (RET-001) |
| Liberar/baixar/registrar/aprovar | `execucao.html` + `lib/domain/execucao.js` | **Funcional, com trava nova** | `tests/retificadora-guard.test.js`, `tests/execucao.test.js` |
| Validação do contador | `lib/domain/execucao.js` → `sendAccountant` | **Funcional** | `tests/execucao.test.js` (EXE-003) |
| Transmitir | fase `transmitido` | **Manual** — o operador registra o recibo | `tests/execucao.test.js` (EXE-003) |
| Ler a posição de créditos por origem (Bloco 1) | `motor-creditos.js` → `creditosPosicao` | **Funcional** | `tests/pacote-pis.test.js` |
| Montar o material de PER/DCOMP (posição + o que dá para pedir + CSV) | `pacote-pis.js` + `index.html` | **Funcional** — ligado à tela e à memória técnica | `tests/pacote-pis.test.js`, `tests/pacote-pis-ui.test.js` |
| Decidir a via (PER × DCOMP), calcular o saldo e o prazo, gerar a ficha do pedido | `motor-pedido.js` + `index.html` | **Funcional** — pela regra oficial da Receita, com fundamento e pendências | `tests/motor-pedido.test.js` |
| Transmitir o pedido no PER/DCOMP Web | e-CAC (certificado do cliente) | **Manual** — o contador transmite; o Reversa entrega a ficha | idem |
| PER/DCOMP | fase `perdcomp` | **Manual** — o operador registra o recibo | idem |

### O que a retificadora cobre (e o que não cobre)

Cobre, com geração automática:
- **Tema 69** — exclusão do ICMS da base do PIS/COFINS (redução de base e de valor nos itens,
  no documento, no M200/M210/M600/M610 e no M205/M605 por código de receita).
- **Tema 1.125** — exclusão do ICMS-ST da base do substituído.

**Não** cobre (e o sistema diz isso na tela, em vez de fingir):
- **Monofásicos** (farmacêuticos, perfumaria, autopeças): exigem trocar o CST para 04 e informar a
  receita no M400/M410 com a natureza da receita (tabela da Receita por NCM). Não é gerado
  automaticamente — é decisão humana.
- **Alíquota por unidade de medida de produto** (COD_CONT 03/53): o gerador recusa com erro
  explícito, porque não sabe a que linha do M210 o item pertence.
- **PER/DCOMP**: o produto entrega os *números* (base, valor apurado, código de receita por
  competência) e o arquivo retificado. O pedido no PER Web é feito pelo contador/cliente.

## 3. O que foi conferido contra a fonte oficial (e mudou de opinião)

Duas conferências no Guia Prático da EFD Contribuições v1.35 (Portal do SPED, PDF oficial,
atualização de 18/06/2021, SHA-256 conferido):

1. **Leiaute do M210 vigente a partir de 01/01/2019** (16 campos). Confere com o código:
   `COD_CONT` no campo 02, `VL_BC_CONT` no 04, `VL_BC_CONT_AJUS` no 07, `ALIQ_PIS` no 08,
   `ALIQ_PIS_QUANT` no 10, `VL_CONT_APUR` no 11, `VL_CONT_PER` no 16. E o campo 13
   (`VL_CONT_PER`) = 11 + 12 − 13 − 14 + 15, exatamente como o pré-validador exige.
2. **Tabela 4.3.5 (COD_CONT)**. Confere o mapeamento usado pelo gerador: alíquota 1,65% (PIS) /
   7,6% (Cofins) ⇒ COD_CONT 01/02 (não cumulativa); alíquota 0,65% / 3% ⇒ COD_CONT 51/52
   (cumulativa). O código confere.

**A tabela também revelou um defeito que foi corrigido:** a chave do registro M210 é
`COD_CONT` + `ALIQ_PIS_QUANT` + `ALIQ_PIS` (o próprio Manual diz isso). O gerador reduzia a
primeira linha de M210 que tivesse o COD_CONT do item — sem olhar a alíquota e sem avisar quando
havia mais de uma. Num arquivo com duas linhas de M210 de mesmo COD_CONT e alíquotas diferentes,
a redução caía na linha errada e o arquivo saía com base e apuração erradas, sem nenhum aviso.
Agora a redução só vai para a linha com o **mesmo COD_CONT e a mesma alíquota** do item, e quando
há mais de uma candidata a geração **falha com erro**, em vez de adivinhar
(`tests/retificadora.test.js` RET-004 e RET-005 — os dois testes falham na versão anterior e
passam na atual).

## 4. A trava de segurança que faltava (corrigido nesta rodada)

O ponto de partida: o servidor bloqueava a aprovação se algum arquivo registrado tivesse erro de
pré-validação, mas **o resto do caminho não era trancado**. Um arquivo com erro de pré-validação
ainda podia ser baixado, ainda entrava no .zip e ainda era registrado no caso. E a aprovação
passava com **zero** arquivos registrados, porque a condição era "nenhum arquivo com erro" — lista
vazia satisfaz a condição.

A regra nova está em `retificadora-guard.js` (uma função só, usada pela tela e pelo servidor, para
que os dois não discordem):

| Situação | Antes | Agora |
|---|---|---|
| Erro na pré-validação | baixava, compactava e registrava | **bloqueia** em tudo |
| Nenhum item alterado (nada a retificar) | registrava | **bloqueia** |
| Arquivo idêntico ao original | registrava | **bloqueia** |
| Aprovação sem nenhum arquivo registrado | liberava | **bloqueia** (`NO_ARTIFACTS`) |
| Registro de arquivo com erro | aceitava (200) | **rejeita** (`VALIDATION_ERRORS`) |

Testes: `tests/retificadora-guard.test.js` (7 casos, regra pura) e `tests/execucao.test.js`
(EXE-002, integração com banco em memória).

## 5. Lacunas conhecidas, que continuam abertas (e por quê)

1. **O bloco 1 (registros 1100 e 1500) passou a ser lido** (nesta rodada): posição de créditos por
   competência de origem, com o saldo disponível (`SD_CRED_DISP_EFD`), o usado por desconto/PER/DCOMP
   em período anterior e no período, o transferido e o saldo final. Sai em `creditosPosicao` e vira
   o **pacote operacional** (`pacote-pis.js`), que aparece na tela e na memória técnica.
   **O que continua manual:** o pedido no PER Web/DCTFWeb (transmissão, código de receita do DARF e a
   escolha entre PER e DCOMP) — decisão do contador. **Prioridade:** baixa (decisão de produto).
2. **Monofásicos** continuam manuais (decisão de CST + código de receita por NCM). **Impacto:**
   casos de revenda de monofásicos não podem ser automatizados ainda. **Prioridade:** baixa — a
   base legal é consolidada, mas o cadastro da natureza da receita por NCM é trabalho de dados.
3. **PER/DCOMP não é transmitido**: o produto entrega a base, o valor apurado, a **posição de créditos
   por origem** e agora a **decisão da via** (PER × DCOMP) com o fundamento, o prazo e a **ficha do
   pedido** no formato do roteiro oficial da Receita (`motor-pedido.js`; detalhes em
   `docs/DECISAO-PER-DCOMP.md`). A transmissão no PER/DCOMP Web continua manual — exige o certificado
   digital do cliente e não há API pública da Receita para isso. **Prioridade:** baixa (decisão de
   produto).
4. **O pré-validador é um simulador**: não reproduz o PVA oficial (cruzamentos, tabelas
   dinâmicas, assinaturas). O arquivo final precisa passar no PVA da Receita e ser assinado com
   certificado. O código diz isso na tela; a retificadora gera XML de eSocial, mas **a assinatura
   digital dos XML não está implementada** (a compra do certificado é prioridade do André).

## 6. O que "pronto" significa a partir de agora

Um caso só pode ser dado como entregue quando o arquivo **passa pelo fluxo inteiro** — leitura,
apuração, retificadora, pré-validação, liberação, registro e aprovação — e a trava da
`retificadora-guard.js` libera o arquivo. Arquivo com erro, sem alteração ou idêntico ao original
não é entrega: é pendência humana, e aparece como tal na tela.
