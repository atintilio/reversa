-- Autorização do cliente separada da revisão técnica do crédito.
create table if not exists client_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  tax_case_id uuid not null references tax_cases(id),
  created_by uuid not null references users(id),
  token_hash varchar(64) not null unique,
  snapshot jsonb not null,
  snapshot_hash varchar(64) not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  representative_name varchar(240),
  representative_email varchar(254),
  representative_role varchar(240),
  selected_theses jsonb,
  created_at timestamptz not null default now(),
  constraint client_authorizations_receipt_ck check (
    accepted_at is null or (representative_name is not null and representative_email is not null
      and representative_role is not null and selected_theses is not null)
  )
);
create index if not exists client_authorizations_case_idx on client_authorizations (organization_id, tax_case_id, created_at);
