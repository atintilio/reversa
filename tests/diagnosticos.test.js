// Diagnósticos versionados (DX-AAAA-0001), valor do caso somado, CRM automático e avanço de fase.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
process.env.APP_BASE_URL = 'https://reversa.argusprime.com.br';
process.env.REVERSA_USERS = 'andre:senha-legada-1';
process.env.LEGACY_AUTH_UNTIL = '2099-12-31';

let sql; let api; let cookie; let orgId;
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);
const CNPJ = '11.222.333/0001-81';
const credito = (pis, cofins) => ({ id: 'T001', nome: 'Tese', natureza: 'credito', itens: 3, total: { pis, cofins }, totalNoPrazo: { pis, cofins } });
const salvar = (extra = {}) => v1('analyses', { method: 'POST', cookie, body: { taxpayer: { cnpj: CNPJ, legalName: 'GTW' }, periodStart: '2021-01', periodEnd: '2025-12', engineVersion: '1', files: 3, teses: [credito(10000, 40000)], ...extra } });

test.before(async () => {
  const d = await createDb(); sql = d.sql;
  freshRequire('lib/db').setSqlForTests(sql);
  orgId = (await sql`select id from organizations limit 1`)[0].id;
  const hash = await bcrypt.hash('Senha-forte-123', 4);
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('a@x.com','a@x.com','Ana',${hash},'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, 'admin', 'active')`;
  api = freshRequire('api/v1/[...route]');
  const H = { login: freshRequire('api/login') };
  const login = await call(H.login, { method: 'POST', cookie: 'rv_csrf=teste-dti', body: { _csrf: 'teste-dti', usuario: 'a@x.com', senha: 'Senha-forte-123' } });
  assert.equal(login.statusCode, 303, login.body);
  cookie = cookieFrom(login);
});

test('primeiro diagnóstico: código DX, v1, CRM e pendência cadastral', async () => {
  const r = await salvar(); assert.equal(r.statusCode, 201, r.body);
  const b = J(r);
  assert.match(b.diagnosticCode, /^DX-\d{4}-\d{4}$/); assert.equal(b.versao, 1); assert.equal(b.tipo, 'pis_cofins');
  assert.deepEqual(b.pendencias, ['contato']);
  const ag = await sql`select subject, meta from crm_activities where type = 'agent'`; assert.equal(ag.length, 1); assert.match(ag[0].subject, /DX-/);
  const tk = await sql`select subject, assignee_user_id from crm_activities where type = 'task' and meta->>'pendencia' = 'true'`;
  assert.equal(tk.length, 1); assert.ok(tk[0].assignee_user_id);
  const c = (await sql`select title, estimated_value, commercial_stage from tax_cases`)[0];
  assert.equal(c.title, 'Diagnóstico — GTW'); assert.equal(Number(c.estimated_value), 500); assert.equal(c.commercial_stage, 'a_apresentar');
});

test('novo diagnóstico do mesmo tipo vira v2 e substitui a v1; sem duplicar pendência', async () => {
  const b = J(await salvar({ teses: [credito(20000, 0)] }));
  assert.equal(b.versao, 2);
  const rows = await sql`select versao, status from diagnostics order by versao`;
  assert.deepEqual(rows.map((x) => x.status), ['substituido', 'vigente']);
  assert.equal((await sql`select count(*)::int n from crm_activities where type = 'task' and meta->>'pendencia' = 'true'`)[0].n, 1);
  assert.equal(Number((await sql`select estimated_value from tax_cases`)[0].estimated_value), 200);
});

test('previdenciário soma ao total do cliente e tem versão própria', async () => {
  const r = await salvar({ tipo: 'previdenciario', teses: [{ id: 'T060', nome: 'Aviso prévio', natureza: 'credito', itens: 2, valorCentavos: 30000, valorNoPrazoCentavos: 25000 }] });
  assert.equal(r.statusCode, 201, r.body);
  const b = J(r); assert.equal(b.tipo, 'previdenciario'); assert.equal(b.versao, 1);
  assert.equal(Number((await sql`select estimated_value from tax_cases`)[0].estimated_value), 450);
  const tp = (await sql`select id from taxpayers`)[0].id;
  const l = J(await v1(`taxpayers/${tp}/diagnostics`, { cookie })).diagnostics;
  assert.equal(l.length, 3); assert.equal(l.filter((x) => x.status === 'vigente').length, 2);
});

test('gerar link do contrato leva o caso a "aguardando autorização"', async () => {
  const caseId = (await sql`select id from tax_cases`)[0].id;
  const r = await v1(`cases/${caseId}/authorizations`, { method: 'POST', cookie, body: { periodStart: '2021-01', periodEnd: '2025-12', theses: ['T004'], values: { T004: 1000 } } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal((await sql`select commercial_stage from tax_cases`)[0].commercial_stage, 'aguardando_autorizacao');
  assert.equal((await sql`select count(*)::int n from audit_events where event_type = 'case.stage_changed'`)[0].n, 1);
});

test('gerar de novo o mesmo resultado não cria versão nova (repetido)', async () => {
  const antes = (await sql`select count(*)::int n from diagnostics`)[0].n;
  const r = await salvar({ teses: [credito(20000, 0)] }); assert.equal(r.statusCode, 201, r.body);
  const b = J(r); assert.equal(b.repetido, true); assert.equal(b.versao, 2);
  assert.equal((await sql`select count(*)::int n from diagnostics`)[0].n, antes);
});

test('responsável informado pelo parceiro vira contato principal e zera a pendência; reenvio só completa vazios', async () => {
  const r = await salvar({ teses: [credito(30000, 0)], contato: { nome: 'Carla Souza', cargo: 'Controller', email: 'Carla@Cliente.com.br', telefone: '' } });
  assert.equal(r.statusCode, 201, r.body);
  assert.deepEqual(J(r).pendencias, ['telefone']);
  let c = (await sql`select name, role, email, phone, is_primary from crm_contacts where name = 'Carla Souza'`);
  assert.equal(c.length, 1); assert.equal(c[0].email, 'carla@cliente.com.br'); assert.equal(c[0].is_primary, true); assert.equal(c[0].role, 'Controller');
  const r2 = await salvar({ teses: [credito(40000, 0)], contato: { nome: 'Carla Souza', cargo: 'Outro cargo', email: 'carla@cliente.com.br', telefone: '48999990000' } });
  assert.deepEqual(J(r2).pendencias, []);
  c = await sql`select role, phone from crm_contacts where name = 'Carla Souza'`;
  assert.equal(c.length, 1); assert.equal(c[0].role, 'Controller'); assert.equal(c[0].phone, '48999990000');
});

test('DTI versionado preserva memória e origem no workspace', async () => {
  const tese = { ...credito(18000, 2000), memoria: [{ competencia: '2025-10', origem: 'efd.txt', pis: 18000, cofins: 2000, atualizado: 21000 }] };
  const r = await salvar({ taxpayer: { cnpj: '04.252.011/0001-10', legalName: 'Cliente com dossiê' }, teses: [tese] });
  assert.equal(r.statusCode, 201, r.body);
  const dti = J(r);
  const versoes = J(await v1('taxpayers/' + dti.taxpayerId + '/diagnostics', { cookie })).diagnostics;
  assert.equal(versoes[0].batchId, dti.batchId);
  assert.equal(versoes[0].caseId, dti.caseId);
  const pasta = J(await v1('taxpayers/' + dti.taxpayerId, { cookie }));
  assert.equal(pasta.taxpayer.taxId, '04252011000110');
  assert.equal(pasta.taxpayer.taxIdType, 'CNPJ');
  assert.deepEqual(pasta.analyses[0].summary.memoria[0], {
    competencia: '2025-10', origem: 'efd.txt', pis: 18000, cofins: 2000, nominal: 20000, selic: 1000, atualizado: 21000
  });
  const repetido = J(await salvar({ taxpayer: { cnpj: '04.252.011/0001-10', legalName: 'Cliente com dossiê' }, teses: [tese] }));
  assert.equal(repetido.repetido, true);
  assert.equal(repetido.versao, dti.versao);
});

test('escrituração de ICMS fica no dossiê sem criar oportunidade sintética', async () => {
  const technicalSummary = { credito: 65641.11, saldoCredorATransportar: 32718.06 };
  const r = await salvar({ teses: [credito(200, 100)], potentialTotal: 9836217, technicalSummary });
  assert.equal(r.statusCode, 201, r.body);
  const { caseId, batchId } = J(r);
  const registro = (await sql`select resumo from diagnostics where batch_id = ${batchId}`)[0];
  assert.deepEqual(registro.resumo.escrituracaoIcms, technicalSummary);
  const caso = (await sql`select metadata from tax_cases where id = ${caseId}`)[0];
  assert.equal(caso.metadata.potential_total_cents, 300);
  assert.equal(J(r).analyses.length, 1);
});

test('aprovação exige fórmula, regra, conciliação e original do mesmo contribuinte', async (t) => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const root = await mkdtemp(require('node:path').join(require('node:os').tmpdir(), 'reversa-prova-'));
  const anterior = process.env.REVERSA_DOCUMENT_ROOT;
  process.env.REVERSA_DOCUMENT_ROOT = root;
  t.after(async () => {
    if (anterior === undefined) delete process.env.REVERSA_DOCUMENT_ROOT;
    else process.env.REVERSA_DOCUMENT_ROOT = anterior;
    await rm(root, { recursive: true, force: true });
  });
  const salvo = await salvar({ teses: [credito(200, 300)] });
  assert.equal(salvo.statusCode, 201, salvo.body);
  const { taxpayerId, analyses } = J(salvo);
  const revisar = (prova) => v1('analyses/' + analyses[0] + '/review', { method: 'POST', cookie, body: { decision: 'approve', prova } });
  const semProva = await revisar();
  assert.equal(J(semProva).error.code, 'DOSSIER_EVIDENCE_REQUIRED');
  const bytes = Buffer.from('registro de prova');
  const sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const prova = { arquivos: [sha256], fundamento: 'Regra da tese e regime da competência', memoria: 'Documento, registro e fórmula da apuração', conciliacao: 'Pagamento e uso anterior conferidos' };
  assert.equal(J(await revisar(prova)).error.code, 'DOSSIER_DOCUMENT_NOT_FOUND');
  const store = require('../lib/document-store').createStore(root);
  await store.upload(orgId, taxpayerId, { name: 'prova.txt', size: bytes.length, offset: 0, sha256, data: bytes.toString('base64') });
  const ok = await revisar(prova);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(J(ok).status, 'recoverable_approved');
  const registrado = (await sql`select result_summary from tax_analyses where id = ${analyses[0]}`)[0];
  assert.deepEqual(registrado.result_summary.prova_depuracao, prova);
});
