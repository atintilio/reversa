# Catálogos oficiais e ligação com os motores — o que mudou

Data: 13/11/2026 · Branch: `feat/motores-sped` · Base do handoff: `47f99a0`

## Resumo para o André (sem jargão)

O Reversa passou a ler o **leiaute dos registros fiscais direto do catálogo oficial extraído do PDF
da Receita**, em vez de uma lista de campos escrita à mão no motor. E o teste novo garante que
**isso não muda nenhum resultado**: o mesmo arquivo lido do jeito antigo e do jeito novo dá
exatamente a mesma saída — testado nos arquivos reais de EFD-Contribuições que já estavam no
repositório (`tests/fixtures/grupo-mateus/fiscal/`).

O que estava em aberto no handoff e o estado agora:

| Item do handoff | Estado |
|---|---|
| Catálogo da EFD-Contribuições (46 tabelas pendentes) | **Fechado: 203 de 203 registros, 1.712 campos** |
| Teste de paridade antes de migrar | **Feito** (`tests/paridade-leiautes.test.js`, 10 testes) |
| `motor-efd-icms.js` ligado ao catálogo | **Feito**, sem mudar o resultado |
| `motor-creditos.js` (EFD-Contribuições) ligado ao catálogo | **Feito**, sem mudar o resultado |
| Catálogo da ECD e da ECF | Prontos (188/188 e 72 registros) — **ainda não ligados aos motores** |
| Divergências reais da ECF (`motor-ecf.js` lia um leiaute que não existe) | **Corrigido** — o motor agora lê o leiaute 12 (Manual de Orientação da ECF) |
| Pacote operacional de PIS (créditos + PER/DCOMP) | **Feito e ligado à tela** — o Bloco 1 (1100/1500) é lido pelo motor, a posição de créditos e o material de PER/DCOMP entram na memória técnica e no CSV |
| Decidir a via (PER × DCOMP) e gerar o pedido | **Feito** — `motor-pedido.js` decide pela regra oficial da Receita, com fundamento e pendências, e gera a ficha do pedido (CSV) |
| 15 registros incompletos do catálogo ICMS/IPI | **Fechados** (B035, C115, C165, C173, C180, C181, C185, C350, C500, D190, D690, D696, D750, K275, K280) — falta só o C591, que só existe no leiaute 021/2027 |

## O que foi feito, arquivo por arquivo

### 1. Trava de liberação da retificadora (pendência do handoff, fechada)
- `retificadora-guard.js` (novo): uma única regra de liberação, usada pela tela (`execucao.html`) e
  pelo servidor (`lib/domain/execucao.js`): **erro de pré-validação, arquivo sem alteração efetiva
  ou arquivo idêntico ao original não saem**. Testes: `tests/retificadora-guard.test.js` (7) e
  `tests/execucao.test.js` (4).
- `retificadora-efd.js`: correção do **M210** — a redução agora casa por **COD_CONT + alíquota**
  (chave oficial do Guia v1.35: `COD_CONT; ALIQ_PIS_QUANT; ALIQ_PIS`); quando a chave aparece em duas
  linhas, o programa **erra em vez de escolher** ("aparece em 2 linhas"). Testes RET-004/RET-005
  (`tests/retificadora.test.js`) — falham na versão antiga e passam na nova.

### 2. Catálogos oficiais
> Esta frente teve duas sessões de agente: a do remoto (que fechou os 15 registros quebrados do
> catálogo ICMS/IPI, com correções conferidas nas tabelas do Guia 3.2.4) e a desta (que fechou o
> catálogo da EFD-Contribuições e ligou os motores). As duas foram mescladas nesta branch.
- `lib/sped/leiautes/efd_contribuicoes.json` (novo, 203 registros): extraído do **Guia Prático da
  EFD Contribuições v1.35** por `scripts/extrai-guia-contrib.py` + `scripts/reconcilia-efd-contrib.js`.
  Relatório: `lib/sped/leiautes/_extraidos/relatorio-efd-contribuicoes.md`.
- `lib/sped/leiautes/ecf.json` (novo, 188/188) e `lib/sped/leiautes/ecd.json` (novo, 72 registros)
  extraídos dos manuais oficiais por `scripts/extrai-manual-ecf.py` e `scripts/extrai-manual-ecd.py`.
- `lib/sped/leiautes/LEIAME.md`: reescrito com a cadeia de verdade, os defeitos conhecidos da base do
  python-sped e o que é `[VALIDAR]`.

### 3. Ligação dos motores com o catálogo (com prova de paridade)
- `scripts/gera-leiautes-motor.js` (novo): gera o leiaute que o motor carrega a partir do catálogo
  oficial (`lib/sped/leiautes/leiaute-efd-contribuicoes.js`, `leiaute-efd-icms-ipi.js`). Rodar com
  `--check` diz se os arquivos estão desatualizados.
- `motor-creditos.js` e `motor-efd-icms.js`: passam a usar o catálogo; a tabela antiga ficou como
  **reserva** (e serve de referência para o teste). O nome interno dos campos não mudou — a saída do
  Reversa é idêntica.
- `tests/paridade-leiautes.test.js` (novo, 10 testes): lê os **dois arquivos reais** de
  EFD-Contribuições do repositório do jeito novo e do jeito velho e compara; compara também a
  apuração (M200/M600/M210/M610); confere que o arquivo gerado está em dia com o catálogo.
- `index.html` e `execucao.html`: carregam o leiaute oficial antes do motor.

### 3b. Correção da ECF (leiaute 12)
- `motor-ecf.js`: o `0000` passa a ler o CNPJ no **campo 04** e `DT_INI`/`DT_FIN` nos **campos 10 e
  11**; o `M030`/`N030` traz `DT_INI`, `DT_FIN` e `PER_APUR`; o `M300`/`M350` traz o **valor no campo
  06** e o **TIPO_LANCAMENTO** (R = grupo/total, L = resultado, A = adição, E = exclusão); o
  `N500`/`N630`/`N650`/`N670` traz o **valor no campo 04**, e o imposto a pagar vem do
  "IMPOSTO DE RENDA A PAGAR" (N630, código 26 na tabela A) e do "CSLL A PAGAR" (N670, código 21).
- `tests/motor-ecf.test.js`: fixtures reescritas no leiaute oficial **com os mesmos números
  esperados** (R$ 34.000 de oportunidade, conferência da base, prazo, itens mantidos), mais 5
  testes que travam cada posição do leiaute.

### 4. Auditoria do fluxo de PIS
- `docs/AUDITORIA-CREDITOS-PIS.md`: o que o motor faz hoje, o que ainda é manual (transmissão,
  PER/DCOMP) e as lacunas (bloco 1 — 1100/1500 — não lido pelo motor; monofásicos manuais;
  assinatura digital e eSocial não implementadas).

### 5. Pacote operacional de PIS/COFINS (posição de créditos e material de PER/DCOMP)
- `motor-creditos.js` passa a ler o **Bloco 1** da EFD-Contribuições (registros `1100` = PIS e
  `1500` = Cofins) nas posições do **Guia Prático v1.35**: a chave do registro é
  `PER_APU_CRED + ORIG_CRED + CNPJ_SUC + COD_CRED`, e o saldo disponível vem do campo 12
  (`SD_CRED_DISP_EFD`). O que é lido: crédito apurado, extemporâneo e total, o que foi usado por
  **desconto/PER/DCOMP em período anterior**, o **saldo disponível**, o usado no período, o
  transferido e o saldo final. Cada crédito lido sai em `creditosPosicao`.
- `lib/sped/tabelas/codigos-credito.json` (novo) + `codigos-credito.js` (gerado): as tabelas oficiais
  de código de crédito, base de cálculo e ajustes do mesmo Guia (4.3.6, 4.3.7 e 4.3.8) — 28 tipos de
  crédito, 18 bases e 9 ajustes — extraídas por `scripts/extrai-tabelas-credito.py`. É daí que vem o
  rótulo que aparece na tela (ex.: *Crédito vinculado à receita tributada no mercado interno –
  Alíquota Básica*).
- `pacote-pis.js` (novo): monta o **pacote operacional** — a posição de créditos por origem e a lista
  do que há saldo para pedir, com as duas vias possíveis (**PER** = Pedido de Ressarcimento;
  **DCOMP** = Declaração de Compensação) e o valor já usado por cada via. Gera CSV com `;` e decimal
  com vírgula.
  **O que o pacote não faz:** não calcula tributo, não escolhe o tipo de pedido, não define o valor
  pedido e não transmite nada. A escolha é do Aprovador — está escrito na tela e no documento.
- `index.html`: nova seção **“Pacote de créditos (PER / DCOMP)”** (saldo disponível por tributo,
  tabela de créditos por origem e tabela de pedidos em aberto) com botão **Exportar pacote (CSV)**; e
  a **memória técnica (PDF)** ganha duas seções: a posição de créditos e o material de PER/DCOMP.
- Testes: `tests/pacote-pis.test.js` (7) e `tests/pacote-pis-ui.test.js` (4). A tela foi conferida no
  navegador com um EFD sintético: a seção aparece, os valores batem com o arquivo e o CSV baixa
  (`pacote-creditos-pis-cofins-2024-01.csv`).

### 6. Decisão do pedido: ressarcimento (PER) ou compensação (DCOMP)
- `motor-pedido.js` (novo): decide a via do pedido com base no **roteiro oficial da Receita** ("PER/DCOMP
  Web: Ressarcimento de PIS/Pasep e Cofins Não Cumulativos", PDF baixado em `/workspace/fontes/`):
  **PER primeiro** (ressarcimento) e **DCOMP depois**, vinculada — porque "uma declaração de compensação
  só pode ser elaborada se tiver sido transmitido um pedido de ressarcimento antes"; se não há débito
  próprio a compensar, a DCOMP não tem objeto e o caminho é só o PER. Aplica também o **prazo de 5
  anos** do encerramento do trimestre do crédito (CTN art. 168, I) e avisa quando o crédito **já foi
  objeto de PER** (campo 14 do 1100/1500).
- **Cálculo**: o saldo apurável sai pela fórmula do próprio PER/DCOMP Web (valores apurados − deduções e
  descontos − utilização em DCOMP anterior) e é confrontado com o **M100/M500** (crédito apurado no
  período) — a divergência entre o apurado e o declarado vira pendência, não passa batido.
- **Fundamento e pendências**: cada decisão sai com o trecho da regra e a lista do que falta (passibilidade
  do crédito no sistema, litígio, inconstitucionalidade, evento de sucessão, PER já transmitido, débitos
  próprios a compensar).
- **Ficha do pedido**: CSV no formato das abas do roteiro oficial (Identificar Documento → Identificação
  do Crédito → Valores Apurados → Saldo do Crédito → Demonstrativo) + botão **Abrir e-CAC** para o
  Aprovador transmitir. A memória técnica (PDF) traz a decisão com o fundamento.
- `motor-darf.js` passou a reconhecer **6912 (PIS/Pasep não cumulativo)** e **5856 (Cofins não cumulativa)**
  — é o DARF pago que diz se existe débito próprio a compensar.
- Testes: `tests/motor-pedido.test.js` (10, incluindo o fluxo EFD → motor → pacote → decisão).
- O que **não** é automático: a transmissão é feita pelo Aprovador no PER/DCOMP Web (e-CAC, com
  certificado digital do cliente). Não existe API pública da Receita para isso.
- Detalhamento e fontes: `docs/DECISAO-PER-DCOMP.md`.

### 7. Defeito encontrado e corrigido ao ligar a tela
No navegador os leiautes eram carregados **depois** dos motores: o motor capturava a tabela legada e o
registro `1100`/`1500` não era lido (o arquivo aparecia como “ERRO — ... reading 'PER_APU_CRED'”).
No Node o mesmo motor funcionava, porque o `require` acontece na hora da leitura — **o teste de
paridade não pegaria isso**. A ordem dos scripts foi corrigida em `index.html` e travada por teste.

## Divergências reais que a reconciliação encontrou (o PDF manda)

- **C100** (Contribuições): a base do python-sped tinha `COD_SIT;` e `CHV_NFE` duplicado, deslocando
  todo o registro em uma posição. **O motor do Reversa já estava certo**; o catálogo oficial
  confirma.
- **M210/M610**: a base tem o leiaute antigo (13 campos); o vigente tem 16 — é o que o Reversa usa.
- **C870/C880**: a base é de um leiaute anterior.
- **0120**: o campo 2 é `MES_REFER` (a base diz `MES_DISPENSA`).

## Pendências (o que NÃO está pronto)

1. **Uma ECF real para conferir.** O motor da ECF agora lê o leiaute 12 (posições conferidas no
   Manual de Orientação da ECF e nas tabelas dinâmicas oficiais), e os testes foram reescritos no
   leiaute oficial **mantendo os mesmos números esperados**. Ainda assim: o repositório não tem
   arquivo de ECF real (os fixtures são de EFD-Contribuições). Antes de mostrar número de IRPJ/CSLL
   de cliente, o Aprovador precisa conferir uma ECF real. O motor tem a rede de segurança: se a base
   declarada (N500) não bater com a base recalculada, o trimestre vai para "revisão" e não entra no
   valor.
2. **Leiaute 021 (2027)** da EFD ICMS/IPI (NT 2026.001): a extração existe
   (`efd_icms_ipi.nt2026-001.json`) mas é por IA e não foi conferida; o C591 só existe nele.
3. **`motor-ecd.js` e `motor-ecf.js` ainda não leem o catálogo** — só o ICMS/IPI e o Contribuições.
   (O `motor-ecd.js` confere com o leiaute 9 nas posições que usa.)
4. **Transmissão do PER/DCOMP**: a decisão da via, o valor apurável, o prazo, o fundamento e a ficha
   do pedido já estão prontos (`motor-pedido.js`). Falta o que **depende do certificado do cliente e do
   sistema da Receita**: o **envio** no PER/DCOMP Web (e-CAC) e a conferência do **código de receita do
   DARF** (o Guia não traz o código do pedido; não foi inventado).
5. **Assinatura digital e eSocial**: não implementados (continua manual).
