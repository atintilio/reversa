-- 014 — Módulo Reversa Gov: IRRF Municipal (isolado, aditivo, sem modificar tabelas existentes)
-- Prefixo obrigatório gov_ para isolamento lógico.
-- Nenhuma tabela existente é alterada, renomeada ou removida.

create table if not exists gov_municipalities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  ibge_code char(7) not null,
  name varchar(240) not null,
  state char(2) not null,
  cnpj_root char(8),
  status varchar(30) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gov_municipalities_status_ck check (status in ('active', 'suspended', 'archived')),
  constraint gov_municipalities_ibge_uq unique (ibge_code)
);

create index if not exists gov_municipalities_org_idx on gov_municipalities (organization_id, state);

create table if not exists gov_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  municipality_id uuid not null references gov_municipalities(id),
  cnpj char(14) not null,
  legal_name varchar(240) not null,
  legal_nature_code varchar(20),
  entity_type varchar(40) not null check (entity_type in ('direct_admin', 'autarchy', 'foundation', 'consortium', 'other')),
  is_active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gov_entities_cnpj_uq unique (cnpj)
);

create index if not exists gov_entities_municipality_idx on gov_entities (municipality_id);
create index if not exists gov_entities_org_idx on gov_entities (organization_id);

create table if not exists gov_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name varchar(180) not null,
  source_type varchar(40) not null check (source_type in ('transparency_portal', 'tce', 'pncp', 'siconfi', 'official_gazette', 'upload')),
  base_url text,
  terms_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists gov_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_id uuid references gov_entities(id),
  original_name varchar(255) not null,
  mime_type varchar(120) not null,
  size_bytes bigint not null,
  checksum_sha256 varchar(64) not null,
  classification varchar(40) not null default 'internal' check (classification in ('public', 'internal', 'confidential', 'fiscal_restricted', 'personal_data')),
  period_start date,
  period_end date,
  received_at timestamptz not null default now(),
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists gov_documents_org_idx on gov_documents (organization_id, received_at desc);

create table if not exists gov_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_id uuid not null references gov_entities(id),
  supplier_cnpj char(14),
  supplier_name varchar(240),
  invoice_id varchar(120),
  empenho_id varchar(120),
  liquidation_id varchar(120),
  payment_date date,
  competence date,
  gross_amount_cents bigint not null default 0,
  net_amount_cents bigint not null default 0,
  currency char(3) not null default 'BRL',
  source_document_id uuid references gov_documents(id),
  source_locator text,
  created_at timestamptz not null default now()
);

create index if not exists gov_payments_entity_idx on gov_payments (entity_id, payment_date);
create index if not exists gov_payments_supplier_idx on gov_payments (organization_id, supplier_cnpj);

create table if not exists gov_withholdings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  payment_id uuid not null references gov_payments(id),
  tax_type varchar(40) not null default 'IRRF',
  tax_base_cents bigint not null default 0,
  rate numeric(9,6),
  withheld_amount_cents bigint not null default 0,
  withholding_date date,
  nature_code varchar(30),
  cnr varchar(20),
  legal_owner varchar(20) not null default 'UNKNOWN' check (legal_owner in ('MUNICIPAL', 'FEDERAL', 'UNKNOWN')),
  source_document_id uuid references gov_documents(id),
  created_at timestamptz not null default now()
);

create index if not exists gov_withholdings_payment_idx on gov_withholdings (payment_id);

create table if not exists gov_declarations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_id uuid not null references gov_entities(id),
  period date not null,
  system_name varchar(120) not null,
  event_type varchar(80),
  receipt_id varchar(120),
  cnr varchar(20),
  declared_amount_cents bigint not null default 0,
  destination_status varchar(40) not null default 'UNKNOWN' check (destination_status in ('NOT_SENT_TO_DCTFWEB', 'SENT_TO_DCTFWEB', 'OTHER', 'UNKNOWN')),
  source_document_id uuid references gov_documents(id),
  created_at timestamptz not null default now()
);

create index if not exists gov_declarations_entity_period_idx on gov_declarations (entity_id, period);

create table if not exists gov_remittances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_id uuid not null references gov_entities(id),
  payment_reference varchar(120),
  revenue_code varchar(40),
  payment_date date,
  amount_cents bigint not null default 0,
  recipient varchar(240),
  bank_reference varchar(120),
  source_document_id uuid references gov_documents(id),
  created_at timestamptz not null default now()
);

create table if not exists gov_accounting_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_id uuid not null references gov_entities(id),
  account_code varchar(80),
  account_description text,
  competence date not null,
  debit_cents bigint not null default 0,
  credit_cents bigint not null default 0,
  journal_reference varchar(120),
  source_document_id uuid references gov_documents(id),
  created_at timestamptz not null default now()
);

create table if not exists gov_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_id uuid not null references gov_entities(id),
  period date,
  status varchar(40) not null default 'DRAFT' check (status in ('DRAFT', 'NEEDS_EVIDENCE', 'UNDER_REVIEW', 'VALIDATED', 'REJECTED', 'ON_HOLD')),
  gross_candidate_amount_cents bigint not null default 0,
  withheld_amount_cents bigint not null default 0,
  proven_destination_amount_cents bigint not null default 0,
  potential_amount_cents bigint,
  confidence varchar(20) check (confidence in ('LOW', 'MEDIUM', 'HIGH', 'VERIFIED')),
  legal_owner varchar(20) check (legal_owner in ('MUNICIPAL', 'FEDERAL', 'UNKNOWN')),
  cnr varchar(20),
  rule_id text,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gov_candidates_org_status_idx on gov_candidates (organization_id, status, updated_at desc);

create table if not exists gov_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  candidate_id uuid not null references gov_candidates(id) on delete cascade,
  document_id uuid references gov_documents(id),
  evidence_type varchar(60) not null,
  record_locator text,
  validation_status varchar(30) not null default 'PENDING' check (validation_status in ('PENDING', 'ACCEPTED', 'REJECTED', 'INCONCLUSIVE')),
  validated_by uuid references users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gov_evidence_links_candidate_idx on gov_evidence_links (candidate_id, validation_status);

create table if not exists gov_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  candidate_id uuid not null references gov_candidates(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  reviewer_role varchar(40) not null,
  decision varchar(30) not null check (decision in ('APPROVE', 'REJECT', 'REQUEST_MORE_EVIDENCE')),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists gov_reviews_candidate_idx on gov_reviews (candidate_id, created_at desc);

create table if not exists gov_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  candidate_id uuid not null references gov_candidates(id),
  procedure_type varchar(80),
  protocol_number varchar(120),
  protocol_date date,
  recognized_amount_cents bigint,
  recovered_amount_cents bigint,
  recovery_date date,
  status varchar(40) not null default 'OPEN' check (status in ('OPEN', 'DOCUMENTATION', 'LEGAL_REVIEW', 'READY_FOR_PROTOCOL', 'PROTOCOLLED', 'RECOVERED', 'CLOSED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gov_cases_org_status_idx on gov_cases (organization_id, status);

create table if not exists gov_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  actor_user_id uuid references users(id),
  action varchar(120) not null,
  object_type varchar(80) not null,
  object_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists gov_audit_events_org_time_idx on gov_audit_events (organization_id, occurred_at desc);