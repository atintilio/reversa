-- 018 — Reversa Gov: casos (CRM/funil por município) com histórico de etapas e numeração atômica
create table if not exists gov_casos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  numero text not null,
  ibge_code char(7) not null references gov_catalogo_municipios(ibge_code),
  tipo text not null check (tipo in ('fiscal','previdenciario','consolidado')),
  etapa text not null default 'a_apresentar' check (etapa in ('a_apresentar','apresentado','em_analise_municipio','validacao_tecnica','proposta_contrato','em_execucao','concluido','perdido_pausado')),
  valor_estimado numeric(16,2),
  periodo_anos int not null default 5,
  entrada jsonb,
  resultado jsonb,
  calculo_ids jsonb default '[]'::jsonb,
  responsavel_id uuid references users(id),
  motivo_perda text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gov_casos_numero_uq unique (organization_id, numero)
);
create index if not exists gov_casos_etapa_idx on gov_casos (organization_id, etapa);
create index if not exists gov_casos_ibge_idx on gov_casos (ibge_code);
create table if not exists gov_caso_historico (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references gov_casos(id) on delete cascade,
  de text,
  para text,
  nota text,
  por uuid references users(id),
  em timestamptz not null default now()
);
create index if not exists gov_caso_historico_caso_idx on gov_caso_historico (caso_id, em);
create table if not exists gov_numeracao (
  organization_id uuid not null references organizations(id),
  ano int not null,
  ultimo int not null default 0,
  primary key (organization_id, ano)
);
