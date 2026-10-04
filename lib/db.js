const { neon } = require('@neondatabase/serverless');

let cachedUrl = null;
let cachedSql = null;

function getSql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = neon(url);
    cachedUrl = url;
  }
  return cachedSql;
}

module.exports = { getSql };
