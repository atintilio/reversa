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
