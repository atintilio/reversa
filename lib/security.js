const crypto = require('node:crypto');

const COOKIE = 'rv_sessao';
const SESSION_HOURS = 12;
const RESET_MINUTES = 30;

function pepper() {
  return process.env.RESET_TOKEN_PEPPER || process.env.SESSION_SECRET || process.env.REVERSA_SECRET || 'reversa-tax';
}

function normalizeEmail(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(value) {
  return crypto.createHmac('sha256', pepper()).update(String(value)).digest('hex');
}

function hashSession(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function signLegacy(value) {
  const secret = process.env.REVERSA_SECRET || 'reversa-tax';
  const key = crypto.createHash('sha256').update(`${process.env.REVERSA_USERS || ''}|${secret}`).digest();
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

function legacyCookie(username) {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  const payload = `${username}~${exp}`;
  return `${payload}~${signLegacy(payload)}`;
}

function legacyUsers() {
  const m = new Map();
  String(process.env.REVERSA_USERS || '').split(/[;\n]/).forEach((pair) => {
    const i = pair.indexOf(':');
    if (i > 0) m.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim());
  });
  return m;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i <= 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function sessionCookie(raw) {
  return `${COOKIE}=${encodeURIComponent(raw)}; Path=/; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function resetExpiry() {
  return new Date(Date.now() + RESET_MINUTES * 60e3);
}

module.exports = {
  COOKIE,
  SESSION_HOURS,
  RESET_MINUTES,
  normalizeEmail,
  randomToken,
  hashToken,
  hashSession,
  signLegacy,
  legacyCookie,
  legacyUsers,
  safeEqual,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  resetExpiry
};
