const bcrypt = require('bcryptjs');
const { getSql } = require('../../../lib/db');
const { parseBody, json, method } = require('../../../lib/http');
const { hashToken } = require('../../../lib/security');
const { audit } = require('../../../lib/audit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return method(res, ['POST']);
  const body = parseBody(req);
  const token = String(body.token || '');
  const password = String(body.password || '');
  const confirmation = String(body.passwordConfirmation || '');
  if (password.length < 12) return json(res, 400, { error: { code: 'PASSWORD_POLICY_FAILED', message: 'Use uma senha com pelo menos 12 caracteres.' } });
  if (password !== confirmation) return json(res, 400, { error: { code: 'PASSWORD_MISMATCH', message: 'As senhas precisam coincidir.' } });
  if (token.length < 20) return json(res, 400, { error: { code: 'RESET_TOKEN_INVALID', message: 'O link de recuperação é inválido.' } });
  try {
    const sql = getSql();
    const digest = hashToken(token);
    // Evita trabalho bcrypt para tokens inventados; a validade é rechecada no consumo atômico.
    const valid = await sql`select id from password_reset_tokens
      where token_hash = decode(${digest}, 'hex') and used_at is null and expires_at > now() limit 1`;
    if (!valid[0]) {
      await audit('auth.password_reset.completed', { outcome: 'failure', metadata: { reason: 'token_expired_or_used' } });
      return json(res, 410, { error: { code: 'RESET_TOKEN_EXPIRED', message: 'O link expirou ou já foi utilizado. Solicite um novo link.' } });
    }
    // Um único comando PostgreSQL: qualquer falha desfaz todas as alterações.
    const passwordHash = await bcrypt.hash(password, 12);
    const claimed = await sql`
      with claimed as (
      update password_reset_tokens
      set used_at = now()
      where token_hash = decode(${digest}, 'hex')
        and used_at is null
        and expires_at > now()
      returning user_id
      ), changed_user as (
        update users set password_hash = ${passwordHash}, session_version = session_version + 1,
          status = case when status = 'pending' then 'active' else status end,
          email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
        where id in (select user_id from claimed) returning id
      ), activated_members as (
        update organization_members set status = 'active', updated_at = now()
        where user_id in (select id from changed_user) and status = 'invited' returning user_id
      ), revoked_sessions as (
        update auth_sessions set revoked_at = now()
        where user_id in (select id from changed_user) and revoked_at is null returning user_id
      ) select id as user_id from changed_user`;
    if (!claimed[0]) {
      await audit('auth.password_reset.completed', { outcome: 'failure', metadata: { reason: 'token_expired_or_used' } });
      return json(res, 410, { error: { code: 'RESET_TOKEN_EXPIRED', message: 'O link expirou ou já foi utilizado. Solicite um novo link.' } });
    }
    await audit('auth.password_reset.completed', { actorUserId: claimed[0].user_id, entityType: 'user', entityId: claimed[0].user_id });
    res.statusCode = 204;
    return res.end();
  } catch (error) {
    console.error('auth_reset_consume_error', error.name || 'Error');
    return json(res, 503, { error: { code: 'RESET_UNAVAILABLE', message: 'Não foi possível concluir agora. Solicite um novo link mais tarde.' } });
  }
};
