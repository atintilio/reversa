// Execução pós-contrato: só a plataforma acessa; aprovar, enviar ao contador e transmitir só master; parceiro travado.
process.env.SESSION_SECRET = 'execucao-test-secret';
process.env.APP_BASE_URL = 'https://reversa.test';
process.env.LEGACY_AUTH_UNTIL = 'off';
process.env.REVERSA_MASTER_EMAILS = 'andre@argus.test';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');
const { hashSession } = require('../lib/security');

let sql, db, api, master, analista, parceiro, caseId, execId;
const json = (r) => JSON.parse(r.body);
const v1 = (path, o = {}) => call(api, { ...o, url: '/api/v1/' + path, query: { ...(o.query || {}), ...(path.split('/').length > 2 ? { rvpath: path } : {}) } });
const pub = (token, method = 'GET', body) => v1('accountant-review', { method, body, headers: { 'x-review-token': token, origin: process.env.APP_BASE_URL } });
const fase = (cookie, para, extra = {}) => v1(`execucoes/${execId}/fase`, { cookie, method: 'POST', body: { para, ...extra } });

test.before(async () => {
  ({ sql, db } = await createDb()); freshRequire('lib/db').setSqlForTests(sql); api = freshRequire('api/v1/[...route]');
  const plat = (await sql`select id from organizations where kind = 'plataforma'`)[0].id;
  const parc = (await sql`insert into organizations (name, kind) values ('Parceiro X', 'parceiro') returning id`)[0].id;
  async function login(email, org, role) {
    const hash = await bcrypt.hash('senha-de-teste', 4);
    const id = (await sql`insert into users (email,email_normalized,name,password_hash,status) values (${email},${email},${email.split('@')[0]},${hash},'active') returning id`)[0].id;
    await sql`insert into organization_members (organization_id,user_id,role,status) values (${org},${id},${role},'active')`;
    return cookieFrom(await call(freshRequire('api/login'), { method: 'POST', body: { usuario: email, senha: 'senha-de-teste' } }));
  }
  master = await login('andre@argus.test', plat, 'owner');
  analista = await login('analista@argus.test', plat, 'analyst');
  parceiro = await login('parceiro@x.test', parc, 'admin');
  const r = await v1('taxpayers', { cookie: parceiro, method: 'POST', body: { cnpj: '11222333000181', legalName: 'Cliente do Parceiro', taxRegime: 'Lucro Real' } });
  assert.equal(r.statusCode, 201, r.body); caseId = json(r).caseId;
  assert.equal((await v1('cases/' + caseId, { cookie: parceiro, method: 'PATCH', body: { stage: 'contrato' } })).statusCode, 200);
});
test.after(async () => { await db.close(); });

test('EXE-001: parceiro não acessa; plataforma vê o caso com contrato e inicia a execução', async () => {
  assert.equal((await v1('execucoes', { cookie: parceiro })).statusCode, 403);
  const l = json(await v1('execucoes', { cookie: analista }));
  assert.ok(l.candidatos.some((c) => c.caseId === caseId));
  assert.equal(l.podeAprovar, false);
  assert.equal(json(await v1('execucoes', { cookie: analista, method: 'POST', body: { caseId } })).error.code, 'CONTRACT_NOT_SIGNED');
  const s = await v1('execucoes', { cookie: analista, method: 'POST', body: { caseId, contratoAssinado: true } });
  assert.equal(s.statusCode, 201, s.body); execId = json(s).id;
  assert.equal((await v1('execucoes', { cookie: analista, method: 'POST', body: { caseId, contratoAssinado: true } })).statusCode, 409);
  // o parceiro não altera mais o caso
  const p = await v1('cases/' + caseId, { cookie: parceiro, method: 'PATCH', body: { stage: 'perdido' } });
  assert.equal(p.statusCode, 409); assert.equal(json(p).error.code, 'EM_EXECUCAO');
  assert.equal((await v1('execucoes/' + execId, { cookie: parceiro })).statusCode, 403);
});

test('EXE-002: equipe prepara fase a fase; aprovar só master e com resumo; depois trava', async () => {
  for (const f of ['apuracao_definitiva', 'retificacao_preparada', 'pre_validacao']) assert.equal((await fase(analista, f)).statusCode, 200, f);
  assert.equal((await fase(analista, 'aprovado')).statusCode, 409, 'não pula fase');
  // arquivo com erro na pré-validação bloqueia; registrar de novo sem erro libera
  const arq = (erros) => ({ arquivos: [{ nome: 'ret.txt', competencia: '2024-03', cnpj: '11222333000181', reciboOriginal: '12.34', shaOriginal: 'a'.repeat(64), shaRetificada: 'b'.repeat(64),
    teses: ['tema69'], itensAlterados: 2, apuracao: { pis: { aRecolherOriginal: 14750, aRecolherRetificado: 10295, diferenca: 4455, codigosReceita: [{ campo: '08', codigo: '810902', valor: 10295 }] }, cofins: { diferenca: 20520 } },
    validacao: { erros, avisos: 0, versao: '0.1.0', mensagens: [] } }] });
  assert.equal((await v1(`execucoes/${execId}/arquivos`, { cookie: parceiro, method: 'POST', body: arq(0) })).statusCode, 403);
  assert.equal((await v1(`execucoes/${execId}/arquivos`, { cookie: analista, method: 'POST', body: arq(2) })).statusCode, 200);
  assert.equal(json(await fase(analista, 'aguardando_aprovacao')).error.code, 'VALIDATION_ERRORS');
  assert.equal(json(await v1(`execucoes/${execId}/arquivos`, { cookie: analista, method: 'POST', body: arq(0) })).arquivos, 1, 'mesma competência é substituída');
  assert.equal((await fase(analista, 'aguardando_aprovacao')).statusCode, 200);
  assert.equal((await fase(analista, 'aprovado')).statusCode, 403, 'analista não aprova');
  assert.equal(json(await fase(master, 'aprovado')).error.code, 'SUMMARY_REQUIRED');
  assert.equal((await v1('execucoes/' + execId, { cookie: analista, method: 'PATCH', body: { resumo: 'Retificação EFD-Contribuições 2021-2025, Tema 69.', exigeContador: true } })).statusCode, 200);
  assert.equal((await fase(master, 'aprovado')).statusCode, 200);
  const g = json(await v1('execucoes/' + execId, { cookie: analista }));
  assert.equal(g.fase, 'aprovado'); assert.equal(g.aprovadoPor, 'andre');
  assert.equal(json(await v1('execucoes/' + execId, { cookie: analista, method: 'PATCH', body: { resumo: 'mudou' } })).error.code, 'LOCKED');
  assert.equal(json(await fase(master, 'validacao_contador')).error.code, 'USE_ACCOUNTANT');
});

test('EXE-003: contador valida pelo link; transmissão exige "Validado e assinado" e recibo', async () => {
  assert.equal((await v1(`execucoes/${execId}/contador`, { cookie: analista, method: 'POST', body: { email: 'contador@cli.test' } })).statusCode, 403);
  const env = await v1(`execucoes/${execId}/contador`, { cookie: master, method: 'POST', body: { email: 'contador@cli.test' } });
  assert.equal(env.statusCode, 200, env.body);
  const url = json(env).url; assert.match(url, /^https:\/\/reversa\.test\/validacao-contador\.html#[A-Za-z0-9_-]{43}$/);
  const token = url.split('#')[1];
  assert.equal((await sql`select accountant_token_hash from recovery_executions where id = ${execId}`)[0].accountant_token_hash, hashSession(token));
  const v = json(await pub(token)); assert.equal(v.cliente.nome, 'Cliente do Parceiro'); assert.equal(v.preparadoPor, 'time técnico Argus Prime');
  assert.equal(json(await fase(master, 'transmitido', { recibo: '12.34.56.78-90' })).error.code, 'ACCOUNTANT_PENDING');
  const ab = (await sql`select accountant_opened_at, accountant_expires_at - accountant_sent_at as validade from recovery_executions where id = ${execId}`)[0];
  assert.ok(ab.accountant_opened_at, 'abertura registrada'); assert.match(String(JSON.stringify(ab.validade)), /2 days|"days":2/);
  assert.ok(new Date(v.prazoResposta) - new Date(ab.accountant_opened_at) <= 12 * 3600 * 1000 + 1000);
  // prazo vencido bloqueia a resposta
  await sql`update recovery_executions set accountant_opened_at = now() - interval '13 hours' where id = ${execId}`;
  assert.equal(json(await pub(token, 'POST', { resposta: 'validado', nome: 'Contador CRC SC-1' })).error.code, 'DEADLINE_PASSED');
  await sql`update recovery_executions set accountant_opened_at = now() where id = ${execId}`;
  assert.equal(json(await pub(token, 'POST', { resposta: 'com_ressalvas', nome: 'Contador CRC SC-1' })).error.code, 'COMMENT_REQUIRED');
  assert.equal((await pub(token, 'POST', { resposta: 'validado_assinado', nome: 'Contador CRC SC-1' })).statusCode, 200);
  assert.equal((await pub(token, 'POST', { resposta: 'validado', nome: 'Contador CRC SC-1' })).statusCode, 409);
  assert.equal(json(await fase(master, 'transmitido')).error.code, 'RECEIPT_REQUIRED');
  assert.equal((await fase(analista, 'transmitido', { recibo: '12.34.56.78-90' })).statusCode, 403);
  assert.equal((await fase(master, 'transmitido', { recibo: '12.34.56.78-90' })).statusCode, 200);
  const g = json(await v1('execucoes/' + execId, { cookie: master }));
  assert.equal(g.recibos.length, 1); assert.equal(g.contador.respostaRotulo, 'Validado e assinado');
  assert.ok(g.eventos.length >= 9);
  assert.equal((await pub(token)).statusCode, 404, 'link deixa de valer após a transmissão');
});

test('EXE-004: voltar fase depois da aprovação só master, com motivo; desfaz a aprovação', async () => {
  assert.equal((await fase(analista, 'retificacao_preparada', { nota: 'Erro no bloco M' })).statusCode, 403);
  assert.equal(json(await fase(master, 'retificacao_preparada')).error.code, 'NOTE_REQUIRED');
  assert.equal((await fase(master, 'retificacao_preparada', { nota: 'Erro no bloco M' })).statusCode, 200);
  const g = json(await v1('execucoes/' + execId, { cookie: master }));
  assert.equal(g.aprovadoPor, null); assert.equal(g.contador.resposta, null);
});
