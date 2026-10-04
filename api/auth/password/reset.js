const bcrypt = require('bcryptjs');
const { getSql } = require('../../../lib/db');
const { parseBody, json, method } = require('../../../lib/http');
const { hashToken } = require('../../../lib/security');

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
    const claimed = await sql`
      update password_reset_tokens
      set used_at = now()
      where token_hash = decode(${digest}, 'hex')
        and used_at is null
        and expires_at > now()
      returning user_id`;
    if (!claimed[0]) return json(res, 410, { error: { code: 'RESET_TOKEN_EXPIRED', message: 'O link expirou ou já foi utilizado. Solicite um novo link.' } });
    const passwordHash = await bcrypt.hash(password, 12);
    await sql`update users set password_hash = ${passwordHash}, session_version = session_version + 1, updated_at = now() where id = ${claimed[0].user_id}`;
    await sql`update auth_sessions set revoked_at = now() where user_id = ${claimed[0].user_id} and revoked_at is null`;
    res.statusCode = 204;
    return res.end();
  } catch (error) {
    console.error('auth_reset_consume_error', error.name || 'Error');
    return json(res, 503, { error: { code: 'RESET_UNAVAILABLE', message: 'Não foi possível concluir agora. Solicite um novo link mais tarde.' } });
  }
};
