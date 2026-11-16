# EFD-Contribuições — catálogo de leiautes (Guia Prático v1.35)

**Fonte:** Guia Prático da EFD Contribuições, versão 1.35 (atualização de 18/06/2021), Seção 3 –
"Leiaute dos Registros dos BLOCOS". PDF do Portal do SPED
(`gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf`).
SHA-256 do PDF: `60eace4591692388…` (completo no cabeçalho do catálogo).

**Extração:** por script, sem IA (`scripts/extrai-guia-contrib.py` sobre o texto extraído com
`pdftotext -layout`). A reconciliação com a base do python-sped (MIT) e com o motor do Reversa é
feito em `scripts/reconcilia-efd-contrib.js`.

## Resultado

| Item | Valor |
|---|---|
| Registros no catálogo | **203** |
| Registros completos (sequência 1..N, começando em REG) | **203 (100%)** |
| Campos | **1.712** |
| Nomes reparados (o PDF corta o nome na quebra de linha) | 29 |
| Divergências de nome entre PDF e base/motor | 23 |
| Registros em que a base do python-sped está de um leiaute anterior | 21 |
| Posições sem tipo/tamanho no PDF (vindas da base, com marcação) | 22 registros (1 a 5 posições cada) |

Antes desta extração o catálogo de Contribuições não existia; o handoff apontava 46 tabelas
pendentes. Agora todos os 203 registros do Guia v1.35 estão fechados.

## Onde o PDF e a base divergem (vale o PDF)

- **C100**: a base do python-sped tem `COD_SIT;` (erro de digitação) e `CHV_NFE` duplicado, o que
  desloca todo o resto em uma posição. O PDF oficial dá a sequência correta
  (`... 8:NUM_DOC 9:CHV_NFE 10:DT_DOC 11:DT_E_S 12:VL_DOC 13:IND_PGTO 14:VL_DESC 15:VL_ABAT_NT 16:VL_MERC ...`).
- **M210 / M610**: a base traz o leiaute anterior ao de 01/01/2019 (13 campos). O PDF oficial traz o
  vigente (16 campos: `VL_AJUS_ACRES_BC_PIS`, `VL_AJUS_REDUC_BC_PIS`, `VL_BC_CONT_AJUS`,
  `QUANT_BC_PIS`, `ALIQ_PIS_QUANT`, `VL_CONT_PER`) — é o leiaute que o Reversa já usava.
- **C870 / C880**: a base é de um leiaute anterior (sem `COD_ITEM`, `QUANT_BC_PIS`, `ALIQ_PIS_QUANT`).
- **0120**: campo 2 é `MES_REFER` no PDF (a base diz `MES_DISPENSA`); a descrição oficial é
  "Mês de referência do ano-calendário da escrituração sem dados".
- **C181 / C185**: os nomes oficiais separam PIS e COFINS (`CST_PIS`/`CST_COFINS`,
  `VL_BC_PIS`/`VL_BC_COFINS`, `ALIQ_PIS`/`ALIQ_COFINS`, `VL_PIS`/`VL_COFINS`); a base usa rótulo
  genérico (`CST`, `VL_BC`, `ALIQ`, `VL_TRIB`). O Reversa mantinha o rótulo genérico por interno;
  a tradução está em `scripts/gera-leiautes-motor.js` (tabela `TRADUCAO`), e a **posição não muda**.

Lista completa campo a campo: `_extraidos/relatorio-reconciliacao-efd-contribuicoes.txt`.

## Registros que o PDF entrega com 3 dígitos no número do campo
`F111` e `F129` (Processo Referenciado) usam `001 REG`, `002 NUM_PROC`, `003 IND_PROC`.

## O que ainda não está feito
- O catálogo do **leiaute 021 (2027)** da EFD-Contribuições (NT 2026.001) não existe; este catálogo
  é o v1.35 (vigente até 31/12/2026).
- As posições herdadas da base do python-sped **não têm tipo, tamanho e decimais** — estão marcadas
  no relatório; o tipo delas só sai do PDF.
