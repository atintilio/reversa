-- 013 — Histórico de alterações dos cards do CRM (quem, quando, o que mudou). Somente expansão.
create table if not exists case_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  tax_case_id uuid references tax_cases(id) on delete set null,
  taxpayer_id uuid references taxpayers(id) on delete cascade,
  actor_user_id uuid references users(id),
  actor_name varchar(180),
  actor_org_kind varchar(20),
  kind varchar(20) not null check (kind in ('edicao', 'fase', 'contato', 'atividade', 'exclusao', 'restauracao', 'diagnostico')),
  field varchar(80),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists case_history_taxpayer_idx on case_history (organization_id, taxpayer_id, created_at desc);
create index if not exists case_history_case_idx on case_history (tax_case_id, created_at desc);
