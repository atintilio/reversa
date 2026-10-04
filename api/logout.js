const { redirect } = require('../lib/http');
const { cookieSession, revokeSession } = require('../lib/auth');
const { clearSessionCookie } = require('../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return redirect(res, '/login.html');
  try { await revokeSession(cookieSession(req)); } catch (error) { console.error('auth_logout_error', error.name || 'Error'); }
  return redirect(res, '/login.html?saiu=1', { 'Set-Cookie': clearSessionCookie() });
};
