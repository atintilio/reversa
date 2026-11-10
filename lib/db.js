const { neon } = require('@neondatabase/serverless');

let cachedUrl = null;
let cachedSql = null;
let injected = null;

// Somente para testes automatizados: injeta um executor compatível com o tagged template do Neon.
function setSqlForTests(fn) { injected = fn; }

// Driver: URL da Neon (host *.neon.tech) usa o driver serverless, como sempre foi na Vercel.
// Qualquer outro host (ex.: Postgres na VPS) usa o driver Postgres comum. DB_DRIVER=neon|pg força a escolha.
function usePg(url) {
  const forced = String(process.env.DB_DRIVER || '').toLowerCase();
  if (forced === 'pg') return true;
  if (forced === 'neon') return false;
  try { return !/(^|\.)neon\.tech$/i.test(new URL(url).hostname); } catch { return false; }
}

function getSql() {
  if (injected) return injected;
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!cachedSql || cachedUrl !== url) {
    if (usePg(url)) {
      const postgres = require('postgres');
      // O código envia JSON como texto com cast (${JSON.stringify(x)}::jsonb), como o driver da Neon aceita.
      // Sem este ajuste o postgres.js codifica de novo e grava uma string em vez de um objeto.
      const jsonText = (x) => (typeof x === 'string' ? x : JSON.stringify(x));
      cachedSql = postgres(url, {
        max: 10, onnotice: () => {}, ssl: process.env.PGSSL === 'require' ? 'require' : false,
        types: {
          json: { to: 114, from: [114], serialize: jsonText, parse: JSON.parse },
          jsonb: { to: 3802, from: [3802], serialize: jsonText, parse: JSON.parse }
        }
      });
    } else {
      cachedSql = neon(url);
    }
    cachedUrl = url;
  }
  return cachedSql;
}

module.exports = { getSql, setSqlForTests, usePg };
