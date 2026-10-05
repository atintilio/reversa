// Primeiro acesso do proprietário (owner) da organização padrão — roda no build, de forma idempotente.
// - garante o usuário BOOTSTRAP_OWNER_EMAIL (padrão: atintilio@argusprime.com.br) como owner;
// - enquanto ele nunca tiver criado senha nem entrado (auditoria) e não há link válido pendente, envia pelo Microsoft Graph o link de criação de senha (48 h, uso único).
// Nunca imprime token, senha ou e-mail completo. Falha aqui não interrompe o build.
const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const { normalizeEmail, randomToken, hashToken } = require('../lib/security');
const { sendInvite } = require('../lib/mailer');

const EMAIL = normalizeEmail(process.env.BOOTSTRAP_OWNER_EMAIL || 'atintilio@argusprime.com.br');
const NAME = process.env.BOOTSTRAP_OWNER_NAME || 'André Carlos Tintilio';
const mask = (e) => e.replace(/^(.).*(@.*)$/, '$1***$2');

async function bootstrapOwner(sql, send = sendInvite) {
    const org = (await sql`select id, name from organizations where status = 'active' order by created_at, id limit 1`)[0];
    if (!org) { console.log('bootstrap-owner: nenhuma organização'); return 'no_org'; }
    let user = (await sql`select id, name, status from users where email_normalized = ${EMAIL} limit 1`)[0];
    if (!user) {
      const unusable = await bcrypt.hash(randomToken(32), 12);
      user = (await sql`insert into users (email, email_normalized, name, password_hash, status)
                        values (${EMAIL}, ${EMAIL}, ${NAME}, ${unusable}, 'pending') returning id, name, status`)[0];
      console.log(`bootstrap-owner: usuário criado (${mask(EMAIL)})`);
    } else if (user.status === 'archived') {
      await sql`update users set status = 'pending', updated_at = now() where id = ${user.id}`;
      user.status = 'pending';
    }
    await sql`insert into organization_members (organization_id, user_id, role, status)
              values (${org.id}, ${user.id}, 'owner', ${user.status === 'active' ? 'active' : 'invited'})
              on conflict (organization_id, user_id) do update set role = 'owner', updated_at = now()`;
    if (user.status === 'blocked') { console.log('bootstrap-owner: proprietário bloqueado; nada a enviar'); return 'blocked'; }
    // "Já acessou" = criou senha por link ou entrou com sucesso (registrado na auditoria). Cobre owner criado ativo com senha aleatória.
    const accessed = (await sql`select 1 from audit_events where actor_user_id = ${user.id}
                                and event_type in ('auth.login.succeeded', 'auth.password_reset.completed') and outcome = 'success' limit 1`)[0];
    if (accessed) { console.log('bootstrap-owner: proprietário já acessou; nada a enviar'); return 'active'; }
    const pending = (await sql`select 1 from password_reset_tokens where user_id = ${user.id} and used_at is null and expires_at > now() limit 1`)[0];
    if (pending) { console.log('bootstrap-owner: já existe link de primeiro acesso válido; não reenviado'); return 'pending'; }
    const raw = randomToken(32);
    const digest = hashToken(raw);
    await sql`insert into password_reset_tokens (user_id, token_hash, expires_at, created_at)
              values (${user.id}, decode(${digest}, 'hex'), now() + interval '48 hours', now())`;
    try {
      await send({ to: EMAIL, token: raw, name: user.name, inviterName: 'Reversa Tax', organizationName: org.name });
      await sql`insert into audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, outcome, metadata)
                values (${org.id}, null, 'org.owner.bootstrap_invite_sent', 'user', ${user.id}, 'success', '{}'::jsonb)`;
      console.log(`bootstrap-owner: link de primeiro acesso enviado para ${mask(EMAIL)}`);
      return 'sent';
    } catch (error) {
      await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and token_hash = decode(${digest}, 'hex')`;
      console.error('bootstrap-owner: falha no envio', error.message);
      return 'mail_failed';
    }
}

async function main() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) { console.log('bootstrap-owner: sem banco configurado, ignorado'); return; }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') { console.log('bootstrap-owner: só roda em produção'); return; }
  const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => {} });
  try { await bootstrapOwner(sql); } finally { await sql.end({ timeout: 5 }); }
}

module.exports = { bootstrapOwner };
if (require.main === module) main().catch((error) => { console.error('bootstrap-owner:', error.message); });
