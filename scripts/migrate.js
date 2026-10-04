const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');

async function main() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('POSTGRES_URL ou DATABASE_URL não configurada');
  const sql = postgres(url, { max: 1, ssl: 'require' });
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const statements = content.split(/;\s*(?=\n|$)/).map((x) => x.trim()).filter(Boolean);
    for (const statement of statements) {
      process.stdout.write(`${file}: ${statement.slice(0, 58).replace(/\s+/g, ' ')}…\n`);
      await sql.unsafe(statement);
    }
  }
  await sql.end({ timeout: 5 });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
