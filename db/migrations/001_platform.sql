-- Reversa Tax — esquema de referência PostgreSQL
-- Versão 0.1 — validar nomes, tipos e convenções contra o banco atual.
-- Não executar diretamente em produção sem revisão e migration versionada.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(180) not null,
  status varchar(30) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_status_ck check (status in ('active', 'suspended', 'archived'))
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email varchar(320) not null,
  email_normalized varchar(320) not null,
  name varchar(180) not null,
  password_hash text not null,
  status varchar(30) not null default 'active',
  session_version integer not null default 0,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_ck check (status in ('active', 'blocked', 'pending', 'archived'))
);

create unique index if not exists users_email_normalized_uq
  on users (email_normalized);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role varchar(40) not null,
  status varchar(30) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_members_role_ck check (role in ('owner', 'admin', 'analyst', 'viewer', 'support')),
  constraint organization_members_status_ck check (status in ('active', 'invited', 'suspended'))
);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip_hash bytea,
  user_agent_hash bytea,
  created_at timestamptz not null default now()
);

create unique index if not exists password_reset_tokens_hash_uq
  on password_reset_tokens (token_hash);

create index if not exists password_reset_tokens_user_active_idx
  on password_reset_tokens (user_id, expires_at)
  where used_at is null;

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  session_hash bytea not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create unique index if not exists auth_sessions_hash_uq
  on auth_sessions (session_hash);

create index if not exists auth_sessions_user_active_idx
  on auth_sessions (user_id, expires_at)
  where revoked_at is null;

create table if not exists tax_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  owner_user_id uuid references users(id),
  title varchar(240) not null,
  status varchar(40) not null default 'draft',
  estimated_value numeric(18,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_cases_status_ck check (status in ('draft', 'under_review', 'qualified', 'in_progress', 'completed', 'archived'))
);

create index if not exists tax_cases_org_status_updated_idx
  on tax_cases (organization_id, status, updated_at desc);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  tax_case_id uuid not null references tax_cases(id),
  storage_key text not null,
  original_name varchar(255) not null,
  mime_type varchar(120) not null,
  size_bytes bigint not null,
  checksum_sha256 varchar(64),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists documents_case_idx
  on documents (tax_case_id, created_at desc)
  where deleted_at is null;

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_user_id uuid references users(id),
  event_type varchar(120) not null,
  request_id varchar(120),
  entity_type varchar(80),
  entity_id uuid,
  outcome varchar(30) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_outcome_ck check (outcome in ('success', 'failure', 'denied'))
);

create index if not exists audit_events_org_created_idx
  on audit_events (organization_id, created_at desc);

create index if not exists audit_events_type_created_idx
  on audit_events (event_type, created_at desc);

-- Recomendação de implementação:
-- 1) aplicar em migration transacional quando suportado;
-- 2) validar índices e locks com volume representativo;
-- 3) adicionar política de retenção e RLS somente após ADR aprovado;
-- 4) nunca persistir senha, token bruto ou URL completa do reset.


-- Reversa Tax — extensão do domínio tributário
-- Executar somente como migration versionada após revisão do schema de produção.
-- Depende das tabelas organizations, users, tax_cases e documents do initial-schema.sql.

create table if not exists taxpayers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  legal_name varchar(240) not null,
  cnpj varchar(14) not null,
  cnpj_normalized varchar(14) not null,
  tax_regime varchar(50),
  regime_confirmed_at timestamptz,
  status varchar(30) not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxpayers_status_ck check (status in ('active', 'suspended', 'archived'))
);

create unique index if not exists taxpayers_org_cnpj_uq
  on taxpayers (organization_id, cnpj_normalized);

create table if not exists tax_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_key varchar(160) not null,
  version varchar(40) not null,
  status varchar(30) not null default 'draft',
  legal_effective_from date,
  legal_effective_to date,
  operational_effective_to date,
  source_refs jsonb not null default '[]'::jsonb,
  definition jsonb not null default '{}'::jsonb,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tax_rule_versions_status_ck check (status in ('draft', 'active', 'retired', 'superseded')),
  unique (rule_key, version)
);

create index if not exists tax_rule_versions_active_idx
  on tax_rule_versions (rule_key, status, legal_effective_from);

create table if not exists tax_imports (
  id uuid primary key default gen_random_uuid(),
  tax_case_id uuid not null references tax_cases(id),
  taxpayer_id uuid not null references taxpayers(id),
  document_id uuid references documents(id),
  source_type varchar(40) not null,
  period_start date not null,
  period_end date not null,
  cnpj varchar(14) not null,
  file_sha256 varchar(64) not null,
  parser_version varchar(40) not null,
  status varchar(30) not null default 'received',
  parser_summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_imports_source_type_ck check (source_type in ('efd_contribuicoes', 'ecf', 'nfe', 'contract', 'receipt', 'other')),
  constraint tax_imports_status_ck check (status in ('received', 'processing', 'processed', 'failed', 'superseded'))
);

create unique index if not exists tax_imports_file_uq
  on tax_imports (tax_case_id, file_sha256);

create index if not exists tax_imports_taxpayer_period_idx
  on tax_imports (taxpayer_id, period_start, period_end, status);

create table if not exists tax_analyses (
  id uuid primary key default gen_random_uuid(),
  tax_case_id uuid not null references tax_cases(id),
  taxpayer_id uuid not null references taxpayers(id),
  tax_rule_version_id uuid not null references tax_rule_versions(id),
  period_start date not null,
  period_end date not null,
  engine_version varchar(40) not null,
  status varchar(40) not null default 'candidate',
  review_status varchar(30) not null default 'pending',
  result_summary jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  calculated_at timestamptz,
  created_by uuid not null references users(id),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_analyses_status_ck check (status in ('candidate', 'potential_to_validate', 'recoverable_pending_approval', 'recoverable_approved', 'risk_to_regularize', 'not_applicable', 'monitoring', 'superseded')),
  constraint tax_analyses_review_ck check (review_status in ('pending', 'in_review', 'approved', 'rejected'))
);

create index if not exists tax_analyses_case_status_idx
  on tax_analyses (tax_case_id, status, updated_at desc);

create table if not exists tax_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references tax_analyses(id),
  import_id uuid references tax_imports(id),
  source_line integer,
  document_ref varchar(120),
  item_ref varchar(120),
  cst_pis varchar(10),
  cst_cofins varchar(10),
  cfop varchar(10),
  base_pis numeric(20,2) not null default 0,
  base_cofins numeric(20,2) not null default 0,
  rate_pis numeric(10,6),
  rate_cofins numeric(10,6),
  amount_pis numeric(20,2) not null default 0,
  amount_cofins numeric(20,2) not null default 0,
  classification varchar(40) not null,
  reason text not null,
  formula jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tax_findings_classification_ck check (classification in ('candidate', 'potential_to_validate', 'recoverable_pending_approval', 'recoverable_approved', 'risk_to_regularize', 'not_applicable', 'monitoring'))
);

create index if not exists tax_findings_analysis_idx
  on tax_findings (analysis_id, classification, created_at);

create table if not exists tax_evidence_links (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references tax_findings(id),
  document_id uuid references documents(id),
  evidence_type varchar(60) not null,
  requirement text not null,
  status varchar(30) not null default 'missing',
  notes text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tax_evidence_links_status_ck check (status in ('missing', 'received', 'accepted', 'rejected', 'not_applicable'))
);

create index if not exists tax_evidence_finding_status_idx
  on tax_evidence_links (finding_id, status);

create table if not exists tax_review_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references tax_analyses(id),
  actor_user_id uuid not null references users(id),
  from_status varchar(40),
  to_status varchar(40) not null,
  decision text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tax_review_events_analysis_idx
  on tax_review_events (analysis_id, created_at desc);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  user_id uuid references users(id),
  template_key varchar(100) not null,
  provider varchar(50) not null,
  idempotency_key varchar(160) not null,
  provider_message_id varchar(240),
  status varchar(30) not null default 'queued',
  recipient_hash bytea,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_status_ck check (status in ('queued', 'accepted', 'delivered', 'failed', 'bounced', 'cancelled')),
  unique (idempotency_key)
);

create index if not exists notification_deliveries_status_idx
  on notification_deliveries (status, created_at);

-- Não persistir senha, token bruto, link completo de reset ou conteúdo fiscal fora do storage autorizado.


-- Reversa Tax — controle de tabelas PER/DCOMP e pacotes de recuperação
-- Referência de migration; executar somente após revisão do schema de produção.

create table if not exists perdcomp_table_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null,
  source_url text not null,
  source_updated_at timestamptz,
  retrieved_at timestamptz not null default now(),
  source_sha256 varchar(64) not null,
  storage_key text,
  parse_status varchar(30) not null default 'received',
  normalized_sha256 varchar(64),
  tables_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint perdcomp_table_versions_status_ck check (parse_status in ('received', 'parsed', 'validated', 'failed', 'superseded')),
  unique (version_number, source_sha256)
);

create index if not exists perdcomp_table_versions_current_idx
  on perdcomp_table_versions (version_number desc, parse_status);

create table if not exists recovery_packages (
  id uuid primary key default gen_random_uuid(),
  tax_case_id uuid not null references tax_cases(id),
  taxpayer_id uuid not null references taxpayers(id),
  perdcomp_table_version_id uuid references perdcomp_table_versions(id),
  package_type varchar(40) not null,
  status varchar(40) not null default 'draft',
  period_start date not null,
  period_end date not null,
  total_potential numeric(20,2) not null default 0,
  total_approved numeric(20,2) not null default 0,
  assumptions jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_by uuid not null references users(id),
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_packages_type_ck check (package_type in ('perdcomp_compensacao', 'perdcomp_restituicao', 'efd_retificadora', 'memoria_trabalho')),
  constraint recovery_packages_status_ck check (status in ('draft', 'in_review', 'approved', 'blocked', 'exported', 'cancelled'))
);

create table if not exists recovery_package_items (
  id uuid primary key default gen_random_uuid(),
  recovery_package_id uuid not null references recovery_packages(id),
  finding_id uuid references tax_findings(id),
  perdcomp_table_code varchar(120),
  amount numeric(20,2) not null default 0,
  status varchar(30) not null default 'included',
  notes text,
  created_at timestamptz not null default now(),
  constraint recovery_package_items_status_ck check (status in ('included', 'excluded', 'pending_review'))
);


-- Reversa Tax — domínio de conhecimento e motor de oportunidades
-- Depende de users, organizations, taxpayers, tax_cases e tax_rule_versions.

create table if not exists opportunity_catalog (
  id uuid primary key default gen_random_uuid(),
  opportunity_key varchar(20) not null unique,
  name text not null,
  category varchar(40) not null,
  risk_level varchar(20) not null,
  catalog_status varchar(30) not null default 'active',
  implementation_status varchar(50) not null default 'needs_rule_validation',
  definition jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_catalog_risk_ck check (risk_level in ('baixo', 'medio', 'alto'))
);

create table if not exists assessment_questions (
  id uuid primary key default gen_random_uuid(),
  question_key varchar(120) not null unique,
  prompt text not null,
  answer_type varchar(30) not null,
  options jsonb not null default '[]'::jsonb,
  applies_to jsonb not null default '[]'::jsonb,
  version varchar(40) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  taxpayer_id uuid not null references taxpayers(id),
  status varchar(30) not null default 'draft',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid not null references users(id),
  metadata jsonb not null default '{}'::jsonb,
  constraint assessments_status_ck check (status in ('draft', 'in_progress', 'completed', 'superseded'))
);

create table if not exists assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id),
  question_id uuid not null references assessment_questions(id),
  answer jsonb not null,
  answered_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (assessment_id, question_id)
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  taxpayer_id uuid not null references taxpayers(id),
  tax_case_id uuid references tax_cases(id),
  catalog_id uuid not null references opportunity_catalog(id),
  assessment_id uuid references assessments(id),
  status varchar(40) not null default 'discovered',
  eligibility_state varchar(30) not null default 'needs_validation',
  risk_class varchar(20),
  score numeric(6,2),
  current_rule_version_id uuid references tax_rule_versions(id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_status_ck check (status in ('discovered', 'screening', 'probably_eligible', 'document_validation', 'calculated', 'qualified', 'decision_maker', 'proposal', 'converted', 'not_eligible', 'rejected', 'duplicated', 'insufficient_data', 'legal_review')),
  constraint opportunities_eligibility_ck check (eligibility_state in ('eligible', 'probably_eligible', 'needs_validation', 'not_eligible')),
  constraint opportunities_risk_class_ck check (risk_class is null or risk_class in ('possivel', 'provavel', 'remoto'))
);

create index if not exists opportunities_tenant_status_idx on opportunities (organization_id, status, updated_at desc);

create table if not exists opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id),
  financial_potential numeric(6,2),
  scalability numeric(6,2),
  eligibility numeric(6,2),
  legal_security numeric(6,2),
  execution numeric(6,2),
  market_size numeric(6,2),
  automation numeric(6,2),
  opportunity_score numeric(6,2),
  strategic_score numeric(6,2),
  risk_gate_action varchar(40),
  formula_version varchar(40) not null,
  calculated_at timestamptz not null default now(),
  unique (opportunity_id, formula_version)
);

create table if not exists financial_estimates (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id),
  period_start date not null,
  period_end date not null,
  base_amount numeric(20,2),
  rate numeric(12,8),
  estimated_amount numeric(20,2) not null default 0,
  validated_amount numeric(20,2),
  confidence varchar(30) not null default 'preliminary',
  formula jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint financial_estimates_confidence_ck check (confidence in ('preliminary', 'medium', 'high', 'validated'))
);

create table if not exists validations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id),
  validation_type varchar(40) not null,
  status varchar(30) not null default 'pending',
  requirement text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  decision text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint validations_status_ck check (status in ('pending', 'in_review', 'accepted', 'rejected', 'not_applicable'))
);

create table if not exists opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id),
  actor_user_id uuid references users(id),
  from_status varchar(40),
  to_status varchar(40) not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists system_parameters (
  key varchar(160) primary key,
  value jsonb not null,
  version varchar(40) not null,
  effective_from date,
  effective_to date,
  source_refs jsonb not null default '[]'::jsonb,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists auth_rate_limits (
  bucket_key varchar(128) primary key,
  window_started timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);


alter table users add column if not exists username varchar(120);

create unique index if not exists users_username_normalized_uq on users (lower(username)) where username is not null;
