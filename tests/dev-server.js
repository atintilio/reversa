// Servidor local para conferência visual (não faz parte do deploy): estáticos + funções /api com PGlite.
// Uso: node tests/dev-server.js  → http://localhost:8787  (usuário de teste: admin@teste.local / Senha-forte-123)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { createDb, ROOT } = require('./helpers');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
process.env.RESET_TOKEN_PEPPER = process.env.RESET_TOKEN_PEPPER || 'dev-pepper';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

(async () => {
  const { sql } = await createDb();
  require('../lib/db').setSqlForTests(sql);
  const org = (await sql`select id from organizations limit 1`)[0].id;
  const u = (await sql`insert into users (email, email_normalized, name, password_hash) values ('admin@teste.local','admin@teste.local','Admin Teste', ${await bcrypt.hash('Senha-forte-123', 4)}) returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role) values (${org}, ${u.id}, 'admin')`;
  const rotas = {
    '/api/login': require('../api/login'), '/api/logout': require('../api/logout'),
    '/api/auth/password/forgot': require('../api/auth/password/forgot'), '/api/auth/password/reset': require('../api/auth/password/reset')
  };
  const v1 = require('../api/v1/[...route]');
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const set = res.setHeader.bind(res);
    res.setHeader = (k, v) => set(k, k.toLowerCase() === 'set-cookie' ? String(v).replace('; Secure', '') : v);
    if (url.pathname.startsWith('/api/')) {
      let raw = ''; for await (const c of req) raw += c;
      req.body = raw; req.query = Object.fromEntries(url.searchParams);
      const h = url.pathname.startsWith('/api/v1/') ? v1 : rotas[url.pathname];
      if (!h) { res.statusCode = 404; return res.end(); }
      return h(req, res);
    }
    let f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(8787, () => console.log('http://localhost:8787'));
})();
