/*
 * Reversa Tax — Selic para atualização de créditos no diagnóstico PRELIMINAR (puro, sem rede).
 * Para COMPENSAÇÃO (PER/DCOMP) vale a tabela oficial da Receita Federal; o valor aqui é uma estimativa a confirmar.
 * Regra federal (Lei 9.250/1995 art. 39 §4º; Lei 9.430/1996 art. 73; Lei 8.212/1991 art. 89 §4º):
 * juros = soma simples das taxas mensais do mês SEGUINTE ao pagamento até o mês ANTERIOR ao cálculo + 1% no mês do cálculo;
 * pagamento e cálculo no mesmo mês → 0. Funciona no navegador (window.Selic) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var TOL = 0.0001;

  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function r4(n) { return Math.round((n + Number.EPSILON) * 10000) / 10000; }

  // Competência 'AAAA-MM' a partir de 'AAAA-MM-DD', 'AAAA-MM' ou Date (sem depender de fuso para strings).
  function mes(d) {
    if (d instanceof Date) return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    var m = /^(\d{4})-(\d{2})/.exec(String(d));
    if (!m) throw new Error('Data inválida: ' + d);
    return m[1] + '-' + m[2];
  }
  function seguinte(ym) {
    var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) + 1;
    if (m > 12) { m = 1; a++; }
    return a + '-' + String(m).padStart(2, '0');
  }
  function numero(v) { return typeof v === 'number' ? v : Number(String(v).replace(',', '.')); }

  function atualizar(valor, dataPagamento, dataCalculo, tabela) {
    tabela = tabela || {};
    var base = numero(valor);
    var p = mes(dataPagamento), c = mes(dataCalculo);
    var avisos = [], meses = [], estimados = [], soma = 0;
    if (c > p) {
      var chaves = Object.keys(tabela).filter(function (k) { return isFinite(numero(tabela[k])); }).sort();
      var ultima = chaves.length ? chaves[chaves.length - 1] : null;
      for (var ym = seguinte(p); ym < c; ym = seguinte(ym)) {
        var t = tabela[ym];
        if (t !== undefined && t !== null && isFinite(numero(t))) { soma += numero(t); meses.push(ym); }
        else { estimados.push(ym); if (ultima) soma += numero(tabela[ultima]); }
      }
      if (estimados.length) {
        avisos.push(ultima
          ? 'Selic estimada para os meses ' + estimados.join(', ') + ' (usada a última taxa publicada, ' + ultima + ').'
          : 'Selic estimada para os meses ' + estimados.join(', ') + ' (sem nenhuma taxa publicada: considerada 0%).');
      }
      soma += 1; // 1% no mês do cálculo
    }
    var percentual = r4(soma);
    var juros = r2(base * percentual / 100);
    return { valor: r2(base), juros: juros, percentual: percentual, atualizado: r2(base + juros), meses: meses, estimados: estimados, avisos: avisos };
  }

  // fontes: [{ nome, tabela:{'AAAA-MM':taxa}, erro? }]
  function consenso(fontes) {
    var avisos = [], tabela = {}, divergencias = [], confirmados = [];
    var info = (fontes || []).map(function (f) {
      var ok = !f.erro && f.tabela && Object.keys(f.tabela).length > 0;
      if (f.erro) avisos.push('Fonte ' + f.nome + ' indisponível: ' + f.erro);
      else if (!ok) avisos.push('Fonte ' + f.nome + ' não retornou dados.');
      return { nome: f.nome, ok: !!ok, meses: ok ? Object.keys(f.tabela).length : 0, erro: f.erro || undefined };
    });
    var ativas = (fontes || []).filter(function (f, i) { return info[i].ok; });
    var todos = {};
    ativas.forEach(function (f) { Object.keys(f.tabela).forEach(function (k) { todos[k] = true; }); });
    Object.keys(todos).sort().forEach(function (ym) {
      var vals = [];
      ativas.forEach(function (f) { var v = numero(f.tabela[ym]); if (f.tabela[ym] !== undefined && isFinite(v)) vals.push({ nome: f.nome, v: v }); });
      var grupos = [];
      vals.forEach(function (x) {
        var g = grupos.filter(function (gr) { return Math.abs(gr.v - x.v) <= TOL; })[0];
        if (g) g.n++; else grupos.push({ v: x.v, n: 1 });
      });
      var distintos = grupos.length > 1;
      if (distintos) {
        var obj = {}; vals.forEach(function (x) { obj[x.nome] = x.v; });
        divergencias.push({ mes: ym, valores: obj });
      }
      grupos.sort(function (a, b) { return b.n - a.n; });
      if (vals.length === 1) {
        tabela[ym] = vals[0].v;
        avisos.push(ym + ': confirmado por uma única fonte (' + vals[0].nome + ').');
      } else if (grupos[0].n >= 2 && !(grupos[1] && grupos[1].n === grupos[0].n)) {
        tabela[ym] = grupos[0].v; confirmados.push(ym);
        if (distintos) avisos.push(ym + ': fontes divergentes; prevaleceu o valor da maioria (' + grupos[0].v + ').');
      } else {
        avisos.push(ym + ': fontes divergentes sem maioria; mês não utilizado (tratado como faltante).');
      }
    });
    var chaves = Object.keys(tabela).sort();
    return { tabela: tabela, fontes: info, divergencias: divergencias, confirmados: confirmados, ultimaCompetencia: chaves.length ? chaves[chaves.length - 1] : null, avisos: avisos };
  }

  var api = { atualizar: atualizar, consenso: consenso, TOLERANCIA: TOL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Selic = api;
})(typeof window !== 'undefined' ? window : this);
