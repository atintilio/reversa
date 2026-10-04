const { getSql } = require('../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  const checks = { runtime: true, database: false, mail: Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && (process.env.MAIL_FROM || process.env.EMAIL_FROM)) };
  try { await getSql()`select 1 as ok`; checks.database = true; } catch (error) { console.error('health_database_error', error.name || 'Error'); }
  const ok = checks.runtime && checks.database;
  res.statusCode = ok ? 200 : 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ status: ok ? 'ok' : 'degraded', checks }));
};
