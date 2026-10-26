'use strict';
// Ente público (prefeitura, fundos, câmara) no Regime Geral: só teses de folha; terceiros zerado; grupo econômico no cadastro.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const TR = require('../teses-regras.js');
const M = require('../motor-esocial.js');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';

test('ENTE-001: regimeDe reconhece ente público; só folha se aplica, sem T008, T041 e T063', () => {
  assert.equal(TR.regimeDe('Ente público (RGPS)'), 'ente');
  assert.equal(TR.regimeDe('Prefeitura Municipal'), 'ente');
  assert.equal(TR.regimeDe('Lucro Real'), 'real');
  const por = (id) => TR.TESES.find((t) => t.id === id);
  const c = { regime: 'Ente público (RGPS)', perfil: {} };
  assert.equal(TR.avaliar(por('T004'), c).estado, 'provavel', 'salário-maternidade: folha implícita');
  assert.equal(TR.avaliar(por('T061'), c).estado, 'provavel');
  ['T008', 'T041', 'T063'].forEach((id) => assert.equal(TR.avaliar(por(id), c).estado, 'nao', id));
  const fora = TR.TESES.filter((t) => t.tributo !== 'Previdenciário');
  assert.ok(fora.length > 30);
  fora.forEach((t) => assert.equal(TR.avaliar(t, c).estado, 'nao', t.id));
  assert.equal(TR.avaliar(por('T004'), { regime: 'ente', perfil: { folha: false } }).estado, 'nao', 'respeita perfil explícito');
});

// ---- motor eSocial: terceiros zero
const NS = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>18260489</nrInsc></ideEmpregador>';
const xml = (evt, corpo, id) => `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="${NS}/${evt}/v_S_01_02_00"><${evt} Id="${id || 'ID1'}">${emp}${corpo}</${evt}></eSocial>`;
const S1005 = xml('evtTabEstab', `<infoEstab><inclusao><ideEstab><tpInsc>1</tpInsc><nrInsc>18260489000104</nrInsc><iniValid>2021-01</iniValid></ideEstab>
  <dadosEstab><cnaePrep>8411600</cnaePrep><aliqGilrat><aliqRat>2</aliqRat><fap>1.0000</fap></aliqGilrat></dadosEstab></inclusao></infoEstab>`);
const S1010 = xml('evtTabRubrica', `<infoRubrica><inclusao><ideRubrica><codRubr>030</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2021-01</iniValid></ideRubrica>
  <dadosRubrica><dscRubr>Auxílio Doença 15 dias</dscRubr><natRubr>1010</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS></dadosRubrica></inclusao></infoRubrica>`);
const s1020 = (fpas, tercs) => xml('evtTabLotacao', `<infoLotacao><inclusao><ideLotacao><codLotacao>L1</codLotacao><iniValid>2021-01</iniValid></ideLotacao>
  <dadosLotacao><tpLotacao>01</tpLotacao><fpasLotacao><fpas>${fpas}</fpas><codTercs>${tercs}</codTercs></fpasLotacao></dadosLotacao></inclusao></infoLotacao>`);
const S1200 = xml('evtRemun', `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>2025-03</perApur><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>1</verProc></ideEvento>
  <ideTrabalhador><cpfTrab>11111111111</cpfTrab></ideTrabalhador><dmDev><ideDmDev>1</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>18260489000104</nrInsc><codLotacao>L1</codLotacao>
  <remunPerApur><itensRemun><codRubr>030</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>1000.00</vrRubr></itensRemun></remunPerApur></ideEstabLot></infoPerApur></dmDev>`, 'R1');
const lidos = (fpas, tercs) => [S1005, S1010, s1020(fpas, tercs), S1200].map((x, i) => M.lerXml(x, i + '.xml'));
const valor = (r) => r.teses.find((t) => t.id === 'T006').valor;

test('ENTE-002: terceiros vale 5,8% por padrão; zero com opts.entePublico ou FPAS 582 em todas as lotações', () => {
  const hoje = new Date('2026-10-14');
  const comum = M.apurar(lidos('507', '0079'), { hoje });
  assert.equal(valor(comum), 1000 * (0.20 + 0.02 + 0.058));
  const ente = M.apurar(lidos('507', '0079'), { hoje, entePublico: true });
  assert.equal(valor(ente), 1000 * (0.20 + 0.02));
  assert.ok(ente.avisos.some((a) => /Ente público informado/.test(a)));
  const f582 = M.apurar(lidos('582', '0000'), { hoje });
  assert.equal(valor(f582), 1000 * (0.20 + 0.02));
  assert.ok(f582.avisos.some((a) => /FPAS 582/.test(a)));
  assert.equal(valor(M.apurar(lidos('582', '0000'), { hoje, terceiros: 0.058 })), 1000 * (0.20 + 0.02 + 0.058), 'opts.terceiros explícito prevalece');
});

// ---- cadastro com grupo econômico
test('ENTE-003: cadastro de prefeitura guarda o grupo econômico; membros com CNPJ inválido ficam sem CNPJ', async () => {
  const { sql } = await createDb();
  freshRequire('lib/db').setSqlForTests(sql);
  const api = freshRequire('api/v1/[...route]'); const H = { login: freshRequire('api/login') };
  const org = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('ana@a.com','ana@a.com','Ana', ${await bcrypt.hash('Senha-forte-123', 4)}, 'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${org}, ${u.id}, 'analyst', 'active')`;
  const cookie = cookieFrom(await call(H.login, { method: 'POST', body: { usuario: 'ana@a.com', senha: 'Senha-forte-123' } }));
  const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
  const J = (r) => JSON.parse(r.body);
  const r = await v1('taxpayers', { method: 'POST', cookie, body: { legalName: 'Prefeitura Municipal de Tupaciguara', cnpj: '18.260.489/0001-04', taxRegime: 'Ente público (RGPS)',
    grupo: { nome: 'Grupo Tupaciguara', membros: [{ nome: 'Fundo Municipal de Saúde', cnpj: '11.222.333/0001-81' }, { nome: 'Câmara Municipal', cnpj: '123' }, { nome: '', cnpj: '' }] } } });
  assert.equal(r.statusCode, 201, r.body);
  const t = J(await v1('taxpayers/' + J(r).id, { cookie })).taxpayer;
  assert.equal(t.taxRegime, 'Ente público (RGPS)');
  assert.deepEqual(t.grupo.membros, [{ nome: 'Fundo Municipal de Saúde', cnpj: '11222333000181', papel: '' }, { nome: 'Câmara Municipal', cnpj: '', papel: '' }]);
  // remover o grupo
  assert.equal((await v1('taxpayers/' + t.id, { method: 'PATCH', cookie, body: { grupo: null } })).statusCode, 200);
  assert.equal(J(await v1('taxpayers/' + t.id, { cookie })).taxpayer.grupo, null);
});
