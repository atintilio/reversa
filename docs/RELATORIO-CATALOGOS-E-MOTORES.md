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
| Divergências reais da ECF (`motor-ecf.js` lê um leiaute que não existe) | **Ainda não corrigido** — ver "Pendências" |
| Pacote operacional de PIS (créditos + PER/DCOMP) | **Ainda não começado** |
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

### 4. Auditoria do fluxo de PIS
- `docs/AUDITORIA-CREDITOS-PIS.md`: o que o motor faz hoje, o que ainda é manual (transmissão,
  PER/DCOMP) e as lacunas (bloco 1 — 1100/1500 — não lido pelo motor; monofásicos manuais;
  assinatura digital e eSocial não implementadas).

## Divergências reais que a reconciliação encontrou (o PDF manda)

- **C100** (Contribuições): a base do python-sped tinha `COD_SIT;` e `CHV_NFE` duplicado, deslocando
  todo o registro em uma posição. **O motor do Reversa já estava certo**; o catálogo oficial
  confirma.
- **M210/M610**: a base tem o leiaute antigo (13 campos); o vigente tem 16 — é o que o Reversa usa.
- **C870/C880**: a base é de um leiaute anterior.
- **0120**: o campo 2 é `MES_REFER` (a base diz `MES_DISPENSA`).

## Pendências (o que NÃO está pronto)

1. **`motor-ecf.js` lê um leiaute que não existe.** Conferido contra o PDF oficial do Manual da ECF
   (leiaute 12) e contra as tabelas dinâmicas:
   - registro `0000`: o CNPJ está no **campo 04** (o motor lê o 06) e `DT_INI`/`DT_FIN` estão nos
     **campos 10 e 11** (o motor lê um registro "M030" que não existe no leiaute);
   - `M300`/`M350`: o **valor está no campo 06** (o motor lê o 04) e o tipo vem de
     `TIPO_LANCAMENTO` (A/E/P/L/R);
   - `N500` código '1' (base de IRPJ), `N650` código '1' (base de CSLL), `N630` código '26'
     (IRPJ a pagar; '3' = 15%, '4' = adicional), `N670` código '21' (CSLL a pagar).
   **Não corrigi às cegas**: trocar a posição de um valor de IRPJ/CSLL sem uma ECF real para conferir
   pode trocar erro por erro em número de cliente. O que falta é uma ECF real de teste — a do
   repositório (`tests/fixtures/`) é de EFD-Contribuições, não de ECF.
2. **Leiaute 021 (2027)** da EFD ICMS/IPI (NT 2026.001): a extração existe
   (`efd_icms_ipi.nt2026-001.json`) mas é por IA e não foi conferida; o C591 só existe nele.
3. **`motor-ecd.js` e `motor-ecf.js` ainda não leem o catálogo** — só o ICMS/IPI e o Contribuições.
4. **Pacote operacional de PIS** (créditos por origem + PER/DCOMP com competência, tipo de pedido,
   valor, código de receita, saldo e arquivo exportável para o contador): não começado.
5. **Assinatura digital e eSocial**: não implementados (continua manual).
