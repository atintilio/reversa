// Reversa Gov: gráficos SVG leves (sem biblioteca). Expõe window.GovGraf.
// Cores: IRRF (fiscal) azul, Previdenciário (social) verde-água.
(function () {
  'use strict';
  var COR = { irrf: '#2A5B93', prev: '#1E9488', verde: '#1A7F4B', amarelo: '#C58A12', vermelho: '#B3402F', grade: '#E1E7ED', texto: '#6B7886', forte: '#0E2239', trilha: '#E8EDF2' };
  var G = window.GovGraf = { COR: COR };
  var n1 = function (v) { return String(v).replace('.', ','); };
  function fmt(v, f) { return f ? f(v) : n1((Math.round(v * 100) / 100).toFixed(2)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // barras verticais com rótulo de valor; vals e labels têm o mesmo tamanho; f formata o valor
  G.barras = function (vals, labels, cor, f, alt) {
    var W = 520, H = alt || 210, p = 34, mx = Math.max.apply(null, vals.concat([0.0001])) * 1.2, bw = (W - 2 * p) / vals.length * 0.55, o = '';
    [0, 0.5, 1].forEach(function (t) { var y = H - p - t * (H - 2 * p) / 1.2; o += '<line x1="' + p + '" x2="' + (W - p) + '" y1="' + y + '" y2="' + y + '" stroke="' + COR.grade + '"/>'; });
    vals.forEach(function (v, i) {
      var slot = (W - 2 * p) / vals.length, x = p + i * slot + (slot - bw) / 2, h = v / mx * (H - 2 * p);
      o += '<rect x="' + x + '" y="' + (H - p - h) + '" width="' + bw + '" height="' + Math.max(h, 0) + '" rx="6" fill="' + cor + '"><title>' + esc(labels[i]) + ': ' + esc(fmt(v, f)) + '</title></rect>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - p - h - 7) + '" font-size="11.5" font-weight="700" text-anchor="middle" fill="' + COR.forte + '">' + esc(fmt(v, f)) + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" font-size="12" text-anchor="middle" fill="' + COR.texto + '">' + esc(labels[i]) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Gráfico de barras">' + o + '</svg>';
  };

  // áreas sobrepostas: series = [{vals, cor, id}]
  G.area = function (series, labels, alt) {
    var W = 700, H = alt || 250, p = 34, all = [];
    series.forEach(function (s) { all = all.concat(s.vals); });
    var mx = Math.max.apply(null, all.concat([0.0001])) * 1.15, n = labels.length;
    var x = function (i) { return p + (n > 1 ? i * (W - 2 * p) / (n - 1) : (W - 2 * p) / 2); }, y = function (v) { return H - p - v / mx * (H - 2 * p); };
    var o = '';
    [0, 0.5, 1].forEach(function (t) { var yy = H - p - t * (H - 2 * p); o += '<line x1="' + p + '" x2="' + (W - p) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + COR.grade + '"/>'; });
    series.forEach(function (s, k) {
      var pts = s.vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(v); }).join(' '), id = 'gg' + k + Math.round(Math.random() * 1e6);
      o += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.cor + '" stop-opacity=".30"/><stop offset="1" stop-color="' + s.cor + '" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + pts + ' L' + x(n - 1) + ' ' + (H - p) + ' L' + x(0) + ' ' + (H - p) + 'Z" fill="url(#' + id + ')"/><path d="' + pts + '" fill="none" stroke="' + s.cor + '" stroke-width="3"/>';
      s.vals.forEach(function (v, i) { o += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="#fff" stroke="' + s.cor + '" stroke-width="2"><title>' + esc(labels[i]) + ': ' + esc(fmt(v, s.f)) + '</title></circle>'; });
    });
    labels.forEach(function (t, i) { o += '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="12" text-anchor="middle" fill="' + COR.texto + '">' + esc(t) + '</text>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Gráfico de evolução">' + o + '</svg>';
  };

  // rosca: partes = [{valor, cor}]
  G.rosca = function (partes, tam) {
    var R = 52, C = 2 * Math.PI * R, off = 0, tot = 0;
    partes.forEach(function (q) { tot += q.valor; });
    var o = '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + COR.trilha + '" stroke-width="16"/>';
    if (tot > 0) partes.forEach(function (q) {
      var l = q.valor / tot * C;
      o += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + q.cor + '" stroke-width="16" stroke-dasharray="' + l + ' ' + (C - l) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"/>';
      off += l;
    });
    return '<svg viewBox="0 0 140 140" width="' + (tam || 150) + '" role="img" aria-label="Gráfico de rosca">' + o + '</svg>';
  };

  // barra horizontal simples (0 a 100)
  G.barra = function (pct, cor) { return '<div class="gs-bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + cor + '"></i></div>'; };
})();
