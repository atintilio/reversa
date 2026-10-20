// Enriquecimento por CNPJ (BrasilAPI) com fetch falso: grava, sugere contato, respeita 30 dias e falha em silêncio.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, freshRequire } = require('./helpers');

let sql; let enr; let ctx; let tp;
let chamadas = 0;
const resposta = { razao_social: 'EMPRESA X LTDA', nome_fantasia: 'Empresa X', descricao_porte: 'DEMAIS', cnae_fiscal: 6201501, cnae_fiscal_descricao: 'Desenvolvimento de software',
  natureza_juridica: 'Sociedade Empresária Limitada', municipio: 'FLORIANOPOLIS', uf: 'SC', descricao_situacao_cadastral: 'ATIVA', data_inicio_atividade: '2015-03-01',
  capital_social: 100000, email: 'Contato@Empresa.com', ddd_telefone_1: '4833334444', qsa: [{ nome_socio: 'Maria', qualificacao_socio: 'Sócio-Administrador' }] };

test.before(async () => {
  const d = await createDb(); sql = d.sql;
  freshRequire('lib/db').setSqlForTests(sql);
  enr = freshRequire('lib/enriquecimento');
  const orgId = (await sql`select id from organizations limit 1`)[0].id;
  const uid = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('a@x.com','a@x.com','Ana','x','active') returning id`)[0].id;
  ctx = { organization: { id: orgId }, user: { id: uid } };
  tp = (await sql`insert into taxpayers (organization_id, legal_name, cnpj, cnpj_normalized) values (${orgId}, 'Empresa X', '11222333000181', '11222333000181') returning id`)[0].id;
});

test('grava enriquecimento, sugere contato não confirmado e registra atividade', async () => {
  enr.setFetchForTests(async (url) => { chamadas++; assert.match(url, /11222333000181$/); return { ok: true, json: async () => resposta }; });
  const r = await enr.enriquecer(ctx, tp, null);
  assert.equal(r.consultado, true); assert.equal(r.sugerido, true);
  const m = (await sql`select metadata from taxpayers where id = ${tp}`)[0].metadata;
  assert.equal(m.enriquecimento.porte, 'DEMAIS'); assert.equal(m.enriquecimento.uf, 'SC'); assert.equal(m.enriquecimento.socios[0].nome, 'Maria');
  const k = (await sql`select role, email, is_primary from crm_contacts where taxpayer_id = ${tp}`);
  assert.equal(k.length, 1); assert.equal(k[0].is_primary, false); assert.match(k[0].role, /^Sugerido \(Receita\)/); assert.equal(k[0].email, 'contato@empresa.com');
  assert.equal((await sql`select count(*)::int n from crm_activities where subject = 'Cadastro enriquecido pela Receita'`)[0].n, 1);
});

test('segunda chamada dentro de 30 dias não consulta de novo', async () => {
  const antes = chamadas;
  const r = await enr.enriquecer(ctx, tp, null);
  assert.equal(r.consultado, false); assert.equal(chamadas, antes);
});

test('falha de rede ou resposta ruim é silenciosa', async () => {
  await sql`update taxpayers set metadata = '{}'::jsonb where id = ${tp}`;
  enr.setFetchForTests(async () => { throw new Error('rede fora'); });
  assert.deepEqual(await enr.enriquecer(ctx, tp, null), { consultado: false });
  enr.setFetchForTests(async () => ({ ok: false }));
  assert.deepEqual(await enr.enriquecer(ctx, tp, null), { consultado: false });
  enr.setFetchForTests(null);
});
