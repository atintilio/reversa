const { neon } = require('@neondatabase/serverless');

let cachedUrl = null;
let cachedSql = null;
let injected = null;

// Somente para testes automatizados: injeta um executor compatível com o tagged template do Neon.
function setSqlForTests(fn) { injected = fn; }

function getSql() {
  if (injected) return injected;
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = neon(url);
    cachedUrl = url;
  }
  return cachedSql;
}

module.exports = { getSql, setSqlForTests };
