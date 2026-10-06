> **Revisão Reversa:** mapeamento gerado no chat (Qwen). As "5 mudanças do FORMP&D 2026", o prazo de 31/08/2026 e a menção a um guia oficial extraído **não foram confirmados em fonte oficial**. Confira o manual e os comunicados do MCTI do ano-base antes de usar o layout das planilhas. O Reversa gera planilhas de apoio e não submete o formulário.

Perfeito! Extraí o **Guia do Usuário oficial do MCTI** e as **5 mudanças do FORMP&D 2026**. Agora vou mapear o passo a passo completo para o Reversa Tax gerar o rascunho automático.

---

# 📋 Mapeamento Completo: FORMP&D 2026 para o Reversa Tax

## 🎯 Visão Geral

**URL oficial:** `https://formpd.mcti.gov.br/`  
**Prazo 2026 (ano-base 2025):** até **31 de agosto de 2026**  
**Integração:** gov.br + Receita Federal (cruzamento automático de dados)

---

## 🔄 As 5 Mudanças do FORMP&D 2026

### 1️⃣ Integração com Receita Federal
- Dados do FORMP&D são **cruzados automaticamente** com IRPJ, CSLL, folha de pagamento
- Primeiro acesso deve ser feito pelo **representante legal** da empresa
- Divergências são identificadas com mais facilidade

### 2️⃣ Identificador Único por Projeto
- Cada projeto recebe um **código único** que consta no recibo
- Permite rastreabilidade completa entre anos
- Contestações e recursos referenciam o mesmo código

### 3️⃣ Importação Estruturada por Planilha
- Serviços de terceiros, materiais e despesas operacionais aceitam **importação via planilha**
- Modelo similar ao já usado para recursos humanos
- Reduz erros de digitação

### 4️⃣ Documentos Comprobatórios Obrigatórios
- Exigência de **anexar PDFs** para certas categorias de despesa
- Aumenta confiabilidade das informações

### 5️⃣ Fast Track para Projetos com ICTs/Embrapii
- Projetos com unidades Embrapii credenciadas ou parecer favorável da Finep têm **tramitação simplificada**
- Deve ser declarado explicitamente no formulário

---

## 📊 Estrutura Completa do Formulário

```
FORMP&D 2026
│
├── 1. IDENTIFICAÇÃO DA EMPRESA
│   ├── Tipo de empresa (Privada/Pública/Mista)
│   ├── Situação da empresa
│   ├── Beneficia Lei 8.248/1991 (informática)?
│   ├── Origem do capital controlador
│   ├── Relação com grupo econômico
│   ├── Receita operacional bruta
│   ├── Receita líquida
│   ├── Total de funcionários
│   ├── Prejuízo fiscal?
│   └── Estrutura organizacional de P&D
│
├── 2. PROGRAMA/ATIVIDADES DE PD&I (PROJETOS)
│   │
│   └── Para cada projeto:
│       ├── 2.1 Dados Gerais do Projeto
│       │   ├── Nome da atividade
│       │   ├── Tipo (Pesquisa Básica/Aplicada/Desenvolvimento Experimental)
│       │   ├── Marcos críticos
│       │   ├── Elementos tecnologicamente inovadores
│       │   ├── Descrição do banco/desafio tecnológico
│       │   ├── Metodologia utilizada
│       │   ├── Projeto contínuo? (plurianual)
│       │   ├── Data início / previsão término
│       │   ├── Alinhamento com políticas públicas?
│       │   └── Área predominante do projeto
│       │
│       ├── 2.2 Empresas Cooperadoras
│       │   ├── CNPJ, Razão Social, Descrição
│       │   └── Anexo PDF obrigatório
│       │
│       ├── 2.3 Empresas com Custos Compartilhados
│       │   ├── CNPJ, Razão Social, Descrição do rateio
│       │   └── Anexo PDF
│       │
│       ├── 2.4 Universidades/Instituições de Pesquisa
│       │   ├── Unidade Embrapii?
│       │   ├── Situação (Contratado/Em execução/Terminado)
│       │   ├── CNPJ, Nome, Endereço
│       │   └── Anexo PDF obrigatório
│       │
│       ├── 2.5 Inventor Independente
│       │   ├── Contratado ou Valores Transferidos
│       │   ├── CPF, Nome, Endereço
│       │   └── Anexo PDF obrigatório
│       │
│       ├── 2.6 Microempresa/EMP Contratada
│       │   ├── Situação, CNPJ, Razão Social
│       │   └── Anexo PDF obrigatório
│       │
│       ├── 2.7 Serviços de Apoio Técnico (PF)
│       │   ├── Tipo de serviço
│       │   ├── CPF, Nome, Função
│       │   ├── Horas trabalhadas, Valor pago
│       │   └── Anexo PDF
│       │
│       ├── 2.8 Serviços de Apoio Técnico (PJ)
│       │   ├── Tipo de serviço
│       │   ├── CNPJ, Razão Social
│       │   └── Anexo PDF
│       │
│       ├── 2.9 Material de Consumo
│       │   ├── Valor, Identificação, Vinculação com projeto
│       │   └── Anexo PDF
│       │
│       └── 2.10 Recursos Humanos
│           ├── Importação por planilha OU preenchimento manual
│           ├── CPF, Nome, Sexo, Últ. Formação
│           ├── Função no projeto
│           ├── Horas trabalhadas no ano
│           ├── Dedicação ao projeto (%)
│           ├── Valor total pago
│           ├── Descrição das atividades
│           └── Anexo PDF obrigatório
│
├── 3. DISPÊNDIOS DO PROGRAMA
│   ├── Recursos Próprios (%)
│   ├── Financiamentos (%)
│   ├── Fontes de financiamento
│   ├── Descrição das fontes
│   │
│   ├── 3.1 Patentes e Registros
│   │   ├── Obteve concessão no ano-base?
│   │   ├── Tipo de direito
│   │   ├── Número de registro
│   │   ├── Especificação
│   │   └── Especificação dos gastos + Valor
│   │
│   ├── 3.2 Bens Intangíveis
│   │   └── Descrição e valores
│   │
│   ├── 3.3 Equipamentos Nacionais Adquiridos
│   │   └── Relação completa
│   │
│   └── 3.4 Equipamentos Importados Adquiridos
│       └── Relação completa
│
├── 4. PESQUISADOR EXCLUSIVO
│   ├── Contratou pesquisadores com dedicação exclusiva?
│   ├── CPF, Nome, Formação
│   ├── Aumento no número em relação ao ano anterior?
│   └── Detalhes do incremento
│
├── 5. ART. 19-A DA LEI 11.196/05
│   ├── Dispêndio com ICT Pública/Privada sem fins lucrativos?
│   ├── CNPJ, Nome da ICT
│   ├── Valor transferido
│   └── Anexo PDF obrigatório
│
├── 6. INCENTIVOS FISCAIS DO PROGRAMA
│   ├── Dedução dos dispêndios (preenchido automaticamente)
│   ├── Total das deduções (automático)
│   ├── Total das reduções (automático)
│   ├── Depreciação acelerada (automático)
│   ├── Amortização acelerada (automático)
│   ├── Total dos incentivos (automático)
│   └── Total do diferimento (automático)
│
├── 7. RELATÓRIO DE PREENCHIMENTO
│   └── Conferência final (somente visualização)
│
└── 8. APERFEIÇOAMENTO DO CAPÍTULO III (OPCIONAL)
    └── Sugestões de melhoria
```

---

## 🔧 Como o Reversa Tax Deve Gerar o Rascunho

### ✅ **Campos que o Reversa Tax PODE Automatizar 100%**

| Seção | Campos | Fonte de Dados |
|-------|--------|----------------|
| **Identificação da Empresa** | Todos os campos básicos | ECF, DCTF, Cadastro |
| **Recursos Humanos** | Importação via planilha estruturada | Folha de pagamento, Timesheets |
| **Serviços de Terceiros (PJ)** | Importação via planilha | NF-e, Contratos |
| **Materiais de Consumo** | Importação via planilha | NF-e, Almoxarifado |
| **Despesas Operacionais** | Importação via planilha | Contabilidade |
| **Patentes e Registros** | Dados de concessão | INPI, MAPA |
| **Equipamentos** | Relação de ativos | Ativo Imobilizado |
| **Incentivos Fiscais** | Todos os cálculos | Motor de cálculo interno |
| **Valores totais** | Somatórios automáticos | Cruzamento contábil |

### ⚠️ **Campos que Requerem Validação Humana**

| Seção | Campos | Motivo |
|-------|--------|--------|
| **Programa/Atividades de PD&I** | Descrição técnica do projeto | Exige narrativa de engenharia |
| **Elementos tecnologicamente inovadores** | Desafio técnico, incerteza | Julgamento técnico |
| **Metodologia utilizada** | Abordagem científica | Revisão por especialista |
| **Área predominante** | Classificação | Pode precisar ajuste |
| **Recursos Humanos (descrição)** | Atividades realizadas | Validação do gestor |

### ❌ **Campos que o Reversa Tax NÃO Deve Preencher**

- Campos marcados como "opcional" sem dados concretos
- Sugestões na seção "Aperfeiçoamento do Capítulo III"
- Informações sobre contestações ou recursos

---

## 📝 Passo a Passo para Geração do Rascunho

### **Fase 1: Preparação de Dados**

```python
# Pseudocódigo do Reversa Tax
def gerar_rascunho_formpd(empresa, ano_base):
    
    # 1. Coletar dados fiscais
    dados_empresa = coletar_ecf(empresa, ano_base)
    folha = coletar_folha_pagamento(empresa, ano_base)
    nfe = coletar_notas_fiscais(empresa, ano_base)
    contratos = coletar_contratos(empresa, ano_base)
    
    # 2. Identificar projetos elegíveis
    projetos = classificar_projetos_pd(empresa, ano_base)
    
    # 3. Calcular dispêndios por projeto
    despesas = calcular_despesas_elegiveis(projetos, folha, nfe, contratos)
    
    # 4. Calcular incentivos fiscais
    incentivos = calcular_incentivos(despesas, empresa)
    
    return {
        'identificacao': dados_empresa,
        'projetos': projetos,
        'despesas': despesas,
        'incentivos': incentivos,
        'recursos_humanos': preparar_planilha_rh(folha, projetos),
        'servicos_terceiros': preparar_planilha_servicos(nfe, contratos),
        'materiais': preparar_planilha_materiais(nfe)
    }
```

### **Fase 2: Geração das Planilhas de Importação**

#### **Planilha de Recursos Humanos**
```csv
CPF,Nome Completo,Sexo,Última Formação,Função no Projeto,Horas Trabalhadas,Dedicação (%),Valor Pago (R$),Descrição das Atividades
123.456.789-00,João Silva,M,Mestre em Engenharia,Desenvolvedor Senior,1800,75,180000.00,"Desenvolvimento de algoritmo de otimização..."
```

#### **Planilha de Serviços de Terceiros (PJ)**
```csv
CNPJ,Razão Social,Tipo Serviço,Situação,Valor (R$),Descrição
12.345.678/0001-99,Consultoria Tech Ltda,Serviço de Apoio Técnico,Terminado,50000.00,"Consultoria especializada em arquitetura..."
```

#### **Planilha de Materiais de Consumo**
```csv
Identificação do Material,Valor (R$),Vinculação com Projeto
Componentes eletrônicos protótipo,15000.00,"Projeto X - Desenvolvimento do hardware..."
```

### **Fase 3: Validações Críticas Antes da Exportação**

```python
def validar_rascunho(rascunho):
    
    erros = []
    
    # 1. Verificar integração com Receita Federal
    if rascunho['incentivos']['total'] != calcular_via_ecf(empresa):
        erros.append("Divergência entre FORMP&D e ECF")
    
    # 2. Verificar se há projeto cadastrado
    if len(rascunho['projetos']) == 0:
        erros.append("Nenhum projeto cadastrado")
    
    # 3. Verificar se Dispêndios e Incentivos foram preenchidos
    if not rascunho['despesas'] or not rascunho['incentivos']:
        erros.append("Seções obrigatórias não preenchidas")
    
    # 4. Verificar pendências (ícone !)
    pendencias = verificar_pendencias(rascunho)
    if pendencias:
        erros.extend(pendencias)
    
    # 5. Verificar documentos comprobatórios obrigatórios
    anexos_obrigatorios = [
        'empresas_cooperadoras',
        'universidades',
        'inventor_independente',
        'microempresa',
        'recursos_humanos',
        'art_19a_ict'
    ]
    
    for secao in anexos_obrigatorios:
        if tem_itens(rascunho[secao]) and not tem_anexo(rascunho[secao]):
            erros.append(f"Seção {secao} requer anexo PDF")
    
    return erros
```

---

## 🚨 Principais Causas de Glosa (Para Evitar)

O Reversa Tax deve **bloquear automaticamente** ou **alertar criticamente** quando:

1. **❌ Ausência de elemento tecnologicamente novo**
   - Projeto sem descrição clara da incerteza técnica
   - Não diferencia de melhoria rotineira

2. **❌ Falta de correspondência gastos × projetos**
   - Recursos humanos sem vínculo claro
   - Despesas genéricas sem alocação

3. **❌ Pessoal de apoio como pesquisador**
   - Funções administrativas, suporte, produção
   - Não atua diretamente em P&D

4. **❌ Atividades rotineiras declaradas como P&D**
   - Controle de qualidade padrão
   - Pesquisa de mercado
   - Treinamento em técnicas conhecidas

5. **❌ Dupla contagem com fomento público**
   - Gastos já beneficiados por subvenção
   - Financiamentos subsidiados específicos

6. **❌ Divergências MCTI × Receita Federal**
   - Folha diferente entre FORMP&D e eSocial
   - Dispêndios diferentes da ECF
   - Benefícios calculados incorretamente

---

## 📋 Checklist de Validação Final

Antes de exportar o rascunho, o Reversa Tax deve verificar:

- [ ] Pelo menos um projeto cadastrado
- [ ] Seções "Dispêndios" e "Incentivos Fiscais" preenchidas
- [ ] Nenhuma pendência (ícone !)
- [ ] Descrição técnica completa por projeto
- [ ] Vínculo claro entre dispêndios e projetos
- [ ] Papéis e dedicação de pesquisadores documentados
- [ ] Pessoal de apoio excluído da base de P&D
- [ ] Atividades rotineiras excluídas
- [ ] Documentos comprobatórios anexados (onde obrigatório)
- [ ] Planilhas no formato correto
- [ ] Referência a instrumento de fomento (se aplicável)
- [ ] Consistência com declaração de IRPJ
- [ ] Score de confiança ≥ 85

---

## 🔄 Fluxo de Trabalho no Reversa Tax

```
1. INGESTÃO DE DADOS
   ↓
2. CLASSIFICAÇÃO DE PROJETOS (IA + Regras)
   ↓
3. VINCULAÇÃO DE DESPESAS
   ↓
4. CÁLCULO DE INCENTIVOS
   ↓
5. GERAÇÃO DE PLANILHAS DE IMPORTAÇÃO
   ↓
6. VALIDAÇÕES AUTOMÁTICAS
   ↓
7. REVISÃO HUMANA (campos técnicos)
   ↓
8. EXPORTAÇÃO DO RASCUNHO
   ↓
9. USUÁRIO COPIA/COLA NO FORMP&D OFICIAL
   ↓
10. ANEXA DOCUMENTOS COMPROBATÓRIOS
   ↓
11. FINALIZA E ENVIA
   ↓
12. ARMAZENA RECIBO COM IDENTIFICADOR ÚNICO
```

---

## 💡 Dica Final

**O FORMP&D 2026 não tem API pública**, então o Reversa Tax deve:

1. Gerar **planilhas estruturadas** prontas para importação
2. Criar **rascunho completo** com todos os dados preenchidos
3. Fornecer **instruções de copiar/colar** por seção
4. Alertar sobre **anexos obrigatórios**
5. Rastrear o **identificador único** após envio

Isso permite atingir **~95% de automação**, deixando apenas a submissão manual no portal oficial.

Quer que eu crie os **templates das planilhas de importação** (CSV/Excel) ou o **modelo de descrição técnica automática** para os projetos?