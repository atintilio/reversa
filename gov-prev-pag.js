// Reversa Gov · Acompanhamento Previdenciário
(function () {
  'use strict';
  var G = window.GovDados, GG = window.GovGraf, esc = G.esc, C = GG.COR, raiz = document.getElementById('conteudo');
  function fmMi(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function kpi(r, v, n) { return '<div class="gs-card kp prev"><div class="gs-lab">' + esc(r) + '</div><div class="kv">' + v + '</div><div class="kn">' + esc(n || '') + '</div></div>'; }

  G.carregar().then(function (D) {
    var d = D.prev, anos = d.porAno || [];
    var h = '<div class="gs-g4">' +
      kpi('Potencial de recuperação', esc(G.brl(d.potencial)), d.pct != null ? G.pct(d.pct) + ' das contribuições' : 'recolhido a maior') +
      kpi('Passivo identificado', esc(G.brlInt(d.passivo)), 'exposição, não soma ao potencial') +
      kpi('Inconsistências', esc(G.int(d.inconsistencias)), d.competenciasComInconsistencia != null ? 'em ' + G.int(d.competenciasComInconsistencia) + ' competências' : 'análise documentada') +
      kpi('Período', d.competencias != null ? esc(G.int(d.competencias)) + ' competências' : '—', d.competencias != null ? '60 mensais + 5 de 13º' : 'análise documentada') + '</div>';

    var temRD = anos.some(function (a) { return a.receita != null && a.despesa != null; });
    var rd = temRD
      ? '<div class="gr">' + GG.area([{ vals: anos.map(function (a) { return a.receita / 1e6; }), cor: C.irrf, f: fmMi }, { vals: anos.map(function (a) { return a.despesa / 1e6; }), cor: C.prev, f: fmMi }], anos.map(function (a) { return String(a.ano); })) + '</div>' +
        '<div class="gs-lg"><span><i class="gs-dot" style="background:' + C.irrf + '"></i>Receita</span><span><i class="gs-dot" style="background:' + C.prev + '"></i>Despesa</span></div>'
      : G.vazio('Sem dados de receita e despesa', 'O comparativo aparece quando a base previdenciária do município for analisada.');
    var crp = d.crpVencidoDias == null ? '—' : d.crpVencidoDias > 0 ? '<span class="m gs-st r">vencido há ' + G.int(d.crpVencidoDias) + ' dias</span>' : '<span class="m gs-st g1">regular</span>';
    var temRisco = d.score != null || d.crpVencidoDias != null || d.resultado != null;
    var risco = temRisco
      ? '<div class="gs-row"><span>Score</span><span class="m">' + (d.score == null ? '—' : G.int(d.score) + ' / 100') + '</span></div>' +
        '<div class="gs-row"><span>CRP</span><span class="m">' + crp + '</span></div>' +
        '<div class="gs-row"><span>Resultado do período</span><span class="m">' + esc(d.resultado == null ? '—' : G.brlCurto(d.resultado)) + '</span></div>'
      : G.vazio('Sem diagnóstico de risco', 'Score e CRP aparecem após o diagnóstico previdenciário.');
    h += '<div class="gs-g21"><div class="gs-card"><h3>Receita × despesa previdenciária</h3><div class="gs-s">R$ milhões por ano</div>' + rd + '</div>' +
      '<div class="gs-card"><h3>Score e riscos</h3><div class="gs-s">Diagnóstico previdenciário</div>' + risco + '</div></div>';

    var og = d.porOrigem || [], mx = og.reduce(function (a, r) { return Math.max(a, r.valor); }, 0);
    var ogH = og.length ? og.map(function (r) {
      return '<div class="gs-row"><span>' + esc(r.nome) + '</span><span class="m">' + esc(G.brlCurto(r.valor)) + '</span></div>' + GG.barra(mx ? r.valor / mx * 100 : 0, C.prev);
    }).join('') : G.vazio('Sem origem das inconsistências', 'A divisão por tipo aparece após a análise dos documentos.');
    var ms = d.municipios || [];
    var tab = ms.length ? '<div class="gs-tbl-wrap"><table class="gov-table pg-tbl"><thead><tr><th>Município</th><th class="num">Competências</th><th class="num">Potencial</th></tr></thead><tbody>' +
      ms.map(function (m) {
        var u = m.ibge ? '/gov-documentos.html?ibge=' + encodeURIComponent(m.ibge) : '';
        return '<tr class="click" tabindex="0" role="link" data-url="' + esc(u) + '"><td><b>' + esc(m.nome || '—') + (m.uf ? '/' + esc(m.uf) : '') + '</b></td><td class="num">' + esc(G.int(m.competencias)) + '</td><td class="num"><b>' + esc(G.brlInt(m.potencial)) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>'
      : G.vazio('Nenhum município com previdenciário', 'Abra um caso previdenciário para acompanhar o município aqui.', '<a class="btn" href="/gov-diagnosticar.html?tipo=previdenciario">Novo caso previdenciário</a>');
    h += '<div class="gs-g2"><div class="gs-card"><h3>Origem das inconsistências</h3><div class="gs-s">Potencial por tipo</div>' + ogH + '</div>' +
      '<div class="gs-card"><h3>Municípios com previdenciário</h3><div class="gs-s">Clique para abrir o município e seus documentos</div>' + tab + '</div></div>';
    raiz.innerHTML = h;
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-url]'), function (el) {
      var u = el.getAttribute('data-url'); if (!u) return;
      el.addEventListener('click', function () { location.href = u; });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = u; } });
    });
  }).catch(function (e) { raiz.innerHTML = '<div class="gov-alert bad">Não foi possível carregar os dados. ' + esc(e && e.message) + '</div>'; });
})();
