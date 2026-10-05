const { redirect } = require('../lib/http');
const { cookieSession, revokeSession, currentUser } = require('../lib/auth');
const { clearSessionCookie } = require('../lib/security');
const { audit } = require('../lib/audit');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return redirect(res, '/login.html');
  let user = null;
  try { user = await currentUser(req); } catch { user = null; }
  try { await revokeSession(cookieSession(req)); } catch (error) { console.error('auth_logout_error', error.name || 'Error'); }
  if (user) await audit('auth.logout', { actorUserId: user.id || null, metadata: { method: user.legacy ? 'legacy' : 'database' } });
  return redirect(res, '/login.html?saiu=1', { 'Set-Cookie': clearSessionCookie() });
};
