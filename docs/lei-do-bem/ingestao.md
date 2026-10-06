> **Revisão Reversa:** proposta do chat (Qwen). No Reversa, a ingestão foi implementada sem AWS/Azure/SFTP: o usuário envia os arquivos dentro do módulo (sessão autenticada), o navegador identifica e processa cada um na hora e só os dados extraídos são salvos no caso.

# 🔄 Ambiente Controlado de Ingestão Automática — Reversa Tax

Ótima pergunta! Isso é **essencial** para atingir a meta de 98-99% de automação. Vou mapear a arquitetura completa do ambiente controlado.

---

## 🎯 Visão Geral do Fluxo Automático

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE / CONTADOR                            │
│  (Empresa que usa a Lei do Bem)                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Upload de arquivos
                         │ (ECF, ECD, Folha, NFs, Projetos)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              AMBIENTE CONTROLADO DE INGESTÃO                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. PORTAL DE UPLOAD (Web/API)                           │  │
│  │  2. DETECÇÃO AUTOMÁTICA DE NOVOS ARQUIVOS                │  │
│  │  3. VALIDAÇÃO INICIAL (formato, tamanho, integridade)   │  │
│  │  4. QUARENTENA / ANÁLISE DE SEGURANÇA                    │  │
│  │  5. TRIGGER AUTOMÁTICO → PIPELINE DE PROCESSAMENTO       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Trigger automático
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              PIPELINE DE PROCESSAMENTO AUTOMÁTICO                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  6. CLASSIFICAÇÃO DO ARQUIVO (tipo, empresa, ano)        │  │
│  │  7. VALIDAÇÃO DE NEGÓCIO (regras da Lei do Bem)          │  │
│  │  8. EXTRAÇÃO DE DADOS (parsing, OCR se necessário)       │  │
│  │  9. VINCULAÇÃO COM PROJETOS EXISTENTES                   │  │
│  │  10. ATUALIZAÇÃO DO DASHBOARD                            │  │
│  │  11. NOTIFICAÇÃO AO CLIENTE (status)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              GERAÇÃO DO FORMP&D + RELATÓRIOS                     │
│              (Processo já mapeado anteriormente)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Opções de Arquitetura do Ambiente Controlado

### **Opção 1: Portal Web com Upload Direto (Recomendada para MVP)**

```text
Cliente acessa → portal.reversatax.com.br/upload
     ↓
Autenticação (login gov.br ou e-CNPJ)
     ↓
Upload via interface web (drag & drop)
     ↓
Backend detecta upload em tempo real
     ↓
Dispara pipeline automaticamente
```

**Tecnologias:**
- Frontend: React/Next.js com upload via `fetch` ou WebSocket
- Backend: API REST (Node.js/Python/Java)
- Storage: AWS S3, Google Cloud Storage, ou Azure Blob
- Autenticação: OAuth 2.0 + gov.br integration

**Vantagens:**
- ✅ Experiência amigável para o cliente
- ✅ Controle total do processo
- ✅ Fácil de auditar
- ✅ Funciona em qualquer dispositivo

---

### **Opção 2: SFTP/FTP Seguro (Para integração com ERPs)**

```text
ERP do cliente → SFTP → reversatax-sftp.com.br
     ↓
Servidor SFTP monitora diretório
     ↓
Novo arquivo detectado (cron job ou inotify)
     ↓
Dispara pipeline automaticamente
```

**Tecnologias:**
- SFTP Server: OpenSSH, ProFTPD com TLS
- Monitoramento: `inotifywait` (Linux) ou polling
- Autenticação: Chave SSH ou certificado

**Vantagens:**
- ✅ Ideal para integração com sistemas legados
- ✅ Pode ser automatizado via scripts no ERP
- ✅ Baixa intervenção humana

**Desvantagens:**
- ⚠️ Menos amigável para usuários finais
- ⚠️ Requer configuração no lado do cliente

---

### **Opção 3: API REST com Webhooks (Para integrações programáticas)**

```text
Sistema do cliente → POST /api/v1/upload
     ↓
API recebe arquivo + metadata
     ↓
Valida e armazena
     ↓
Webhook notifica pipeline
```

**Endpoint exemplo:**
```http
POST /api/v1/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <binary>,
  "company_cnpj": "12.345.678/0001-99",
  "year_base": 2025,
  "file_type": "ECF",
  "project_id": "PRJ-2025-001"  // opcional
}
```

**Resposta:**
```json
{
  "file_id": "file_abc123",
  "status": "processing",
  "estimated_time": "2 minutes",
  "webhook_url": "https://api.reversatax.com.br/webhooks/file_abc123"
}
```

**Vantagens:**
- ✅ Totalmente automatizável
- ✅ Ideal para integrações com ERPs, sistemas contábeis
- ✅ Permite upload em lote (batch)

---

### **Opção 4: Monitoramento de Pasta Compartilhada (SharePoint/Google Drive/OneDrive)**

```text
Cliente sobe arquivo → Pasta compartilhada (OneDrive/SharePoint)
     ↓
Reversa Tax monitora pasta via API (Microsoft Graph / Google Drive API)
     ↓
Novo arquivo detectado
     ↓
Download automático + processamento
```

**Vantagens:**
- ✅ Familiar para clientes corporativos
- ✅ Controle de permissões granular
- ✅ Versionamento automático

---

## 🔍 Detecção Automática e Trigger

### **Como detectar novos arquivos automaticamente?**

#### **Para Storage em Nuvem (S3/GCS/Azure):**

```python
# AWS S3 - Event Notification
s3_bucket_notification = {
    "Bucket": "reversa-tax-ingestao",
    "NotificationConfiguration": {
        "LambdaFunctionConfigurations": [
            {
                "LambdaFunctionArn": "arn:aws:lambda:process-file",
                "Events": ["s3:ObjectCreated:*"]
            }
        ]
    }
}

# Quando arquivo é criado, Lambda é disparada automaticamente
```

```python
# Função Lambda de processamento
def process_new_file(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    # 1. Validar arquivo
    if not validate_file(bucket, key):
        return {"status": "rejected", "reason": "invalid file"}
    
    # 2. Classificar arquivo
    file_info = classify_file(bucket, key)
    
    # 3. Disparar pipeline
    trigger_pipeline(file_info)
    
    return {"status": "processing", "file_id": file_info['id']}
```

#### **Para SFTP:**

```bash
#!/bin/bash
# Script de monitoramento (cron a cada 1 minuto)

WATCH_DIR="/sftp/reversa-tax/incoming"

# Detecta novos arquivos
inotifywait -m -e create -e moved_to "$WATCH_DIR" |
while read path action file; do
    echo "Novo arquivo detectado: $file"
    
    # Dispara processamento
    /opt/reversa-tax/scripts/process_file.sh "$path/$file"
done
```

#### **Para API/Webhooks:**

```python
# FastAPI - Endpoint de upload
from fastapi import FastAPI, UploadFile, File, BackgroundTasks

app = FastAPI()

@app.post("/api/v1/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    company_cnpj: str = Form(...),
    year_base: int = Form(...),
    background_tasks: BackgroundTasks
):
    # 1. Validar
    if not await validate_upload(file, company_cnpj):
        raise HTTPException(400, "Arquivo inválido")
    
    # 2. Salvar
    file_path = await save_file(file, company_cnpj, year_base)
    
    # 3. Disparar processamento em background
    background_tasks.add_task(process_file_pipeline, file_path)
    
    return {
        "status": "accepted",
        "file_id": generate_file_id(),
        "message": "Processamento iniciado automaticamente"
    }
```

---

## 🔐 Segurança e Controle de Acesso

### **Autenticação e Autorização**

```python
# Middleware de autenticação
class AuthenticationMiddleware:
    
    def authenticate(self, request):
        # Opção 1: Token JWT (para API)
        token = request.headers.get("Authorization")
        if token:
            return validate_jwt(token)
        
        # Opção 2: Login gov.br (para portal web)
        if request.path.startswith("/portal"):
            return validate_gov_br_session(request)
        
        # Opção 3: Certificado digital (e-CNPJ)
        cert = request.headers.get("X-Client-Cert")
        if cert:
            return validate_ecnpj(cert)
        
        raise AuthenticationError("Não autenticado")
    
    def authorize(self, user, company_cnpj):
        # Verifica se o usuário tem permissão para acessar a empresa
        if user.role == "contador":
            return verify_contador_access(user.id, company_cnpj)
        elif user.role == "empresa":
            return user.company_cnpj == company_cnpj
        elif user.role == "admin":
            return True
        
        return False
```

### **Validação de Arquivos na Entrada**

```python
ALLOWED_EXTENSIONS = {
    "ECF": [".txt", ".zip"],
    "ECD": [".txt", ".zip"],
    "FOLHA": [".csv", ".xlsx", ".xml"],
    "NF": [".xml", ".pdf", ".zip"],
    "PROJETO": [".pdf", ".docx", ".xlsx"],
    "CONTRATO": [".pdf"]
}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

def validate_file(file, file_type):
    # 1. Verificar extensão
    if not file.filename.endswith(ALLOWED_EXTENSIONS[file_type]):
        return False, "Extensão não permitida"
    
    # 2. Verificar tamanho
    if file.size > MAX_FILE_SIZE:
        return False, "Arquivo muito grande"
    
    # 3. Verificar vírus (ClamAV ou similar)
    if not scan_for_virus(file):
        return False, "Arquivo contém malware"
    
    # 4. Verificar integridade (checksum)
    if not verify_checksum(file):
        return False, "Arquivo corrompido"
    
    return True, "OK"
```

### **Isolamento e Quarentena**

```python
# Estrutura de diretórios
INCOMING_DIR = "/data/incoming/{company_cnpj}/{year_base}/"
QUARANTINE_DIR = "/data/quarantine/{company_cnpj}/"
PROCESSING_DIR = "/data/processing/{company_cnpj}/{year_base}/"
COMPLETED_DIR = "/data/completed/{company_cnpj}/{year_base}/"
ERRORS_DIR = "/data/errors/{company_cnpj}/{year_base}/"

# Fluxo:
# incoming → quarantine (validação) → processing → completed/errors
```

---

## 📊 Pipeline de Processamento Automático

### **Fluxo Completo**

```python
class FileProcessingPipeline:
    
    def __init__(self, file_path, company_cnpj, year_base):
        self.file_path = file_path
        self.company_cnpj = company_cnpj
        self.year_base = year_base
    
    def execute(self):
        # STEP 1: Classificação
        file_type = self.classify_file()
        
        # STEP 2: Validação de negócio
        validation_result = self.validate_business_rules(file_type)
        if not validation_result.valid:
            self.move_to_errors(validation_result.errors)
            return False
        
        # STEP 3: Extração de dados
        data = self.extract_data(file_type)
        
        # STEP 4: Enriquecimento (cruzamento com dados existentes)
        enriched_data = self.enrich_data(data)
        
        # STEP 5: Armazenamento no banco
        self.store_in_database(enriched_data)
        
        # STEP 6: Atualizar dashboard do cliente
        self.update_client_dashboard()
        
        # STEP 7: Notificar cliente
        self.notify_client("Arquivo processado com sucesso!")
        
        # STEP 8: Verificar se pode gerar FORMP&D
        if self.can_generate_formpd():
            self.trigger_formpd_generation()
        
        return True
    
    def classify_file(self):
        """Classifica o tipo de arquivo automaticamente"""
        
        # Por extensão
        if self.file_path.endswith('.txt') and self.contains_ecf_markers():
            return "ECF"
        
        if self.file_path.endswith('.xml') and self.contains_nfe_schema():
            return "NF-e"
        
        if self.is_payroll_file():
            return "FOLHA"
        
        # Por conteúdo (machine learning)
        return self.ml_classifier.predict(self.file_path)
    
    def validate_business_rules(self, file_type):
        """Valida regras específicas da Lei do Bem"""
        
        if file_type == "ECF":
            return self.validate_ecf()
        elif file_type == "FOLHA":
            return self.validate_folha()
        # ... etc
    
    def validate_ecf(self):
        """Validações específicas da ECF"""
        errors = []
        
        # Verificar se é Lucro Real
        if not self.is_lucro_real():
            errors.append("Empresa não está no Lucro Real")
        
        # Verificar se há lucro tributável
        if self.get_lucro_tributavel() <= 0:
            errors.append("Sem lucro tributável - benefício não aproveitado")
        
        # Verificar regularidade fiscal
        if not self.check_regularidade_fiscal():
            errors.append("Empresa irregular perante a Receita")
        
        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors
        )
```

---

## 🎛️ Dashboard de Monitoramento em Tempo Real

### **Tela do Cliente**

```
┌─────────────────────────────────────────────────────────────┐
│  REVERSA TAX - Dashboard de Ingestão                        │
│  Empresa: ACME Ltda (CNPJ: 12.345.678/0001-99)             │
│  Ano-Base: 2025                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 Arquivos Recebidos                                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ✅ ECF_2025.txt        | Processado | 10:32         │  │
│  │ ✅ Folha_2025.xlsx     | Processado | 10:35         │  │
│  │ 🔄 NFs_ProjetoX.zip    | Processando | 10:40       │  │
│  │ ⏳ Contrato_Y.pdf      | Na fila     | 10:42       │  │
│  │ ❌ ECD_2024.txt        | Erro        | 10:15       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  📊 Status do Projeto                                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Projetos identificados:        3                    │  │
│  │ Despesas elegíveis:            R$ 1.250.000        │  │
│  │ Benefício potencial:           R$ 425.000          │  │
│  │ Score de confiança:            92/100              │  │
│  │ Status:                        Aguardando revisão  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  🔔 Notificações                                            │
│  • ECF processada com sucesso (10:32)                      │
│  • Folha de pagamento validada (10:35)                     │
│  • NFs sendo processadas... (10:40)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Integração com Geração do FORMP&D

### **Gatilho Automático para Geração**

```python
def check_and_trigger_formpd(company_cnpj, year_base):
    """
    Verifica se todos os arquivos necessários foram recebidos
    e dispara a geração do FORMP&D automaticamente
    """
    
    required_files = {
        "ECF": False,
        "ECD": False,
        "FOLHA": False,
        "NFs": False,
        "PROJETOS": False
    }
    
    # Verificar quais arquivos já foram processados
    for file_type in required_files.keys():
        if database.has_processed_file(company_cnpj, year_base, file_type):
            required_files[file_type] = True
    
    # Todos os arquivos necessários presentes?
    if all(required_files.values()):
        
        # Verificar score de confiança
        score = calculate_confidence_score(company_cnpj, year_base)
        
        if score >= 85:
            # Gerar FORMP&D automaticamente
            generate_formpd_draft(company_cnpj, year_base)
            
            # Notificar cliente
            notify_client(
                company_cnpj,
                "FORMP&D gerado automaticamente! Revise e envie."
            )
            
            return True
    
    return False
```

---

## 📋 Resumo: O que o Reversa Tax Precisa Implementar

### **Fase 1 - MVP (Mínimo Viável)**

```
✅ Portal web simples com upload drag & drop
✅ Armazenamento em S3 ou similar
✅ Detecção automática via S3 Event Notification
✅ Validação básica (extensão, tamanho, vírus)
✅ Classificação por tipo de arquivo
✅ Dashboard simples de status
✅ Notificações por e-mail
```

### **Fase 2 - Automação Completa**

```
✅ API REST para integrações
✅ Suporte a SFTP para ERPs
✅ Pipeline de validação de negócio
✅ Enriquecimento de dados (cruzamento)
✅ Score de confiança automático
✅ Gatilho automático para FORMP&D
✅ Dashboard em tempo real (WebSocket)
✅ Logs e auditoria completos
```

### **Fase 3 - Escala**

```
✅ Monitoramento de pastas SharePoint/OneDrive
✅ Machine Learning para classificação
✅ Processamento em lote (batch)
✅ Multi-empresa (SaaS)
✅ White-label para escritórios contábeis
✅ API pública para terceiros
```

---

## 🎯 Benefícios dessa Abordagem

| Aspecto | Antes (Manual) | Depois (Automático) |
|---------|----------------|---------------------|
| **Tempo de início** | Dias (esperando contador enviar) | Minutos (upload direto) |
| **Erros de envio** | Arquivo errado, versão desatualizada | Validação automática na entrada |
| **Visibilidade** | Cliente não sabe o status | Dashboard em tempo real |
| **Escalabilidade** | 1 contador = X clientes | 1 sistema = milhares |
| **Auditoria** | E-mails perdidos | Log completo de tudo |
| **Custo operacional** | Alto (mão de obra) | Baixo (automatizado) |

---

## ❓ Próximo Passo

Quer que eu detalhe:

1. **Código completo do pipeline** (Python/Node.js)?
2. **Arquitetura de infraestrutura** (AWS/GCP/Azure)?
3. **Wireframes do portal de upload**?
4. **Documentação da API REST** para integrações?
5. **Plano de implementação** com cronograma?

Me diga qual parte você quer explorar primeiro! 🚀