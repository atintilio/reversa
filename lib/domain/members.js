const bcrypt = require('bcryptjs');
const { getSql } = require('../db');
const { normalizeEmail, randomToken, hashToken } = require('../security');
const { sendInvite } = require('../mailer');
const { audit } = require('../audit');
const { HttpError, ROLES } = require('../authz');

const INVITE_HOURS = 48;
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 320;

async function list(ctx) {
  const sql = getSql();
  const rows = await sql`
    select u.id, u.email, u.name, u.status as user_status, u.last_login_at, m.role, m.status as member_status, m.created_at
    from organization_members m join users u on u.id = m.user_id
    where m.organization_id = ${ctx.organization.id}
    order by lower(u.name), u.email`;
  return rows.map((r) => ({
    id: r.id, email: r.email, name: r.name, role: r.role, status: r.member_status === 'invited' ? 'invited' : r.member_status,
    lastLoginAt: r.last_login_at, createdAt: r.created_at, isYou: ctx.user.id === r.id
  }));
}

async function issueInvite(ctx, user) {
  const sql = getSql();
  const raw = randomToken(32);
  const digest = hashToken(raw);
  await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`;
  await sql`insert into password_reset_tokens (user_id, token_hash, expires_at, created_at)
            values (${user.id}, decode(${digest}, 'hex'), now() + make_interval(hours => ${INVITE_HOURS}), now())`;
  try {
    await sendInvite({ to: user.email, token: raw, name: user.name, inviterName: ctx.user.name, organizationName: ctx.organization.name });
    await audit('org.member.invite_sent', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'user', entityId: user.id });
    return { emailSent: true };
  } catch (error) {
    await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and token_hash = decode(${digest}, 'hex') and used_at is null`;
    console.error('invite_mail_error', error.name || 'Error');
    await audit('org.member.invite_failed', { outcome: 'failure', organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'user', entityId: user.id });
    return { emailSent: false };
  }
}

async function invite(ctx, body) {
  const sql = getSql();
  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim().slice(0, 180);
  const role = String(body.role || 'analyst');
  if (!emailValido(email)) throw new HttpError(400, 'INVALID_EMAIL', 'Informe um e-mail válido.');
  if (!name) throw new HttpError(400, 'INVALID_NAME', 'Informe o nome.');
  if (!ROLES.includes(role) || role === 'owner') throw new HttpError(400, 'INVALID_ROLE', 'Perfil inválido.');
  let user = (await sql`select id, email, name, status from users where email_normalized = ${email} limit 1`)[0];
  if (!user) {
    const unusable = await bcrypt.hash(randomToken(32), 12);
    user = (await sql`insert into users (email, email_normalized, name, password_hash, status)
                      values (${String(body.email).trim()}, ${email}, ${name}, ${unusable}, 'pending')
                      returning id, email, name, status`)[0];
  }
  if (user.status === 'blocked') throw new HttpError(409, 'USER_BLOCKED', 'Este usuário está bloqueado.');
  if (user.status === 'archived') {
    user = (await sql`update users set status = 'pending', name = ${name}, updated_at = now() where id = ${user.id} returning id, email, name, status`)[0];
  }
  const member = (await sql`select status from organization_members where organization_id = ${ctx.organization.id} and user_id = ${user.id}`)[0];
  if (member && member.status === 'active') throw new HttpError(409, 'ALREADY_MEMBER', 'Este usuário já faz parte da equipe.');
  const memberStatus = user.status === 'active' ? 'active' : 'invited';
  if (member) {
    await sql`update organization_members set role = ${role}, status = ${memberStatus}, updated_at = now() where organization_id = ${ctx.organization.id} and user_id = ${user.id}`;
  } else {
    await sql`insert into organization_members (organization_id, user_id, role, status) values (${ctx.organization.id}, ${user.id}, ${role}, ${memberStatus})`;
  }
  await audit('org.member.invited', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'user', entityId: user.id, metadata: { role, existing_account: user.status === 'active' } });
  // Conta já ativa (outra organização): só vincula; não precisa criar senha.
  const result = user.status === 'active' ? { emailSent: false, linkedExistingAccount: true } : await issueInvite(ctx, user);
  return { id: user.id, ...result };
}

async function target(ctx, userId) {
  const sql = getSql();
  const row = (await sql`select m.role, m.status, u.id, u.email, u.name, u.status as user_status from organization_members m join users u on u.id = m.user_id
                          where m.organization_id = ${ctx.organization.id} and m.user_id = ${userId}`)[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Usuário não encontrado nesta organização.');
  return row;
}

async function activeManagers(ctx) {
  const sql = getSql();
  return Number((await sql`select count(*)::int as n from organization_members m join users u on u.id = m.user_id
    where m.organization_id = ${ctx.organization.id} and m.status = 'active' and u.status = 'active' and m.role in ('owner','admin')`)[0].n);
}

async function update(ctx, userId, body) {
  const sql = getSql();
  const t = await target(ctx, userId);
  const role = body.role != null ? String(body.role) : null;
  const status = body.status != null ? String(body.status) : null;
  const name = body.name != null ? String(body.name).trim().slice(0, 180) : null;
  if (role && (!ROLES.includes(role) || (role === 'owner' && ctx.role !== 'owner'))) throw new HttpError(400, 'INVALID_ROLE', 'Perfil inválido.');
  if (status && !['active', 'suspended'].includes(status)) throw new HttpError(400, 'INVALID_STATUS', 'Situação inválida.');
  if (t.role === 'owner' && ctx.role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'Somente o proprietário altera outro proprietário.');
  const demoting = (role && !['owner', 'admin'].includes(role)) || status === 'suspended';
  if (ctx.user.id === t.id && demoting) throw new HttpError(409, 'SELF_LOCKOUT', 'Você não pode rebaixar nem suspender o seu próprio acesso.');
  if (demoting && ['owner', 'admin'].includes(t.role) && t.status === 'active' && (await activeManagers(ctx)) <= 1) throw new HttpError(409, 'LAST_ADMIN', 'É preciso manter ao menos um administrador ativo.');
  if (status === 'active' && t.status === 'invited') throw new HttpError(409, 'INVITE_PENDING', 'O convite ainda não foi aceito.');
  await sql`update organization_members set role = coalesce(${role}, role), status = coalesce(${status}, status), updated_at = now()
            where organization_id = ${ctx.organization.id} and user_id = ${t.id}`;
  if (name) await sql`update users set name = ${name}, updated_at = now() where id = ${t.id}`;
  if (status === 'suspended') await sql`update auth_sessions set revoked_at = now() where user_id = ${t.id} and revoked_at is null`;
  await audit('org.member.updated', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'user', entityId: t.id, metadata: { role, status } });
}

async function remove(ctx, userId) {
  const sql = getSql();
  const t = await target(ctx, userId);
  if (ctx.user.id === t.id) throw new HttpError(409, 'SELF_LOCKOUT', 'Você não pode remover o seu próprio acesso.');
  if (t.role === 'owner' && ctx.role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'Somente o proprietário remove outro proprietário.');
  if (['owner', 'admin'].includes(t.role) && t.status === 'active' && (await activeManagers(ctx)) <= 1) throw new HttpError(409, 'LAST_ADMIN', 'É preciso manter ao menos um administrador ativo.');
  await sql`delete from organization_members where organization_id = ${ctx.organization.id} and user_id = ${t.id}`;
  const others = Number((await sql`select count(*)::int as n from organization_members where user_id = ${t.id}`)[0].n);
  if (!others) {
    await sql`update users set status = 'archived', updated_at = now() where id = ${t.id}`;
    await sql`update password_reset_tokens set used_at = now() where user_id = ${t.id} and used_at is null`;
  }
  await sql`update auth_sessions set revoked_at = now() where user_id = ${t.id} and revoked_at is null`;
  await audit('org.member.removed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'user', entityId: t.id });
}

async function resend(ctx, userId) {
  const t = await target(ctx, userId);
  if (t.status !== 'invited' || t.user_status !== 'pending') throw new HttpError(409, 'NOT_PENDING', 'Este usuário já ativou o acesso. Ele pode usar "Esqueci minha senha".');
  return issueInvite(ctx, t);
}

module.exports = { list, invite, update, remove, resend, INVITE_HOURS };
