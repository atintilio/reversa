const bcrypt = require('bcryptjs');
const postgres = require('postgres');
const crypto = require('node:crypto');

function normalize(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

async function main() {
  const email = normalize(process.env.INITIAL_OWNER_EMAIL);
  if (!email) {
    console.log('First owner bootstrap skipped: INITIAL_OWNER_EMAIL ausente.');
    return;
  }
  if (!email.includes('@') || email.length > 320) throw new Error('INITIAL_OWNER_EMAIL inválido');
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('POSTGRES_URL ou DATABASE_URL não configurada');
  const name = String(process.env.INITIAL_OWNER_NAME || 'Administrador Argus Prime').trim().slice(0, 180);
  const organizationName = String(process.env.INITIAL_OWNER_ORGANIZATION || 'Argus Prime').trim().slice(0, 180);
  const sql = postgres(url, { max: 1, ssl: 'require' });
  try {
    const existing = await sql`select id from users where email_normalized = ${email} limit 1`;
    let userId = existing[0]?.id;
    if (!userId) {
      const temporaryPassword = crypto.randomBytes(32).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const inserted = await sql`
        insert into users (email, email_normalized, name, password_hash, status, email_verified_at)
        values (${email}, ${email}, ${name}, ${passwordHash}, 'active', now())
        returning id`;
      userId = inserted[0].id;
    } else {
      await sql`update users set name = ${name}, status = 'active', email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = ${userId}`;
    }
    const organizations = await sql`select id from organizations where lower(name) = lower(${organizationName}) and status = 'active' order by created_at limit 1`;
    const organizationId = organizations[0]?.id || (await sql`
      insert into organizations (name, status) values (${organizationName}, 'active') returning id`)[0].id;
    await sql`
      insert into organization_members (organization_id, user_id, role, status)
      values (${organizationId}, ${userId}, 'owner', 'active')
      on conflict (organization_id, user_id) do update set role = 'owner', status = 'active', updated_at = now()`;
    console.log('First owner bootstrap ready; senha será definida pelo link de recuperação.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
