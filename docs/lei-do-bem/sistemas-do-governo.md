> **Revisão Reversa:** resumo do chat (Qwen) sobre os sistemas do governo. Confirme endereços e fluxos de acesso nos portais oficiais.

Boa pergunta — mas ela ficou um pouco aberta. Vou cobrir o sentido mais provável: **quais são os sistemas/plataformas OFICIAIS DO GOVERNO envolvidos no processo da Lei do Bem**, onde você efetivamente interage, submete e valida as informações. Vou pesquisar para garantir que está atualizado (2026).


Ótima pergunta! Como a pergunta veio curtinha, vou assumir que você quer saber **quais são os sistemas/plataformas OFICIAIS DO GOVERNO** envolvidos no processo da Lei do Bem — ou seja, onde o Reversa Tax precisa "conversar" com o governo. Se for isso, aqui está o mapa completo (atualizado para 2026):

---

# 🏛️ Sistemas Oficiais do Governo na Lei do Bem

Existem **3 grandes "portas" do governo** + sistemas auxiliares que o Reversa Tax precisa conhecer:

---

## 1️⃣ MCTI — Plataforma FORMP&D (a principal)

**O que é:** Ministério da Ciência, Tecnologia e Inovação. É aqui que a empresa **declara os projetos de inovação** para ter direito ao benefício.

**Situação em 2026:**
- O **FORMP&D 2026 (ano-base 2025)** está aberto **até 30 de setembro de 2026** [[1]].
- O MCTI lançou um **novo FORMP&D integrado à plataforma gov.br**, mais rápido e com maior capacidade [[17]].
- O preenchimento é **obrigatório** para todas as empresas que usaram os incentivos da Lei do Bem no ano-base [[4]].

**Como acessar:**
- Via **login único gov.br** (com e-CNPJ ou procuração) [[17]].
- Portal: `gov.br/mcti` → seção Lei do Bem → FORMP&D [[13]].

**Tem API pública?** 
- ❌ **Não há API pública oficial** para submeter o FORMP&D automaticamente. O preenchimento é manual via formulário web.
- ✅ O que o Reversa Tax pode fazer: **gerar o conteúdo pronto** (rascunho) para o usuário apenas copiar/colar ou importar, reduzindo o trabalho a minutos.

**O que o Reversa Tax automatiza aqui:**
- Geração automática de todas as descrições técnicas;
- Preenchimento das rubricas de despesas;
- Validação antes do envio (evitar glosas do MCTI) [[2]];
- Alerta de prazo.

---

## 2️⃣ Receita Federal — Portal e-CAC (a parte fiscal/tributária)

**O que é:** Centro Virtual de Atendimento ao Contribuinte. É onde ficam **ECF, ECD, CND, DCTF, PER/DCOMP**.

**O que se faz lá na Lei do Bem:**

| Serviço | Para que serve |
|---|---|
| **ECF** | Escrituração com a exclusão do benefício no LALUR/LACS |
| **ECD** | Escrituração contábil (base da ECF) |
| **CND/CPEN** | Certidão de regularidade fiscal (obrigatória!) |
| **DCTF** | Confissão de débitos/créditos |
| **PER/DCOMP** | Pedido de restituição/compensação (recuperação retroativa) |
| **Procuração eletrônica** | Autorizar o Reversa Tax/contador a acessar |

**Como acessar:**
- Via **gov.br** com certificado digital (e-CNPJ A1/A3) [[23]].
- Portal: `cav.receita.fazenda.gov.br` [[28]].
- Procuração digital: `gov.br` → "Procuração Digital" [[22]] ou `servicos.receita.fazenda.gov.br/Servicos/procuracoesrfb` [[24]].

**Tem API pública?**
- ✅ **SIM!** A **API de Procuração Eletrônica gov.br** permite que sistemas integrados ao Login Único consultem e usem procurações [[25]].
- ⚠️ Mas a transmissão da ECF/PER/DCOMP ainda é feita pelos **programas geradores oficiais (PGD)** da Receita, não por API aberta.

**O que o Reversa Tax automatiza aqui:**
- Download de ECF/ECD via procuração;
- Consulta de CND/CPEN;
- Geração dos arquivos no formato SPED para importação no PGD;
- Monitoramento de débitos.

---

## 3️⃣ gov.br — Login Único (a "chave mestra")

**O que é:** A plataforma de identidade digital que **unifica o acesso** a MCTI e Receita Federal.

**Por que importa para o Reversa Tax:**
- Tanto o FORMP&D [[17]] quanto o e-CAC passam pelo gov.br;
- A **API de Procuração gov.br** [[25]] é o caminho técnico para o Reversa Tax atuar em nome do cliente com autorização legal.

---

## 4️⃣ Sistemas Auxiliares (para evidências e benefício de 80%)

| Sistema | Órgão | Uso na Lei do Bem |
|---|---|---|
| **INPI** | Instituto Nacional da Propriedade Industrial | Comprovar **patente concedida** → permite adicional de **80%** (em vez de 60%) |
| **MAPA / SNPC** | Ministério da Agricultura | Registro de **cultivar** → também dá direito aos 80% |
| **Juntas Comerciais / SPED** | Diversos | Validação de dados cadastrais e contábeis |

---

## 📊 Resumo Visual: Onde cada coisa acontece

```text
┌─────────────────────────────────────────────────────────────┐
│                    GOV.BR (Login Único)                       │
│              + API de Procuração Eletrônica [[25]]            │
└───────────────┬─────────────────────────┬───────────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────────┐  ┌───────────────────────────────┐
│        MCTI               │  │      RECEITA FEDERAL (e-CAC)   │
│   Plataforma FORMP&D      │  │  ECF / ECD / CND / DCTF        │
│   (declara projetos)      │  │  PER/DCOMP (recuperação)       │
│   Prazo: 30/09/2026 [[1]] │  │  Procuração Digital [[24]]     │
│   Sem API pública         │  │  Tem API de procuração [[25]]  │
└───────────────────────────┘  └───────────────────────────────┘
                │
                ▼ (comprovação de patente/cultivar)
        ┌───────────────┐
        │  INPI / MAPA  │
        └───────────────┘
```

---

## ⚙️ Implicação prática para o Reversa Tax

Como **não existe API pública para submeter o FORMP&D automaticamente** [[17]], a sua meta de "98-99% de automação" funciona assim:

| Etapa | Automação |
|---|---|
| Coleta de dados (ECF/ECD/CND via procuração) | ✅ ~100% automatizável [[25]] |
| Classificação de projetos e despesas | ✅ ~98% com IA + regras |
| Cálculo do benefício | ✅ 100% |
| Geração do conteúdo do FORMP&D | ✅ 100% (rascunho pronto) |
| **Submissão no portal MCTI** | ⚠️ **Manual** (copiar/colar ou upload) |
| Transmissão ECF/PER-DCOMP | ⚠️ Via PGD oficial da Receita |
| Revisão humana final | 👤 Obrigatória |

---

Quer que eu:
1. **Aprofunde na API de Procuração gov.br** (como integrar tecnicamente)?
2. **Mapeie o passo a passo exato de preenchimento do novo FORMP&D 2026** para o Reversa Tax gerar o rascunho?
3. **Liste os programas geradores (PGD) da Receita** e os formatos de arquivo SPED que o sistema precisa gerar?

Me diga qual dessas "portas do governo" você quer explorar primeiro! 🚪