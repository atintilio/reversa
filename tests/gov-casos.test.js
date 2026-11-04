// Testes do CRM de casos do Reversa Gov (/api/v1/gov/casos*), pelo roteador real.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';

let sql; let api; let H;
const SENHA = 'Senha-forte-123';
const TUPA = '3169604';
const FLORIPA = '4205407';
let orgA; let orgB; let admin; let analista; let leitor; let outro; let anaId;

async function user(email, name, orgId, role) {
  const hash = await bcrypt.hash(SENHA, 4);
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${hash}, 'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, 'active')`;
  return u.id;
}
const login = async (email) => cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha: SENHA } }));
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);
const PREV = { baseServidoresAnual: 6000000, aposentados: 500, pensionistas: 100, valorMedioAposentadoria: 4000, valorMedioPensao: 2500, crp: { numero: 'C1', dataValidade: '2020-01-01' } };
const FIS = { servidores: [{ rendimentoBruto: 10000 }], obrigacoes: [] };
const criar = (cookie, body) => v1('gov/casos', { method: 'POST', cookie, body });

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login') };
  orgA = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  orgB = (await sql`insert into organizations (name) values ('Outra org') returning id`)[0].id;
  await user('casos.admin@argus.com', 'Admin', orgA, 'admin');
  anaId = await user('casos.ana@argus.com', 'Ana', orgA, 'analyst');
  await user('casos.leo@argus.com', 'Leo', orgA, 'viewer');
  await user('casos.bia@outra.com', 'Bia', orgB, 'admin');
  admin = await login('casos.admin@argus.com');
  analista = await login('casos.ana@argus.com');
  leitor = await login('casos.leo@argus.com');
  outro = await login('casos.bia@outra.com');
});

test('migration 018 cria as tabelas de casos', async () => {
  const nomes = (await sql`select table_name from information_schema.tables where table_name in ('gov_casos','gov_caso_historico','gov_numeracao')`).map((r) => r.table_name);
  assert.equal(nomes.length, 3);
});

test('cria caso previdenciário, fiscal e consolidado com resultado do motor', async () => {
  const p = await criar(analista, { ibge: TUPA, tipo: 'previdenciario', entrada: PREV });
  assert.equal(p.statusCode, 201);
  const cp = J(p);
  assert.match(cp.numero, /^RGV-\d{4}-0001$/);
  assert.equal(cp.etapa, 'a_apresentar');
  assert.equal(cp.valorEstimado, 1830000); // Tupaciguara sem valor informado
  assert.ok(cp.resultado.previdenciario.riscos.some((r) => r.id === 'R001'));
  assert.equal(cp.resultado.fiscal, null);
  assert.ok(cp.resultado.score);
  assert.equal(cp.calculoIds.length, 1);
  assert.equal(cp.historico.length, 1);
  assert.equal(cp.historico[0].de, null);
  assert.equal(cp.historico[0].para, 'a_apresentar');

  const f = await criar(analista, { ibge: FLORIPA, tipo: 'fiscal', entrada: { ...FIS, valorEstimado: 500000 } });
  assert.equal(f.statusCode, 201);
  assert.equal(J(f).valorEstimado, 500000);
  assert.ok(J(f).resultado.fiscal);
  assert.equal(J(f).resultado.previdenciario, null);

  const c = await criar(analista, { ibge: FLORIPA, tipo: 'consolidado', entrada: { previdenciario: PREV, fiscal: FIS } });
  assert.equal(c.statusCode, 201);
  assert.ok(J(c).resultado.previdenciario && J(c).resultado.fiscal && J(c).resultado.score);
  assert.equal(J(c).valorEstimado, null);
  assert.equal(J(c).calculoIds.length, 2);
  const aud = await sql`select count(*)::int n from audit_events where event_type = 'gov.caso.criado'`;
  assert.equal(aud[0].n, 3);
});

test('caso sem entrada nasce só com cadastro (diagnóstico pendente)', async () => {
  const r = await criar(analista, { ibge: TUPA, tipo: 'consolidado' });
  assert.equal(r.statusCode, 201);
  assert.equal(J(r).resultado, null);
  assert.equal(J(r).entrada, null);
});

test('numeração sequencial e única por organização', async () => {
  const lista = J(await v1('gov/casos', { cookie: admin })).casos;
  assert.deepEqual(lista.map((c) => c.numero).sort(), ['RGV-' + new Date().getFullYear() + '-0001', 'RGV-' + new Date().getFullYear() + '-0002', 'RGV-' + new Date().getFullYear() + '-0003', 'RGV-' + new Date().getFullYear() + '-0004']);
  const b = await criar(outro, { ibge: FLORIPA, tipo: 'fiscal' });
  assert.match(J(b).numero, /-0001$/); // contador independente por organização
  const par = await Promise.all([criar(admin, { ibge: FLORIPA, tipo: 'fiscal' }), criar(admin, { ibge: FLORIPA, tipo: 'fiscal' })]);
  assert.notEqual(J(par[0]).numero, J(par[1]).numero);
});

test('validações: tipo inválido 400, IBGE inválido 400, IBGE fora do catálogo 404, entrada inválida 400', async () => {
  assert.equal((await criar(admin, { ibge: TUPA, tipo: 'x' })).statusCode, 400);
  assert.equal((await criar(admin, { ibge: '12', tipo: 'fiscal' })).statusCode, 400);
  assert.equal((await criar(admin, { ibge: '0000000', tipo: 'fiscal' })).statusCode, 404);
  assert.equal((await criar(admin, { ibge: TUPA, tipo: 'previdenciario', entrada: { aposentados: -1 } })).statusCode, 400);
});

test('permissões: viewer lista e lê, mas não cria nem move', async () => {
  assert.equal((await v1('gov/casos', { cookie: leitor })).statusCode, 200);
  assert.equal((await criar(leitor, { ibge: TUPA, tipo: 'fiscal' })).statusCode, 403);
  const id = J(await v1('gov/casos', { cookie: leitor })).casos[0].id;
  assert.equal((await v1(`gov/casos/${id}`, { cookie: leitor })).statusCode, 200);
  assert.equal((await v1(`gov/casos/${id}/etapa`, { method: 'POST', cookie: leitor, body: { etapa: 'apresentado' } })).statusCode, 403);
  assert.equal((await v1(`gov/casos/${id}/atualizar`, { method: 'POST', cookie: leitor, body: { valorEstimado: 1 } })).statusCode, 403);
  assert.equal((await v1('gov/casos')).statusCode, 401);
});

test('mudança de etapa grava histórico; perdido/pausado exige nota', async () => {
  const caso = J(await criar(analista, { ibge: TUPA, tipo: 'fiscal' }));
  const mv = await v1(`gov/casos/${caso.id}/etapa`, { method: 'POST', cookie: analista, body: { etapa: 'apresentado', nota: 'Reunião feita' } });
  assert.equal(mv.statusCode, 200);
  assert.equal(J(mv).etapa, 'apresentado');
  assert.equal(J(mv).historico.length, 2);
  assert.deepEqual([J(mv).historico[1].de, J(mv).historico[1].para, J(mv).historico[1].nota], ['a_apresentar', 'apresentado', 'Reunião feita']);
  assert.equal((await v1(`gov/casos/${caso.id}/etapa`, { method: 'POST', cookie: analista, body: { etapa: 'perdido_pausado' } })).statusCode, 400);
  assert.equal((await v1(`gov/casos/${caso.id}/etapa`, { method: 'POST', cookie: analista, body: { etapa: 'inexistente' } })).statusCode, 400);
  const perdido = await v1(`gov/casos/${caso.id}/etapa`, { method: 'POST', cookie: analista, body: { etapa: 'perdido_pausado', nota: 'Sem orçamento' } });
  assert.equal(perdido.statusCode, 200);
  assert.equal(J(perdido).motivoPerda, 'Sem orçamento');
  assert.equal(J(perdido).historico.length, 3);
  assert.equal((await v1('gov/casos', { cookie: admin, query: { etapa: 'perdido_pausado' } })).statusCode, 200);
  assert.equal(J(await v1('gov/casos', { cookie: admin, query: { etapa: 'perdido_pausado' } })).total, 1);
});

test('atualizar responsável e valor; responsável de fora da organização é recusado', async () => {
  const id = J(await v1('gov/casos', { cookie: admin })).casos[0].id;
  const ok = await v1(`gov/casos/${id}/atualizar`, { method: 'POST', cookie: analista, body: { responsavelId: anaId, valorEstimado: 99000.5 } });
  assert.equal(ok.statusCode, 200);
  assert.equal(J(ok).responsavelId, anaId);
  assert.equal(J(ok).responsavelNome, 'Ana');
  assert.equal(J(ok).valorEstimado, 99000.5);
  const outroUser = (await sql`select id from users where email = 'casos.bia@outra.com'`)[0].id;
  assert.equal((await v1(`gov/casos/${id}/atualizar`, { method: 'POST', cookie: analista, body: { responsavelId: outroUser } })).statusCode, 400);
  assert.equal((await v1(`gov/casos/${id}/atualizar`, { method: 'POST', cookie: analista, body: {} })).statusCode, 400);
});

test('isolamento entre organizações e filtros de listagem', async () => {
  const idA = J(await v1('gov/casos', { cookie: admin })).casos[0].id;
  assert.equal((await v1(`gov/casos/${idA}`, { cookie: outro })).statusCode, 404);
  assert.equal((await v1(`gov/casos/${idA}/etapa`, { method: 'POST', cookie: outro, body: { etapa: 'apresentado' } })).statusCode, 404);
  const listaB = J(await v1('gov/casos', { cookie: outro }));
  assert.ok(listaB.casos.every((c) => c.id !== idA));
  const tupa = J(await v1('gov/casos', { cookie: admin, query: { ibge: TUPA } }));
  assert.ok(tupa.total >= 3 && tupa.casos.every((c) => c.ibge === TUPA));
  const q = J(await v1('gov/casos', { cookie: admin, query: { q: 'tupaciguara' } }));
  assert.equal(q.total, tupa.total);
  assert.ok(q.porEtapa.a_apresentar.total >= 1);
});

test('caso de exemplo de Tupaciguara é idempotente', async () => {
  const a = await v1('gov/casos/exemplo', { method: 'POST', cookie: outro });
  assert.equal(a.statusCode, 201);
  assert.equal(J(a).caso.valorEstimado, 1830000);
  assert.equal(J(a).caso.etapa, 'a_apresentar');
  const b = await v1('gov/casos/exemplo', { method: 'POST', cookie: outro });
  assert.equal(b.statusCode, 200);
  assert.equal(J(b).criado, false);
  assert.equal(J(b).caso.id, J(a).caso.id);
  assert.equal((await v1('gov/casos/exemplo', { method: 'POST', cookie: leitor })).statusCode, 403);
});

test('relatório: PDF para Tupaciguara, 501 para outro município, 400 sem tipo', async () => {
  const tupa = J(await v1('gov/casos', { cookie: admin, query: { ibge: TUPA } })).casos[0];
  for (const tipo of ['comercial', 'tecnico']) {
    const r = await v1(`gov/casos/${tupa.id}/relatorio`, { cookie: leitor, query: { tipo } });
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers['content-type']), /application\/pdf/);
  }
  const fl = J(await v1('gov/casos', { cookie: admin, query: { ibge: FLORIPA } })).casos[0];
  const n = await v1(`gov/casos/${fl.id}/relatorio`, { cookie: admin, query: { tipo: 'comercial' } });
  assert.equal(n.statusCode, 501);
  assert.equal(J(n).error.code, 'NOT_IMPLEMENTED');
  assert.equal((await v1(`gov/casos/${tupa.id}/relatorio`, { cookie: admin })).statusCode, 400);
});
