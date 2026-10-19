-- 011 — Transação PGFN no Reversa (a partir do rascunho aprovado por André; spec 0.2).
-- Somente expansão: nada existente é alterado. Todo acesso é filtrado por organization_id no domínio (lib/domain/pgfn.js);
-- FK sozinha não é autorização. Retenção/descarte de snapshots: a definir antes de usar dados reais em escala.
-- Diferença em relação ao rascunho: rule_code aceita também P01+ (verificações provisórias) enquanto o catálogo R01–R18 não é informado.

create table if not exists pgfn_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  tax_case_id uuid not null references tax_cases(id),
  taxpayer_id uuid not null references taxpayers(id),
  proposal_kind varchar(40) not null default 'not_confirmed',
  dossier_status varchar(40) not null default 'draft',
  viability_status varchar(40) not null default 'nao_avaliado',
  dossier_version integer not null default 1,
  primary_rate_kind varchar(40),
  facts jsonb not null default '{}'::jsonb,
  last_input_hash varchar(64),
  last_solver_run_id uuid,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pgfn_cases_proposal_kind_ck check (proposal_kind in (
    'individual', 'individual_simplified', 'exceptional', 'adhesion', 'not_confirmed'
  )),
  constraint pgfn_cases_dossier_status_ck check (dossier_status in (
    'draft', 'collecting', 'ready_for_review', 'active_monitoring', 'archived'
  )),
  constraint pgfn_cases_viability_status_ck check (viability_status in (
    'viavel', 'viavel_com_pendencia', 'inviavel', 'nao_avaliado'
  )),
  constraint pgfn_cases_primary_rate_ck check (primary_rate_kind is null or primary_rate_kind in (
    'irpj_csll_tax_rate', 'cashflow_discount_rate', 'pgfn_discount_rate'
  )),
  constraint pgfn_cases_hash_ck check (last_input_hash is null or last_input_hash ~ '^[a-fA-F0-9]{64}$'),
  constraint pgfn_cases_version_ck check (dossier_version > 0),
  unique (organization_id, tax_case_id)
);

create index if not exists pgfn_cases_org_updated_idx
  on pgfn_cases (organization_id, updated_at desc);
create index if not exists pgfn_cases_taxpayer_idx
  on pgfn_cases (organization_id, taxpayer_id, updated_at desc);
create index if not exists pgfn_cases_org_viability_idx
  on pgfn_cases (organization_id, viability_status, updated_at desc);

create table if not exists pgfn_debts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pgfn_case_id uuid not null references pgfn_cases(id),
  external_debt_reference varchar(160),
  debt_kind varchar(40) not null default 'desconhecido',
  administrative_status varchar(40) not null default 'desconhecida',
  inscription_date date,
  reference_date date not null,
  original_amount numeric(20,2),
  principal_amount numeric(20,2),
  interest_amount numeric(20,2),
  penalty_amount numeric(20,2),
  legal_charges_amount numeric(20,2),
  updated_balance numeric(20,2),
  guarantee_amount numeric(20,2),
  source_type varchar(40) not null default 'desconhecida',
  source_document_id uuid references documents(id),
  source_import_id uuid,
  source_reference jsonb not null default '{}'::jsonb,
  data_status varchar(40) not null default 'informado_nao_validado',
  notes text,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pgfn_debts_kind_ck check (debt_kind in (
    'principal', 'multa', 'juros', 'encargo', 'previdenciario', 'tributario', 'outro', 'desconhecido'
  )),
  constraint pgfn_debts_admin_status_ck check (administrative_status in (
    'ativa', 'suspensa', 'garantida', 'parcelada', 'quitada', 'contestada', 'outra', 'desconhecida'
  )),
  constraint pgfn_debts_source_type_ck check (source_type in (
    'api_interna', 'pdf_manual', 'planilha_estruturada', 'entrada_manual', 'desconhecida'
  )),
  constraint pgfn_debts_data_status_ck check (data_status in (
    'confirmado', 'informado_nao_validado', 'desconhecido'
  )),
  constraint pgfn_debts_amounts_nonnegative_ck check (
    (original_amount is null or original_amount >= 0) and
    (principal_amount is null or principal_amount >= 0) and
    (interest_amount is null or interest_amount >= 0) and
    (penalty_amount is null or penalty_amount >= 0) and
    (legal_charges_amount is null or legal_charges_amount >= 0) and
    (updated_balance is null or updated_balance >= 0) and
    (guarantee_amount is null or guarantee_amount >= 0)
  )
);

create index if not exists pgfn_debts_case_idx
  on pgfn_debts (organization_id, pgfn_case_id, reference_date desc);
create index if not exists pgfn_debts_source_doc_idx
  on pgfn_debts (source_document_id) where source_document_id is not null;
create unique index if not exists pgfn_debts_external_ref_uq
  on pgfn_debts (organization_id, pgfn_case_id, external_debt_reference)
  where external_debt_reference is not null;

create table if not exists pgfn_solver_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pgfn_case_id uuid not null references pgfn_cases(id),
  run_number integer not null,
  run_status varchar(30) not null default 'queued',
  solver_name varchar(80),
  engine_version varchar(40) not null,
  catalog_version varchar(80) not null,
  input_hash varchar(64) not null,
  input_snapshot jsonb not null,
  rule_snapshot jsonb not null default '[]'::jsonb,
  solver_parameters jsonb not null default '{}'::jsonb,
  objective_value numeric(24,4),
  solver_gap numeric(16,10),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint,
  error_code varchar(120),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  constraint pgfn_solver_runs_status_ck check (run_status in (
    'queued', 'running', 'completed', 'infeasible', 'timed_out', 'failed', 'cancelled'
  )),
  constraint pgfn_solver_runs_hash_ck check (input_hash ~ '^[a-fA-F0-9]{64}$'),
  constraint pgfn_solver_runs_number_ck check (run_number > 0),
  constraint pgfn_solver_runs_gap_ck check (solver_gap is null or solver_gap >= 0),
  constraint pgfn_solver_runs_duration_ck check (duration_ms is null or duration_ms >= 0),
  unique (organization_id, pgfn_case_id, run_number)
);

create index if not exists pgfn_solver_runs_case_idx
  on pgfn_solver_runs (organization_id, pgfn_case_id, created_at desc);
create index if not exists pgfn_solver_runs_status_idx
  on pgfn_solver_runs (run_status, created_at);

create table if not exists pgfn_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  solver_run_id uuid not null references pgfn_solver_runs(id),
  scenario_key varchar(120) not null,
  label varchar(40) not null,
  recommendation varchar(40) not null default 'not_evaluated',
  nominal_cost numeric(24,2),
  present_value_cost numeric(24,2),
  short_term_cash_need numeric(24,2),
  long_term_economic_impact numeric(24,2),
  pareto_optimal boolean,
  solver_solution jsonb not null default '{}'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint pgfn_scenarios_label_ck check (label in (
    'viavel', 'viavel_com_pendencia', 'inviavel', 'nao_avaliado'
  )),
  constraint pgfn_scenarios_recommendation_ck check (recommendation in (
    'recommend', 'conditional', 'do_not_recommend', 'not_evaluated'
  )),
  constraint pgfn_scenarios_amounts_nonnegative_ck check (
    (nominal_cost is null or nominal_cost >= 0) and
    (present_value_cost is null or present_value_cost >= 0) and
    (short_term_cash_need is null or short_term_cash_need >= 0)
  ),
  unique (solver_run_id, scenario_key)
);

create index if not exists pgfn_scenarios_run_idx
  on pgfn_scenarios (organization_id, solver_run_id, label);

create table if not exists pgfn_constraint_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  scenario_id uuid not null references pgfn_scenarios(id),
  rule_code varchar(3) not null,
  tax_rule_version_id uuid references tax_rule_versions(id),
  evaluation_status varchar(30) not null,
  severity varchar(20) not null,
  reason_code varchar(120) not null,
  evaluated_values jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  evidence_document_ids jsonb not null default '[]'::jsonb,
  explanation text,
  created_at timestamptz not null default now(),
  -- R01–R18 são os códigos do catálogo de André (ainda não informado); P01+ são as verificações provisórias baseadas em norma já conferida.
  constraint pgfn_constraint_results_rule_code_ck check (rule_code ~ '^(R(0[1-9]|1[0-8])|P[0-9]{2})$'),
  constraint pgfn_constraint_results_status_ck check (evaluation_status in (
    'satisfied', 'violated', 'unknown', 'not_applicable'
  )),
  constraint pgfn_constraint_results_severity_ck check (severity in (
    'hard', 'soft', 'informational'
  )),
  unique (scenario_id, rule_code)
);

create index if not exists pgfn_constraint_results_scenario_idx
  on pgfn_constraint_results (organization_id, scenario_id, evaluation_status);
create index if not exists pgfn_constraint_results_rule_idx
  on pgfn_constraint_results (rule_code, tax_rule_version_id);

create table if not exists pgfn_rate_sensitivities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  scenario_id uuid not null references pgfn_scenarios(id),
  rate_kind varchar(40) not null,
  baseline_rate numeric(16,10),
  alternative_rate numeric(16,10),
  rate_unit varchar(20) not null,
  is_primary boolean not null default false,
  effective_from date,
  short_term_horizon_months integer,
  long_term_horizon_months integer,
  short_term_cost_delta numeric(24,2),
  long_term_cost_delta numeric(24,2),
  nominal_cost_delta numeric(24,2),
  present_value_cost_delta numeric(24,2),
  breakeven_month integer,
  recommendation varchar(40) not null default 'not_evaluated',
  reason_codes jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pgfn_rate_sens_kind_ck check (rate_kind in (
    'irpj_csll_tax_rate', 'cashflow_discount_rate', 'pgfn_discount_rate'
  )),
  constraint pgfn_rate_sens_unit_ck check (rate_unit in ('fraction', 'percent', 'basis_points')),
  constraint pgfn_rate_sens_recommendation_ck check (recommendation in (
    'recommend', 'conditional', 'do_not_recommend', 'not_evaluated'
  )),
  constraint pgfn_rate_sens_rates_ck check (
    (baseline_rate is null or baseline_rate >= 0) and
    (alternative_rate is null or alternative_rate >= 0)
  ),
  constraint pgfn_rate_sens_horizon_ck check (
    (short_term_horizon_months is null or short_term_horizon_months > 0) and
    (long_term_horizon_months is null or long_term_horizon_months > 0) and
    (breakeven_month is null or breakeven_month >= 0)
  )
);

create index if not exists pgfn_rate_sens_scenario_idx
  on pgfn_rate_sensitivities (organization_id, scenario_id, rate_kind, is_primary);

create table if not exists pgfn_decision_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  scenario_id uuid not null references pgfn_scenarios(id),
  audience varchar(20) not null,
  brief_version integer not null default 1,
  template_version varchar(40) not null,
  status varchar(30) not null default 'draft',
  content jsonb not null,
  created_by uuid references users(id),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pgfn_decision_briefs_audience_ck check (audience in ('parceiro', 'tecnico')),
  constraint pgfn_decision_briefs_status_ck check (status in ('draft', 'in_review', 'approved', 'rejected')),
  constraint pgfn_decision_briefs_version_ck check (brief_version > 0),
  unique (scenario_id, audience, brief_version)
);

create index if not exists pgfn_decision_briefs_scenario_idx
  on pgfn_decision_briefs (organization_id, scenario_id, audience, status);

create table if not exists pgfn_review_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  scenario_id uuid not null references pgfn_scenarios(id),
  decision_brief_id uuid references pgfn_decision_briefs(id),
  actor_user_id uuid not null references users(id),
  decision varchar(20) not null,
  audience varchar(20),
  reason text,
  decision_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pgfn_review_events_decision_ck check (decision in ('approve', 'reject', 'return')),
  constraint pgfn_review_events_audience_ck check (audience is null or audience in ('parceiro', 'tecnico'))
);

create index if not exists pgfn_review_events_scenario_idx
  on pgfn_review_events (organization_id, scenario_id, created_at desc);

create table if not exists pgfn_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pgfn_case_id uuid not null references pgfn_cases(id),
  source_key varchar(120) not null,
  external_event_id varchar(240),
  dedupe_key varchar(240) not null,
  event_class char(1) not null,
  event_status varchar(30) not null default 'detected',
  event_type varchar(120) not null,
  payload_hash varchar(64) not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  rule_version varchar(40),
  detected_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  resolution jsonb not null default '{}'::jsonb,
  constraint pgfn_monitoring_events_class_ck check (event_class in ('A', 'B', 'C')),
  constraint pgfn_monitoring_events_status_ck check (event_status in (
    'detected', 'queued', 'in_review', 'resolved', 'ignored', 'deduped', 'source_unavailable'
  )),
  constraint pgfn_monitoring_events_hash_ck check (payload_hash ~ '^[a-fA-F0-9]{64}$'),
  unique (organization_id, dedupe_key)
);

create index if not exists pgfn_monitoring_events_queue_idx
  on pgfn_monitoring_events (organization_id, event_class, event_status, detected_at desc);
create index if not exists pgfn_monitoring_events_case_idx
  on pgfn_monitoring_events (organization_id, pgfn_case_id, detected_at desc);

create table if not exists pgfn_monitoring_cursors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pgfn_case_id uuid not null references pgfn_cases(id),
  source_key varchar(120) not null,
  last_checked_at timestamptz,
  last_event_cursor text,
  source_status varchar(30) not null default 'not_configured',
  last_error_code varchar(120),
  updated_at timestamptz not null default now(),
  constraint pgfn_monitoring_cursors_status_ck check (source_status in (
    'not_configured', 'active', 'unavailable', 'paused'
  )),
  unique (organization_id, pgfn_case_id, source_key)
);

create index if not exists pgfn_monitoring_cursors_due_idx
  on pgfn_monitoring_cursors (source_status, last_checked_at);
