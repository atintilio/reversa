const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');

async function main() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('POSTGRES_URL ou DATABASE_URL não configurada');
  const catalogPath = path.join(__dirname, '..', 'schemas', 'opportunity_catalog_v1.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (catalog.opportunities.length !== 60) throw new Error('Catálogo deve conter 60 oportunidades');
  const sql = postgres(url, { max: 1, ssl: 'require' });
  for (const item of catalog.opportunities) {
    await sql`
      insert into opportunity_catalog (opportunity_key, name, category, risk_level, catalog_status, implementation_status, definition, source_refs)
      values (${item.id}, ${item.name}, ${item.category}, ${item.risk_level}, ${item.catalog_status}, ${item.implementation_status}, ${sql.json(item)}, ${sql.json([{ source: catalog.source, version: catalog.version }])})
      on conflict (opportunity_key) do update set
        name = excluded.name,
        category = excluded.category,
        risk_level = excluded.risk_level,
        catalog_status = excluded.catalog_status,
        implementation_status = excluded.implementation_status,
        definition = excluded.definition,
        source_refs = excluded.source_refs,
        updated_at = now()`;
  }
  await sql.end({ timeout: 5 });
  console.log(`Catálogo semeado: ${catalog.opportunities.length} oportunidades`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
