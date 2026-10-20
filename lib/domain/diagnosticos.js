const { getSql } = require('../db');
const { audit } = require('../audit');
const { HttpError } = require('../authz');

// Diagnósticos identificados (DX-AAAA-0001) e versionados por cliente e tipo; CRM alimentado automaticamente.
const TIPOS = ['pis_cofins', 'previdenciario', 'icms', 'completo'];
const ROTULO = { pis_cofins: 'PIS/COFINS', previdenciario: 'Previdenciário', icms: 'ICMS', completo: 'Completo' };
const reais = (c) => (Math.round(Number(c) || 0) / 100).toFixed(2);

// Registra uma nova versão: a anterior do mesmo cliente e tipo passa a "substituido".
async function registrar(ctx, p) {
  const sql = getSql();
  if (!TIPOS.includes(p.tipo)) throw new HttpError(400, 'INVALID_TYPE', 'Tipo de diagnóstico inválido.');
  const prev = (await sql`select coalesce(max(versao), 0)::int as v from diagnostics where taxpayer_id = ${p.taxpayerId} and tipo = ${p.tipo}`)[0].v;
  const versao = prev + 1;
  await sql`update diagnostics set status = 'substituido' where taxpayer_id = ${p.taxpayerId} and tipo = ${p.tipo} and status = 'vigente'`;
  const seq = Number((await sql`select nextval('diagnostics_code_seq') as n`)[0].n);
  const code = `DX-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
  const row = (await sql`insert into diagnostics (organization_id, taxpayer_id, tax_case_id, code, tipo, versao, status, valor_total, valor_no_prazo,
      periodo_ini, periodo_fim, engine_version, batch_id, resumo, created_by)
    values (${ctx.organization.id}, ${p.taxpayerId}, ${p.caseId || null}, ${code}, ${p.tipo}, ${versao}, 'vigente', ${p.valorTotal || 0}, ${p.valorNoPrazo || 0},
      ${p.periodoIni || null}, ${p.periodoFim || null}, ${p.engineVersion || null}, ${p.batchId || null}, ${JSON.stringify(p.resumo || {})}::jsonb, ${ctx.user.id})
    returning id`)[0];
  await audit('diagnostic.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'diagnostic', entityId: row.id, metadata: { code, tipo: p.tipo, versao, taxpayer_id: p.taxpayerId } });
  return { id: row.id, code, versao, tipo: p.tipo };
}

// Valor do caso = soma dos diagnósticos vigentes do cliente (todos os tipos).
async function somarVigentes(ctx, taxpayerId, caseId) {
  const sql = getSql();
  const s = (await sql`select coalesce(sum(valor_no_prazo), 0) as t from diagnostics where taxpayer_id = ${taxpayerId} and organization_id = ${ctx.organization.id} and status = 'vigente'`)[0].t;
  if (caseId) await sql`update tax_cases set estimated_value = ${Number(s).toFixed(2)}, updated_at = now() where id = ${caseId} and organization_id = ${ctx.organization.id}`;
  return Number(s);
}

// CRM automático: linha do tempo com o código e tarefa de pendência cadastral (sem duplicar).
async function alimentarCrm(ctx, d, taxpayerId, caseId, extra = {}) {
  const sql = getSql();
  const org = ctx.organization.id;
  await sql`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, body, created_by, meta)
    values (${org}, ${taxpayerId}, ${caseId || null}, 'agent', ${`Diagnóstico ${d.code} (${ROTULO[d.tipo]}) v${d.versao} gerado`},
      ${extra.corpo || null}, ${ctx.user.id}, ${JSON.stringify({ diagnostico: d.code, tipo: d.tipo, versao: d.versao })}::jsonb)`;
  try { await require('../enriquecimento').enriquecer(ctx, taxpayerId, caseId); } catch (e) { /* enriquecimento nunca interrompe o diagnóstico */ }
  const contatos = (await sql`select email, phone, is_primary, role from crm_contacts where organization_id = ${org} and taxpayer_id = ${taxpayerId}`)
    .filter((c) => !/Sugerido \((Receita|Apollo)\)/.test(String(c.role || ''))); // contato sugerido ainda não conta como confirmado
  const prim = contatos.find((c) => c.is_primary) || contatos[0];
  const campos = [];
  if (!prim) campos.push('contato');
  else {
    if (!prim.email) campos.push('e-mail');
    if (!prim.phone) campos.push('telefone');
  }
  if (!campos.length) return { pendencias: [] };
  const aberta = (await sql`select id from crm_activities where organization_id = ${org} and taxpayer_id = ${taxpayerId} and type = 'task' and done_at is null
    and meta->>'pendencia' = 'true' limit 1`)[0];
  if (aberta) { await sql`update crm_activities set subject = ${`Completar cadastro: ${campos.join(', ')}`}, meta = ${JSON.stringify({ pendencia: true, campos })}::jsonb, updated_at = now() where id = ${aberta.id}`; return { pendencias: campos }; }
  const owner = caseId ? (await sql`select owner_user_id from tax_cases where id = ${caseId}`)[0] : null;
  await sql`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, due_at, assignee_user_id, created_by, meta)
    values (${org}, ${taxpayerId}, ${caseId || null}, 'task', ${`Completar cadastro: ${campos.join(', ')}`}, now() + interval '3 days',
      ${(owner && owner.owner_user_id) || ctx.user.id}, ${ctx.user.id}, ${JSON.stringify({ pendencia: true, campos })}::jsonb)`;
  return { pendencias: campos };
}

async function listar(ctx, taxpayerId) {
  const rows = await getSql()`select id, code, tipo, versao, status, valor_total, valor_no_prazo, periodo_ini, periodo_fim, engine_version, created_at
    from diagnostics where organization_id = ${ctx.organization.id} and taxpayer_id = ${taxpayerId} order by created_at desc`;
  return { diagnostics: rows.map((r) => ({ id: r.id, code: r.code, tipo: r.tipo, versao: r.versao, status: r.status, valorTotal: Number(r.valor_total), valorNoPrazo: Number(r.valor_no_prazo), periodoIni: r.periodo_ini, periodoFim: r.periodo_fim, engineVersion: r.engine_version, createdAt: r.created_at })) };
}

module.exports = { registrar, somarVigentes, alimentarCrm, listar, TIPOS, ROTULO, reais };
