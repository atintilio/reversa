// Motor eSocial EXTRA (T077 a T096): um XML sintético mínimo por tese calculável + fluxo requerDocumento.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-esocial.js');
const X = require('../motor-esocial-extra.js');

const NS = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador>';
const xml = (evt, corpo, id) => `<eSocial xmlns="${NS}/${evt}/v_S_01_02_00"><${evt} Id="${id || 'ID1'}">${emp}${corpo}</${evt}></eSocial>`;
const HOJE = new Date('2026-10-14'); // limite de 5 anos: 2021-10
const ALIQ = 0.20 + 0.02 + 0.058, RT = 0.02 + 0.058; // RAT 2% × FAP 1,0 + terceiros 5,8%
const c2 = (v) => Math.round(v * 100) / 100;

const estab = (nr) => `<inclusao><ideEstab><tpInsc>1</tpInsc><nrInsc>${nr}</nrInsc><iniValid>2021-01</iniValid></ideEstab><dadosEstab><cnaePrep>2511000</cnaePrep><aliqGilrat><aliqRat>2</aliqRat><fap>1.0000</fap></aliqGilrat></dadosEstab></inclusao>`;
const S1005 = xml('evtTabEstab', '<infoEstab>' + estab('12345678000190') + '</infoEstab>');
const S1005b = xml('evtTabEstab', '<infoEstab>' + estab('12345678000271') + '</infoEstab>', 'IDB');
const rub = (cod, dsc, inc = '11', tp = '1', nat = '1000') => `<inclusao><ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2021-01</iniValid></ideRubrica><dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>${nat}</natRubr><tpRubr>${tp}</tpRubr><codIncCP>${inc}</codIncCP></dadosRubrica></inclusao>`;
const S1010 = xml('evtTabRubrica', '<infoRubrica>' + [
  rub('001', 'Salário Base'), rub('101', 'Auxílio Creche'), rub('102', 'Auxílio Educação'), rub('103', 'Previdência Privada PGBL'),
  rub('104', 'Ajuda de Custo'), rub('105', 'Diárias de Viagem'), rub('106', 'Seguro de Vida em Grupo'), rub('107', 'Bolsa Auxílio'),
  rub('108', 'Stock Option'), rub('109', '13º Salário'), rub('110', '13º Salário Parcela Única', '12'), rub('111', 'Saldo de Salário'),
  rub('112', 'Salário Família', '00'), rub('113', 'Cooperativa de Trabalho'), rub('900', 'INSS Segurado', '31', '2', '9201')
].join('') + '</infoRubrica>');
const s1000 = (vig) => xml('evtInfoEmpregador', '<infoEmpregador>' + vig.map(([ini, fim, ct, df], i) => `<${i ? 'alteracao' : 'inclusao'}><idePeriodo><iniValid>${ini}</iniValid>${fim ? `<fimValid>${fim}</fimValid>` : ''}</idePeriodo><infoCadastro><nmRazao>ACME</nmRazao><classTrib>${ct}</classTrib><indDesFolha>${df || 0}</indDesFolha></infoCadastro></${i ? 'alteracao' : 'inclusao'}>`).join('') + '</infoEmpregador>');
const itens = (tag, its) => its.map(([c, v]) => `<${tag}><codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v}</vrRubr></${tag}>`).join('');
const LOT = (cod, its, nr = '12345678000190', tag = 'itensRemun') => `<ideEstabLot><tpInsc>1</tpInsc><nrInsc>${nr}</nrInsc><codLotacao>${cod}</codLotacao><remunPerApur>${itens(tag, its)}</remunPerApur></ideEstabLot>`;
// dm = {id, categ, lots: [xml...]}
const DM = ({ id = '1', categ = '101', lots }) => `<dmDev><ideDmDev>${id}</ideDmDev><codCateg>${categ}</codCateg><infoPerApur>${lots.join('')}</infoPerApur></dmDev>`;
const ev1200 = (cpf, per, dms, { ind = '1', retif = '1', id } = {}) => xml('evtRemun', `<ideEvento><indRetif>${retif}</indRetif><indApuracao>${ind}</indApuracao><perApur>${per}</perApur></ideEvento><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>${dms.join('')}`, id || `R${cpf}${per}${ind}${retif}`);
const s1200 = (cpf, per, its, o) => ev1200(cpf, per, [DM({ lots: [LOT('L1', its)] })], o);
const s2299 = (cpf, dt, its) => xml('evtDeslig', `<ideEvento><indRetif>1</indRetif></ideEvento><ideVinculo><cpfTrab>${cpf}</cpfTrab><matricula>1</matricula></ideVinculo><infoDeslig><dtDeslig>${dt}</dtDeslig><mtvDeslig>02</mtvDeslig><verbasResc><dmDev><ideDmDev>1</ideDmDev><infoPerApur>${LOT('L1', its, '12345678000190', 'detVerbas')}</infoPerApur></dmDev></verbasResc></infoDeslig>`, 'D' + cpf);

const base = [S1005, S1010].map((x) => M.lerXml(x));
const run = (extra, opts) => X.apurarExtra(base.concat(extra.map((x) => M.lerXml(x))), Object.assign({ hoje: HOJE }, opts));
const T = (r) => Object.fromEntries(r.teses.map((x) => [x.id, x]));
const D = (r) => Object.fromEntries(r.requerDocumento.map((x) => [x.id, x]));

test('EXT-001: T077, T078, T079, T081, T086 calculam base × (CPP + RAT×FAP + terceiros); condicionais, natureza crédito', () => {
  const r = run([s1200('1', '2025-03', [['001', '5000'], ['101', '1000'], ['102', '1000'], ['103', '1000'], ['106', '1000'], ['108', '1000']])]);
  const t = T(r);
  for (const id of ['T077', 'T078', 'T079', 'T081', 'T086']) {
    assert.equal(t[id].valor, c2(1000 * ALIQ), id); assert.equal(t[id].valorNoPrazo, c2(1000 * ALIQ), id);
    assert.equal(t[id].condicional, true); assert.ok(t[id].condicao); assert.equal(t[id].natureza, 'credito');
    assert.equal(t[id].competencias, 1); assert.equal(t[id].porCompetencia[0].competencia, '2025-03');
  }
  assert.equal(t.T080, undefined); assert.equal(r.teses.length, 5, 'salário base não vira tese');
});

test('EXT-002: prazo por competência: fora dos 5 anos entra em valor, não em valorNoPrazo', () => {
  const r = run([s1200('1', '2025-03', [['001', '5000'], ['101', '1000']]), s1200('1', '2021-01', [['001', '5000'], ['101', '1000']])]);
  assert.equal(T(r).T077.valor, c2(2000 * ALIQ)); assert.equal(T(r).T077.valorNoPrazo, c2(1000 * ALIQ));
  assert.equal(T(r).T077.porCompetencia.find((x) => x.competencia === '2021-01').noPrazo, false);
});

test('EXT-003: T080 diárias até 50% da remuneração entram; acima de 50% ficam de fora com aviso', () => {
  const r = run([s1200('A', '2025-03', [['001', '4000'], ['105', '1500']]), s1200('B', '2025-03', [['001', '1000'], ['105', '800']])]);
  assert.equal(T(r).T080.base, 1500, 'só o trabalhador A (1500 <= 50% de 4000)');
  assert.equal(T(r).T080.valor, c2(1500 * ALIQ));
  assert.match(r.avisos.join(' '), /acima de 50%.*2025-03/);
});

test('EXT-004: T080 ajuda de custo só em parcela única; habitual fica de fora', () => {
  const r = run([s1200('A', '2025-03', [['001', '4000'], ['104', '2000']]),
    s1200('B', '2025-03', [['001', '4000'], ['104', '1000']]), s1200('B', '2025-04', [['001', '4000'], ['104', '1000']])]);
  assert.equal(T(r).T080.base, 2000);
  assert.match(r.avisos.join(' '), /Ajuda de custo.*habitual.*2 lançamento/);
});

test('EXT-005: T082 bolsa de estágio: só categoria 901', () => {
  const est = ev1200('E1', '2025-03', [DM({ categ: '901', lots: [LOT('L1', [['107', '1200']])] })]);
  const clt = ev1200('C1', '2025-03', [DM({ categ: '101', lots: [LOT('L1', [['107', '1200']])] })]);
  const r = run([est, clt]);
  assert.equal(T(r).T082.base, 1200); assert.equal(T(r).T082.valor, c2(1200 * ALIQ));
  assert.equal(T(r).T082.rubricas[0].motivo, 'bolsa de estágio (categoria 901)');
});

test('EXT-006: T089 evento original repetido: a base do evento a mais é cobrada de novo; retificadora não gera T089', () => {
  const its = [['001', '3000']];
  const dup = run([s1200('1', '2025-03', its, { id: 'A' }), s1200('1', '2025-03', its, { id: 'B' })]);
  assert.equal(T(dup).T089.base, 3000); assert.equal(T(dup).T089.valor, c2(3000 * ALIQ));
  assert.equal(T(dup).T089.rubricas[0].motivo, 'evento original repetido (S-1200)');
  const retif = run([s1200('1', '2025-03', its, { id: 'A' }), s1200('1', '2025-03', its, { id: 'B', retif: '2' })]);
  assert.equal(T(retif).T089, undefined);
});

test('EXT-007: T094 13º na folha mensal e no 13º (indApuracao 2): crédito sobre o menor dos dois valores', () => {
  const r = run([s1200('1', '2025-11', [['001', '4000'], ['109', '3000']]), s1200('1', '2025', [['110', '3000']], { ind: '2' })]);
  assert.equal(T(r).T094.base, 3000); assert.equal(T(r).T094.valor, c2(3000 * ALIQ));
  assert.equal(T(r).T094.porCompetencia[0].competencia, '2025-11');
  const parcial = run([s1200('1', '2025-11', [['109', '3000']]), s1200('1', '2025', [['110', '1200']], { ind: '2' })]);
  assert.equal(T(parcial).T094.base, 1200, 'duplicado = o menor');
  const semAnual = run([s1200('1', '2025-11', [['109', '3000']])]);
  assert.equal(T(semAnual).T094, undefined);
});

test('EXT-008: T095 mesma rubrica e valor em duas lotações do mesmo dmDev: só RAT×FAP + terceiros', () => {
  const dois = ev1200('1', '2025-03', [DM({ lots: [LOT('L1', [['113', '2000']]), LOT('L2', [['113', '2000']])] })]);
  const r = run([dois]);
  assert.equal(T(r).T095.base, 2000); assert.equal(T(r).T095.valor, c2(2000 * RT));
  const distintos = run([ev1200('1', '2025-03', [DM({ lots: [LOT('L1', [['113', '2000']]), LOT('L2', [['113', '1500']])] })])]);
  assert.equal(T(distintos).T095, undefined, 'valores diferentes não são repetição');
  const doisVinc = run([ev1200('1', '2025-03', [DM({ id: '1', lots: [LOT('L1', [['113', '2000']])] }), DM({ id: '2', lots: [LOT('L2', [['113', '2000']])] })])]);
  assert.equal(T(doisVinc).T095, undefined, 'dmDev diferentes (dois vínculos) não são repetição');
});

test('EXT-009: T096 verba rescisória (S-2299) também declarada na folha (S-1200) da mesma competência', () => {
  const r = run([s1200('1', '2025-06', [['001', '4000'], ['111', '1500']]), s2299('1', '2025-06-20', [['111', '1500']])]);
  assert.equal(T(r).T096.base, 1500); assert.equal(T(r).T096.valor, c2(1500 * ALIQ));
  const dif = run([s1200('1', '2025-06', [['111', '1500']]), s2299('1', '2025-06-20', [['111', '900']])]);
  assert.equal(T(dif).T096, undefined);
});

test('EXT-010: requerDocumento: cooperativa, salário-família, mais de um estabelecimento, CPRB e INSS em dois vínculos', () => {
  const lidosExtra = [S1005b, s1000([['2021-01', null, '99', 1]]),
    ev1200('1', '2025-03', [DM({ id: '1', lots: [LOT('L1', [['001', '4000'], ['113', '500'], ['112', '300'], ['900', '440']])] }),
      DM({ id: '2', lots: [LOT('L9', [['001', '2000'], ['900', '180']], '12345678000271')] })])];
  const r = run(lidosExtra);
  const d = D(r);
  assert.ok(d.T083 && d.T083.valor === 0 && d.T083.documentos.length >= 2);
  assert.equal(d.T087.valorReferencia, 300);
  assert.equal(d.T091.estabelecimentos, 2);
  assert.equal(d.T088.trabalhadores, 1); assert.deepEqual(d.T088.competencias, ['2025-03']);
  assert.match(r.avisos.join(' '), /T088.*já está na T074/);
  assert.ok(d.T090 && d.T090.valorReferencia > 0); assert.deepEqual(d.T090.competencias, ['2025-03']);
  assert.equal(d.T084, undefined, 'sem gatilho e sem incluirChecklist, T084 não aparece');
  const lista = run([s1200('1', '2025-03', [['001', '1000']])], { incluirChecklist: true });
  assert.deepEqual(lista.requerDocumento.map((x) => x.id), ['T084', 'T085', 'T092', 'T093']);
  assert.ok(lista.requerDocumento.every((x) => x.valor === 0 && x.documentos.length));
});

test('EXT-011: CPRB (indDesFolha = 1) tira os 20% de CPP das teses extras', () => {
  const r = run([s1000([['2021-01', null, '99', 1]]), s1200('1', '2025-03', [['001', '5000'], ['101', '1000']])]);
  assert.equal(T(r).T077.valor, c2(1000 * RT));
});

test('EXT-012: classTrib 01 (Simples) fora do escopo: nada é calculado; forcarEscopo libera', () => {
  const dados = [s1000([['2021-01', null, '01']]), s1200('1', '2025-03', [['101', '1000']])];
  const r = run(dados); assert.deepEqual(r.teses, []); assert.match(r.avisos.join(' '), /fora do escopo.*2025-03/);
  assert.equal(T(run(dados, { forcarEscopo: true })).T077.base, 1000);
});

test('EXT-013: T085 CPRB x folha só com receita bruta e alíquota; natureza planejamento (não é crédito)', () => {
  const dados = [s1200('1', '2025-03', [['001', '10000']])];
  assert.equal(T(run(dados)).T085, undefined);
  const r = run(dados, { receitaBruta: { '2025-03': 100000 }, aliquotaCprb: 0.01 });
  assert.equal(T(r).T085.natureza, 'planejamento'); assert.equal(T(r).T085.valor, 1000); // 20% de 10.000 = 2.000 contra 1% de 100.000 = 1.000
  const pior = run(dados, { receitaBruta: { '2025-03': 500000 }, aliquotaCprb: 0.01 });
  assert.equal(T(pior).T085, undefined, 'CPRB mais cara que a folha: sem economia');
});

test('EXT-014: opts.aliquota substitui a alíquota total; reclassifica informa a rubrica que o motor principal punha em T028', () => {
  const r = run([s1200('1', '2025-03', [['104', '2000'], ['001', '4000']])], { aliquota: 0.10 });
  assert.equal(T(r).T080.valor, 200);
  assert.deepEqual(r.reclassifica, [{ rubrica: 'T1|104', descricao: 'Ajuda de Custo', de: 'T028', para: 'T080' }]);
});

test('EXT-015: sem eventos ou sem S-1010: resultado vazio e estrutura estável', () => {
  const r = X.apurarExtra([], { hoje: HOJE });
  assert.deepEqual(r.teses, []); assert.deepEqual(r.requerDocumento, []); assert.deepEqual(r.reclassifica, []); assert.ok(Array.isArray(r.avisos));
  assert.equal(typeof r.versao, 'string');
});
