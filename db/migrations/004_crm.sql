-- 004 — CRM nativo do Reversa: contatos, linha do tempo (notas, ligações, reuniões, e-mails, tarefas, agente)
-- e próximo passo do caso. Somente expansão. O funil continua sendo tax_cases.commercial_stage.

create table if not exists crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  name varchar(160) not null,
  role varchar(120),
  email varchar(240),
  phone varchar(40),
  is_primary boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_taxpayer_idx on crm_contacts (organization_id, taxpayer_id);

create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  case_id uuid references tax_cases(id) on delete set null,
  type varchar(20) not null check (type in ('note', 'call', 'meeting', 'email', 'task', 'agent')),
  subject varchar(240),
  body text,
  due_at timestamptz,
  done_at timestamptz,
  assignee_user_id uuid references users(id),
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_activities_taxpayer_idx on crm_activities (organization_id, taxpayer_id, created_at desc);

create index if not exists crm_activities_tasks_idx on crm_activities (organization_id, assignee_user_id, done_at, due_at);

alter table tax_cases add column if not exists next_step varchar(240);

alter table tax_cases add column if not exists expected_close_date date;
