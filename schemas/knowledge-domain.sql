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
