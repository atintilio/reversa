const { getSql } = require('../../../lib/db');
const { parseBody, json, method } = require('../../../lib/http');
const { getAdminContext, isAdminRole, canManageTarget, canAssignRole } = require('../../../lib/admin');

function idFromRequest(req) {
  return String(req.query?.id || req.url?.split('?')[0].split('/').filter(Boolean).pop() || '').trim();
}

module.exports = async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) return method(res, ['PATCH', 'DELETE']);
  try {
    const context = await getAdminContext(req);
    if (!context.membership || !isAdminRole(context.membership.role)) {
      return json(res, context.user ? 403 : 401, { error: { code: context.user ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: context.user ? 'Permissão administrativa necessária.' : 'Sessão necessária.' } });
    }
    const targetId = idFromRequest(req);
    if (!targetId || targetId === context.user.id) return json(res, 400, { error: { code: 'INVALID_TARGET', message: 'Usuário alvo inválido.' } });
    const sql = getSql();
    const organizationId = context.membership.organization_id;
    const rows = await sql`
      select u.id, u.email, u.name, u.status, om.role, om.status as membership_status
      from organization_members om join users u on u.id = om.user_id
      where om.organization_id = ${organizationId} and u.id = ${targetId}
      limit 1`;
    const target = rows[0];
    if (!target) return json(res, 404, { error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado nesta organização.' } });
    if (!canManageTarget(context.membership.role, target.role)) return json(res, 403, { error: { code: 'TARGET_NOT_MANAGEABLE', message: 'Seu papel não permite alterar este usuário.' } });

    if (req.method === 'DELETE') {
      await sql`update users set status = 'blocked', updated_at = now() where id = ${target.id}`;
      await sql`update organization_members set status = 'suspended', updated_at = now() where organization_id = ${organizationId} and user_id = ${target.id}`;
      await sql`update auth_sessions set revoked_at = now() where user_id = ${target.id} and revoked_at is null`;
      return res.end();
    }

    const body = parseBody(req);
    const name = body.name === undefined ? target.name : String(body.name || '').trim();
    const role = body.role === undefined ? target.role : String(body.role || '').trim().toLowerCase();
    const status = body.status === undefined ? target.status : String(body.status || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 180) return json(res, 400, { error: { code: 'INVALID_NAME', message: 'Informe um nome entre 2 e 180 caracteres.' } });
    if (role === 'owner' || !canAssignRole(context.membership.role, role)) return json(res, 403, { error: { code: 'ROLE_NOT_ALLOWED', message: 'Este papel não pode ser atribuído nesta operação.' } });
    if (!['active', 'blocked', 'pending'].includes(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: 'Status inválido.' } });
    const memberStatus = status === 'active' ? 'active' : status === 'pending' ? 'invited' : 'suspended';
    await sql`update users set name = ${name}, status = ${status}, updated_at = now() where id = ${target.id}`;
    await sql`update organization_members set role = ${role}, status = ${memberStatus}, updated_at = now() where organization_id = ${organizationId} and user_id = ${target.id}`;
    if (status !== 'active') await sql`update auth_sessions set revoked_at = now() where user_id = ${target.id} and revoked_at is null`;
    return json(res, 200, { user: { id: target.id, email: target.email, name, role, status, membership_status: memberStatus } });
  } catch (error) {
    console.error('admin_user_update_error', error.name || 'Error');
    return json(res, 503, { error: { code: 'ADMIN_USER_UPDATE_UNAVAILABLE', message: 'Não foi possível concluir a operação agora.' } });
  }
};
