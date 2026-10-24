const { getSql } = require('./db');
const { currentUser } = require('./auth');
const { suitesDoUsuario, SUITES } = require('./suites');

// Autorização por organização (PRD §5 e Tech Spec §13): o papel vem de organization_members, nunca do frontend.
const ROLES = ['owner', 'admin', 'analyst', 'viewer', 'support'];
const CAN = {
  read: ['owner', 'admin', 'analyst', 'viewer', 'support'],
  write: ['owner', 'admin', 'analyst'],
  review: ['owner', 'admin'],
  manageMembers: ['owner', 'admin']
};

// Master da plataforma: proprietário da organização "plataforma" e com e-mail na lista do servidor.
// Não é concedido por tela: depende do REVERSA_MASTER_EMAILS (ou do proprietário inicial).
const { normalizeEmail } = require('./security');
function masterEmails() {
  return String(process.env.REVERSA_MASTER_EMAILS || process.env.BOOTSTRAP_OWNER_EMAIL || 'atintilio@argusprime.com.br')
    .split(/[,;\s]+/).map(normalizeEmail).filter(Boolean);
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function context(req) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão necessária.');
  const sql = getSql();
  if (user.legacy) {
    // Transição: sessão legada administra a organização padrão até a migração dos usuários (P0-1).
    const org = (await sql`select id, name from organizations where status = 'active' order by created_at, id limit 1`)[0];
    if (!org) throw new HttpError(403, 'NO_ORGANIZATION', 'Nenhuma organização configurada.');
    return { user: { id: null, name: user.name, email: null, legacy: true }, organization: org, role: 'owner', master: false, suites: await suitesDoUsuario(sql, org.id, null) };
  }
  const rows = await sql`
    select m.role, m.master as membro_master, o.id as organization_id, o.name as organization_name, o.kind, o.commission_pct
    from organization_members m join organizations o on o.id = m.organization_id
    where m.user_id = ${user.id} and m.status = 'active' and o.status = 'active'
    order by m.created_at limit 1`;
  if (!rows[0]) throw new HttpError(403, 'NO_MEMBERSHIP', 'Seu usuário não está vinculado a uma organização.');
  const r = rows[0];
  // Master: dono da plataforma com e-mail autorizado, ou membro da plataforma a quem o master concedeu a visão do todo.
  const master = r.kind === 'plataforma' && ((r.role === 'owner' && masterEmails().includes(normalizeEmail(user.email))) || r.membro_master === true);
  return {
    user: { id: user.id, name: user.name, email: user.email, legacy: false },
    organization: { id: r.organization_id, name: r.organization_name, kind: r.kind || 'interna', commissionPct: Number(r.commission_pct || 0) },
    role: r.role, master,
    suites: master ? SUITES.slice() : await suitesDoUsuario(sql, r.organization_id, user.id)
  };
}

function can(ctx, permission) { return CAN[permission].includes(ctx.role); }

function permissions(ctx) {
  return { ...Object.fromEntries(Object.keys(CAN).map((p) => [p, can(ctx, p)])), master: Boolean(ctx.master) };
}

module.exports = { context, can, permissions, HttpError, ROLES, CAN, masterEmails };
