// Histórico de alterações dos cards do CRM: cada mudança guarda quem fez, quando, o campo, o valor antigo e o novo.
// Só registra campos que realmente mudaram. Falha no histórico nunca derruba a operação principal.
const { getSql } = require('../db');

const KINDS = ['edicao', 'fase', 'contato', 'atividade', 'exclusao', 'restauracao', 'diagnostico'];
const uuidOk = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const str = (v) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).slice(0, 2000);
};

// Autor: o usuário logado; a equipe Argus (organização plataforma) é identificada pelo tipo da organização.
function ator(ctx) {
  return { userId: ctx.user && ctx.user.id || null, nome: ctx.user && ctx.user.name || null, kind: ctx.master ? 'plataforma' : (ctx.organization && ctx.organization.kind) || null };
}

// mudancas: [{ field, old, new }]; as que não mudaram são descartadas.
async function registrarMudancas(ctx, { orgId, caseId, taxpayerId, kind }, mudancas) {
  if (!KINDS.includes(kind)) return 0;
  const a = ator(ctx);
  let n = 0;
  try {
    const sql = getSql();
    for (const m of mudancas || []) {
      const o = str(m.old); const v = str(m.new);
      if (o === v) continue;
      await sql`insert into case_history (organization_id, tax_case_id, taxpayer_id, actor_user_id, actor_name, actor_org_kind, kind, field, old_value, new_value)
                values (${orgId || ctx.organization.id}, ${caseId || null}, ${taxpayerId || null}, ${a.userId}, ${a.nome}, ${a.kind}, ${kind}, ${m.field || null}, ${o}, ${v})`;
      n++;
    }
  } catch (e) { console.error('history_error', e.name || 'Error'); }
  return n;
}

// Evento sem sessão da equipe (ex.: assinatura do contrato pelo cliente).
async function registrarSistema({ orgId, caseId, taxpayerId, kind, field, old, nu, nome }) {
  try {
    const o = str(old); const v = str(nu);
    if (o === v) return;
    await getSql()`insert into case_history (organization_id, tax_case_id, taxpayer_id, actor_user_id, actor_name, actor_org_kind, kind, field, old_value, new_value)
                   values (${orgId}, ${caseId || null}, ${taxpayerId || null}, null, ${nome || 'Sistema'}, 'sistema', ${kind}, ${field || null}, ${o}, ${v})`;
  } catch (e) { console.error('history_error', e.name || 'Error'); }
}

// Histórico do cliente/caso: tudo que aconteceu no cliente do caso, do mais novo ao mais antigo.
async function listar(ctx, caseId, limit = 200) {
  const sql = getSql();
  if (!uuidOk(caseId)) return null;
  const c = (await sql`select id, taxpayer_id from tax_cases where id = ${caseId} and organization_id = ${ctx.organization.id}`)[0];
  if (!c) return null;
  const rows = await sql`select id, tax_case_id, kind, field, old_value, new_value, actor_name, actor_org_kind, created_at
    from case_history where organization_id = ${ctx.organization.id}
      and (tax_case_id = ${c.id} or (${c.taxpayer_id}::uuid is not null and taxpayer_id = ${c.taxpayer_id}::uuid))
    order by created_at desc, id limit ${Math.min(Math.max(Number(limit) || 200, 1), 500)}`;
  return rows.map((r) => ({ id: r.id, caseId: r.tax_case_id, tipo: r.kind, campo: r.field, de: r.old_value, para: r.new_value, autor: r.actor_name, origem: r.actor_org_kind, em: r.created_at }));
}

// Master operando na organização do parceiro. Sem ?parceiro, em /cases/:id procura a organização dona do card.
async function contextoParceiro(ctx, req, query, caseId) {
  const sql = getSql();
  const h = req.headers && (req.headers['x-reversa-parceiro'] || req.headers['X-Reversa-Parceiro']);
  let orgId = (query && query.parceiro) || h || null;
  if (!orgId && caseId && uuidOk(caseId)) {
    const c = (await sql`select organization_id from tax_cases where id = ${caseId}`)[0];
    if (c) orgId = c.organization_id;
  }
  if (!orgId || !uuidOk(orgId) || orgId === ctx.organization.id) return ctx;
  const o = (await sql`select id, name, kind, commission_pct from organizations where id = ${orgId}`)[0];
  if (!o) return ctx;
  return { ...ctx, organization: { id: o.id, name: o.name, kind: o.kind || 'interna', commissionPct: Number(o.commission_pct || 0) }, role: 'owner', viaArgus: true, origem: ctx.organization };
}

module.exports = { contextoParceiro, registrarMudancas, registrarSistema, listar, ator, KINDS };
