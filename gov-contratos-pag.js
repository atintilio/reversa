// Reversa Gov: contratos e honorários (um contrato por tributo).
(function () {
  'use strict';
  var G = window.GovDados, esc = G.esc, app = document.getElementById('contratos-app');

  function somaPrev(lista) { var t = null; lista.forEach(function (c) { if (c.previsto != null) t = (t || 0) + G.num(c.previsto); }); return t; }
  function subHon(lista) {
    // "20% de R$ 2,0 mi" quando todos os contratos têm o mesmo percentual
    var com = lista.filter(function (c) { return c.honorarioPct != null && c.previsto != null && G.num(c.honorarioPct) > 0; });
    if (!com.length || com.length !== lista.length) return lista.length + (lista.length === 1 ? ' contrato' : ' contratos');
    var p = com[0].honorarioPct;
    if (!com.every(function (c) { return c.honorarioPct === p; })) return lista.length + (lista.length === 1 ? ' contrato' : ' contratos');
    var base = com.reduce(function (a, c) { return a + G.num(c.previsto) / G.num(c.honorarioPct); }, 0);
    return G.pct(p, 0) + ' de ' + G.brlCurto(base);
  }
  function kpi(r, v, n) { return '<div class="gov-kpi"><div class="r">' + esc(r) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div></div>'; }
  function situ(s) {
    var c = /vigente|conclu/i.test(s || '') ? ' g1' : /assinatura|proposta/i.test(s || '') ? ' y' : '';
    return '<span class="gs-st' + c + '">' + esc(s || '—') + '</span>';
  }

  G.carregar().then(function (D) {
    var cs = D.contratos || [];
    if (!cs.length) {
      app.innerHTML = '<section class="gov-card">' + G.vazio('Nenhum contrato ainda', 'Os contratos aparecem aqui quando o caso chega à etapa "Proposta / contrato". Cada tributo (IRRF e Previdenciário) tem o seu.', '<a class="gov-link" href="/gov-casos.html">Ver casos</a>') + '</section>';
      return;
    }
    var ci = cs.filter(function (c) { return c.tributo === 'irrf'; }), cp = cs.filter(function (c) { return c.tributo === 'prev'; });
    var pi = somaPrev(ci), pp = somaPrev(cp), pt = somaPrev(cs);
    var kp = '<div class="gs-g4 gc-kpis" style="margin-top:0">' +
      kpi('Contratos', G.int(cs.length), ci.length + ' IRRF · ' + cp.length + ' previdenciário') +
      kpi('Honorário previsto', G.brlCurto(pt), pt == null ? 'a definir em cada contrato' : 'soma dos contratos') +
      kpi('IRRF', G.brlCurto(pi), ci.length ? subHon(ci) : 'sem contrato') +
      kpi('Previdenciário', G.brlCurto(pp), cp.length ? subHon(cp) : 'sem contrato') + '</div>';
    var linhas = cs.map(function (c) {
      var nome = (c.municipio ? c.municipio + (c.uf ? '/' + c.uf : '') : 'IBGE ' + (c.ibge || '—'));
      var mun = c.ibge ? '<a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(c.ibge) + '">' + esc(nome) + '</a>' : esc(nome);
      return '<tr><td><b>' + esc(c.caso || '—') + '</b></td><td>' + mun + '</td><td>' + G.chip(c.tributo) + '</td><td>' + esc(c.origem || '—') + '</td><td>' + (c.honorarioPct == null ? '—' : esc(G.pct(c.honorarioPct, 0)) + ' do êxito') + '</td><td class="num"><b>' + G.brlInt(c.previsto) + '</b></td><td>' + situ(c.situacao) + '</td></tr>';
    }).join('');
    app.innerHTML = kp + '<section class="gov-card"><h2>Contratos</h2><div class="gc-tbl"><table class="gov-table"><thead><tr><th>Caso</th><th>Município</th><th>Tributo</th><th>Origem</th><th>Honorário</th><th class="num">Previsto</th><th>Situação</th></tr></thead><tbody>' + linhas + '</tbody></table></div></section>';
  }).catch(function (e) {
    app.innerHTML = '<section class="gov-card">' + G.vazio('Não foi possível carregar os contratos', (e && e.message) || 'Tente novamente em instantes.') + '</section>';
  });
})();
