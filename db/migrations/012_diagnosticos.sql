-- 012 — Diagnósticos identificados e versionados (DX-AAAA-0001), por cliente e tipo. Somente expansão.
create sequence if not exists diagnostics_code_seq;

create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  taxpayer_id uuid not null references taxpayers(id),
  tax_case_id uuid references tax_cases(id),
  code varchar(24) not null unique,
  tipo varchar(20) not null check (tipo in ('pis_cofins', 'previdenciario', 'icms', 'completo')),
  versao integer not null check (versao >= 1),
  status varchar(20) not null default 'vigente' check (status in ('vigente', 'substituido')),
  valor_total numeric(18,2) not null default 0,
  valor_no_prazo numeric(18,2) not null default 0,
  periodo_ini date,
  periodo_fim date,
  engine_version varchar(40),
  batch_id uuid,
  resumo jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (taxpayer_id, tipo, versao)
);

create index if not exists diagnostics_org_idx on diagnostics (organization_id, created_at desc);
create index if not exists diagnostics_taxpayer_idx on diagnostics (taxpayer_id, tipo, versao desc);
create unique index if not exists diagnostics_vigente_uq on diagnostics (taxpayer_id, tipo) where status = 'vigente';
