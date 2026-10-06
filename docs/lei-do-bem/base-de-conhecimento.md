# Reversa Tax — Base de Conhecimento Completa
## Lei do Bem / PD&I — Automação de Elegibilidade, Cálculo, Contabilidade e Recuperação

---

> **Versão:** 1.0
> **Data:** 2026
> **Ferramenta:** Reversa Tax
> **Escopo:** Lei nº 11.196/2005 (Lei do Bem), Decreto nº 5.798/2006, IN RFB 1.187/2011, CPC 04, CPC 27, ITG 2000

> **Revisão Reversa (out/2026).** Esta base foi gerada a partir do chat com o Qwen e revisada contra o texto legal antes de virar regra do sistema. Correções aplicadas:
> 1. **Fórmula do benefício:** a exclusão do art. 19 é de **60%** dos dispêndios (70% ou 80% conforme o aumento do número de pesquisadores contratados — art. 19 §1º e Decreto 5.798/2006, art. 8º §1º). O dispêndio em si já reduz o lucro como despesa operacional (art. 17, I); por isso **não** se exclui "100% + 60%".
> 2. **Patente:** a patente concedida ou o cultivar registrado dá exclusão **adicional de até 20%** (art. 19 §3º), no período da concessão — não eleva o percentual-base para 80%.
> 3. **Artigos dos outros incentivos:** IPI, depreciação integral, amortização acelerada e remessas estão no **art. 17**, incisos II, III, IV e VI.
> 4. **IRPJ:** a economia considera o adicional de 10% só sobre o lucro acima de R$ 20 mil por mês do período; o exemplo numérico foi refeito.
> 5. **FORMP&D 2026:** as "5 mudanças" citadas no chat não foram confirmadas em fonte oficial; o Reversa gera planilhas de apoio e pede conferência no manual do MCTI do ano.
> 6. **Restituição:** o prazo de PER/DCOMP conta 5 anos do pagamento (CTN, art. 168); o art. 173 trata de decadência do lançamento.
>
> Não substitui parecer jurídico, contábil ou tributário.

---

## Sumário

1. [Conceitos Fundamentais](#1-conceitos-fundamentais)
2. [Elegibilidade](#2-elegibilidade)
3. [Benefícios Fiscais](#3-benefícios-fiscais)
4. [Projetos e Atividades Elegíveis](#4-projetos-e-atividades-elegíveis)
5. [Despesas Elegíveis e Inelegíveis](#5-despesas-elegíveis-e-inelegíveis)
6. [FORMP&D](#6-formpd)
7. [Parte Contábil — CPC 04 e Segregação](#7-parte-contábil)
8. [Plano de Contas e Centros de Custo](#8-plano-de-contas-e-centros-de-custo)
9. [Rateio de Despesas Indiretas](#9-rateio-de-despesas-indiretas)
10. [ECD e ECF — LALUR/LACS](#10-ecd-e-ecf--lalurlacs)
11. [Partidas Contábeis Padrão](#11-partidas-contábeis-padrão)
12. [Motor de Cálculo do Benefício](#12-motor-de-cálculo-do-benefício)
13. [Automação e Pipeline](#13-automação-e-pipeline)
14. [Score de Confiança](#14-score-de-confiança)
15. [Workflow de Revisão Humana](#15-workflow-de-revisão-humana)
16. [Retificações](#16-retificações)
17. [PER/DCOMP — Recuperação de Tributos](#17-perdcomp--recuperação-de-tributos)
18. [Modelos de Documentos](#18-modelos-de-documentos)
19. [Governança e Compliance](#19-governança-e-compliance)
20. [LGPD e Segurança](#20-lgpd-e-segurança)
21. [Workflow End-to-End](#21-workflow-end-to-end)
22. [KPIs](#22-kpis)
23. [Roadmap de Implementação](#23-roadmap-de-implementação)
24. [Checklist Final](#24-checklist-final)

---

## 1. Conceitos Fundamentais

### 1.1 O que é a Lei do Bem?

A Lei do Bem (Lei nº 11.196/2005, Capítulo III) é um incentivo fiscal federal que beneficia empresas que realizam atividades de **pesquisa tecnológica e desenvolvimento de inovação tecnológica (PD&I)**.

Em termos simples: a empresa que investe em inovação pode reduzir a base de cálculo de tributos federais, principalmente **IRPJ** e **CSLL**, desde que cumpra requisitos legais, contábeis, fiscais e técnicos.

### 1.2 Normativos de Referência

| Normativo | Assunto |
|---|---|
| Lei nº 11.196/2005 (Arts. 17 a 26) | Incentivos fiscais à inovação |
| Decreto nº 5.798/2006 | Regulamentação da Lei do Bem |
| IN RFB nº 1.187/2011 | Procedimentos para fruição |
| CPC 04 (R3) | Ativo Intangível (Pesquisa vs Desenvolvimento) |
| CPC 27 | Ativo Imobilizado |
| ITG 2000 | Escrituração Contábil |
| RIR/2018 | Regulamento do Imposto de Renda |
| Manuais MCTI | FORMP&D |

> **Atenção:** O sistema deve possuir uma camada de **vigência normativa**, pois podem existir alterações legais e regulamentares aplicáveis por ano-calendário (ex.: Lei nº 14.948/2024).

### 1.3 Definições Legais

**Pesquisa tecnológica (Art. 17, I):**
Investigação original e planejada undertaken com a perspectiva de adquirir novo conhecimento científico ou tecnológico.

**Desenvolvimento de inovação tecnológica (Art. 17, II):**
Utilização de conhecimentos adquiridos para produzir novos produtos, processos ou aperfeiçoamentos significativos.

**Inovação tecnológica:**
Introdução de novidade ou aperfeiçoamento no ambiente produtivo ou social que resulte em novos produtos, processos ou serviços.

---

## 2. Elegibilidade

### 2.1 Requisitos Subjetivos (Quem pode)

| Requisito | Descrição | Fonte de Dados |
|---|---|---|
| Lucro Real | Empresa deve estar no regime do Lucro Real | ECF, DCTF |
| Regularidade fiscal | Sem débitos federais exigíveis | CND/CPEN |
| Lucro tributável | Base positiva de IRPJ/CSLL | ECF, e-LALUR |
| Contabilidade regular | Escrituração segregada e auditável | ECD |
| FORMP&D | Declaração ao MCTI no prazo | Sistema MCTI |

### 2.2 Requisitos Objetivos (O que pode)

- Atividades de pesquisa tecnológica;
- Atividades de desenvolvimento de inovação tecnológica;
- Despesas operacionais vinculadas a PD&I;
- Controle contábil segregado;
- Evidências técnicas e fiscais.

### 2.3 Quem NÃO pode

- Empresas no Simples Nacional;
- Empresas no Lucro Presumido (para o benefício principal);
- Empresas com débitos federais exigíveis;
- Empresas sem lucro tributável (para aproveitamento imediato);
- Empresas sem controle contábil adequado.

### 2.4 Regras de Automação de Elegibilidade

```text
FUNCAO verificar_elegibilidade(empresa, ano):

    SE empresa.regime_tributario != "LUCRO_REAL":
        RETORNAR {status: "INELEGIVEL", motivo: "Regime tributário"}

    SE empresa.certidao_federal NOT IN ["CND", "CPEN_VALIDA"]:
        RETORNAR {status: "BLOQUEADO", motivo: "Irregularidade fiscal"}

    base_irpj = obter_base_irpj(empresa, ano)
    base_csll = obter_base_csll(empresa, ano)

    SE base_irpj <= 0 E base_csll <= 0:
        RETORNAR {status: "SEM_APROVEITAMENTO", motivo: "Sem lucro tributável"}

    projetos = obter_projetos_pd(empresa, ano)
    SE projetos.vazio:
        RETORNAR {status: "INELEGIVEL", motivo: "Sem projetos de P&D"}

    despesas = obter_despesas_elegiveis(empresa, ano)
    SE despesas.vazio:
        RETORNAR {status: "INELEGIVEL", motivo: "Sem despesas elegíveis"}

    RETORNAR {status: "ELEGIVEL", base_irpj, base_csll, projetos, despesas}
```

---

## 3. Benefícios Fiscais

### 3.1 Exclusão de IRPJ e CSLL (Benefício Principal)

A empresa pode excluir da base de cálculo do IRPJ e da CSLL:

1. **Dedução normal** dos dispêndios como despesa operacional (art. 17, I) — já reduz o lucro;
2. **Exclusão adicional de 60%** dos dispêndios (art. 19, caput);
3. **70% ou 80%** se o número de pesquisadores contratados aumentar até 5% ou mais de 5% no ano (art. 19 §1º; Decreto 5.798/2006, art. 8º §1º);
4. **Mais até 20%** dos dispêndios vinculados a projeto com patente concedida ou cultivar registrado, no período da concessão (art. 19 §3º).

> **Efeito total:** a despesa (100%) já reduziu o lucro; a exclusão adicional vai de 60% a 80%, mais até 20% por patente.

### 3.2 Outros Incentivos

| Incentivo | Descrição | Base Legal |
|---|---|---|
| Redução de IPI | 50% de redução na aquisição de equipamentos para P&D | Art. 17, II, Lei 11.196/05 |
| Depreciação acelerada | Depreciação integral de bens novos usados em P&D | Art. 17, III, Lei 11.196/05 |
| Amortização acelerada | Amortização de intangíveis de P&D | Art. 17, IV, Lei 11.196/05 |
| IRRF zero | Remessas para manutenção de patentes no exterior | Art. 17, VI, Lei 11.196/05 |

### 3.3 Limitações

- O benefício **não é crédito financeiro direto**; é exclusão de base;
- A exclusão **não pode gerar lucro tributável negativo** (em regra);
- O excedente **não pode ser aproveitado em anos seguintes** (Art. 8º, IN RFB 1.187/2011), salvo alteração normativa;
- A empresa deve ter **lucro tributável positivo** para aproveitar;
- O benefício é limitado ao **lucro real do período**.

### 3.4 Fórmula de Cálculo

```text
Dispêndios Elegíveis (D) = Σ despesas PD&I do período (já lançadas como despesa operacional)
P = 60% | 70% (aumento de pesquisadores até 5%) | 80% (aumento acima de 5%)
Dp = dispêndios vinculados a patente concedida/cultivar registrado no período

Exclusão adicional = D × P + Dp × 20%

Exclusão aproveitada IRPJ = MIN(Exclusão adicional, Lucro real antes da exclusão)
Exclusão aproveitada CSLL = MIN(Exclusão adicional, Base da CSLL antes da exclusão)
Excedente perdido = Exclusão adicional − aproveitada (não passa para o ano seguinte — IN RFB 1.187/2011, art. 8º)

Economia IRPJ = IRPJ(lucro) − IRPJ(lucro − aproveitada)   [15% + 10% sobre o que exceder R$ 20 mil/mês]
Economia CSLL = aproveitada CSLL × alíquota da CSLL
```

### 3.5 Alíquotas

**IRPJ:**
- Alíquota básica: 15%
- Adicional: 10% sobre lucro que exceder R$ 20.000/mês (ou R$ 60.000/trimestre)

**CSLL:**
- Alíquota geral: 9%
- Alíquotas específicas: 15% ou 20% para certos setores (financeiro)

> O sistema deve parametrizar alíquotas por empresa e período.

---

## 4. Projetos e Atividades Elegíveis

### 4.1 Critérios de Elegibilidade Técnica

O projeto deve demonstrar:

1. **Novidade ou melhoria significativa** — produto, processo, software, método significativamente novo ou aprimorado;
2. **Risco ou incerteza tecnológica** — dúvida técnica relevante que não tinha solução óbvia;
3. **Trabalho sistemático** — planejamento, equipe, testes, documentação;
4. **Finalidade tecnológica** — resolver problema técnico, não apenas comercial ou estético.

### 4.2 Atividades Potencialmente Elegíveis

- Desenvolvimento de novo produto com desafio técnico;
- Novo processo industrial;
- Nova arquitetura de software com incerteza tecnológica;
- Algoritmos proprietários para problema complexo;
- Protótipos, pilotos, provas de conceito;
- Testes de desempenho, stress, segurança, integração;
- Desenvolvimento de materiais, componentes ou fórmulas;
- Automação de processo com desafio técnico relevante;
- Melhoria significativa de performance, escalabilidade, confiabilidade;
- Plataformas tecnológicas com integração complexa;
- IA/ML com desenvolvimento técnico não trivial;
- Registro de patente ou cultivar associado ao projeto.

### 4.3 Atividades INELEGÍVEIS

- Pesquisa de mercado;
- Marketing e publicidade;
- Treinamento operacional;
- Suporte técnico rotineiro;
- Manutenção corretiva simples;
- Atualização de versão sem desafio técnico;
- Customização estética;
- Tradução ou localização;
- Implantação de software de prateleira;
- Cópia ou engenharia reversa sem inovação;
- Atividades administrativas;
- Controle de qualidade rotineiro;
- Aquisição de terreno, prédio ou equipamento (como despesa integral);
- Despesas sem vínculo claro com projeto de PD&I;
- Despesas sem documentação hábil.

### 4.4 Software e Lei do Bem

Software **pode** ser elegível, mas precisa demonstrar desafio técnico.

**Elegível:**
- Novo motor de cálculo;
- Arquitetura distribuída com desafio técnico;
- Algoritmo proprietário;
- Melhoria significativa de performance;
- Integração complexa entre sistemas heterogêneos;
- Segurança cibernética com desenvolvimento técnico não trivial;
- IA aplicada com desenvolvimento de modelo próprio.

**Inelegível:**
- Mudança de layout;
- Correção de bugs simples;
- Atualização de versão;
- Customização para cliente sem desafio técnico;
- Implantação de ERP;
- Suporte ao usuário;
- Migração simples de ambiente;
- Testes apenas funcionais rotineiros.

### 4.5 Score Técnico de Projetos

O Reversa Tax deve atribuir pontuação de 0 a 100:

| Critério | Peso |
|---|---:|
| Existe problema técnico claro | 20 |
| Existe incerteza tecnológica | 20 |
| Existe novidade ou melhoria significativa | 15 |
| Existe metodologia sistemática | 10 |
| Existem testes ou experimentos | 15 |
| Existem evidências documentais | 10 |
| Equipe técnica alocada | 5 |
| Resultado técnico mensurável | 5 |

**Classificação:**
- 90-100: Elegível com alta confiança
- 70-89: Elegível com revisão leve
- 50-69: Revisão humana obrigatória
- 30-49: Alto risco, exigir evidências adicionais
- 0-29: Inelegível

---

## 5. Despesas Elegíveis e Inelegíveis

### 5.1 Despesas Elegíveis

| Rubrica | Exemplos | Requisitos |
|---|---|---|
| Pessoal | Salários, encargos, benefícios, 13º, férias | Timesheet, alocação por projeto |
| Materiais | Componentes, insumos, protótipos | NF, vínculo com projeto, consumo |
| Serviços de terceiros | Consultoria, universidades, ICTs | Contrato, escopo técnico, NF |
| Depreciação | Equipamentos usados em P&D | Ativo identificado, % de uso |
| Amortização | Intangíveis de P&D | Ativo registrado, período |
| Testes e certificações | Laboratórios, certificações técnicas | NF, relatório de teste |
| Propriedade intelectual | Patentes, registros | Comprovante INPI/MAPA |
| Viagens técnicas | Deslocamento para projeto | Relatório de viagem, vínculo |

### 5.2 Despesas INELEGÍVEIS

- Despesas administrativas gerais;
- Despesas comerciais e de marketing;
- Treinamento não vinculado a P&D;
- Aquisição de terrenos e edificações;
- Aquisição de equipamentos (como despesa integral — apenas depreciação);
- Despesas com produção em escala comercial;
- Despesas já cobertas por outro incentivo;
- Despesas sem documentação hábil;
- Despesas sem vínculo com projeto de P&D.

### 5.3 Regras de Validação de Despesas

```text
FUNCAO validar_despesa(despesa, projeto):

    SE despesa.categoria NOT IN WHITELIST:
        RETORNAR {status: "REJEITADA", motivo: "Categoria não elegível"}

    SE despesa.data < projeto.data_inicio OU despesa.data > projeto.data_fim:
        RETORNAR {status: "EXCECAO", motivo: "Fora do período do projeto"}

    SE despesa.conta_contabil NOT IN CONTAS_PD:
        RETORNAR {status: "EXCECAO", motivo: "Conta não segregada"}

    SE despesa.categoria == "pessoal" E despesa.timesheet == NULL:
        RETORNAR {status: "EXCECAO", motivo: "Sem timesheet"}

    SE despesa.categoria == "servicos" E despesa.contrato == NULL:
        RETORNAR {status: "EXCECAO", motivo: "Sem contrato"}

    SE despesa.categoria == "materiais" E despesa.nf == NULL:
        RETORNAR {status: "EXCECAO", motivo: "Sem nota fiscal"}

    SE despesa.duplicada:
        RETORNAR {status: "REJEITADA", motivo: "Duplicidade"}

    SE despesa.ja_usada_outro_incentivo:
        RETORNAR {status: "REJEITADA", motivo: "Dupla contagem"}

    RETORNAR {status: "ELEGIVEL", valor: despesa.valor_elegivel}
```

---

## 6. FORMP&D

### 6.1 O que é?

O FORMP&D é o formulário eletrônico usado para prestar informações ao **MCTI (Ministério da Ciência, Tecnologia e Inovação)** sobre atividades de pesquisa, desenvolvimento e inovação.

### 6.2 Prazos

| Ano-Calendário | Prazo de Entrega | Observação |
|---|---|---|
| 2025 | 30/09/2026 | Verificar portaria MCTI |
| 2026 | 31/07/2027 | Art. 14, Decreto 5.798/06 |
| Demais | 31 de julho do ano seguinte | Salvo prorrogação |

> O sistema deve ter **calendário configurável** e alertar com 60, 30 e 7 dias de antecedência.

### 6.3 Campos do FORMP&D

Para cada projeto:
- Título do projeto;
- Objetivo;
- Área tecnológica;
- Tipo de inovação;
- Data de início e término;
- Descrição técnica;
- Desafio tecnológico;
- Metodologia;
- Resultados obtidos;
- Equipe envolvida;
- Horas dedicadas;
- Despesas por rubrica;
- Valores anuais;
- Parceria com ICTs/universidades;
- Patente ou cultivar (se aplicável).

### 6.4 Rubricas do FORMP&D

1. Recursos humanos;
2. Materiais de consumo;
3. Serviços de terceiros;
4. Depreciação/amortização;
5. Equipamentos (via depreciação);
6. Outras despesas relacionadas.

### 6.5 Validações Automáticas

```text
SE total_formpd != total_razao_contabil:
    ERRO: "Divergência FORMP&D x Contabilidade"

SE projeto.sem_evidencia:
    ALERTA: "Projeto sem evidência técnica"

SE funcionario.horas > 100%:
    ERRO: "Alocação de horas excede 100%"

SE despesa.fora_periodo_projeto:
    ERRO: "Despesa fora do período do projeto"

SE empresa.sem_regularidade_fiscal:
    BLOQUEIO: "Empresa irregular"

SE empresa.sem_lucro_tributavel:
    ALERTA: "Sem aproveitamento imediato"
```

---

## 7. Parte Contábil

### 7.1 Normativos Contábeis Aplicáveis

| Normativo | Aplicação |
|---|---|
| CPC 04 (R3) | Ativo Intangível — Pesquisa vs Desenvolvimento |
| CPC 27 | Ativo Imobilizado — Depreciação em P&D |
| CPC 00 | Estrutura Conceitual |
| ITG 2000 | Escrituração Contábil |
| NBC TG 04 | Ativo Intangível |
| RIR/2018 | Regulamento do Imposto de Renda |

### 7.2 A Grande Pegadinha: Despesa vs. Ativo (CPC 04 x Lei do Bem)

#### Fase de Pesquisa
- **CPC 04 (item 54):** Gastos devem ser reconhecidos como **DESPESA** no resultado do período.
- **Impacto Fiscal:** O dispêndio entra integralmente na base de cálculo da exclusão da Lei do Bem no ano em que ocorreu.

#### Fase de Desenvolvimento
- **CPC 04 (item 57):** Gastos podem ser **ATIVADOS** (registrados como Ativo Intangível) se a empresa demonstrar:
  1. Viabilidade técnica;
  2. Intenção de conclusão;
  3. Capacidade de uso ou venda;
  4. Geração de benefícios econômicos futuros;
  5. Disponibilidade de recursos;
  6. Capacidade de mensurar os gastos.

- **Impacto Fiscal (A Pegadinha):** A Receita Federal entende que, se o gasto foi ativado, ele deixa de ser "dispêndio" imediato e vira "custo do ativo". **A exclusão da Lei do Bem (60% ou 80%) só poderá ser aproveitada à medida que o ativo for AMORTIZADO** contra o resultado.

### 7.3 Regra de Automação para Ativação

```text
SE Conta_Contrapartida IN (Ativo Intangível, Imobilizado em Andamento):
    ALERTA CRÍTICO: "Ativação de P&D detectada."
    AÇÃO: Calcular benefício apenas sobre a cota de Amortização/Depreciação do período.
    SUGESTÃO: Notificar a controladoria para avaliar se os critérios de ativação
              do CPC 04 foram realmente preenchidos. Se não, sugerir estorno
              para Despesa para maximizar o benefício imediato.
```

### 7.4 Tratamento Contábil por Rubrica

#### Pessoal (Folha de Pagamento)
- **Validação:** Contrapartida na conta de P&D. Custo inclui Salário, 13º, Férias, INSS patronal, FGTS e Benefícios.
- **Automação:** Ler arquivo SEFIP/eSocial ou folha analítica, filtrar funcionários com "Cargo Técnico" ou alocados no Centro de Custo de P&D.
- **Atenção:** Proibir inclusão de pró-labore de sócios sem função técnica comprovada.

#### Serviços de Terceiros (PJ / Consultorias)
- **Validação:** NF com descrição detalhada. Contabilização na conta de P&D.
- **Automação:** Ler XML da NF-e. Se descrição for genérica, bloquear.
- **Regra:** Exigir Contrato de Prestação de Serviços e Relatório de Medição/Aceite.

#### Ativo Imobilizado (Equipamentos)
- **Regra Fiscal:** A exclusão da Lei do Bem **NÃO incide sobre o valor total da compra do ativo** (CAPEX). Ela incide sobre a **DEPRECIAÇÃO** registrada no ano como despesa de P&D.
- **Automação:** Ler o Razão da conta de Depreciação (Despesa) e não a conta do Ativo (Balanço Patrimonial).
- **Exceção:** Se o equipamento for consumido integralmente no protótipo (vida útil < 1 ano), pode ser despesa direta.

#### Materiais
- **Validação:** NF de compra, requisição interna, destinação ao projeto, consumo em protótipo.
- **Cuidados:** Não aceitar material para produção comercial, uso administrativo ou sem rastreabilidade.

#### Depreciação
- **Requisitos:** Ativo identificado, uso em P&D, percentual de uso, período de uso no projeto.
- **Fórmula:** `Depreciação elegível = depreciação mensal × percentual de uso em P&D × meses no projeto`

### 7.5 Prevenção de Dupla Contagem

O sistema deve impedir que a mesma despesa seja usada mais de uma vez:

- Chave única por documento fiscal;
- Chave única por despesa;
- Validação de duplicidade por CNPJ + valor + data;
- Validação de competência;
- Conciliação por projeto;
- Conciliação por conta contábil;
- Verificação de outros incentivos fiscais.

---

## 8. Plano de Contas e Centros de Custo

### 8.1 Estrutura Recomendada de Contas

```text
3.1.01.00.000 - DESPESAS COM PESQUISA E DESENVOLVIMENTO - LEI DO BEM

3.1.01.01.000 - Pessoal em P&D
3.1.01.01.001 - Salários equipe P&D
3.1.01.01.002 - Encargos sociais equipe P&D
3.1.01.01.003 - FGTS equipe P&D
3.1.01.01.004 - Benefícios equipe P&D
3.1.01.01.005 - Férias e encargos equipe P&D
3.1.01.01.006 - PLR/bonificação proporcional P&D

3.1.01.02.000 - Materiais de consumo em P&D
3.1.01.02.001 - Componentes eletrônicos
3.1.01.02.002 - Insumos laboratoriais
3.1.01.02.003 - Materiais para protótipos
3.1.01.02.004 - Licenças de software consumíveis
3.1.01.02.005 - Materiais de teste

3.1.01.03.000 - Serviços de terceiros em P&D
3.1.01.03.001 - Serviços técnicos PJ
3.1.01.03.002 - Consultoria técnica especializada
3.1.01.03.003 - Universidades e ICTs
3.1.01.03.004 - Laboratórios externos
3.1.01.03.005 - Testes e certificações técnicas
3.1.01.03.006 - Prototipagem externa

3.1.01.04.000 - Depreciação e amortização em P&D
3.1.01.04.001 - Depreciação de equipamentos de P&D
3.1.01.04.002 - Amortização de intangíveis de P&D
3.1.01.04.003 - Uso de servidores/laboratório

3.1.01.05.000 - Propriedade intelectual
3.1.01.05.001 - Registro de patente
3.1.01.05.002 - Registro de cultivar
3.1.01.05.003 - Despesas técnicas associadas

3.1.01.06.000 - Outras despesas P&D
3.1.01.06.001 - Viagens técnicas vinculadas ao projeto
3.1.01.06.002 - Treinamento técnico específico
3.1.01.06.003 - Ferramentas técnicas vinculadas
3.1.01.06.999 - Outras despesas P&D com justificativa
```

### 8.2 Dimensões Obrigatórias por Lançamento

Cada lançamento de P&D deve conter:

1. Empresa;
2. Filial;
3. Ano-calendário;
4. Projeto;
5. Fase do projeto;
6. Centro de custo;
7. Conta contábil;
8. Tipo de despesa;
9. Funcionário (quando folha);
10. Fornecedor (quando terceiro);
11. Documento fiscal (quando aplicável);
12. Percentual de alocação;
13. Fonte de evidência;
14. Status de elegibilidade.

### 8.3 Mapeamento para Plano Referencial da ECF

O Reversa Tax deve cruzar as contas analíticas com o **Plano de Contas Referencial** da Receita Federal (obrigatório para Lucro Real).

> **Erro comum:** Lançar salário de pesquisador na conta referencial de "Despesas Administrativas" em vez de "Despesas Operacionais". Isso pode gerar malha fina na ECF.

---

## 9. Rateio de Despesas Indiretas

### 9.1 Base Legal

A **IN RFB 1.187/2011 (Art. 4º, § 3º)** permite o rateio de despesas indiretas, desde que o critério seja **técnico, documentado e consistente**.

### 9.2 Critérios de Rateio Aceitos

| Tipo de Despesa Indireta | Chave de Rateio | Validação |
|---|---|---|
| Salário de Supervisão/Gerência | Horas-homem dedicadas ao projeto | Timesheet / Apontamento |
| Energia Elétrica do Laboratório | Área ocupada (m²) ou Horas de uso | Planta baixa / Log de equipamentos |
| Aluguel / Condomínio | Área ocupada (m²) | Contrato de locação e layout |
| Internet / Servidores (Cloud) | Volume de dados ou Horas de processamento | Logs de TI (AWS/Azure) |
| Materiais de Consumo | Requisição de Almoxarifado | Baixa de estoque no projeto |

### 9.3 Regras de Automação

```text
SE lancamento.tipo == "rateio_overhead":
    SE lancamento.memorial_calculo == NULL:
        RETORNAR {status: "INELEGIVEL", motivo: "Rateio sem memorial de cálculo"}

    SE lancamento.criterio NOT IN ["horas_homem", "area", "consumo", "uso"]:
        RETORNAR {status: "EXCECAO", motivo: "Critério de rateio não documentado"}

    SE lancamento.percentual > 100:
        RETORNAR {status: "ERRO", motivo: "Percentual de rateio > 100%"}
```

### 9.4 Memorial de Cálculo de Rateio

Todo rateio deve gerar automaticamente um **Memorial de Cálculo** contendo:
- Justificativa do rateio;
- Despesas a ratear;
- Critério utilizado;
- Memória de cálculo detalhada;
- Resumo do rateio;
- Aprovação do contador e controller.

---

## 10. ECD e ECF — LALUR/LACS

### 10.1 ECD (Escrituração Contábil Digital)

A ECD contém a escrituração contábil da empresa. O Reversa Tax deve ler:

- **Bloco I:** Livro Diário (lançamentos);
- **Bloco J:** Livro Razão (saldos por conta);
- **Registro I050:** Plano de contas;
- **Registro I150:** Saldos periódicos;
- **Registro I200/I250:** Lançamentos e partidas.

### 10.2 ECF (Escrituração Contábil Fiscal)

A ECF contém a apuração fiscal. O Reversa Tax deve ler e escrever:

- **Registro 0000:** Abertura (indicador de retificadora);
- **Registro J800/J900:** Plano de contas referencial;
- **Registro L300:** Apuração do Lucro Real;
- **Registro M300/M305:** LALUR — Adições e Exclusões;
- **Registro M310/M315:** LACS — Adições e Exclusões;
- **Parte B:** Controle de valores para períodos futuros.

### 10.3 Exclusões no LALUR/LACS

O benefício da Lei do Bem é registrado como **EXCLUSÃO** no LALUR e no LACS:

```text
LALUR (IRPJ):
  Linha: Exclusão de Incentivo à Inovação - Lei 11.196/05
  Valor: Dispêndios elegíveis + Exclusão adicional

LACS (CSLL):
  Linha: Exclusão de Incentivo à Inovação - Lei 11.196/05
  Valor: Dispêndios elegíveis + Exclusão adicional
```

### 10.4 Regra de Validação Cruzada (Reconciliação)

```text
SE (Soma Contas Analíticas P&D no Razão) != (Valor Informado no LALUR - Exclusão):
    ERRO CRÍTICO: "Divergência entre Contabilidade (ECD) e Fiscal (ECF)."
    AÇÃO: Bloquear geração do FORMP&D até ajuste contábil ou fiscal.
```

### 10.5 Registros Específicos

| Registro | Descrição | Uso no Reversa Tax |
|---|---|---|
| ECD I050 | Plano de contas | Validar contas de P&D |
| ECD I150 | Saldos periódicos | Conferir totais |
| ECD I200/I250 | Lançamentos | Validar histórico e contrapartida |
| ECF J800 | Plano referencial | Mapear contas |
| ECF L300 | Apuração Lucro Real | Base de cálculo |
| ECF M300 | LALUR Adições | Verificar ajustes |
| ECF M305 | LALUR Exclusões | Inserir exclusão Lei do Bem |
| ECF M310 | LACS Adições | Verificar ajustes |
| ECF M315 | LACS Exclusões | Inserir exclusão Lei do Bem |

---

## 11. Partidas Contábeis Padrão

### 11.1 Apropriação de Folha de P&D

```text
D - 3.1.01.01.00 - Despesas com Pessoal P&D (Resultado)
C - 2.1.01.01.00 - Salários a Pagar (Passivo Circulante)
```

**Validação:** Cruzar com folha de pagamento e centro de custo.

### 11.2 Compra de Material de Consumo para Protótipo

```text
D - 3.1.01.02.00 - Materiais de P&D (Resultado)
C - 2.1.01.02.00 - Fornecedores (Passivo Circulante)
```

**Validação:** Exigir XML da NF-e vinculado.

### 11.3 Rateio de Aluguel do Laboratório

```text
D - 3.1.01.06.00 - Rateio Overhead P&D (Resultado)
C - 3.1.02.01.00 - Despesas Administrativas (Resultado - Estorno/Transferência)
```

**Validação:** Exigir Memorial de Cálculo de Rateio anexado ao lançamento.

### 11.4 Depreciação de Equipamento de P&D

```text
D - 3.1.01.04.01 - Depreciação P&D (Resultado)
C - 2.2.01.01.00 - Depreciação Acumulada (Ativo Não Circulante)
```

**Validação:** Ativo identificado, percentual de uso em P&D.

### 11.5 Serviço de Terceiro (Universidade/ICT)

```text
D - 3.1.01.03.03 - Serviços P&D - Universidades (Resultado)
C - 2.1.01.02.00 - Fornecedores (Passivo Circulante)
```

**Validação:** Contrato, NF com escopo técnico, relatório de entrega.

### 11.6 Regras de Validação de Lançamentos

```text
SE lancamento.historico == "" OU lancamento.historico == "Pgto NF":
    ALERTA: "Histórico genérico. Exigir detalhamento."

SE lancamento.conta_debito NOT IN CONTAS_PD:
    ALERTA: "Conta não segregada."

SE lancamento.documento_origem == NULL:
    ALERTA: "Sem documento de origem."

SE lancamento.centro_custo != "P&D":
    ALERTA: "Centro de custo incorreto."
```

---

## 12. Motor de Cálculo do Benefício

### 12.1 Variáveis

```text
D = Dispêndios elegíveis do período
A = Adicional aplicável (60% ou 80%)
B = Base tributável disponível (lucro real antes da exclusão)
T = Alíquota efetiva combinada IRPJ + CSLL
```

### 12.2 Cálculo Passo a Passo

```text
1. Somar dispêndios elegíveis por rubrica:
   D = pessoal + materiais + servicos + depreciacao + outros

2. Definir o percentual (P):
   SE aumento de pesquisadores > 5%: P = 0.80
   SENÃO SE aumento de pesquisadores > 0: P = 0.70
   SENÃO: P = 0.60

3. Calcular exclusão adicional:
   Exclusao = D × P + Dispendios_patente_concedida × 0.20

4. (Não somar D: o dispêndio já reduziu o lucro como despesa.)
   Exclusao_Total = Exclusao

5. Verificar limite de lucro:
   Base_IRPJ = obter_base_irpj(empresa, ano)
   Base_CSLL = obter_base_csll(empresa, ano)

   Exclusao_IRPJ = MIN(Exclusao_Total, Base_IRPJ)
   Exclusao_CSLL = MIN(Exclusao_Total, Base_CSLL)

   Excedente_IRPJ = MAX(0, Exclusao_Total - Base_IRPJ)
   Excedente_CSLL = MAX(0, Exclusao_Total - Base_CSLL)

6. Calcular economia:
   Economia_IRPJ = Exclusao_IRPJ × Aliquota_IRPJ
   Economia_CSLL = Exclusao_CSLL × Aliquota_CSLL
   Economia_Total = Economia_IRPJ + Economia_CSLL

7. Retornar resultado:
   RETORNAR {
       dispêndios_elegiveis: D,
       exclusao_adicional: Exclusao_Adicional,
       exclusao_total: Exclusao_Total,
       exclusao_aproveitada_irpj: Exclusao_IRPJ,
       exclusao_aproveitada_csll: Exclusao_CSLL,
       excedente_perdido_irpj: Excedente_IRPJ,
       excedente_perdido_csll: Excedente_CSLL,
       economia_irpj: Economia_IRPJ,
       economia_csll: Economia_CSLL,
       economia_total: Economia_Total
   }
```

### 12.3 Exemplo Numérico

```text
Dados:
- Dispêndios elegíveis (D): R$ 1.000.000
- Percentual: 60% (sem aumento de pesquisadores)
- Lucro real antes da exclusão: R$ 800.000 (ano)
- Base da CSLL antes da exclusão: R$ 750.000
- CSLL: 9%

Cálculo:
- Exclusão adicional: R$ 1.000.000 × 60% = R$ 600.000

IRPJ:
- Exclusão aproveitável: MIN(600.000, 800.000) = R$ 600.000
- IRPJ antes: 800.000 × 15% + (800.000 − 240.000) × 10% = R$ 176.000
- IRPJ depois: 200.000 × 15% + 0 = R$ 30.000
- Economia IRPJ: R$ 146.000

CSLL:
- Exclusão aproveitável: MIN(600.000, 750.000) = R$ 600.000
- Economia CSLL: 600.000 × 9% = R$ 54.000

ECONOMIA TOTAL: R$ 200.000
```

### 12.4 Cálculo Retroativo (Recuperação)

```text
FUNCAO calcular_retroativo(empresa, ano):

    ecf_original = baixar_ECF(empresa, ano)
    lucro_original = extrair_lucro_real(ecf_original)

    SE lucro_original <= 0:
        RETORNAR "Sem lucro. Sem benefício."

    despesas_pd = identificar_despesas_pd(empresa, ano)
    SE despesas_pd == 0:
        RETORNAR "Sem despesas elegíveis."

    exclusao = calcular_exclusao(despesas_pd)
    novo_lucro = lucro_original - exclusao

    imposto_original = calcular_imposto(ecf_original)
    imposto_novo = calcular_imposto_com_exclusao(novo_lucro)
    credito = imposto_original - imposto_novo

    SE credito > 0:
        RETORNAR {credito, status: "Oportunidade de recuperação"}
    SENÃO:
        RETORNAR {credito: 0, status: "Sem impacto"}
```

---

## 13. Automação e Pipeline

### 13.1 Módulos do Sistema

1. **Onboarding e procuração**
2. **Ingestão de dados fiscais e contábeis**
3. **Motor de elegibilidade fiscal**
4. **Descoberta e classificação de projetos**
5. **Segregação contábil e conciliação**
6. **Motor de despesas elegíveis**
7. **Motor de cálculo IRPJ/CSLL**
8. **Geração do FORMP&D**
9. **Workflow de revisão humana**
10. **Auditoria, trilha e pós-entrega**

### 13.2 Pipeline de Automação

```text
Onboarding
   ↓
Coleta de ECF/ECD, balancetes, folha, NFs, contratos, projetos
   ↓
Normalização de dados
   ↓
Verificação fiscal: Lucro Real, CND/CPEN, lucro tributável
   ↓
Identificação de projetos
   ↓
Classificação técnica por IA + regras
   ↓
Vinculação de despesas aos projetos
   ↓
Validação contábil: contas, centros de custo, razão
   ↓
Conciliação ECD/ECF x FORMP&D
   ↓
Cálculo do benefício
   ↓
Score de confiança
   ↓
Se score alto: gerar FORMP&D para revisão final
Se score baixo: fila de exceção humana
   ↓
Aprovação humana
   ↓
Submissão / armazenamento de recibo
   ↓
Monitoramento pós-entrega
```

### 13.3 Dados de Entrada

#### Dados Fiscais e Contábeis
- ECF dos anos analisados;
- ECD dos anos analisados;
- Recibos de transmissão;
- Balancetes analíticos;
- Razão analítico;
- Plano de contas;
- Centros de custo;
- Apuração de IRPJ e CSLL;
- e-LALUR/e-LACS;
- DCTF;
- CND/CPEN;
- Relatório de situação fiscal;
- Parcelamentos ativos;
- Comprovantes de pagamento de tributos.

#### Dados de Projetos
- Ficha técnica de cada projeto;
- Descrição do desafio tecnológico;
- Equipe envolvida;
- Cronograma;
- Evidências (commits, testes, protótipos);
- Patentes ou cultivares.

#### Dados de Despesas
- Folha de pagamento analítica;
- Timesheets;
- Notas fiscais (XML NF-e);
- Contratos de prestação de serviços;
- Comprovantes de pagamento;
- Razão contábil por conta e centro de custo;
- Ativo imobilizado (para depreciação).

### 13.4 Integrações Recomendadas

| Sistema | Dados |
|---|---|
| Receita Federal / e-CAC | ECF, ECD, CND, DCTF |
| MCTI | FORMP&D |
| ERP | Plano de contas, razão, balancetes |
| Folha / eSocial | Salários, encargos, funcionários |
| NF-e / NFS-e | Notas fiscais |
| Jira / Azure DevOps / ClickUp | Backlog, sprints, tarefas |
| GitHub / GitLab / Bitbucket | Commits, PRs, issues |
| Confluence / Notion | Documentação técnica |
| Google Drive / SharePoint | Arquivos e evidências |
| Bancos | Comprovantes de pagamento |

---

## 14. Score de Confiança

### 14.1 Dimensões e Pesos

| Dimensão | Peso |
|---|---:|
| Regularidade fiscal | 20% |
| Lucro tributável suficiente | 15% |
| Regime tributário correto | 10% |
| Qualidade técnica do projeto | 25% |
| Segregação contábil | 15% |
| Evidências documentais | 10% |
| Conciliação ECF/ECD/FORMP&D | 5% |

### 14.2 Fórmula

```text
Score =
  fiscal_score × 0.20
+ lucro_score × 0.15
+ regime_score × 0.10
+ technical_score × 0.25
+ accounting_score × 0.15
+ evidence_score × 0.10
+ reconciliation_score × 0.05
```

### 14.3 Política de Automação

| Score | Ação |
|---|---|
| 95 a 100 | Automação quase total; revisão humana apenas formal |
| 85 a 94 | Geração automática com revisão leve |
| 70 a 84 | Revisão humana obrigatória |
| 50 a 69 | Exceção severa; exigir documentos adicionais |
| 0 a 49 | Bloquear benefício |

### 14.4 Condições para 98-99% de Automação

A automação de 98-99% só é realista se o cliente tiver:

- ECF/ECD válidas;
- Plano de contas com contas de P&D;
- Centro de custo por projeto;
- Timesheet da equipe;
- Notas fiscais organizadas;
- Contratos técnicos;
- Descrição técnica dos projetos;
- Regularidade fiscal;
- Lucro tributável;
- Integração com ERP/folha/projetos.

---

## 15. Workflow de Revisão Humana

### 15.1 Etapas de Revisão

#### Revisão 1 — Elegibilidade Fiscal
**Responsável:** Contador / Tributário
**Valida:**
- Regime tributário;
- Lucro tributável;
- CND/CPEN;
- Base de cálculo;
- Período;
- Limite de aproveitamento.

#### Revisão 2 — Elegibilidade Técnica
**Responsável:** Especialista técnico / P&D
**Valida:**
- Projeto é realmente inovação tecnológica?
- Há risco técnico?
- Há evidências?
- Há metodologia?
- Atividades excluídas foram removidas?

#### Revisão 3 — Elegibilidade Contábil
**Responsável:** Contabilidade
**Valida:**
- Contas segregadas;
- Conciliação ECD/ECF;
- Rateios;
- Folha;
- Depreciação;
- Serviços de terceiros.

#### Revisão 4 — Aprovação Final
**Responsável:** Diretor / Comitê
**Valida:**
- FORMP&D;
- Memória de cálculo;
- Dossiê;
- Riscos;
- Parecer final.

### 15.2 Matriz RACI

| Atividade | Reversa Tax | Contador | Esp. P&D | Diretor |
|---|---|---|---|---|
| Coleta de dados | R | C | C | I |
| Classificação de projetos | R | C | A | I |
| Cálculo do benefício | R | A | I | I |
| Segregação contábil | R | A | I | I |
| Geração FORMP&D | R | C | C | I |
| Aprovação final | I | C | C | A |
| Submissão | R | A | I | A |
| Retificação ECF | R | A | I | A |
| PER/DCOMP | R | A | I | A |

R = Responsável | A = Aprovador | C = Consultado | I = Informado

### 15.3 Fluxo de Decisão

```text
IA classifica projeto
   ↓
IA classifica despesas
   ↓
Motor fiscal calcula
   ↓
Motor contábil reconcilia
   ↓
Score >= 95?
   ↓
Sim: gera pacote para revisão final rápida
Não: cria tarefa com pendências
   ↓
Humano valida
   ↓
Se aprova: libera FORMP&D
Se reprova: registra motivo e ajusta regra
```

---

## 16. Retificações

### 16.1 Visão Geral

Retificação é o processo de corrigir declarações já transmitidas para incluir benefícios não usufruídos ou corrigir erros.

| Documento | O que retifica | Prazo | Risco |
|---|---|---|---|
| ECF | Apuração de IRPJ/CSLL, LALUR/LACS | 5 anos | Médio/Alto |
| ECD | Escrituração contábil digital | 5 anos | Médio |
| FORMP&D | Declaração ao MCTI | Conforme MCTI | Médio |
| DCTF | Débitos e créditos confessados | 5 anos | Alto |
| PER/DCOMP | Pedido de restituição/compensação | 5 anos | Alto |

### 16.2 Retificação da ECF

#### Quando retificar?
1. Empresa tinha lucro tributável positivo;
2. Havia despesas elegíveis de P&D;
3. A empresa **não** usufruiu da exclusão da Lei do Bem;
4. O FORMP&D foi entregue (ou pode ser entregue extemporaneamente);
5. Ainda está dentro do prazo de 5 anos.

#### Prazo decadencial

```text
Ano-calendário 2021 → ECF transmitida em 2022 → Prazo até 2027
Ano-calendário 2022 → ECF transmitida em 2023 → Prazo até 2028
Ano-calendário 2023 → ECF transmitida em 2024 → Prazo até 2029
Ano-calendário 2024 → ECF transmitida em 2025 → Prazo até 2030
Ano-calendário 2025 → ECF transmitida em 2026 → Prazo até 2031
```

> **Base legal:** Art. 173, CTN. O prazo decadencial de 5 anos começa do primeiro dia do exercício seguinte àquele em que o lançamento poderia ter sido efetuado.

#### Fluxo de retificação da ECF

```text
1. Identificar ano com oportunidade
   ↓
2. Verificar se ECF original foi transmitida
   ↓
3. Baixar ECF original (via procuração/e-CAC)
   ↓
4. Recalcular apuração com exclusão Lei do Bem
   ↓
5. Gerar ECF retificadora
   (manter registro 0000 com indicador de retificadora = "S")
   ↓
6. Alterar registros do LALUR/LACS (Parte A e B)
   ↓
7. Recalcular IRPJ/CSLL devidos
   ↓
8. Se imposto pago a maior → gerar PER/DCOMP
   ↓
9. Revisão humana obrigatória
   ↓
10. Transmitir ECF retificadora
   ↓
11. Aguardar processamento (24-72h)
   ↓
12. Verificar se retificação foi aceita
```

#### Regras de automação da ECF retificadora

```text
FUNCAO gerar_ECF_retificadora(ecf_original, exclusao):

    ecf_ret = copiar(ecf_original)

    ecf_ret.registro_0000.indicador_retificadora = "S"
    ecf_ret.registro_0000.numero_recibo_anterior = ecf_original.recibo

    ecf_ret.LALUR.exclusoes.adicionar({
        codigo: "LEI_DO_BEM",
        descricao: "Exclusão P&D - Lei 11.196/05",
        valor: exclusao
    })

    ecf_ret.LACS.exclusoes.adicionar({
        codigo: "LEI_DO_BEM",
        descricao: "Exclusão P&D - Lei 11.196/05",
        valor: exclusao
    })

    ecf_ret.apuracao_IRPJ.recalcular()
    ecf_ret.apuracao_CSLL.recalcular()

    RETORNAR ecf_ret
```

### 16.3 Retificação da ECD

#### Quando retificar?
- Contas de P&D foram lançadas incorretamente;
- Centro de custo não foi segregado;
- Histórico dos lançamentos está genérico;
- Valores estão divergentes do razão auxiliar.

#### Cuidados
- A ECD retificadora **substitui** a original;
- Se a ECD original já foi usada como base para ECF, a retificação da ECD pode exigir retificação da ECF;
- O Reversa Tax deve alertar: **"Retificar ECD impacta ECF. Deseja prosseguir?"**

#### Regra de automação

```text
SE retificar_ECD == TRUE:
    verificar_se_ECF_ja_transmitida(ano)
    SE ECF_transmitida == TRUE:
        ALERTA: "ECF vinculada a esta ECD. Retificação da ECD exigirá retificação da ECF."
        criar_tarefa_retificacao_ECF()
```

### 16.4 Retificação do FORMP&D

#### Quando retificar?
- Projetos não foram informados;
- Valores de despesas estão incorretos;
- Dados técnicos estão incompletos;
- Equipe não foi declarada.

#### Regras
- O FORMP&D retificador **substitui** o anterior;
- Deve manter o mesmo CNPJ e ano-calendário;
- O número do recibo original deve ser referenciado;
- Prazo: enquanto o MCTI aceitar retificações.

#### Automação

```text
SE FORMP&D_original.existe == TRUE:
    gerar_FORMP&D_retificador()
    incluir_campo("numero_recibo_anterior", recibo_original)
    incluir_campo("indicador_retificadora", "S")
SENÃO:
    gerar_FORMP&D_original()
```

### 16.5 Matriz de Risco de Retificação

| Cenário | Risco | Ação |
|---|---|---|
| Retificar ECF para incluir exclusão com lucro positivo e FORMP&D entregue | Baixo | Aprovação simples |
| Retificar ECF + FORMP&D extemporâneo | Médio | Revisão dupla |
| Retificar ECF + ECD + FORMP&D | Médio/Alto | Revisão dupla + parecer |
| Retificar ECF com lucro negativo (sem benefício imediato) | Alto | Bloquear sem parecer jurídico |
| Retificar com carry-forward (se permitido) | Alto | Parecer jurídico obrigatório |
| PER/DCOMP com valor > R$ 500 mil | Alto | Revisão tripla + seguro |
| Retificação de ano com fiscalização em andamento | Crítico | Bloquear |

---

## 17. PER/DCOMP — Recuperação de Tributos

### 17.1 O que é?

Quando a retificação da ECF resulta em IRPJ/CSLL pagos a maior, a empresa pode pedir restituição ou compensação via **PER/DCOMP** (Pedido Eletrônico de Restituição, Ressarcimento ou Reembolso e Declaração de Compensação).

### 17.2 Regras

- Prazo: 5 anos contados do pagamento indevido;
- O crédito deve ser líquido e certo;
- Não pode haver débito impeditivo;
- A compensação pode ser com qualquer tributo administrado pela RFB;
- A restituição em dinheiro é mais demorada.

### 17.3 Fluxo no Reversa Tax

```text
1. ECF retificadora processada e aceita
   ↓
2. Sistema calcula diferença:
   imposto_original - imposto_retificado = credito
   ↓
3. SE credito > 0:
   gerar_minuta_PER_DCOMP()
   ↓
4. Revisão humana (contador + advogado)
   ↓
5. Transmitir PER/DCOMP via e-CAC
   ↓
6. Acompanhar despacho decisório
   ↓
7. SE compensação: monitorar DCTF dos meses seguintes
   SE restituição: monitorar conta bancária
```

### 17.4 Campos do PER/DCOMP

```json
{
  "tipo": "PER/DCOMP",
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "periodo_apuracao": "2023",
  "tributo": "IRPJ",
  "tipo_credito": "pagamento_indevido_a_maior",
  "valor_original": 500000.00,
  "valor_retificado": 350000.00,
  "credito_gerado": 150000.00,
  "forma_utilizacao": "compensacao",
  "tributos_compensar": ["IRPJ", "CSLL", "PIS", "COFINS"],
  "fundamentacao": "Art. 19 Lei 11.196/2005 - Exclusão P&D",
  "documento_suporte": "ECF_retificadora_recibo_XXXXX"
}
```

### 17.5 Memorando de Recuperação Retroativa

O sistema deve gerar automaticamente um memorando contendo:
- Anos analisados;
- Regime tributário por ano;
- Lucro tributável por ano;
- Despesas elegíveis identificadas;
- Exclusão adicional calculada;
- Imposto original vs. recalculado;
- Crédito gerado;
- Ações necessárias;
- Riscos e mitigações;
- Aprovações.

---

## 18. Modelos de Documentos

### 18.1 Modelo 01 — Projeto Técnico de P&D

```
═══════════════════════════════════════════════════════════
PROJETO TÉCNICO DE PESQUISA E DESENVOLVIMENTO
Lei nº 11.196/2005 — Lei do Bem
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
CNPJ: [XX.XXX.XXX/XXXX-XX]
Ano-Calendário: [AAAA]

───────────────────────────────────────────────────────────
1. IDENTIFICAÇÃO DO PROJETO
───────────────────────────────────────────────────────────
Código do Projeto: [PRJ-AAAA-XXX]
Título: [Nome do projeto]
Área Tecnológica: [ ] Produto  [ ] Processo  [ ] Software  [ ] Outro
Data de Início: [DD/MM/AAAA]
Data de Término (previsto/real): [DD/MM/AAAA]
Responsável Técnico: [Nome / Cargo / CREA ou registro]

───────────────────────────────────────────────────────────
2. OBJETIVO TECNOLÓGICO
───────────────────────────────────────────────────────────
[Descrever em 3-5 frases o objetivo técnico do projeto.]

───────────────────────────────────────────────────────────
3. DESAFIO TECNOLÓGICO / INCERTEZA
───────────────────────────────────────────────────────────
[Descrever o problema técnico que NÃO tinha solução óbvia.]

───────────────────────────────────────────────────────────
4. NOVIDADE / INOVAÇÃO
───────────────────────────────────────────────────────────
[ ] Novo para a empresa
[ ] Novo para o mercado nacional
[ ] Novo para o mercado internacional
[ ] Melhoria significativa de produto/processo existente

Descrição da novidade:
[Detalhar o que é novo ou significativamente melhorado]

───────────────────────────────────────────────────────────
5. METODOLOGIA UTILIZADA
───────────────────────────────────────────────────────────
Fase 1 - Pesquisa: [descrição]
Fase 2 - Desenvolvimento: [descrição]
Fase 3 - Testes: [descrição]
Fase 4 - Validação: [descrição]

───────────────────────────────────────────────────────────
6. EQUIPE TÉCNICA
───────────────────────────────────────────────────────────
| Nome | Cargo | Formação | Dedicação (%) | Período |
|------|-------|----------|---------------|---------|
|      |       |          |               |         |

───────────────────────────────────────────────────────────
7. RESULTADOS OBTIDOS / ESPERADOS
───────────────────────────────────────────────────────────
[Descrever resultados técnicos mensuráveis]

───────────────────────────────────────────────────────────
8. EVIDÊNCIAS DISPONÍVEIS
───────────────────────────────────────────────────────────
[ ] Relatório técnico
[ ] Commits / Repositório de código
[ ] Relatórios de teste
[ ] Fotos de protótipo
[ ] Atas de reunião
[ ] Contratos com ICTs
[ ] Pedidos de patente
[ ] Outros: [especificar]

───────────────────────────────────────────────────────────
9. CLASSIFICAÇÃO FISCAL
───────────────────────────────────────────────────────────
[ ] Pesquisa tecnológica (Art. 17, I, Lei 11.196/05)
[ ] Desenvolvimento de inovação (Art. 17, II, Lei 11.196/05)
[ ] Inovação de produto
[ ] Inovação de processo

───────────────────────────────────────────────────────────
10. APROVAÇÕES
───────────────────────────────────────────────────────────
Responsável Técnico: _________________ Data: ___/___/___
Controller/Contador: _________________ Data: ___/___/___
Diretor/CEO:         _________________ Data: ___/___/___

═══════════════════════════════════════════════════════════
Documento gerado automaticamente pelo Reversa Tax v[X.X]
Hash de integridade: [SHA-256]
═══════════════════════════════════════════════════════════
```

### 18.2 Modelo 02 — Memorial de Cálculo de Rateio

```
═══════════════════════════════════════════════════════════
MEMORIAL DE CÁLCULO DE RATEIO DE DESPESAS INDIRETAS
Lei do Bem — IN RFB 1.187/2011, Art. 4º, § 3º
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
CNPJ: [XX.XXX.XXX/XXXX-XX]
Ano-Calendário: [AAAA]
Período de Rateio: [MM/AAAA a MM/AAAA]

───────────────────────────────────────────────────────────
1. JUSTIFICATIVA DO RATEIO
───────────────────────────────────────────────────────────
[Explicar por que a despesa é indireta e como ela
contribui para os projetos de P&D.]

───────────────────────────────────────────────────────────
2. DESPESAS A RATEAR
───────────────────────────────────────────────────────────
| Conta Contábil | Descrição | Valor Total (R$) |
|---------------|-----------|-------------------|
|               |           |                   |
| TOTAL         |           |                   |

───────────────────────────────────────────────────────────
3. CRITÉRIO DE RATEIO
───────────────────────────────────────────────────────────
Critério utilizado: [Área ocupada / Horas-homem / Consumo]

Justificativa do critério:
[Explicar por que este critério é o mais adequado]

───────────────────────────────────────────────────────────
4. MEMÓRIA DE CÁLCULO
───────────────────────────────────────────────────────────
[Detalhar cálculos por despesa]

───────────────────────────────────────────────────────────
5. RESUMO DO RATEIO
───────────────────────────────────────────────────────────
| Despesa | Valor Total | % P&D | Valor P&D |
|---------|------------|-------|-----------|
|         |            |       |           |
| TOTAL   |            |       |           |

───────────────────────────────────────────────────────────
6. APROVAÇÃO
───────────────────────────────────────────────────────────
Contador: _________________ CRC: _________ Data: ___/___/___
Controller: _________________ Data: ___/___/___

═══════════════════════════════════════════════════════════
Documento gerado pelo Reversa Tax v[X.X]
Hash: [SHA-256]
═══════════════════════════════════════════════════════════
```

### 18.3 Modelo 03 — Parecer de Elegibilidade

```
═══════════════════════════════════════════════════════════
PARECER DE ELEGIBILIDADE — LEI DO BEM
Lei nº 11.196/2005 | Decreto nº 5.798/2006
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
CNPJ: [XX.XXX.XXX/XXXX-XX]
Ano-Calendário: [AAAA]
Data do Parecer: [DD/MM/AAAA]
Parecer nº: [PAR-AAAA-XXX]

───────────────────────────────────────────────────────────
1. OBJETIVO
───────────────────────────────────────────────────────────
O presente parecer tem por objetivo atestar a elegibilidade
da empresa à fruição dos incentivos fiscais da Lei do Bem.

───────────────────────────────────────────────────────────
2. REQUISITOS LEGAIS VERIFICADOS
───────────────────────────────────────────────────────────
[ ] Regime tributário: Lucro Real
[ ] Regularidade fiscal federal
[ ] Lucro tributável positivo
[ ] Atividades de P&D realizadas
[ ] Despesas segregadas contabilmente
[ ] FORMP&D entregue/programado

───────────────────────────────────────────────────────────
3. PROJETOS ANALISADOS
───────────────────────────────────────────────────────────
| Projeto | Área | Score Técnico | Status |
|---------|------|---------------|--------|
|         |      |               |        |

───────────────────────────────────────────────────────────
4. DESPESAS ELEGÍVEIS
───────────────────────────────────────────────────────────
| Rubrica | Valor (R$) |
|---------|-----------|
| Pessoal |           |
| Materiais |         |
| Serviços |          |
| Depreciação |       |
| TOTAL |             |

───────────────────────────────────────────────────────────
5. CÁLCULO DO BENEFÍCIO
───────────────────────────────────────────────────────────
Dispêndios elegíveis: R$ [valor]
Adicional aplicado: [60% / 80%]
Exclusão adicional: R$ [valor]
Base IRPJ disponível: R$ [valor]
Base CSLL disponível: R$ [valor]
Exclusão aproveitável IRPJ: R$ [valor]
Exclusão aproveitável CSLL: R$ [valor]
Economia estimada IRPJ: R$ [valor]
Economia estimada CSLL: R$ [valor]
ECONOMIA TOTAL ESTIMADA: R$ [valor]

───────────────────────────────────────────────────────────
6. RESSALVAS E RECOMENDAÇÕES
───────────────────────────────────────────────────────────
[Listar qualquer ressalva, pendência ou recomendação]

───────────────────────────────────────────────────────────
7. CONCLUSÃO
───────────────────────────────────────────────────────────
[Concluir se a empresa é elegível e em que condições]

───────────────────────────────────────────────────────────
8. RESPONSÁVEIS
───────────────────────────────────────────────────────────
Contador Responsável: _________________ CRC: _________
Advogado Tributarista: _________________ OAB: _________
Responsável Técnico P&D: _________________

═══════════════════════════════════════════════════════════
Parecer gerado pelo Reversa Tax v[X.X]
Este documento não substitui parecer jurídico individual.
Hash: [SHA-256]
═══════════════════════════════════════════════════════════
```

### 18.4 Modelo 04 — Relatório de Evidências Técnicas

```
═══════════════════════════════════════════════════════════
RELATÓRIO DE EVIDÊNCIAS TÉCNICAS
Projeto: [PRJ-AAAA-XXX]
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
Ano-Calendário: [AAAA]

───────────────────────────────────────────────────────────
1. RESUMO DO PROJETO
───────────────────────────────────────────────────────────
[2-3 frases sobre o projeto]

───────────────────────────────────────────────────────────
2. EVIDÊNCIAS COLETADAS
───────────────────────────────────────────────────────────

2.1 Documentação Técnica
[ ] Arquitetura de sistema / Diagrama UML
[ ] Especificação de requisitos técnicos
[ ] Design documents
[ ] ADRs (Architecture Decision Records)
[ ] Relatório de pesquisa

2.2 Evidências de Desenvolvimento
[ ] Commits em repositório: [URL / hash]
    Total de commits: [N]
    Período: [DD/MM a DD/MM]
[ ] Pull Requests / Merge Requests: [N]
[ ] Branches de feature: [lista]

2.3 Evidências de Testes
[ ] Relatórios de teste unitário
[ ] Relatórios de teste de integração
[ ] Relatórios de teste de performance
[ ] Logs de falhas e correções
[ ] Resultados de benchmarks

2.4 Evidências de Prototipagem
[ ] Fotos de protótipo
[ ] Vídeos de demonstração
[ ] Registros de laboratório
[ ] Resultados de pilot

2.5 Evidências de Gestão
[ ] Backlog de sprints
[ ] Atas de reuniões técnicas
[ ] Cronograma do projeto
[ ] Timesheets da equipe

2.6 Propriedade Intelectual
[ ] Pedido de patente depositado: [número INPI]
[ ] Registro de software: [número INPI]
[ ] Registro de cultivar: [número MAPA]

───────────────────────────────────────────────────────────
3. ANÁLISE DE ADESÃO
───────────────────────────────────────────────────────────
Critério | Presente | Score | Observação
---------|----------|-------|----------
Novidade |         |       |
Risco técnico |    |       |
Metodologia |      |       |
Evidências |       |       |
Equipe |           |       |

SCORE GERAL: [XX/100]

───────────────────────────────────────────────────────────
4. CONCLUSÃO
───────────────────────────────────────────────────────────
[Elegível / Elegível com ressalvas / Não elegível]

═══════════════════════════════════════════════════════════
Relatório gerado pelo Reversa Tax v[X.X]
Hash: [SHA-256]
═══════════════════════════════════════════════════════════
```

### 18.5 Modelo 05 — Termo de Responsabilidade

```
═══════════════════════════════════════════════════════════
TERMO DE RESPONSABILIDADE
Fruição de Incentivos Fiscais — Lei do Bem
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
CNPJ: [XX.XXX.XXX/XXXX-XX]
Ano-Calendário: [AAAA]

Eu, [NOME COMPLETO], portador(a) do CPF nº [XXX.XXX.XXX-XX],
na qualidade de [CARGO] da empresa acima identificada, DECLARO que:

1. As informações prestadas no FORMP&D e na ECF são verdadeiras;
2. Os dispêndios informados foram efetivamente incorridos;
3. As despesas foram segregadas contabilmente;
4. A empresa encontra-se em situação regular perante os tributos federais;
5. Não há dupla contagem com outros incentivos fiscais;
6. Estou ciente das penalidades previstas na legislação tributária.

[CIDADE], [DD] de [MÊS] de [AAAA].

_________________________________________
[NOME COMPLETO]
[CARGO]
CPF: [XXX.XXX.XXX-XX]

═══════════════════════════════════════════════════════════
```

### 18.6 Modelo 06 — Checklist de Auditoria

```
═══════════════════════════════════════════════════════════
CHECKLIST DE AUDITORIA — LEI DO BEM
Ano-Calendário: [AAAA]
═══════════════════════════════════════════════════════════

SEÇÃO A — ELEGIBILIDADE FISCAL
[ ] A empresa está no Lucro Real?
[ ] ECF transmitida e válida?
[ ] CND/CPEN válida no período?
[ ] Não há débitos em dívida ativa?
[ ] Lucro tributável positivo verificado?
[ ] Base IRPJ e CSLL confirmadas?

SEÇÃO B — PROJETOS
[ ] Cada projeto tem ficha técnica preenchida?
[ ] Cada projeto tem desafio técnico identificado?
[ ] Cada projeto tem evidências mínimas?
[ ] Nenhum projeto é atividade rotineira?
[ ] Projetos foram aprovados pelo responsável técnico?

SEÇÃO C — DESPESAS
[ ] Despesas em contas segregadas?
[ ] Folha com timesheet/alocação?
[ ] NFs com descrição técnica?
[ ] Contratos com escopo definido?
[ ] Depreciação calculada corretamente?
[ ] Rateio com memorial de cálculo?
[ ] Sem dupla contagem?

SEÇÃO D — CÁLCULO
[ ] Exclusão adicional calculada (60%/80%)?
[ ] Limite de lucro respeitado?
[ ] Alíquota efetiva confirmada?
[ ] ECF recalculada corretamente?

SEÇÃO E — OBRIGAÇÕES ACESSÓRIAS
[ ] FORMP&D preenchido?
[ ] FORMP&D bate com contabilidade?
[ ] Prazo de entrega verificado?
[ ] ECF com exclusão no LALUR?

SEÇÃO F — DOCUMENTAÇÃO
[ ] Dossiê técnico montado?
[ ] Parecer de elegibilidade emitido?
[ ] Termo de responsabilidade assinado?
[ ] Documentos armazenados (mín. 5 anos)?

RESULTADO:
[ ] APROVADO — Sem ressalvas
[ ] APROVADO — Com ressalvas (listar)
[ ] REPROVADO — Pendências críticas (listar)

Auditor: _________________ Data: ___/___/___
═══════════════════════════════════════════════════════════
```

### 18.7 Modelo 07 — Memorando de Recuperação Retroativa

```
═══════════════════════════════════════════════════════════
MEMORANDO DE RECUPERAÇÃO RETROATIVA
Lei do Bem — Anos [AAAA] a [AAAA]
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
CNPJ: [XX.XXX.XXX/XXXX-XX]
Data: [DD/MM/AAAA]
Memo nº: [REC-AAAA-XXX]

───────────────────────────────────────────────────────────
1. OBJETIVO
───────────────────────────────────────────────────────────
Identificar e quantificar oportunidades de recuperação de
tributos pagos a maior por não fruição dos incentivos da
Lei do Bem em anos anteriores.

───────────────────────────────────────────────────────────
2. ANOS ANALISADOS
───────────────────────────────────────────────────────────
| Ano | Regime | Lucro | P&D | FORMP&D | Oportunidade |
|-----|--------|-------|-----|---------|-------------|
|     |        |       |     |         |             |

───────────────────────────────────────────────────────────
3. DETALHAMENTO POR ANO COM OPORTUNIDADE
───────────────────────────────────────────────────────────
ANO [AAAA]:
- Lucro tributável original: R$ [valor]
- Despesas elegíveis identificadas: R$ [valor]
- Exclusão adicional (60%): R$ [valor]
- IRPJ original: R$ [valor]
- IRPJ recalculado: R$ [valor]
- CRÉDITO IRPJ: R$ [valor]
- CSLL original: R$ [valor]
- CSLL recalculada: R$ [valor]
- CRÉDITO CSLL: R$ [valor]
- CRÉDITO TOTAL: R$ [valor]

───────────────────────────────────────────────────────────
4. AÇÕES NECESSÁRIAS
───────────────────────────────────────────────────────────
[ ] Retificar ECF do ano [AAAA]
[ ] Entregar FORMP&D extemporâneo
[ ] Retificar ECD (se necessário)
[ ] Transmitir PER/DCOMP
[ ] Pagar eventuais diferenças de tributos

───────────────────────────────────────────────────────────
5. RISCOS E MITIGAÇÕES
───────────────────────────────────────────────────────────
[Riscos identificados e como mitigá-los]

───────────────────────────────────────────────────────────
6. APROVAÇÃO
───────────────────────────────────────────────────────────
Contador: _________________ CRC: _________
Advogado: _________________ OAB: _________
Diretor:  _________________

═══════════════════════════════════════════════════════════
```

### 18.8 Modelo 08 — Contrato de Prestação de Serviços de P&D

```
═══════════════════════════════════════════════════════════
CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PESQUISA E
DESENVOLVIMENTO TECNOLÓGICO
═══════════════════════════════════════════════════════════

CONTRATANTE: [RAZÃO SOCIAL], CNPJ [XX.XXX.XXX/XXXX-XX]
CONTRATADA: [RAZÃO SOCIAL], CNPJ [XX.XXX.XXX/XXXX-XX]

CLÁUSULA 1 — OBJETO
1.1 Prestação de serviços de pesquisa tecnológica e/ou
    desenvolvimento de inovação tecnológica, consistentes em:
    [Descrever escopo técnico detalhado]

CLÁUSULA 2 — VINCULAÇÃO À LEI DO BEM
2.1 Os serviços são destinados exclusivamente a atividades
    de PD&I nos termos da Lei nº 11.196/2005.
2.2 A CONTRATADA declara que os serviços possuem natureza
    técnica e envolvem desafio tecnológico.

CLÁUSULA 3 — ENTREGÁVEIS
3.1 [Listar entregáveis técnicos]

CLÁUSULA 4 — PROPRIEDADE INTELECTUAL
4.1 Os resultados pertencerão à CONTRATANTE.

CLÁUSULA 5 — REMUNERAÇÃO
5.1 Valor total: R$ [valor]
5.2 Forma de pagamento: [detalhar]

CLÁUSULA 6 — CONFIDENCIALIDADE
6.1 As partes obrigam-se a manter sigilo.

CLÁUSULA 7 — PRAZO
7.1 Início: [DD/MM/AAAA]
7.2 Término: [DD/MM/AAAA]

[CIDADE], [DD] de [MÊS] de [AAAA].

CONTRATANTE: _________________
CONTRATADA: _________________

═══════════════════════════════════════════════════════════
```

### 18.9 Modelo 09 — Timesheet Mensal

```
═══════════════════════════════════════════════════════════
TIMESHEET — REGISTRO DE HORAS DEDICADAS A P&D
═══════════════════════════════════════════════════════════

Funcionário: [NOME]
Cargo: [CARGO]
Matrícula: [XXX]
Mês/Ano: [MM/AAAA]
Projeto(s): [PRJ-AAAA-XXX]

| Dia | Projeto | Atividade | Horas | Descrição |
|-----|---------|-----------|-------|-----------|
|     |         |           |       |           |

TOTAL HORAS NO MÊS: [XXX]h
HORAS DEDICADAS A P&D: [XXX]h
PERCENTUAL P&D: [XX]%

Declaro que as informações acima são verdadeiras.

Funcionário: _________________ Data: ___/___/___
Gestor: _________________ Data: ___/___/___

═══════════════════════════════════════════════════════════
```

### 18.10 Modelo 10 — Declaração de Não Dupla Contagem

```
═══════════════════════════════════════════════════════════
DECLARAÇÃO DE NÃO DUPLA CONTAGEM DE DESPESAS
═══════════════════════════════════════════════════════════

Empresa: [RAZÃO SOCIAL]
CNPJ: [XX.XXX.XXX/XXXX-XX]
Ano-Calendário: [AAAA]

DECLARO, para fins de fruição dos incentivos fiscais da
Lei nº 11.196/2005, que as despesas informadas no FORMP&D
e na ECF do ano-calendário [AAAA]:

1. NÃO foram utilizadas para fruição de qualquer outro
   incentivo fiscal federal, estadual ou municipal;
2. NÃO foram objeto de subvenção governamental que
   impeça a cumulação;
3. NÃO foram contabilizadas em duplicidade;
4. São exclusivas e segregadas para atividades de PD&I.

[CIDADE], [DD] de [MÊS] de [AAAA].

_________________________________________
[NOME — CARGO]
CPF: [XXX.XXX.XXX-XX]

═══════════════════════════════════════════════════════════
```

---

## 19. Governança e Compliance

### 19.1 Três Linhas de Defesa

```text
1ª Linha: Automação (Reversa Tax)
   → Regras determinísticas, validações, bloqueios

2ª Linha: Revisão Técnica (Contador + Especialista P&D)
   → Validação de enquadramento, cálculo, evidências

3ª Linha: Aprovação Executiva (Diretor / Comitê)
   → Decisão final de submissão, aceite de risco
```

### 19.2 Retenção de Documentos

| Documento | Prazo de Retenção | Base Legal |
|---|---|---|
| ECF/ECD | 10 anos | Prudência |
| FORMP&D + recibo | 10 anos | Prudência |
| Notas fiscais | 10 anos | Prudência |
| Contratos | 10 anos após término | Prudência |
| Timesheets | 10 anos | Prudência |
| Pareceres | 10 anos | Prudência |
| Termo de responsabilidade | 10 anos | Prudência |
| Dossiê técnico | 10 anos | Prudência |
| PER/DCOMP | 10 anos | Prudência |

> O prazo legal mínimo é 5 anos (Art. 173, CTN), mas recomenda-se 10 anos por segurança.

### 19.3 Auditoria e Trilha

O sistema deve registrar:

- Quem importou cada dado;
- Data/hora;
- Versão do documento;
- Hash do arquivo;
- Regra aplicada;
- Versão da regra;
- Score da IA;
- Decisão automática;
- Revisão humana;
- Usuário aprovador;
- Motivo de aceite/rejeição;
- Versão do FORMP&D;
- Recibo de transmissão.

### 19.4 Dossiê Automático por Projeto

Para cada projeto, o Reversa Tax deve gerar um dossiê com:

1. Resumo executivo;
2. Descrição técnica;
3. Desafio tecnológico;
4. Metodologia;
5. Equipe;
6. Horas alocadas;
7. Cronograma;
8. Evidências;
9. Despesas elegíveis;
10. Despesas excluídas;
11. Conciliação contábil;
12. Cálculo do benefício;
13. Score de confiança;
14. Alertas de risco;
15. Aprovações humanas.

---

## 20. LGPD e Segurança

### 20.1 LGPD — Proteção de Dados Pessoais

O Reversa Tax lida com dados pessoais (folha de pagamento, nomes de funcionários, CPFs). Deve implementar:

- **Minimização:** coletar apenas dados necessários;
- **Anonimização:** em relatórios de análise, usar matrícula em vez de nome completo;
- **Criptografia:** dados em repouso e em trânsito;
- **Controle de acesso:** RBAC por perfil;
- **Consentimento:** termo de consentimento para uso de dados dos funcionários;
- **DPO:** responsável pela proteção de dados;
- **Registro de tratamento:** mapeamento de dados pessoais no sistema.

### 20.2 Segurança da Informação

```text
✓ Criptografia AES-256 em repouso
✓ TLS 1.3 em trânsito
✓ Autenticação multifator (MFA)
✓ SSO / SAML / OAuth 2.0
✓ Logs de acesso imutáveis
✓ Backup diário com retenção de 30 dias
✓ Disaster recovery (RPO < 1h, RTO < 4h)
✓ Teste de penetração anual
✓ Política de senhas forte
✓ Sessão com timeout de 30 minutos
```

---

## 21. Workflow End-to-End

```text
┌─────────────────────────────────────────────────────────┐
│                    FASE 1: ONBOARDING                    │
│  → Cadastro da empresa                                  │
│  → Upload de procuração eletrônica                      │
│  → Configuração de integrações (ERP, folha, projetos)   │
│  → Definição de regime tributário e calendário          │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│              FASE 2: COLETA E INGESTÃO                   │
│  → Download ECF/ECD via procuração                      │
│  → Importação de balancetes e razão                     │
│  → Importação de folha de pagamento                     │
│  → Importação de NFs e contratos                        │
│  → Importação de dados de projetos                      │
│  → Consulta CND/CPEN                                    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│           FASE 3: VALIDAÇÃO FISCAL                       │
│  → Verificar Lucro Real                                 │
│  → Verificar regularidade fiscal                        │
│  → Verificar lucro tributável                           │
│  → Verificar prazos                                     │
│  → SE inelegível → gerar relatório e encerrar           │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 4: ANÁLISE TÉCNICA DE PROJETOS              │
│  → IA classifica projetos                               │
│  → Score técnico por projeto                            │
│  → Identificação de evidências                          │
│  → SE score < 70 → fila de exceção                      │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 5: VINCULAÇÃO DE DESPESAS                   │
│  → Cruzar despesas com projetos                         │
│  → Validar contas contábeis segregadas                  │
│  → Validar timesheets                                   │
│  → Validar NFs e contratos                              │
│  → Calcular rateios                                     │
│  → SE inconsistência → fila de exceção                  │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 6: CÁLCULO DO BENEFÍCIO                     │
│  → Calcular exclusão adicional (60%/80%)                │
│  → Aplicar limite de lucro tributável                   │
│  → Calcular economia IRPJ + CSLL                        │
│  → Gerar memória de cálculo                             │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 7: GERAÇÃO DE DOCUMENTOS                    │
│  → Dossiê técnico por projeto                           │
│  → Parecer de elegibilidade                             │
│  → Memorial de cálculo                                  │
│  → Termo de responsabilidade                            │
│  → Checklist de auditoria                               │
│  → Rascunho FORMP&D                                     │
│  → Rascunho ECF (LALUR/LACS)                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 8: REVISÃO HUMANA                           │
│  → Contador valida cálculo e contabilidade              │
│  → Especialista P&D valida projetos                     │
│  → Advogado valida riscos (se necessário)               │
│  → Diretor aprova submissão                             │
│  → SE reprovado → retorna para ajuste                   │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 9: SUBMISSÃO                                │
│  → Transmitir FORMP&D ao MCTI                           │
│  → Transmitir ECF com exclusão                          │
│  → Armazenar recibos                                    │
│  → Se retificação: transmitir ECF retificadora          │
│  → Se crédito: transmitir PER/DCOMP                     │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│         FASE 10: PÓS-SUBMISSÃO E MONITORAMENTO           │
│  → Monitorar processamento da ECF                       │
│  → Monitorar despacho do PER/DCOMP                      │
│  → Monitorar regularidade fiscal contínua               │
│  → Armazenar documentação (mín. 10 anos)                │
│  → Alertar sobre prazos do próximo ano                  │
│  → Gerar relatório de economia realizada                │
└─────────────────────────────────────────────────────────┘
```

---

## 22. KPIs

| KPI | Descrição | Meta |
|---|---|---|
| Taxa de automação (STP) | % de processos sem intervenção humana | ≥ 95% |
| Tempo de processamento | Do onboarding ao rascunho FORMP&D | < 4 horas |
| Precisão do cálculo | Divergência vs. revisão manual | < 0,1% |
| Taxa de exceção | % de itens enviados para humano | < 10% |
| Taxa de bloqueio correto | % de bloqueios que realmente eram inelegíveis | > 98% |
| Falso positivo | % de itens elegíveis bloqueados | < 1% |
| Falso negativo | % de itens inelegíveis liberados | < 0,5% |
| Tempo de revisão humana | Tempo médio por processo | < 30 min |
| Satisfação do cliente | NPS do usuário do Reversa Tax | > 80 |
| Economia gerada | Total de tributos economizados | R$ [meta] |

---

## 23. Roadmap de Implementação

```text
FASE 1 — MVP (Meses 1-3)
├── Motor de elegibilidade fiscal básico
├── Leitura de ECF/ECD
├── Validação de regime e lucro
├── Plano de contas sugerido
├── Geração de relatório de potencial
└── Dashboard básico

FASE 2 — PROJETOS E DESPESAS (Meses 4-6)
├── Cadastro de projetos
├── IA de classificação técnica
├── Vinculação de despesas
├── Validação de timesheets
├── Validação de NFs
└── Segregação contábil

FASE 3 — CÁLCULO E FORMP&D (Meses 7-9)
├── Motor de cálculo IRPJ/CSLL
├── Geração de LALUR/LACS
├── Rascunho FORMP&D
├── Conciliação ECD x ECF x FORMP&D
├── Workflow de aprovação
└── Geração de dossiês

FASE 4 — RETIFICAÇÃO E RECUPERAÇÃO (Meses 10-12)
├── Motor de retificação ECF
├── Motor de retificação FORMP&D
├── Geração de PER/DCOMP
├── Análise retroativa (5 anos)
├── Memorandos de recuperação
└── Workflow de retificação

FASE 5 — INTELIGÊNCIA AVANÇADA (Meses 13-18)
├── IA de leitura de documentos (OCR + NLP)
├── Match automático NF x projeto
├── Detecção de anomalias
├── Score de risco preditivo
├── Integração com e-CAC (APIs)
├── Integração com MCTI (FORMP&D)
└── Painel de monitoramento contínuo

FASE 6 — ESCALA E ECOSSISTEMA (Meses 19-24)
├── API pública para contadores
├── Marketplace de especialistas
├── Multi-empresa (SaaS)
├── White-label para escritórios contábeis
├── Integração com ERPs (TOTVS, SAP, Oracle)
└── Relatórios gerenciais avançados
```

---

## 24. Checklist Final

Antes de colocar o Reversa Tax em produção para Lei do Bem:

```text
LEGAL
[ ] Normativos mapeados e versionados
[ ] Regras de cálculo validadas por tributarista
[ ] Modelos de documentos revisados por advogado
[ ] Termo de uso e política de privacidade
[ ] Disclaimer de responsabilidade

CONTÁBIL
[ ] Plano de contas referencial ECF mapeado
[ ] Regras de CPC 04 implementadas
[ ] LALUR/LACS com códigos corretos
[ ] Conciliação ECD x ECF funcional
[ ] Rateios com memorial automático

TÉCNICO
[ ] Motor de classificação de projetos treinado
[ ] Dataset de testes com casos reais
[ ] Falso positivo < 1%
[ ] Falso negativo < 0,5%
[ ] Score técnico calibrado

SISTEMA
[ ] Autenticação MFA
[ ] Criptografia em repouso e trânsito
[ ] Backup diário
[ ] Logs de auditoria imutáveis
[ ] API documentada
[ ] Testes automatizados > 90% cobertura

PROCESSO
[ ] Workflow de aprovação configurado
[ ] Matriz RACI definida
[ ] SLA de revisão humana definido
[ ] Fluxo de exceção documentado
[ ] Treinamento da equipe realizado

CLIENTE
[ ] Onboarding em < 2 horas
[ ] Dashboard de status
[ ] Relatórios de economia
[ ] Alertas de prazo
[ ] Suporte ao cliente configurado
```

---

## Disclaimer

> Este documento é uma base de conhecimento técnica para desenvolvimento de software. **Não substitui parecer jurídico, contábil ou tributário individual.** A fruição de incentivos fiscais envolve riscos e deve ser validada por profissionais habilitados (contadores, advogados tributaristas). O Reversa Tax deve sempre incluir disclaimers de responsabilidade e exigir aprovação humana antes de qualquer submissão ao governo.

---

**Reversa Tax © 2026**
Documento gerado para fins de desenvolvimento de produto.
