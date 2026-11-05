// Reversa Gov · Acompanhamento IRRF
(function () {
  'use strict';
  var G = window.GovDados, GG = window.GovGraf, esc = G.esc, C = GG.COR, raiz = document.getElementById('conteudo');
  function fmMi(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function kpi(r, v, n) { return '<div class="gs-card kp irrf"><div class="gs-lab">' + esc(r) + '</div><div class="kv">' + v + '</div><div class="kn">' + esc(n || '') + '</div></div>'; }

  G.carregar().then(function (D) {
    var d = D.irrf, casos = G.etapasDoTributo(D, 'irrf'), temEst = casos.some(function (c) { return c.valor != null; });
    var rec = temEst ? D.estoque.irrf.recuperado : null;
    var nRec = casos.filter(function (c) { return c.etapa === 'em_execucao' || c.etapa === 'concluido'; }).length;
    var pctDif = d.notas ? G.pct(d.comDiferenca / d.notas, 0) + ' das notas' : '';
    var anos = d.porAno || [];
    var h = G.notaDetalhe(D) + '<div class="gs-g4">' +
      kpi('Potencial de incremento', esc(G.brl(d.potencial)), d.pct != null ? G.pct(d.pct) + ' do IRRF retido' : 'receita própria do município') +
      kpi('Notas analisadas', esc(G.int(d.notas)), anos.length ? anos[0].ano + ' a ' + anos[anos.length - 1].ano : 'análise documentada') +
      kpi('Notas com diferença', esc(G.int(d.comDiferenca)), pctDif) +
      kpi('Recuperado', esc(G.brlInt(rec)), nRec ? nRec + (nRec > 1 ? ' casos' : ' caso') + ' em execução ou concluído' : 'compensado ou restituído') + '</div>';

    // área devido x retido + funil
    var area = anos.length && d.devido != null
      ? '<div class="gr">' + GG.area([{ vals: anos.map(function (a) { return a.devido / 1e6; }), cor: C.irrf, f: fmMi }, { vals: anos.map(function (a) { return a.retido / 1e6; }), cor: C.prev, f: fmMi }], anos.map(function (a) { return String(a.ano); })) + '</div>' +
        '<div class="gs-lg"><span><i class="gs-dot" style="background:' + C.irrf + '"></i>Devido</span><span><i class="gs-dot" style="background:' + C.prev + '"></i>Retido</span></div>'
      : G.vazio('Sem detalhamento por ano', 'O comparativo aparece quando as notas do município forem analisadas.');
    var funil = G.ETAPAS.map(function (e) {
      var n = casos.filter(function (c) { return c.etapa === e.id; }).length;
      return '<div class="gs-row"><span>' + esc(e.nome) + '</span><span class="m">' + n + '</span></div>';
    }).join('');
    h += '<div class="gs-g21"><div class="gs-card"><h3>Devido × retido por ano</h3><div class="gs-s">R$ milhões · soma das notas do exercício</div>' + area + '</div>' +
      '<div class="gs-card"><h3>Funil dos casos IRRF</h3><div class="gs-s">8 etapas do CRM' + (casos.length ? '' : ' · nenhum caso ainda') + '</div>' + funil + '</div></div>';

    // natureza + municípios
    var nat = d.porNatureza || [], mx = nat.reduce(function (a, r) { return Math.max(a, r.valor); }, 0);
    var natH = nat.length ? nat.map(function (r) {
      return '<div class="gs-row"><span>' + esc(r.nome) + '</span><span class="m">' + esc(G.brlCurto(r.valor)) + '</span></div>' + GG.barra(mx ? r.valor / mx * 100 : 0, C.irrf);
    }).join('') : G.vazio('Sem dados por natureza', 'A divisão por natureza do serviço aparece após a análise das notas.');
    var ms = d.municipios || [];
    var tab = ms.length ? '<div class="gs-tbl-wrap"><table class="gov-table pg-tbl"><thead><tr><th>Município</th><th class="num">Notas</th><th class="num">Potencial</th></tr></thead><tbody>' +
      ms.map(function (m) {
        var u = m.ibge ? '/gov-notas.html?ibge=' + encodeURIComponent(m.ibge) : '';
        return '<tr class="click" tabindex="0" role="link" data-url="' + esc(u) + '"><td><b>' + esc(m.nome || '—') + (m.uf ? '/' + esc(m.uf) : '') + '</b></td><td class="num">' + esc(G.int(m.notas)) + '</td><td class="num"><b>' + esc(G.brlInt(m.potencial)) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>'
      : G.vazio('Nenhum município com IRRF', 'Abra um caso IRRF para acompanhar o município aqui.', '<a class="btn" href="/gov-diagnosticar.html?tipo=fiscal">Novo caso IRRF</a>');
    h += '<div class="gs-g2"><div class="gs-card"><h3>Por natureza do serviço</h3><div class="gs-s">Potencial de IRRF por tipo de serviço</div>' + natH + '</div>' +
      '<div class="gs-card"><h3>Municípios com IRRF</h3><div class="gs-s">Clique para abrir o município e suas notas</div>' + tab + '</div></div>';
    raiz.innerHTML = h;
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-url]'), function (el) {
      var u = el.getAttribute('data-url'); if (!u) return;
      el.addEventListener('click', function () { location.href = u; });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = u; } });
    });
  }).catch(function (e) { raiz.innerHTML = '<div class="gov-alert bad">Não foi possível carregar os dados. ' + esc(e && e.message) + '</div>'; });
})();
