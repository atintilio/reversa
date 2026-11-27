const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const motor = require('../motor-creditos');

const pasta = process.env.REVERSA_EFD_TEST_DIR;
test('workspace projeta dez meses e calcula o saldo do último mês', () => {
  const html = fs.readFileSync(path.join(__dirname, '../clientes.html'), 'utf8');
  const fonte = html.match(/\$\('p-compensacao'\)\.addEventListener\('submit', function \(e\) \{[\s\S]*?\n  \}\);/)[0];
  let projetar;
  vm.runInNewContext(fonte, { $: () => ({ addEventListener: (_tipo, fn) => { projetar = fn; } }), RV: { reais: (v) => String(v / 100) } });
  const output = {};
  const form = {
    elements: { credito: { valueAsNumber: 1000000 }, tributos: { valueAsNumber: 100000 } },
    querySelector: () => output
  };
  projetar.call(form, { preventDefault() {} });
  assert.equal(output.textContent, '10 meses · 100000 no último mês');
  form.elements.credito.valueAsNumber = 1000000.05;
  projetar.call(form, { preventDefault() {} });
  assert.equal(output.textContent, '11 meses · 0.05 no último mês');
});

test('DTI e dossiê usam a EFD real e geram todas as páginas em retrato', { skip: !pasta }, async () => {
  const jspdf = require('jspdf');
  require('jspdf-autotable').applyPlugin(jspdf.jsPDF);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1]);
  scripts.forEach((s) => new vm.Script(s));
  const browser = { jspdf, MotorCreditos: motor, DiagnosticoAmostra: require('../diagnostico-amostra') };
  vm.runInNewContext(scripts.find((s) => s.includes('root.GeradorMemoria')), { window: browser });
  const arquivos = fs.readdirSync(pasta).filter((n) => /\.txt$/i.test(n));
  const lidos = arquivos.map((n) => motor.lerEfdContribuicoes(fs.readFileSync(path.join(pasta, n), 'latin1'), n));
  assert.ok(lidos.length);
  assert.ok(lidos.every((l) => !l.erros.length), 'Leitura dos arquivos EFD');
  const hoje = new Date('2026-11-27T15:00:00Z');
  const res = motor.apurar(lidos, { hoje });
  assert.ok(res.competencias.length);
  const pdfs = [
    browser.GeradorMemoria.apresentar(res, 2022, { identificado: true }, { emissao: hoje, composicaoIcms: { credito: 100, saldoCredorATransportar: 50 } }),
    browser.GeradorMemoria.gerar(res, lidos, { emissao: hoje })
  ];
  for (const [i, blob] of pdfs.entries()) {
    const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    const paginas = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    assert.ok(paginas.length && paginas.every((m) => Number(m[1]) < Number(m[2])));
    assert.match(pdf, i ? /Mem.ria de c.lculo/ : /T.cnico Inicial/);
    if (i) assert.ok(res.competencias.some((c) => pdf.includes(c.arquivo.slice(0, 30))));
    else {
      assert.match(pdf, /ICMS escriturado/);
      assert.match(pdf, /registro E110/);
      assert.doesNotMatch(pdf, /Como . feita a classifica/);
    }
    console.log(i ? 'Dossiê' : 'DTI', paginas.length, 'páginas em retrato');
  }
  console.log(lidos.length, 'EFDs processadas', res.competencias.length, 'competências apuradas');
});
