# Plano de processamento — Personal Design

Este arquivo é um roteiro operacional do caso, não um resultado fiscal. Nenhum valor, período ou tese é preenchido sem evidência documental.

## Entrada obrigatória

- Tax ID/CNPJ e razão social confirmados.
- Comprovante do regime tributário e histórico de alterações.
- EFD-Contribuições, EFD ICMS/IPI, DCTF/DCTFWeb, eSocial, guias e comprovantes disponíveis.
- Data de início de cada regime e último mês entregue.
- Autorizações e documentos de suporte para cada oportunidade.

## Segmentação do caso

O motor deve criar blocos de análise por regime e por tributo. Para a Personal Design, janeiro de 2025 é uma fronteira informada pelo cliente e precisa ser confirmada no documento oficial do regime:

- bloco anterior a 01/2025: aplicar somente teses compatíveis com o regime anterior;
- bloco a partir de 01/2025: aplicar regras e obrigações do regime atual;
- nunca projetar um bloco sobre o outro sem registrar a premissa e a evidência.

O limite temporal (por exemplo, 60 meses) é uma restrição a validar por tributo e tese, não um valor automático do cadastro.

## Fluxo no Reversa

1. Ingestão: preservar originais, gerar manifesto e hashes.
2. Diagnóstico preliminar: selecionar amostras por bloco homogêneo, registrar cobertura, confiança e limitações, e calcular o potencial total projetado.
3. Revisão: exibir todas as linhas e permitir aprovar, devolver ou rejeitar com justificativa.
4. Dossiê técnico: gerar somente para linhas aprovadas, com memória de cálculo, documentos, base legal, períodos e premissas.
5. Execução: abrir checklist de apuração definitiva, retificação, transmissão e compensação; cada etapa exige responsável, evidência e protocolo.

## Critério de encerramento do diagnóstico

O caso só pode avançar para o dossiê quando todos os itens aprovados tiverem origem documental, período definido, regime identificado e decisão humana registrada. Se faltar qualquer item, o Reversa deve manter a oportunidade em revisão e indicar exatamente o que falta.

## Estado inicial

Este roteiro não afirma que os documentos da Personal Design já foram processados. Após a ingestão real, o sistema deve gerar o relatório de cobertura e só então iniciar a projeção.
