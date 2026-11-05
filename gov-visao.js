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
    var analise = D.carteira ? D.carteira.municipios + ' municípios' : (D.irrf.notas == null && D.prev.competencias == null) ? '—' :
      [D.irrf.notas != null ? G.int(D.irrf.notas) + ' notas' : null, D.prev.competencias != null ? G.int(D.prev.competencias) + ' competências' : null].filter(Boolean).join(' · ');
    return '<section class="gs-hero" aria-label="Potencial total"><div>' +
      '<div class="gs-lab">Potencial total' + '' + '</div>' +
      '<div class="gs-big">' + (tot == null ? '—' : esc(G.brlCurto(tot).replace(' mi', ' milhões'))) + '</div>' +
      '<p class="gs-s" style="margin:0">IRRF e Previdenciário são casos e contratos separados — veja cada um abaixo.</p></div>' +
      '<div class="gs-mini">' +
      '<div><div class="gs-lab">Estoque de créditos</div><div class="v">' + esc(G.brlCurto(estoque)) + '</div><small>identificado, ainda não realizado</small></div>' +
      '<div><div class="gs-lab">Realizado</div><div class="v ok">' + esc(G.brlCurto(rec)) + '</div><small>compensado ou restituído</small></div>' +
      '<div><div class="gs-lab">Casos</div><div class="v">' + G.int(D.casos.length) + '</div><small>' + nI + ' IRRF · ' + nP + ' previdenciário</small></div>' +
            '</div></section>';
  }

  function bloco(D, t) {
    var irrf = t === 'irrf', d = irrf ? D.irrf : D.prev, cor = irrf ? C.irrf : C.prev;
    var pctHtml = '';
    if (d.pct != null) {
      var v = '<span class="gs-pcts" style="color:' + cor + '">' + esc(G.pct(d.pct)) + '</span>';
      var tt = irrf ? { conta: G.brl(d.potencial) + ' ÷ ' + G.brl(d.base) + ' = ' + G.pct(d.pct),
          numerador: 'IRRF de fornecedores não retido ou não reconhecido, apurado nota a nota.', denominador: 'todo o IRRF retido pelo município no mesmo período.',
          fonte: 'Fonte do denominador: Siconfi/DCA.' + (D.modo === 'demo' ? ' Carteira simulada: valores de exemplo.' : '') }
        : { conta: G.brl(d.potencial) + ' ÷ ' + G.brl(d.base) + ' = ' + G.pct(d.pct),
          numerador: 'compensações e ajustes previdenciários identificados' + (d.competencias ? ' nas ' + d.competencias + ' competências' : '') + '.', denominador: 'contribuições previdenciárias (servidor + patronal) do mesmo período.',
          fonte: 'Fonte do denominador: Siconfi/DCA e folha.' + (D.modo === 'demo' ? ' Caso simulado: valores de exemplo.' : '') };
      pctHtml = G.balao(v, tt);
    }
    var url = irrf ? '/gov-irrf.html' : '/gov-previdenciario.html', anos = d.porAno || [];
    var corpo = anos.length ? '<div class="gs-s" style="margin-top:16px">Potencial por ano · R$ milhões</div><div class="vis-graf">' + GG.barras(anos.map(function (a) { return G.num(a.potencial) / 1e6; }), anos.map(function (a) { return String(a.ano); }), cor, fmMi) + '</div>' : '';
    return '<div class="gs-card ' + t + '"><div class="vis-cab"><div class="gs-lab">' + (irrf ? 'Fiscal' : 'Social') + '</div>' + (D.casos.length ? '<a class="gov-link vis-det" href="' + url + '">Ver detalhes do ' + (irrf ? 'IRRF' : 'Previdenciário') + ' ›</a>' : '') + '</div>' +
      '<h3 style="margin:2px 0 12px">' + (irrf ? 'Fiscal tributário' : 'Fiscal previdenciário') + '</h3>' +
      '<div class="gs-bloco-linha">' + pctHtml + '<div><div class="t">' + (irrf ? 'potencial de incremento de receita' : 'potencial de recuperação') + '</div>' +
      '<div class="v">' + esc(G.brl(d.potencial)) + '</div></div></div>' +
      (d.pct == null && d.potencial != null ? '<p class="gs-s" style="margin:10px 0 0">Percentual sobre a base do município disponível após a análise documentada.</p>' : '') + corpo + '</div>';
  }

  function tabelaCasos(D) {
    var todos = D.casos.slice().sort(function (a, b) { return G.num(b.valor) - G.num(a.valor); }), mostrar = todos.slice(0, 8);
    var linhas = mostrar.map(function (c) {
      var url = c.ibge ? '/gov-municipio.html?ibge=' + encodeURIComponent(c.ibge) : '';
      return '<tr class="click" tabindex="0" role="link" data-url="' + esc(url) + '"><td class="cas"><b>' + esc(c.numero || '—') + '</b> · ' + esc(c.municipio || '—') + '</td><td>' + G.chip(c.tributo) + '</td><td class="num">' + esc(G.brlInt(c.valor)) + '</td><td>' + G.etapaPill(c.etapa) + '</td></tr>';
    }).join('');
    return '<div class="gs-card"><h3>Casos em acompanhamento</h3><div class="gs-s">Cada tributo é um caso e um contrato separado</div>' +
      (D.casos.length ? '<div class="gs-tbl-wrap"><table class="gov-table vis-tbl"><thead><tr><th>Caso</th><th>Tributo</th><th class="num">Potencial</th><th>Etapa</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' + (todos.length > mostrar.length ? '<p class="gs-s" style="margin:10px 0 0"><a class="gov-link" href="/gov-crm.html">Ver os ' + todos.length + ' casos no CRM ›</a></p>' : '')
        : G.vazio('Nenhum caso em acompanhamento', 'Faça o diagnóstico de um município para abrir o primeiro caso.', '<a class="btn" href="/gov-municipios.html">Novo diagnóstico</a>')) + '</div>';
  }

  // ---- Carteira de municípios (lista completa, filtro por UF, ficha e relatório em um clique)
  function somaPot(lista, ibge) { var t = null; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t = (t || 0) + G.num(x.potencial); }); return t; }
  function etapaMax(D, ibge) {
    var ids = D.casos.filter(function (c) { return String(c.ibge) === String(ibge); }).map(function (c) { return c.etapa; });
    if (!ids.length) return null;
    var ord = G.ETAPAS.map(function (e) { return e.id; }), melhor = null;
    ids.forEach(function (id) { if (id === 'perdido_pausado') return; if (melhor == null || ord.indexOf(id) > ord.indexOf(melhor)) melhor = id; });
    return melhor || ids[0];
  }
  function carteira(D) {
    var ms = (D.municipios || []).map(function (m) {
      var i = somaPot(D.irrf.municipios, m.ibge), p = somaPot(D.prev.municipios, m.ibge);
      return { m: m, i: i, p: p, t: G.num(i) + G.num(p), e: etapaMax(D, m.ibge) };
    }).sort(function (a, b) { return b.t - a.t; });
    if (!ms.length) return '';
    var max = ms[0].t || 1, ufs = {}; ms.forEach(function (x) { var u = x.m.uf || '—'; ufs[u] = (ufs[u] || 0) + 1; });
    var chips = '<button type="button" class="vis-uf on" data-uf="">Todos · ' + ms.length + '</button>' + Object.keys(ufs).sort().map(function (u) { return '<button type="button" class="vis-uf" data-uf="' + esc(u) + '">' + esc(u) + ' · ' + ufs[u] + '</button>'; }).join('');
    var linhas = ms.map(function (x) {
      var wI = x.t ? G.num(x.i) / max * 100 : 0, wP = x.t ? G.num(x.p) / max * 100 : 0;
      return '<tr data-uf="' + esc(x.m.uf || '') + '"><td><a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(x.m.ibge) + '"><b>' + esc(x.m.nome) + '</b>/' + esc(x.m.uf) + '</a></td>' +
        '<td class="num">' + G.brlInt(x.i) + '</td><td class="num">' + (x.m.prev ? G.brlInt(x.p) : '<span class="gs-s">Não contratado</span>') + '</td>' +
        '<td class="vis-bar" aria-label="Potencial total ' + esc(G.brlInt(x.t)) + '"><i style="width:' + wI.toFixed(1) + '%;background:' + C.irrf + '"></i><i style="width:' + wP.toFixed(1) + '%;background:' + C.prev + '"></i></td>' +
        '<td>' + (x.e ? G.etapaPill(x.e) : '<span class="gs-s">Sem caso</span>') + '</td>' +
        '<td class="vis-acoes"><a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(x.m.ibge) + '">Ficha ›</a>' +
        (window.GovRelatorio ? '<details class="vis-rel"><summary class="mini">Relatório</summary><div class="vis-rel-pop">' + window.GovRelatorio.botoes(x.m.ibge, true) + '</div></details>' : '') + '</td></tr>';
    }).join('');
    return '<section class="gs-card vis-cart" aria-labelledby="t-cart"><div class="vis-cab"><div><h3 id="t-cart" style="margin:0">Carteira de municípios</h3><div class="gs-s">' + ms.length + ' municípios · ordenados pelo potencial total · clique no nome para abrir a ficha</div></div><div class="vis-ufs" role="group" aria-label="Filtrar por UF">' + chips + '</div></div>' +
      '<div class="gs-tbl-wrap"><table class="gov-table vis-tbl"><thead><tr><th>Município</th><th class="num">IRRF</th><th class="num">Previdenciário</th><th>Total (IRRF + Prev.)</th><th>Etapa</th><th>Ações</th></tr></thead><tbody>' + linhas + '</tbody></table></div></section>';
  }
  function ligarCarteira() {
    var box = raiz.querySelector('.vis-cart'); if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.vis-uf'), function (b) {
      b.addEventListener('click', function () {
        var u = b.getAttribute('data-uf');
        Array.prototype.forEach.call(box.querySelectorAll('.vis-uf'), function (x) { x.classList.toggle('on', x === b); });
        Array.prototype.forEach.call(box.querySelectorAll('tbody tr'), function (tr) { tr.hidden = !!u && tr.getAttribute('data-uf') !== u; });
      });
    });
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

  function atalhos(D) {
    var ops = (D.municipios || []).map(function (m) { return '<option value="' + esc(m.ibge) + '">' + esc(m.nome ? m.nome + (m.uf ? '/' + m.uf : '') : 'IBGE ' + m.ibge) + '</option>'; }).join('');
    var rel = window.GovRelatorio && ops ? '<details class="vis-rel"><summary class="btn sec">Gerar relatório</summary><div class="vis-rel-pop"><label class="gs-s" for="vis-rel-mun">Município</label><select id="vis-rel-mun">' + ops + '</select><div class="vis-rel-bts" aria-live="polite"></div></div></details>' : '';
    return '<nav class="vis-atalhos" aria-label="Ações rápidas"><a class="btn" href="/gov-municipios.html">Municípios</a>' + rel + '<a class="btn sec" href="/gov-crm.html">CRM</a></nav>';
  }
  function ligarRel() {
    var sel = raiz.querySelector('#vis-rel-mun'), bts = raiz.querySelector('.vis-rel-bts'); if (!sel || !bts) return;
    var upd = function () { bts.innerHTML = window.GovRelatorio.botoes(sel.value, true); };
    sel.addEventListener('change', upd); upd();
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
    var V = D.carteira ? Object.assign({}, D, { irrf: Object.assign({}, D.irrf, D.carteira.irrf), prev: Object.assign({}, D.prev, D.carteira.prev) }) : D;
    var html = '';
    if (vazio && D.modo !== 'demo') {
      html += '<div class="gs-card">' + G.vazio('Nenhum caso cadastrado ainda', 'Quando houver o primeiro diagnóstico, o potencial de IRRF e o previdenciário aparecem aqui, sempre separados.', '<a class="btn" href="/gov-municipios.html">Novo diagnóstico</a>') + '</div>';
      html += '<div class="gs-g2">' + bloco(D, 'irrf') + bloco(D, 'prev') + '</div>';
    } else {
      html += atalhos(D) + hero(V) + carteira(D) + '<div class="gs-g2">' + bloco(V, 'irrf') + bloco(V, 'prev') + '</div>' +
        alertas(D);
    }
    raiz.innerHTML = html; ligar(); ligarRel(); ligarCarteira();
  }).catch(function (e) {
    raiz.innerHTML = '<div class="gov-alert bad">Não foi possível carregar os dados. ' + esc(e && e.message) + '</div>';
  });
})();
