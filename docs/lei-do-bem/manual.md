# Manual do módulo Lei do Bem

O módulo fica no menu **Lei do Bem**, dentro da mesma sessão do Reversa. Ele usa o mesmo login, a mesma organização e os mesmos papéis.

## 1. Criar o caso
- Clique em **Novo caso**.
- Escolha um cliente cadastrado ou informe o CNPJ e a razão social, e depois o ano-base.
- Cada empresa tem um caso por ano-base.

## 2. Enviar os arquivos (ingestão automática)
Arraste tudo para a área de arquivos. O Reversa reconhece cada arquivo e processa na hora, no navegador:

| Arquivo | O que o Reversa extrai |
|---|---|
| ECF do ano-base (.txt) | Forma de tributação (0010) e apuração anual ou trimestral. Lucro real (N500/N630) e base da CSLL (N650/N670) por período. Exclusões de Lei do Bem já lançadas no e-Lalur/e-Lacs (M300/M350) |
| ECF de anos anteriores | Vai para a aba **Retroativo** |
| ECD (.txt) | Contas e centros de custo de P&D (I050/I100) e movimento das contas de resultado (I155/I355). Indício de ativação (CPC 04) |
| Folha (.csv/.xlsx) | Pessoas, cargos, custo anual, horas, projeto e dedicação. O Reversa também classifica cada pessoa (pesquisador, técnico, apoio, não elegível ou sócio) |
| NF-e / NFS-e (.xml) | Lançamentos de material ou serviço, com chave, emitente, valor e data |
| .zip | Todos os arquivos acima de uma vez |

Os arquivos não ficam guardados: só os dados extraídos vão para o caso. O modelo de folha está em `/docs/lei-do-bem/modelo-folha.csv`.

## 3. Conferir as abas
- **Empresa e ECF:**
  - Regime, lucro e base da CSLL por período, com ajuste manual quando preciso.
  - Regularidade fiscal (CND, CPEN ou positiva, com a validade).
  - Pesquisadores contratados (define 60%, 70% ou 80%) e patente concedida (+20%).
  - Totais da ECD e dados do FORMP&D.
- **Projetos:**
  - Ficha técnica completa e os 8 critérios do score técnico.
  - Abaixo de 50, os dispêndios do projeto saem da base.
- **Dispêndios:**
  - Dedicação de cada pessoa por projeto e o botão **Gerar dispêndios de pessoal**.
  - Lançamentos (notas e manuais) com rubrica, projeto, percentual, data, evidências e restrições (ativado, compra de equipamento, subvenção).
  - Cada lançamento mostra a situação: elegível, exceção ou rejeitada.
- **Cálculo:**
  - Elegibilidade e fórmula.
  - Valores por período, por rubrica e por projeto.
  - Exclusão aproveitada, excedente perdido e economia de IRPJ e CSLL.
- **Pendências:** bloqueios, erros e alertas, e o score de confiança com as 7 dimensões e a política de automação.
- **Revisão humana:**
  - São quatro etapas, em ordem: fiscal, técnica, contábil e final.
  - A final é aprovada pelo administrador ou proprietário.
  - Alterar os dados depois de uma aprovação reinicia o ciclo.
  - Casos bloqueados ou inelegíveis não podem ser aprovados.
- **FORMP&D:**
  - Rascunho por seção, com botão de copiar.
  - Planilhas de apoio (RH, serviços PJ e PF, ICT, materiais, equipamentos, intangíveis, patentes).
  - Checklist, anexos exigidos e pacote .zip com planilhas, rascunho e documentos.
- **Retroativo:** anos anteriores, com crédito estimado, risco (matriz da base de conhecimento) e ação (retificar a ECF ou PER/DCOMP).
- **Documentos:** 10 modelos preenchidos, para imprimir, salvar em PDF ou baixar em Word:
  - Projeto técnico
  - Memorial de rateio
  - Parecer de elegibilidade
  - Relatório de evidências
  - Termo de responsabilidade
  - Checklist de auditoria
  - Memorando retroativo
  - Contrato de P&D
  - Timesheet
  - Declaração de não dupla contagem

## 4. Enviar e registrar
- O envio é sempre feito pela empresa, no portal do MCTI.
- Depois do envio, registre o número e a data do recibo na aba **Revisão humana**. O caso fica travado.

## Regras que o sistema aplica
- Só lucro real. Com regularidade fiscal positiva, o caso fica bloqueado (art. 23). Sem lucro tributável, não há aproveitamento.
- A exclusão é limitada ao lucro real e à base da CSLL antes da própria exclusão, sem levar o excesso para o ano seguinte.
- Despesas ficam fora da base nestes casos:
  - gasto ativado (só entra a amortização);
  - compra de equipamento (só entra a depreciação);
  - subvenção ou outro incentivo;
  - duplicidade.
- Viram exceção até serem resolvidos:
  - pessoal sem timesheet;
  - serviço sem contrato;
  - material sem nota;
  - descrição genérica de serviço;
  - despesa fora do período do projeto;
  - rateio sem memorial;
  - alocação acima de 100% por CPF.
- Diagnóstico não é crédito: tudo passa por revisão humana antes de qualquer envio.
