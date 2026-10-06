# API do módulo Lei do Bem

Todas as rotas ficam em `/api/v1/leidobem` e exigem a sessão do Reversa (cookie `rv_sessao`). O papel do usuário é lido no servidor, a partir da organização. Os dados de uma organização nunca são visíveis para outra.

| Método e rota | Papel | Descrição |
|---|---|---|
| `GET /api/v1/leidobem/casos` | leitura | Lista os casos com o resumo (dispêndios, exclusão, economia, elegibilidade, confiança, prazo) |
| `POST /api/v1/leidobem/casos` | escrita | Cria um caso. Corpo: `{ cnpj, legalName, anoBase, taxpayerId? }`. Retorna 409 se já existir caso para o mesmo CNPJ e ano |
| `GET /api/v1/leidobem/casos/:id` | leitura | Caso completo: `dados`, `calculo` recalculado no servidor, `pendencias`, `revisoes`, `status` |
| `PATCH /api/v1/leidobem/casos/:id` | escrita | Salva `{ dados }`. O servidor recalcula com o mesmo motor. Se o caso tinha aprovações, as revisões são reiniciadas. Retorna 409 se o FORMP&D já foi enviado |
| `POST /api/v1/leidobem/casos/:id/revisao` | escrita; a etapa final exige revisão (owner/admin) | Corpo: `{ etapa: fiscal\|tecnica\|contabil\|final, decisao: aprovar\|reprovar, observacao }`. As etapas seguem a ordem. Reprovar exige motivo. Casos bloqueados ou inelegíveis não são aprovados. A aprovação final também exige zero pendências bloqueantes e confiança de pelo menos 70 |
| `POST /api/v1/leidobem/casos/:id/recibo` | revisão (owner/admin) | Corpo: `{ recibo, data: AAAA-MM-DD }`. Só vale depois das quatro aprovações. O caso passa a `enviado` e fica travado |

## Estrutura de `dados`
- `empresa`:
  - `{ cnpj, nome, regime, formaTribTexto, apuracao, periodos[], regularidade{situacao,validade,obs}, aliquotaCsll, exclusaoExistente, totalFuncionarios, receitaBruta, leiInformatica }`
  - cada item de `periodos[]`: `{ per, dtIni, dtFin, meses, limiteIRPJ, limiteCSLL, ajusteIRPJ, ajusteCSLL, lucroReal }`
- `projetos[]`: `{ id, codigo, titulo, tipo, area, inicio, fim, objetivo, desafio, novidade, metodologia, marcos, resultados, evidencias, criterios{8}, evidenciasPorCriterio{} }`
- `despesas[]`: `{ id, origem, rubrica, projetoId, descricao, valor, percentual, data, doc{tipo,chave,numero,cnpj,cpf,nome}, evidencias{timesheet,contrato,nf}, ativado, capex, outroIncentivo, rateio{criterio,memorial} }`
- `pessoas[]`: vêm da folha, com a classificação e as `alocacoes[{projetoId, percentual}]`
- `contabil`: `{ totalPD, contasPD[], ativacao[], contasSegregadas }`
- `pesquisadores`: `{ anoAnterior, anoAtual }`
- `patente`: `{ dispendiosVinculados, dataConcessao }`
- `formpd`: `{ prazoInformado, recursosProprios }`
- `retroativo[]`

## Motor compartilhado
O arquivo `leidobem-motor.js` roda no navegador (`window.LeiDoBem`) e no Node (`require`). Ele cobre:
- parsers de ECF, ECD, folha, NF-e e NFS-e;
- elegibilidade, validação, cálculo, confiança e pendências;
- rascunho do FORMP&D e CSV;
- retroativo e os 10 modelos de documentos.

Os parâmetros legais ficam por vigência em `PARAMETROS`, com a fonte de cada regra.

## Auditoria
São gravados os eventos `ldb.case_created`, `ldb.case_saved`, `ldb.review` e `ldb.formpd_receipt` em `audit_events`.

## Armazenamento e LGPD
- Os arquivos do cliente não são enviados ao servidor.
- O caso guarda só os dados extraídos, inclusive o CPF da equipe, que o FORMP&D exige.
- O limite é de 3 MB por caso.
