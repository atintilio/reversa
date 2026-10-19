const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require('../motor-ecd');

const FIXTURE = '/tmp/claude-0/teste03/ECD_2025_teste.txt';
const CONTAS_DESPESA = ['5.2.01', '5.3.01', '5.3.02', '5.3.03', '5.3.04', '5.3.05'];

const MINI = [
  '|0000|LECD|01012025|31122025|Teste S.A.|99.303.403/0001-77|SP||3550308||0|0|0|0||||G|||||N|N|N|',
  '|I010|G|9.00|',
  '|I050|01012025|01|A|3|1.1.01|1.1|CAIXA|',
  '|I051|1.01.01.01.01|',
  '|I050|01012025|04|A|3|5.3.01|5.3|MULTAS|',
  '|I150|01012025|31012025|',
  '|I155|5.3.01||0,00|D|100,00|0,00|100,00|D|',
  '|I200|000001|15012025|100,00|N|',
  '|I250|5.3.01||100,00|D|||MULTA|',
  '|I250|1.1.01||100,00|C|||MULTA|'
];

test('lê um trecho inline: empresa, período, plano, referencial, saldos e partidas', () => {
  const r = M.lerEcd(MINI.join('\r\n'), 'mini.txt');
  assert.equal(r.cnpj, '99303403000177'); assert.equal(r.empresa, 'Teste S.A.');
  assert.equal(r.ini, '2025-01-01'); assert.equal(r.fin, '2025-12-31');
  assert.equal(r.versaoLeiaute, '9.00'); assert.equal(r.contas.length, 2);
  assert.deepEqual(r.contas[0].referencial, ['1.01.01.01.01']);
  assert.equal(r.saldos.length, 1); assert.equal(r.saldos[0].deb, 100); assert.equal(r.saldos[0].fin, '2025-01-31');
  assert.equal(r.lancamentos[0].partidas.length, 2);
  assert.equal(r.avisos.length, 0);
  const s = M.resumo(r); assert.equal(s.partidasDobradasOk, true); assert.equal(s.totalDebitos, 100);
  assert.equal(M.partidasPorConta(r, '5.3.01').debitos, 100);
});

test('fixture real: lê sem erro, acha as 6 contas de despesa e fecha partidas dobradas', () => {
  const r = M.lerEcd(fs.readFileSync(FIXTURE, 'latin1'), 'ECD_2025_teste.txt');
  assert.equal(r.avisos.length, 0, r.avisos.join('\n'));
  assert.equal(r.cnpj, '99303403000177'); assert.equal(r.empresa, 'Cobalto Sistemas Corporativos S.A.');
  assert.equal(r.lancamentos.length, 24);
  CONTAS_DESPESA.forEach(c => assert.ok(r.contas.find(x => x.codigo === c && x.tipo === 'A'), 'falta ' + c));
  assert.ok(r.contas.find(x => x.codigo === '5.3.01').nome.includes('PUNITIVAS'));
  const s = M.resumo(r);
  assert.equal(s.partidasDobradasOk, true); assert.equal(s.totalDebitos, s.totalCreditos);
});

test('fixture real: R$ 420.000 a débito nas contas 5.2.01, 5.3.04 e 5.3.05; 6 contas somam R$ 900.000', () => {
  const r = M.lerEcd(fs.readFileSync(FIXTURE, 'latin1'));
  const deb = c => M.partidasPorConta(r, c).debitos;
  assert.equal(deb('5.2.01') + deb('5.3.04') + deb('5.3.05'), 420000);
  assert.equal(CONTAS_DESPESA.reduce((s, c) => s + deb(c), 0), 900000);
  assert.equal(deb('5.2.01'), 235000);
  assert.equal(M.partidasPorConta(r, '5.3.01').partidas.length, 4);
});

test('avisa (sem descartar em silêncio) registro curto, ponto decimal e lançamento desbalanceado', () => {
  const t = MINI.concat(['|I155|5.3.01||0,00|', '|I200|000002|20012025|50.00|N|', '|I250|5.3.01||50.00|D|||X|', '|I250|1.1.01||40,00|C|||X|']).join('\n');
  const r = M.lerEcd(t, 'ruim.txt');
  assert.ok(r.avisos.some(a => /I155.*mínimo/.test(a)), 'registro curto');
  assert.ok(r.avisos.some(a => /ponto decimal/.test(a)), 'ponto decimal');
  assert.ok(r.avisos.some(a => /000002.*desbalanceado/.test(a)), 'desbalanceado');
  const s = M.resumo(r); assert.equal(s.partidasDobradasOk, false); assert.equal(s.desbalanceados.length, 1);
  assert.ok(s.avisos.some(a => /partidas dobradas/.test(a)));
  assert.equal(r.saldos.length, 1); // o I155 curto foi avisado e não entrou
});

test('arquivo que não é ECD e texto vazio geram avisos, sem lançar erro', () => {
  assert.ok(M.lerEcd('|0000|LECF|01012025|31122025|X|99303403000177|SP|', 'x').avisos.some(a => /não é uma ECD/.test(a)));
  assert.ok(M.lerEcd('', 'v').avisos.length > 0);
});
