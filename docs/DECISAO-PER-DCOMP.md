# Decisão do pedido: ressarcimento (PER) ou compensação (DCOMP)

> Data: 13/11/2026 · Branch: `feat/motores-sped`
> Fonte oficial: **"PER/DCOMP Web: Ressarcimento de PIS/Pasep e Cofins Não Cumulativos"** — Receita
> Federal (https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/restituicao-ressarcimento-reembolso-e-compensacao/per_dcomp-web_-ressarcimento-de-pis_pasep-e-cofins-nao-cumulativos.pdf),
> guardado em `/workspace/fontes/per_dcomp_web_pis_cofins.pdf`, mais o **Guia Prático da EFD
> Contribuições v1.35** (registros 1100/1500).
> Tudo que o motor afirma neste documento está ancorado nessa fonte; o que não está nela aparece
> como pendência, nunca como certeza.

## O que o Reversa faz agora

1. **Lê** a posição de créditos por origem do Bloco 1 (`motor-creditos.js` → `creditosPosicao`) e o
   crédito apurado no período (`M100`/`M500` → `creditosApurados`).
2. **Calcula** o crédito, o saldo apurável, o **tributo apurado** (M200/M600: o "Total dos Débitos
   deste Documento" da DCOMP) e o prazo, pela mesma fórmula do PER/DCOMP Web.
3. **Decide a via** (PER, DCOMP ou as duas, nessa ordem) e **diz por quê**, com o trecho da regra.
4. **Entrega a ficha** do pedido no formato das abas do roteiro oficial (CSV), para o contador
   conferir e transmitir no PER/DCOMP Web.

## As regras que o motor aplica (e de onde vêm)

| Regra | Fonte |
|---|---|
| O direito de pedir se extingue após **5 anos** contados do encerramento do trimestre do crédito | Roteiro oficial (CTN art. 168, I; SC Cosit 125/2021) |
| **DCOMP exige PER prévio**: "uma declaração de compensação só pode ser elaborada se tiver sido transmitido um pedido de ressarcimento antes" | Roteiro oficial |
| Exceção: DCOMP sem PER prévio nas **bases legais 301, 302, 303, 304 ou 307**, transmitida antes do encerramento do trimestre de referência do crédito | Roteiro oficial |
| Período do crédito: **trimestral** quando o PER prévio é obrigatório; **mensal** quando não é | Roteiro oficial |
| Saldo do crédito (por mês de apuração) = **valores apurados − deduções/descontos − utilização em DCOMP anterior** | Roteiro oficial (aba "Saldo do Crédito") |
| No PER/DCOMP Web só se informam **créditos passíveis de ressarcimento/compensação**; crédito que só pode ser usado em dedução na própria escrituração não deve ser informado | Roteiro oficial |
| Na DCOMP o crédito é **atualizado pela Selic** desde o mês seguinte ao 361º dia do PER; o crédito usado na compensação é o total dos débitos ÷ (1 + Selic) | Roteiro oficial |
| **Crédito originário de DARF de PIS/Cofins pago indevidamente ou a maior** não é PER: é pedido de **restituição** (orientação própria da Receita) | Receita Federal, "Como solicitar ou compensar o crédito" (PIS/Cofins) |
| O PER/DCOMP só pode ser apresentado se o crédito **não estiver discutido em processo** (atestação de litígio) | Roteiro oficial |

## A regra de decisão, na prática

- **PER (Pedido de Ressarcimento)** — o caminho do crédito apurado no regime não cumulativo. É o que
  o contador transmite primeiro.
- **DCOMP (Declaração de Compensação)** — vem **depois** do PER, vinculada a ele, e **compensa débito
  próprio**. Se não há débito a compensar (e o cliente quer o caixa), a DCOMP não tem objeto: o caminho
  é só o PER.
- **DARF pago a maior** — não é PER nem DCOMP: é pedido de restituição. O motor sinaliza quando há
  DARF de PIS/Cofins na competência para o contador conferir se o valor pago foi maior que o devido.
- **Prescrito** (5 anos do encerramento do trimestre) — o motor não propõe e diz o limite.
- **Crédito já objeto de PER** no mesmo período (campo 14 do 1100/1500) — não entra na lista de novo
  pedido.

## O que o motor **não** decide (e por quê)

| Ponto | Motivo |
|---|---|
| Se o crédito é passível de ressarcimento/compensação | Depende do código do crédito **e** da base legal **na tabela do sistema**; o roteiro oficial manda conferir no PER/DCOMP Web |
| Se o crédito está em nth(column) litígio ou em inconstitucionalidade | Exige atestado do responsável e consulta a sistemas da Receita |
| O valor final do pedido | É o que o PER/DCOMP Web calcula (o motor entrega o saldo apurável e a ficha) |
| Se há débito próprio a compensar | O motor usa os DARFs lidos; débitos futuros, parcelamentos e autações precisam ser conferidos no e-CAC |
| Qual base legal se enquadra em 301/302/303/304/307 | A numeração é interna do PER/DCOMP Web e não está nas fontes públicas consultadas — o motor sinaliza a exceção, não a aplica |

## Como o contador transmite

1. Abre o **e-CAC** (https://www.gov.br/receitafederal/pt-br/canais_atendimento/atendimento-virtual/home-ecac)
   com gov.br (nível prata ou ouro) ou certificado digital.
2. Menu **Restituição e Compensação → Acessar PER/DCOMP Web**.
3. Tipo de crédito: *"PIS/PASEP Não-Cumulativo - Ressarcimento/Compensação - PA a partir de Janeiro de
   2014"* ou *"Cofins Não-Cumulativa - Ressarcimento/Compensação - PA a partir de Janeiro de 2014"*.
4. Preenche com a **ficha** que o Reversa gera (CSV, aba por aba do roteiro oficial).
5. A **transmissão** é feita pelo contador, no sistema, com o certificado do cliente: **o Reversa não
   transmite** — não há API pública da Receita para isso, e o certificado é do cliente.

## Arquivos

| Arquivo | O que é |
|---|---|
| `motor-pedido.js` | A decisão: via, valor, prazo, fundamento e pendências; a ficha do pedido e o CSV |
| `lib/sped/tabelas/codigos-credito.json` | Códigos de crédito (tabela 4.3.7/4.3.6 do Guia), com o rótulo oficial |
| `motor-creditos.js` | Lê o Bloco 1 (`creditosPosicao`) e o crédito apurado (`creditosApurados`) |
| `motor-darf.js` | Lê DARF; agora reconhece 6912 (PIS) e 5856 (Cofins) além de 0220/6012 |
| `motor-creditos.js` → `apuracaoM` | Tributo apurado no período (M200/M600): é o teto de crédito que a DCOMP pode usar |
| `index.html` | Tela "Via do pedido" + botão de gerar a ficha + link do e-CAC; a memória técnica (PDF) traz a decisão |
| `tests/motor-pedido.test.js` | 10 testes: cada regra da tabela acima |
