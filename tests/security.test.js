const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const load = p => require(path.join(root, p));
const { createDb, call, cookieFrom } = load('tests/helpers.js');
const bcrypt = load('node_modules/bcryptjs');
const security = load('lib/security');
process.env.SESSION_SECRET = 'local-review-only';
process.env.LEGACY_AUTH_UNTIL = 'off';
let db, sql, orgA, orgB, admin, victim, cookie;
test.before(async () => {
  ({ db, sql } = await createDb());
  load('lib/db').setSqlForTests(sql);
  orgA = (await sql`insert into organizations(name) values ('A') returning id`)[0].id;
  orgB = (await sql`insert into organizations(name) values ('B') returning id`)[0].id;
  const hash = await bcrypt.hash('Local-password-123', 4);
  admin = (await sql`insert into users(email,email_normalized,name,password_hash) values ('admin@example.test','admin@example.test','Admin',${hash}) returning id`)[0].id;
  victim = (await sql`insert into users(email,email_normalized,name,password_hash) values ('victim@example.test','victim@example.test','Victim',${hash}) returning id`)[0].id;
  await sql`insert into organization_members(organization_id,user_id,role) values (${orgA},${admin},'admin'),(${orgB},${victim},'owner')`;
  cookie = cookieFrom(await call(load('api/login'), {method:'POST',body:{email:'admin@example.test',password:'Local-password-123'}}));
});
test.after(async () => db.close());
const route = (url, opts = {}) => call(load('api/v1/[...route].js'), {url,cookie,...opts});
test('Isolamento: usuário de A não lê empresa de B', async () => {
  const t = (await sql`insert into taxpayers(organization_id,legal_name,cnpj,cnpj_normalized) values (${orgB},'Privada','11222333000181','11222333000181') returning id`)[0];
  assert.equal((await route('/api/v1/taxpayers/'+t.id)).statusCode,404);
});
test('convite não permite admin rebaixar owner suspenso', async () => {
  await sql`insert into organization_members(organization_id,user_id,role,status) values (${orgA},${victim},'owner','suspended')`;
  const res = await route('/api/v1/members',{method:'POST',body:{email:'victim@example.test',name:'Victim',role:'viewer'}});
  assert.equal(res.statusCode,403);
  const row = (await sql`select role,status from organization_members where organization_id=${orgA} and user_id=${victim}`)[0];
  assert.deepEqual(row,{role:'owner',status:'suspended'});
});
test('suspender ou remover vínculo em A preserva sessão válida em B', async () => {
  await sql`update organization_members set role='viewer',status='active' where organization_id=${orgA} and user_id=${victim}`;
  const raw = 's1.local-victim-session';
  await sql`insert into auth_sessions(user_id,session_hash,expires_at) values (${victim},decode(${security.hashSession(raw)},'hex'),now()+interval '1 hour')`;
  assert.ok(await load('lib/auth').currentUser({headers:{cookie:'rv_sessao='+raw}}));
  assert.equal((await route('/api/v1/members/'+victim,{method:'PATCH',body:{status:'suspended'}})).statusCode,200);
  assert.ok(await load('lib/auth').currentUser({headers:{cookie:'rv_sessao='+raw}}));
  assert.equal((await route('/api/v1/members/'+victim,{method:'DELETE'})).statusCode,200);
  assert.ok(await load('lib/auth').currentUser({headers:{cookie:'rv_sessao='+raw}}));
  assert.equal((await sql`select status from organization_members where organization_id=${orgB} and user_id=${victim}`)[0].status,'active');
});
test('login limita tentativas, normaliza conta e libera após expiração', async () => {
  for(let i=0;i<20;i++) assert.equal((await call(load('api/login'),{method:'POST',body:{email:'admin@example.test',password:'wrong'}})).headers.location,'/login.html?erro=1');
  const limited = await call(load('api/login'),{method:'POST',body:{email:' ADMIN@example.test ',password:'Local-password-123'}});
  assert.equal(limited.headers.location,'/login.html?erro=1');
  assert.equal(limited.headers['set-cookie'],undefined);
  assert.equal(limited.headers['retry-after'],'900');
  await sql`update auth_rate_limits set window_started=now()-interval '16 minutes'`;
  assert.equal((await call(load('api/login'),{method:'POST',body:{email:'admin@example.test',password:'Local-password-123'}})).headers.location,'/');
});
test('erro real do banco ao revogar sessão faz rollback completo do reset', async () => {
  const token = 'local-reset-token-at-least-20-chars';
  await sql`insert into password_reset_tokens(user_id,token_hash,expires_at) values (${admin},decode(${security.hashToken(token)},'hex'),now()+interval '1 hour')`;
  await db.exec(`create function fail_revoke() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_DB_FAILURE'; end $$; create trigger fail_revoke before update on auth_sessions for each row execute function fail_revoke();`);
  const res = await call(load('api/auth/password/reset'),{method:'POST',body:{token,password:'New-local-password-456',passwordConfirmation:'New-local-password-456'}});
  await db.exec('drop trigger fail_revoke on auth_sessions; drop function fail_revoke();');
  assert.equal(res.statusCode,503);
  const user = (await sql`select password_hash from users where id=${admin}`)[0];
  assert.ok(await bcrypt.compare('Local-password-123',user.password_hash));
  assert.ok(await load('lib/auth').currentUser({headers:{cookie}}));
  assert.equal((await sql`select used_at is not null as used from password_reset_tokens where user_id=${admin}`)[0].used,false);
  assert.equal((await call(load('api/auth/password/reset'),{method:'POST',body:{token,password:'New-local-password-456',passwordConfirmation:'New-local-password-456'}})).statusCode,204);
  assert.equal(await load('lib/auth').currentUser({headers:{cookie}}),null);
});

test('login limita rajada concorrente por IP mesmo com contas diferentes', async () => {
  await sql`delete from auth_rate_limits`;
  const results = await Promise.all(Array.from({length:65}, (_,i) => call(load('api/login'), {
    method:'POST',body:{email:`unknown${i}@example.test`,password:'wrong'},headers:{ip:'10.20.30.40'}
  })));
  assert.equal(results.filter(r=>r.headers['retry-after']==='900').length,5);
  assert.ok(results.every(r=>!r.headers['set-cookie']));
});
