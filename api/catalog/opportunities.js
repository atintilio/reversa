const fs = require('node:fs');
const path = require('node:path');
const { getSql } = require('../../lib/db');
const { currentUser } = require('../../lib/auth');
const { json, method } = require('../../lib/http');

const fallback = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/opportunity_catalog_v1.json'), 'utf8'));

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return method(res, ['GET']);
  const user = await currentUser(req);
  if (!user) return json(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'Sessão necessária.' } });
  const query = String(req.query?.q || '').trim().toLowerCase();
  const risk = String(req.query?.risk || '').trim().toLowerCase();
  try {
    const sql = getSql();
    const rows = await sql`
      select opportunity_key as id, name, category, risk_level, catalog_status, implementation_status, definition
      from opportunity_catalog
      where (${query} = '' or lower(name) like ${`%${query}%`} or lower(opportunity_key) = ${query})
        and (${risk} = '' or risk_level = ${risk})
      order by opportunity_key`;
    return json(res, 200, { version: 'database', count: rows.length, opportunities: rows });
  } catch (error) {
    console.error('catalog_read_fallback', error.name || 'Error');
    const opportunities = fallback.opportunities.filter((item) => (!query || item.name.toLowerCase().includes(query) || item.id.toLowerCase() === query) && (!risk || item.risk_level === risk));
    return json(res, 200, { version: fallback.version, count: opportunities.length, opportunities });
  }
};
