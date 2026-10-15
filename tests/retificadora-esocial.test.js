// Pacote de retificação do eSocial: S-1010 → (S-1298 → S-1200 retificadores → S-1299) por competência.
const test = require('node:test');
const assert = require('node:assert/strict');
const ME = require('../motor-esocial.js');
const RE = require('../retificadora-esocial.js');

const NS = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador>';
const ev = (evt, corpo, id) => `<eSocial xmlns="${NS}/${evt}/v_S_01_02_00"><${evt} Id="${id}">${emp}${corpo}</${evt}></eSocial>`;
// Formato do download de eventos: o evento e o retorno com o recibo no mesmo arquivo.
const baixado = (evento, recibo) => `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="http://www.esocial.gov.br/schema/download/retornoSolicitacao/v1_0_0"><retornoEvento><evento>${evento}</evento><recibo><nrRecibo>${recibo}</nrRecibo></recibo></retornoEvento></eSocial>`;
const rub = (cod, dsc, inc) => ev('evtTabRubrica', `<ideEvento><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>X</verProc></ideEvento><infoRubrica><inclusao><ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2021-01</iniValid></ideRubrica><dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>6001</natRubr><tpRubr>1</tpRubr><codIncCP>${inc}</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS></dadosRubrica></inclusao></infoRubrica>`, 'R' + cod);
const remun = (cpf, per, itens) => ev('evtRemun', `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${per}</perApur><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>X</verProc></ideEvento><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><dmDev><ideDmDev>1</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>12345678000190</nrInsc><codLotacao>L1</codLotacao><remunPerApur>${itens.map(([c, v]) => `<itensRemun><codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v}</vrRubr></itensRemun>`).join('')}</remunPerApur></ideEstabLot></infoPerApur></dmDev>`, 'E' + cpf + per);
const fecha = (per) => ev('evtFechaEvPer', `<ideEvento><indApuracao>1</indApuracao><perApur>${per}</perApur><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>X</verProc></ideEvento><infoFech><evtRemun>S</evtRemun><evtPgtos>S</evtPgtos><evtComProd>N</evtComProd><evtContratAvNP>N</evtContratAvNP><evtInfoComplPer>N</evtInfoComplPer></infoFech>`, 'F' + per);
const estab = ev('evtTabEstab', '<infoEstab><inclusao><ideEstab><tpInsc>1</tpInsc><nrInsc>12345678000190</nrInsc><iniValid>2021-01</iniValid></ideEstab><dadosEstab><cnaePrep>2511000</cnaePrep><aliqGilrat><aliqRat>3</aliqRat><fap>1.0000</fap></aliqGilrat></dadosEstab></inclusao></infoEstab>', 'S1');
const CPF1 = '52998224725', CPF2 = '11144477735';
function lidos(semFechamento, semRecibo) {
  const x = [ME.lerXml(estab, 'e.xml'), ME.lerXml(rub('001', 'Salário Base', '11') + '', 'r1.xml'), ME.lerXml(rub('020', 'Aviso Prévio Indenizado', '11'), 'r2.xml'),
    ME.lerXml(baixado(remun(CPF1, '2025-03', [['001', '3000.00'], ['020', '2000.00']]), '1.1.0000000000000000001'), 'a.xml'),
    ME.lerXml(semRecibo ? remun(CPF2, '2025-03', [['020', '1000.00']]) : baixado(remun(CPF2, '2025-03', [['020', '1000.00']]), '1.1.0000000000000000002'), 'b.xml')];
  if (!semFechamento) x.push(ME.lerXml(fecha('2025-03'), 'f.xml'));
  return x;
}

test('ESR-001: lista as rubricas patronais e associa à tese', () => {
  const r = RE.rubricas(lidos());
  const aviso = r.find((x) => x.cod === '020');
  assert.equal(aviso.tese, 'T005'); assert.equal(aviso.base, 300000);
});

test('ESR-002: gera S-1010 (encerra e inclui), reabertura, retificadores e fechamento; valida a estrutura', () => {
  const p = RE.gerar(lidos(), { rubricas: [{ chave: 'T1|020', novoCodIncCP: '00' }], desde: '2025-01', agora: new Date('2026-10-14T12:00:00Z') });
  assert.deepEqual(p.erros, []);
  assert.deepEqual(p.arquivos.map((a) => a.nome), ['S-1010-020-encerra-2024-12.xml', 'S-1010-020-inclui-2025-01.xml', '2025-03-1-S-1298-reabertura.xml',
    `2025-03-2-S-1200-${CPF1}.xml`, `2025-03-2-S-1200-${CPF2}.xml`, '2025-03-3-S-1299-fechamento.xml']);
  const [enc, inc, reab, r1] = p.arquivos.map((a) => a.xml);
  assert.match(enc, /<alteracao><ideRubrica><codRubr>020<\/codRubr><ideTabRubr>T1<\/ideTabRubr><iniValid>2021-01<\/iniValid><\/ideRubrica><dadosRubrica>.*<codIncCP>11<\/codIncCP>.*<novaValidade><iniValid>2021-01<\/iniValid><fimValid>2024-12<\/fimValid><\/novaValidade>/);
  assert.match(inc, /<inclusao><ideRubrica><codRubr>020<\/codRubr><ideTabRubr>T1<\/ideTabRubr><iniValid>2025-01<\/iniValid><\/ideRubrica><dadosRubrica>.*<codIncCP>00<\/codIncCP>/);
  assert.match(reab, /xmlns="http:\/\/www.esocial.gov.br\/schema\/evt\/evtReabreEvPer\/v_S_01_03_00"><evtReabreEvPer Id="ID11234567800000020261014120000\d{5}"><ideEvento><indApuracao>1<\/indApuracao><perApur>2025-03<\/perApur><tpAmb>1<\/tpAmb>/);
  assert.match(r1, /<ideEvento><indRetif>2<\/indRetif><nrRecibo>1.1.0000000000000000001<\/nrRecibo><indApuracao>1<\/indApuracao><perApur>2025-03<\/perApur>/);
  assert.match(r1, /<itensRemun><codRubr>020<\/codRubr><ideTabRubr>T1<\/ideTabRubr><vrRubr>2000.00<\/vrRubr><\/itensRemun>/);
  assert.match(p.arquivos[5].xml, /<infoFech><evtRemun>S<\/evtRemun><evtPgtos>S<\/evtPgtos>/);
  assert.equal(p.competencias[0].baseRetirada, 300000);
  assert.equal(p.competencias[0].contribuicaoEstimada, Math.round(300000 * (0.20 + 0.03 + 0.058)));
  assert.deepEqual(RE.validar(p).erros, []);
});

test('ESR-003: sem o fechamento original ou sem recibo, não gera pacote', () => {
  const a = RE.gerar(lidos(true), { rubricas: [{ chave: 'T1|020' }], desde: '2025-01' });
  assert.ok(a.erros.some((e) => /S-1299 original/.test(e))); assert.equal(a.arquivos.length, 0);
  const b = RE.gerar(lidos(false, true), { rubricas: [{ chave: 'T1|020' }], desde: '2025-01' });
  assert.ok(b.erros.some((e) => /Recibo do S-1200/.test(e)));
  const c = RE.gerar(lidos(false, true), { rubricas: [{ chave: 'T1|020' }], desde: '2025-01', recibos: { [`${CPF2}|2025-03|1`]: '1.1.0000000000000000009' } });
  assert.deepEqual(c.erros, []);
});
