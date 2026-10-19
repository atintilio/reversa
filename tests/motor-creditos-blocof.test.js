// Motor de créditos: leitura do bloco F e da apuração M (M200/M210/M600/M610) e avisos de descartes silenciosos.
// Os 12 arquivos reais (Latin-1) vêm de EFD_FIXTURES_DIR; sem eles, esses testes são pulados (os inline sempre rodam).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../motor-creditos');

const DIR = process.env.EFD_FIXTURES_DIR || '/root/.claude/uploads/b9829ef5-29a0-51f5-8e70-801ffce2ee1a';
const ARQUIVOS = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((n) => /EFD_Contribuicoes_2025_\d\d\.txt$/.test(n)).sort((a, b) => a.slice(-6).localeCompare(b.slice(-6))) : [];
const HOJE = new Date('2026-10-19T12:00:00-03:00');
const REAIS = { skip: ARQUIVOS.length !== 12 ? 'fixtures reais (12 EFD de 2025) não encontradas' : false };
const lerReal = (n) => M.lerEfdContribuicoes(fs.readFileSync(path.join(DIR, n), 'latin1'), n);
const reais = (...a) => test(a[0], REAIS, a[1]);

// ---- leitor independente do texto cru, para conferir o motor sem usar o próprio parser
function cru(texto, reg) { return texto.split(/\r?\n/).filter((l) => l.startsWith('|' + reg + '|')).map((l) => l.split('|').slice(1, -1)); }
const cent = (t) => Math.round(Number(String(t || '0').replace(',', '.')) * 100);

reais('BLOCOF-001 jan/2025: receita, créditos de aluguel e devido conferem com M200/M600', () => {
  const r = M.apurar([lerReal(ARQUIVOS[0])], { hoje: HOJE });
  const f = r.blocoF.competencias[0], m = r.apuracaoM.competencias[0];
  assert.equal(f.competencia, '2025-01');
  assert.equal(f.receita, 890000000);                 // R$ 8.900.000,00, F100 CST 01 "sem nota fiscal"
  assert.deepEqual(Object.keys(f.receitaPorCstPis), ['01']);
  assert.deepEqual(Object.keys(f.creditoPorNat).sort(), ['05', '06']);
  assert.equal(f.creditoPorNat['05'].pis, 734250);    // 445.000 x 1,65%
  assert.equal(f.creditoPorNat['06'].cofins, 6764000); // 890.000 x 7,6%
  assert.equal(f.creditoAluguelPis, 2202750);
  assert.equal(f.creditoAluguelCofins, 10146000);
  assert.equal(m.devidoPis, 12482250);                // PIS jan/2025 = 124.822,50
  assert.equal(m.devidoCofins, 57494000);             // COFINS jan/2025 = 574.940,00
  assert.equal(m.conferencia.pis.difContribuicao, 0); // F100 x M210
  assert.equal(m.conferencia.cofins.difContribuicao, 0);
  assert.equal(m.conferencia.pis.difCredito, 0);      // F100 (aluguel) x M200 VL_TOT_CRED_DESC
});

reais('BLOCOF-002 os 12 meses: valores do motor iguais aos registros crus M200/M600/F100', () => {
  const lidos = ARQUIVOS.map(lerReal);
  lidos.forEach((l) => assert.deepEqual(l.erros, [], l.arquivo));
  const r = M.apurar(lidos, { hoje: HOJE });
  assert.equal(r.blocoF.competencias.length, 12);
  assert.equal(r.apuracaoM.competencias.length, 12);
  let somaPis = 0, somaCofins = 0, somaReceita = 0;
  ARQUIVOS.forEach((n, i) => {
    const t = fs.readFileSync(path.join(DIR, n), 'latin1');
    const f = r.blocoF.competencias[i], m = r.apuracaoM.competencias[i];
    assert.equal(f.competencia, '2025-' + n.slice(-6, -4));
    const m200 = cru(t, 'M200')[0], m600 = cru(t, 'M600')[0];
    assert.equal(m.devidoPis, cent(m200[12]), n + ' PIS');       // VL_TOT_CONT_REC
    assert.equal(m.devidoCofins, cent(m600[12]), n + ' COFINS');
    const f100 = cru(t, 'F100');
    assert.equal(f.receita, f100.filter((x) => x[1] === '1').reduce((s, x) => s + cent(x[5]), 0));
    const alug = f100.filter((x) => x[1] === '0' && (x[14] === '05' || x[14] === '06'));
    assert.equal(f.creditoAluguelPis, alug.reduce((s, x) => s + cent(x[9]), 0));
    assert.equal(f.creditoAluguelCofins, alug.reduce((s, x) => s + cent(x[13]), 0));
    assert.equal(f.creditoAluguelPis, cent(m200[2]), n + ' crédito F x M200');
    assert.equal(m.conferencia.pis.difContribuicao, 0); assert.equal(m.conferencia.cofins.difContribuicao, 0);
    somaPis += m.devidoPis; somaCofins += m.devidoCofins; somaReceita += f.receita;
  });
  assert.equal(r.apuracaoM.total.devidoPis, somaPis);
  assert.equal(r.apuracaoM.total.devidoCofins, somaCofins);
  assert.equal(r.blocoF.total.receita, somaReceita);
  assert.equal(r.blocoF.total.receita, 11460000000);   // R$ 114.600.000,00 no ano
});

reais('BLOCOF-003 motivos de zero citam o bloco F e nenhuma tese é calculada sobre ele', () => {
  const r = M.apurar(ARQUIVOS.map(lerReal), { hoje: HOJE });
  const mo = r.leitura.motivos;
  ['tema69', 'monofasico', 'icmsSt', 'insumos', 'lei14592'].forEach((id) => {
    assert.match(mo[id], /bloco F/, id);
    assert.match(mo[id], /depende de itens de nota fiscal/, id);
  });
  assert.match(mo.tema69, /R\$ 114\.600\.000,00/);
  assert.equal(r.resumo.recuperavel.pis, 0); assert.equal(r.resumo.recuperavel.cofins, 0);
  r.teses.filter((t) => t.id !== 'saldoCredor').forEach((t) => assert.equal(t.detalhes.length, 0, 'nenhuma linha do bloco F em ' + t.id));
  assert.ok(r.leitura.arquivos.every((a) => a.blocoF === 3));
});

// ---------------------------------------------------------------- inline
const cab = (extra) => [
  '|0000|006|0|||01012025|31012025|Empresa Teste|11222333000181|SP|3550308||00|9|',
  '|0110|1|1|1||',
  '|0140|E1|Matriz|11222333000181|SP||||',
  '|0200|P1|Produto|||UN|00|30049099||',
].concat(extra || []);
const fim = (linhas) => {
  const l = linhas.concat(['|9999|' + (linhas.length + 1) + '|']);
  return l.join('\n');
};
const c100 = (oper, sit, num) => '|C100|' + oper + '|0||55|' + sit + '|1|' + num + '|CHV' + num + '|01012025|01012025|1000,00||0,00||1000,00|9||||||180,00|||||16,50|76,00|||||';
const c170 = (cst) => '|C170|1|P1||1|UN|1000.00|0,00||000|5102||1000,00|18|180,00|||||||50||||' + cst + '|1000,00|1,65||||16,50|' + cst + '|1000,00|7,6||||76,00||||||';

function camposC100(l) { return l.split('|').length - 2; }

test('AVISO-001 notas com COD_SIT fora de 00/01/06/07/08 geram aviso agrupado com contagem', () => {
  assert.ok(camposC100(c100(1, '00', 1)) >= 27);
  const txt = fim(cab([c100(1, '02', 1), c170('01'), c100(1, '02', 2), c100(1, '03', 3), c100(1, '00', 4), c170('01')]));
  const r = M.lerEfdContribuicoes(txt, 't.txt');
  assert.deepEqual(r.erros, []);
  const a02 = r.avisos.filter((x) => /COD_SIT "02"/.test(x));
  assert.equal(a02.length, 1);
  assert.match(a02[0], /^2 nota\(s\) C100/);
  assert.match(a02[0], /documento cancelado/);
  assert.match(a02[0], /1 item\(ns\) C170 descartado/);
  assert.equal(r.avisos.filter((x) => /COD_SIT "03"/.test(x) && /^1 nota/.test(x)).length, 1);
  assert.equal(r.itens.length, 1, 'regra de cálculo inalterada: só a nota 00 entra');
  assert.equal(r.estatisticas.c100Ignorados, 3);
});

test('AVISO-002 IND_OPER fora de 0/1 gera aviso (não é mais descartado em silêncio)', () => {
  const txt = fim(cab([c100(2, '00', 1), c170('01'), c100(2, '00', 2), c100(9, '00', 3), c100(1, '00', 4), c170('01')]));
  const r = M.lerEfdContribuicoes(txt, 't.txt');
  const a2 = r.avisos.filter((x) => /IND_OPER "2"/.test(x));
  assert.equal(a2.length, 1);
  assert.match(a2[0], /^2 nota\(s\) C100/);
  assert.match(a2[0], /1 item\(ns\) C170/);
  assert.ok(r.avisos.some((x) => /^1 nota\(s\) C100 com IND_OPER "9"/.test(x)));
  assert.equal(r.itens.length, 1);
  assert.equal(r.entradas.length, 0);
});

test('AVISO-003 valor com ponto decimal e sem vírgula é lido como decimal, com aviso', () => {
  assert.equal(M.centavos('1234.56'), 123456);
  assert.equal(M.centavos('1234.5'), 123450);
  assert.equal(M.centavos('-0.99'), -99);
  assert.equal(M.centavos('1234,56'), 123456);
  assert.equal(M.centavos('1.234,56'), 123456);
  const eventos = [];
  assert.equal(M.centavos('1234.56', (t, x) => eventos.push([t, x])), 123456);
  assert.deepEqual(eventos, [['pontoDecimal', '1234.56']]);
  const txt = fim(cab([c100(1, '00', 1), c170('01')]));   // VL_ITEM do C170 = "1000.00"
  const r = M.lerEfdContribuicoes(txt, 't.txt');
  assert.equal(r.itens[0].vlItem, 100000, 'R$ 1.000,00 e não R$ 100.000,00');
  const a = r.avisos.filter((x) => /ponto decimal/.test(x));
  assert.equal(a.length, 1);
  assert.match(a[0], /^1 valor\(es\)/);
  assert.match(a[0], /C170 \(1, ex\.: "1000\.00"\)/);
});

test('AVISO-004 ponto com 3 casas e sem vírgula segue como milhar (regra antiga), mas avisa; vírgula normal não avisa', () => {
  assert.equal(M.centavos('1.234'), 123400);
  const ev = [];
  M.centavos('1.234', (t) => ev.push(t));
  M.centavos('1.234,56', (t) => ev.push(t));
  M.centavos('12,50', (t) => ev.push(t));
  assert.deepEqual(ev, ['pontoAmbiguo']);
  const limpo = M.lerEfdContribuicoes(fim(cab([c100(1, '00', 1), c170('01').replace('1000.00', '1000,00')])), 't.txt');
  assert.ok(!limpo.avisos.some((x) => /ponto|COD_SIT|IND_OPER/.test(x)), JSON.stringify(limpo.avisos));
});

test('BLOCOF-004 F100, F120, F130, F150 e M210/M610 por posição (inline)', () => {
  const linhas = cab([
    '|F010|11222333000181|',
    '|F100|1|C1||15012025|1000,00|01|1000,00|1,6500|16,50|01|1000,00|7,6000|76,00|||||Receita|',
    '|F100|0|F1||15012025|200,00|50|200,00|1,6500|3,30|50|200,00|7,6000|15,20|05|0|||Aluguel|',
    '|F100|7|F2||15012025|50,00|99|0,00|0,0000|0,00|99|0,00|0,0000|0,00||||||',
    '|F120|09|01|0|1|100,00|0,00|50|100,00|1,6500|1,65|50|100,00|7,6000|7,60|||Maquina|',
    '|F130|10|01|0|1|012025|600,00|0,00|600,00|1|53|10,00|1,6500|0,17|53|10,00|7,6000|0,76|||Predio|',
    '|F150|18|1000,00|0,00|1000,00|1000,00|50|0,6500|6,50|50|3,0000|30,00|Estoque|',
    '|M200|16,50|0,00|0,00|16,50|0,00|0,00|16,50|0,00|0,00|0,00|0,00|16,50|',
    '|M210|01|1000,00|1000,00|0,00|0,00|1000,00|1,6500|||16,50|0,00|0,00|0,00|0,00|16,50|',
    '|M600|76,00|0,00|0,00|76,00|0,00|0,00|76,00|0,00|0,00|0,00|0,00|76,00|',
    '|M610|01|1000,00|1000,00|0,00|0,00|1000,00|7,6000|||76,00|0,00|0,00|0,00|0,00|76,00|',
  ]);
  const r = M.lerEfdContribuicoes(fim(linhas), 'f.txt');
  assert.deepEqual(r.erros, []);
  const f = r.blocoF;
  assert.deepEqual(f.registros, { F100: 3, F120: 1, F130: 1, F150: 1 });
  assert.equal(f.receitas.vlOper, 100000);
  assert.equal(f.receitas.pis, 1650); assert.equal(f.receitas.cofins, 7600);
  assert.equal(f.outrasOperacoes.lancamentos, 1);
  assert.equal(f.creditos.porNat['05'].pis, 330);
  assert.equal(f.creditos.porNat['09'].pis, 165);
  assert.equal(f.creditos.porNat['10'].cofins, 76);
  assert.equal(f.creditos.porNat['18'].pis, 650);
  assert.equal(f.creditos.porNat['18'].origens.F150, 1);
  assert.equal(f.aluguel.pis, 330);
  assert.equal(r.apuracaoM.pis.devido, 1650); assert.equal(r.apuracaoM.cofins.devido, 7600);
  assert.equal(r.apuracaoM.pis.detalhes[0].VL_CONT_PER, 1650);
  assert.equal(r.apuracaoM.cofins.detalhes[0].aliq, 7.6);
  const ap = M.apurar([r], { hoje: HOJE });
  assert.match(ap.leitura.motivos.tema69, /Receitas e créditos estão no bloco F/);
});

test('BLOCOF-005 arquivo sem bloco F mantém a mensagem antiga e não ganha resumo', () => {
  const r = M.apurar([M.lerEfdContribuicoes(fim(cab()), 'v.txt')], { hoje: HOJE });
  assert.equal(r.blocoF.presente, false);
  assert.equal(r.apuracaoM.presente, false);
  assert.equal(r.leitura.motivos.tema69, 'Nenhuma saída com itens C170 nos arquivos.');
});
