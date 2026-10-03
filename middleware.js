// Reversa Tax — controle de acesso (Vercel Routing Middleware).
// Usuários e senhas ficam na variável de ambiente REVERSA_USERS, no formato:
//   andre:senha-do-andre;maria:senha-da-maria
// A sessão é um cookie assinado (HMAC-SHA256) válido por 12 horas.
// Trocar qualquer senha em REVERSA_USERS derruba todas as sessões abertas.
export const config = { matcher: '/((?!login\\.html|robots\\.txt).*)' };

const COOKIE = 'rv_sessao';
const HORAS = 12;
const enc = new TextEncoder();

function usuarios() {
  const m = new Map();
  (process.env.REVERSA_USERS || '').split(/[;\n]/).forEach((par) => {
    const i = par.indexOf(':');
    if (i > 0) m.set(par.slice(0, i).trim().toLowerCase(), par.slice(i + 1).trim());
  });
  return m;
}
async function chave() {
  const base = (process.env.REVERSA_USERS || '') + '|' + (process.env.REVERSA_SECRET || 'reversa-tax');
  const h = await crypto.subtle.digest('SHA-256', enc.encode(base));
  return crypto.subtle.importKey('raw', h, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function assinar(txt) {
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', await chave(), enc.encode(txt)));
  let b = ''; for (const x of s) b += String.fromCharCode(x);
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function lerCookie(req, nome) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function sessaoValida(tok) {
  if (!tok) return false;
  const a = tok.lastIndexOf('~'), b = tok.lastIndexOf('~', a - 1);
  if (a < 0 || b < 0) return false;
  const u = tok.slice(0, b), exp = tok.slice(b + 1, a), sig = tok.slice(a + 1);
  if (!(Number(exp) > Date.now()) || !usuarios().has(u)) return false;
  return igual(await assinar(u + '~' + exp), sig);
}
function redirecionar(destino, cookie) {
  const h = new Headers({ Location: destino, 'Cache-Control': 'no-store' });
  if (cookie) h.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers: h });
}

export default async function middleware(req) {
  const url = new URL(req.url);
  if (url.pathname === '/api/logout') {
    return redirecionar('/login.html?saiu=1', COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  }
  if (url.pathname === '/api/login') {
    if (req.method !== 'POST') return redirecionar('/login.html');
    const lista = usuarios();
    if (!lista.size) return redirecionar('/login.html?erro=config');
    const form = await req.formData();
    const u = String(form.get('usuario') || '').trim().toLowerCase();
    const p = String(form.get('senha') || '');
    if (!(lista.has(u) && igual(lista.get(u), p))) {
      await new Promise((r) => setTimeout(r, 700));
      return redirecionar('/login.html?erro=1');
    }
    const exp = String(Date.now() + HORAS * 3600e3);
    const tok = u + '~' + exp + '~' + (await assinar(u + '~' + exp));
    return redirecionar('/', COOKIE + '=' + encodeURIComponent(tok) + '; Path=/; Max-Age=' + HORAS * 3600 + '; HttpOnly; Secure; SameSite=Lax');
  }
  if (await sessaoValida(lerCookie(req, COOKIE))) return; // sessão válida: segue para a página
  return redirecionar('/login.html');
}
