/*
 * Reversa Tax — Selic aplicada aos diagnósticos da tela Diagnosticar (puro, sem rede; usa selic.js).
 * ESTIMATIVA para o diagnóstico preliminar: para compensação vale a tabela oficial da Receita Federal
 * (o PER/DCOMP calcula na transmissão). Os valores nominais dos motores nunca são alterados: aqui só se calcula o "atualizado" ao lado.
 *
 * Data de pagamento estimada (critério escrito também na tela e na memória técnica):
 *   PIS/COFINS = dia 25 do mês seguinte à competência;
 *   contribuição previdenciária = dia 20 do mês seguinte à competência;
 *   IRPJ/CSLL = vencimento do DARF enviado (por tributo, trimestre) ou, sem DARF, o vencimento estimado devolvido pelo motor-ecf.
 * Data de cálculo = hoje. Funciona no navegador (window.SelicDiag) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var S = (typeof module !== 'undefined' && module.exports) ? require('./selic.js') : root.Selic;

  var AVISO_RFB = 'Para compensação vale a tabela oficial da Receita Federal (o PER/DCOMP calcula na transmissão).';
  var INDISPONIVEL = 'Selic indisponível — valores sem atualização.';
  var CRITERIO = 'Data de pagamento estimada: PIS/COFINS = dia 25 do mês seguinte à competência; contribuição previdenciária = dia 20 do mês seguinte à competência; IRPJ/CSLL = vencimento do DARF enviado ou, sem DARF, o vencimento estimado (último dia do mês seguinte ao fim do trimestre). Juros = soma das taxas mensais do mês seguinte ao pagamento até o mês anterior ao cálculo, mais 1% no mês do cálculo.';

  function hojeISO(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function seguinte(comp) { var a = Number(comp.slice(0, 4)), m = Number(comp.slice(5, 7)) + 1; if (m > 12) { m = 1; a++; } return a + '-' + String(m).padStart(2, '0'); }
  function vencPisCofins(comp) { return seguinte(String(comp).slice(0, 7)) + '-25'; }
  function vencPrevidenciario(comp) { return seguinte(String(comp).slice(0, 7)) + '-20'; }
  function ativo(selic) { return !!(selic && selic.ok && selic.tabela && Object.keys(selic.tabela).length); }
  function dataBR(iso) { var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function compBR(c) { var p = String(c || '').split('-'); return p.length === 2 ? p[1] + '/' + p[0] : (c || '—'); }

  // Estado a partir da resposta da rota /api/v1/selic (ou de uma falha).
  function estadoDe(resp) {
    if (!resp || !resp.tabela || !Object.keys(resp.tabela).length) return { ok: false };
    return { ok: true, tabela: resp.tabela, fontes: resp.fontes || [], ultimaCompetencia: resp.ultimaCompetencia || Object.keys(resp.tabela).sort().pop(), atualizadoEm: resp.atualizadoEm || null, aviso: resp.aviso || null };
  }

  // Uma conta: valor (reais ou centavos, conforme "escala") → atualizado, mesma unidade.
  function calculadora(selic, hoje) {
    var estimados = {};
    function atualizar(valor, data, escala) {
      var v = valor / escala, r = S.atualizar(v, data, hoje, selic.tabela);
      r.estimados.forEach(function (m) { estimados[m] = 1; });
      return escala === 1 ? r.atualizado : Math.round(r.atualizado * escala);
    }
    return { atualizar: atualizar, estimados: function () { return Object.keys(estimados).sort(); } };
  }
  function soma(linhas, campos) {
    var o = {}; campos.forEach(function (c) { o[c] = 0; });
    linhas.forEach(function (l) { campos.forEach(function (c) { o[c] += l[c] || 0; }); });
    return o;
  }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  // Crédito escritural de PIS/COFINS não cumulativo: o aproveitamento não tem atualização nem juros
  // (Lei 10.637/2002, art. 13; Lei 10.833/2003, art. 13). No ressarcimento, Selic só a partir do 361º dia do pedido (STJ Tema 1003).
  var ESCRITURAL = { insumos: 1, saldoCredor: 1, valeTransporte: 1 };
  var MOTIVO_ESCRITURAL = 'Crédito escritural — sem Selic (Lei 10.637/2002 e Lei 10.833/2003, art. 13). No ressarcimento, Selic a partir do 361º dia do pedido (STJ Tema 1003).';

  // PIS/COFINS (motor-creditos, valores em centavos). Retorna null se a Selic não estiver disponível.
  function creditos(res, selic, hoje) {
    if (!ativo(selic) || !res || !res.teses) return null;
    var calc = calculadora(selic, hoje), teses = {};
    var C = ['pis', 'cofins', 'pisAt', 'cofinsAt'];
    res.teses.forEach(function (t) {
      var linhas = (t.competencias || []).map(function (c) {
        var pg = vencPisCofins(c.competencia), esc = !!ESCRITURAL[t.id];
        return { cnpj: c.cnpj, competencia: c.competencia, pagamento: pg, noPrazo: !c.possivelmentePrescrito, pis: c.pis, cofins: c.cofins,
          pisAt: esc ? c.pis : calc.atualizar(c.pis, pg, 100), cofinsAt: esc ? c.cofins : calc.atualizar(c.cofins, pg, 100) };
      });
      teses[t.id] = { linhas: linhas, total: soma(linhas, C), totalNoPrazo: soma(linhas.filter(function (l) { return l.noPrazo; }), C), natureza: t.natureza,
        semSelic: !!ESCRITURAL[t.id], motivoSemSelic: ESCRITURAL[t.id] ? MOTIVO_ESCRITURAL : null };
    });
    var resumo = { recuperavel: soma([], C), recuperavelNoPrazo: soma([], C), potencial: soma([], C), risco: soma([], C) };
    function add(alvo, o) { C.forEach(function (c) { alvo[c] += o[c]; }); }
    res.teses.forEach(function (t) {
      var x = teses[t.id];
      if (t.natureza === 'credito') { add(resumo.recuperavel, x.total); add(resumo.recuperavelNoPrazo, x.totalNoPrazo); }
      else if (t.natureza === 'potencial') add(resumo.potencial, x.totalNoPrazo);
      else if (t.natureza === 'risco') add(resumo.risco, x.total);
    });
    return { teses: teses, resumo: resumo, estimados: calc.estimados() };
  }

  // Previdenciário (motor-esocial, reais): usa tese.porCompetencia [{competencia, valor, noPrazo}].
  function previdenciario(prev, selic, hoje) {
    if (!ativo(selic) || !prev || !prev.teses) return null;
    var calc = calculadora(selic, hoje), teses = {}, todas = [];
    prev.teses.forEach(function (t) {
      var linhas = (t.porCompetencia || []).map(function (c) {
        var pg = vencPrevidenciario(c.competencia);
        return { competencia: c.competencia, pagamento: pg, noPrazo: c.noPrazo, valor: c.valor, valorAt: r2(calc.atualizar(c.valor, pg, 1)) };
      });
      todas = todas.concat(linhas);
      teses[t.id] = { linhas: linhas, total: soma(linhas, ['valor', 'valorAt']), totalNoPrazo: soma(linhas.filter(function (l) { return l.noPrazo; }), ['valor', 'valorAt']), semCompetencia: !t.porCompetencia };
    });
    return { teses: teses, total: soma(todas, ['valor', 'valorAt']), totalNoPrazo: soma(todas.filter(function (l) { return l.noPrazo; }), ['valor', 'valorAt']), estimados: calc.estimados() };
  }

  // Vencimento por [ano, trimestre, tributo] a partir dos DARFs lidos (MotorDarf.lerDarfTexto); vale o DARF de maior principal.
  function vencimentosDarf(darfs) {
    var m = {}, CODS = { '0220': 'IRPJ', '6012': 'CSLL' };
    (darfs || []).forEach(function (d) {
      var trib = CODS[d.codigoReceita];
      if (!trib || !d.periodo || !d.periodo.trimestre || !d.vencimento) return;
      var k = d.periodo.ano + '-' + d.periodo.trimestre + '-' + trib;
      if (!m[k] || (d.principal || 0) > m[k].principal) m[k] = { vencimento: d.vencimento, principal: d.principal || 0 };
    });
    return m;
  }

  // IRPJ/CSLL (motor-ecf, reais): usa r.teses[].linhas {ano, trimestre, irpj, csll, vencimentoEstimado, noPrazo}.
  function ecf(r, darfs, selic, hoje) {
    if (!ativo(selic) || !r) return null;
    var calc = calculadora(selic, hoje), venc = vencimentosDarf(darfs), linhas = [];
    (r.teses || []).forEach(function (t) {
      t.linhas.forEach(function (l) {
        var vi = venc[l.ano + '-' + l.trimestre + '-IRPJ'], vc = venc[l.ano + '-' + l.trimestre + '-CSLL'];
        var pi = vi ? vi.vencimento : l.vencimentoEstimado, pc = vc ? vc.vencimento : l.vencimentoEstimado;
        var origem = vi && vc ? 'DARF' : !vi && !vc ? 'estimado' : vi ? 'DARF (IRPJ) / estimado (CSLL)' : 'estimado (IRPJ) / DARF (CSLL)';
        var irpjAt = r2(calc.atualizar(l.irpj, pi, 1)), csllAt = r2(calc.atualizar(l.csll, pc, 1));
        linhas.push({ ano: l.ano, trimestre: l.trimestre, irpj: l.irpj, csll: l.csll, valor: l.valor, pagIrpj: pi, pagCsll: pc, origem: origem, noPrazo: l.noPrazo, irpjAt: irpjAt, csllAt: csllAt, valorAt: r2(irpjAt + csllAt) });
      });
    });
    return { linhas: linhas, total: soma(linhas, ['irpj', 'csll', 'valor', 'irpjAt', 'csllAt', 'valorAt']), totalNoPrazo: soma(linhas.filter(function (l) { return l.noPrazo; }), ['valor', 'valorAt']), estimados: calc.estimados() };
  }

  // Parágrafos da nota/rodapé (tela e memória). selic: estado de estadoDe(); extras: meses estimados dos cálculos.
  function nota(selic, hoje, estimados) {
    if (!ativo(selic)) return [INDISPONIVEL];
    var fontes = (selic.fontes || []).filter(function (f) { return f && f.ok !== false; }).map(function (f) { return f.nome; }).filter(Boolean);
    var out = ['Atualização pela Selic (estimativa) calculada até ' + dataBR(hoje) + '. Os valores nominais continuam sendo os valores de referência.', CRITERIO,
      'Última competência da Selic: ' + compBR(selic.ultimaCompetencia) + '. Fontes: ' + (fontes.length ? fontes.join('; ') : 'não informadas') + '.'];
    if (selic.aviso) out.push(selic.aviso);
    if (estimados && estimados.length) out.push('Meses sem taxa publicada (' + estimados[0] + (estimados.length > 1 ? ' a ' + estimados[estimados.length - 1] + ', ' + estimados.length + ' meses' : '') + ') usaram a última taxa publicada.');
    out.push(AVISO_RFB);
    return out;
  }

  var api = { hojeISO: hojeISO, vencPisCofins: vencPisCofins, vencPrevidenciario: vencPrevidenciario, estadoDe: estadoDe, ativo: ativo, creditos: creditos, previdenciario: previdenciario,
    ecf: ecf, vencimentosDarf: vencimentosDarf, nota: nota, AVISO_RFB: AVISO_RFB, INDISPONIVEL: INDISPONIVEL, CRITERIO: CRITERIO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SelicDiag = api;
})(typeof window !== 'undefined' ? window : this);
