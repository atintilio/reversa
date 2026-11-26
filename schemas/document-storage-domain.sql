-- Reversa Tax — armazenamento documental versionado e fontes externas.
-- Metadados apenas: o conteúdo permanece no Drive/armazenamento de objetos.

create table if not exists document_sources (
  id uuid primary key default gen_random_uuid(),
  tax_case_id uuid not null references tax_cases(id),
  provider varchar(30) not null,
  root_folder_id text not null,
  root_folder_name text,
  status varchar(20) not null default 'active',
  granted_scopes jsonb not null default '[]'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_sources_provider_ck check (provider in ('google_drive')),
  constraint document_sources_status_ck check (status in ('active', 'revoked', 'disconnected')),
  unique (tax_case_id, provider, root_folder_id)
);

create table if not exists stored_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references document_sources(id),
  parent_document_id uuid references stored_documents(id),
  provider_file_id text not null,
  provider_parent_id text,
  name text not null,
  mime_type text,
  byte_size bigint,
  etag text,
  sha256 varchar(64),
  competence varchar(7),
  cnpj varchar(14),
  document_kind varchar(40),
  state varchar(24) not null default 'discovered',
  last_seen_at timestamptz not null default now(),
  downloaded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stored_documents_state_ck check (state in ('discovered', 'downloaded', 'processed', 'missing', 'changed', 'ignored')),
  unique (source_id, provider_file_id)
);
create index if not exists stored_documents_lookup_idx on stored_documents (source_id, competence, document_kind);
create index if not exists stored_documents_hash_idx on stored_documents (sha256);

create table if not exists document_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references document_sources(id),
  mode varchar(20) not null default 'selected',
  status varchar(20) not null default 'started',
  requested_file_ids jsonb not null default '[]'::jsonb,
  discovered_count integer not null default 0,
  downloaded_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  constraint document_sync_runs_mode_ck check (mode in ('selected', 'incremental')),
  constraint document_sync_runs_status_ck check (status in ('started', 'completed', 'partial', 'failed'))
);
create index if not exists document_sync_runs_source_idx on document_sync_runs (source_id, started_at desc);
