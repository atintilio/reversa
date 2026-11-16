# Catálogo de leiautes SPED

Cada arquivo `*.json` neste diretório é um **catálogo oficial**: registro → campos com nome, tipo,
tamanho, decimais e obrigatoriedade, extraído por script do PDF oficial (sem IA na extração).

## Arquivos

| Arquivo | Fonte oficial | Estado |
|---|---|---|
| `efd_icms_ipi.json` | Guia Prático da EFD ICMS/IPI v3.2.4 (30/07/2026) | 269 de 270 registros completos (2.204 campos); nomes reparados com a NT 2026.001 quando o PDF os corta |
| `efd_icms_ipi.nt2026-001.json` | Nota Técnica 2026.001 v1.0 (leiaute 021, vigência 01/01/2027) | extração por IA, menos confiável — usar só como referência |
| `efd_contribuicoes.json` | Guia Prático da EFD Contribuições v1.35 (Seção 3 – Leiaute dos Registros) | **203 de 203 registros completos, 1.712 campos** |
| `ecd.json` | Manual de Orientação do ECD, leiaute 9 (jan/2026) | 72 registros (70 completos + I550/I555 parametrizados) |
| `ecf.json` | Manual de Orientação da ECF, leiaute 12 (AC 2025/2026) | 188 registros, 188 completos, 1.097 campos |
| `leiaute-efd-contribuicoes.js` | gerado de `efd_contribuicoes.json` | o que o `motor-creditos.js` carrega |
| `leiaute-efd-icms-ipi.js` | gerado de `efd_icms_ipi.json` | o que o `motor-efd-icms.js` carrega |
| `../tabelas/codigos-credito.json` | Guia Prático da EFD Contribuições v1.35 (tabelas 4.3.6, 4.3.7 e 4.3.8) | 28 tipos de crédito, 18 bases de cálculo, 9 ajustes |
| `*.base.json` | python-sped (MIT) | só para comparação; **não usar como fonte final** |

## Cadeia de verdade

```
PDF oficial (gov.br/sped)  ->  scripts/extrai-*.py  ->  catálogo .json  ->  scripts/gera-leiautes-motor.js  ->  leiaute-*.js  ->  motor
```

O passo que pega o catálogo oficial e gera o leiaute do motor é `scripts/gera-leiautes-motor.js`.
O teste `tests/paridade-leiautes.test.js` refaz essa geração e compara: se o arquivo do motor
divergir do catálogo, a suíte falha. O mesmo teste prova que **a leitura não muda** (mesmo arquivo,
mesmo resultado) nos EFD-Contribuições reais dos fixtures e num arquivo de EFD ICMS/IPI.

Para regerar depois de mudar um catálogo:

```bash
python3 -I scripts/extrai-guia-contrib.py /workspace/fontes/guia_efd_contribuicoes_1_35.txt \
  lib/sped/leiautes/_extraidos/efd_contribuicoes.guia-1.35.json "<origem>" <pdf>
node scripts/reconcilia-efd-contrib.js
node scripts/gera-leiautes-motor.js
```

## Defeitos conhecidos da base do python-sped (conferidos contra os PDF oficiais)
- `efd_contribuicoes` C100: campo 6 está como `COD_SIT;` (erro de digitação) e `CHV_NFE` aparece duplicado (posições 9 e 10); tudo depois dele fica deslocado em 1. **O catálogo oficial corrige os dois.**
- `efd_contribuicoes` M210: leiaute antigo (13 campos). **O catálogo oficial traz o leiaute vigente (16 campos)**, que é o que o Reversa já usava.
- `efd_contribuicoes` C181/C185: os nomes oficiais distinguishes PIS e COFINS (`CST_PIS`/`CST_COFINS`, `VL_BC_PIS`/`VL_BC_COFINS`, `ALIQ_PIS`/`ALIQ_COFINS`, `VL_PIS`/`VL_COFINS`); a base usa rótulo genérico (`CST`, `VL_BC`, `ALIQ`, `VL_TRIB`).
- `efd_contribuicoes` C870/C880: a base é de um leiaute anterior (sem `COD_ITEM`, `QUANT_BC_PIS`, `ALIQ_PIS_QUANT`).
- EFD ICMS/IPI: a base cobre 201 registros e não traz os campos de COD_VER 019 a 021.

## Ordem de carregamento no navegador
No navegador o motor captura o leiaute **no carregamento do script**. Se o `leiaute-*.js` vier
depois do motor, o motor cai na tabela legada (que não tem, por exemplo, o Bloco 1 `1100`/`1500`)
e o arquivo é lido errado — sem erro visível na tela. As páginas que usam motor e leiaute
(`index.html`, `execucao.html`) carregam **o leiaute antes do motor**, e o teste
`tests/pacote-pis-ui.test.js` trava essa ordem.

Onde catálogo e motor divergem, **vale o catálogo oficial** (o PDF manda em posição, tipo, tamanho,
decimais e obrigatoriedade). A base e o motor só servem para consertar **nomes cortados** pelo PDF
e para conferir divergências — todas listadas em `_extraidos/relatorio-reconciliacao-efd-contribuicoes.txt`.

## Nomes repetidos no leiaute oficial
No C170 da EFD ICMS/IPI o nome `ALIQ_PIS` aparece em dois campos (alíquota percentual e alíquota em
reais), e o mesmo vale para `ALIQ_COFINS`. O leiaute do motor distingue com nome interno
(`ALIQ_PIS_PERC`, `ALIQ_PIS_REAIS`, `ALIQ_COFINS_PERC`, `ALIQ_COFINS_REAIS`) — o nome gravado na
saída do Reversa não muda. A tradução está em `scripts/gera-leiautes-motor.js` (tabela `TRADUCAO`
e `ICMS_NOMES`) e é conferida pelo teste de paridade.
