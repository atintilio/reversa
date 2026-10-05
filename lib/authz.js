const { getSql } = require('./db');
const { currentUser } = require('./auth');

// Autorização por organização (PRD §5 e Tech Spec §13): o papel vem de organization_members, nunca do frontend.
const ROLES = ['owner', 'admin', 'analyst', 'viewer', 'support'];
const CAN = {
  read: ['owner', 'admin', 'analyst', 'viewer', 'support'],
  write: ['owner', 'admin', 'analyst'],
  review: ['owner', 'admin'],
  manageMembers: ['owner', 'admin']
};

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
    return { user: { id: null, name: user.name, email: null, legacy: true }, organization: org, role: 'owner' };
  }
  const rows = await sql`
    select m.role, o.id as organization_id, o.name as organization_name
    from organization_members m join organizations o on o.id = m.organization_id
    where m.user_id = ${user.id} and m.status = 'active' and o.status = 'active'
    order by m.created_at limit 1`;
  if (!rows[0]) throw new HttpError(403, 'NO_MEMBERSHIP', 'Seu usuário não está vinculado a uma organização.');
  return {
    user: { id: user.id, name: user.name, email: user.email, legacy: false },
    organization: { id: rows[0].organization_id, name: rows[0].organization_name },
    role: rows[0].role
  };
}

function can(ctx, permission) { return CAN[permission].includes(ctx.role); }

function permissions(ctx) {
  return Object.fromEntries(Object.keys(CAN).map((p) => [p, can(ctx, p)]));
}

module.exports = { context, can, permissions, HttpError, ROLES, CAN };
