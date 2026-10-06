const { getSql } = require('../db');
const { audit } = require('../audit');
const { HttpError } = require('../authz');
const diag = require('../diagnostico');
const agente = require('../agente');

// CRM nativo (mesma sessão, mesma organização): funil = tax_cases.commercial_stage; contatos e linha do tempo por cliente.
const TYPES = ['note', 'call', 'meeting', 'email', 'task'];
const uuidOk = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
function need(cond, status, code, message) { if (!cond) throw new HttpError(status, code, message); }
const txt = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
const json = (v) => (v && typeof v === 'object' ? v : typeof v === 'string' ? JSON.parse(v) : {});
function quando(v) {
  if (v == null || v === '') return null;
  const d = new Date(v); need(!isNaN(d), 400, 'INVALID_DATE', 'Data inválida.'); return d.toISOString();
}

async function taxpayer(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Cliente não encontrado.');
  const t = (await getSql()`select id, legal_name, cnpj_normalized as cnpj, tax_regime, metadata from taxpayers
                            where id = ${id} and organization_id = ${ctx.organization.id} and status <> 'archived'`)[0];
  need(t, 404, 'NOT_FOUND', 'Cliente não encontrado.');
  return t;
}

async function currentCase(orgId, taxpayerId) {
  return (await getSql()`select c.id, c.commercial_stage, c.status, c.estimated_value, c.next_step, c.expected_close_date, c.owner_user_id, u.name as owner_name
                          from tax_cases c left join users u on u.id = c.owner_user_id
                          where c.taxpayer_id = ${taxpayerId} and c.organization_id = ${orgId}
                          order by (c.status = 'archived'), c.updated_at desc limit 1`)[0] || null;
}

// ------------------------------------------------------------------ funil
async function pipeline(ctx) {
  const sql = getSql();
  const rows = await sql`
    select t.id, t.legal_name, t.cnpj_normalized as cnpj, t.tax_regime, t.metadata->'perfil' as perfil,
           c.id as case_id, c.commercial_stage, c.estimated_value, c.next_step, c.expected_close_date, c.updated_at as case_updated_at,
           u.name as owner_name,
           (select max(a.created_at) from crm_activities a where a.taxpayer_id = t.id and a.organization_id = t.organization_id) as last_activity_at,
           (select count(*)::int from crm_activities a where a.taxpayer_id = t.id and a.organization_id = t.organization_id and a.type = 'task' and a.done_at is null) as open_tasks,
           (select count(*)::int from crm_activities a where a.taxpayer_id = t.id and a.organization_id = t.organization_id and a.type = 'task' and a.done_at is null and a.due_at < now()) as overdue_tasks,
           (select count(*)::int from crm_contacts k where k.taxpayer_id = t.id and k.organization_id = t.organization_id) as contacts
    from taxpayers t
    left join lateral (select * from tax_cases c where c.taxpayer_id = t.id and c.organization_id = t.organization_id
                       order by (c.status = 'archived'), c.updated_at desc limit 1) c on true
    left join users u on u.id = c.owner_user_id
    where t.organization_id = ${ctx.organization.id} and t.status <> 'archived'
    order by lower(t.legal_name)`;
  return {
    clientes: rows.map((r) => ({
      id: r.id, legalName: r.legal_name, cnpj: r.cnpj, taxRegime: r.tax_regime,
      caseId: r.case_id, stage: r.commercial_stage || 'a_apresentar',
      estimatedValue: r.estimated_value == null ? null : Number(r.estimated_value),
      nextStep: r.next_step, expectedCloseDate: r.expected_close_date, owner: r.owner_name,
      lastActivityAt: r.last_activity_at || r.case_updated_at, openTasks: r.open_tasks, overdueTasks: r.overdue_tasks, contacts: r.contacts,
      diagnostico: diag.resumo({ regime: r.tax_regime, perfil: json(r.perfil) })
    }))
  };
}

// ------------------------------------------------------------------ ficha do cliente
async function client(ctx, id) {
  const sql = getSql();
  const t = await taxpayer(ctx, id);
  const meta = json(t.metadata);
  const c = await currentCase(ctx.organization.id, t.id);
  const contacts = await sql`select id, name, role, email, phone, is_primary, created_at from crm_contacts
                             where taxpayer_id = ${t.id} and organization_id = ${ctx.organization.id} order by is_primary desc, lower(name)`;
  const acts = await sql`select a.id, a.type, a.subject, a.body, a.due_at, a.done_at, a.meta, a.created_at, a.assignee_user_id,
                                cu.name as created_by_name, au.name as assignee_name
                         from crm_activities a left join users cu on cu.id = a.created_by left join users au on au.id = a.assignee_user_id
                         where a.taxpayer_id = ${t.id} and a.organization_id = ${ctx.organization.id}
                         order by coalesce(a.due_at, a.created_at) desc limit 300`;
  const stages = await sql`select metadata, created_at from audit_events where organization_id = ${ctx.organization.id}
                           and entity_type = 'tax_case' and event_type = 'case.stage_changed'
                           and entity_id in (select id from tax_cases where taxpayer_id = ${t.id}) order by created_at desc limit 50`;
  return {
    cliente: {
      id: t.id, legalName: t.legal_name, cnpj: t.cnpj, taxRegime: t.tax_regime, perfil: json(meta.perfil), publico: meta.cnpj_publico || null,
      caso: c && { id: c.id, stage: c.commercial_stage, status: c.status, estimatedValue: c.estimated_value == null ? null : Number(c.estimated_value), nextStep: c.next_step, expectedCloseDate: c.expected_close_date, owner: c.owner_name }
    },
    contatos: contacts.map((k) => ({ id: k.id, name: k.name, role: k.role, email: k.email, phone: k.phone, primary: k.is_primary })),
    atividades: acts.map((a) => ({ id: a.id, type: a.type, subject: a.subject, body: a.body, dueAt: a.due_at, doneAt: a.done_at, meta: json(a.meta), createdAt: a.created_at, createdBy: a.created_by_name, assigneeId: a.assignee_user_id, assignee: a.assignee_name })),
    fases: stages.map((s) => ({ ...json(s.metadata), at: s.created_at })),
    diagnostico: diag.diagnosticar({ regime: t.tax_regime, perfil: json(meta.perfil) }),
    agente: { configurado: agente.configurado(), modelo: agente.configurado() ? agente.modelo() : null }
  };
}

async function members(ctx) {
  const rows = await getSql()`select u.id, u.name from organization_members m join users u on u.id = m.user_id
                              where m.organization_id = ${ctx.organization.id} and m.status = 'active' and u.status = 'active' order by lower(u.name)`;
  return { membros: rows.map((r) => ({ id: r.id, name: r.name })) };
}

// ------------------------------------------------------------------ contatos
function contactFields(body) {
  const email = txt(body.email, 240);
  need(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'INVALID_EMAIL', 'E-mail inválido.');
  return { role: txt(body.role, 120), email, phone: txt(body.phone, 40), primary: body.primary === true };
}

async function createContact(ctx, body) {
  const t = await taxpayer(ctx, body.taxpayerId);
  const name = txt(body.name, 160); need(name, 400, 'INVALID_NAME', 'Informe o nome do contato.');
  const f = contactFields(body);
  const sql = getSql();
  if (f.primary) await sql`update crm_contacts set is_primary = false where taxpayer_id = ${t.id} and organization_id = ${ctx.organization.id}`;
  const row = (await sql`insert into crm_contacts (organization_id, taxpayer_id, name, role, email, phone, is_primary, created_by)
                         values (${ctx.organization.id}, ${t.id}, ${name}, ${f.role}, ${f.email}, ${f.phone}, ${f.primary}, ${ctx.user.id}) returning id`)[0];
  await audit('crm.contact.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: t.id });
  return { id: row.id };
}

async function updateContact(ctx, id, body) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Contato não encontrado.');
  const sql = getSql();
  const k = (await sql`select id, taxpayer_id from crm_contacts where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(k, 404, 'NOT_FOUND', 'Contato não encontrado.');
  const name = txt(body.name, 160); need(name, 400, 'INVALID_NAME', 'Informe o nome do contato.');
  const f = contactFields(body);
  if (f.primary) await sql`update crm_contacts set is_primary = false where taxpayer_id = ${k.taxpayer_id} and organization_id = ${ctx.organization.id}`;
  await sql`update crm_contacts set name = ${name}, role = ${f.role}, email = ${f.email}, phone = ${f.phone}, is_primary = ${f.primary}, updated_at = now() where id = ${id}`;
  await audit('crm.contact.updated', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: k.taxpayer_id });
}

async function deleteContact(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Contato não encontrado.');
  const k = (await getSql()`delete from crm_contacts where id = ${id} and organization_id = ${ctx.organization.id} returning taxpayer_id`)[0];
  need(k, 404, 'NOT_FOUND', 'Contato não encontrado.');
  await audit('crm.contact.deleted', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: k.taxpayer_id });
}

// ------------------------------------------------------------------ linha do tempo e tarefas
async function assignee(ctx, v) {
  if (v == null || v === '') return null;
  need(uuidOk(v), 400, 'INVALID_ASSIGNEE', 'Responsável inválido.');
  const m = (await getSql()`select 1 from organization_members where organization_id = ${ctx.organization.id} and user_id = ${v} and status = 'active'`)[0];
  need(m, 400, 'INVALID_ASSIGNEE', 'Responsável não é membro ativo.');
  return v;
}

async function createActivity(ctx, body) {
  need(!ctx.user.legacy, 403, 'LEGACY_SESSION', 'Entre com seu e-mail para registrar atividades.');
  const t = await taxpayer(ctx, body.taxpayerId);
  const type = String(body.type || ''); need(TYPES.includes(type), 400, 'INVALID_TYPE', 'Tipo inválido.');
  const subject = txt(body.subject, 240); const text = txt(body.body, 20000);
  need(subject || text, 400, 'EMPTY', 'Escreva o assunto ou o texto.');
  const due = quando(body.dueAt);
  need(type !== 'task' || due, 400, 'DUE_REQUIRED', 'Informe o prazo da tarefa.');
  const who = type === 'task' ? (await assignee(ctx, body.assigneeId)) || ctx.user.id : null;
  const c = await currentCase(ctx.organization.id, t.id);
  const done = type !== 'task' && body.done !== false ? new Date().toISOString() : null;
  const row = (await getSql()`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, body, due_at, done_at, assignee_user_id, created_by)
                              values (${ctx.organization.id}, ${t.id}, ${c ? c.id : null}, ${type}, ${subject}, ${text}, ${due}, ${type === 'task' ? null : done}, ${who}, ${ctx.user.id}) returning id`)[0];
  await audit('crm.activity.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: t.id, metadata: { type } });
  return { id: row.id };
}

async function updateActivity(ctx, id, body) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Atividade não encontrada.');
  const sql = getSql();
  const a = (await sql`select id, type, taxpayer_id from crm_activities where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(a, 404, 'NOT_FOUND', 'Atividade não encontrada.');
  if (body.done != null) {
    await sql`update crm_activities set done_at = ${body.done ? new Date().toISOString() : null}, updated_at = now() where id = ${id}`;
  }
  if (body.subject !== undefined || body.body !== undefined || body.dueAt !== undefined || body.assigneeId !== undefined) {
    need(a.type !== 'agent', 400, 'READ_ONLY', 'A análise do agente não é editável.');
    const cur = (await sql`select subject, body, due_at, assignee_user_id from crm_activities where id = ${id}`)[0];
    const subject = body.subject !== undefined ? txt(body.subject, 240) : cur.subject;
    const text = body.body !== undefined ? txt(body.body, 20000) : cur.body;
    need(subject || text, 400, 'EMPTY', 'Escreva o assunto ou o texto.');
    const due = body.dueAt !== undefined ? quando(body.dueAt) : cur.due_at;
    need(a.type !== 'task' || due, 400, 'DUE_REQUIRED', 'Informe o prazo da tarefa.');
    const who = body.assigneeId !== undefined && a.type === 'task' ? (await assignee(ctx, body.assigneeId)) || ctx.user.id : cur.assignee_user_id;
    await sql`update crm_activities set subject = ${subject}, body = ${text}, due_at = ${due}, assignee_user_id = ${who}, updated_at = now() where id = ${id}`;
  }
  await audit('crm.activity.updated', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: a.taxpayer_id, metadata: { type: a.type } });
}

async function deleteActivity(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Atividade não encontrada.');
  const a = (await getSql()`delete from crm_activities where id = ${id} and organization_id = ${ctx.organization.id} returning taxpayer_id, type`)[0];
  need(a, 404, 'NOT_FOUND', 'Atividade não encontrada.');
  await audit('crm.activity.deleted', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: a.taxpayer_id, metadata: { type: a.type } });
}

async function tasks(ctx, query = {}) {
  const todas = query.scope === 'all';
  const rows = await getSql()`
    select a.id, a.subject, a.body, a.due_at, a.done_at, a.taxpayer_id, t.legal_name, au.name as assignee_name
    from crm_activities a join taxpayers t on t.id = a.taxpayer_id left join users au on au.id = a.assignee_user_id
    where a.organization_id = ${ctx.organization.id} and a.type = 'task' and a.done_at is null
      and (${todas} or a.assignee_user_id = ${ctx.user.id || null})
    order by a.due_at asc nulls last limit 200`;
  return { tarefas: rows.map((r) => ({ id: r.id, subject: r.subject, body: r.body, dueAt: r.due_at, taxpayerId: r.taxpayer_id, legalName: r.legal_name, assignee: r.assignee_name })) };
}

// ------------------------------------------------------------------ CNPJ público e agente
async function refreshCnpj(ctx, id, opts = {}) {
  const t = await taxpayer(ctx, id);
  const pub = await diag.consultarCnpj(t.cnpj, opts.fetchImpl);
  need(pub, 404, 'CNPJ_NOT_FOUND', 'CNPJ não encontrado na base pública.');
  await getSql()`update taxpayers set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{cnpj_publico}', ${JSON.stringify(pub)}::jsonb), updated_at = now() where id = ${t.id}`;
  await audit('crm.cnpj.refreshed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: t.id });
  return { publico: pub, sugestaoPerfil: diag.sugerirPerfil(pub) };
}

async function runAgent(ctx, id, body = {}, opts = {}) {
  need(!ctx.user.legacy, 403, 'LEGACY_SESSION', 'Entre com seu e-mail para usar o agente.');
  need(agente.configurado(), 503, 'AGENT_NOT_CONFIGURED', 'Agente de IA ainda não configurado (LLM_API_KEY).');
  const d = await client(ctx, id);
  const c = d.cliente;
  const dados = {
    nome: c.legalName, cnpj: c.cnpj, regime: c.taxRegime, perfil: c.perfil, publico: c.publico,
    fase: c.caso ? c.caso.stage : 'a_apresentar', proximoPasso: c.caso && c.caso.nextStep, valorMotor: c.caso ? c.caso.estimatedValue : null,
    diagnostico: d.diagnostico, contatos: d.contatos, atividades: d.atividades.filter((a) => a.type !== 'agent')
  };
  const pergunta = txt(body.pergunta, 1000);
  const r = pergunta ? await agente.perguntar(dados, pergunta, opts) : await agente.analisar(dados, opts);
  const caso = await currentCase(ctx.organization.id, c.id);
  const meta = { modelo: r.modelo, uso: r.uso || null, ...(r.analise ? { analise: r.analise } : { pergunta }) };
  const row = (await getSql()`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, body, done_at, meta, created_by)
                              values (${ctx.organization.id}, ${c.id}, ${caso ? caso.id : null}, 'agent', ${pergunta ? `Pergunta: ${pergunta.slice(0, 200)}` : 'Análise do agente'},
                                      ${r.texto}, now(), ${JSON.stringify(meta)}::jsonb, ${ctx.user.id}) returning id`)[0];
  await audit('crm.agent.ran', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'taxpayer', entityId: c.id, metadata: { modelo: r.modelo, tipo: pergunta ? 'pergunta' : 'analise' } });
  return { id: row.id, texto: r.texto, analise: r.analise || null };
}

module.exports = { pipeline, client, members, createContact, updateContact, deleteContact, createActivity, updateActivity, deleteActivity, tasks, refreshCnpj, runAgent, TYPES };
