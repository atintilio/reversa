// Painel Master: visão e administração de todos os parceiros, usuários e carteiras.
// Só o master da plataforma chega aqui (checado no roteador); toda ação gera evento de auditoria.
const bcrypt = require('bcryptjs');
const { getSql } = require('../db');
const { normalizeEmail, randomToken, hashToken } = require('../security');
const { sendInvite } = require('../mailer');
const { audit } = require('../audit');
const { HttpError } = require('../authz');
const Comissao = require('../../comissao');

const need = (ok, status, code, msg) => { if (!ok) throw new HttpError(status, code, msg); };
const uuidOk = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 320;
const soDig = (v) => String(v || '').replace(/\D/g, '');
const num = (v) => (v == null ? 0 : Number(v));
const pct = (v) => { const x = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? Math.round(x * 100) / 100 : NaN; };
const json = (v) => (v && typeof v === 'object' ? v : (() => { try { return JSON.parse(v || '{}'); } catch (e) { return {}; } })());

function cnpjValido(c) {
  c = soDig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => { let s = 0, p = base.length - 7; for (let i = 0; i < base.length; i++) { s += Number(base[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

// ------------------------------------------------------------------ resumo e parceiros
async function parceiros() {
  const sql = getSql();
  const rows = await sql`
    select o.id, o.name, o.kind, o.status, o.cnpj, o.commission_pct, o.responsible_name, o.responsible_email, o.notes, o.created_at,
      (select count(*) from organization_members m where m.organization_id = o.id and m.status <> 'suspended')::int as usuarios,
      (select count(*) from taxpayers t where t.organization_id = o.id and t.status <> 'archived')::int as clientes,
      (select count(*) from tax_cases c where c.organization_id = o.id and c.commercial_stage = 'contrato')::int as contratos,
      (select coalesce(sum(c.estimated_value), 0) from tax_cases c where c.organization_id = o.id and c.status <> 'archived') as creditos,
      (select count(*) from ldb_cases l where l.organization_id = o.id)::int as casos_ldb,
      (select coalesce(sum((l.result->>'economia')::numeric), 0) from ldb_cases l where l.organization_id = o.id) as economia_ldb,
      (select max(u.last_login_at) from organization_members m join users u on u.id = m.user_id where m.organization_id = o.id) as ultimo_acesso
    from organizations o
    order by (o.kind = 'plataforma') desc, lower(o.name)`;
  return rows.map((r) => ({
    id: r.id, nome: r.name, tipo: r.kind, status: r.status, cnpj: r.cnpj, comissaoPct: num(r.commission_pct),
    responsavel: r.responsible_name, email: r.responsible_email, observacoes: r.notes, criadoEm: r.created_at,
    usuarios: r.usuarios, clientes: r.clientes, contratos: r.contratos, creditos: num(r.creditos),
    casosLdb: r.casos_ldb, economiaLdb: num(r.economia_ldb), ultimoAcesso: r.ultimo_acesso
  }));
}

async function resumo() {
  const ps = await parceiros();
  const soma = (k) => ps.reduce((s, p) => s + (p[k] || 0), 0);
  const conf = await conflitos();
  return {
    parceiros: ps.filter((p) => p.tipo === 'parceiro').length,
    parceirosAtivos: ps.filter((p) => p.tipo === 'parceiro' && p.status === 'active').length,
    usuarios: soma('usuarios'), clientes: soma('clientes'), contratos: soma('contratos'),
    creditos: soma('creditos'), economiaLdb: soma('economiaLdb'), conflitos: conf.length, tributo: Comissao.TRIBUTO
  };
}

function inviteLink(token) {
  const base = (process.env.APP_BASE_URL || 'https://reversa.argusprime.com.br').replace(/\/$/, '');
  return `${base}/reset-password.html?convite=1&token=${encodeURIComponent(token)}`;
}

// Convite do responsável: tenta o e-mail; se o envio falhar, devolve o link (só ao master) para envio manual.
async function convidar(ctx, user, org) {
  const sql = getSql();
  const raw = randomToken(32);
  await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`;
  await sql`insert into password_reset_tokens (user_id, token_hash, expires_at, created_at)
            values (${user.id}, decode(${hashToken(raw)}, 'hex'), now() + interval '48 hours', now())`;
  try {
    await sendInvite({ to: user.email, token: raw, name: user.name, inviterName: ctx.user.name, organizationName: org.name });
    await audit('master.invite_sent', { organizationId: org.id, actorUserId: ctx.user.id, entityType: 'user', entityId: user.id });
    return { emailSent: true };
  } catch (e) {
    await audit('master.invite_link', { organizationId: org.id, actorUserId: ctx.user.id, entityType: 'user', entityId: user.id, metadata: { motivo: 'email_indisponivel' } });
    return { emailSent: false, link: inviteLink(raw) };
  }
}

async function criarParceiro(ctx, body) {
  const sql = getSql();
  const nome = String(body.nome || '').trim().slice(0, 180);
  const cnpj = soDig(body.cnpj);
  const resp = String(body.responsavel || '').trim().slice(0, 180);
  const email = normalizeEmail(body.email);
  const com = body.comissaoPct === undefined || body.comissaoPct === '' ? 0 : pct(body.comissaoPct);
  need(nome, 400, 'INVALID_NAME', 'Informe o nome do parceiro.');
  need(!cnpj || cnpjValido(cnpj), 400, 'INVALID_CNPJ', 'CNPJ inválido.');
  need(resp, 400, 'INVALID_NAME', 'Informe o nome do responsável.');
  need(emailOk(email), 400, 'INVALID_EMAIL', 'Informe um e-mail válido para o responsável.');
  need(!isNaN(com) && com >= 0 && com <= 100, 400, 'INVALID_COMMISSION', 'Comissão deve ficar entre 0% e 100%.');
  if (cnpj) need(!(await sql`select 1 from organizations where cnpj = ${cnpj} limit 1`)[0], 409, 'PARTNER_EXISTS', 'Já existe um parceiro com este CNPJ.');
  let user = (await sql`select id, email, name, status from users where email_normalized = ${email} limit 1`)[0];
  if (user) {
    need(user.status !== 'blocked', 409, 'USER_BLOCKED', 'Este e-mail está bloqueado.');
    const vinc = (await sql`select 1 from organization_members where user_id = ${user.id} and status <> 'suspended' limit 1`)[0];
    need(!vinc, 409, 'USER_IN_USE', 'Este e-mail já está vinculado a outra organização. Use outro e-mail para o responsável.');
  }
  const org = (await sql`insert into organizations (name, kind, cnpj, commission_pct, responsible_name, responsible_email, notes)
                         values (${nome}, 'parceiro', ${cnpj || null}, ${com}, ${resp}, ${email}, ${String(body.observacoes || '').slice(0, 2000) || null})
                         returning id, name`)[0];
  if (!user) {
    user = (await sql`insert into users (email, email_normalized, name, password_hash, status)
                      values (${String(body.email).trim()}, ${email}, ${resp}, ${await bcrypt.hash(randomToken(32), 12)}, 'pending')
                      returning id, email, name, status`)[0];
  } else if (user.status === 'archived') {
    user = (await sql`update users set status = 'pending', name = ${resp}, updated_at = now() where id = ${user.id} returning id, email, name, status`)[0];
  }
  await sql`insert into organization_members (organization_id, user_id, role, status)
            values (${org.id}, ${user.id}, 'owner', ${user.status === 'active' ? 'active' : 'invited'})`;
  await audit('master.partner_created', { organizationId: org.id, actorUserId: ctx.user.id, entityType: 'organization', entityId: org.id, metadata: { comissao: com } });
  const conv = user.status === 'active' ? { emailSent: false, contaExistente: true } : await convidar(ctx, user, org);
  return { id: org.id, ...conv };
}

async function editarParceiro(ctx, id, body) {
  const sql = getSql();
  need(uuidOk(id), 404, 'NOT_FOUND', 'Parceiro não encontrado.');
  const o = (await sql`select id, kind, status, commission_pct from organizations where id = ${id}`)[0];
  need(o, 404, 'NOT_FOUND', 'Parceiro não encontrado.');
  const status = body.status != null ? String(body.status) : null;
  need(!status || ['active', 'suspended'].includes(status), 400, 'INVALID_STATUS', 'Situação inválida.');
  need(!(status === 'suspended' && o.kind === 'plataforma'), 409, 'PLATFORM', 'A organização da plataforma não pode ser suspensa.');
  const com = body.comissaoPct !== undefined ? pct(body.comissaoPct) : null;
  need(com === null || (!isNaN(com) && com >= 0 && com <= 100), 400, 'INVALID_COMMISSION', 'Comissão deve ficar entre 0% e 100%.');
  const nome = body.nome != null ? String(body.nome).trim().slice(0, 180) : null;
  need(nome !== '', 400, 'INVALID_NAME', 'Informe o nome.');
  const obs = body.observacoes !== undefined ? (String(body.observacoes || '').slice(0, 2000) || null) : undefined;
  await sql`update organizations set status = coalesce(${status}, status), commission_pct = coalesce(${com}, commission_pct), name = coalesce(${nome}, name),
            notes = case when ${obs !== undefined} then ${obs === undefined ? null : obs} else notes end, updated_at = now() where id = ${id}`;
  await audit('master.partner_updated', { organizationId: id, actorUserId: ctx.user.id, entityType: 'organization', entityId: id,
    metadata: { status, comissao_de: num(o.commission_pct), comissao_para: com } });
  return { ok: true };
}

async function reenviarConvite(ctx, orgId) {
  const sql = getSql();
  need(uuidOk(orgId), 404, 'NOT_FOUND', 'Parceiro não encontrado.');
  const r = (await sql`select o.id, o.name, u.id as uid, u.email, u.name as uname, u.status from organizations o
                       join organization_members m on m.organization_id = o.id and m.role = 'owner'
                       join users u on u.id = m.user_id where o.id = ${orgId} order by m.created_at limit 1`)[0];
  need(r, 404, 'NOT_FOUND', 'Responsável não encontrado.');
  need(r.status === 'pending', 409, 'ALREADY_ACTIVE', 'O responsável já criou a senha.');
  return convidar(ctx, { id: r.uid, email: r.email, name: r.uname }, { id: r.id, name: r.name });
}

// ------------------------------------------------------------------ usuários de todas as organizações
async function usuarios() {
  const rows = await getSql()`
    select u.id, u.name, u.email, u.status as user_status, u.last_login_at, m.role, m.status as member_status, m.master, o.id as org_id, o.name as org_name, o.kind
    from organization_members m join users u on u.id = m.user_id join organizations o on o.id = m.organization_id
    order by lower(o.name), lower(u.name)`;
  return rows.map((r) => ({ id: r.id, nome: r.name, email: r.email, situacaoConta: r.user_status, situacao: r.member_status, perfil: r.role,
    ultimoAcesso: r.last_login_at, visaoTodo: r.master === true, organizacao: { id: r.org_id, nome: r.org_name, tipo: r.kind } }));
}

async function editarUsuario(ctx, userId, body) {
  const sql = getSql();
  need(uuidOk(userId) && uuidOk(body.organizacaoId), 404, 'NOT_FOUND', 'Usuário não encontrado.');
  need(userId !== ctx.user.id, 409, 'SELF_LOCKOUT', 'Você não pode alterar o seu próprio acesso por aqui.');
  const m = (await sql`select m.role, m.status, m.master, o.kind from organization_members m join organizations o on o.id = m.organization_id
    where m.user_id = ${userId} and m.organization_id = ${body.organizacaoId}`)[0];
  need(m, 404, 'NOT_FOUND', 'Vínculo não encontrado.');
  // Visão do todo (acesso ao painel Master): só para membros da plataforma, concedida ou retirada pelo master.
  if (body.visaoTodo !== undefined) {
    need(typeof body.visaoTodo === 'boolean', 400, 'INVALID_FLAG', 'Valor inválido.');
    need(m.kind === 'plataforma', 409, 'NOT_PLATFORM', 'A visão do todo só pode ser concedida à equipe da Argus Prime.');
    await sql`update organization_members set master = ${body.visaoTodo}, updated_at = now() where user_id = ${userId} and organization_id = ${body.organizacaoId}`;
    await audit('master.visao_todo', { organizationId: body.organizacaoId, actorUserId: ctx.user.id, entityType: 'user', entityId: userId, metadata: { de: m.master, para: body.visaoTodo } });
    return { ok: true };
  }
  const status = String(body.situacao || '');
  need(['active', 'suspended'].includes(status), 400, 'INVALID_STATUS', 'Situação inválida.');
  need(!(status === 'active' && m.status === 'invited'), 409, 'INVITE_PENDING', 'O convite ainda não foi aceito.');
  await sql`update organization_members set status = ${status}, updated_at = now() where user_id = ${userId} and organization_id = ${body.organizacaoId}`;
  if (status === 'suspended') await sql`update users set session_version = session_version + 1, updated_at = now() where id = ${userId}`;
  await audit('master.member_status', { organizationId: body.organizacaoId, actorUserId: ctx.user.id, entityType: 'user', entityId: userId, metadata: { de: m.status, para: status } });
  return { ok: true };
}

// ------------------------------------------------------------------ carteira consolidada, conflitos e auditoria
async function carteira(query = {}) {
  const sql = getSql();
  const org = uuidOk(query.parceiro) ? query.parceiro : null;
  const rows = await sql`
    select t.id, t.legal_name, t.cnpj_normalized as cnpj, t.tax_regime, t.created_at, o.id as org_id, o.name as org_name, o.commission_pct,
           c.commercial_stage, c.estimated_value, c.metadata->'comissao' as comissao,
           (select (l.result->>'economia')::numeric from ldb_cases l where l.organization_id = t.organization_id and l.cnpj = t.cnpj_normalized order by l.base_year desc limit 1) as economia_ldb
    from taxpayers t join organizations o on o.id = t.organization_id
    left join lateral (select commercial_stage, estimated_value, metadata from tax_cases c where c.taxpayer_id = t.id and c.organization_id = t.organization_id
                       order by (c.status = 'archived'), c.updated_at desc limit 1) c on true
    where t.status <> 'archived' and (${org}::uuid is null or t.organization_id = ${org}::uuid)
    order by lower(o.name), lower(t.legal_name) limit 2000`;
  return rows.map((r) => {
    const cm = json(r.comissao);
    const calc = cm.honorariosPct != null ? Comissao.calcular(cm.base != null ? cm.base : num(r.estimated_value), cm.honorariosPct, num(r.commission_pct)) : null;
    return { id: r.id, nome: r.legal_name, cnpj: r.cnpj, regime: r.tax_regime, parceiro: { id: r.org_id, nome: r.org_name }, fase: r.commercial_stage,
      creditos: num(r.estimated_value), economiaLdb: num(r.economia_ldb), comissao: calc };
  });
}

async function conflitos() {
  const rows = await getSql()`
    select t.cnpj_normalized as cnpj, json_agg(json_build_object('cliente', t.legal_name, 'parceiro', o.name, 'organizacaoId', o.id, 'desde', t.created_at) order by t.created_at) as registros
    from taxpayers t join organizations o on o.id = t.organization_id
    where t.status <> 'archived'
    group by t.cnpj_normalized having count(distinct t.organization_id) > 1
    order by min(t.created_at) desc limit 200`;
  return rows.map((r) => ({ cnpj: r.cnpj, registros: typeof r.registros === 'string' ? JSON.parse(r.registros) : r.registros }));
}

async function auditoria(query = {}) {
  const org = uuidOk(query.parceiro) ? query.parceiro : null;
  const rows = await getSql()`
    select a.event_type, a.outcome, a.entity_type, a.created_at, a.metadata, u.name as ator, o.name as org
    from audit_events a left join users u on u.id = a.actor_user_id left join organizations o on o.id = a.organization_id
    where (${org}::uuid is null or a.organization_id = ${org}::uuid)
    order by a.created_at desc limit 300`;
  return rows.map((r) => ({ evento: r.event_type, resultado: r.outcome, entidade: r.entity_type, em: r.created_at, ator: r.ator, organizacao: r.org }));
}

module.exports = { resumo, parceiros, criarParceiro, editarParceiro, reenviarConvite, usuarios, editarUsuario, carteira, conflitos, auditoria };
