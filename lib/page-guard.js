// Guarda de páginas para rodar fora da Vercel (server.js). Reproduz middleware.js, que continua sendo
// o guardião na Vercel. Se alterar um, altere o outro: tests/server.test.js confere que o MATCHER é idêntico.
const { getSql } = require('./db');

const COOKIE = 'rv_sessao';
const enc = new TextEncoder();
// Mesma expressão do middleware.js (config.matcher).
const MATCHER = '/((?!login\\.html|reset-password\\.html|aprovacao\\.html|aprovacao\\.js|validacao-contador\\.html|validacao-contador\\.js|assets/reversa-r\\.png|assets/logo-wordmark\\.png|assets/logo-login\\.png|assets/argus-prime-logo\\.png|assets/argus-prime-monograma\\.png|assets/favicon\\.png|robots\\.txt|api/|favicon\\.ico).*)';
// Vercel: o matcher é uma expressão sobre o caminho inteiro.
const NEEDS_AUTH = new RegExp('^' + MATCHER + '$');

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie inválido */ } }
  });
  return out;
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(value))));
  return Array.from(bytes).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function dbSessionValid(token) {
  if (!token || !token.startsWith('s1.')) return false;
  try {
    const digest = await sha256Hex(token);
    const rows = await getSql()`
      select s.id
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.session_hash = decode(${digest}, 'hex')
        and s.revoked_at is null
        and s.expires_at > now()
        and coalesce(s.last_seen_at, s.created_at) > now() - interval '15 minutes'
        and u.status = 'active'
      limit 1`;
    return rows.length > 0;
  } catch (error) {
    console.error('page_guard_database_error', error.name || 'Error');
    return false;
  }
}

function legacyEnabled() {
  const flag = String(process.env.LEGACY_AUTH_UNTIL || 'off').trim().toLowerCase();
  if (flag === 'off' || flag === 'false' || flag === '0') return false;
  const until = new Date(`${flag}T23:59:59-03:00`);
  if (Number.isNaN(until.getTime()) || Date.now() > until.getTime()) return false;
  return Boolean(process.env.REVERSA_USERS) && Boolean(process.env.REVERSA_SECRET || process.env.SESSION_SECRET);
}

async function legacyKey() {
  const users = process.env.REVERSA_USERS || '';
  const secret = process.env.REVERSA_SECRET || process.env.SESSION_SECRET;
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${users}|${secret}`));
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function legacySign(value) {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await legacyKey(), enc.encode(value)));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function legacySessionValid(token) {
  if (!token || token.startsWith('s1.') || !legacyEnabled()) return false;
  const last = token.lastIndexOf('~');
  const previous = token.lastIndexOf('~', last - 1);
  if (last < 0 || previous < 0) return false;
  const username = token.slice(0, previous);
  const expires = token.slice(previous + 1, last);
  const signature = token.slice(last + 1);
  if (!username || !(Number(expires) > Date.now())) return false;
  return signature === await legacySign(`${username}~${expires}`);
}

// true = pode seguir; false = redirecionar ao login.
async function allowed(pathname, req) {
  if (!NEEDS_AUTH.test(pathname)) return true;
  const token = cookies(req)[COOKIE];
  return (await dbSessionValid(token)) || (await legacySessionValid(token));
}

module.exports = { allowed, MATCHER };
