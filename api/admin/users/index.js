const bcrypt = require('bcryptjs');
const { getSql } = require('../../../lib/db');
const { parseBody, json, method } = require('../../../lib/http');
const { normalizeEmail, randomToken, hashToken, resetExpiry } = require('../../../lib/security');
const { sendPasswordReset } = require('../../../lib/mailer');
const { getAdminContext, isAdminRole, canAssignRole } = require('../../../lib/admin');

const MESSAGE = 'Convite enviado. O usuário receberá um link para criar a própria senha.';

function requestHashes(req, email) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
  return { ipHash: hashToken(ip), userAgentHash: hashToken(String(req.headers['user-agent'] || '')), emailHash: hashToken(email) };
}

async function issueInvite(sql, req, user) {
  const rawToken = randomToken(32);
  const digest = hashToken(rawToken);
  const { ipHash, userAgentHash } = requestHashes(req, user.email);
  await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`;
  await sql`
    insert into password_reset_tokens (user_id, token_hash, expires_at, requested_ip_hash, user_agent_hash, created_at)
    values (${user.id}, decode(${digest}, 'hex'), ${resetExpiry()}, decode(${ipHash}, 'hex'), decode(${userAgentHash}, 'hex'), now())`;
  try {
    await sendPasswordReset({ to: user.email, token: rawToken, name: user.name });
  } catch (error) {
    await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and token_hash = decode(${digest}, 'hex') and used_at is null`;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return method(res, ['GET', 'POST']);
  try {
    const context = await getAdminContext(req);
    if (!context.membership || !isAdminRole(context.membership.role)) {
      return json(res, context.user ? 403 : 401, { error: { code: context.user ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: context.user ? 'Permissão administrativa necessária.' : 'Sessão necessária.' } });
    }
    const sql = getSql();
    const organizationId = context.membership.organization_id;
    if (req.method === 'GET') {
      const users = await sql`
        select u.id, u.email, u.name, u.status, u.created_at, u.updated_at,
               om.role, om.status as membership_status
        from organization_members om
        join users u on u.id = om.user_id
        where om.organization_id = ${organizationId}
        order by case om.role when 'owner' then 1 when 'admin' then 2 else 3 end, lower(u.name), lower(u.email)`;
      return json(res, 200, {
        organization: context.membership.organization_name,
        currentUser: { id: context.user.id, email: context.user.email, role: context.membership.role },
        users
      });
    }

    const body = parseBody(req);
    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim();
    const role = String(body.role || 'analyst').trim().toLowerCase();
    if (!email || !email.includes('@') || email.length > 320) return json(res, 400, { error: { code: 'INVALID_EMAIL', message: 'Informe um e-mail válido.' } });
    if (name.length < 2 || name.length > 180) return json(res, 400, { error: { code: 'INVALID_NAME', message: 'Informe um nome entre 2 e 180 caracteres.' } });
    if (!canAssignRole(context.membership.role, role)) return json(res, 403, { error: { code: 'ROLE_NOT_ALLOWED', message: 'Este papel não pode ser atribuído pelo seu nível atual.' } });
    const existing = await sql`
      select u.id, u.email, u.name, u.status, om.role, om.status as membership_status
      from users u
      left join organization_members om on om.user_id = u.id and om.organization_id = ${organizationId}
      where u.email_normalized = ${email}
      limit 1`;
    if (existing[0]) {
      const user = existing[0];
      if (user.membership_status && user.status === 'pending') {
        await sql`update users set name = ${name}, updated_at = now() where id = ${user.id}`;
        await sql`update organization_members set role = ${role}, status = 'invited', updated_at = now() where organization_id = ${organizationId} and user_id = ${user.id}`;
        await issueInvite(sql, req, { id: user.id, email: user.email, name });
        return json(res, 202, { message: MESSAGE, user: { id: user.id, email: user.email, name, role, status: 'pending' } });
      }
      return json(res, 409, { error: { code: 'USER_ALREADY_EXISTS', message: 'Já existe um usuário com este e-mail.' } });
    }

    const temporaryPassword = randomToken(32);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const inserted = await sql`
      insert into users (email, email_normalized, name, password_hash, status, email_verified_at)
      values (${email}, ${email}, ${name}, ${passwordHash}, 'pending', null)
      returning id, email, name, status`;
    const user = inserted[0];
    await sql`
      insert into organization_members (organization_id, user_id, role, status)
      values (${organizationId}, ${user.id}, ${role}, 'invited')`;
    await issueInvite(sql, req, user);
    return json(res, 201, { message: MESSAGE, user: { id: user.id, email: user.email, name: user.name, role, status: user.status } });
  } catch (error) {
    console.error('admin_users_error', error.name || 'Error');
    return json(res, 503, { error: { code: 'ADMIN_USERS_UNAVAILABLE', message: 'Não foi possível concluir a operação agora.' } });
  }
};
