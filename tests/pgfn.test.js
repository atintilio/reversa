// Transação PGFN: motor determinístico + domínio/API (acesso, cálculo gravado, simulador de rating, revisão do brief).
process.env.SESSION_SECRET = 'pgfn-test-secret';
process.env.APP_BASE_URL = 'https://reversa.test';
process.env.LEGACY_AUTH_UNTIL = 'off';
process.env.REVERSA_MASTER_EMAILS = 'andre@argus.test';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const Motor = require('../lib/pgfn');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

const D = (o) => ({ debtKind: 'tributario', administrativeStatus: 'ativa', inscriptionDate: '2023-05-10', referenceDate: '2026-10-01', ...o });
const base = () => ({
  debts: [D({ externalDebtReference: 'CDA1', principalAmount: 600000, updatedBalance: 1000000 }), D({ externalDebtReference: 'CDA2', debtKind: 'previdenciario', principalAmount: 200000, updatedBalance: 300000 })],
  facts: { perfil: 'geral', capagValue: { value: 400000, status: 'confirmado' }, monthlyCashCapacity: { value: 30000 }, selicAnnual: { value: 0.14 }, discountRateAnnual: { value: 0.18 }, devedorContumaz: false, transacaoRescindida2anos: false, passivoRfb: { value: 100000 } }
});

test('PGFN-001: motor é determinístico e o hash muda com qualquer insumo', () => {
  const a = Motor.calcular(base()), b = Motor.calcular(base());
  assert.equal(a.inputHash, b.inputHash); assert.deepEqual(a.scenarios.map((s) => s.nominalCost), b.scenarios.map((s) => s.nominalCost));
  const c = base(); c.facts.monthlyCashCapacity.value = 31000;
  assert.notEqual(Motor.calcular(c).inputHash, a.inputHash);
});

test('PGFN-002: A/B não tem desconto; C/D desconta só acréscimos, até 65% do total, e nunca o principal', () => {
  const cd = Motor.calcular(base()); assert.equal(cd.grupoCapag, 'CD');
  const s = cd.scenarios.find((x) => x.scenarioKey === 'cd_60x');
  assert.equal(s.desconto, 500000); // 400.000 (CDA1) + 100.000 (CDA2): ambos abaixo do teto de 65%
  const ab = base(); ab.facts.capagValue = { value: 5000000 };
  const r = Motor.calcular(ab); assert.equal(r.grupoCapag, 'AB'); assert.ok(r.scenarios.every((x) => x.desconto === 0));
  const teto = { debts: [D({ principalAmount: 200000, updatedBalance: 1000000 })], facts: { capagValue: 1000 } };
  assert.equal(Motor.calcular(teto).scenarios.find((x) => x.scenarioKey === 'cd_60x').desconto, 650000); // teto 65% (acréscimos 800.000)
  const dif = { debts: teto.debts, facts: { capagValue: 1000, perfil: 'diferenciado' } };
  assert.equal(Motor.calcular(dif).scenarios.find((x) => x.scenarioKey === 'cd_60x').desconto, 700000); // ME/EPP: 70%
});

test('PGFN-003: previdenciário limitado a 60 prestações; excluídas ficam fora; ausência não vira zero', () => {
  const r = Motor.calcular(base());
  const max = r.scenarios.find((x) => x.scenarioKey === 'cd_114x');
  assert.ok(max.assumptions.some((a) => /60 prestações/.test(a)));
  assert.equal(max.fluxo.filter((f) => f.tipo === 'saldo').length, 114);
  const comExcl = base(); comExcl.debts.push(D({ externalDebtReference: 'X', administrativeStatus: 'suspensa', principalAmount: 10, updatedBalance: 20 }), D({ externalDebtReference: 'Y', inscriptionDate: '2026-08-01', principalAmount: 10, updatedBalance: 20 }));
  const e = Motor.calcular(comExcl); assert.equal(e.foraDoCalculo.length, 2); assert.equal(e.consolidadoElegivel, 1300000);
  const vazio = Motor.calcular({ debts: base().debts, facts: {} });
  assert.equal(vazio.grupoCapag, null); assert.ok(vazio.missingInputs.some((m) => /CAPAG/.test(m)));
  assert.ok(vazio.scenarios.every((s) => s.viability !== 'viavel')); // sem classificação nunca é "viável" pleno
  assert.ok(vazio.scenarios.every((s) => s.pv === null)); // sem taxa, sem valor presente inventado
});

test('PGFN-004: restrições com código, status e base; P07 reprova prestação acima do caixa', () => {
  const x = base(); x.facts.monthlyCashCapacity = { value: 5000 };
  const r = Motor.calcular(x);
  const s = r.scenarios.find((c) => c.scenarioKey === 'cd_114x');
  const p07 = s.constraintResults.find((c) => c.ruleCode === 'P07');
  assert.equal(p07.evaluationStatus, 'violated'); assert.equal(s.viability, 'inviavel'); assert.equal(s.recommendation, 'do_not_recommend');
  assert.ok(s.constraintResults.every((c) => /^P(0[1-9]|1[0-2])$/.test(c.ruleCode) && c.sourceRefs.length));
  assert.equal(r.melhor, null);
  const ok = Motor.calcular(base()); assert.equal(ok.melhor, 'cd_114x');
});

test('PGFN-005: simulador de rating diz se mudar é bom ou ruim e quanto; nada é gravado', () => {
  const r = Motor.calcular(base()).ratingWhatIf;
  assert.equal(r.atual.grupo, 'CD'); assert.ok(r.ganhoDoGrupoCD > 0); assert.equal(r.direcao.paraAB, 'ruim');
  assert.match(r.veredito, /Subir para A\/B custaria/); assert.ok(r.caminhosLegitimos.some((c) => /revisão da CAPAG/i.test(c.via)));
  const sub = Motor.simularRating(base(), { capagRevisada: 5000000 });
  assert.equal(sub.atual.grupo, 'AB'); assert.match(sub.veredito, /sem desconto/);
  assert.equal(Motor.ratingWhatIf({ debts: [], facts: {} }).disponivel, false);
});

// ---- API --------------------------------------------------------------------------------------------------------------------
let sql, db, api, master, analista, leitor, parceiro, id;
const json = (r) => JSON.parse(r.body);
const v1 = (path, o = {}) => call(api, { ...o, url: '/api/v1/' + path, query: { ...(o.query || {}), ...(path.split('/').length > 1 ? { rvpath: path } : {}) } });
test.before(async () => {
  ({ sql, db } = await createDb()); freshRequire('lib/db').setSqlForTests(sql); api = freshRequire('api/v1/[...route]');
  const plat = (await sql`select id from organizations where kind = 'plataforma'`)[0].id;
  const parc = (await sql`insert into organizations (name, kind) values ('Parceiro X', 'parceiro') returning id`)[0].id;
  async function login(email, org, role) {
    const hash = await bcrypt.hash('senha-de-teste', 4);
    const uid = (await sql`insert into users (email,email_normalized,name,password_hash,status) values (${email},${email},${email.split('@')[0]},${hash},'active') returning id`)[0].id;
    await sql`insert into organization_members (organization_id,user_id,role,status) values (${org},${uid},${role},'active')`;
    return cookieFrom(await call(freshRequire('api/login'), { method: 'POST', body: { usuario: email, senha: 'senha-de-teste' } }));
  }
  master = await login('andre@argus.test', plat, 'owner'); analista = await login('analista@argus.test', plat, 'analyst');
  leitor = await login('leitor@argus.test', plat, 'viewer'); parceiro = await login('parceiro@x.test', parc, 'admin');
});
test.after(async () => { await db.close(); });

test('PGFN-006: só a plataforma opera; leitor não grava; parceiro nem lista', async () => {
  assert.equal((await v1('pgfn', { cookie: parceiro })).statusCode, 403);
  assert.equal((await v1('pgfn', { cookie: parceiro, method: 'POST', body: { cnpj: '11222333000181' } })).statusCode, 403);
  assert.equal((await v1('pgfn', { cookie: leitor, method: 'POST', body: { cnpj: '11222333000181' } })).statusCode, 403);
  assert.equal((await v1('pgfn')).statusCode, 401);
  const c = await v1('pgfn', { cookie: analista, method: 'POST', body: { cnpj: '11.222.333/0001-81', legalName: 'Cliente PGFN' } });
  assert.equal(c.statusCode, 201, c.body); id = json(c).id;
  assert.equal(json(await v1('pgfn', { cookie: analista, method: 'POST', body: { cnpj: '11222333000181' } })).id, id); // mesmo caso, sem duplicar
  assert.equal((await v1('pgfn/' + id, { cookie: parceiro })).statusCode, 403);
  assert.equal((await v1('pgfn/' + id, { cookie: leitor })).statusCode, 200);
  assert.equal((await v1(`pgfn/${id}/dividas`, { cookie: leitor, method: 'PUT', body: { debts: [] } })).statusCode, 403);
});

test('PGFN-007: dívidas e fatos validados; cálculo grava corrida, cenários, restrições, sensibilidades e briefs', async () => {
  const b = base();
  assert.equal((await v1(`pgfn/${id}/dividas`, { cookie: analista, method: 'PUT', body: { debts: [{ debtKind: 'inventado', referenceDate: '2026-10-01' }] } })).statusCode, 400);
  assert.equal((await v1(`pgfn/${id}/dividas`, { cookie: analista, method: 'PUT', body: { debts: [{ updatedBalance: -5, referenceDate: '2026-10-01' }] } })).statusCode, 400);
  assert.equal((await v1(`pgfn/${id}/dividas`, { cookie: analista, method: 'PUT', body: { debts: [{ externalDebtReference: 'A', referenceDate: '2026-10-01' }, { externalDebtReference: 'A', referenceDate: '2026-10-01' }] } })).statusCode, 400);
  assert.equal((await v1(`pgfn/${id}`, { cookie: analista, method: 'PATCH', body: { facts: { capagRating: 'Z' } } })).statusCode, 400);
  assert.equal((await v1(`pgfn/${id}`, { cookie: analista, method: 'PATCH', body: { facts: { selicAnnual: 14 } } })).statusCode, 400); // taxa como fração
  assert.equal((await v1(`pgfn/${id}/calcular`, { cookie: analista, method: 'POST' })).statusCode, 400); // sem dívidas
  assert.equal((await v1(`pgfn/${id}/dividas`, { cookie: analista, method: 'PUT', body: { debts: b.debts } })).statusCode, 200);
  assert.equal((await v1(`pgfn/${id}`, { cookie: analista, method: 'PATCH', body: { facts: b.facts } })).statusCode, 200);
  const r = await v1(`pgfn/${id}/calcular`, { cookie: analista, method: 'POST' }); assert.equal(r.statusCode, 200, r.body);
  assert.equal(json(r).viabilityStatus, 'viavel'); assert.equal(json(r).melhor, 'cd_114x');
  const g = json(await v1('pgfn/' + id, { cookie: analista }));
  assert.equal(g.desatualizado, false); assert.equal(g.resultado.runNumber, 1); assert.equal(g.resultado.scenarios.length, 4);
  const melhor = g.resultado.scenarios.find((s) => s.scenarioKey === 'cd_114x');
  assert.equal(melhor.viabilityStatus, 'viavel'); assert.equal(melhor.recommendation, 'recommend'); assert.equal(melhor.constraintResults.length, 12);
  assert.equal(melhor.rateSensitivities.length, 3); assert.equal(melhor.briefs.length, 2);
  assert.ok(g.previa.ratingWhatIf.disponivel);
  const run = (await sql`select input_snapshot, input_hash from pgfn_solver_runs where pgfn_case_id = ${id}`)[0];
  assert.equal(run.input_snapshot.debts.length, 2); assert.match(run.input_hash, /^[0-9a-f]{64}$/);
  // alterar um fato torna o resultado desatualizado; novo cálculo gera a corrida 2
  await v1(`pgfn/${id}`, { cookie: analista, method: 'PATCH', body: { facts: { monthlyCashCapacity: { value: 40000 } } } });
  assert.equal(json(await v1('pgfn/' + id, { cookie: analista })).desatualizado, true);
  await v1(`pgfn/${id}/calcular`, { cookie: analista, method: 'POST' });
  assert.equal(json(await v1('pgfn/' + id, { cookie: analista })).resultado.runNumber, 2);
  // campo enviado vazio remove o fato (não vira zero)
  await v1(`pgfn/${id}`, { cookie: analista, method: 'PATCH', body: { facts: { monthlyCashCapacity: null } } });
  assert.equal(json(await v1('pgfn/' + id, { cookie: analista })).facts.monthlyCashCapacity, undefined);
});

test('PGFN-008: simulador de rating do dossiê e cálculo livre (demonstração) sem gravar', async () => {
  const r = await v1(`pgfn/${id}/rating`, { cookie: analista, method: 'POST', body: { capagRevisada: 9000000 } });
  assert.equal(r.statusCode, 200); assert.equal(json(r).atual.grupo, 'AB');
  assert.equal((await v1(`pgfn/${id}/rating`, { cookie: analista, method: 'POST', body: { capagRevisada: 'x' } })).statusCode, 400);
  const antes = (await sql`select count(*)::int as n from pgfn_solver_runs`)[0].n;
  const b = base();
  const s = await v1('pgfn/simular', { cookie: parceiro, method: 'POST', body: { debts: b.debts, facts: b.facts, rating: { capagRevisada: 5000000 } } });
  assert.equal(s.statusCode, 200, s.body); assert.equal(json(s).grupoCapag, 'CD'); assert.equal(json(s).ratingSimulado.atual.grupo, 'AB'); assert.equal(json(s).resumos.length, 2);
  assert.equal((await sql`select count(*)::int as n from pgfn_solver_runs`)[0].n, antes);
  assert.equal((await v1('pgfn/simular', { cookie: parceiro, method: 'POST', body: { debts: 'x' } })).statusCode, 400);
});

test('PGFN-009: só master aprova o resumo; evento de revisão guarda o snapshot', async () => {
  const g = json(await v1('pgfn/' + id, { cookie: analista }));
  const brief = g.resultado.scenarios.flatMap((s) => s.briefs)[0]; assert.ok(brief);
  assert.equal((await v1(`pgfn/${id}/revisao`, { cookie: analista, method: 'POST', body: { briefId: brief.id, decision: 'approve' } })).statusCode, 403);
  assert.equal((await v1(`pgfn/${id}/revisao`, { cookie: master, method: 'POST', body: { briefId: brief.id, decision: 'talvez' } })).statusCode, 400);
  const ok = await v1(`pgfn/${id}/revisao`, { cookie: master, method: 'POST', body: { briefId: brief.id, decision: 'approve', reason: 'Conferido' } });
  assert.equal(ok.statusCode, 200, ok.body); assert.equal(json(ok).status, 'approved');
  const ev = (await sql`select decision, decision_snapshot from pgfn_review_events`)[0];
  assert.equal(ev.decision, 'approve'); assert.ok(ev.decision_snapshot.message);
});
