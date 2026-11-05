// Reversa Gov: estoque de créditos por tributo (Identificado → Validado → Em compensação → Recuperado).
(function () {
  'use strict';
  var G = window.GovDados, esc = G.esc, app = document.getElementById('estoque-app');
  var COR = { irrf: '#2A5B93', prev: '#1E9488', consolidado: '#0E2239' };
  var OP = [0.4, 0.65, 0.85, 1];
  var CH = [['identificado', 'Identificado'], ['validado', 'Validado'], ['compensacao', 'Em compensação'], ['recuperado', 'Recuperado']];

  function kpi(r, v, n) { return '<div class="gov-kpi"><div class="r">' + esc(r) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div></div>'; }
  function soma(es, k) { return es.reduce(function (a, e) { return a + (e ? G.num(e[k]) : 0); }, 0); }

  function cartao(t, titulo, e) {
    var tot = G.totalEstoque(e);
    var corpo;
    if (!tot) corpo = G.vazio('Sem valores', 'Nenhum caso deste tributo tem valor estimado para compor o estoque.');
    else {
      corpo = '<div class="gs-split" style="height:30px" role="img" aria-label="Estoque de ' + esc(titulo) + ' por estágio">' +
        CH.map(function (c, i) { return '<i style="width:' + (G.num(e[c[0]]) / tot * 100) + '%;background:' + COR[t] + ';opacity:' + OP[i] + '" title="' + esc(c[1] + ': ' + G.brlInt(e[c[0]])) + '"></i>'; }).join('') + '</div>' +
        '<div class="ge-lg">' + CH.map(function (c, i) {
          return '<div><span class="gs-dot" style="background:' + COR[t] + ';opacity:' + OP[i] + '"></span>' + esc(c[1]) + '<b>' + G.brlInt(e[c[0]]) + '</b><span class="pc">' + G.pct(G.num(e[c[0]]) / tot, 1) + '</span></div>';
        }).join('') + '</div>';
    }
    return '<div class="gs-card ge-card ' + (t === 'consolidado' ? '' : t) + '"><h3>' + esc(titulo) + ' <span>· ' + G.brlCurto(tot) + '</span></h3><p class="gs-s">Identificado → Validado → Em compensação → Recuperado</p>' + corpo + '</div>';
  }

  G.carregar().then(function (D) {
    if (!D.casos.length && !(D.estoque && G.totalEstoque(D.estoque.irrf) + G.totalEstoque(D.estoque.prev))) {
      app.innerHTML = '<section class="gov-card">' + G.vazio('Estoque vazio', 'O estoque de créditos é formado a partir dos casos. Cadastre um caso em Municípios para começar a acompanhar o que foi identificado, validado e recuperado.', '<a class="gov-link" href="/gov-municipios.html">Escolher município</a>') + '</section>';
      return;
    }
    var E = D.estoque, es = [E.irrf, E.prev, E.consolidado].filter(Boolean);
    var tot = es.reduce(function (a, e) { return a + G.totalEstoque(e); }, 0);
    var kp = '<div class="gs-g4 ge-kpis" style="margin-top:0">' +
      kpi('Estoque total', G.brlCurto(tot), 'IRRF + previdenciário') +
      kpi('Identificado', G.brlCurto(soma(es, 'identificado')), 'triagem') +
      kpi('Validado', G.brlCurto(soma(es, 'validado')), 'com documento') +
      kpi('Recuperado', G.brlCurto(soma(es, 'recuperado')), 'compensado ou restituído') + '</div>' +
      '<p class="ge-nota">Calculado a partir da etapa de cada caso (Identificado até “Em análise pelo município”, Validado a partir da validação técnica, Em compensação em execução, Recuperado quando concluído).</p>';
    var cards = cartao('irrf', 'IRRF retido na fonte', E.irrf) + cartao('prev', 'Previdenciário', E.prev);
    var extra = E.consolidado && G.totalEstoque(E.consolidado) ? '<div class="gs-g1" style="margin-top:16px">' + cartao('consolidado', 'Consolidado', E.consolidado) + '</div>' : '';
    app.innerHTML = kp + '<div class="gs-g2" style="margin-top:0">' + cards + '</div>' + extra;
  }).catch(function (e) {
    app.innerHTML = '<section class="gov-card">' + G.vazio('Não foi possível carregar o estoque', (e && e.message) || 'Tente novamente em instantes.') + '</section>';
  });
})();
