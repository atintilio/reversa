// Apollo.io (fetch falso, sem rede): desligado sem chave, fluxo feliz, cache de 30 dias, teto diário, duplicidade e falha silenciosa.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, freshRequire } = require('./helpers');

let sql; let apollo; let enr; let ctx; let orgId; let n = 0;
let chamadas = [];
const org = { id: 'o1', name: 'Empresa X Comercio', primary_domain: 'empresax.com.br', website_url: 'https://empresax.com.br', linkedin_url: 'https://linkedin.com/company/x', city: 'Florianopolis', state: 'SC', estimated_num_employees: 120, industry: 'varejo' };
const pessoas = [{ id: 'p1', first_name: 'Joao', title: 'Gerente Comercial' }, { id: 'p2', first_name: 'Carla', title: 'Controller' }, { id: 'p3', first_name: 'Ana', title: 'Diretora Financeira' }];
const falso = (opts = {}) => async (url, init) => {
  chamadas.push(url);
  if (opts.rede) throw new Error('rede');
  const body = JSON.parse(init.body);
  assert.equal(init.headers['x-api-key'], 'chave-teste');
  if (/mixed_companies/.test(url)) return { ok: true, json: async () => ({ organizations: opts.outraEmpresa ? [{ id: 'z', name: 'Padaria Zeta' }] : [org] }) };
  if (/api_search/.test(url)) return { ok: true, json: async () => ({ people: pessoas }) };
  if (/people\/match/.test(url)) { assert.equal(body.id, 'p3'); return { ok: true, json: async () => ({ person: { name: 'Ana Souza', title: 'Diretora Financeira', email: 'Ana@EmpresaX.com.br', phone_numbers: [{ sanitized_number: '+5548999990000' }], linkedin_url: 'https://linkedin.com/in/ana' } }) }; }
  return { ok: false };
};
const novoCliente = async (cnpj) => (await sql`insert into taxpayers (organization_id, legal_name, cnpj, cnpj_normalized) values (${orgId}, 'Empresa X Comercio LTDA', ${cnpj}, ${cnpj}) returning id`)[0].id;
const meta = async (id) => (await sql`select metadata from taxpayers where id = ${id}`)[0].metadata;

test.before(async () => {
  const d = await createDb(); sql = d.sql;
  freshRequire('lib/db').setSqlForTests(sql);
  apollo = freshRequire('lib/apollo'); enr = freshRequire('lib/enriquecimento');
  orgId = (await sql`select id from organizations limit 1`)[0].id;
  const uid = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('a@x.com','a@x.com','Ana','x','active') returning id`)[0].id;
  ctx = { organization: { id: orgId }, user: { id: uid } };
});
test.beforeEach(() => { chamadas = []; process.env.APOLLO_API_KEY = 'chave-teste'; delete process.env.APOLLO_MAX_DIA; apollo.setFetchForTests(falso()); });
test.after(() => { delete process.env.APOLLO_API_KEY; });

test('sem APOLLO_API_KEY o módulo fica desligado e nada é chamado', async () => {
  delete process.env.APOLLO_API_KEY;
  const t = await novoCliente('11222333000181');
  assert.deepEqual(await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'] }), { ativo: false });
  assert.equal(chamadas.length, 0);
});

test('fluxo feliz: organização, melhor cargo (financeiro), 1 enriquecimento e contato sugerido', async () => {
  const t = await novoCliente('22333444000181');
  const r = await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'] });
  assert.equal(r.consultado, true); assert.equal(r.sugerido, true);
  assert.equal(chamadas.filter((u) => /people\/match/.test(u)).length, 1);
  const a = (await meta(t)).apollo;
  assert.equal(a.organizacao.dominio, 'empresax.com.br'); assert.equal(a.organizacao.uf, 'SC');
  assert.equal(a.responsavel.cargo, 'Diretora Financeira'); assert.equal(a.responsavel.email, 'ana@empresax.com.br'); assert.equal(a.responsavel.fonte, 'Apollo.io');
  const k = await sql`select role, is_primary, email from crm_contacts where taxpayer_id = ${t}`;
  assert.equal(k.length, 1); assert.equal(k[0].is_primary, false); assert.match(k[0].role, /Sugerido \(Apollo\)/);
  assert.equal((await sql`select count(*)::int n from crm_activities where taxpayer_id = ${t} and subject = 'Responsável sugerido pelo Apollo'`)[0].n, 1);
  assert.ok((await sql`select count(*)::int n from audit_events where event_type = 'apollo.call'`)[0].n >= 3);
});

test('empresa de nome diferente é descartada (não grava dado de outra empresa)', async () => {
  apollo.setFetchForTests(falso({ outraEmpresa: true }));
  const t = await novoCliente('33444555000181');
  const r = await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'] });
  assert.equal(r.encontrada, false); assert.equal((await meta(t)).apollo.organizacao, null);
  assert.equal((await sql`select count(*)::int n from crm_contacts where taxpayer_id = ${t}`)[0].n, 0);
});

test('cache de 30 dias evita nova consulta; forçar ignora o cache', async () => {
  const t = await novoCliente('44555666000181');
  await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'] });
  chamadas = [];
  const r2 = await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'] });
  assert.equal(r2.cache, true); assert.equal(chamadas.length, 0);
  const r3 = await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'], forcar: true });
  assert.equal(r3.consultado, true); assert.ok(chamadas.length >= 3);
});

test('teto diário: ao atingir, guarda o candidato sem e-mail e não chama o match', async () => {
  const hoje = `apollo.uso.${new Date().toISOString().slice(0, 10)}`;
  await sql`delete from system_parameters where key = ${hoje}`;
  process.env.APOLLO_MAX_DIA = '1';
  const t1 = await novoCliente('55666777000181'); const t2 = await novoCliente('66777888000181');
  await apollo.enriquecer(ctx, t1, null, { nomes: ['Empresa X'] });
  chamadas = [];
  const r = await apollo.enriquecer(ctx, t2, null, { nomes: ['Empresa X'] });
  assert.equal(r.limiteDiario, true); assert.equal(chamadas.filter((u) => /people\/match/.test(u)).length, 0);
  const a = (await meta(t2)).apollo; assert.equal(a.responsavel.email, null); assert.equal(a.limiteDiario, true);
});

test('não duplica contato por e-mail já cadastrado', async () => {
  const t = await novoCliente('77888999000181');
  await sql`insert into crm_contacts (organization_id, taxpayer_id, name, role, email, is_primary) values (${orgId}, ${t}, 'Ana S', 'Financeiro', 'ana@empresax.com.br', true)`;
  const r = await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'], forcar: true });
  assert.equal(r.sugerido, false);
  assert.equal((await sql`select count(*)::int n from crm_contacts where taxpayer_id = ${t}`)[0].n, 1);
});

test('falha de rede é silenciosa', async () => {
  apollo.setFetchForTests(falso({ rede: true }));
  const t = await novoCliente('88999000000181');
  const r = await apollo.enriquecer(ctx, t, null, { nomes: ['Empresa X'] });
  assert.notEqual(r.consultado, undefined);
});

test('Receita: endereço, regime da Receita ao lado do SPED e divergência sem sobrescrever', async () => {
  const t = (await sql`insert into taxpayers (organization_id, legal_name, cnpj, cnpj_normalized, tax_regime) values (${orgId}, 'Empresa Y', '99000111000181', '99000111000181', 'Lucro Presumido') returning id`)[0].id;
  enr.setFetchForTests(async () => ({ ok: true, json: async () => ({ razao_social: 'EMPRESA Y LTDA', nome_fantasia: 'Y', descricao_tipo_de_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '10', bairro: 'CENTRO', cep: '88010000', municipio: 'FLORIANOPOLIS', uf: 'SC',
    regime_tributario: [{ ano: 2023, forma_de_tributacao: 'LUCRO PRESUMIDO' }, { ano: 2024, forma_de_tributacao: 'LUCRO REAL' }], opcao_pelo_simples: false }) }));
  apollo.setFetchForTests(falso({ outraEmpresa: true }));
  await enr.enriquecer(ctx, t, null, {});
  const m = await meta(t);
  assert.equal(m.enriquecimento.endereco.logradouro, 'RUA DAS FLORES'); assert.equal(m.enriquecimento.endereco.cep, '88010000');
  assert.deepEqual(m.enriquecimento.regimeReceita, { valor: 'LUCRO REAL', ano: 2024, fonte: 'BrasilAPI (Receita Federal)' });
  assert.deepEqual(m.enriquecimento.divergenciaRegime, { sped: 'Lucro Presumido', receita: 'LUCRO REAL' });
  assert.equal((await sql`select tax_regime from taxpayers where id = ${t}`)[0].tax_regime, 'Lucro Presumido');
});
