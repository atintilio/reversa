// "Precisa de ação": cards parados, diagnósticos sem avanço, contratos enviados e não assinados, pendências vencidas.
// Só leitura. Ignora casos arquivados e fases encerradas (contrato, perdido).
const DIAS_CARD = 7; const DIAS_DIAGNOSTICO = 7; const DIAS_CONTRATO = 5;

const dias = (de, agora) => Math.max(0, Math.floor((agora.getTime() - new Date(de).getTime()) / 86400000));

async function alertas(sql, { orgId = null, agora = new Date() } = {}) {
  const org = orgId || null;
  const now = agora.toISOString();
  const itens = [];
  const add = (tipo, r, motivo, desde) => itens.push({ tipo, parceiroId: r.org_id, parceiro: r.org_name, cliente: r.cliente, cnpj: r.cnpj, cardId: r.case_id || null, fase: r.fase || null, motivo, dias: dias(desde, agora), desde });

  const parados = await sql`
    select c.id as case_id, c.commercial_stage as fase, o.id as org_id, o.name as org_name, t.legal_name as cliente, t.cnpj_normalized as cnpj,
           greatest(c.updated_at, coalesce((select max(a.created_at) from crm_activities a where a.organization_id = c.organization_id and a.taxpayer_id = c.taxpayer_id), c.created_at)) as ultima
    from tax_cases c join organizations o on o.id = c.organization_id left join taxpayers t on t.id = c.taxpayer_id
    where c.status <> 'archived' and c.commercial_stage in ('a_apresentar', 'apresentado', 'aguardando_autorizacao')
      and (${org}::uuid is null or c.organization_id = ${org}::uuid)`;
  for (const r of parados) { if (dias(r.ultima, agora) >= DIAS_CARD) add('card_parado', r, `Card sem atividade há ${dias(r.ultima, agora)} dias`, r.ultima); }

  const semAvanco = await sql`
    select c.id as case_id, c.commercial_stage as fase, o.id as org_id, o.name as org_name, t.legal_name as cliente, t.cnpj_normalized as cnpj, d.code, d.created_at as desde
    from diagnostics d join tax_cases c on c.id = d.tax_case_id join organizations o on o.id = d.organization_id join taxpayers t on t.id = d.taxpayer_id
    where d.status = 'vigente' and c.status <> 'archived' and c.commercial_stage in ('a_apresentar', 'apresentado')
      and (${org}::uuid is null or d.organization_id = ${org}::uuid)`;
  for (const r of semAvanco) { if (dias(r.desde, agora) >= DIAS_DIAGNOSTICO) add('diagnostico_sem_avanco', r, `Diagnóstico ${r.code} gerado há ${dias(r.desde, agora)} dias e o card segue em "${r.fase === 'a_apresentar' ? 'A apresentar' : 'Apresentado'}"`, r.desde); }

  const contratos = await sql`
    select c.id as case_id, c.commercial_stage as fase, o.id as org_id, o.name as org_name, t.legal_name as cliente, t.cnpj_normalized as cnpj, max(ca.created_at) as desde
    from client_authorizations ca join tax_cases c on c.id = ca.tax_case_id join organizations o on o.id = ca.organization_id left join taxpayers t on t.id = c.taxpayer_id
    where ca.accepted_at is null and ca.revoked_at is null and c.status <> 'archived' and c.commercial_stage = 'aguardando_autorizacao'
      and not exists (select 1 from client_authorizations x where x.tax_case_id = ca.tax_case_id and x.accepted_at is not null)
      and (${org}::uuid is null or ca.organization_id = ${org}::uuid)
    group by c.id, c.commercial_stage, o.id, o.name, t.legal_name, t.cnpj_normalized`;
  for (const r of contratos) { if (dias(r.desde, agora) >= DIAS_CONTRATO) add('contrato_nao_assinado', r, `Link do contrato enviado há ${dias(r.desde, agora)} dias e ainda não assinado`, r.desde); }

  const vencidas = await sql`
    select a.case_id, o.id as org_id, o.name as org_name, t.legal_name as cliente, t.cnpj_normalized as cnpj, a.subject, a.due_at,
           (select c.commercial_stage from tax_cases c where c.id = a.case_id) as fase
    from crm_activities a join organizations o on o.id = a.organization_id join taxpayers t on t.id = a.taxpayer_id
    where a.type = 'task' and a.done_at is null and a.meta->>'pendencia' = 'true' and a.due_at is not null and a.due_at < ${now}::timestamptz
      and (a.case_id is null or exists (select 1 from tax_cases c where c.id = a.case_id and c.status <> 'archived'))
      and (${org}::uuid is null or a.organization_id = ${org}::uuid)`;
  for (const r of vencidas) add('pendencia_vencida', r, `${r.subject} (venceu há ${dias(r.due_at, agora)} dias)`, r.due_at);

  itens.sort((a, b) => b.dias - a.dias);
  return itens;
}

module.exports = { alertas, DIAS_CARD, DIAS_DIAGNOSTICO, DIAS_CONTRATO };
