const { getSql } = require('../../../lib/db');
const { parseBody, json, method } = require('../../../lib/http');
const { normalizeEmail, randomToken, hashToken, resetExpiry } = require('../../../lib/security');
const { sendPasswordReset } = require('../../../lib/mailer');
const { hit } = require('../../../lib/rate-limit');
const { audit } = require('../../../lib/audit');

const MESSAGE = 'Se houver uma conta associada a este e-mail, enviaremos instruções para redefinir sua senha.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return method(res, ['POST']);
  const body = parseBody(req);
  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@') || email.length > 320) return json(res, 202, { message: MESSAGE });
  try {
    const sql = getSql();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const ipHash = hashToken(ip || 'unknown');
    const userAgentHash = hashToken(String(req.headers['user-agent'] || ''));
    const limitedByIp = await hit(sql, `reset:ip:${ipHash}`, 8);
    const limitedByEmail = await hit(sql, `reset:email:${hashToken(email)}`, 4);
    if (limitedByIp || limitedByEmail) {
      await audit('auth.password_reset.rate_limited', { outcome: 'denied', metadata: { bucket: limitedByIp ? 'ip' : 'email' } });
      return json(res, 202, { message: MESSAGE });
    }
    const users = await sql`select id, email, name from users where email_normalized = ${email} and status = 'active' limit 1`;
    const user = users[0];
    await audit('auth.password_reset.requested', { actorUserId: user ? user.id : null, metadata: { account_found: Boolean(user) } });
    if (user) {
      const rawToken = randomToken(32);
      const digest = hashToken(rawToken);
      await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`;
      await sql`
        insert into password_reset_tokens (user_id, token_hash, expires_at, requested_ip_hash, user_agent_hash, created_at)
        values (${user.id}, decode(${digest}, 'hex'), ${resetExpiry()}, decode(${ipHash}, 'hex'), decode(${userAgentHash}, 'hex'), now())`;
      try {
        await sendPasswordReset({ to: user.email, token: rawToken, name: user.name });
        await audit('auth.password_reset.email_accepted', { actorUserId: user.id, entityType: 'user', entityId: user.id });
      } catch (mailError) {
        await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and token_hash = decode(${digest}, 'hex') and used_at is null`;
        console.error('auth_reset_mail_error', mailError.name || 'Error');
        await audit('auth.password_reset.email_failed', { outcome: 'failure', actorUserId: user.id, entityType: 'user', entityId: user.id, metadata: { error: String(mailError.message || 'Error').slice(0, 40) } });
      }
    }
  } catch (error) {
    console.error('auth_reset_request_error', error.name || 'Error');
  }
  return json(res, 202, { message: MESSAGE });
};
