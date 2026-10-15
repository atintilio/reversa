-- 009 — Execução pós-contrato (retificação → aprovação → validação do contador → transmissão → PER/DCOMP).
-- Só a plataforma (Argus Prime) opera; o parceiro não acessa. Somente expansão: nada é removido.
create table if not exists recovery_executions (
  id uuid primary key default gen_random_uuid(),
  tax_case_id uuid not null unique references tax_cases(id),
  case_organization_id uuid not null references organizations(id),
  stage varchar(40) not null default 'contrato_assinado',
  summary text,
  requires_accountant boolean not null default false,
  approved_by uuid references users(id),
  approved_at timestamptz,
  accountant_email varchar(320),
  accountant_token_hash char(64),
  accountant_sent_at timestamptz,
  accountant_expires_at timestamptz,
  accountant_opened_at timestamptz,
  accountant_name varchar(240),
  accountant_response varchar(30),
  accountant_comment text,
  accountant_responded_at timestamptz,
  receipts jsonb not null default '[]'::jsonb,
  artifacts jsonb not null default '[]'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_executions_stage_ck check (stage in ('contrato_assinado', 'apuracao_definitiva', 'retificacao_preparada', 'pre_validacao',
    'aguardando_aprovacao', 'aprovado', 'validacao_contador', 'transmitido', 'perdcomp', 'acompanhamento', 'concluido', 'cancelado')),
  constraint recovery_executions_accountant_ck check (accountant_response is null or accountant_response in ('validado', 'validado_assinado', 'com_ressalvas'))
);

create unique index if not exists recovery_executions_accountant_token_uq on recovery_executions (accountant_token_hash) where accountant_token_hash is not null;
create index if not exists recovery_executions_stage_idx on recovery_executions (stage, updated_at desc);

create table if not exists recovery_execution_events (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references recovery_executions(id),
  stage_from varchar(40),
  stage_to varchar(40),
  kind varchar(40) not null,
  note text,
  actor_user_id uuid references users(id),
  actor_label varchar(240),
  created_at timestamptz not null default now()
);

create index if not exists recovery_execution_events_exec_idx on recovery_execution_events (execution_id, created_at);
