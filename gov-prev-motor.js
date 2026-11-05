// Reversa Gov · motor SIMULADO do diagnóstico previdenciário (demonstração): teses, cálculo proporcional ao potencial do município,
// metodologia (fato gerador, de onde nasce a divergência) e limites. Bases legais conferidas no motor do Reversa Tax (14/10/2026).
// Valores simulados. Diagnóstico não é crédito.
(function () {
  'use strict';
  var G = window.GovDados, esc = G.esc;
  var ALIQ = 0.22; // exemplo: 20% patronal (Lei 8.212/1991, art. 22, I) + 2% de RAT (art. 22, II); o RAT real varia com o grau de risco
  var CL = { verde: ['Provável', '#1A7F4B'], amarelo: ['Possível', '#C58A12'], vermelho: ['Remoto', '#B3402F'] };
  var TESES = [
    { id: 'T004', nome: 'Contribuição patronal sobre salário-maternidade', orig: 'Folha: a contribuição patronal foi recolhida sobre o salário-maternidade, que o STF afastou da base.', base: 'Lei 8.212/1991, art. 28, §2º e §9º; STF Tema 72 (RE 576.967)', prec: 'STF Tema 72: inconstitucional a contribuição patronal sobre salário-maternidade.', mat: 'Pacificada', cor: 'verde', docs: 'eSocial S-1200/S-1210, DCTFWeb', nota: 'Abrange a cota patronal e o RAT. Não alcança a contribuição do segurado. Compensação via DCTFWeb, art. 26-A da Lei 11.457/2007.', peso: 0.20 },
    { id: 'T005', nome: 'Contribuição patronal sobre aviso-prévio indenizado', orig: 'Folha: rubrica de aviso-prévio indenizado lançada com incidência normal de contribuição.', base: 'Lei 8.212/1991, art. 28, §9º; STJ REsp 1.230.957', prec: 'STJ Tema 478: não incide sobre aviso-prévio indenizado.', mat: 'Pacificada', cor: 'verde', docs: 'eSocial S-1200/S-1210, TRCT', nota: 'Não alcança o reflexo do aviso-prévio indenizado no 13º salário.', peso: 0.18 },
    { id: 'T006', nome: 'Contribuição patronal sobre os 15 primeiros dias de afastamento', orig: 'Folha: remuneração dos 15 primeiros dias de afastamento por doença ou acidente tratada como base.', base: 'Lei 8.213/1991, art. 60, §3º; Lei 8.212/1991, art. 28; STJ REsp 1.230.957', prec: 'STJ Tema 738: não incide sobre os 15 primeiros dias de afastamento.', mat: 'Pacificada', cor: 'verde', docs: 'eSocial S-1200 e S-2230 (afastamentos)', nota: 'Vale para a remuneração paga pelo ente nos 15 primeiros dias.', peso: 0.14 },
    { id: 'VT', nome: 'Vale-transporte pago em dinheiro', orig: 'Folha: vale-transporte em pecúnia incluído na base de contribuição.', base: 'STF RE 478.410', prec: 'STF: o vale-transporte pago em pecúnia não integra a base de contribuição.', mat: 'Consolidada', cor: 'verde', docs: 'eSocial S-1200, folha analítica, GPS/DCTFWeb', nota: 'Conferir a legislação municipal e a forma de pagamento; a prova é a folha analítica.', peso: 0.10 },
    { id: 'DUP', nome: 'Guias recolhidas em duplicidade', orig: 'Arrecadação: a mesma competência e a mesma base foram pagas duas vezes.', base: 'CTN, art. 165; Lei 8.212/1991, art. 89', prec: 'Restituição de indébito: pagamento repetido sem causa.', mat: 'Operacional', cor: 'verde', docs: 'Duas guias quitadas, DCTFWeb, extrato bancário', nota: 'Só há valor quando as duas guias estão quitadas para a mesma base.', peso: 0.08 },
    { id: 'T076', nome: 'Reflexo do aviso-prévio indenizado no 13º salário', orig: 'Folha: 13º proporcional decorrente do aviso-prévio indenizado, com incidência discutida.', base: 'Lei 8.212/1991, art. 28, §9º, "e", item 5; Lei 4.090/1962', prec: 'Incidência discutida; distinguir do aviso-prévio em si (T005).', mat: 'Em disputa', cor: 'amarelo', docs: 'eSocial S-1200/S-1210, tabela de rubricas (S-1010)', nota: 'Não apresentar como pacificada. Só há crédito se houve recolhimento sobre a rubrica.', peso: 0.12 },
    { id: 'IND', nome: 'Indenização de férias não gozadas', orig: 'Folha: indenização de férias não gozadas lançada como remuneração.', base: 'Lei 8.212/1991, art. 28, §9º, "d"', prec: 'Natureza indenizatória; depende da prova do que foi efetivamente pago.', mat: 'Depende de prova', cor: 'amarelo', docs: 'S-1200, ato de concessão da indenização, folha analítica', nota: 'Distinguir da remuneração de férias gozadas, sobre a qual há incidência.', peso: 0.10 },
    { id: 'RUB', nome: 'Rubricas com incidência sem confirmação no cadastro', orig: 'Cadastro: a rubrica está classificada como base no S-1010, mas o tratamento dado na folha diverge.', base: 'Classificação de rubricas no eSocial (S-1010)', prec: 'Divergência entre o cadastro da rubrica e o tratamento dado na folha.', mat: 'A validar', cor: 'amarelo', docs: 'S-1010, S-1200 e parecer do município', nota: 'Análise rubrica a rubrica; pode resultar em nenhuma recuperação.', peso: 0.08 }
  ];
  var REMOTA = { id: 'T-FER', nome: 'Terço constitucional de férias gozadas', orig: 'Folha: terço de férias gozadas com incidência.', base: 'STF Tema 985 (RE 1.072.485)', prec: 'O STF decidiu que incide contribuição patronal sobre o terço de férias gozadas.', mat: 'Desfavorável', cor: 'vermelho', docs: 'eSocial S-1200 (rubrica do terço de férias)', nota: 'Listado só para transparência. Não entra no potencial e não deve ser objeto de pedido de recuperação.', peso: 0 };
  var ARQ = [['eSocial S-1200 (remuneração)', '65 competências'], ['eSocial S-1210 (pagamentos)', '65 competências'], ['eSocial S-1299 (fechamento)', '60 competências'], ['eSocial S-1010 (rubricas)', '1 tabela'], ['DCTFWeb e guias GPS', '60 competências'], ['Folha analítica', '60 competências']];

  function soma(lista, ibge) { var t = null; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t = (t || 0) + G.num(x.potencial); }); return t; }
  function nomeMun(m) { return m.nome ? m.nome + (m.uf ? '/' + m.uf : '') : 'IBGE ' + m.ibge; }
  function calcular(D, m) {
    var pot = soma(D.prev.municipios, m.ibge) || 0, linhas = [], acum = 0;
    TESES.forEach(function (t, i) {
      var v = i === TESES.length - 1 ? pot - acum : Math.round(pot * t.peso / 1000) * 1000;
      acum += v; linhas.push(Object.assign({}, t, { valor: v, base0: Math.round(v / ALIQ) }));
    });
    var prov = linhas.filter(function (l) { return l.cor === 'verde'; }).reduce(function (s, l) { return s + l.valor; }, 0);
    var anos = (D.prev.porAno || []), tot = anos.reduce(function (s, a) { return s + G.num(a.potencial); }, 0) || 1, ac = 0;
    var porAno = anos.map(function (a, i) { var v = i === anos.length - 1 ? pot - ac : Math.round(pot * G.num(a.potencial) / tot); ac += v; return { ano: a.ano, v: v }; });
    return { pot: pot, linhas: linhas, prov: prov, poss: pot - prov, passivo: Math.round(pot * 0.1889 / 1000) * 1000, porAno: porAno, serv: 40 + (Number(String(m.ibge).slice(-3)) % 160) };
  }

  var CSS = '.mt-fluxo{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:12px 0}.mt-fluxo>div{border:1px solid #E1E6EC;border-top:3px solid #1E9488;background:#fff;padding:10px 12px;font-size:12.5px;line-height:1.45}.mt-fluxo b{display:block;font-size:13px;margin-bottom:4px}.mt-fluxo small{color:#5B6B7C}' +
    '.mt-ex{background:#EEF2F5;padding:12px 16px;font-size:13px;line-height:1.7;margin-top:10px}.mt-ex code{font-family:inherit;font-weight:700}.mt-orig td,.mt-orig th{padding:6px 8px;border-bottom:1px solid #E1E6EC;text-align:left;font-size:13px;vertical-align:top}.mt-orig small{display:block;color:#5B6B7C}@media(max-width:760px){.mt-fluxo{grid-template-columns:1fr}}';

  // De onde vêm os valores: fato gerador, fluxo de apuração e origem das divergências.
  function metodologia(m, R) {
    var ex = R.linhas[1], base = ex.base0, v = ex.valor;
    function r(x) { return G.brl(x); }
    return '<div class="mt-bloco"><h3>De onde vêm os valores</h3>' +
      '<p style="font-size:13.5px;line-height:1.55;margin:6px 0"><b>Fato gerador.</b> A contribuição previdenciária patronal incide sobre a remuneração paga, devida ou creditada aos segurados empregados e contribuintes individuais que prestam serviço ao município (Lei 8.212/1991, art. 22, I, e art. 28). Só entra na base o que tem natureza de remuneração; o que a lei exclui (art. 28, §9º) ou que os tribunais afastaram não gera contribuição. Quando o município recolhe sobre o que não era fato gerador, nasce o indébito: é aí que surge a oportunidade.</p>' +
      '<p style="font-size:13.5px;line-height:1.55;margin:6px 0"><b>Como a divergência aparece.</b> O Reversa não estima: confronta quatro camadas do próprio município e olha onde elas não batem.</p>' +
      '<div class="mt-fluxo"><div><b>1. O que foi pago</b><small>Folha e eventos S-1200/S-1210 do eSocial: cada rubrica, valor e competência.</small></div><div><b>2. O que a lei manda incluir</b><small>Natureza da rubrica (S-1010) comparada com o art. 28 e com a jurisprudência.</small></div><div><b>3. O que foi declarado</b><small>Base e contribuição informadas na DCTFWeb.</small></div><div><b>4. O que foi recolhido</b><small>Guias GPS quitadas por competência.</small></div><div><b>5. A diferença</b><small>Recolhido a maior vira potencial a validar; a menor, exposição do município.</small></div></div>' +
      '<div class="mt-ex"><b>Exemplo (simulado), tese T005, aviso-prévio indenizado.</b> A rubrica foi lançada na folha com incidência normal. Por ser indenizatória, a lei a exclui da base (art. 28, §9º). Base lançada indevidamente: <code>' + r(base) + '</code> × alíquota <code>22%</code> = contribuição recolhida a maior de <code>' + r(v) + '</code>. Esse valor só se confirma com a prova: XML do S-1200, TRCT e a guia da competência.</div>' +
      '<h3 style="margin-top:16px">Onde nascem as oportunidades</h3><table class="mt-orig" style="width:100%;border-collapse:collapse"><thead><tr><th>Origem da divergência</th><th>O que acontece</th><th>Teses</th></tr></thead><tbody>' +
      '<tr><td><b>Verbas que não compõem a base</b></td><td>A folha trata como remuneração o que a lei ou o STF/STJ excluem (salário-maternidade, aviso-prévio indenizado, 15 primeiros dias, vale-transporte em dinheiro).</td><td>T004, T005, T006, VT</td></tr>' +
      '<tr><td><b>Natureza indenizatória a provar</b></td><td>Pagamentos que podem ser indenização, mas dependem do ato e da prova do que foi pago.</td><td>IND, T076</td></tr>' +
      '<tr><td><b>Classificação de rubricas</b></td><td>O cadastro da rubrica (S-1010) diverge do tratamento dado na folha.</td><td>RUB</td></tr>' +
      '<tr><td><b>Arrecadação</b></td><td>A mesma competência e a mesma base pagas duas vezes.</td><td>DUP</td></tr>' +
      '<tr><td><b>Exposição (passivo)</b></td><td>Base informada abaixo do pago ou competência sem guia: risco do município, que nunca soma ao potencial.</td><td>não entra no potencial</td></tr></tbody></table>' +
      '<p style="font-size:12.5px;color:#5B6B7C;margin:10px 0 0">Prazo: o município só recupera o que está dentro de cinco anos (CTN, art. 168). O valor de cada tese é a soma das diferenças por competência, nunca uma estimativa de mercado.</p></div>';
  }
  function limites() {
    return '<ul class="dp-lim">' +
      '<li><b>Só o RGPS.</b> O diagnóstico alcança segurados do Regime Geral (celetistas, comissionados, temporários). Servidores estatutários vinculados a regime próprio (RPPS) ficam fora, e a regularidade do RPPS (CRP) é tratada à parte.</li>' +
      '<li><b>Ente público.</b> A contribuição a terceiros (Sistema S) não é recolhida por prefeituras; por isso o cálculo considera cota patronal e RAT.</li>' +
      '<li><b>Valor não é crédito.</b> O potencial só vira crédito se houve recolhimento sobre a rubrica, o documento de prova existe e a tese é validada pelo jurídico.</li>' +
      '<li><b>Prazo.</b> Pedidos de restituição e compensação observam o prazo de cinco anos (CTN, art. 168) e o rito da DCTFWeb (Lei 11.457/2007, art. 26-A).</li>' +
      '<li><b>Em disputa não é certeza.</b> Teses "Possível" não devem ser apresentadas como pacificadas, e as "Remotas" não devem ser pleiteadas.</li>' +
      '<li><b>Revisão.</b> Bases legais e precedentes conferidos em 14/10/2026; revalidar antes de qualquer pedido. Estimativa técnica sujeita a revisão jurídica.</li></ul>';
  }
  function tabelaTeses(R) {
    var linhas = R.linhas.concat([Object.assign({}, REMOTA, { valor: 0 })]);
    return '<div class="dp-wrap"><table class="gov-table dp-t"><thead><tr><th>Tese e origem</th><th>Classe</th><th>Base legal e precedente</th><th>Prova e ressalvas</th><th class="num">Potencial</th></tr></thead><tbody>' + linhas.map(function (l) {
      var c = CL[l.cor];
      return '<tr><td><b>' + esc(l.nome) + '</b><small>' + esc(l.orig) + '</small></td><td><span class="dp-cl"><i style="background:' + c[1] + '"></i>' + c[0] + '</span><small>' + esc(l.mat) + '</small></td><td>' + esc(l.base) + '<small>' + esc(l.prec) + '</small></td><td>' + esc(l.docs) + '<small>' + esc(l.nota) + '</small></td><td class="num"><b>' + (l.cor === 'vermelho' ? 'fora do potencial' : esc(G.brl(l.valor))) + '</b></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  var FAMILIAS = [['Afastamentos e licenças', ['T004', 'T006']], ['Verbas rescisórias e férias', ['T005', 'T076', 'IND']], ['Benefícios', ['VT']], ['Classificação de rubricas', ['RUB']], ['Arrecadação (guias)', ['DUP']]];
  function oportunidades(R) {
    var h = '<table class="mt-orig" style="width:100%;border-collapse:collapse"><thead><tr><th>Oportunidade</th><th>Classificação</th><th class="n" style="text-align:right">Valor estimado (R$)</th></tr></thead><tbody>';
    FAMILIAS.forEach(function (f) {
      var ls = R.linhas.filter(function (l) { return f[1].indexOf(l.id) >= 0; }); if (!ls.length) return;
      h += '<tr><td colspan="3" style="padding-top:12px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#16736D">' + esc(f[0].toUpperCase()) + '</td></tr>';
      ls.forEach(function (l) { var c = CL[l.cor]; h += '<tr><td><b>' + esc(l.nome) + '</b><small>' + esc(l.base) + '</small></td><td><span class="dp-cl" style="color:' + c[1] + '"><i style="background:' + c[1] + '"></i>' + c[0] + '</span></td><td style="text-align:right;font-weight:700">' + esc(G.num(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '</td></tr>'; });
    });
    h += '<tr><td><b>Subtotal previdenciário</b><small>Provável ' + esc(G.brl(R.prov)) + ' · Possível ' + esc(G.brl(R.poss)) + '</small></td><td></td><td style="text-align:right;font-weight:700">' + esc(G.num(R.pot).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '</td></tr></tbody></table>';
    return h;
  }
  function memoria(R) {
    return '<div class="dp-wrap"><table class="gov-table"><thead><tr><th>Tese</th><th class="num">Base estimada</th><th class="num">Alíquota</th><th class="num">Valor</th></tr></thead><tbody>' + R.linhas.map(function (l) { return '<tr><td>' + esc(l.nome) + '</td><td class="num">' + esc(G.brl(l.base0)) + '</td><td class="num">22%</td><td class="num">' + esc(G.brl(l.valor)) + '</td></tr>'; }).join('') + '<tr><td><b>Total</b></td><td></td><td></td><td class="num"><b>' + esc(G.brl(R.pot)) + '</b></td></tr></tbody></table></div>';
  }
  window.GovPrevMotor = { CL: CL, ARQ: ARQ, calcular: calcular, metodologia: metodologia, oportunidades: oportunidades, TESES: TESES, REMOTA: REMOTA, limites: limites, tabelaTeses: tabelaTeses, memoria: memoria, nomeMun: nomeMun, CSS: CSS };
})();
