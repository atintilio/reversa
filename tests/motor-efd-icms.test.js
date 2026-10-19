// Leitor da EFD ICMS/IPI: leitura (0000, 0150, 0200, C100, C170, C190, C197, E110, E111, E116, H010), totais e avisos.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-efd-icms.js');

const L = (...c) => '|' + c.join('|') + '|';
const reg0000 = L('0000', '019', '0', '01012024', '31012024', 'EMPRESA TESTE LTDA', '12345678000190', '', 'SC', '255000000', '4205407', '', '', 'A', '0');
const reg0150 = L('0150', 'F001', 'FORNECEDOR SA', '01058', '98765432000110', '', '111222333', '4205407', '', 'RUA A', '10', '', 'CENTRO');
const reg0200a = L('0200', 'P1', 'PRODUTO UM', '', '', 'UN', '00', '22021000', '', '', '', '17,00', '');
const reg0200b = L('0200', 'P2', 'PRODUTO DOIS', '', '', 'UN', '00', '19059090', '', '', '', '0,00', '');
// saída regular
const c100s = L('C100', '1', '0', 'F001', '55', '00', '1', '100', '4'.repeat(44), '05012024', '05012024', '1500,00', '0', '0,00', '0,00', '1500,00', '9', '0,00', '0,00', '0,00', '1000,00', '170,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00');
const c170s1 = L('C170', '1', 'P1', '', '10,00', 'UN', '1000,00', '0,00', '0', '000', '5102', '', '1000,00', '17,00', '170,00', '0,00', '0,00', '0,00', '0', '50', '', '0,00', '0,00', '0,00', '01', '0,00', '0,00', '', '', '0,00', '01', '0,00', '0,00', '', '', '0,00', '', '0,00');
const c170s2 = L('C170', '2', 'P2', '', '5,00', 'UN', '500,00', '0,00', '0', '040', '5102', '', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0', '50', '', '0,00', '0,00', '0,00', '01', '0,00', '0,00', '', '', '0,00', '01', '0,00', '0,00', '', '', '0,00', '', '0,00');
const c190s1 = L('C190', '000', '5102', '17,00', '1000,00', '1000,00', '170,00', '0,00', '0,00', '0,00', '0,00', '');
const c190s2 = L('C190', '040', '5102', '0,00', '500,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '');
// entrada regular
const c100e = L('C100', '0', '1', 'F001', '55', '00', '1', '200', '5'.repeat(44), '10012024', '10012024', '600,00', '0', '0,00', '0,00', '600,00', '9', '0,00', '0,00', '0,00', '600,00', '102,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00');
const c190e = L('C190', '000', '1102', '17,00', '600,00', '600,00', '102,00', '0,00', '0,00', '0,00', '0,00', '');
const c197e = L('C197', 'SC10000001', 'AJUSTE TESTE', '', '600,00', '17,00', '102,00', '0,00');
// cancelada
const c100c = L('C100', '1', '0', 'F001', '55', '02', '1', '101', '6'.repeat(44), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '');
const e100 = L('E100', '01012024', '31012024');
const e110 = L('E110', '170,00', '0,00', '0,00', '0,00', '102,00', '0,00', '0,00', '0,00', '0,00', '68,00', '0,00', '68,00', '0,00', '0,00');
const e111 = L('E111', 'SC020001', 'AJUSTE DE APURACAO', '5,00');
const e116 = L('E116', '000', '68,00', '20022024', '1006', '', '', '', '', '012024');
const h010 = L('H010', 'P1', 'UN', '3,000', '10,00', '30,00', '0', '', '', '', '30,00');

const base = [reg0000, reg0150, reg0200a, reg0200b, c100s, c170s1, c170s2, c190s1, c190s2, c100e, c190e, c197e, c100c, e100, e110, e111, e116, h010, L('9999', '1')];
const arquivo = (linhas) => linhas.join('\r\n') + '\r\n';

test('lê identificação, participantes e itens com NCM', () => {
  const r = M.lerEfdIcms(arquivo(base), 'janeiro.txt');
  assert.equal(r.arquivo, 'janeiro.txt');
  assert.equal(r.cnpj, '12345678000190');
  assert.equal(r.empresa, 'EMPRESA TESTE LTDA');
  assert.equal(r.codVer, '019');
  assert.equal(r.ini, '2024-01-01');
  assert.equal(r.fin, '2024-01-31');
  assert.equal(r.participantes.length, 1);
  assert.equal(r.participantes[0].cnpj, '98765432000110');
  assert.equal(r.itens.length, 2);
  assert.equal(r.itens[0].ncm, '22021000');
  assert.equal(r.itens[0].aliqIcms, 17);
});

test('lê notas, itens C170 (com NCM do 0200), C190 e C197', () => {
  const r = M.lerEfdIcms(arquivo(base));
  assert.equal(r.notas.length, 3);
  const [s, e, c] = r.notas;
  assert.equal(s.indOper, '1'); assert.equal(s.numDoc, '100'); assert.equal(s.dtDoc, '2024-01-05'); assert.equal(s.vlDoc, 1500); assert.equal(s.vlIcms, 170);
  assert.equal(s.itens.length, 2); assert.equal(s.itens[0].cfop, '5102'); assert.equal(s.itens[0].cstIcms, '000'); assert.equal(s.itens[0].ncm, '22021000'); assert.equal(s.itens[0].qtd, 10);
  assert.equal(s.analitico.length, 2);
  assert.equal(e.ajustes.length, 1); assert.equal(e.ajustes[0].codAj, 'SC10000001'); assert.equal(e.ajustes[0].vlIcms, 102);
  assert.equal(r.ajustesC197.length, 1); assert.equal(r.ajustesC197[0].numDoc, '200');
  assert.equal(c.codSit, '02'); assert.equal(c.situacao, 'documento cancelado');
  assert.equal(r.contagem['9999'], 1);
});

test('resumo do C190 por CST/CFOP/alíquota, com sentido pelo CFOP', () => {
  const r = M.lerEfdIcms(arquivo(base));
  assert.equal(r.resumoC190.length, 3);
  const ent = r.resumoC190.find(g => g.cfop === '1102');
  assert.equal(ent.sentido, 'entrada'); assert.equal(ent.vlIcms, 102); assert.equal(ent.vlOpr, 600);
  const sai = r.resumoC190.find(g => g.cfop === '5102' && g.cstIcms === '000');
  assert.equal(sai.sentido, 'saida'); assert.equal(sai.aliqIcms, 17); assert.equal(sai.vlBcIcms, 1000);
});

test('lê E110, E111, E116 e H010', () => {
  const r = M.lerEfdIcms(arquivo(base));
  assert.equal(r.apuracaoE110.length, 1);
  const a = r.apuracaoE110[0];
  assert.equal(a.vlTotDebitos, 170); assert.equal(a.vlTotCreditos, 102); assert.equal(a.vlSldApurado, 68); assert.equal(a.vlIcmsRecolher, 68);
  assert.equal(a.periodo.ini, '2024-01-01');
  assert.equal(r.ajustesE111.length, 1); assert.equal(r.ajustesE111[0].vlAjApur, 5); assert.equal(a.ajustes.length, 1);
  assert.equal(r.obrigacoesE116[0].vlOr, 68); assert.equal(r.obrigacoesE116[0].dtVcto, '2024-02-20'); assert.equal(r.obrigacoesE116[0].mesRef, '012024');
  assert.equal(r.inventarioH010[0].vlItem, 30);
});

test('arquivo regular não gera avisos', () => {
  const r = M.lerEfdIcms(arquivo(base));
  assert.deepEqual(r.avisos, []);
});

test('resumo: totais de ICMS débito, crédito e saldo', () => {
  const r = M.lerEfdIcms(arquivo(base), 'jan.txt');
  const t = M.resumo(r);
  assert.equal(t.arquivos, 1);
  assert.equal(t.icms.debito, 170);
  assert.equal(t.icms.credito, 102);
  assert.equal(t.icms.saldoApurado, 68);
  assert.equal(t.icms.icmsARecolher, 68);
  assert.equal(t.c190.icmsSaidas, 170);
  assert.equal(t.c190.icmsEntradas, 102);
  assert.deepEqual(t.avisos, []);
});

test('resumo de vários arquivos soma e avisa período duplicado', () => {
  const a = M.lerEfdIcms(arquivo(base), 'a.txt'), b = M.lerEfdIcms(arquivo(base), 'b.txt');
  const t = M.resumo([a, b]);
  assert.equal(t.icms.debito, 340);
  assert.ok(t.avisos.some(x => /mais de um arquivo/.test(x)));
});

test('avisa COD_SIT fora do padrão sem descartar a nota', () => {
  const ruim = c100e.replace('|55|00|', '|55|09|');
  const r = M.lerEfdIcms(arquivo([reg0000, reg0150, reg0200a, ruim, c190e, e100, e110]));
  assert.equal(r.notas.length, 1);
  assert.equal(r.notas[0].codSit, '09');
  assert.equal(r.notas[0].codSitPadrao, false);
  assert.ok(r.avisos.some(a => /COD_SIT "09" fora do padrão/.test(a)));
  assert.equal(r.resumoC190.length, 1);
});

test('avisa valor com ponto decimal e o interpreta', () => {
  const ponto = c190s1.replace('|1000,00|1000,00|170,00|', '|1000.50|1000,00|170,00|');
  const r = M.lerEfdIcms(arquivo([reg0000, c100s, ponto, e100, e110]));
  assert.equal(r.resumoC190[0].vlOpr, 1000.5);
  assert.ok(r.avisos.some(a => /ponto decimal.*C190\.VL_OPR/.test(a)));
  assert.equal(r.avisos.filter(a => /ponto decimal.*C190\.VL_OPR/.test(a)).length, 1);
});

test('avisa registro com menos campos que o mínimo, e mantém o que foi lido', () => {
  const curto = '|C190|000|5102|17,00|1000,00|';
  const r = M.lerEfdIcms(arquivo([reg0000, c100s, curto, e100, e110]));
  assert.equal(r.notas[0].analitico.length, 1);
  assert.equal(r.notas[0].analitico[0].vlOpr, 1000);
  assert.equal(r.notas[0].analitico[0].vlIcms, 0);
  assert.ok(r.avisos.some(a => /C190 com menos campos que o mínimo do leiaute \(5 de 12\)/.test(a)));
});

test('outros avisos: sem 0000, C170 sem C100, item sem 0200, COD_VER, data inválida, C190 em nota cancelada', () => {
  const r1 = M.lerEfdIcms(arquivo([c190s1]));
  assert.ok(r1.avisos.some(a => /0000 não encontrado/.test(a)));
  assert.ok(r1.avisos.some(a => /C190 sem C100 anterior/.test(a)));
  assert.equal(r1.notas[0].semC100, true);

  const r2 = M.lerEfdIcms(arquivo([reg0000.replace('|019|', '|19|').replace('|01012024|', '|32012024|'), c100c, c190s1, c100s, c170s1]));
  assert.ok(r2.avisos.some(a => /COD_VER.*fora do padrão/.test(a)));
  assert.ok(r2.avisos.some(a => /Data inválida.*0000\.DT_INI/.test(a)));
  assert.ok(r2.avisos.some(a => /C190 em documento com COD_SIT 02/.test(a)));
  assert.ok(r2.avisos.some(a => /COD_ITEM do C170 sem cadastro no 0200/.test(a)));
  assert.ok(r2.avisos.some(a => /COD_PART do C100 sem cadastro no 0150/.test(a)));
});

test('texto vazio ou lixo não quebra e a lista de dúvidas é devolvida', () => {
  const r = M.lerEfdIcms('', 'vazio.txt');
  assert.equal(r.notas.length, 0);
  assert.ok(r.avisos.length >= 1);
  assert.ok(Array.isArray(r.duvidas) && r.duvidas.length > 0);
  const t = M.resumo(r);
  assert.equal(t.icms.debito, 0);
});
