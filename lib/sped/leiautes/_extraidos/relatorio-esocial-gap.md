# Relatório de Gap: eSocial — Implementação atual × S-1.3

**Gerado em:** 2026-11-16  
**Repositório:** `/home/claude/reversa` — branch `feat/motores-sped`  
**Arquivos analisados:** `motor-esocial.js`, `motor-esocial-extra.js`, `retificadora-esocial.js`

---

## 1. Versão atual implementada

### 1.1 Leiaute nos XML gerados

A constante `LEIAUTE` em `retificadora-esocial.js` está declarada como:

```
var LEIAUTE = 'v_S_01_03_00';
```

Isso significa que os XML **gerados** pela retificadora já usam o namespace S-1.3.

### 1.2 Leiaute dos XML lidos (motor)

Os testes (`motor-esocial.test.js` e `motor-esocial-v3.test.js`) constroem fixtures com namespace:

```
http://www.esocial.gov.br/schema/evt/.../v_S_01_02_00
```

O motor em si **não valida nem extrai** o número de versão do namespace — ele aceita qualquer XML do eSocial desde que contenha a tag raiz `<eSocial>`. Portanto, lê tanto S-1.0/1.1/1.2 quanto S-1.3 sem distinção, com tolerância a variações de tag (ver `acharTxt`, `TAGS_CLASSTRIB`, `TAGS_DESFOLHA`).

### 1.3 Resumo da situação

| Componente | Leiaute efetivo |
|---|---|
| `motor-esocial.js` (leitura) | Agnóstico de versão; fixture dos testes em S-1.2 |
| `motor-esocial-extra.js` (leitura) | Idem |
| `retificadora-esocial.js` (escrita) | **S-1.3** (`v_S_01_03_00`) |

---

## 2. Eventos já suportados

### 2.1 Leitura (motor de créditos)

| Evento | Tag XML | Status | Campos lidos | Observações |
|---|---|---|---|---|
| **S-1000** | `evtInfoEmpregador` | **Parcial** | `nrInsc` (empregador), `nmRazao`, `classTrib`, `indDesFolha`/`indDesoneracao`/`indCPRB`, `iniValid`/`fimValid` | Lê múltiplas vigências (inclusao/alteracao); lógica de regime por competência implementada |
| **S-1005** | `evtTabEstab` | **Parcial** | `nrInsc` (estabelecimento), `cnaePrep`, `aliqRat`, `fap`, `iniValid`/`fimValid` | Não lê `tpEstab`, `nmEstab`, nem dados de endereço |
| **S-1010** | `evtTabRubrica` | **Parcial** | `codRubr`, `ideTabRubr`, `iniValid`/`fimValid`, `dscRubr`, `natRubr`, `tpRubr`, `codIncCP` | Não lê `codIncIRRF`, `codIncFGTS`, `codIncSIND`; lê inclusao e alteracao, mas não exclusao de rubrica |
| **S-1020** | `evtTabLotacao` | **Parcial** | `codLotacao`, `iniValid`/`fimValid`, `fpas`, `codTercs` | Não lê `tpLotacao`, `cnpjEntEd`, `cnpjSindLab`, `cnpjSindPat`; lê só `fpasLotacao` |
| **S-1200** | `evtRemun` | **Parcial** | `cpfTrab`, `perApur`, `indApuracao`, `indRetif`, `nrRecibo`, `codRubr`, `ideTabRubr`, `vrRubr`, `nrInsc` (estab), `codLotacao` | Lê `dmDev/ideEstabLot/itensRemun`; não lê `infoRec`, `infoSaudeColet`, `infoBaseCS` |
| **S-1299** | `evtFechaEvPer` | **Parcial** | `perApur`, `indApuracao`, `indGuia`, `infoFech` | Só no contexto da retificadora (indexar); motor de créditos ignora S-1299 |
| **S-2299** | `evtDeslig` | **Parcial** | `cpfTrab`, `dtDeslig`, `perApur`, rubricas via `detVerbas`, `perRef` em períodos anteriores | Leiaute marcado "a validar com XML real (Sodimac)" em vários pontos; tolerância a nomes alternativos de tag |
| **S-3000** | `evtExclusao` | **Parcial** | `nrRecEvt`, `tpEvento` | Só exclui se o recibo do evento cancelado estiver presente nos arquivos lidos |

### 2.2 Escrita (retificadora)

| Evento | Status | Observações |
|---|---|---|
| **S-1010** (alteração de incidência) | **Implementado** | Encerra vigência e inclui novo registro com `codIncCP` alterado |
| **S-1298** (reabertura de período) | **Implementado** | Gera o evento com os campos obrigatórios do S-1.3 |
| **S-1200** (retificador) | **Implementado** | Clona o evento original com `indRetif=2` e `nrRecibo` |
| **S-1299** (fechamento) | **Implementado** | Clona o `infoFech` do fechamento original |

### 2.3 Eventos **não** suportados (nem leitura, nem geração)

| Evento | Relevância para créditos previdenciários |
|---|---|
| S-1030 (cargos) | Baixa direta |
| S-1035 (carreiras) | Baixa direta |
| S-1040 (funções/cargos) | Baixa direta |
| S-1050 (horários de trabalho) | Baixa direta |
| S-1060 (ambientes de trabalho) | Média — vinculada à T010/RAT |
| S-1070 (processos administrativos/judiciais) | **Alta** — suspensões de incidência; afeta base do cálculo |
| S-1080 (operadores portuários) | Baixa (nicho) |
| S-2200 (cadastramento inicial de vínculos) | Média — categoria do trabalhador afeta alíquota |
| S-2205 (alteração de dados cadastrais) | Baixa direta |
| S-2206 (alteração de contrato) | Média — mudança de categoria/jornada |
| S-2210 (comunicação de acidente de trabalho — CAT) | **Alta** — base do FAP e do RAT (T009) |
| S-2220 (monitoramento de saúde) | Baixa direta |
| S-2230 (afastamentos) | **Alta** — 15 primeiros dias (T006), auxílio-doença, período de afastamento |
| S-2240 (condições ambientais) | **Alta** — grau de risco real (T010/T061); agentes nocivos |
| S-2250 (aviso-prévio) | **Alta** — complementa S-2299 (T005, T076) |
| S-2298 (reintegração) | Média |
| S-2300/2306/2399 (trabalhadores sem vínculo) | Baixa para créditos da CLT |
| S-2400 (cadastro de benefícios previdenciários) | Média — cruzamento com afastamentos |
| S-2405 (alteração de benefícios) | Baixa direta |
| S-2410/2416/2418/2420 (saúde/segurança) | Baixa direta |
| S-2501 (informações de contribuições) | **Alta** — base do PER/DCOMP e confirmação do recolhimento |
| S-5001–S-5013 (totalizadores) | **Alta** — confirmação das bases e valores recolhidos; essenciais para conciliação |

---

## 3. Gap para S-1.3

### 3.1 Eventos faltando (relevantes para créditos previdenciários)

| Prioridade | Evento | Campo-chave ausente | Impacto |
|---|---|---|---|
| Alta | **S-2230** (afastamentos) | `dtIniAfast`, `codMotAfast` | T006 (15 dias de auxílio-doença): hoje estimado por descrição de rubrica |
| Alta | **S-2501** (contribuições) | `baseCP`, `vrCP`, `baseRAT`, `vrRAT` | Confirmação do recolhimento; PER/DCOMP automático |
| Alta | **S-5001** (bases por trabalhador) | `baseCP`, `baseRAT`, `baseFGTS` | Conciliação e cálculo definitivo (vs. estimativa atual) |
| Alta | **S-5011** (contribuições por estabelecimento) | `baseCP`, `vrCP`, `grauExposicao` | Verificação das bases declaradas |
| Alta | **S-1070** (processos judiciais/administrativos) | `nrProc`, `codSusp`, `iniValid` | Suspensão de incidência já homologada (não calcular o que não é crédito) |
| Alta | **S-2240** (condições ambientais) | `grauExposicao`, `agNocivo` | Grau de risco real × CNAE (T010); exposição a agentes |
| Média | **S-2210** (CAT) | `dtAcid`, `codCNAE` | Histórico de acidentes para FAP (T009) |
| Média | **S-2250** (aviso-prévio) | `dtPrevTerm`, `tpAvisoPrev` | Datas exatas do aviso (T005, T076) |
| Baixa | **S-2200/2206** (vínculo) | `codCateg`, `tpRegJor` | Categoria do trabalhador; jornada parcial |

### 3.2 Campos faltando nos eventos já implementados

#### S-1000 (`evtInfoEmpregador`)
| Campo | Tag S-1.3 | Status | Impacto |
|---|---|---|---|
| Tipo de regime previdenciário | `tpRegPrev` | **[VERIFICAR]** | Ente público × empresa privada |
| Regime de tributação do 13º | `indOptRegEletron` | **[VERIFICAR]** | Declaração eletrônica do 13º |
| CNPJ do certificado | — | Não lido | Baixo |

#### S-1005 (`evtTabEstab`)
| Campo | Tag S-1.3 | Status | Impacto |
|---|---|---|---|
| Tipo de estabelecimento | `tpEstab` | Não lido | Baixo |
| CNAE real da atividade | `cnaePrep` | **Lido** | — |
| Grau de exposição declarado | `grauExposicao` | **[VERIFICAR]** se existe em S-1005 | Médio — afeta RAT |
| Alíquota RAT por lotação | — | Não implementado | Alto para S-1.3 — RAT por lotação foi introduzido [VERIFICAR] |

#### S-1010 (`evtTabRubrica`)
| Campo | Tag S-1.3 | Status | Impacto |
|---|---|---|---|
| Incidência IRRF | `codIncIRRF` | Não lido | Médio — cruzamento com IR |
| Incidência FGTS | `codIncFGTS` | Não lido | Médio — teses de FGTS |
| Incidência sindical | `codIncSIND` | **[VERIFICAR]** nomenclatura | Baixo |
| Repercussão do DSR | `repercPer` | **[VERIFICAR]** | Médio — afeta base dos reflexos (T069) |
| Exclusão de rubrica | operação `exclusao` | Não implementado | Alto — sem isso, rubricas extintas ficam vigentes |

#### S-1200 (`evtRemun`)
| Campo | Tag S-1.3 | Status | Impacto |
|---|---|---|---|
| Bases de cálculo consolidadas | `infoBaseCS` | Não lido | Alto — base do salário de contribuição declarada |
| Informações de saúde coletiva | `infoSaudeColet` | Não lido | Baixo direto |
| Período do afastamento | `infoAfastamento` | **[VERIFICAR]** | Alto — T006 |
| Remuneração do período | `infoPerAnt/perRef` | **Lido** (parcial) | — |
| Categoria do trabalhador por dmDev | `codCateg` | **Lido** no motor-extra | — |

#### S-2299 (`evtDeslig`)
| Campo | Tag S-1.3 | Status | Impacto |
|---|---|---|---|
| Data de desligamento | `dtDeslig` | **Lido** | — |
| Motivo do desligamento | `mtvDeslig` | Não lido | Médio — afeta quais verbas se aplicam |
| Aviso-prévio trabalhado/indenizado | — | Não lido (inferido) | Alto — T005 depende disso |
| Verbas do período anterior (`infoPerAnt`) | `perRef` | **Lido** (tolerante) | — |

### 3.3 Mudanças de leiaute S-1.2 → S-1.3 relevantes

As informações abaixo são baseadas em documentação pública disponível até ago/2025 e notas técnicas da RFB. **[VERIFICAR]** em cada item onde há incerteza.

| Área | Mudança | Impacto no Reversa |
|---|---|---|
| S-1000 | `indOptRegEletron` para declaração eletrônica do 13º substituiu campos antigos | Avisos sobre declaração eletrônica do 13º |
| S-1010 | Campo `natRubr` expandiu códigos (Tabela 3 revisada em S-1.3) | Mapa `NAT_RUBR` precisa ser atualizado com os códigos novos |
| S-1200 | `infoBaseCS` consolidado ao nível do `dmDev` **[VERIFICAR]** | Motor leria diretamente a base declarada em vez de somar rubricas |
| S-1200 | Campo `indApuracao` para 13º (`2`) permanece; valor `3` para PLR **[VERIFICAR]** | Separar PLR do 13º na T063 |
| S-2299 | Verbas rescisórias movidas de `verbasResc/dmDev` para `infoDeslig/verbas` **[VERIFICAR]** | Alta — estrutura tolerante atual pode precisar de ajuste |
| S-5001–S-5013 | Totalizadores são eventos de retorno (download), não de envio | Leitura nova; conciliação automática |
| Namespace | `v_S_01_03_00` já usado na retificadora | Consistente; motor de leitura é agnóstico |

---

## 4. Lista priorizada de tarefas — Mínimo viável para S-1.3

### Prioridade 1 — Correções de leitura com impacto imediato

1. **Atualizar `NAT_RUBR` com a Tabela 3 completa do S-1.3**
   - Baixar a Tabela 3 oficial do Manual de Orientação do eSocial S-1.3
   - Preencher os ~200 códigos ausentes (o mapa atual tem ~40 códigos)
   - Remover o aviso "TABELA PARCIAL — CONFERIR" quando coberta a 100%

2. **Implementar operação `exclusao` no S-1010**
   - Rubricas extintas pelo empregador ficam "vivas" no motor sem isso
   - Tag `exclusao` já esperada no parser; falta ignorar a rubrica a partir de `fimValid`

3. **Tratar `indApuracao = 3` (PLR) no S-1200**
   - Hoje PLR é identificado por descrição (T063); com indApuracao 3 a identificação fica direta
   - **[VERIFICAR]** se `indApuracao = 3` existe no S-1.3 ou é só no S-2.0

4. **Leitura de `infoBaseCS` no S-1200**
   - Se existir no XML, usar a base consolidada em vez de somar rubricas
   - Fallback para soma de rubricas quando o campo não estiver presente

### Prioridade 2 — Novos eventos com alto impacto em créditos

5. **Leitura de S-2230 (afastamentos)**
   - Campos: `dtIniAfast`, `dtFimAfast`, `codMotAfast` (motivo do afastamento)
   - Permite identificar automaticamente os 15 primeiros dias de afastamento (T006)
   - Cruza com rubricas do S-1200 para validar a tese

6. **Leitura de S-5001 e S-5011 (totalizadores)**
   - Bases e contribuições declaradas nos totalizadores de retorno
   - Permite substituir a estimativa atual por valores declarados
   - Habilita conciliação automática (declarado × recolhido × estimado)

7. **Leitura de S-1070 (processos judiciais/administrativos)**
   - `codSusp` indica suspensão de incidência já reconhecida
   - Evita calcular como crédito o que já foi suspenso ou tem decisão contrária

### Prioridade 3 — Melhoria de precisão

8. **Leitura de S-2240 (condições ambientais)**
   - `grauExposicao` real por estabelecimento e lotação
   - Melhora a T010/T061 (RAT por grau de risco) sem depender de tabela parcial de CNAE

9. **Leitura de S-2210 (CAT)**
   - Histórico de acidentes; complementa o cálculo do FAP para T009

10. **Leitura de S-2501 (contribuições por competência)**
    - Bases e valores efetivamente declarados; base para PER/DCOMP

### Prioridade 4 — Conformidade e validação

11. **Corrigir fixtures dos testes para S-1.3 (`v_S_01_03_00`)**
    - Atualizar o namespace nos XML dos testes
    - Nenhuma lógica muda (motor é agnóstico), mas os testes ficam consistentes com a produção

12. **Adicionar validação de namespace na retificadora**
    - Alertar quando o XML de entrada está em versão mais antiga que o leiaute de saída
    - Hoje a retificadora gera S-1.3 mas pode clonar campos de S-1.2

13. **Expandir `CNAE_RISCO` com tabela completa do Anexo V do Decreto 3.048/99**
    - Hoje são 9 CNAEs na tabela parcial
    - O sistema já tem a lógica para usar a tabela; falta o dado

---

## 5. esociallib — avaliação de reaproveitamento

### 5.1 Situação encontrada

```
$ ls node_modules/ | grep esocial
(nenhum resultado)
```

Não há `esociallib` (nem pacote similar) instalado em `node_modules/`. Não foi possível inspecionar o `package.json` dela.

**Regra aplicada:** conforme instrução da tarefa, não há código para verificar ou copiar.

### 5.2 O que a esociallib MIT oferece (baseado em conhecimento público, não em inspeção direta)

Projetos open-source de leitura/validação do eSocial tipicamente oferecem:

| Funcionalidade | Reaproveitável no Reversa? | Observação |
|---|---|---|
| Parser XML com validação XSD offline | Sim, mas o Reversa usa parser próprio agnóstico de XSD (design intencional para rodar no browser) | Baixo ganho |
| Tabela 3 completa (natRubr) | **Alta relevância** — seria a fonte para preencher `NAT_RUBR` | Verificar licença e data de atualização |
| Tabela de CNAE × grau de risco (Anexo V) | **Alta relevância** — completaria `CNAE_RISCO` | Idem |
| Tabela de FPAS × terceiros | Média — Reversa usa 5,8% fixo com opt-in | Verificar se a tabela por FPAS está atualizada |
| Dicionário de códigos (motivo desligamento, categoria etc.) | Média — aumenta legibilidade dos avisos | Baixo esforço de integração |
| Serialização/geração de eventos | Baixo — a retificadora já tem sua própria geração | Sem ganho claro |

**Antes de usar qualquer código:**
1. Verificar o `package.json` da esociallib: confirmar licença MIT
2. Verificar data da última atualização: tabelas devem ser do S-1.3
3. Não copiar código; importar como dependência ou extrair apenas as tabelas de dados (JSON) com atribuição

---

## 6. Resumo executivo do gap

| Dimensão | Situação atual | Para atingir S-1.3 |
|---|---|---|
| Leiaute de saída | ✅ S-1.3 (retificadora) | Nenhuma mudança necessária |
| Leiaute de leitura | ✅ Agnóstico (aceita S-1.2 e S-1.3) | Validação de namespace a adicionar |
| Eventos de tabela (S-1000/1005/1010/1020) | ✅ Lidos com gaps | Tarefa 2 (exclusao rubrica), Tarefa 1 (Tabela 3) |
| Remuneração (S-1200) | ✅ Lido com estimativa | Tarefa 4 (infoBaseCS) |
| Rescisão (S-2299) | ⚠️ Tolerante — pendente XML real | Tarefa 11 (fixtures) + teste com XML S-1.3 |
| Afastamentos (S-2230) | ❌ Ausente | Tarefa 5 |
| Totalizadores (S-5001/5011) | ❌ Ausentes | Tarefa 6 |
| Processos (S-1070) | ❌ Ausente | Tarefa 7 |
| Tabela NAT_RUBR | ⚠️ ~40/~200 códigos | Tarefa 1 |
| Tabela CNAE_RISCO | ⚠️ 9 CNAEs / milhares | Tarefa 13 |

**Mínimo viável para créditos previdenciários com S-1.3:**
Tarefas 1 + 2 + 4 (semanas 1–2) → Tarefas 5 + 6 (semanas 3–4) → Tarefas 7 + 11 + 13 (semanas 5–6).
