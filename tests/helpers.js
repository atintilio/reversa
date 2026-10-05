// Infraestrutura de testes de integração: PostgreSQL em memória (PGlite) com a migration real,
// executor compatível com o tagged template do Neon e chamadas diretas aos handlers das funções.
const fs = require('node:fs');
const path = require('node:path');
const { splitStatements } = require('../scripts/migrate');

const ROOT = path.join(__dirname, '..');

async function createDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const files = fs.readdirSync(path.join(ROOT, 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    for (const statement of splitStatements(fs.readFileSync(path.join(ROOT, 'db', 'migrations', file), 'utf8'))) {
      if (/^(\s*--[^\n]*\n)*\s*create extension/i.test(statement)) continue; // gen_random_uuid é nativo no PGlite
      await db.exec(statement);
    }
  }
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
    const result = await db.query(text, values.map((v) => (v instanceof Date ? v.toISOString() : v)));
    return result.rows;
  };
  return { db, sql };
}

function freshRequire(modulePath) {
  return require(path.join(ROOT, modulePath));
}

function call(handler, { method = 'GET', body, query = {}, cookie = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(b) { this.body = b === undefined ? '' : String(b); resolve(this); }
    };
    const req = {
      method,
      body,
      query,
      headers: { cookie, 'content-type': 'application/json', 'user-agent': 'node-test', 'x-forwarded-for': headers.ip || '10.0.0.1', ...headers },
      socket: {}
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function cookieFrom(res) {
  const raw = String(res.headers['set-cookie'] || '');
  return raw.split(';')[0];
}

module.exports = { createDb, freshRequire, call, cookieFrom, ROOT };
