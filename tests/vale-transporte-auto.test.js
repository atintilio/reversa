// T097 automática: total pago lido da ECD, parcela do empregado lida do eSocial (quando existe). Dois modos: "ECD apenas" e "ECD + eSocial".
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-creditos');
const E = require('../motor-ecd');
const X = require('../motor-esocial');
const XE = require('../motor-esocial-extra');

const HOJE = new Date('2026-10-19T12:00:00-03:00');
const CNPJ = '11222333000181';
const efd = (reg, extra) => M.lerEfdContribuicoes(['|0000|006|0|||01012025|31012025|Empresa Teste|' + CNPJ + '|SP|3550308||00|9|', '|0110|' + reg + '|1|1||',
  '|0140|E1|Matriz|' + CNPJ + '|SP||||', '|0200|P1|Produto|||UN|00|30049099||'].concat(extra || []).concat(['|9999|99|']).join('\n'), 'efd.txt');
const f100vt = '|F100|0|F1||15012025|1000,00|50|1000,00|1,6500|16,50|50|1000,00|7,6000|76,00|13|0|||Vale-transporte empregados|';
// plano: 3 sintética (despesas com pessoal) > 3.1 analítica VT; 3.2 analítica salários; passivo VT a pagar; conta de desconto
const planoEcd = (extraSaldos, extraContas) => E.lerEcd([
  '|0000|LECD|01012025|31012025|Empresa Teste|' + CNPJ + '|SP||||||0|',
  '|I010|G|9.00|',
  '|I050|01012025|04|S|1|3||Despesas com Pessoal|',
  '|I050|01012025|04|A|2|3.1.01|3|Vale-Transporte|',
  '|I050|01012025|04|A|2|3.1.02|3|Salários|',
  '|I050|01012025|02|A|2|2.1.01||Vale Transporte a Pagar|',
  '|I050|01012025|04|A|2|3.9.01||Desconto de Vale-Transporte de Empregados|',
].concat(extraContas || []).concat([
  '|I150|01012025|31012025|',
  '|I155|3.1.01||0,00|D|10000,00|0,00|10000,00|D|',
  '|I155|3.1.02||0,00|D|90000,00|0,00|90000,00|D|',
  '|I155|2.1.01||0,00|C|0,00|10000,00|10000,00|C|',
]).concat(extraSaldos || []).concat(['|9999|99|']).join('\n'), 'ecd.txt');
const VT = (r) => r.teses.find((t) => x(t) === 'valeTransporte');
const x = (t) => t.id;

test('VTA-001 só ECD: total pago lido da conta analítica; sintética e passivo não somam; desconto padrão de 6% como estimativa', () => {
  const ecd = planoEcd();
  const v = E.valeTransporte(ecd);
  assert.deepEqual(v.contasDespesa.map((c) => c.conta), ['3.1.01'], 'só a analítica de despesa');
  assert.equal(v.porCompetencia['2025-01'].totalPago, 10000);
  assert.equal(v.porCompetencia['2025-01'].descontoContabil, null);
  const t = VT(M.apurar([efd('1')], { hoje: HOJE, ecd: [ecd] }));
  const d = t.detalhes[0];
  assert.equal(d.modo, 'ECD apenas');
  assert.equal(d.totalPago, 1000000); assert.equal(d.origemPago, 'ECD');
  assert.equal(d.descontoEmpregado, 60000); assert.equal(d.origemDesconto, 'padrão 6%');
  assert.equal(d.baseLiquidaEmpresa, 940000);
  assert.match(d.status, /Estimativa — desconto padrão de 6%/);
  assert.equal(t.total.pis, Math.round(940000 * 1.65 / 100));
  assert.equal(t.modo, 'ECD apenas');
});

test('VTA-002 sintética com filhas analíticas: soma só as analíticas (sem duplicar)', () => {
  const ecd = E.lerEcd([
    '|0000|LECD|01012025|31012025|Empresa Teste|' + CNPJ + '|SP||||||0|',
    '|I050|01012025|04|S|1|4||Vale-Transporte|',
    '|I050|01012025|04|A|2|4.1|4|Administrativo|', '|I050|01012025|04|A|2|4.2|4|Produção|',
    '|I150|01012025|31012025|',
    '|I155|4||0,00|D|3000,00|0,00|3000,00|D|', '|I155|4.1||0,00|D|1000,00|0,00|1000,00|D|', '|I155|4.2||0,00|D|2000,00|0,00|2000,00|D|',
    '|9999|9|'].join('\n'), 'e.txt');
  assert.equal(E.valeTransporte(ecd).porCompetencia['2025-01'].totalPago, 3000);
});

test('VTA-003 conta de desconto na ECD vira a parcela do empregado (origem ECD)', () => {
  const ecd = planoEcd(['|I155|3.9.01||0,00|C|0,00|600,00|600,00|C|']);
  const d = VT(M.apurar([efd('1')], { hoje: HOJE, ecd: [ecd] })).detalhes[0];
  assert.equal(d.descontoEmpregado, 60000); assert.equal(d.origemDesconto, 'ECD');
  assert.equal(d.base, 940000);
  assert.doesNotMatch(d.status, /Estimativa/);
});

// ---- eSocial
const NS = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador>';
const xml = (evt, corpo) => `<eSocial xmlns="${NS}/${evt}/v_S_01_02_00"><${evt} Id="ID1">${emp}${corpo}</${evt}></eSocial>`;
const rub = (cod, dsc, nat, tp) => `<inclusao><ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2021-01</iniValid></ideRubrica><dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>${nat}</natRubr><tpRubr>${tp}</tpRubr><codIncCP>00</codIncCP></dadosRubrica></inclusao>`;
const s1010 = (rs) => xml('evtTabRubrica', '<infoRubrica>' + rs.join('') + '</infoRubrica>');
const s1200 = (cpf, per, its, ind = '1') => xml('evtRemun', `<ideEvento><indRetif>1</indRetif><indApuracao>${ind}</indApuracao><perApur>${per}</perApur></ideEvento><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><dmDev><ideDmDev>1</ideDmDev><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${CNPJ}</nrInsc><codLotacao>L1</codLotacao>${its.map(([c, v]) => `<itensRemun><codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v}</vrRubr></itensRemun>`).join('')}</ideEstabLot></infoPerApur></dmDev>`);
const folha = (docs) => docs.map((d) => X.lerXml(d));

test('VTA-004 descontoValeTransporte lê a rubrica de desconto (tpRubr 2) por competência, ignora 13º e outras rubricas', () => {
  const docs = [s1010([rub('001', 'Salário', '1000', '1'), rub('900', 'Desconto Vale Transporte', '9216', '2'), rub('901', 'Desc. VT', '9999', '2'), rub('902', 'Vale transporte pago', '1000', '1')]),
    s1200('1', '2025-01', [['001', '3000'], ['900', '180'], ['902', '500']]), s1200('2', '2025-01', [['001', '3000'], ['901', '120']]), s1200('1', '2025-01', [['900', '999']], '2')];
  const d = XE.descontoValeTransporte(folha(docs));
  assert.equal(d.porCompetencia['2025-01'], 300, '180 (natRubr 9216) + 120 (descrição VT); vencimento e 13º não entram');
});

test('VTA-005 ECD + eSocial: base líquida = total pago (ECD) - desconto (eSocial) - já creditado (EFD)', () => {
  const ecd = planoEcd(['|I155|3.9.01||0,00|C|0,00|50,00|50,00|C|']);
  const esoc = XE.descontoValeTransporte(folha([s1010([rub('900', 'Desconto Vale Transporte', '9216', '2')]), s1200('1', '2025-01', [['900', '600']])]));
  const t = VT(M.apurar([efd('1', ['|F010|' + CNPJ + '|', f100vt])], { hoje: HOJE, ecd: [ecd], esocialVt: esoc.porCompetencia }));
  const d = t.detalhes[0];
  assert.equal(d.modo, 'ECD + eSocial');
  assert.equal(d.totalPago, 1000000); assert.equal(d.descontoEmpregado, 60000); assert.equal(d.origemDesconto, 'eSocial', 'eSocial vale mais que a conta contábil');
  assert.equal(d.jaApropriado, 100000); assert.equal(d.origemJaCreditado, 'EFD');
  assert.equal(d.baseLiquidaEmpresa, 1000000 - 60000 - 100000);
  assert.doesNotMatch(d.status, /Estimativa/);
});

test('VTA-006 manual sobrescreve a ECD (origem manual) e herda o desconto do eSocial quando o manual não traz', () => {
  const ecd = planoEcd();
  const t = VT(M.apurar([efd('1')], { hoje: HOJE, ecd: [ecd], esocialVt: { '2025-01': 400 }, valeTransporte: { '2025-01': 8000 } }));
  assert.equal(t.detalhes.length, 1);
  const d = t.detalhes[0];
  assert.equal(d.origemPago, 'manual'); assert.equal(d.totalPago, 800000);
  assert.equal(d.origemDesconto, 'eSocial'); assert.equal(d.base, 760000);
  assert.equal(d.modo, 'Manual + eSocial');
  const m = VT(M.apurar([efd('1')], { hoje: HOJE, ecd: [ecd], valeTransporte: { '2025-01': { valor: 8000, descontoEmpregado: 300 } } })).detalhes[0];
  assert.equal(m.origemDesconto, 'manual'); assert.equal(m.base, 770000);
});

test('VTA-007 Lucro Presumido não gera crédito; ECD sem conta de VT avisa; competência sem EFD avisa', () => {
  const ecd = planoEcd();
  const p = VT(M.apurar([efd('2')], { hoje: HOJE, ecd: [ecd] }));
  assert.equal(p.aplicavel, false); assert.match(p.avisos.join(' '), /regime cumulativo/);
  const vazia = E.lerEcd(['|0000|LECD|01012025|31012025|Empresa Teste|' + CNPJ + '|SP||||||0|', '|I050|01012025|04|A|2|3.1.02||Salários|', '|I150|01012025|31012025|', '|I155|3.1.02||0,00|D|900,00|0,00|900,00|D|', '|9999|5|'].join('\n'), 'v.txt');
  const sem = VT(M.apurar([efd('1')], { hoje: HOJE, ecd: [vazia] }));
  assert.equal(sem.aplicavel, false); assert.match(sem.avisos.join(' '), /sem conta de despesa identificável como vale-transporte/);
  const outro = E.lerEcd(['|0000|LECD|01022025|28022025|Empresa Teste|' + CNPJ + '|SP||||||0|', '|I050|01012025|04|A|2|3.1.01||Vale-Transporte|', '|I150|01022025|28022025|', '|I155|3.1.01||0,00|D|700,00|0,00|700,00|D|', '|9999|5|'].join('\n'), 'f.txt');
  const sf = VT(M.apurar([efd('1')], { hoje: HOJE, ecd: [outro] }));
  assert.match(sf.avisos.join(' '), /2025-02.*sem EFD-Contribuições/);
});
