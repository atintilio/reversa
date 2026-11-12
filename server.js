// Servidor próprio do Reversa para rodar fora da Vercel (VPS). Na Vercel nada disto é usado.
// Serve as páginas estáticas, aplica os cabeçalhos do vercel.json, o rewrite do host Gov,
// a guarda de login das páginas (lib/page-guard.js) e despacha /api/* para as funções existentes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const guard = require('./lib/page-guard');

const ROOT = __dirname;
const HOST_GOV = String(process.env.GOV_HOST || 'reversa-gov.argusprime.com.br').toLowerCase();
const MAX_BODY = 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
// Pastas e arquivos que nunca são servidos como estáticos (código de servidor, testes, configuração).
const BLOCKED_DIRS = new Set(['api', 'lib', 'db', 'tests', 'scripts', 'docs', 'coleta', 'schemas', 'deploy', 'node_modules']);
const BLOCKED_FILES = new Set(['server.js', 'middleware.js', 'package.json', 'package-lock.json', 'vercel.json']);
const SECURITY_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

function send(res, status, body = '', headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) { const e = new Error('BODY_TOO_LARGE'); e.status = 413; throw e; } chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

// Imita o que a Vercel entrega às funções: JSON e formulário já convertidos em objeto.
function parsedBody(raw, type) {
  if (!raw) return raw;
  if (/application\/json/i.test(type)) { try { return JSON.parse(raw); } catch { return raw; } }
  if (/application\/x-www-form-urlencoded/i.test(type)) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

function apiHandler(pathname) {
  if (pathname.startsWith('/api/v1/') || pathname === '/api/v1') return require('./api/v1/[...route].js');
  const rel = pathname.replace(/^\/+|\/+$/g, '');
  if (!/^api\/[a-z0-9\-/]+$/i.test(rel) || rel.startsWith('api/v1')) return null;
  const file = path.join(ROOT, `${rel}.js`);
  return fs.existsSync(file) ? require(file) : null;
}

function staticFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  const segs = p.split('/').filter(Boolean);
  if (!segs.length || segs.some((s) => s.startsWith('.') || s === '..')) return null;
  if (BLOCKED_DIRS.has(segs[0]) || (segs.length === 1 && BLOCKED_FILES.has(segs[0]))) return null;
  const file = path.join(ROOT, ...segs);
  if (!file.startsWith(ROOT + path.sep) || !MIME[path.extname(file).toLowerCase()]) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        const handler = apiHandler(pathname);
        if (!handler) return send(res, 404);
        const raw = await readBody(req);
        req.body = parsedBody(raw, String(req.headers['content-type'] || ''));
        req.query = Object.fromEntries(url.searchParams);
        const set = res.setHeader.bind(res);
        Object.entries(SECURITY_HEADERS).forEach(([k, v]) => set(k, v));
        return await handler(req, res);
      }

      if (!(await guard.allowed(pathname, req))) return send(res, 303, '', { Location: '/login.html', 'Cache-Control': 'no-store' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '', { Allow: 'GET, HEAD' });

      const host = String(req.headers.host || '').split(':')[0].toLowerCase();
      const target = pathname === '/' ? (host === HOST_GOV ? '/gov.html' : '/index.html') : pathname;
      const file = staticFile(target);
      if (!file) return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file).toLowerCase()], 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error('server_error', error.name || 'Error', error.message);
      if (!res.headersSent) send(res, error.status || 500, '');
      else res.end();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => console.log(`Reversa em http://${host}:${port}`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

module.exports = { createServer };
