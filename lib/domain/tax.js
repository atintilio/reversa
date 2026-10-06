const crypto = require('node:crypto');
const { getSql } = require('../db');
const { audit } = require('../audit');
const { HttpError } = require('../authz');

// Empresas (taxpayers), casos e análises por organização (PRD P1-1/P1-4, Tech Spec §13).
// Regra central (RB-09): nenhum valor entra como "aprovado" sem revisão humana.

const STAGES = ['a_apresentar', 'apresentado', 'aguardando_autorizacao', 'contrato', 'perdido'];
const CASE_STATUS = ['draft', 'under_review', 'qualified', 'in_progress', 'completed', 'archived'];
const NATUREZA_STATUS = { credito: 'recoverable_pending_approval', potencial: 'potential_to_validate', risco: 'risk_to_regularize' };

const digits = (s) => String(s || '').replace(/\D/g, '');
function cnpjValido(c) {
  c = digits(c);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0; let peso = base.length - 7;
    for (let i = 0; i < base.length; i++) { soma += Number(base[i]) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11; return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12)); const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}
const cents = (v) => { const n = Math.round(Number(v) || 0); return Number.isFinite(n) ? n : 0; };
const sumPC = (o) => cents(o && o.pis) + cents(o && o.cofins);
function monthStart(c) { return /^\d{4}-\d{2}$/.test(String(c || '')) ? `${c}-01` : null; }
function monthEnd(c) {
  if (!/^\d{4}-\d{2}$/.test(String(c || ''))) return null;
  const [y, m] = c.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
const uuidOk = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

function need(cond, status, code, message) { if (!cond) throw new HttpError(status, code, message); }

// ------------------------------------------------------------------ empresas
const PERFIL_IDS = require('../../teses-regras.js').PERFIL.map((p) => p.id);

async function listTaxpayers(ctx, query = {}) {
  const sql = getSql();
  const q = String(query.q || '').trim().toLowerCase();
  const qd = digits(q);
  const rows = await sql`
    select t.id, t.legal_name, t.cnpj_normalized as cnpj, t.tax_regime, t.status, t.updated_at, t.metadata->'perfil' as perfil,
           c.id as case_id, c.title as case_title, c.commercial_stage, c.status as case_status, c.estimated_value, c.updated_at as case_updated_at,
           (select count(*)::int from tax_cases x where x.taxpayer_id = t.id) as cases
    from taxpayers t
    left join lateral (select * from tax_cases c where c.taxpayer_id = t.id and c.organization_id = t.organization_id
                       order by (c.status = 'archived'), c.updated_at desc limit 1) c on true
    where t.organization_id = ${ctx.organization.id} and t.status <> 'archived'
      and (${q} = '' or lower(t.legal_name) like ${'%' + q + '%'} or (${qd} <> '' and t.cnpj_normalized like ${'%' + qd + '%'}))
    order by lower(t.legal_name)`;
  return rows.map((r) => ({
    id: r.id, legalName: r.legal_name, cnpj: r.cnpj, taxRegime: r.tax_regime, status: r.status, updatedAt: r.updated_at, cases: r.cases,
    perfil: (r.perfil && typeof r.perfil === 'object') ? r.perfil : (typeof r.perfil === 'string' ? JSON.parse(r.perfil) : {}),
    currentCase: r.case_id ? { id: r.case_id, title: r.case_title, stage: r.commercial_stage, status: r.case_status, estimatedValue: r.estimated_value == null ? null : Number(r.estimated_value), updatedAt: r.case_updated_at } : null
  }));
}

async function findOrCreateTaxpayer(ctx, { cnpj, legalName, taxRegime }) {
  const sql = getSql();
  const c = digits(cnpj);
  need(cnpjValido(c), 400, 'INVALID_CNPJ', 'CNPJ inválido.');
  const existing = (await sql`select id, legal_name from taxpayers where organization_id = ${ctx.organization.id} and cnpj_normalized = ${c}`)[0];
  if (existing) return { id: existing.id, created: false };
  const name = String(legalName || '').trim().slice(0, 240) || `Contribuinte ${c}`;
  const row = (await sql`insert into taxpayers (organization_id, legal_name, cnpj, cnpj_normalized, tax_regime)
                          values (${ctx.organization.id}, ${name}, ${c}, ${c}, ${taxRegime ? String(taxRegime).slice(0, 50) : null}) returning id`)[0];
  await audit('taxpayer.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: row.id });
  return { id: row.id, created: true };
}

async function createTaxpayer(ctx, body) {
  const sql = getSql();
  const c = digits(body.cnpj);
  need(String(body.legalName || '').trim(), 400, 'INVALID_NAME', 'Informe a razão social.');
  need(cnpjValido(c), 400, 'INVALID_CNPJ', 'CNPJ inválido.');
  const dup = (await sql`select id from taxpayers where organization_id = ${ctx.organization.id} and cnpj_normalized = ${c}`)[0];
  need(!dup, 409, 'DUPLICATE_CNPJ', 'Já existe uma empresa com este CNPJ.');
  const t = await findOrCreateTaxpayer(ctx, { cnpj: c, legalName: body.legalName, taxRegime: body.taxRegime });
  const caseId = await openCase(ctx, t.id, body.legalName, body.stage);
  return { id: t.id, caseId };
}

async function getTaxpayer(ctx, id) {
  const sql = getSql();
  need(uuidOk(id), 404, 'NOT_FOUND', 'Empresa não encontrada.');
  const t = (await sql`select id, legal_name, cnpj_normalized as cnpj, tax_regime, status, metadata, created_at, updated_at
                        from taxpayers where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(t, 404, 'NOT_FOUND', 'Empresa não encontrada.');
  const cases = await sql`select id, title, status, commercial_stage, estimated_value, metadata, created_at, updated_at from tax_cases
                          where taxpayer_id = ${id} and organization_id = ${ctx.organization.id} order by updated_at desc`;
  const analyses = await sql`
    select a.id, a.tax_case_id, a.status, a.review_status, a.period_start, a.period_end, a.engine_version, a.result_summary, a.assumptions,
           a.calculated_at, a.reviewed_at, r.rule_key, u.name as created_by_name, rv.name as reviewed_by_name
    from tax_analyses a
    join tax_rule_versions r on r.id = a.tax_rule_version_id
    left join users u on u.id = a.created_by
    left join users rv on rv.id = a.reviewed_by
    join tax_cases c on c.id = a.tax_case_id
    where a.taxpayer_id = ${id} and c.organization_id = ${ctx.organization.id}
    order by a.calculated_at desc nulls last, a.created_at desc`;
  const stageEvents = await sql`select event_type, metadata, created_at from audit_events
                                where organization_id = ${ctx.organization.id} and entity_type = 'tax_case' and event_type in ('case.created','case.stage_changed')
                                  and entity_id in (select id from tax_cases where taxpayer_id = ${id}) order by created_at desc limit 50`;
  return {
    taxpayer: { id: t.id, legalName: t.legal_name, cnpj: t.cnpj, taxRegime: t.tax_regime, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at },
    cases: cases.map((c) => ({ id: c.id, title: c.title, status: c.status, stage: c.commercial_stage, estimatedValue: c.estimated_value == null ? null : Number(c.estimated_value), metadata: c.metadata, createdAt: c.created_at, updatedAt: c.updated_at })),
    analyses: analyses.map((a) => ({
      id: a.id, caseId: a.tax_case_id, ruleKey: a.rule_key, status: a.status, reviewStatus: a.review_status,
      periodStart: a.period_start, periodEnd: a.period_end, engineVersion: a.engine_version, summary: a.result_summary, assumptions: a.assumptions,
      calculatedAt: a.calculated_at, createdBy: a.created_by_name, reviewedBy: a.reviewed_by_name, reviewedAt: a.reviewed_at
    })),
    history: stageEvents
  };
}

async function updateTaxpayer(ctx, id, body) {
  const sql = getSql();
  need(uuidOk(id), 404, 'NOT_FOUND', 'Empresa não encontrada.');
  const t = (await sql`select id from taxpayers where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(t, 404, 'NOT_FOUND', 'Empresa não encontrada.');
  const name = body.legalName != null ? String(body.legalName).trim().slice(0, 240) : null;
  need(name !== '', 400, 'INVALID_NAME', 'Informe a razão social.');
  const regime = body.taxRegime != null ? String(body.taxRegime).trim().slice(0, 50) || null : undefined;
  await sql`update taxpayers set legal_name = coalesce(${name}, legal_name),
            tax_regime = case when ${regime === undefined} then tax_regime else ${regime === undefined ? null : regime} end,
            updated_at = now() where id = ${id}`;
  if (body.perfil != null) {
    need(typeof body.perfil === 'object' && !Array.isArray(body.perfil), 400, 'INVALID_PROFILE', 'Perfil inválido.');
    const perfil = {};
    PERFIL_IDS.forEach((k) => { const v = body.perfil[k]; if (v === true || v === false) perfil[k] = v; });
    await sql`update taxpayers set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{perfil}', ${JSON.stringify(perfil)}::jsonb), updated_at = now() where id = ${id}`;
  }
  await audit('taxpayer.updated', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: id });
}

// ------------------------------------------------------------------ casos
async function openCase(ctx, taxpayerId, legalName, stage) {
  const sql = getSql();
  const current = (await sql`select id from tax_cases where taxpayer_id = ${taxpayerId} and organization_id = ${ctx.organization.id}
                             and status not in ('completed','archived') order by updated_at desc limit 1`)[0];
  if (current) return current.id;
  const st = STAGES.includes(stage) ? stage : 'a_apresentar';
  const row = (await sql`insert into tax_cases (organization_id, owner_user_id, title, status, commercial_stage, taxpayer_id, metadata)
                         values (${ctx.organization.id}, ${ctx.user.id}, ${`Diagnóstico PIS/Cofins — ${String(legalName || '').slice(0, 200)}`}, 'draft', ${st}, ${taxpayerId}, '{}'::jsonb)
                         returning id`)[0];
  await audit('case.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: row.id, metadata: { stage: st } });
  return row.id;
}

async function listCases(ctx, query = {}) {
  const sql = getSql();
  const stage = STAGES.includes(query.stage) ? query.stage : '';
  const taxpayerId = uuidOk(query.taxpayer_id) ? query.taxpayer_id : null;
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const rows = await sql`
    select c.id, c.title, c.status, c.commercial_stage, c.estimated_value, c.updated_at, t.id as taxpayer_id, t.legal_name, t.cnpj_normalized as cnpj
    from tax_cases c left join taxpayers t on t.id = c.taxpayer_id
    where c.organization_id = ${ctx.organization.id}
      and (${stage} = '' or c.commercial_stage = ${stage})
      and (${taxpayerId}::uuid is null or c.taxpayer_id = ${taxpayerId}::uuid)
    order by c.updated_at desc, c.id
    limit ${limit} offset ${offset}`;
  return { limit, offset, cases: rows.map((r) => ({ id: r.id, title: r.title, status: r.status, stage: r.commercial_stage, estimatedValue: r.estimated_value == null ? null : Number(r.estimated_value), updatedAt: r.updated_at, taxpayer: r.taxpayer_id ? { id: r.taxpayer_id, legalName: r.legal_name, cnpj: r.cnpj } : null })) };
}

async function createCase(ctx, body) {
  const sql = getSql();
  need(uuidOk(body.taxpayerId), 400, 'INVALID_TAXPAYER', 'Informe a empresa.');
  const t = (await sql`select id, legal_name from taxpayers where id = ${body.taxpayerId} and organization_id = ${ctx.organization.id}`)[0];
  need(t, 404, 'NOT_FOUND', 'Empresa não encontrada.');
  const title = String(body.title || '').trim().slice(0, 240) || `Diagnóstico PIS/Cofins — ${t.legal_name}`;
  const st = STAGES.includes(body.stage) ? body.stage : 'a_apresentar';
  const row = (await sql`insert into tax_cases (organization_id, owner_user_id, title, status, commercial_stage, taxpayer_id)
                         values (${ctx.organization.id}, ${ctx.user.id}, ${title}, 'draft', ${st}, ${t.id}) returning id`)[0];
  await audit('case.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: row.id, metadata: { stage: st } });
  return { id: row.id };
}

async function updateCase(ctx, id, body) {
  const sql = getSql();
  need(uuidOk(id), 404, 'NOT_FOUND', 'Caso não encontrado.');
  const c = (await sql`select id, commercial_stage, status from tax_cases where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(c, 404, 'NOT_FOUND', 'Caso não encontrado.');
  const stage = body.stage != null ? String(body.stage) : null;
  const status = body.status != null ? String(body.status) : null;
  const title = body.title != null ? String(body.title).trim().slice(0, 240) : null;
  need(!stage || STAGES.includes(stage), 400, 'INVALID_STAGE', 'Fase inválida.');
  need(!status || CASE_STATUS.includes(status), 400, 'INVALID_STATUS', 'Situação inválida.');
  need(title !== '', 400, 'INVALID_TITLE', 'Informe o título.');
  await sql`update tax_cases set commercial_stage = coalesce(${stage}, commercial_stage), status = coalesce(${status}, status),
            title = coalesce(${title}, title), updated_at = now() where id = ${id}`;
  if (stage && stage !== c.commercial_stage) {
    await audit('case.stage_changed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: id, metadata: { from: c.commercial_stage, to: stage, by: ctx.user.name } });
  }
  if (status && status !== c.status) await audit('case.status_changed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: id, metadata: { from: c.status, to: status } });
}

// ------------------------------------------------------------------ análises (resultado do motor no navegador)
async function ruleVersion(ruleKey, version, tese) {
  const sql = getSql();
  await sql`insert into tax_rule_versions (rule_key, version, status, source_refs, definition)
            values (${ruleKey}, ${version}, 'draft', '[]'::jsonb, ${JSON.stringify({ source: 'browser_engine', name: tese.nome, natureza: tese.natureza })}::jsonb)
            on conflict (rule_key, version) do nothing`;
  return (await sql`select id from tax_rule_versions where rule_key = ${ruleKey} and version = ${version}`)[0].id;
}

async function saveAnalyses(ctx, body) {
  need(!ctx.user.legacy, 403, 'LEGACY_SESSION', 'Entre com seu e-mail para salvar diagnósticos (o login antigo não grava autoria).');
  const sql = getSql();
  const tp = body.taxpayer || {};
  const taxpayer = await findOrCreateTaxpayer(ctx, { cnpj: tp.cnpj, legalName: tp.legalName, taxRegime: tp.taxRegime });
  let caseId = body.caseId;
  if (caseId) {
    need(uuidOk(caseId), 404, 'NOT_FOUND', 'Caso não encontrado.');
    const c = (await sql`select id from tax_cases where id = ${caseId} and organization_id = ${ctx.organization.id} and taxpayer_id = ${taxpayer.id}`)[0];
    need(c, 404, 'NOT_FOUND', 'Caso não encontrado.');
  } else {
    caseId = await openCase(ctx, taxpayer.id, tp.legalName);
  }
  const pStart = monthStart(body.periodStart); const pEnd = monthEnd(body.periodEnd || body.periodStart);
  need(pStart && pEnd, 400, 'INVALID_PERIOD', 'Período inválido.');
  const version = String(body.engineVersion || '0').slice(0, 40);
  const teses = (Array.isArray(body.teses) ? body.teses : []).filter((t) => NATUREZA_STATUS[t.natureza]).slice(0, 30);
  need(teses.length, 400, 'NO_RESULTS', 'Nenhuma tese calculada para salvar.');
  const batch = crypto.randomUUID();
  const ids = [];
  let creditoNoPrazo = 0;
  for (const t of teses) {
    const total = sumPC(t.total); const noPrazo = sumPC(t.totalNoPrazo);
    const status = total === 0 && noPrazo === 0 ? 'not_applicable' : NATUREZA_STATUS[t.natureza];
    if (t.natureza === 'credito') creditoNoPrazo += noPrazo;
    const summary = {
      batch_id: batch, tese_id: String(t.id).slice(0, 40), nome: String(t.nome || t.curto || '').slice(0, 200), natureza: t.natureza, unidade: 'centavos',
      pis: cents(t.total && t.total.pis), cofins: cents(t.total && t.total.cofins), total,
      pis_no_prazo: cents(t.totalNoPrazo && t.totalNoPrazo.pis), cofins_no_prazo: cents(t.totalNoPrazo && t.totalNoPrazo.cofins), no_prazo: noPrazo,
      itens_com_valor: cents(t.itens), arquivos: Math.max(0, Math.min(10000, Number(body.files) || 0))
    };
    const assumptions = [
      'Resultado do motor no navegador sobre a EFD-Contribuições informada; SPED não armazenado.',
      t.natureza === 'credito' ? 'Valor pendente de revisão e aprovação humana; não é crédito reconhecido.' : t.natureza === 'potencial' ? 'Potencial a validar (essencialidade/relevância e prova documental).' : 'Risco a regularizar antes de qualquer pedido.',
      'Sem correção pela Selic.'
    ];
    const ruleId = await ruleVersion(`pis_cofins.${summary.tese_id}`, version, t);
    const row = (await sql`insert into tax_analyses (tax_case_id, taxpayer_id, tax_rule_version_id, period_start, period_end, engine_version, status, review_status,
                                                      result_summary, assumptions, calculated_at, created_by)
                           values (${caseId}, ${taxpayer.id}, ${ruleId}, ${pStart}, ${pEnd}, ${version}, ${status}, 'pending',
                                   ${JSON.stringify(summary)}::jsonb, ${JSON.stringify(assumptions)}::jsonb, now(), ${ctx.user.id}) returning id`)[0];
    ids.push(row.id);
  }
  await sql`update tax_cases set estimated_value = ${(creditoNoPrazo / 100).toFixed(2)}, status = case when status = 'draft' then 'under_review' else status end,
            metadata = metadata || ${JSON.stringify({ last_batch_id: batch })}::jsonb, updated_at = now() where id = ${caseId}`;
  await audit('tax.analysis.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: caseId, metadata: { batch_id: batch, analyses: ids.length, engine_version: version } });
  return { taxpayerId: taxpayer.id, caseId, batchId: batch, analyses: ids };
}

async function review(ctx, id, body) {
  need(!ctx.user.legacy, 403, 'LEGACY_SESSION', 'Entre com seu e-mail para registrar revisões.');
  const sql = getSql();
  need(uuidOk(id), 404, 'NOT_FOUND', 'Análise não encontrada.');
  const a = (await sql`select a.id, a.status, a.review_status, a.tax_case_id from tax_analyses a join tax_cases c on c.id = a.tax_case_id
                       where a.id = ${id} and c.organization_id = ${ctx.organization.id}`)[0];
  need(a, 404, 'NOT_FOUND', 'Análise não encontrada.');
  const decision = String(body.decision || '');
  need(['approve', 'reject', 'return'].includes(decision), 400, 'INVALID_DECISION', 'Decisão inválida.');
  const note = String(body.note || '').trim().slice(0, 2000);
  need(decision === 'approve' || note, 400, 'NOTE_REQUIRED', 'Explique o motivo da rejeição ou devolução.');
  const reviewStatus = { approve: 'approved', reject: 'rejected', return: 'in_review' }[decision];
  let status = a.status;
  if (decision === 'approve' && a.status === 'recoverable_pending_approval') status = 'recoverable_approved';
  if (decision !== 'approve' && a.status === 'recoverable_approved') status = 'recoverable_pending_approval';
  await sql`update tax_analyses set review_status = ${reviewStatus}, status = ${status}, reviewed_by = ${ctx.user.id}, reviewed_at = now(), updated_at = now() where id = ${id}`;
  await sql`insert into tax_review_events (analysis_id, actor_user_id, from_status, to_status, decision, metadata)
            values (${id}, ${ctx.user.id}, ${a.status}, ${status}, ${note || null}, ${JSON.stringify({ decision, review_status: reviewStatus })}::jsonb)`;
  await audit('tax.analysis.reviewed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_analysis', entityId: id, metadata: { decision } });
  return { status, reviewStatus };
}

// ------------------------------------------------------------------ dashboard
async function dashboard(ctx) {
  const sql = getSql();
  const rows = await sql`
    select c.id as case_id, c.commercial_stage, c.status as case_status, c.updated_at, t.id as taxpayer_id, t.legal_name, t.cnpj_normalized as cnpj,
           a.status, a.review_status, a.result_summary
    from tax_cases c
    left join taxpayers t on t.id = c.taxpayer_id
    left join tax_analyses a on a.tax_case_id = c.id and a.result_summary->>'batch_id' = c.metadata->>'last_batch_id'
    where c.organization_id = ${ctx.organization.id} and c.status <> 'archived'`;
  const total = { cases: 0, withAnalysis: 0, pendingApproval: 0, approved: 0, potential: 0, risk: 0 };
  const stages = Object.fromEntries(STAGES.map((s) => [s, { id: s, cases: 0, value: 0 }]));
  const theses = {};
  const cases = {};
  for (const r of rows) {
    if (!cases[r.case_id]) {
      cases[r.case_id] = { id: r.case_id, stage: r.commercial_stage, taxpayer: r.taxpayer_id ? { id: r.taxpayer_id, legalName: r.legal_name, cnpj: r.cnpj } : null, updatedAt: r.updated_at, pendingApproval: 0, approved: 0, potential: 0, risk: 0, hasAnalysis: false };
    }
    const c = cases[r.case_id];
    if (!r.result_summary) continue;
    c.hasAnalysis = true;
    const s = r.result_summary; const v = Number(s.no_prazo || 0); const vt = Number(s.total || 0);
    if (r.status === 'recoverable_approved') c.approved += v;
    else if (r.status === 'recoverable_pending_approval') c.pendingApproval += v;
    else if (r.status === 'potential_to_validate') c.potential += v;
    else if (r.status === 'risk_to_regularize') c.risk += vt;
    if (r.status !== 'not_applicable') {
      const k = s.tese_id;
      if (!theses[k]) theses[k] = { id: k, name: s.nome, nature: s.natureza, value: 0, approved: 0, cases: 0 };
      const val = s.natureza === 'risco' ? vt : v;
      theses[k].value += val; theses[k].cases += 1;
      if (r.status === 'recoverable_approved') theses[k].approved += val;
    }
  }
  const list = Object.values(cases);
  for (const c of list) {
    total.cases += 1; if (c.hasAnalysis) total.withAnalysis += 1;
    total.pendingApproval += c.pendingApproval; total.approved += c.approved; total.potential += c.potential; total.risk += c.risk;
    const st = stages[c.stage] || stages.a_apresentar; st.cases += 1; st.value += c.pendingApproval + c.approved;
  }
  const order = ['credito', 'potencial', 'risco'];
  return {
    generatedAt: new Date().toISOString(), unit: 'centavos', total,
    stages: STAGES.map((s) => stages[s]),
    theses: Object.values(theses).sort((a, b) => (a.nature === b.nature ? b.value - a.value : order.indexOf(a.nature) - order.indexOf(b.nature))),
    cases: list.sort((a, b) => (b.pendingApproval + b.approved) - (a.pendingApproval + a.approved))
  };
}

module.exports = { listTaxpayers, createTaxpayer, getTaxpayer, updateTaxpayer, listCases, createCase, updateCase, saveAnalyses, review, dashboard, cnpjValido, STAGES };
