// API da Lei do Bem: casos por organização, recálculo no servidor, revisões em ordem, travas e recibo.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
const origError = console.error; console.error = () => {};

let sql; let api; let H; let org; let outraOrg; let admin; let analista; let leitor; let outro;
const SENHA = 'Senha-forte-123';
async function user(email, name, orgId, role) {
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${await bcrypt.hash(SENHA, 4)}, 'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, 'active')`;
}
const login = async (email) => cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha: SENHA } }));
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);

const dados = {
  empresa: { cnpj: '11222333000181', nome: 'EMPRESA TESTE LTDA', regime: 'lucro_real', formaTribTexto: 'Lucro Real', regularidade: { situacao: 'cnd', validade: '2099-12-31' },
    periodos: [{ per: 'A00', dtIni: '2025-01-01', dtFin: '2025-12-31', meses: 12, limiteIRPJ: 800000, limiteCSLL: 750000 }] },
  projetos: [{ id: 'p1', codigo: 'PRJ-1', titulo: 'Motor', inicio: '2025-01-01', fim: '2025-12-31',
    desafio: 'Não havia algoritmo conhecido que resolvesse o roteamento com restrições dinâmicas em tempo real para a frota da empresa.',
    metodologia: 'Pesquisa bibliográfica, protótipos iterativos, testes de carga e validação com dados reais.',
    criterios: { problema: 1, incerteza: 1, novidade: 1, metodologia: 1, testes: 1, evidencias: 1, equipe: 1, resultado: 1 } }],
  despesas: [{ id: 'd1', rubrica: 'rh', projetoId: 'p1', valor: 1000000, doc: { cpf: '52998224725' }, evidencias: { timesheet: true } }],
  contabil: { totalPD: 1000000 },
  formpd: { prazoInformado: '2099-07-31' } // prazo vencido bloquearia a aprovação final (simula prorrogação)
};

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login') };
  org = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  outraOrg = (await sql`insert into organizations (name) values ('Outra') returning id`)[0].id;
  await user('admin@argus.com', 'Admin', org, 'admin'); admin = await login('admin@argus.com');
  await user('ana@argus.com', 'Ana', org, 'analyst'); analista = await login('ana@argus.com');
  await user('leo@argus.com', 'Leo', org, 'viewer'); leitor = await login('leo@argus.com');
  await user('bia@outra.com', 'Bia', outraOrg, 'admin'); outro = await login('bia@outra.com');
});
test.after(() => { console.error = origError; });

let id;
test('LDB-API-001 cria caso, recusa duplicado e isola organizações', async () => {
  const r = await v1('leidobem/casos', { method: 'POST', cookie: analista, body: { cnpj: '11.222.333/0001-81', legalName: 'Empresa Teste Ltda', anoBase: 2025 } });
  assert.equal(r.statusCode, 201); id = J(r).id;
  assert.equal((await v1('leidobem/casos', { method: 'POST', cookie: analista, body: { cnpj: '11222333000181', legalName: 'X', anoBase: 2025 } })).statusCode, 409);
  assert.equal((await v1('leidobem/casos', { method: 'POST', cookie: leitor, body: { cnpj: '11222333000181', legalName: 'X', anoBase: 2024 } })).statusCode, 403);
  assert.equal((await v1('leidobem/casos/' + id, { cookie: outro })).statusCode, 404);
  assert.equal(J(await v1('leidobem/casos', { cookie: outro })).casos.length, 0);
  assert.equal(J(await v1('leidobem/casos', { cookie: leitor })).casos.length, 1);
});

test('LDB-API-002 salva dados e recalcula no servidor', async () => {
  const r = J(await v1('leidobem/casos/' + id, { method: 'PATCH', cookie: analista, body: { dados } }));
  assert.equal(r.calculo.dispendios, 1000000);
  assert.equal(r.calculo.exclusao, 600000);
  assert.equal(r.calculo.economia, 200000);
  assert.equal(r.calculo.elegibilidade.status, 'ELEGIVEL');
  const l = J(await v1('leidobem/casos', { cookie: admin })).casos[0];
  assert.equal(l.resumo.economia, 200000);
});

test('LDB-API-003 revisões em ordem; final só admin; edição reinicia; recibo trava', async () => {
  const rev = (cookie, etapa, decisao = 'aprovar', observacao = '') => v1('leidobem/casos/' + id + '/revisao', { method: 'POST', cookie, body: { etapa, decisao, observacao } });
  assert.equal((await rev(analista, 'tecnica')).statusCode, 409);           // fora de ordem
  assert.equal(J(await rev(analista, 'fiscal')).status, 'em_revisao');
  assert.equal((await rev(analista, 'tecnica')).statusCode, 200);
  assert.equal((await rev(analista, 'contabil')).statusCode, 200);
  assert.equal((await rev(analista, 'final')).statusCode, 403);             // aprovação final é do admin
  assert.equal((await v1('leidobem/casos/' + id + '/recibo', { method: 'POST', cookie: admin, body: { recibo: 'ABC123', data: '2026-07-20' } })).statusCode, 409);
  const fim = J(await rev(admin, 'final'));
  assert.equal(fim.status, 'aprovado');
  // alterar dados depois de aprovado reinicia as revisões
  const d2 = JSON.parse(JSON.stringify(dados)); d2.despesas[0].valor = 900000;
  const s = J(await v1('leidobem/casos/' + id, { method: 'PATCH', cookie: analista, body: { dados: d2 } }));
  assert.equal(s.status, 'rascunho'); assert.deepEqual(s.revisoes.aprovadas, []);
  for (const e of ['fiscal', 'tecnica', 'contabil']) await rev(analista, e);
  assert.equal((await rev(analista, 'fiscal', 'reprovar')).statusCode, 400);  // reprovação exige motivo
  await rev(admin, 'final');
  assert.equal(J(await v1('leidobem/casos/' + id + '/recibo', { method: 'POST', cookie: admin, body: { recibo: 'ABC123', data: '2026-07-20' } })).status, 'enviado');
  assert.equal((await v1('leidobem/casos/' + id, { method: 'PATCH', cookie: analista, body: { dados } })).statusCode, 409);
  const ev = await sql`select event_type from audit_events where entity_type = 'ldb_case' order by created_at`;
  assert.ok(ev.some((e) => e.event_type === 'ldb.formpd_receipt'));
});

test('LDB-API-004 bloqueia aprovação de caso inelegível', async () => {
  const r = J(await v1('leidobem/casos', { method: 'POST', cookie: analista, body: { cnpj: '11222333000181', legalName: 'Empresa Teste Ltda', anoBase: 2024 } }));
  const d = JSON.parse(JSON.stringify(dados)); d.empresa.regime = 'lucro_presumido';
  await v1('leidobem/casos/' + r.id, { method: 'PATCH', cookie: analista, body: { dados: d } });
  const a = await v1('leidobem/casos/' + r.id + '/revisao', { method: 'POST', cookie: analista, body: { etapa: 'fiscal', decisao: 'aprovar' } });
  assert.equal(a.statusCode, 409);
});
