(function (root) {
  'use strict';
  // Valores em centavos. Projeção comercial, sem reconhecimento de crédito.
  function calcular(rows, inicio, previdenciario) {
    if (!Number.isInteger(inicio) || inicio < 2000 || inicio > 2100) throw new Error('Ano inicial inválido.');
    var vistos = new Set(), grupos = {}, identificados = 0;
    rows.forEach(function (r) {
      if (!/^\d{4}-(0[1-9]|1[0-3])$/.test(r.competencia) || (!previdenciario && r.competencia.endsWith('-13'))) throw new Error('Competência inválida.');
      if (!Number.isSafeInteger(r.valor) || r.valor < 0) throw new Error('Valor inválido.');
      var ano = Number(r.competencia.slice(0, 4));
      if (ano < inicio || ano > inicio + 4) return;
      var chave = r.cnpj + '|' + r.tese + '|' + r.competencia;
      if (vistos.has(chave)) throw new Error('Competência duplicada: ' + chave);
      vistos.add(chave); identificados += r.valor;
      var g = grupos[r.cnpj + '|' + r.tese] || (grupos[r.cnpj + '|' + r.tese] = { cnpj: r.cnpj, tese: r.tese, anos: {} });
      var a = g.anos[ano] || (g.anos[ano] = { meses: [], decimo: null, regimes: new Set() });
      if (r.competencia.endsWith('-13')) a.decimo = r.valor;
      else { a.meses.push(r.valor); a.regimes.add(r.regime || 'não informado'); }
    });
    var pendencias = [], projetado = 0;
    Object.values(grupos).forEach(function (g) {
      for (var ano = inicio; ano <= inicio + 4; ano++) {
        var a = g.anos[ano];
        if (!a || a.meses.length < 3) { pendencias.push(g.cnpj + ' · ' + g.tese + ' · ' + ano + ': mínimo de três meses.'); continue; }
        if (a.regimes.size > 1 || a.regimes.has('não informado')) { pendencias.push(g.cnpj + ' · ' + g.tese + ' · ' + ano + ': separar/confirmar regimes antes de projetar.'); continue; }
        projetado += Math.round(a.meses.reduce(function (s, v) { return s + v; }, 0) * 12 / a.meses.length);
        if (previdenciario) {
          if (a.decimo === null) pendencias.push(g.cnpj + ' · ' + g.tese + ' · ' + ano + ': apurar/estimar 13º separadamente.');
          else projetado += a.decimo;
        }
      }
    });
    if (!Object.keys(grupos).length) pendencias.push('Nenhuma competência no período selecionado.');
    return { inicio: inicio, fim: inicio + 4, competenciasAlvo: previdenciario ? 65 : 60,
      identificado: identificados, projetado: pendencias.length ? null : projetado, pendencias: pendencias };
  }
  function apresentar(resultado, selecao) {
    if (!selecao.identificado && !selecao.projetado) throw new Error('Selecione pelo menos um valor para exibir.');
    if (selecao.projetado && resultado.projetado === null) throw new Error('Projeção indisponível: ' + resultado.pendencias.join(' '));
    var linhas = [];
    if (selecao.identificado) linhas.push({ titulo: 'Estimativa identificada na amostra', valor: resultado.identificado });
    if (selecao.projetado) linhas.push({ titulo: 'Estimativa projetada — ' + resultado.competenciasAlvo + ' competências (inclui a amostra)', valor: resultado.projetado });
    return linhas;
  }
  var api = { calcular: calcular, apresentar: apresentar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiagnosticoAmostra = api;
})(typeof window !== 'undefined' ? window : this);
