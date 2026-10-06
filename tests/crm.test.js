// CRM nativo: funil, contatos, linha do tempo, tarefas, CNPJ público e agente de IA (Qwen via endpoint compatível).
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
delete process.env.LLM_API_KEY;

const chamadasLLM = [];
let respostaLLM = null;
global.fetch = async (url, op) => {
  const u = String(url);
  if (u.includes('brasilapi.com.br/api/cnpj/v1/11222333000181')) {
    return new Response(JSON.stringify({
      razao_social: 'METALURGICA TESTE LTDA', descricao_situacao_cadastral: 'ATIVA', data_inicio_atividade: '2001-05-10', porte: 'DEMAIS',
      capital_social: 500000, municipio: 'JOINVILLE', uf: 'SC', cnae_fiscal: 2539001, cnae_fiscal_descricao: 'Serviços de usinagem',
      cnaes_secundarios: [{ codigo: 4744099, descricao: 'Comércio varejista de materiais de construção' }], opcao_pelo_simples: false,
      qsa: [{ nome_socio: 'PESSOA FISICA' }]
    }), { status: 200 });
  }
  if (u.endsWith('/chat/completions')) { chamadasLLM.push(JSON.parse(op.body)); return new Response(JSON.stringify(respostaLLM), { status: 200 }); }
  throw new Error('fetch inesperado: ' + u);
};
const origError = console.error; console.error = () => {};

let sql; let api; let H; let org; let outraOrg; let admin; let leitor; let outro; let adminId;
const SENHA = 'Senha-forte-123';
async function user(email, name, orgId, role) {
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${await bcrypt.hash(SENHA, 4)}, 'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, 'active')`;
  return u.id;
}
const login = async (email) => cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha: SENHA } }));
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);
let cliente; let caso;

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login') };
  org = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  outraOrg = (await sql`insert into organizations (name) values ('Outra') returning id`)[0].id;
  adminId = await user('admin@argus.com', 'Admin', org, 'admin'); admin = await login('admin@argus.com');
  await user('leo@argus.com', 'Leo', org, 'viewer'); leitor = await login('leo@argus.com');
  await user('bia@outra.com', 'Bia', outraOrg, 'admin'); outro = await login('bia@outra.com');
  const r = J(await v1('taxpayers', { method: 'POST', cookie: admin, body: { legalName: 'Metalúrgica Teste Ltda', cnpj: '11222333000181', taxRegime: 'Lucro Real' } }));
  cliente = r.id; caso = r.caseId;
  await v1('taxpayers/' + cliente, { method: 'PATCH', cookie: admin, body: { perfil: { industria: true, folha: true, st: false } } });
});
test.after(() => { console.error = origError; });

test('CRM-001 funil traz o cliente na fase do caso com o resumo do diagnóstico por grupo', async () => {
  const p = J(await v1('crm/pipeline', { cookie: leitor }));
  const c = p.clientes.find((x) => x.id === cliente);
  assert.equal(c.stage, 'a_apresentar'); assert.equal(c.caseId, caso);
  assert.deepEqual(c.diagnostico.map((g) => g.id), ['fiscal', 'prev']);
  assert.ok(c.diagnostico[0].total > 0 && c.diagnostico[1].total > 0);
  assert.equal(c.diagnostico[0].teses, undefined, 'o funil não carrega a lista inteira de teses');
  assert.equal(J(await v1('crm/pipeline', { cookie: outro })).clientes.length, 0, 'isolamento entre organizações');
});

test('CRM-002 contatos: criar, principal único, editar, remover; outra organização não enxerga', async () => {
  const a = J(await v1('crm/contacts', { method: 'POST', cookie: admin, body: { taxpayerId: cliente, name: 'Carla Diretora', role: 'CFO', email: 'carla@cliente.com', primary: true } })).id;
  const b = J(await v1('crm/contacts', { method: 'POST', cookie: admin, body: { taxpayerId: cliente, name: 'Rui Contador', primary: true } })).id;
  let f = J(await v1('crm/clients/' + cliente, { cookie: admin }));
  assert.deepEqual(f.contatos.filter((k) => k.primary).map((k) => k.id), [b]);
  assert.equal((await v1('crm/contacts', { method: 'POST', cookie: admin, body: { taxpayerId: cliente, name: 'X', email: 'invalido' } })).statusCode, 400);
  assert.equal((await v1('crm/contacts/' + a, { method: 'PATCH', cookie: outro, body: { name: 'Hack' } })).statusCode, 404);
  assert.equal((await v1('crm/clients/' + cliente, { cookie: outro })).statusCode, 404);
  await v1('crm/contacts/' + a, { method: 'DELETE', cookie: admin });
  f = J(await v1('crm/clients/' + cliente, { cookie: admin }));
  assert.equal(f.contatos.length, 1);
});

test('CRM-003 linha do tempo e tarefas: prazo obrigatório, atraso contado, concluir', async () => {
  assert.equal((await v1('crm/activities', { method: 'POST', cookie: admin, body: { taxpayerId: cliente, type: 'task', subject: 'Ligar' } })).statusCode, 400);
  await v1('crm/activities', { method: 'POST', cookie: admin, body: { taxpayerId: cliente, type: 'call', subject: 'Primeira ligação', body: 'Interesse em PIS/COFINS' } });
  const ontem = new Date(Date.now() - 86400000).toISOString();
  const t = J(await v1('crm/activities', { method: 'POST', cookie: admin, body: { taxpayerId: cliente, type: 'task', subject: 'Enviar proposta', dueAt: ontem } })).id;
  let c = J(await v1('crm/pipeline', { cookie: admin })).clientes.find((x) => x.id === cliente);
  assert.equal(c.openTasks, 1); assert.equal(c.overdueTasks, 1);
  const minhas = J(await v1('crm/tasks', { cookie: admin }));
  assert.equal(minhas.tarefas.length, 1); assert.equal(minhas.tarefas[0].legalName, 'Metalúrgica Teste Ltda');
  await v1('crm/activities/' + t, { method: 'PATCH', cookie: admin, body: { done: true } });
  c = J(await v1('crm/pipeline', { cookie: admin })).clientes.find((x) => x.id === cliente);
  assert.equal(c.openTasks, 0);
  const f = J(await v1('crm/clients/' + cliente, { cookie: admin }));
  assert.ok(f.atividades.find((a) => a.type === 'call' && a.doneAt), 'ligação entra como registro concluído');
  assert.equal(f.atividades.find((a) => a.id === t).createdBy, 'Admin');
});

test('CRM-004 leitor só lê; fase, próximo passo e previsão vão no caso e aparecem no histórico', async () => {
  assert.equal((await v1('crm/activities', { method: 'POST', cookie: leitor, body: { taxpayerId: cliente, type: 'note', body: 'x' } })).statusCode, 403);
  assert.equal((await v1('cases/' + caso, { method: 'PATCH', cookie: admin, body: { expectedCloseDate: '31/12/2026' } })).statusCode, 400);
  await v1('cases/' + caso, { method: 'PATCH', cookie: admin, body: { stage: 'apresentado', nextStep: 'Enviar proposta', expectedCloseDate: '2026-12-15' } });
  const f = J(await v1('crm/clients/' + cliente, { cookie: admin }));
  assert.equal(f.cliente.caso.stage, 'apresentado'); assert.equal(f.cliente.caso.nextStep, 'Enviar proposta');
  assert.equal(String(f.cliente.caso.expectedCloseDate).slice(0, 10), '2026-12-15');
  assert.equal(f.fases[0].to, 'apresentado');
  await v1('cases/' + caso, { method: 'PATCH', cookie: admin, body: { nextStep: '' } });
  assert.equal(J(await v1('crm/clients/' + cliente, { cookie: admin })).cliente.caso.nextStep, null);
});

test('CRM-005 CNPJ público: grava dados sem sócios e sugere perfil pela CNAE', async () => {
  const r = J(await v1('crm/clients/' + cliente + '/cnpj', { method: 'POST', cookie: admin }));
  assert.equal(r.publico.cnae.codigo, '2539001'); assert.equal(r.publico.qsa, undefined);
  assert.equal(r.sugestaoPerfil.industria.valor, true); assert.equal(r.sugestaoPerfil.comercio.valor, true);
  const f = J(await v1('crm/clients/' + cliente, { cookie: admin }));
  assert.equal(f.cliente.publico.municipio, 'JOINVILLE');
});

test('CRM-006 agente: desligado sem chave; com chave grava análise saneada (sem tese vermelha, só flags válidas)', async () => {
  const off = await v1('crm/clients/' + cliente + '/agent', { method: 'POST', cookie: admin, body: {} });
  assert.equal(off.statusCode, 503);
  process.env.LLM_API_KEY = 'chave-teste'; process.env.LLM_BASE_URL = 'https://llm.teste/v1';
  respostaLLM = { choices: [{ message: { content: '```json\n' + JSON.stringify({
    resumo: 'Indústria metalúrgica em Joinville com folha relevante.',
    perfil_sugerido: [{ flag: 'comercio', valor: true, evidencia: 'CNAE secundária 4744-0/99' }, { flag: 'inventada', valor: true, evidencia: 'x' }, { flag: 'industria', valor: true, evidencia: 'já marcado' }],
    teses_prioritarias: [{ id: 'T001', motivo: 'Pacificada' }, { id: 'T041', motivo: 'vermelha' }, { id: 'T999', motivo: 'não existe' }],
    perguntas: ['Qual o faturamento anual?'], proximos_passos: ['Pedir EFD-Contribuições'], alertas: []
  }) + '\n```' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } };
  const r = J(await v1('crm/clients/' + cliente + '/agent', { method: 'POST', cookie: admin, body: {} }));
  assert.deepEqual(r.analise.tesesPrioritarias.map((t) => t.id), ['T001']);
  assert.deepEqual(r.analise.perfilSugerido.map((p) => p.flag), ['comercio']);
  const req = chamadasLLM[0];
  assert.equal(req.model, 'qwen-flash'); assert.equal(req.response_format.type, 'json_object');
  assert.match(req.messages[1].content, /CNAE principal: 2539001/);
  assert.match(req.messages[0].content, /não é crédito/);
  assert.doesNotMatch(req.messages[1].content, /PESSOA FISICA/);
  const f = J(await v1('crm/clients/' + cliente, { cookie: admin }));
  const a = f.atividades.find((x) => x.type === 'agent');
  assert.equal(a.subject, 'Análise do agente'); assert.match(a.body, /Pedir EFD-Contribuições/);
  assert.equal((await v1('crm/activities/' + a.id, { method: 'PATCH', cookie: admin, body: { body: 'editado' } })).statusCode, 400);
  respostaLLM = { choices: [{ message: { content: 'Comece pelo Tema 69.' } }] };
  const p = J(await v1('crm/clients/' + cliente + '/agent', { method: 'POST', cookie: admin, body: { pergunta: 'Por onde começo?' } }));
  assert.equal(p.texto, 'Comece pelo Tema 69.');
  assert.equal(chamadasLLM[1].response_format, undefined);
  delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL;
});

test('CRM-007 diagnóstico: grupos separados, segurança e base legal em cada tese', () => {
  const d = freshRequire('lib/diagnostico').diagnosticar({ regime: 'Lucro Real', perfil: { industria: true, folha: true } });
  const fiscal = d[0]; const prev = d[1];
  assert.ok(fiscal.teses.every((t) => t.tributo !== 'Previdenciário'));
  assert.ok(prev.teses.every((t) => t.tributo === 'Previdenciário'));
  const t1 = fiscal.teses.find((t) => t.id === 'T001');
  assert.equal(t1.seguranca, 'verde'); assert.ok(t1.base && t1.maturidade && t1.origem);
  assert.equal(fiscal.verde + fiscal.amarelo + fiscal.vermelho, fiscal.total);
});

test('CRM-008 exportar diagnóstico: PDF executivo completo e por grupo; outra organização não acessa', async () => {
  const r = await v1('crm/clients/' + cliente + '/report', { cookie: leitor });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'application/pdf');
  assert.match(r.headers['content-disposition'], /attachment; filename="Diagnostico-Preliminar-Metalurgica-Teste-Ltda\.pdf"/);
  const pdf = Buffer.from(r.body, 'latin1');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const prev = await v1('crm/clients/' + cliente + '/report', { cookie: admin, query: { grupo: 'prev' } });
  assert.match(prev.headers['content-disposition'], /Previdenciario\.pdf/);
  assert.equal((await v1('crm/clients/' + cliente + '/report', { cookie: outro })).statusCode, 404);
});

test('CRM-009 falha do serviço externo vira 502 com mensagem clara', async () => {
  const orig = global.fetch;
  global.fetch = async () => { throw new TypeError('fetch failed'); };
  const r = await v1('crm/clients/' + cliente + '/cnpj', { method: 'POST', cookie: admin });
  global.fetch = orig;
  assert.equal(r.statusCode, 502);
  assert.match(J(r).error.message, /indisponível/);
});
