const { parseBody, redirect, method } = require('../lib/http');
const { authenticate, createSession, legacyCookie } = require('../lib/auth');

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
      return redirect(res, '/', { 'Set-Cookie': cookie });
    } catch (error) {
      console.error('auth_login_session_error', error.name || 'Error');
      return redirect(res, '/login.html?erro=config');
    }
  }
  if (result.kind === 'legacy') return redirect(res, '/', { 'Set-Cookie': `rv_sessao=${encodeURIComponent(legacyCookie(result.username))}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax` });
  await new Promise((resolve) => setTimeout(resolve, 500));
  return redirect(res, result.kind === 'unavailable' ? '/login.html?erro=config' : '/login.html?erro=1');
};
