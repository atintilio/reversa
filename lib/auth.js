const bcrypt = require('bcryptjs');
const { getSql } = require('./db');
const {
  normalizeEmail, randomToken, hashToken, hashSession,
  legacyCookie, legacyUsers, safeEqual, parseCookies, COOKIE, sessionCookie, signLegacy
} = require('./security');

async function findDbUser(identifier) {
  const normalized = normalizeEmail(identifier);
  try {
    const sql = getSql();
    const rows = await sql`
      select id, email, email_normalized, name, password_hash, status
      from users
      where status = 'active'
        and (email_normalized = ${normalized} or lower(coalesce(username, '')) = ${normalized})
      limit 1`;
    return { available: true, user: rows[0] || null };
  } catch (error) {
    // Compatibilidade durante a primeira migration, quando a coluna username ainda não existir.
    if (String(error.message || '').includes('username')) {
      const rows = await sql`
        select id, email, email_normalized, name, password_hash, status
        from users
        where status = 'active' and email_normalized = ${normalized}
        limit 1`;
      return { available: true, user: rows[0] || null };
    }
    return { available: false, user: null, error };
  }
}

async function authenticate(identifier, password) {
  const result = await findDbUser(identifier);
  if (result.available && result.user) {
    const valid = await bcrypt.compare(String(password || ''), result.user.password_hash);
    return valid ? { kind: 'database', user: result.user } : { kind: 'invalid' };
  }
  const username = String(identifier || '').trim().toLowerCase();
  const users = legacyUsers();
  if (users.size && users.has(username) && safeEqual(users.get(username), String(password || ''))) {
    return { kind: 'legacy', username };
  }
  return result.available ? { kind: 'invalid' } : { kind: 'unavailable' };
}

async function createSession(userId) {
  const sql = getSql();
  const raw = `s1.${randomToken(32)}`;
  const digest = hashSession(raw);
  await sql`
    insert into auth_sessions (user_id, session_hash, expires_at, created_at, last_seen_at)
    values (${userId}, decode(${digest}, 'hex'), now() + interval '12 hours', now(), now())`;
  return sessionCookie(raw);
}

async function revokeSession(raw) {
  if (!raw || !String(raw).startsWith('s1.')) return;
  const sql = getSql();
  await sql`update auth_sessions set revoked_at = now() where session_hash = decode(${hashSession(raw)}, 'hex') and revoked_at is null`;
}

function cookieSession(req) {
  return parseCookies(req.headers.cookie || '')[COOKIE] || null;
}

async function currentUser(req) {
  const raw = cookieSession(req);
  if (!raw) return null;
  if (raw.startsWith('s1.')) {
    try {
      const sql = getSql();
      const rows = await sql`
        select u.id, u.email, u.name, u.status
        from auth_sessions s join users u on u.id = s.user_id
        where s.session_hash = decode(${hashSession(raw)}, 'hex')
          and s.revoked_at is null and s.expires_at > now() and u.status = 'active'
        limit 1`;
      return rows[0] || null;
    } catch { return null; }
  }
  const last = raw.lastIndexOf('~');
  const previous = raw.lastIndexOf('~', last - 1);
  if (last < 0 || previous < 0) return null;
  const username = raw.slice(0, previous).toLowerCase();
  const expires = raw.slice(previous + 1, last);
  const signature = raw.slice(last + 1);
  if (!(Number(expires) > Date.now()) || !legacyUsers().has(username) || !safeEqual(signature, signLegacy(`${username}~${expires}`))) return null;
  return { id: null, username, name: username, status: 'active', legacy: true };
}

module.exports = { authenticate, findDbUser, createSession, revokeSession, currentUser, cookieSession, legacyCookie };
