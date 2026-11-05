// Reversa Gov · Visão geral
(function () {
  'use strict';
  var G = window.GovDados, GG = window.GovGraf, esc = G.esc, C = GG.COR;
  var raiz = document.getElementById('conteudo');

  function soma(a, b) { return a == null && b == null ? null : G.num(a) + G.num(b); }
  function mi(v) { return v == null ? '—' : G.milhoes(v); }
  function fmMi(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function nao(e) { return e ? e.identificado + e.validado + e.compensacao : 0; }
  function temValor(D, t) { return D.casos.some(function (c) { return c.tributo === t && c.valor != null; }); }

  function hero(D) {
    var i = D.irrf.potencial, p = D.prev.potencial, tot = soma(i, p);
    var tI = D.casos.some(function (c) { return c.tributo === 'irrf'; }), tP = D.casos.some(function (c) { return c.tributo === 'prev'; });
    var ei = D.estoque.irrf, ep = D.estoque.prev;
    var temEst = temValor(D, 'irrf') || temValor(D, 'prev');
    var estoque = temEst ? nao(ei) + nao(ep) : null, rec = temEst ? ei.recuperado + ep.recuperado : null;
    var nI = D.casos.filter(function (c) { return c.tributo === 'irrf'; }).length, nP = D.casos.filter(function (c) { return c.tributo === 'prev'; }).length;
    var wI = tot ? G.num(i) / tot * 100 : 0, wP = tot ? G.num(p) / tot * 100 : 0;
    var analise = (D.irrf.notas == null && D.prev.competencias == null) ? '—' :
      [D.irrf.notas != null ? G.int(D.irrf.notas) + ' notas' : null, D.prev.competencias != null ? G.int(D.prev.competencias) + ' competências' : null].filter(Boolean).join(' · ');
    return '<section class="gs-hero" aria-label="Potencial total"><div>' +
      '<div class="gs-lab">Potencial total' + (D.modo === 'demo' ? ' · 5 anos · Tupaciguara/MG' : '') + '</div>' +
      '<div class="gs-big">' + (tot == null ? '—' : esc(G.brlCurto(tot).replace(' mi', ' milhões'))) + '</div>' +
      '<div class="gs-split" role="img" aria-label="Divisão entre IRRF e Previdenciário">' + (tot ? '<i style="width:' + wI + '%;background:' + C.irrf + '"></i><i style="width:' + wP + '%;background:' + C.prev + '"></i>' : '') + '</div>' +
      '<div class="gs-lg"><span><i class="gs-dot" style="background:' + C.irrf + '"></i>IRRF (fiscal) <b>' + esc(G.brlCurto(i)) + '</b></span><span><i class="gs-dot" style="background:' + C.prev + '"></i>Previdenciário (social) <b>' + esc(G.brlCurto(p)) + '</b></span></div></div>' +
      '<div class="gs-mini">' +
      '<div><div class="gs-lab">Estoque de créditos</div><div class="v">' + esc(G.brlCurto(estoque)) + '</div><small>identificado, ainda não recuperado</small></div>' +
      '<div><div class="gs-lab">Recuperado</div><div class="v ok">' + esc(G.brlCurto(rec)) + '</div><small>compensado ou restituído</small></div>' +
      '<div><div class="gs-lab">Casos</div><div class="v">' + G.int(D.casos.length) + '</div><small>' + nI + ' IRRF · ' + nP + ' previdenciário</small></div>' +
      '<div><div class="gs-lab">Análise</div><div class="v" style="font-size:1.1rem">' + esc(analise) + '</div><small>base da análise documentada</small></div>' +
      '</div></section>';
  }

  function bloco(D, t) {
    var irrf = t === 'irrf', d = irrf ? D.irrf : D.prev, cor = irrf ? C.irrf : C.prev;
    var pctHtml = '';
    if (d.pct != null) {
      var v = '<span class="gs-pcts" style="color:' + cor + '">' + esc(G.pct(d.pct)) + '</span>';
      var tt = irrf ? { conta: G.brl(d.potencial) + ' ÷ ' + G.brl(d.base) + ' = ' + G.pct(d.pct),
          numerador: 'IRRF de fornecedores não retido ou não reconhecido, apurado nota a nota.', denominador: 'todo o IRRF retido pelo município no mesmo período.',
          fonte: 'Fonte do denominador: Siconfi/DCA.' + (D.modo === 'demo' ? ' Caso simulado: valores de exemplo.' : '') }
        : { conta: G.brl(d.potencial) + ' ÷ ' + G.brl(d.base) + ' = ' + G.pct(d.pct),
          numerador: 'compensações e ajustes previdenciários identificados' + (d.competencias ? ' nas ' + d.competencias + ' competências' : '') + '.', denominador: 'contribuições previdenciárias (servidor + patronal) do mesmo período.',
          fonte: 'Fonte do denominador: Siconfi/DCA e folha.' + (D.modo === 'demo' ? ' Caso simulado: valores de exemplo.' : '') };
      pctHtml = G.balao(v, tt);
    }
    return '<div class="gs-card ' + t + '"><div class="gs-lab">' + (irrf ? 'Fiscal' : 'Social') + '</div>' +
      '<h3 style="margin:2px 0 12px">' + (irrf ? 'IRRF retido na fonte' : 'Previdenciário') + '</h3>' +
      '<div class="gs-bloco-linha">' + pctHtml + '<div><div class="t">' + (irrf ? 'potencial de incremento de receita' : 'potencial de recuperação') + '</div>' +
      '<div class="v">' + esc(G.brl(d.potencial)) + '</div></div></div>' +
      (d.pct == null && d.potencial != null ? '<p class="gs-s" style="margin:10px 0 0">Percentual sobre a base do município disponível após a análise documentada.</p>' : '') + '</div>';
  }

  function graf(D, t) {
    var irrf = t === 'irrf', d = irrf ? D.irrf : D.prev, cor = irrf ? C.irrf : C.prev, url = irrf ? '/gov-irrf.html' : '/gov-previdenciario.html';
    var anos = d.porAno || [], corpo;
    if (anos.length) corpo = '<div class="vis-graf">' + GG.barras(anos.map(function (a) { return G.num(a.potencial) / 1e6; }), anos.map(function (a) { return String(a.ano); }), cor, fmMi) + '</div>';
    else corpo = G.vazio('Sem detalhamento por ano', 'O potencial por ano aparece quando a análise documentada do município for concluída.');
    return '<div class="gs-card gs-click" role="link" tabindex="0" data-url="' + url + '" aria-label="Abrir acompanhamento ' + (irrf ? 'IRRF' : 'Previdenciário') + '">' +
      '<span class="gs-hint">Abrir acompanhamento ›</span><h3>' + (irrf ? 'IRRF retido na fonte' : 'Previdenciário') + '</h3><div class="gs-s">Potencial por ano · R$ milhões</div>' + corpo + '</div>';
  }

  function tabelaCasos(D) {
    var linhas = D.casos.map(function (c) {
      var url = c.ibge ? '/gov-municipio.html?ibge=' + encodeURIComponent(c.ibge) : '';
      return '<tr class="click" tabindex="0" role="link" data-url="' + esc(url) + '"><td class="cas"><b>' + esc(c.numero || '—') + '</b> · ' + esc(c.municipio || '—') + '</td><td>' + G.chip(c.tributo) + '</td><td class="num">' + esc(G.brlInt(c.valor)) + '</td><td>' + G.etapaPill(c.etapa) + '</td></tr>';
    }).join('');
    return '<div class="gs-card"><h3>Casos em acompanhamento</h3><div class="gs-s">Cada tributo é um caso e um contrato separado</div>' +
      (D.casos.length ? '<div class="gs-tbl-wrap"><table class="gov-table vis-tbl"><thead><tr><th>Caso</th><th>Tributo</th><th class="num">Potencial</th><th>Etapa</th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
        : G.vazio('Nenhum caso em acompanhamento', 'Faça o diagnóstico de um município para abrir o primeiro caso.', '<a class="btn" href="/gov-municipios.html">Novo diagnóstico</a>')) + '</div>';
  }

  function alertas(D) {
    var m = { critico: ['r', 'crítico'], atencao: ['y', 'atenção'] };
    var l = (D.alertas || []).map(function (a) {
      var n = m[a.nivel] || ['', 'info'];
      return '<div class="gs-row"><span>' + esc(a.texto) + '</span><span class="m gs-st ' + n[0] + '">' + n[1] + '</span></div>';
    }).join('');
    return '<div class="gs-card vis-alertas"><h3>Alertas</h3><div class="gs-s">O que precisa de atenção</div>' +
      (l || G.vazio('Sem alertas no momento', 'Alertas de prazo, CRP e inconsistências aparecem aqui quando houver análise.')) + '</div>';
  }

  function ligar() {
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-url]'), function (el) {
      var u = el.getAttribute('data-url'); if (!u) return;
      el.addEventListener('click', function () { location.href = u; });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = u; } });
    });
  }

  G.carregar().then(function (D) {
    var vazio = !D.casos.length;
    var html = '';
    if (vazio && D.modo !== 'demo') {
      html += '<div class="gs-card">' + G.vazio('Nenhum caso cadastrado ainda', 'Quando houver o primeiro diagnóstico, o potencial de IRRF e o previdenciário aparecem aqui, sempre separados.', '<a class="btn" href="/gov-municipios.html">Novo diagnóstico</a>') + '</div>';
      html += '<div class="gs-g2">' + bloco(D, 'irrf') + bloco(D, 'prev') + '</div>';
    } else {
      html += hero(D) + '<div class="gs-g2">' + bloco(D, 'irrf') + bloco(D, 'prev') + '</div>' +
        '<div class="gs-g2">' + graf(D, 'irrf') + graf(D, 'prev') + '</div>' +
        '<div class="gs-g21">' + tabelaCasos(D) + alertas(D) + '</div>';
    }
    raiz.innerHTML = html; ligar();
  }).catch(function (e) {
    raiz.innerHTML = '<div class="gov-alert bad">Não foi possível carregar os dados. ' + esc(e && e.message) + '</div>';
  });
})();
