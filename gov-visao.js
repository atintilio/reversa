// Reversa Gov · Visão geral (v2): pizza do potencial, mapa por UF, cartões por tributo, evolução no tempo,
// carteira de municípios, atividade recente e potencial por município. Dados sempre de GovDados.
(function () {
  'use strict';
  var G = window.GovDados, GG = window.GovGraf, K = window.GovVisaoCalc, esc = G.esc, C = GG.COR;
  var raiz = document.getElementById('conteudo');
  var COR_I = C.irrf, COR_P = C.prev;
  var TONS = { irrf: [COR_I, '#5780B0', '#8DABC9', '#C0D0E3'], prev: [COR_P, '#4DB0A6', '#87CCC5', '#C0E4E0'] };
  var ST = { ctx: null, serie: [], tops: [], areaW: 0, barsW: 0 };

  function num(v) { return G.num(v); }
  function brlc(v) { return v == null ? '—' : G.brlCurto(v); }
  function pc(a, b) { var p = K.pct(a, b); return p == null ? '—' : (p * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
  function mi(v) { return (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ddmm(d, ano) { var p = d.split('-'); return p[2] + '/' + p[1] + (ano ? '/' + p[0].slice(2) : ''); }
  function nome(c) { return c.municipio ? c.municipio + (K.ufDoCaso(c, ST.mm || {}) ? '/' + K.ufDoCaso(c, ST.mm || {}) : '') : 'IBGE ' + (c.ibge || '—'); }
  function nTrib(D, t) { return D.casos.filter(function (c) { return c.tributo === t; }).length; }
  function temValor(D, t) { return D.casos.some(function (c) { return c.tributo === t && c.valor != null; }); }

  // ---------- rosca (SVG) ----------
  function donut(f, ctop, csub, size, aria) {
    var r = 64, c = 2 * Math.PI * r, GAP = 3, sum = f.reduce(function (a, x) { return a + x[1]; }, 0), off = 0;
    var t = '<svg viewBox="0 0 190 190" role="img" aria-label="' + esc(aria) + '"><circle cx="95" cy="95" r="' + r + '" fill="none" stroke="' + C.trilha + '" stroke-width="30"/>';
    if (sum > 0) f.forEach(function (x) {
      if (!(x[1] > 0)) return;
      var len = x[1] / sum * c, vis = Math.max(len - GAP, 0);
      t += '<circle cx="95" cy="95" r="' + r + '" fill="none" stroke="' + x[2] + '" stroke-width="30" stroke-dasharray="' + vis.toFixed(2) + ' ' + (c - vis).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 95 95)"/>'; off += len;
    });
    return t + '<text x="95" y="' + (csub ? 95 : 95 + size * .35) + '" text-anchor="middle" class="v2-ct" style="font-size:' + size + 'px">' + esc(ctop) + '</text>' + (csub ? '<text x="95" y="113" text-anchor="middle">' + esc(csub) + '</text>' : '') + '</svg>';
  }
  function dleg(f, fmt) {
    var sum = f.reduce(function (a, x) { return a + x[1]; }, 0);
    return '<div class="v2-dl">' + f.map(function (x) { return '<div><i style="background:' + x[2] + '"></i><span>' + esc(x[0]) + '</span><b>' + esc(fmt(x[1])) + '</b><em>' + pc(x[1], sum) + '</em></div>'; }).join('') + '</div>';
  }

  // ---------- cartões por tributo ----------
  function cartaoTributo(D, t, tot) {
    var irrf = t === 'irrf', pot = irrf ? D.irrf.potencial : D.prev.potencial, n = nTrib(D, t), e = K.estagiosDe(D.estoque && D.estoque[t]), T = e.reduce(function (s, x) { return s + x.valor; }, 0);
    var tons = TONS[t], cor = irrf ? 'var(--gs-irrf)' : 'var(--gs-prev)', fat = e.map(function (x, i) { return [x.nome, x.valor, tons[i]]; });
    var titulo = irrf ? 'Fiscal tributário (IRRF)' : 'Previdenciário', url = irrf ? '/gov-irrf.html' : '/gov-previdenciario.html';
    var corpo = n ? '<div class="v2-dn">' + donut(fat, brlc(T), '', 14.5, titulo + ': ' + e.map(function (x) { return x.nome + ' ' + brlc(x.valor); }).join(', ')) + dleg(fat, brlc) + '</div>' :
      '<p class="v2-nada">Nenhum caso deste tributo contratado.</p>';
    var pill = tot > 0 && pot != null ? '<span class="v2-pillp ' + t + '">' + pc(num(pot), tot) + '</span>' : '';
    return '<div class="v2-ty ' + t + '"><div class="v2-hd"><h3><i style="background:' + cor + '"></i>' + titulo + '</h3>' + pill + '</div>' +
      '<div class="v2-big">' + esc(brlc(pot)) + '</div><small>' + n + (n === 1 ? ' caso' : ' casos') + (tot > 0 && pot != null ? ' · ' + pc(num(pot), tot) + ' do potencial' : '') + '</small>' +
      corpo + (n ? '<a class="gov-link v2-det" href="' + url + '">Ver detalhes ›</a>' : '') + '</div>';
  }
  function tributos(D, tot) { return '<div class="v2-tys">' + cartaoTributo(D, 'irrf', tot) + cartaoTributo(D, 'prev', tot) + '</div>'; }
  // D = dados com os totais da carteira (V): potencial dos cartões deve bater com o da pizza

  // ---------- cartão principal: pizza + estatísticas ----------
  function pizza(D, V) {
    var iP = V.irrf.potencial, pP = V.prev.potencial, nI = nTrib(D, 'irrf'), nP = nTrib(D, 'prev'), nC = D.casos.length - nI - nP;
    var tot = num(iP) + num(pP), temEst = temValor(D, 'irrf') || temValor(D, 'prev'), E = K.porEstagio(D);
    var estoque = temEst ? E[0].valor + E[1].valor + E[2].valor : null, rec = temEst ? E[3].valor : null;
    var cf = [['IRRF', nI, COR_I], ['Previdenciário', nP, COR_P]]; if (nC > 0) cf.push(['Consolidado', nC, C.forte]);
    var circ = ''; for (var k = 0; k < 10; k++) circ += '<circle cx="95" cy="95" r="64" fill="none" stroke="' + COR_P + '" stroke-width="30" stroke-dasharray="0 402" stroke-dashoffset="0" transform="rotate(-90 95 95)"/>';
    var svg = '<svg viewBox="0 0 190 190" role="img" id="v2-pzsvg"><circle cx="95" cy="95" r="64" fill="none" stroke="' + C.trilha + '" stroke-width="30"/>' + circ + '<text id="v2-pzc" x="95" y="92" text-anchor="middle" class="v2-ct" style="font-size:14.5px"></text><text x="95" y="109" text-anchor="middle">potencial total</text></svg>';
    var stats = '<div class="v2-sts"><div class="v2-lgd" id="v2-pzlg" aria-live="polite"></div>' +
      '<div class="v2-st1"><div class="lab">Estoque de créditos</div><div class="v">' + esc(brlc(estoque)) + '</div><div class="d">identificado, ainda não realizado</div></div>' +
      '<div class="v2-st1"><div class="lab">Realizado</div><div class="v ok">' + esc(brlc(rec)) + '</div><div class="d">' + (rec != null && tot > 0 ? '<b>' + pc(rec, tot) + '</b> do potencial' : 'compensado ou restituído') + '</div>' +
      (rec != null && tot > 0 ? '<div class="v2-rbar"><i style="width:' + Math.min(100, Math.max(rec / tot * 100, rec > 0 ? 1 : 0)).toFixed(1) + '%"></i></div>' : '') + '</div>' +
      '<div class="v2-st1"><div class="lab">Casos</div><div class="v2-dn">' + donut(cf, String(D.casos.length), 'casos', 28, 'Casos: ' + nI + ' IRRF e ' + nP + ' previdenciário') + dleg(cf, function (v) { return v + (v === 1 ? ' caso' : ' casos'); }) + '</div></div></div>';
    var seg = [['tipo', 'Por tipo'], ['estado', 'Por estado'], ['estagio', 'Por estágio do crédito']];
    return '<div class="v2-card v2-pz" id="v2-pz" aria-label="Potencial por tipo de oportunidade"><div class="v2-ch"><div><h2>Potencial por tipo de oportunidade</h2><small id="v2-pzsub"></small></div>' +
      '<div class="v2-seg" role="group" aria-label="Critério da pizza">' + seg.map(function (s) { return '<button type="button" class="v2-btn" data-k="' + s[0] + '" aria-pressed="false">' + s[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="v2-pzt">' + svg + stats + '</div>' + tributos(V, tot) + '</div>';
  }
  function ligarPizza(D, V) {
    var el = document.getElementById('v2-pz'); if (!el) return;
    var UF = K.porUF(D), E = K.porEstagio(D), cores = ['#1E9488', '#5FB5AC', '#A5D8D3'];
    var CRIT = {
      tipo: { n: 'Por tipo', t: 'Fiscal tributário (IRRF) e previdenciário, por valor', f: [['IRRF', num(V.irrf.potencial), COR_I], ['Previdenciário', num(V.prev.potencial), COR_P]] },
      estado: { n: 'Por estado', t: 'Potencial por unidade da federação, por valor', f: K.fatiasUF(UF, 8).map(function (x, i) { return [x.nome, x.valor, x.nome === 'Demais UFs' ? '#B7C2CD' : cores[i % 3]]; }) },
      estagio: { n: 'Por estágio do crédito', t: 'Potencial por estágio do crédito (IRRF + previdenciário), por valor', f: E.map(function (x, i) { return [x.nome, x.valor, [COR_I, COR_P, C.menta || '#6FD0C7', C.cobre || '#C78054'][i]]; }) }
    };
    var cur = 'tipo', r = 64, c = 2 * Math.PI * r, GAP = 3, circs = el.querySelectorAll('#v2-pzsvg circle:not(:first-child)');
    function upd() {
      var d = CRIT[cur], f = d.f.filter(function (x) { return x[1] > 0; }), sum = f.reduce(function (a, x) { return a + x[1]; }, 0), off = 0;
      Array.prototype.forEach.call(circs, function (ci, i) {
        if (i < f.length) { var len = f[i][1] / sum * c, vis = Math.max(len - GAP, 0); ci.setAttribute('stroke', f[i][2]); ci.setAttribute('stroke-dasharray', vis.toFixed(2) + ' ' + (c - vis).toFixed(2)); ci.setAttribute('stroke-dashoffset', (-off).toFixed(2)); off += len; }
        else { ci.setAttribute('stroke-dasharray', '0 ' + c.toFixed(2)); ci.setAttribute('stroke-dashoffset', (-off).toFixed(2)); }
      });
      el.querySelector('#v2-pzc').textContent = sum > 0 ? brlc(sum) : '—';
      el.querySelector('#v2-pzsvg').setAttribute('aria-label', sum > 0 ? 'Potencial total ' + brlc(sum) + ' ' + d.n.toLowerCase() + ': ' + f.map(function (x) { return x[0] + ' ' + pc(x[1], sum); }).join(', ') : 'Sem valores de potencial informados');
      el.querySelector('#v2-pzsub').textContent = d.t;
      el.querySelector('#v2-pzlg').innerHTML = '<div class="lab">' + esc(d.n) + '</div>' + (f.length ? f.map(function (x) { return '<div class="row"><i style="background:' + x[2] + '"></i><span>' + esc(x[0]) + '</span><b>' + esc(brlc(x[1])) + '</b><em>' + pc(x[1], sum) + '</em></div>'; }).join('') : '<div class="row v2-nada">Sem valores informados para este critério.</div>');
      Array.prototype.forEach.call(el.querySelectorAll('.v2-seg button'), function (b) { var on = b.getAttribute('data-k') === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    el.querySelector('.v2-seg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cur = b.getAttribute('data-k'); upd(); });
    upd();
  }

  // ---------- mapa ----------
  function mapaCard(D) {
    var A = K.porUF(D), tem = Object.keys(A).filter(function (u) { return window.GovMapa && window.GovMapa.ESTADOS[u]; }).length;
    return '<div class="v2-card v2-mapc" aria-label="Mapa do Brasil com oportunidades por estado"><div class="v2-ch"><div><h2>Oportunidades em curso por estado</h2><small>casos por UF · passe o mouse ou toque em um estado</small></div></div>' +
      '<div class="v2-mapbox" id="v2-mapbox"></div>' + (tem ? '' : '<p class="v2-nada">Nenhum caso com UF identificada ainda.</p>') + '</div>';
  }
  function desenharMapa(force) {
    var box = document.getElementById('v2-mapbox'); if (!box || !window.GovMapa) return;
    var w = Math.round(box.clientWidth); if (!w || (!force && w === ST.mapW)) return; ST.mapW = w;
    window.GovMapa.render(box, K.porUF(ST.ctx), { esc: esc, moeda: function (v) { return G.brlCurto(v); }, pct: K.pct });
  }

  // ---------- evolução no tempo ----------
  function areaCard(D) {
    ST.serie = K.serieTemporal(D.casos);
    return '<section class="v2-card" aria-labelledby="t-area"><div class="v2-ch"><div><h2 id="t-area">Potencial identificado ao longo do tempo</h2><small>acumulado pela data de criação dos casos</small></div>' +
      '<div class="v2-leg"><span><i style="background:' + COR_I + '"></i>IRRF</span><span><i style="background:' + COR_P + '"></i>Previdenciário</span></div></div><div id="v2-area"></div></section>';
  }
  function desenharArea(force) {
    var el = document.getElementById('v2-area'); if (!el) return; var ser = ST.serie;
    if (ser.length < 2) {
      el.innerHTML = '<p class="v2-nada">' + (ser.length === 0 ? 'Os casos ainda não têm data de criação registrada; a evolução aparece quando houver datas.' : 'Todos os casos foram criados em ' + esc(ddmm(ser[0].d, true)) + '. A evolução aparece quando houver mais de uma data.') + '</p>'; return;
    }
    var W = Math.max(280, Math.round(el.clientWidth)); if (!force && W === ST.areaW) return; ST.areaW = W;
    var H = W < 500 ? 230 : 300, L = W < 500 ? 36 : 46, R = 16, T = 22, B = 30, pw = W - L - R, ph = H - T - B, q = ser[ser.length - 1];
    var mx = K.maxBonito(Math.max(q.i, q.p)), x = function (k) { return L + k / (ser.length - 1) * pw; }, y = function (v) { return T + ph - v / mx * ph; };
    var dig = 2, s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Potencial acumulado: IRRF ' + brlc(q.i) + ' e previdenciário ' + brlc(q.p) + ', de ' + ddmm(ser[0].d, true) + ' a ' + ddmm(q.d, true)) + '"><defs>' +
      '<linearGradient id="v2ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + COR_I + '" stop-opacity=".35"/><stop offset="1" stop-color="' + COR_I + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="v2gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + COR_P + '" stop-opacity=".35"/><stop offset="1" stop-color="' + COR_P + '" stop-opacity="0"/></linearGradient></defs>';
    for (var g = 0; g <= 4; g++) { var v = mx / 4 * g; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + C.grade + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: dig }) + '</text>'; }
    var acima = q.i >= q.p;
    [['i', COR_I, 'v2ga', acima ? -10 : 20], ['p', COR_P, 'v2gb', acima ? 20 : -10]].forEach(function (o) {
      var p = ser.map(function (z, k) { return (k ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(z[o[0]]).toFixed(1); }).join('');
      s += '<path d="' + p + 'L' + x(ser.length - 1) + ' ' + y(0) + 'L' + x(0) + ' ' + y(0) + 'Z" fill="url(#' + o[2] + ')"/><path d="' + p + '" fill="none" stroke="' + o[1] + '" stroke-width="2.5" stroke-linejoin="round"/>';
      s += '<circle cx="' + x(ser.length - 1) + '" cy="' + y(q[o[0]]) + '" r="5" fill="' + o[1] + '" stroke="#fff" stroke-width="2"/><text x="' + (x(ser.length - 1) - 10) + '" y="' + (y(q[o[0]]) + o[3]) + '" text-anchor="end" style="fill:' + o[1] + ';font-weight:700">' + mi(q[o[0]]) + '</text>';
    });
    var ano = ser[0].d.slice(0, 4) !== q.d.slice(0, 4), tk = [0, Math.round((ser.length - 1) / 3), Math.round(2 * (ser.length - 1) / 3), ser.length - 1].filter(function (k, i, a) { return a.indexOf(k) === i; });
    tk.forEach(function (k) { s += '<text x="' + x(k) + '" y="' + (H - 8) + '" text-anchor="' + (k === 0 ? 'start' : k === ser.length - 1 ? 'end' : 'middle') + '">' + ddmm(ser[k].d, ano) + '</text>'; });
    el.innerHTML = s + '<text x="' + L + '" y="10">R$ milhões</text></svg>';
  }

  // ---------- carteira de municípios (lista completa, filtro por UF, ficha e relatório) ----------
  function somaPot(lista, ibge) { var t = null; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t = (t || 0) + num(x.potencial); }); return t; }
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
      return { m: m, i: i, p: p, t: num(i) + num(p), vazio: i == null && p == null, e: etapaMax(D, m.ibge) };
    }).sort(function (a, b) { return b.t - a.t; });
    if (!ms.length) return '';
    var max = ms[0].t || 1, ufs = {}; ms.forEach(function (x) { var u = x.m.uf || K.ufDoCaso({ ibge: x.m.ibge }, {}) || '—'; x.uf = u; ufs[u] = (ufs[u] || 0) + 1; });
    var chips = '<button type="button" class="vis-uf on" data-uf="" aria-pressed="true">Todos · ' + ms.length + '</button>' + Object.keys(ufs).sort().map(function (u) { return '<button type="button" class="vis-uf" data-uf="' + esc(u) + '" aria-pressed="false">' + esc(u) + ' · ' + ufs[u] + '</button>'; }).join('');
    var linhas = ms.map(function (x) {
      var wI = x.t ? num(x.i) / max * 100 : 0, wP = x.t ? num(x.p) / max * 100 : 0, rotulo = (x.m.nome || 'IBGE ' + x.m.ibge) + (x.m.uf ? '/' + x.m.uf : '');
      return '<tr data-uf="' + esc(x.uf) + '"><td><a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(x.m.ibge) + '"><b>' + esc(rotulo) + '</b></a></td>' +
        '<td class="num">' + esc(G.brlInt(x.i)) + '</td><td class="num">' + (x.m.prev ? esc(G.brlInt(x.p)) : '<span class="gs-s">Não contratado</span>') + '</td>' +
        '<td class="num"><b>' + esc(x.vazio ? '—' : G.brlInt(x.t)) + '</b></td>' +
        '<td class="vis-bar" aria-label="Potencial total ' + esc(x.vazio ? 'não informado' : G.brlInt(x.t)) + '"><div class="v2-bar2" style="width:' + (x.t ? Math.max(x.t / max * 100, 12) : 0).toFixed(0) + '%"><i style="width:' + (x.t ? num(x.i) / x.t * 100 : 0).toFixed(1) + '%;background:' + COR_I + '"></i><i style="width:' + (x.t ? num(x.p) / x.t * 100 : 0).toFixed(1) + '%;background:' + COR_P + '"></i></div></td>' +
        '<td>' + (x.e ? G.etapaPill(x.e) : '<span class="gs-s">Sem caso</span>') + '</td>' +
        '<td class="vis-acoes"><a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(x.m.ibge) + '">Ficha ›</a>' +
        (window.GovRelatorio ? '<details class="vis-rel"><summary class="mini">Relatório</summary><div class="vis-rel-pop">' + window.GovRelatorio.botoes(x.m.ibge, true) + '</div></details>' : '') + '</td></tr>';
    }).join('');
    return '<section class="v2-card vis-cart" aria-labelledby="t-cart"><div class="v2-ch"><div><h2 id="t-cart">Carteira de municípios</h2><small id="v2-cartsub">' + ms.length + ' municípios · ordenados pelo potencial total · clique no nome para abrir a ficha</small></div><div class="vis-ufs" role="group" aria-label="Filtrar por UF">' + chips + '</div></div>' +
      '<div class="gs-tbl-wrap"><table class="gov-table vis-tbl"><thead><tr><th>Município</th><th class="num">IRRF</th><th class="num">Previdenciário</th><th class="num">Total</th><th>IRRF x Prev.</th><th>Etapa</th><th>Ações</th></tr></thead><tbody>' + linhas + '</tbody></table></div></section>';
  }
  function ligarCarteira() {
    var box = raiz.querySelector('.vis-cart'); if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.vis-uf'), function (b) {
      b.addEventListener('click', function () {
        var u = b.getAttribute('data-uf'), n = 0;
        Array.prototype.forEach.call(box.querySelectorAll('.vis-uf'), function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        Array.prototype.forEach.call(box.querySelectorAll('tbody tr'), function (tr) { tr.hidden = !!u && tr.getAttribute('data-uf') !== u; if (!tr.hidden) n++; });
        var s = box.querySelector('#v2-cartsub'); if (s) s.textContent = n + (n === 1 ? ' município' : ' municípios') + (u ? ' em ' + u : '') + ' · ordenados pelo potencial total · clique no nome para abrir a ficha';
      });
    });
  }

  // ---------- atividade recente e potencial por município ----------
  function atividadeCard(D) {
    var nomeT = { irrf: 'IRRF', prev: 'Previdenciário' }, l = K.atividade(D.casos, 6);
    var itens = l.map(function (c) {
      var i = c.tributo === 'irrf', p = c.tributo === 'prev', d = K.data10(c.criado);
      return '<li><div class="v2-ic ' + (i ? 'i' : p ? 'p' : 'a') + '">' + (i ? 'IR' : p ? 'PV' : 'CS') + '</div><div><p>' + esc(nome(c)) + ' · ' + esc(nomeT[c.tributo] || 'Consolidado') + '</p><small>' + esc(G.nomeEtapa(c.etapa)) + ' · ' + esc(brlc(c.valor)) + '</small></div><time datetime="' + esc(d) + '">' + ddmm(d) + '</time></li>';
    }).join('');
    return '<div class="v2-card"><div class="v2-ch"><h2>Atividade recente</h2><small>últimos casos criados</small></div>' +
      (itens ? '<ul class="v2-act">' + itens + '</ul>' : '<p class="v2-nada">Sem casos com data de criação registrada.</p>') + '</div>';
  }
  function barrasCard(D) {
    ST.tops = K.topMunicipios(D, 8);
    return '<div class="v2-card"><div class="v2-ch"><div><h2>Potencial por município</h2><small>' + ST.tops.length + (ST.tops.length === 1 ? ' maior' : ' maiores') + ', R$ milhões</small></div><div class="v2-leg"><span><i style="background:' + COR_I + '"></i>IRRF</span><span><i style="background:' + COR_P + '"></i>Previdenciário</span></div></div><div id="v2-bars"></div></div>';
  }
  function desenharBarras(force) {
    var el = document.getElementById('v2-bars'); if (!el) return; var l = ST.tops;
    if (!l.length) { el.innerHTML = '<p class="v2-nada">Sem valores de potencial por município ainda.</p>'; return; }
    var W = Math.max(280, Math.round(el.clientWidth)); if (!force && W === ST.barsW) return; ST.barsW = W;
    var mx = K.maxBonito(Math.max.apply(null, l.map(function (o) { return o.i + o.p; }))), s, rot = function (o) { return String(o.nome || 'IBGE ' + o.ibge); };
    var aria = 'Potencial por município: ' + l.map(function (o) { return rot(o) + ' ' + brlc(o.i + o.p); }).join(', ');
    if (W < 520) {
      var L = 108, R = 48, rh = 32, H = l.length * rh + 8, pw = W - L - R, xs = function (v) { return v / mx * pw; };
      s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">';
      l.forEach(function (o, k) {
        var cy = 4 + k * rh + rh / 2, n = rot(o).length > 14 ? rot(o).slice(0, 13) + '…' : rot(o);
        s += '<text x="0" y="' + (cy + 4) + '" class="v2-svg-fg">' + esc(n) + (o.uf ? ' <tspan class="v2-svg-m">' + esc(o.uf) + '</tspan>' : '') + '</text>' +
          '<rect x="' + L + '" y="' + (cy - 8) + '" width="' + xs(o.i) + '" height="16" rx="3" fill="' + COR_I + '"/><rect x="' + (L + xs(o.i) + 1) + '" y="' + (cy - 8) + '" width="' + Math.max(xs(o.p) - 1, 0) + '" height="16" rx="3" fill="' + COR_P + '"/>' +
          '<text x="' + (L + xs(o.i + o.p) + 6) + '" y="' + (cy + 4) + '" class="v2-svg-fg" style="font-weight:700">' + mi(o.i + o.p) + '</text>';
      });
      s += '</svg>';
    } else {
      var H = 330, L2 = 40, R2 = 8, T = 18, B = 44, pw2 = W - L2 - R2, ph = H - T - B, y = function (v) { return T + ph - v / mx * ph; }, bw = Math.min(pw2 / l.length * .56, 64), dig = 2;
      s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">';
      for (var g = 0; g <= 4; g++) { var v = mx / 4 * g; s += '<line x1="' + L2 + '" x2="' + (W - R2) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + C.grade + '"/><text x="' + (L2 - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: dig }) + '</text>'; }
      l.forEach(function (o, k) {
        var cx = L2 + (k + .5) * pw2 / l.length, x0 = cx - bw / 2, n = rot(o).length > 13 ? rot(o).slice(0, 12) + '…' : rot(o);
        s += '<rect x="' + x0 + '" y="' + y(o.i) + '" width="' + bw + '" height="' + Math.max(y(0) - y(o.i), 0) + '" rx="4" fill="' + COR_I + '"/>' +
          '<rect x="' + x0 + '" y="' + y(o.i + o.p) + '" width="' + bw + '" height="' + Math.max(y(o.i) - y(o.i + o.p) - 1.5, 0) + '" rx="4" fill="' + COR_P + '"/>' +
          '<text x="' + cx + '" y="' + (y(o.i + o.p) - 6) + '" text-anchor="middle" class="v2-svg-fg" style="font-weight:700">' + mi(o.i + o.p) + '</text>' +
          '<text x="' + cx + '" y="' + (H - 24) + '" text-anchor="middle">' + esc(n) + '</text><text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" style="font-size:10px">' + esc(o.uf || '') + '</text>';
      });
      s += '</svg>';
    }
    el.innerHTML = s;
  }

  // ---------- alertas, atalhos, ligações ----------
  function alertas(D) {
    if (!(D.alertas || []).length) return '';
    var m = { critico: ['r', 'crítico'], atencao: ['y', 'atenção'] };
    var l = D.alertas.map(function (a) { var n = m[a.nivel] || ['', 'info']; return '<div class="gs-row"><span>' + esc(a.texto) + '</span><span class="m gs-st ' + n[0] + '">' + n[1] + '</span></div>'; }).join('');
    return '<div class="v2-card vis-alertas"><div class="v2-ch"><div><h2>Alertas</h2><small>O que precisa de atenção</small></div></div>' + l + '</div>';
  }
  function atalhos(D) {
    var ops = (D.municipios || []).map(function (m) { return '<option value="' + esc(m.ibge) + '">' + esc(m.nome ? m.nome + (m.uf ? '/' + m.uf : '') : 'IBGE ' + m.ibge) + '</option>'; }).join('');
    var rel = window.GovRelatorio && ops ? '<details class="vis-rel"><summary class="btn sec">Gerar relatório</summary><div class="vis-rel-pop"><label class="gs-s" for="vis-rel-mun">Município</label><select id="vis-rel-mun">' + ops + '</select><div class="vis-rel-bts" aria-live="polite"></div></div></details>' : '';
    return '<nav class="vis-atalhos" aria-label="Ações rápidas"><a class="btn" href="/gov-municipios.html">Municípios</a>' + rel + '<a class="btn sec" href="/gov-crm.html">CRM</a></nav>';
  }
  function ligarRel() {
    var sel = document.getElementById('vis-rel-mun'), bts = document.querySelector('.vis-rel-bts'); if (!sel || !bts) return;
    var upd = function () { bts.innerHTML = window.GovRelatorio.botoes(sel.value, true); };
    sel.addEventListener('change', upd); upd();
  }
  var rt;
  function redesenhar() { clearTimeout(rt); rt = setTimeout(function () { desenharArea(); desenharBarras(); desenharMapa(); }, 80); }

  G.carregar().then(function (D) {
    var vazio = !D.casos.length, mm = {}; (D.municipios || []).forEach(function (m) { mm[String(m.ibge)] = m; });
    ST.mm = mm;
    var V = D.carteira ? Object.assign({}, D, { irrf: Object.assign({}, D.irrf, D.carteira.irrf), prev: Object.assign({}, D.prev, D.carteira.prev) }) : D;
    var html;
    if (vazio && D.modo !== 'demo') {
      html = '<div class="v2"><div class="v2-card">' + G.vazio('Nenhum caso cadastrado ainda', 'Quando houver o primeiro diagnóstico, o potencial de IRRF e o previdenciário aparecem aqui, sempre separados.', '<a class="btn" href="/gov-municipios.html">Novo diagnóstico</a>') + '</div>' +
        '<div class="v2-card">' + tributos(D, 0) + '</div></div>';
      raiz.innerHTML = html; return;
    }
    ST.ctx = D;
    html = '<div class="v2">' + atalhos(D) + '<section class="v2-toprow" aria-label="Distribuição do potencial e mapa">' + pizza(D, V) + mapaCard(D) + '</section>' +
      areaCard(D) + carteira(D) + '<section class="v2-row2">' + atividadeCard(D) + barrasCard(D) + '</section>' + alertas(D) + '</div>';
    raiz.innerHTML = html;
    ligarPizza(D, V); ligarCarteira(); ligarRel(); desenharArea(true); desenharBarras(true); desenharMapa(true);
    window.addEventListener('resize', redesenhar);
  }).catch(function (e) {
    raiz.innerHTML = '<div class="gov-alert bad">Não foi possível carregar os dados. ' + esc(e && e.message) + '</div>';
  });
})();
