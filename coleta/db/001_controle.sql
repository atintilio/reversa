-- Módulo de coleta e-CAC — banco de CONTROLE (projeto Neon próprio, separado do Reversa).
-- Guarda só metadados: quem autorizou, estado e prazo da autorização, fila de tarefas e auditoria.
-- NÃO guarda: conteúdo de documentos, senhas, certificados, cookies/sessões. Isso fica cifrado na VPS.

create table if not exists outorgantes (
  id uuid primary key default gen_random_uuid(),
  referencia_externa text,                       -- id do cliente no Reversa (sem FK: bancos separados)
  tipo_documento text not null check (tipo_documento in ('cpf','cnpj')),
  documento text not null,                       -- somente dígitos
  nome text not null,
  criado_em timestamptz not null default now(),
  constraint outorgantes_doc_uq unique (tipo_documento, documento),
  constraint outorgantes_doc_fmt check (
    (tipo_documento = 'cpf'  and documento ~ '^[0-9]{11}$') or
    (tipo_documento = 'cnpj' and documento ~ '^[0-9]{14}$')
  )
);

create table if not exists autorizacoes (
  id uuid primary key default gen_random_uuid(),
  outorgante_id uuid not null references outorgantes(id),
  outorgado_tipo text not null check (outorgado_tipo in ('cpf','cnpj')),   -- quem recebe: CPF ou CNPJ da Argus
  status text not null default 'aguardando_outorga' check (status in (
    'aguardando_outorga',   -- cliente ainda não criou no e-CAC
    'em_analise',           -- cliente assinou; aguarda confirmação do outorgado
    'ativa',                -- outorgado confirmou
    'cancelada',            -- cancelada (inclui cancelamento automático por falta de confirmação)
    'expirada',             -- passou da validade
    'revogada'              -- cliente revogou
  )),
  servicos jsonb not null default '[]'::jsonb,    -- serviços autorizados, como descritos no e-CAC
  em_analise_desde timestamptz,                   -- início da contagem dos 30 dias para confirmar
  prazo_confirmacao timestamptz,                  -- em_analise_desde + 30 dias
  confirmada_em timestamptz,
  validade_ate date,                              -- máximo de 5 anos
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint autorizacoes_prazo_coerente check (
    status <> 'em_analise' or (em_analise_desde is not null and prazo_confirmacao is not null)
  ),
  constraint autorizacoes_ativa_coerente check (
    status <> 'ativa' or (confirmada_em is not null and validade_ate is not null)
  ),
  constraint autorizacoes_validade_max check (
    validade_ate is null or confirmada_em is null or validade_ate <= (confirmada_em::date + interval '5 years')::date
  )
);
create index if not exists autorizacoes_status_idx on autorizacoes (status, prazo_confirmacao);
create index if not exists autorizacoes_outorgante_idx on autorizacoes (outorgante_id);

-- Fila de coleta. O worker na VPS busca tarefas aqui (puxa; ninguém empurra para a VPS).
create table if not exists tarefas_coleta (
  id uuid primary key default gen_random_uuid(),
  autorizacao_id uuid not null references autorizacoes(id),
  tipo text not null check (tipo in ('caixa_postal','situacao_fiscal','dctfweb','darf','certidoes','outro')),
  estado text not null default 'pendente' check (estado in (
    'pendente','em_execucao','aguardando_humano','concluida','falhou','cancelada'
  )),
  tentativas int not null default 0,
  motivo_pausa text,                              -- ex.: '2fa', 'captcha' (nunca contornados)
  resultado_resumo jsonb,                         -- contagens e nomes; nunca o conteúdo do documento
  criada_em timestamptz not null default now(),
  iniciada_em timestamptz,
  finalizada_em timestamptz
);
create index if not exists tarefas_estado_idx on tarefas_coleta (estado, criada_em);
-- no máximo 1 tarefa em execução por autorização (simultaneidade 1 por contribuinte)
create unique index if not exists tarefas_uma_em_execucao_uq
  on tarefas_coleta (autorizacao_id) where estado = 'em_execucao';

-- Auditoria append-only: quem/o que/quando, sem conteúdo sigiloso.
create table if not exists auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  ator text not null,                             -- 'usuario:<id>' | 'worker' | 'sistema'
  acao text not null,
  autorizacao_id uuid references autorizacoes(id),
  tarefa_id uuid references tarefas_coleta(id),
  detalhe jsonb not null default '{}'::jsonb
);
create index if not exists auditoria_autorizacao_idx on auditoria (autorizacao_id, em);

-- (função em uma linha: o divisor de comandos do projeto separa por ';' + quebra de linha)
create or replace function auditoria_imutavel() returns trigger language plpgsql as $$ begin raise exception 'AUDITORIA_IMUTAVEL'; end $$;
drop trigger if exists auditoria_no_update on auditoria;
create trigger auditoria_no_update before update or delete on auditoria
  for each row execute function auditoria_imutavel();
