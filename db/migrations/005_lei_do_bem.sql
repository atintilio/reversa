-- 005 — Módulo Lei do Bem (Lei 11.196/2005): um caso por empresa e ano-base, com os dados extraídos dos arquivos
-- (os arquivos em si não ficam guardados), o último cálculo do motor e a trilha das quatro revisões humanas.
-- Somente expansão.

create table if not exists ldb_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  taxpayer_id uuid references taxpayers(id) on delete set null,
  cnpj varchar(14) not null,
  legal_name varchar(240) not null,
  base_year integer not null check (base_year between 2006 and 2100),
  status varchar(20) not null default 'rascunho' check (status in ('rascunho', 'em_revisao', 'aprovado', 'enviado', 'arquivado')),
  data jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  reviews jsonb not null default '[]'::jsonb,
  formpd_receipt varchar(120),
  formpd_sent_at date,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ldb_cases_org_cnpj_year_idx on ldb_cases (organization_id, cnpj, base_year);

create index if not exists ldb_cases_org_updated_idx on ldb_cases (organization_id, updated_at desc);
