const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../diagnostico-amostra');
function amostra() {
  return Array.from({ length: 5 }, (_, i) => [1, 6, 9].map(m => ({ cnpj: '123', tese: 'T', regime: 'Real', competencia: `${2021 + i}-${String(m).padStart(2, '0')}`, valor: 10000 }))).flat();
}
test('projeta cada ano para 12 meses e inclui, sem somar novamente, a amostra', () => {
  const r = M.calcular(amostra(), 2021, false);
  assert.equal(r.identificado, 150000); assert.equal(r.projetado, 600000); assert.equal(r.competenciasAlvo, 60);
  assert.deepEqual(M.apresentar(r, { projetado: true }), [{ titulo: 'Estimativa projetada — 60 competências (inclui a amostra)', valor: 600000 }]);
});
test('65 competências exigem valores próprios de 13º; não usa a média da folha', () => {
  assert.equal(M.calcular(amostra(), 2021, true).projetado, null);
  const rows = amostra().concat(Array.from({ length: 5 }, (_, i) => ({ cnpj: '123', tese: 'T', regime: 'Real', competencia: `${2021 + i}-13`, valor: 2000 })));
  const r = M.calcular(rows, 2021, true);
  assert.equal(r.projetado, 610000); assert.equal(r.competenciasAlvo, 65);
});
test('bloqueia lacunas anuais, mistura de regimes, duplicidades e seleção vazia', () => {
  const rows = amostra(); rows.pop();
  assert.equal(M.calcular(rows, 2021, false).projetado, null);
  rows[0].regime = 'Presumido'; assert.equal(M.calcular(rows, 2021, false).projetado, null);
  assert.throws(() => M.calcular(amostra().concat(amostra()[0]), 2021, false), /duplicada/);
  assert.throws(() => M.apresentar(M.calcular(amostra(), 2021, false), {}), /Selecione/);
});
test('meses sem oportunidade contam na média e valor ocultado não aparece no PDF', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]).find(x => x.includes('root.GeradorMemoria ='));
  const textos = [];
  function PDF() {
    this.setFontSize = () => {}; this.text = x => textos.push(x); this.splitTextToSize = x => [x];
    this.autoTable = cfg => { textos.push(cfg.body); this.lastAutoTable = { finalY: 80 }; };
    this.output = () => textos; this.addPage = () => {};
  }
  const window = { jspdf: { jsPDF: PDF }, DiagnosticoAmostra: M, MotorCreditos: { formatarReais: x => `VALOR:${x}` } };
  vm.runInNewContext(script, { window });
  const comps = amostra().map(x => ({ ...x, nome: 'Cliente' }));
  const res = { competencias: comps, teses: [{ natureza: 'credito', aplicavel: true, curto: 'T', competencias: comps.filter(x => x.competencia.endsWith('-01')).map(x => ({ ...x, pis: 30000, cofins: 0 })) }] };
  window.GeradorMemoria.apresentar(res, 2021, { projetado: true });
  const str = JSON.stringify(textos);
  assert.ok(str.includes('VALOR:600000')); assert.ok(!str.includes('VALOR:150000'));
  textos.length = 0;
  window.GeradorMemoria.apresentar(res, 2021, { identificado: true });
  assert.ok(JSON.stringify(textos).includes('VALOR:150000')); assert.ok(!JSON.stringify(textos).includes('VALOR:600000'));
});
