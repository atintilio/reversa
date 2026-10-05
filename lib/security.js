const crypto = require('node:crypto');

const COOKIE = 'rv_sessao';
const SESSION_HOURS = 12;
const RESET_MINUTES = 30;

// Sem fallback literal: em produção RESET_TOKEN_PEPPER e SESSION_SECRET são obrigatórios (Tech Spec §7 e §10).
function pepper() {
  const value = process.env.RESET_TOKEN_PEPPER || process.env.SESSION_SECRET;
  if (!value) throw new Error('SECRET_NOT_CONFIGURED');
  return value;
}

function legacySecret() {
  return process.env.REVERSA_SECRET || process.env.SESSION_SECRET || '';
}

// Compatibilidade legada (REVERSA_USERS) sob feature flag com data de desligamento (PRD §14 P0-5).
// LEGACY_AUTH_UNTIL: data ISO (AAAA-MM-DD) até a qual o fallback é aceito; "off" desliga imediatamente.
const LEGACY_DEFAULT_UNTIL = '2026-11-05';
function legacyAuthEnabled(now = new Date()) {
  const flag = String(process.env.LEGACY_AUTH_UNTIL || LEGACY_DEFAULT_UNTIL).trim().toLowerCase();
  if (flag === 'off' || flag === 'false' || flag === '0') return false;
  const until = new Date(`${flag}T23:59:59-03:00`);
  if (Number.isNaN(until.getTime()) || now > until) return false;
  return Boolean(process.env.REVERSA_USERS) && Boolean(legacySecret());
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
  const secret = legacySecret();
  if (!secret) throw new Error('SECRET_NOT_CONFIGURED');
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
  if (!legacyAuthEnabled()) return m;
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
  legacyAuthEnabled,
  LEGACY_DEFAULT_UNTIL,
  legacyCookie,
  legacyUsers,
  safeEqual,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  resetExpiry
};
