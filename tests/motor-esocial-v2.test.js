// Motor eSocial v0.2.0: escopo por competência, CPRB, T008, rescisões (S-2299/S-3000), condicionais, habitualidade, sensibilidade.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-esocial.js');

const NS = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador>';
const xml = (evt, corpo, id) => `<eSocial xmlns="${NS}/${evt}/v_S_01_02_00"><${evt} Id="${id || 'ID1'}">${emp}${corpo}</${evt}></eSocial>`;
const HOJE = new Date('2026-10-14'); // limite de 5 anos: 2021-10

const S1005 = xml('evtTabEstab', '<infoEstab><inclusao><ideEstab><tpInsc>1</tpInsc><nrInsc>12345678000190</nrInsc><iniValid>2021-01</iniValid></ideEstab><dadosEstab><cnaePrep>2511000</cnaePrep><aliqGilrat><aliqRat>2</aliqRat><fap>1.0000</fap></aliqGilrat></dadosEstab></inclusao></infoEstab>');
const rub = (cod, dsc, inc = '11', tp = '1') => `<inclusao><ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2021-01</iniValid></ideRubrica><dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>1000</natRubr><tpRubr>${tp}</tpRubr><codIncCP>${inc}</codIncCP></dadosRubrica></inclusao>`;
const S1010 = xml('evtTabRubrica', '<infoRubrica>' + [rub('001', 'Salário Base'), rub('020', 'Aviso Prévio Indenizado'), rub('021', 'Férias Indenizadas'), rub('022', '1/3 Férias Indenizadas'),
  rub('023', 'Multa Art. 477 CLT'), rub('030', 'Gratificação Eventual'), rub('040', 'PLR')].join('') + '</infoRubrica>');
// S-1000 com histórico de vigências: [ini, fim, classTrib, indDesFolha]
const s1000 = (vig) => xml('evtInfoEmpregador', '<infoEmpregador>' + vig.map(([ini, fim, ct, df], i) => `<${i ? 'alteracao' : 'inclusao'}><idePeriodo><iniValid>${ini}</iniValid>${fim ? `<fimValid>${fim}</fimValid>` : ''}</idePeriodo><infoCadastro><nmRazao>ACME</nmRazao><classTrib>${ct}</classTrib><indDesFolha>${df || 0}</indDesFolha></infoCadastro></${i ? 'alteracao' : 'inclusao'}>`).join('') + '</infoEmpregador>');
const itens = (tag, its) => its.map(([c, v]) => `<${tag}><codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v}</vrRubr></${tag}>`).join('');
const estLot = (inner) => `<ideEstabLot><tpInsc>1</tpInsc><nrInsc>12345678000190</nrInsc><codLotacao>L1</codLotacao>${inner}</ideEstabLot>`;
const s1200 = (cpf, per, its, id) => xml('evtRemun', `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${per}</perApur></ideEvento><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><dmDev><ideDmDev>1</ideDmDev><infoPerApur>${estLot('<remunPerApur>' + itens('itensRemun', its) + '</remunPerApur>')}</infoPerApur></dmDev>`, id || 'R' + cpf + per);
const s2299 = (cpf, dt, its, extra = '') => xml('evtDeslig', `<ideEvento><indRetif>1</indRetif></ideEvento><ideVinculo><cpfTrab>${cpf}</cpfTrab><matricula>1</matricula></ideVinculo><infoDeslig><dtDeslig>${dt}</dtDeslig><mtvDeslig>02</mtvDeslig><verbasResc><dmDev><ideDmDev>1</ideDmDev><infoPerApur>${estLot('<detVerbas>'.replace('<detVerbas>', '') + itens('detVerbas', its))}</infoPerApur></dmDev></verbasResc></infoDeslig>${extra}`, 'D' + cpf);
const base = [S1005, S1010].map((x) => M.lerXml(x));
const run = (extra, opts) => M.apurar(base.concat(extra.map((x) => M.lerXml(x))), Object.assign({ hoje: HOJE }, opts));
const T = (r) => Object.fromEntries(r.teses.map((x) => [x.id, x]));

test('ESC-001: classTrib 01 (Simples) bloqueia o cálculo; forcarEscopo libera com aviso', () => {
  const dados = [s1000([['2021-01', null, '01']]), s1200('1', '2025-03', [['020', '1000']])];
  const r = run(dados);
  assert.equal(r.escopo.ok, false); assert.equal(r.escopo.classTrib, '01');
  assert.match(r.escopo.motivo, /regime fora do escopo \(classTrib 01\)/);
  assert.deepEqual(r.teses, []); assert.equal(r.total.valor, 0); assert.equal(r.total.valorNoPrazo, 0);
  assert.equal(r.sensibilidadeBorda, null); assert.equal(r.pagamento, 'nao-confirmado');
  assert.equal(r.escopo.historico[0].descricao, 'Simples Nacional');
  const f = run(dados, { forcarEscopo: true });
  assert.ok(f.teses.length > 0); assert.match(f.avisos.join(' '), /Escopo forçado/);
});

test('ESC-002: sem S-1000 libera com aviso; classTrib 99 libera', () => {
  const d = [s1200('1', '2025-03', [['020', '1000']])];
  const r = run(d); assert.equal(r.escopo.ok, true); assert.match(r.avisos.join(' '), /Regime não identificado/);
  const r2 = run([s1000([['2021-01', null, '99']])].concat(d)); assert.equal(r2.escopo.ok, true); assert.equal(r2.escopo.classTrib, '99');
  assert.equal(r2.escopo.historico[0].descricao, 'Pessoa jurídica em geral');
});

test('ESC-003: alteração de classTrib no meio do período: só a competência em 99 é calculada; histórico ordenado', () => {
  const dados = [s1000([['2021-01', '2025-05', '99'], ['2025-06', null, '03']]),
    s1200('1', '2025-03', [['020', '1000']]), s1200('1', '2025-08', [['020', '5000']])];
  const r = run(dados);
  assert.deepEqual(r.escopo.historico.map((h) => [h.ini, h.fim, h.classTrib, h.cprb]), [['2021-01', '2025-05', '99', false], ['2025-06', null, '03', false]]);
  assert.equal(r.escopo.ok, true); assert.equal(r.escopo.classTrib, '03', 'regime vigente mais recente');
  assert.equal(T(r).T005.base, 1000, 'competência em Simples não é calculada');
  assert.deepEqual(r.escopo.competenciasExcluidas, ['2025-08']);
  assert.match(r.avisos.join(' '), /Competências excluídas.*classTrib 03.*2025-08/);
  // fim derivado quando só há início
  const r2 = run([s1000([['2021-01', null, '99'], ['2025-06', null, 'XY']])]);
  assert.equal(r2.escopo.historico[0].fim, '2025-05'); assert.equal(r2.escopo.historico[1].descricao, 'classTrib XY');
});

test('CPRB-001: indDesFolha = 1 retira os 20% de CPP', () => {
  const r = run([s1000([['2021-01', null, '99', 1]]), s1200('1', '2025-03', [['020', '1000']])]);
  assert.equal(r.escopo.cprb, true);
  assert.equal(T(r).T005.valor, Math.round(1000 * (0.02 + 0.058) * 100) / 100);
  assert.match(r.avisos.join(' '), /CPRB/);
  const n = run([s1000([['2021-01', null, '99', 0]]), s1200('1', '2025-03', [['020', '1000']])]);
  assert.equal(T(n).T005.valor, Math.round(1000 * (0.20 + 0.02 + 0.058) * 100) / 100);
});

test('T008-001: terceirosExcecao calcula o excedente de 20 SM por trabalhador (2 trabalhadores)', () => {
  // SM 2025 = 1518 => 20 SM = 30360. A: 40000 (excede 9640). B: 10000 (abaixo).
  const dados = [s1200('A', '2025-03', [['001', '40000']]), s1200('B', '2025-03', [['001', '10000']]), s1200('A', '2024-12', [['001', '40000']])];
  assert.equal(T(run(dados)).T008, undefined, 'sem exceção ativa, T008 não existe');
  const r = run(dados, { terceirosExcecao: { ini: '2025-01', fim: '2025-12' } });
  const t = T(r).T008;
  assert.equal(t.base, 9640); assert.equal(t.valor, 559.12); assert.equal(t.valorNoPrazo, 559.12);
  assert.equal(t.condicional, true); assert.equal(t.nome, M.NOMES.T008);
  assert.deepEqual(t.porCompetencia, [{ competencia: '2025-03', valor: 559.12, noPrazo: true }]);
  assert.equal(M.SALARIO_MINIMO['2023-04'], 1302); assert.equal(M.SALARIO_MINIMO['2023-05'], 1320); assert.equal(M.SALARIO_MINIMO['2020-01'], 1039);
});

test('RESC-001: S-2299 com aviso-prévio indenizado, férias indenizadas, 1/3 e multa 477; S-3000 pareado e não pareado', () => {
  const rescA = s2299('R1', '2025-06-15', [['020', '3000'], ['021', '2000'], ['022', '666.67'], ['023', '1500']]);
  const rescB = s2299('R2', '2025-06-20', [['020', '9999']]);
  const baixado = (ev, rec) => `<eSocial xmlns="http://www.esocial.gov.br/schema/download/retornoSolicitacao/v1_0_0"><retornoEvento><evento>${ev}</evento><recibo><nrRecibo>${rec}</nrRecibo></recibo></retornoEvento></eSocial>`;
  const s3000 = (rec) => xml('evtExclusao', `<infoExclusao><tpEvento>S-2299</tpEvento><nrRecEvt>${rec}</nrRecEvt></infoExclusao>`);
  const r = run([rescA, baixado(rescB, '1.1.99'), s3000('1.1.99'), s3000('9.9.9')]);
  const t = T(r);
  assert.equal(t.T005.base, 3000, 'rescisão excluída (S-3000 pareado) é descartada');
  assert.equal(t.T073.base, 2666.67); assert.equal(t.T071.base, 1500);
  assert.equal(t.T073.nome, M.NOMES.T073);
  assert.deepEqual(r.rescisoes, { eventos: 2, exclusoes: { encontradas: 2, pareadas: 1 } });
  assert.deepEqual(t.T005.porCompetencia.map((c) => c.competencia), ['2025-06']);
  assert.match(r.avisos.join(' '), /13º sobre aviso-prévio indenizado: decisão pendente/);
  assert.match(r.avisos.join(' '), /S-3000.*sem evento pareado/);
  // retificadora de S-2299 substitui a original (mesma pessoa e competência)
  const retif = s2299('R1', '2025-06-16', [['020', '4000']]).replace('<indRetif>1</indRetif>', '<indRetif>2</indRetif>');
  assert.equal(T(run([rescA, retif])).T005.base, 4000);
});

test('HAB-001: T065 só para gratificação eventual; habitual (3+ competências em 12 meses) é descartada e avisada', () => {
  const dados = [
    s1200('H', '2025-01', [['030', '100']]), s1200('H', '2025-04', [['030', '100']]), s1200('H', '2025-09', [['030', '100']]), // habitual
    s1200('E', '2025-01', [['030', '700']]), s1200('E', '2025-06', [['030', '300']]), s1200('E', '2026-03', [['030', '200']])   // 2025-01 e 2025-06 + 2026-03 (>12 meses de 2025-01; só 2 na janela)
  ];
  const r = run(dados);
  assert.equal(T(r).T065.base, 1200, 'só a do trabalhador E (eventual)');
  assert.match(r.avisos.join(' '), /habitual.*3 lançamento\(s\), base R\$ 300,00/);
});

test('SENS-001: sensibilidade da borda do prazo (2021-10 dentro; 2021-09 fora)', () => {
  const r = run([s1200('1', '2021-10', [['020', '1000']]), s1200('1', '2021-09', [['020', '2000']]), s1200('1', '2025-03', [['020', '500']])]);
  assert.equal(r.limitePrazo, '2021-10');
  const aliq = 0.20 + 0.02 + 0.058;
  assert.deepEqual(r.sensibilidadeBorda, { limite: '2021-10', dentro: Math.round(1000 * aliq * 100) / 100, fora: Math.round(2000 * aliq * 100) / 100 });
  assert.equal(run([]).sensibilidadeBorda, null);
});

test('COND-001: flags condicionais nas teses T063, T065, T066, T068 e T008; demais false/null', () => {
  const r = run([s1200('1', '2025-03', [['020', '1000'], ['030', '100'], ['040', '50000']])], { terceirosExcecao: { ini: '2025-01', fim: '2025-12' } });
  r.teses.forEach((t) => {
    const cond = ['T063', 'T065', 'T066', 'T068', 'T008'].includes(t.id);
    assert.equal(t.condicional, cond, t.id); assert.equal(t.condicao !== null, cond, t.id);
  });
  assert.ok(T(r).T063 && T(r).T065 && T(r).T008 && T(r).T005);
  assert.match(T(r).T008.condicao, /Tema 1079/);
});
