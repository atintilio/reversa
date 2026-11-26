# Conformidade com manuais oficiais da Receita Federal

Revisão realizada em 26/11/2026 antes da publicação da governança documental.

## Regras confirmadas

| Fluxo | Regra operacional | Implementação no Reversa |
|---|---|---|
| EFD-Contribuições | O cálculo deve respeitar o Guia Prático, registros e versão do leiaute aplicável. | Motores leem registros por competência e geram memória; a versão do leiaute deve permanecer registrada no processamento. |
| PIS/Cofins não cumulativos | PER/DCOMP Web admite pedido de ressarcimento/compensação conforme o código de crédito e a escrituração. | `motor-pedido.js` prepara a decisão e a ficha, sem transmitir. |
| DCOMP | A compensação depende do crédito válido, do débito próprio e das condições do roteiro oficial. | O motor sinaliza a via e pendências; o Aprovador confere e transmite no e-CAC. |
| DAS/Simples Nacional | Restituição e compensação seguem os aplicativos próprios do Simples; créditos de ICMS/ISS não são tratados como crédito federal. | O fluxo PGDAS deve permanecer separado do PER/DCOMP federal. |
| DCTFWeb/MIT | Para fatos geradores a partir de 01/2025, tributos antes declarados na DCTF PGD passam à DCTFWeb por meio do MIT, conforme o leiaute vigente. | O Reversa deve registrar o regime, o período e a versão do leiaute; não deve reutilizar regras da DCTF PGD sem validação. |
| Retificação | A obrigação original deve ser preservada, a retificadora comparada e a transmissão autorizada. | Guardas de retificação e aprovação humana bloqueiam publicação/transmissão não autorizada. |

## Fontes oficiais consultadas

- [PER/DCOMP Web — Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/restituicao-ressarcimento-reembolso-e-compensacao/perdcomp/perdcomp-web/perdcomp-web)
- [Manuais e Roteiros de restituição, ressarcimento e compensação](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/restituicao-ressarcimento-reembolso-e-compensacao/roteiros)
- [EFD-Contribuições — Guia Prático e programa](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/download/sped/efdc)
- [Guia Prático da EFD-Contribuições 1.35](https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf)
- [DCTFWeb, MIT e leiautes](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/dctfweb)
- [Manual do MIT](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/arquivos/manual-mit-1-0-14-02.pdf)
- [Pagamento em DAS](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/restituicao-ressarcimento-reembolso-e-compensacao/creditos/pagamento/das)
- [Restituição de tributos do Simples Nacional](https://www.gov.br/pt-br/servicos/obter-restituicao-de-tributos-do-simples-nacional-e-mei)

## Limites mantidos

- O Reversa não transmite PER/DCOMP, DCTFWeb, EFD ou retificações automaticamente.
- A ficha gerada é material de preparação e deve ser conferida no sistema oficial.
- A ausência de documento ou vínculo de pagamento gera pendência, não presunção de indébito.
- O motor não pode escolher regime, código de crédito, período ou via de recuperação sem evidência documental e validação humana.
- Qualquer mudança de manual ou leiaute exige revisão do catálogo normativo e nova versão do processamento.

