# ESPECIFICAÇÃO FUNCIONAL E TÉCNICA

## REVERSA — Governança, conciliação fiscal e execução de créditos federais

**Versão:** 1.1 integrada  
**Projeto:** Reversa — Argus Prime  
**Abrangência:** créditos tributários federais, estaduais quando aplicável, e trilhas previdenciárias relacionadas  
**Documento-base:** Especificação Funcional e Técnica Reversa — Governança, Conciliação Fiscal e Execução de Créditos Federais, versão 1.0

## 1. Finalidade desta versão

Esta versão integra à especificação original a decisão funcional de que o Reversa deve exibir o diagnóstico completo para revisão humana antes de gerar o dossiê oficial.

O sistema não deve eliminar silenciosamente teses sem valor, teses a dimensionar ou linhas com possível sobreposição. Essas informações devem aparecer no diagnóstico de revisão, com alertas e estado explícito. A filtragem ocorre somente quando o responsável publica o relatório oficial aprovado.

Esta regra complementa, sem substituir, os requisitos de conciliação fiscal, organização documental, aprovação, retificação, transmissão e acompanhamento já previstos na versão 1.0.

## 2. Estados do diagnóstico e do dossiê

O Reversa deverá distinguir dois produtos:

### 2.1 Diagnóstico de revisão

É a visão completa gerada pelos motores e pelos documentos carregados. Deve mostrar:

- todas as oportunidades identificadas;
- teses com valor quantificado;
- teses sem valor, marcadas como `A DIMENSIONAR`;
- valores brutos ou ainda não convertidos em crédito;
- possíveis sobreposições;
- ausência documental;
- divergências de conciliação;
- fontes, competências e registros de origem;
- alertas de risco e pontos de atenção.

O diagnóstico de revisão é informativo e não autoriza retificação, pedido de restituição, PER/DCOMP ou compensação.

### 2.2 Dossiê oficial aprovado

É o relatório integral das oportunidades que foram efetivamente aprovadas para execução. Só pode ser gerado depois que cada linha do diagnóstico de revisão receber uma decisão.

O dossiê oficial deve conter apenas linhas classificadas como:

- `APROVADA PARA EXECUÇÃO`;
- `APROVADA COM PENDÊNCIA CONTROLADA`, quando o procedimento permitir avanço condicionado;
- `MANTIDA PARA ACOMPANHAMENTO`, quando a oportunidade for aprovada como monitoramento e não como crédito imediato.

Linhas `A DIMENSIONAR`, `SOBREPOSTA`, `SEM DOCUMENTAÇÃO SUFICIENTE` ou `EXCLUÍDA` não entram no total oficial de recuperação. Elas permanecem registradas no histórico da revisão.

## 3. Aprovação linha a linha

Cada oportunidade exibida na tela deverá permitir uma decisão explícita:

1. Aprovar para execução.
2. Manter como pendente.
3. Manter para acompanhamento.
4. Marcar como sobreposta a outra oportunidade.
5. Excluir do escopo.

Para cada decisão, o sistema registra:

- usuário responsável;
- data e hora;
- comentário ou justificativa;
- versão do diagnóstico;
- valor considerado;
- documentos e referências vinculados;
- hash do conjunto de dados utilizado.

A aprovação não permite alterar silenciosamente o valor calculado. Qualquer alteração no cálculo, nos arquivos de origem, nas competências ou nas regras de conciliação cria uma nova versão e exige nova aprovação.

## 4. Regras do relatório real de oportunidades

O relatório oficial de um caso deve ser gerado a partir das linhas aprovadas, e não a partir do catálogo geral de teses.

Cada linha oficial deve apresentar:

- nome da oportunidade;
- tributo e natureza;
- período ou competências;
- valor identificado;
- valor validado;
- valor aprovado para execução;
- origem documental;
- registros fiscais ou contábeis utilizados;
- memória de cálculo;
- resultado da conciliação;
- sobreposição conhecida;
- via de recuperação;
- pendências;
- responsável técnico;
- decisão do aprovador.

O relatório deve mostrar separadamente:

1. Total bruto identificado.
2. Total validado documentalmente.
3. Total aprovado para execução.
4. Total retificado.
5. Total transmitido.
6. Total em análise.
7. Total homologado.
8. Total efetivamente compensado ou restituído.

Esses valores não podem ser somados entre si como se fossem créditos independentes.

## 5. Regras de sobreposição e conciliação

O Reversa deve sinalizar, sem apagar, quando duas linhas utilizarem o mesmo documento, registro, pagamento, competência ou base de cálculo.

Uma linha não pode ser incluída no total aprovado enquanto sua sobreposição estiver sem decisão. O aprovador deve poder:

- manter as linhas separadas, com justificativa de bases distintas;
- consolidar as linhas em uma oportunidade única;
- excluir a parcela duplicada;
- manter uma linha pendente até a conciliação.

A ausência de evidência não equivale a inexistência do crédito. Deve ser classificada como `AUSÊNCIA DOCUMENTAL` ou `PONTO DE ATENÇÃO`, conforme o caso.

## 6. Trava de publicação, retificação e compensação

O sistema não deve bloquear a visualização do diagnóstico. Deve bloquear as etapas que produzem efeito externo:

- publicação do dossiê oficial sem decisão para todas as linhas;
- geração de arquivo retificador baseado em linha não aprovada;
- transmissão de arquivo diferente da versão aprovada;
- elaboração de pedido ou compensação sem validação de disponibilidade;
- reutilização de crédito já utilizado;
- avanço com pendência impeditiva.

A autorização para uma tese não autoriza automaticamente qualquer transmissão. A autorização de retificação também não autoriza automaticamente restituição, ressarcimento ou compensação.

## 7. Aplicação ao caso dos R$ 144.070,69

O caso Personal Design deve ser apresentado inicialmente no diagnóstico de revisão com as seis linhas quantificadas e todos os alertas de conciliação:

- R$ 100.221,16 — potencial técnico principal;
- R$ 8.875,64 — segregação monofásica no PGDAS-D;
- R$ 12.277,39 — triagem adicional no PGDAS-D;
- R$ 12.089,63 — ICMS identificado em registros C190;
- R$ 1.888,91 — PIS na EFD-Contribuições;
- R$ 8.717,96 — Cofins na EFD-Contribuições.

O sistema deve permitir a aprovação dessas linhas individualmente e deve destacar a necessidade de verificar possível sobreposição entre o potencial técnico principal, os valores de PIS/Cofins e o ICMS C190.

O total de R$ 144.070,69 é o total bruto apresentado no diagnóstico. O total oficial para execução somente será calculado após as decisões do aprovador e a conciliação documental.

As páginas genéricas com teses `A DIMENSIONAR` não devem aparecer no dossiê oficial aprovado. Elas continuam disponíveis na tela de revisão e no histórico técnico.

## 8. Integração com a especificação original

Os demais requisitos da versão 1.0 permanecem vigentes, especialmente:

- auditoria prévia do código, banco e fluxos;
- relatório de conciliação fiscal e documental como prioridade P0;
- organização documental por cliente, CNPJ, estabelecimento, exercício, competência e versão;
- índice mestre de evidências por tese aprovada;
- aprovação e autorização individual;
- comparação entre obrigação original e retificadora;
- registro de recibos, protocolos e resultados;
- distinção entre potencial, validado, transmitido, homologado e recuperado;
- preservação dos arquivos originais;
- proibição de alterar ou retificar automaticamente documentos com base apenas em divergências.

Esta versão apenas define com maior precisão a fronteira entre diagnóstico completo, aprovação humana e dossiê oficial.

## 9. Critérios adicionais de aceite

O requisito será considerado atendido quando:

1. A tela de revisão mostrar todas as oportunidades encontradas, inclusive as sem valor.
2. Cada linha tiver decisão explícita e auditável.
3. O relatório oficial não contiver linhas não aprovadas.
4. O total oficial for recalculado exclusivamente a partir das linhas aprovadas.
5. Sobreposições forem exibidas e resolvidas antes da publicação.
6. Alterações posteriores invalidarem a aprovação anterior.
7. O histórico conservar as linhas excluídas, pendentes e a dimensionar.
8. Retificação, pedido e compensação exigirem uma versão aprovada e rastreável.

## 10. Diretriz de implementação

O desenvolvimento deve começar pela auditoria de aderência prevista na versão 1.0. Em seguida, deve implementar a separação entre `diagnóstico de revisão` e `dossiê oficial aprovado`, reutilizando os motores, pareceres, documentos, controles de aprovação e trilhas de auditoria já existentes.

Não criar um segundo fluxo comercial, uma segunda política de segurança ou um segundo cadastro de teses. A aprovação linha a linha deve ser incorporada ao fluxo atual do Reversa.

