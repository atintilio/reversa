> **Revisão Reversa:** conteúdo do chat (Qwen), conferido nos pontos usados pelo motor (CPC 04 pesquisa × desenvolvimento, depreciação no lugar do CAPEX, segregação de contas e centros de custo). Confirme códigos do plano referencial e lançamentos com o contador.

Aqui está a **Base de Conhecimento Contábil Aplicada à Lei do Bem**, estruturada como especificação funcional para o **Reversa Tax**. Esta seção é o "coração" da ferramenta, pois a contabilidade é a única prova aceita pela Receita Federal (RFB) para sustentar a exclusão fiscal.

A automação contábil deve ser regida pela **ITG 2000 (Escrituração Contábil)**, **CPC 04 (Ativo Intangível)**, **CPC 27 (Ativo Imobilizado)**, **Lei 11.196/2005**, **Decreto 5.798/2006** e **IN RFB 1.187/2011**.

---

# Módulo Contábil do Reversa Tax: Especificação Técnica

## 1. A Grande Pegadinha Contábil: Despesa vs. Ativo (CPC 04 x Lei do Bem)

O sistema Reversa Tax precisa possuir um **motor de alerta** baseado no **CPC 04 (Ativo Intangível)**. A forma como a contabilidade classifica o gasto impacta diretamente o benefício fiscal no ano-calendário.

### 1.1 Fase de Pesquisa vs. Fase de Desenvolvimento
* **Fase de Pesquisa:** Segundo o CPC 04 (item 54), os gastos devem ser **reconhecidos como DESPESA** no resultado do período em que forem incorridos.
  * *Impacto Fiscal:* O dispêndio entra integralmente na base de cálculo da exclusão da Lei do Bem no ano em que ocorreu.
* **Fase de Desenvolvimento:** Segundo o CPC 04 (item 57), os gastos podem (e devem) ser **ATIVADOS** (registrados como Ativo Intangível) se a empresa demonstrar viabilidade técnica, intenção de conclusão e geração de benefícios econômicos futuros.
  * *Impacto Fiscal (A Pegadinha):* A Receita Federal (via Soluções de Consulta COSIT) entende que, se o gasto foi ativado, ele deixa de ser "dispêndio" imediato e vira "custo do ativo". **A exclusão da Lei do Bem (60% ou 80%) só poderá ser aproveitada à medida que o ativo for AMORTIZADO** contra o resultado (DRE).
  * *Risco:* Se a empresa ativar R$ 1.000.000 em P&D no ano, mas não amortizar nada (pois o projeto só ficou pronto em dezembro), o benefício fiscal será **ZERO** naquele ano.

### 1.2 Regra de Automação para o Reversa Tax
O sistema deve ler a conta contábil de contrapartida do lançamento:
```text
SE Conta_Contrapartida IN (Ativo Intangível / Imobilizado em Andamento):
    ALERTA CRÍTICO: "Ativação de P&D detectada."
    AÇÃO: Calcular benefício apenas sobre a cota de Amortização/Depreciação do período.
    SUGESTÃO: Notificar a controladoria para avaliar se os critérios de ativação do CPC 04 foram realmente preenchidos. Se não, sugerir estorno para Despesa para maximizar o benefício imediato.
```

---

## 2. Estrutura do Plano de Contas e Mapeamento (ECD / ECF)

A contabilidade não pode lançar P&D em contas genéricas (ex: "Despesas Operacionais Diversas"). A **IN RFB 1.187/2011 (Art. 11)** exige controle analítico.

### 2.1 Plano de Contas Sugerido (Grupo 3.1 - Despesas Operacionais)
O Reversa Tax deve validar se o ERP do cliente possui contas dedicadas:
* `3.1.01.01.00` - Despesas com Pessoal em P&D
* `3.1.01.02.00` - Materiais e Insumos de P&D
* `3.1.01.03.00` - Serviços de Terceiros em P&D
* `3.1.01.04.00` - Depreciação e Amortização em P&D
* `3.1.01.05.00` - Encargos de P&D (Viagens, Testes, Certificações)
* `3.1.01.06.00` - Rateio de Despesas Indiretas (Overhead)

### 2.2 Mapeamento para o Plano Referencial da ECF (Registro J800/J900)
O Reversa Tax deve cruzar as contas analíticas com o **Plano de Contas Referencial** da Receita Federal (obrigatório para Lucro Real).
* *Exemplo de Erro Comum:* Lançar salário de pesquisador na conta referencial de "Despesas Administrativas" em vez de "Despesas Operacionais". Isso pode gerar malha fina na ECF. O sistema deve validar a natureza da conta referencial.

---

## 3. Centros de Custo e Rastreabilidade (Rateios)

A Lei do Bem permite o rateio de despesas indiretas (ex: aluguel do laboratório, energia, internet, salário do diretor técnico), mas a **IN RFB 1.187/2011 (Art. 4º, § 3º)** exige que o critério seja **técnico, documentado e consistente**.

### 3.1 Regras de Rateio Automatizáveis
O Reversa Tax deve validar os rateios com base nas seguintes chaves:

| Tipo de Despesa Indireta | Chave de Rateio Aceita | Validação do Sistema |
|---|---|---|
| Salário de Supervisão/Gerência | Horas-homem dedicadas ao projeto | Cruzar com Timesheet / Apontamento |
| Energia Elétrica do Laboratório | Área ocupada (m²) ou Horas de uso | Cruzar com planta baixa / Log de equipamentos |
| Aluguel / Condomínio | Área ocupada (m²) | Cruzar com contrato de locação e layout |
| Internet / Servidores (Cloud) | Volume de dados ou Horas de processamento | Cruzar com logs de TI (AWS/Azure) |
| Materiais de Consumo | Requisição de Almoxarifado | Cruzar com baixa de estoque no projeto |

### 3.2 Bloqueio Automático de "Rateio Chutado"
Se o sistema identificar um lançamento de "Rateio de Overhead" sem documento de apoio (Memorial de Cálculo de Rateio anexado via hash no sistema), o valor deve ser marcado como **Inelegível (Risco Alto)** e enviado para fila de exceção.

---

## 4. Tratamento Contábil por Rubrica (O que o motor deve buscar)

### 4.1 Pessoal (Folha de Pagamento)
* **O que validar:** A contrapartida da folha deve ser a conta de P&D. O custo inclui Salário, 13º, Férias, INSS patronal, FGTS e Benefícios (VT, VR).
* **Automação:** O sistema deve ler o arquivo SEFIP/eSocial ou a folha analítica, filtrar os funcionários com "Cargo Técnico" ou alocados no Centro de Custo de P&D, e somar as verbas.
* **Atenção:** O sistema deve proibir a inclusão de pró-labore de sócios sem função técnica comprovada (risco de glosa).

### 4.2 Serviços de Terceiros (PJ / Consultorias)
* **O que validar:** A Nota Fiscal deve ter descrição detalhada. Contabilização na conta de P&D.
* **Automação:** Ler o XML da NF-e. Se a descrição for "Serviços de Consultoria" (genérica), bloquear. Se for "Desenvolvimento de Módulo X para Projeto Y", liberar.
* **Regra de Ouro:** O sistema deve exigir o **Contrato de Prestação de Serviços** e o **Relatório de Medição/Aceite** vinculados ao lançamento contábil.

### 4.3 Ativo Imobilizado (Equipamentos)
* **O que validar:** Compra de computadores, servidores, máquinas de teste.
* **Regra Fiscal:** A exclusão da Lei do Bem **NÃO incide sobre o valor total da compra do ativo** (CAPEX). Ela incide sobre a **DEPRECIAÇÃO** registrada no ano como despesa de P&D.
* **Automação:** O Reversa Tax deve ler o Razão da conta de Depreciação (Despesa) e não a conta do Ativo (Balanço Patrimonial). *Exceção: Se o equipamento for consumido integralmente no protótipo (vida útil < 1 ano), pode ser despesa direta.*

---

## 5. Reflexos na ECF: LALUR e LACS (Onde o benefício nasce)

A exclusão da Lei do Bem **não reduz a base contábil**, ela reduz a base **fiscal**. Isso é feito através de ajustes no **Livro de Apuração do Lucro Real (LALUR)** e na **CSLL (LACS)**, especificamente na **Parte A (Adições e Exclusões)** e **Parte B (Controle)**.

### 5.1 Estrutura do Lançamento Fiscal (e-LALUR/e-LACS)
O Reversa Tax deve gerar automaticamente os códigos de ajuste:

1. **Exclusão do Lucro Líquido (Dispêndios):**
   * *Código:* [Inserir código vigente da ECF para Exclusão de Incentivo à Inovação - Lei 11.196/05].
   * *Valor:* Soma de todos os dispêndios elegíveis (que já foram deduzidos como despesa na contabilidade).
2. **Exclusão Adicional (O Benefício Real):**
   * *Código:* Exclusão Adicional de P&D (60% ou 80%).
   * *Valor:* `Total Dispêndios * 60%` (ou 80% se houver patente).
3. **Controle na Parte B (Prejuízos):**
   * Se a exclusão adicional for maior que o Lucro Tributável, o sistema deve registrar o "saldo a utilizar" na Parte B do LALUR (se a legislação do ano permitir carrear, o que hoje é restrito - *verificar vigência anual*).

### 5.2 Regra de Validação Cruzada (Reconciliação)
```text
SE (Soma Contas Analíticas P&D no Razão) != (Valor Informado no LALUR - Exclusão):
    ERRO CRÍTICO: "Divergência entre Contabilidade (ECD) e Fiscal (ECF)."
    AÇÃO: Bloquear geração do FORMP&D até ajuste contábil ou fiscal.
```

---

## 6. Partidas de Diário (Padrão ITG 2000)

O Reversa Tax deve validar se os lançamentos seguem o método das partidas dobradas corretamente para P&D. Exemplos de padrões (templates) que o sistema deve reconhecer:

### A. Apropriação de Folha de P&D
```text
D - 3.1.01.01.00 - Despesas com Pessoal P&D (Resultado)
C - 2.1.01.01.00 - Salários a Pagar (Passivo Circulante)
```
*Validação:* O sistema deve cruzar esse lançamento com a folha de pagamento e o centro de custo.

### B. Compra de Material de Consumo para Protótipo
```text
D - 3.1.01.02.00 - Materiais de P&D (Resultado)  [ou Ativo Circulante -> Estoque -> Baixa]
C - 2.1.01.02.00 - Fornecedores (Passivo Circulante)
```
*Validação:* Exigir XML da NF-e vinculado.

### C. Rateio de Aluguel do Laboratório
```text
D - 3.1.01.06.00 - Rateio Overhead P&D (Resultado)
C - 3.1.02.01.00 - Despesas Administrativas (Resultado - Estorno/Transferência)
```
*Validação:* Exigir Memorial de Cálculo de Rateio (PDF/Excel) anexado ao lançamento na ECD (Registro I250).

---

## 7. Regras de Ouro para o Motor de Automação Contábil

Para atingir a meta de 98-99% de automação, o Reversa Tax deve implementar as seguintes "Hard Rules" (Regras Rígidas):

1. **Regra da Competência (Regime de Competência):**
   * A despesa deve ser contabilizada no mês em que ocorreu o fato gerador, não na data do pagamento.
   * *Ação:* Bloquear lançamentos de "Regime de Caixa" em contas de P&D.
2. **Regra da Documentação Hábil (Art. 11, IN 1.187/11):**
   * Todo lançamento contábil de P&D deve ter um documento de origem (NF, Folha, Contrato, Timesheet) referenciado no campo `DOC` ou `HISTÓRICO` da ECD (Registro I200/I250).
   * *Ação:* Se `historico_lancamento` for vazio ou genérico ("Pgto NF"), marcar como exceção.
3. **Regra da Não-Cumulatividade de Incentivos:**
   * O sistema deve verificar se a mesma despesa foi usada em outro incentivo (ex: Lei de Informática, Rota 2030, FINEP).
   * *Ação:* Cruzar contas contábeis. Se a conta tiver "tag" de outro incentivo, subtrair do cálculo da Lei do Bem.
4. **Regra do Histórico Padrão:**
   * O sistema deve sugerir (ou forçar) históricos padronizados na ECD:
   * *Ruim:* "Ref. NF 12345"
   * *Bom:* "Ref. NF 12345 - Serv. Desenv. Algoritmo IA - Projeto X - Sprint 4"

---

## 8. Auditoria e Evidências Contábeis (O Dossiê do Reversa Tax)

A ferramenta deve gerar um **"Book de Auditoria Contábil"** automático, pronto para ser exportado em PDF/Excel e entregue ao fiscal da Receita em caso de intimação.

### Estrutura do Dossiê Contábil Automático:
1. **Capa:** CNPJ, Ano-Calendário, Valor Total do Benefício Pleiteado.
2. **Resumo Executivo:** Total de Dispêndios por Rubrica (Pessoal, Material, Serviços, Depreciação).
3. **Razão Analítico Filtrado:** Listagem de todos os lançamentos nas contas de P&D, com Data, Histórico, Valor e Centro de Custo.
4. **Conciliação ECD x ECF:** Tabela provando que o saldo da conta contábil bate com a linha do LALUR.
5. **Memoriais de Cálculo:**
   * Cálculo do Rateio de Overhead.
   * Cálculo da Depreciação de Ativos de P&D.
   * Cálculo da Exclusão Adicional (60% / 80%).
6. **Evidências Digitalizadas:** Links/Hashes para as NFs, Contratos e Timesheets que suportam os lançamentos.

---

## 9. Fluxo de Validação Contábil (Pipeline do Sistema)

```text
1. INGESTÃO (Importação da ECD - Blocos I e J)
   ↓
2. FILTRAGEM (Isolar contas do Grupo de P&D e Centros de Custo de Inovação)
   ↓
3. VALIDAÇÃO DE LANÇAMENTOS
   ├─ Tem histórico detalhado? (Senão -> Exceção)
   ├─ Tem documento de origem? (Senão -> Exceção)
   └─ A conta é de Despesa ou Ativo? (Se Ativo -> Calcular só Amortização)
   ↓
4. CRUZAMENTO COM FOLHA E NFs
   ├─ Validar horas apontadas vs. valor lançado.
   └─ Validar descrição da NF vs. escopo do projeto.
   ↓
5. CÁLCULO DO BENEFÍFIO (Dispêndio x 60%)
   ↓
6. GERAÇÃO DO LALUR/LACS (Arquivo de Importação da ECF)
   ↓
7. REVISÃO HUMANA (Aprovação do Controller/Contador)
   ↓
8. TRANSMISSÃO E ARMAZENAMENTO DO RECIBO
```

---

## Resumo para o Time de Desenvolvimento do Reversa Tax

Para automatizar a contabilidade da Lei do Bem, o software não pode ser apenas uma "calculadora". Ele precisa atuar como um **Auditor Digital em Tempo Real**:
1. Ele deve ler a **ECD (SPED Contábil)** e entender a natureza das contas.
2. Ele deve alertar sobre **ativação de custos** (CPC 04) que destroem o benefício imediato.
3. Ele deve validar **rateios** exigindo memoriais de cálculo.
4. Ele deve garantir que o valor contábil **bata centavo por centavo** com o valor informado no **LALUR (ECF)** e no **FORMP&D (MCTI)**.

Se a contabilidade estiver suja (contas genéricas, falta de histórico, rateios sem base), o Reversa Tax deve ter a coragem de **bloquear o cálculo** e gerar um "Plano de Saneamento Contábil" para o cliente, pois submeter um benefício fiscal com contabilidade frágil é o caminho mais rápido para uma multa de 75% a 150% sobre o valor do imposto em eventual fiscalização.