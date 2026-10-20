// Motor eSocial v0.4.0: T009 (FAP), T010 (RAT/GILRAT), T061 (RAT preponderante), T059 (natRubr) e T076 (13º sobre aviso-prévio).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-esocial.js');

const NS = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador>';
const xml = (evt, corpo, id) => `<eSocial xmlns="${NS}/${evt}/v_S_01_02_00"><${evt} Id="${id || 'ID1'}">${emp}${corpo}</${evt}></eSocial>`;
const HOJE = new Date('2026-10-14');
const A = '12345678000190', B = '12345678000271';

const s1005 = (ests) => xml('evtTabEstab', '<infoEstab>' + ests.map(([nr, cnae, rat, fap]) => `<inclusao><ideEstab><tpInsc>1</tpInsc><nrInsc>${nr}</nrInsc><iniValid>2021-01</iniValid></ideEstab><dadosEstab><cnaePrep>${cnae}</cnaePrep><aliqGilrat><aliqRat>${rat}</aliqRat><fap>${fap}</fap></aliqGilrat></dadosEstab></inclusao>`).join('') + '</infoEstab>');
const rub = (cod, dsc, nat, inc = '11', tp = '1') => `<inclusao><ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2021-01</iniValid></ideRubrica><dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>${nat}</natRubr><tpRubr>${tp}</tpRubr><codIncCP>${inc}</codIncCP></dadosRubrica></inclusao>`;
const s1010 = (rs) => xml('evtTabRubrica', '<infoRubrica>' + rs.join('') + '</infoRubrica>');
const itens = (tag, its) => its.map(([c, v]) => `<${tag}><codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v}</vrRubr></${tag}>`).join('');
const estLot = (nr, inner) => `<ideEstabLot><tpInsc>1</tpInsc><nrInsc>${nr}</nrInsc><codLotacao>L${nr.slice(-2)}</codLotacao>${inner}</ideEstabLot>`;
const s1200 = (cpf, per, its, nr = A) => xml('evtRemun', `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${per}</perApur></ideEvento><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><dmDev><ideDmDev>1</ideDmDev><infoPerApur>${estLot(nr, '<remunPerApur>' + itens('itensRemun', its) + '</remunPerApur>')}</infoPerApur></dmDev>`, 'R' + cpf + per + nr);
const s2299 = (cpf, dt, its) => xml('evtDeslig', `<ideEvento><indRetif>1</indRetif></ideEvento><ideVinculo><cpfTrab>${cpf}</cpfTrab><matricula>1</matricula></ideVinculo><infoDeslig><dtDeslig>${dt}</dtDeslig><mtvDeslig>02</mtvDeslig><verbasResc><dmDev><ideDmDev>1</ideDmDev><infoPerApur>${estLot(A, itens('detVerbas', its))}</infoPerApur></dmDev></verbasResc></infoDeslig>`, 'D' + cpf);
const run = (docs, opts) => M.apurar(docs.map((x) => M.lerXml(x)), Object.assign({ hoje: HOJE }, opts));
const T = (r) => Object.fromEntries(r.teses.map((x) => [x.id, x]));
const dep = (r, id) => r.dependencias.find((d) => d.id === id);
const r2 = (v) => Math.round(v * 100) / 100;
const SAL = rub('001', 'Salário Base', '1000');

test('V3-001: T009 sem FAP revisado fica zerada com aviso; com FAP revisado calcula a diferença sobre a base do RAT', () => {
  const docs = [s1005([[A, '2511000', 3, '1.5000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '10000']])];
  const sem = run(docs);
  assert.equal(T(sem).T009, undefined);
  assert.match(sem.avisos.join(' '), /T009.*informe o FAP revisado/);
  assert.equal(dep(sem, 'T009').status, 'aguardando-dado');
  assert.ok(dep(sem, 'T009').documentos.length >= 3);
  const com = run(docs, { fapPublicado: 1.0 });
  const t = T(com).T009;
  assert.equal(t.valor, r2(10000 * 0.03 * 0.5));
  assert.equal(t.condicional, true); assert.match(t.condicao, /FAP/);
  assert.equal(dep(com, 'T009').status, 'calculada');
  // lista por vigência: só vale na competência coberta
  const lista = run(docs, { fapPublicado: [{ ini: '2025-01', fim: '2025-12', fap: 1.2 }] });
  assert.equal(T(lista).T009.valor, r2(10000 * 0.03 * 0.3));
  const fora = run(docs, { fapPublicado: [{ ini: '2024-01', fim: '2024-12', fap: 1.2 }] });
  assert.equal(T(fora).T009, undefined);
  // FAP revisado maior que o aplicado: nada a recuperar
  assert.equal(T(run(docs, { fapPublicado: 2.0 })).T009, undefined);
});

test('V3-002: T010 compara o RAT declarado com o grau de risco do CNAE (tabela parcial ou opts.cnaeRisco)', () => {
  const docs = [s1005([[A, '6201501', 3, '1.5000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '10000']])];
  const r = run(docs);
  assert.equal(T(r).T010.valor, r2(10000 * (3 - 1) / 100 * 1.5));
  assert.match(r.avisos.join(' '), /tabela parcial.*CONFERIR com o Anexo V/);
  const ov = run([s1005([[A, '2511000', 3, '1.5000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '10000']])], { cnaeRisco: { '2511000': 2 } });
  assert.equal(T(ov).T010.valor, r2(10000 * 0.01 * 1.5));
  assert.doesNotMatch(ov.avisos.join(' '), /tabela parcial/);
  // CNAE fora da tabela: zero + aviso, sem inventar grau
  const sem = run([s1005([[A, '2511000', 3, '1.5000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '10000']])]);
  assert.equal(T(sem).T010, undefined);
  assert.match(sem.avisos.join(' '), /CNAE sem grau de risco/);
  assert.equal(dep(sem, 'T010').status, 'aguardando-dado');
  // RAT correto: sem tese; RAT abaixo do grau: aviso de passivo, sem crédito
  const igual = run([s1005([[A, '4120400', 3, '1.0000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '10000']])]);
  assert.equal(T(igual).T010, undefined);
  const abaixo = run([s1005([[A, '4120400', 1, '1.0000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '10000']])]);
  assert.equal(T(abaixo).T010, undefined); assert.match(abaixo.avisos.join(' '), /ABAIXO do grau/);
});

test('V3-003: T061 acha o estabelecimento preponderante e cobra o excesso do que repete o RAT dele acima do próprio grau', () => {
  const docs = [s1005([[A, '4120400', 3, '1.0000'], [B, '6201501', 3, '1.0000']]), s1010([SAL]),
    s1200('1', '2025-03', [['001', '5000']], A), s1200('2', '2025-03', [['001', '5000']], A), s1200('3', '2025-03', [['001', '5000']], A),
    s1200('4', '2025-03', [['001', '8000']], B)];
  const r = run(docs);
  assert.equal(r.ratPreponderante.nrInsc, A);
  assert.equal(r.ratPreponderante.empregadosCompetencias, 3);
  assert.equal(r.ratPreponderante.lotacoes[0].cod, 'L90');
  assert.equal(T(r).T061.valor, r2(8000 * (3 - 1) / 100 * 1));
  assert.equal(T(r).T010, undefined, 'o estabelecimento preponderante tem RAT correto e o outro foi para a T061');
  assert.equal(dep(r, 'T061').status, 'calculada');
  // um só estabelecimento: T061 não se aplica
  const um = run([s1005([[A, '4120400', 3, '1.0000']]), s1010([SAL]), s1200('1', '2025-03', [['001', '5000']])]);
  assert.equal(dep(um, 'T061').status, 'nao-aplicavel');
});

test('V3-004: T059 e natRubr — natRubr prevalece sobre a descrição; natureza não salarial com incidência vira T059; incoerência vira aviso', () => {
  const docs = [s1005([[A, '2511000', 2, '1.0000']]),
    s1010([SAL, rub('002', 'Bônus Xpto', '1300'), rub('003', 'Verba Zeta', '1406'), rub('004', 'Ajuda de custo', '1000'), rub('005', 'Adicional Y', '1205', '00')]),
    s1200('1', '2025-03', [['001', '5000'], ['002', '1000'], ['003', '700'], ['004', '300'], ['005', '200']])];
  const r = run(docs, { semExtra: true }); const t = T(r); // núcleo isolado: no motor integrado 'ajuda de custo' passa para T080
  assert.equal(t.T063.base, 1000, 'natRubr 1300 (PLR) vence a descrição "Bônus" (que seria T065)');
  assert.equal(t.T065, undefined);
  assert.equal(t.T059.base, 700, 'auxílio-creche (1406) com incidência declarada, sem tese específica');
  assert.equal(t.T059.condicional, true);
  assert.match(t.T059.rubricas[0].motivo, /natRubr 1406/);
  assert.equal(t.T028.base, 300, 'natRubr salarial não tem tese: a descrição (plano B) decide');
  assert.match(r.avisos.join(' '), /Incoerência natRubr × incidência.*Adicional Y/);
  assert.match(r.avisos.join(' '), /mapa PARCIAL da Tabela 3/);
  assert.equal(dep(r, 'T059').status, 'calculada');
  // mapa próprio via opts.natRubrMapa
  const mapa = run(docs, { natRubrMapa: { '1406': { cat: 'salarial', nome: 'x' } }, semExtra: true });
  assert.equal(T(mapa).T059, undefined);
});

test('V3-005: T076 estima 1/12 do aviso-prévio indenizado, limitado ao 13º com incidência pago na rescisão', () => {
  const rs = [SAL, rub('020', 'Aviso Prévio Indenizado', '6003'), rub('030', '13º Salário Proporcional', '5001', '12'), rub('031', '13º s/ Aviso Prévio Indenizado', '6001', '12')];
  const docs = [s1005([[A, '2511000', 2, '1.0000']]), s1010(rs)];
  const aliq = 0.20 + 0.02 * 1 + 0.058;
  const r = run(docs.concat([s2299('1', '2025-03-10', [['020', '3000'], ['030', '1500']])]));
  const t = T(r);
  assert.equal(t.T076.base, 250);
  assert.equal(t.T076.valor, r2(250 * aliq));
  assert.equal(t.T076.condicional, true); assert.match(t.T076.condicao, /controvertid/);
  assert.match(r.avisos.join(' '), /T076 estimada em 1 rescisão.*RFB entende que incide/);
  assert.doesNotMatch(r.avisos.join(' '), /decisão pendente/);
  // limite: 13º pago menor que 1/12 do aviso
  assert.equal(T(run(docs.concat([s2299('1', '2025-03-10', [['020', '3000'], ['030', '100']])]))).T076.base, 100);
  // sem 13º com incidência na rescisão: sem valor e com aviso
  const sem = run(docs.concat([s2299('1', '2025-03-10', [['020', '3000']])]));
  assert.equal(T(sem).T076, undefined); assert.match(sem.avisos.join(' '), /T076: 1 rescisão.*sem valor estimado/);
  assert.match(sem.avisos.join(' '), /decisão pendente/);
  // 13º do aviso pago em rubrica própria: vale o valor real, sem estimar (e sai da T005)
  const real = run(docs.concat([s2299('1', '2025-03-10', [['020', '3000'], ['031', '240']])]));
  assert.equal(T(real).T076.base, 240); assert.equal(T(real).T005.base, 3000);
  assert.doesNotMatch(real.avisos.join(' '), /T076 estimada/);
  // competência fora do prazo: entra no total, mas não no valor no prazo
  const velho = run(docs.concat([s2299('1', '2020-03-10', [['020', '3000'], ['030', '1500']])]));
  assert.equal(T(velho).T076.valorNoPrazo, 0); assert.ok(T(velho).T076.valor > 0);
});
