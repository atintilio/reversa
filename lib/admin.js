const { getSql } = require('./db');
const { currentUser } = require('./auth');

const INVITE_ROLES = new Set(['admin', 'analyst', 'viewer', 'support']);
const ACTIVE_ROLES = new Set(['owner', 'admin', 'analyst', 'viewer', 'support']);

async function getAdminContext(req) {
  const user = await currentUser(req);
  if (!user || !user.id) return { user: null, membership: null };
  const sql = getSql();
  const rows = await sql`
    select om.organization_id, om.role, om.status as membership_status, o.name as organization_name
    from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = ${user.id}
      and om.status = 'active'
      and o.status = 'active'
    order by case om.role when 'owner' then 1 when 'admin' then 2 else 3 end
    limit 1`;
  return { user, membership: rows[0] || null };
}

function isAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

function canManageTarget(actorRole, targetRole) {
  if (actorRole === 'owner') return ACTIVE_ROLES.has(targetRole) && targetRole !== 'owner';
  if (actorRole === 'admin') return ['analyst', 'viewer', 'support'].includes(targetRole);
  return false;
}

function canAssignRole(actorRole, targetRole) {
  if (!INVITE_ROLES.has(targetRole)) return false;
  if (actorRole === 'owner') return true;
  return actorRole === 'admin' && ['analyst', 'viewer', 'support'].includes(targetRole);
}

module.exports = { getAdminContext, isAdminRole, canManageTarget, canAssignRole, INVITE_ROLES };
