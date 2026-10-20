// Relatório semanal: autenticação do cron, ranking, variação, pendências e envio.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, freshRequire, call } = require('./helpers');

process.env.CRON_SECRET = 'segredo-cron-teste';
delete process.env.MS_CLIENT_SECRET;
const origError = console.error; console.error = () => {};
let sql; let handler; let Rel; let parceiroA; let parceiroB;
const H = (extra = {}) => ({ authorization: 'Bearer segredo-cron-teste', ...extra });

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  handler = freshRequire('api/cron-semanal');
  Rel = freshRequire('lib/relatorio-semanal');
  parceiroA = (await sql`insert into organizations (name, kind) values ('Parceiro A', 'parceiro') returning id`)[0].id;
  parceiroB = (await sql`insert into organizations (name, kind) values ('Parceiro B', 'parceiro') returning id`)[0].id;
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('u@x.com', 'u@x.com', 'U', 'x', 'active') returning id`)[0].id;
  async function cliente(org, cnpj, nome, valor, tipo = 'pis_cofins') {
    const t = (await sql`insert into taxpayers (organization_id, cnpj, cnpj_normalized, legal_name) values (${org}, ${cnpj}, ${cnpj}, ${nome}) returning id`)[0].id;
    const c = (await sql`insert into tax_cases (organization_id, title, taxpayer_id, estimated_value) values (${org}, ${'Caso ' + nome}, ${t}, ${valor}) returning id`)[0].id;
    await sql`insert into diagnostics (organization_id, taxpayer_id, tax_case_id, code, tipo, versao, valor_total, valor_no_prazo, created_by)
              values (${org}, ${t}, ${c}, ${'DX-2026-' + cnpj.slice(-4)}, ${tipo}, 1, ${valor}, ${valor}, ${u})`;
    return { t, c };
  }
  const a = await cliente(parceiroA, '11111111000111', 'Cliente A', 1000);
  await cliente(parceiroB, '22222222000122', 'Cliente B', 5000);
  await sql`insert into audit_events (organization_id, event_type, entity_type, entity_id, outcome, metadata)
            values (${parceiroA}, 'case.stage_changed', 'tax_case', ${a.c}, 'success', '{"to":"contrato"}'::jsonb)`;
  await sql`insert into crm_activities (organization_id, taxpayer_id, type, subject, meta) values (${parceiroA}, ${a.t}, 'task', 'Informar e-mail do contato', '{"pendencia":true}'::jsonb)`;
});
test.after(() => { console.error = origError; });

test('RS-001 cron exige GET, segredo configurado e Bearer correto', async () => {
  assert.equal((await call(handler, { method: 'POST', headers: H() })).statusCode, 405);
  assert.equal((await call(handler, { headers: {} })).statusCode, 401);
  assert.equal((await call(handler, { headers: { authorization: 'Bearer errado' } })).statusCode, 401);
  const salvo = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
  assert.equal((await call(handler, { headers: H() })).statusCode, 503);
  process.env.CRON_SECRET = salvo;
});

test('RS-002 dry=1 devolve ranking (contratos, depois créditos), totais e pendências sem enviar', async () => {
  const r = await call(handler, { headers: H(), query: { dry: '1' } });
  assert.equal(r.statusCode, 200);
  const j = JSON.parse(r.body);
  assert.equal(j.dry, true);
  assert.equal(j.top[0].nome, 'Parceiro A'); // 1 contrato na semana vence, apesar de menos créditos
  assert.equal(j.top[1].nome, 'Parceiro B');
  assert.equal(j.totais.diagnosticos, 2);
  assert.equal(j.totais.contratos, 1);
  assert.equal(j.totais.creditos, 6000);
  assert.equal(j.pendencias.length, 1);
  assert.match(j.html, /Top 10 parceiros/);
  assert.match(j.html, /Informar e-mail do contato/);
  assert.deepEqual(j.destinatarios, ['atintilio@argusprime.com.br']);
});

test('RS-003 variação contra a semana anterior e escape de HTML', async () => {
  assert.equal(Rel.variacao(3, 2), '+1 (+50%)');
  assert.equal(Rel.variacao(0, 0), '—');
  assert.equal(Rel.variacao(2, 0), '+2 (novo)');
  const futuro = new Date(Date.now() + 10 * 864e5); // dados atuais caem na "semana anterior" da janela deslocada
  const d = await Rel.coletar(new Date(Date.now() + 10 * 864e5));
  assert.equal(d.totais.diagnosticos, 0);
  assert.equal(d.totais.diagnosticosAnt, 2);
  assert.ok(futuro);
  assert.ok(!Rel.renderHtml({ ...d, top: [{ nome: '<script>x</script>', diagnosticos: 0, oportunidades: 0, contratos: 0, valorContratos: 0, creditos: 0 }] }).includes('<script>x'));
});

test('RS-004 sem provedor de e-mail configurado o envio falha de forma explícita (502)', async () => {
  const r = await call(handler, { headers: H() });
  assert.equal(r.statusCode, 502);
  const j = JSON.parse(r.body);
  assert.equal(j.enviado, false);
  assert.equal(j.envios[0].ok, false);
});
