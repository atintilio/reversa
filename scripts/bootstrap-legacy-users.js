const bcrypt = require('bcryptjs');
const postgres = require('postgres');

function parseUsers(raw) {
  const out = [];
  String(raw || '').split(/[;\n]/).forEach((pair) => {
    const i = pair.indexOf(':');
    if (i > 0) out.push({ username: pair.slice(0, i).trim(), password: pair.slice(i + 1).trim() });
  });
  return out;
}

async function main() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('POSTGRES_URL ou DATABASE_URL não configurada');
  const emails = JSON.parse(process.env.REVERSA_USER_EMAILS || '{}');
  const users = parseUsers(process.env.REVERSA_USERS);
  if (!users.length) throw new Error('REVERSA_USERS não contém usuários legados');
  const sql = postgres(url, { max: 1, ssl: 'require' });
  let count = 0;
  for (const legacy of users) {
    const email = String(emails[legacy.username] || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      console.warn(`Ignorado ${legacy.username}: inclua um e-mail em REVERSA_USER_EMAILS`);
      continue;
    }
    const hash = await bcrypt.hash(legacy.password, 12);
    await sql`
      insert into users (email, email_normalized, username, name, password_hash, status, email_verified_at)
      values (${email}, ${email}, ${legacy.username}, ${legacy.username}, ${hash}, 'active', now())
      on conflict (email_normalized) do update set
        username = excluded.username,
        password_hash = excluded.password_hash,
        status = 'active',
        updated_at = now()`;
    count += 1;
  }
  await sql.end({ timeout: 5 });
  console.log(`Usuários migrados: ${count}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
