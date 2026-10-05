const { parseBody, redirect, method } = require('../lib/http');
const { authenticate, createSession, legacyCookie } = require('../lib/auth');
const { audit } = require('../lib/audit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return method(res, ['POST']);
  const body = parseBody(req);
  const identifier = body.usuario || body.email || '';
  const password = body.senha || body.password || '';
  let result;
  try {
    result = await authenticate(identifier, password);
  } catch (error) {
    console.error('auth_login_database_error', error.name || 'Error');
    result = { kind: 'unavailable' };
  }
  if (result.kind === 'database') {
    try {
      const cookie = await createSession(result.user.id);
      await audit('auth.login.succeeded', { actorUserId: result.user.id, entityType: 'user', entityId: result.user.id, metadata: { method: 'database' } });
      return redirect(res, '/', { 'Set-Cookie': cookie });
    } catch (error) {
      console.error('auth_login_session_error', error.name || 'Error');
      return redirect(res, '/login.html?erro=config');
    }
  }
  if (result.kind === 'legacy') {
    await audit('auth.login.succeeded', { metadata: { method: 'legacy' } });
    return redirect(res, '/', { 'Set-Cookie': `rv_sessao=${encodeURIComponent(legacyCookie(result.username))}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax` });
  }
  await audit('auth.login.failed', { outcome: 'failure', metadata: { reason: result.kind === 'unavailable' ? 'unavailable' : 'invalid_credentials' } });
  await new Promise((resolve) => setTimeout(resolve, 500));
  return redirect(res, result.kind === 'unavailable' ? '/login.html?erro=config' : '/login.html?erro=1');
};
