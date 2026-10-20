'use strict';
// Cenário Grupo Mateus (sintético): R$ 82.256,90 esperados = 49.826,02 (INSS do segurado em duplicidade, T074) + Selic 1.905,88
// + R$ 30.525 de PIS/COFINS que são créditos escriturais já apropriados (informativo, NÃO oportunidade).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const MC = require('../motor-creditos.js');
const ME = require('../motor-esocial.js');
const Selic = require('../selic.js');

const D = path.join(__dirname, 'fixtures', 'grupo-mateus');
const esperado = JSON.parse(fs.readFileSync(path.join(D, 'Resultado_Esperado.json'), 'utf8'));
const xmls = fs.readdirSync(path.join(D, 'xml_esocial')).filter((f) => f.endsWith('.xml')).sort()
  .map((f) => ME.lerXml(fs.readFileSync(path.join(D, 'xml_esocial', f), 'utf8'), f));
const efds = fs.readdirSync(path.join(D, 'fiscal')).filter((f) => f.endsWith('.txt')).sort()
  .map((f) => MC.lerEfdContribuicoes(fs.readFileSync(path.join(D, 'fiscal', f), 'latin1'), f));
const prev = ME.apurar(xmls, { hoje: new Date('2023-03-30') });
const cred = MC.apurar(efds, {});

test('106 XMLs lidos sem erro', () => {
  assert.equal(xmls.length, Number(esperado.quantidade_xml_esocial));
  assert.equal(xmls.filter((x) => x.erros && x.erros.length).length, 0);
});

test('T074: INSS do segurado em duplicidade = 49.826,02, por competência', () => {
  assert.equal(prev.inssSegurado.principal, Number(esperado.credito_previdenciario_principal));
  const m = Object.fromEntries(prev.inssSegurado.porCompetencia.map((c) => [c.competencia, c]));
  assert.equal(m['2022-10'].excesso, 34925.8);
  assert.equal(m['2022-11'].excesso, 14900.22);
  assert.equal(m['2022-10'].retido, m['2022-10'].devido * 2);
  assert.ok(prev.teses.some((t) => t.id === 'T074'));
});

test('PIS/COFINS: nenhuma oportunidade; R$ 30.525 são créditos já apropriados (informativo)', () => {
  assert.equal(cred.resumo.recuperavel.pis, 0);
  assert.equal(cred.resumo.recuperavel.cofins, 0);
  const ca = cred.creditosAproveitados;
  assert.equal(ca.total.pis, 544500);
  assert.equal(ca.total.cofins, 2508000);
  assert.equal((ca.total.pis + ca.total.cofins) / 100, Number(esperado.credito_tributario_principal));
});

test('Selic da regra do Reversa com a mesma série = 1.905,88 sobre o principal previdenciário', () => {
  const serie = JSON.parse(fs.readFileSync(path.join(D, 'selic_bcb_4390.json'), 'utf8'));
  const tabela = {};
  serie.forEach((x) => { const [, mm, aaaa] = x.data.split('/'); tabela[aaaa + '-' + mm] = Number(x.valor); });
  const calc = new Date('2023-03-30');
  const out = Selic.atualizar(34925.8, new Date('2022-11-18'), calc, tabela);
  const nov = Selic.atualizar(14900.22, new Date('2022-12-20'), calc, tabela);
  assert.equal(out.juros, 1452.91);
  assert.equal(nov.juros, 452.97);
  assert.equal(Math.round((out.juros + nov.juros) * 100) / 100, Number(esperado.selic_previdenciaria));
});
