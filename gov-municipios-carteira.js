// Reversa Gov: cartão "Municípios em carteira" na tela Municípios (não altera o fluxo de escolha existente).
(function () {
  'use strict';
  var box = document.getElementById('carteira');
  if (!box || !window.GovDados) return;
  var G = window.GovDados, esc = G.esc;

  function soma(lista, ibge) {
    var t = null; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t = (t || 0) + G.num(x.potencial); });
    return t;
  }
  function etapaMax(D, ibge) {
    var ids = D.casos.filter(function (c) { return String(c.ibge) === String(ibge); }).map(function (c) { return c.etapa; });
    if (!ids.length) return null;
    var ord = G.ETAPAS.map(function (e) { return e.id; }), melhor = null;
    ids.forEach(function (id) { if (id === 'perdido_pausado') return; if (melhor == null || ord.indexOf(id) > ord.indexOf(melhor)) melhor = id; });
    return melhor || ids[0];
  }

  G.carregar().then(function (D) {
    if (!D.municipios || !D.municipios.length) return; // sem municípios: o cartão não aparece
    var linhas = D.municipios.map(function (m) {
      var nome = m.nome ? m.nome + (m.uf ? '/' + m.uf : '') : 'IBGE ' + m.ibge, e = etapaMax(D, m.ibge);
      var chips = (m.irrf ? G.chip('irrf') : '') + (m.prev ? G.chip('prev') : '') || '<span class="gs-chip n">—</span>';
      return '<tr class="click" data-ibge="' + esc(m.ibge) + '"><td><a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(m.ibge) + '"><b>' + esc(nome) + '</b></a></td><td>' + chips + '</td><td class="num">' + G.brlInt(soma(D.irrf.municipios, m.ibge)) + '</td><td class="num">' + G.brlInt(soma(D.prev.municipios, m.ibge)) + '</td><td>' + (e ? G.etapaPill(e) : '—') + '</td></tr>';
    }).join('');
    box.innerHTML = '<h2 id="t-carteira">Municípios em carteira</h2><p class="sub2">Municípios com caso cadastrado. Abra a ficha para ver os dois tributos, separados.</p>' +
      '<div class="gmc-wrap"><table class="gov-table"><thead><tr><th>Município</th><th>Tributos</th><th class="num">Potencial IRRF</th><th class="num">Potencial Prev.</th><th>Etapa</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
    box.hidden = false;
    box.querySelector('tbody').addEventListener('click', function (ev) {
      if (ev.target.closest('a')) return;
      var tr = ev.target.closest('tr[data-ibge]'); if (tr) location.href = '/gov-municipio.html?ibge=' + encodeURIComponent(tr.dataset.ibge);
    });
  }).catch(function () { /* sem carteira: o fluxo de escolha segue normal */ });
})();
