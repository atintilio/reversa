// Reversa Gov · Diagnóstico previdenciário (ambiente de demonstração). Mesma estrutura do Reversa Tax:
// 1 documentos → 2 o motor calcula → 3 resultado (metodologia, resumo por tese, memória de cálculo, limites).
// Valores SIMULADOS e proporcionais ao potencial previdenciário do município na carteira. Diagnóstico não é crédito.
(function () {
  'use strict';
  var G = window.GovDados, GG = window.GovGraf, P = window.GovPrevMotor, esc = G.esc, app = document.getElementById('dp-app');
  var ARQ = P.ARQ, nomeMun = P.nomeMun, calcular = P.calcular;
  function brl(v) { return G.brl(v); }
  (function () { var s = document.createElement('style'); s.textContent = P.CSS; document.head.appendChild(s); })();

  function passos(n) {
    var t = [['Documentos do município', 'Folha, eSocial e DCTFWeb do período.'], ['O motor calcula', 'Teses avaliadas item a item.'], ['Apresente ao município', 'Metodologia, resumo por tese e memória de cálculo.']];
    return '<div class="dp-passos">' + t.map(function (x, i) { return '<div class="dp-passo' + (i + 1 <= n ? ' on' : '') + (i + 1 < n ? ' ok' : '') + '"><i>' + (i + 1 < n ? '✓' : i + 1) + '</i><div><b>' + x[0] + '</b><small>' + x[1] + '</small></div></div>'; }).join('') + '</div>';
  }
  var AV = '<p class="dp-aviso"><b>Diagnóstico preliminar, em ambiente de demonstração.</b> Os valores são simulados e indicam onde vale aprofundar a análise; não constituem crédito reconhecido nem prometem recuperação.</p>';

  function entrada(D) {
    var ms = D.municipios.filter(function (m) { return m.prev; });
    var sel = ms.map(function (m) { return '<option value="' + esc(m.ibge) + '">' + esc(nomeMun(m)) + '</option>'; }).join('');
    app.innerHTML = '<section class="gov-card"><h2>Município</h2>' + passos(1) + AV +
      '<div class="dp-sel"><select id="dp-mun" aria-label="Município">' + sel + '</select><button type="button" class="btn" id="dp-go">Carregar documentos de exemplo e diagnosticar</button></div>' +
      '<table class="dp-arq"><thead><tr><th>Documento (simulado)</th><th>Cobertura</th></tr></thead><tbody>' + ARQ.map(function (a) { return '<tr><td>' + a[0] + '</td><td>' + a[1] + '</td></tr>'; }).join('') + '</tbody></table></section>';
    document.getElementById('dp-go').addEventListener('click', function () { rodar(D, document.getElementById('dp-mun').value); });
  }

  function rodar(D, ibge) {
    var m = D.municipios.filter(function (x) { return String(x.ibge) === String(ibge); })[0]; if (!m) return;
    var u = new URL(location.href); u.searchParams.set('ibge', ibge); history.replaceState(null, '', u);
    app.innerHTML = '<section class="gov-card"><h2>' + esc(nomeMun(m)) + '</h2>' + passos(2) + '<p class="gs-s" style="margin-top:14px">O motor está avaliando as teses, uma a uma, sobre as 65 competências (2021 a 2025)…</p><div class="dp-barra"><i id="dp-p" style="width:0;background:#1E9488;transition:width 1.4s ease"></i></div></section>';
    setTimeout(function () { var p = document.getElementById('dp-p'); if (p) p.style.width = '100%'; }, 50);
    setTimeout(function () { resultado(D, m); }, 1600);
  }

  function resultado(D, m) {
    var R = calcular(D, m), w = R.pot ? R.prov / R.pot * 100 : 0;
    var caso = D.casos.filter(function (c) { return String(c.ibge) === String(m.ibge) && c.tributo === 'prev'; })[0];
    app.innerHTML =
      '<section class="gov-card"><div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><p class="gs-lab" style="margin:0">REVERSA GOV' + (caso ? ' · ' + esc(caso.numero) : '') + '</p><h2 style="margin:2px 0 4px">' + esc(nomeMun(m)) + '</h2><p style="margin:0;color:var(--muted);font-size:13.5px">IBGE ' + esc(m.ibge) + ' · 65 competências analisadas (2021 a 2025) · ' + R.serv + ' vínculos RGPS na amostra</p></div><a class="gov-link" href="/gov-diag-prev.html">Novo diagnóstico</a></div>' + passos(3) + AV + '</section>' +
      '<div class="gs-g2" style="margin-top:16px"><div class="gs-card prev"><span class="gs-lab">POTENCIAL A VALIDAR · PREVIDENCIÁRIO</span><div class="gs-big" style="color:#1E9488">' + esc(brl(R.pot)) + '</div>' +
      '<div class="dp-barra" role="img" aria-label="Provável e possível"><i style="width:' + w + '%;background:#1A7F4B"></i><i style="width:' + (100 - w) + '%;background:#C58A12"></i></div>' +
      '<div class="gs-lg"><span><i class="gs-dot" style="background:#1A7F4B"></i>Provável <b>' + esc(brl(R.prov)) + '</b></span><span><i class="gs-dot" style="background:#C58A12"></i>Possível <b>' + esc(brl(R.poss)) + '</b></span></div></div>' +
      '<div class="gs-card"><span class="gs-lab">EXPOSIÇÃO, NÃO SOMA AO POTENCIAL</span><div class="gs-big" style="color:#B3402F">' + esc(brl(R.passivo)) + '</div><p class="gs-s" style="margin:8px 0 0">Contribuição possivelmente recolhida a menor ou sem guia correspondente. É risco do município, não crédito.</p></div></div>' +
      '<div class="gs-card" style="margin-top:16px">' + P.metodologia(m, R) + '</div>' +
      '<div class="gs-card" style="margin-top:16px"><h3>Potencial por ano</h3><p class="gs-s">R$ milhões</p><div style="max-width:560px">' + GG.barras(R.porAno.map(function (a) { return a.v / 1e6; }), R.porAno.map(function (a) { return String(a.ano); }), '#1E9488', function (v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }) + '</div></div>' +
      '<div class="gs-card" style="margin-top:16px"><h3>Resumo por tese</h3><p class="gs-s">Classificação por grau de segurança jurídica (Provável, Possível, Remoto). Remoto não entra no potencial.</p>' + P.tabelaTeses(R) + '</div>' +
      '<div class="gs-card" style="margin-top:16px"><h3>Memória de cálculo</h3><p class="gs-s">Base estimada × alíquota = valor. Alíquota de 22% é exemplo (20% patronal + 2% de RAT); o RAT real depende do grau de risco do município.</p>' + P.memoria(R) + '</div>' +
      '<div class="gs-card" style="margin-top:16px"><h3>Premissas e limites</h3>' + P.limites() +
      '<div class="dp-ac"><button type="button" class="btn rv-rel" data-rel="prev" data-ibge="' + esc(m.ibge) + '">Gerar relatório previdenciário</button><button type="button" class="btn sec rv-rel" data-rel="consolidado" data-ibge="' + esc(m.ibge) + '">Relatório consolidado</button><a class="btn sec" href="/gov-documentos.html?ibge=' + encodeURIComponent(m.ibge) + '">Ver documentos</a><a class="btn sec" href="/gov-municipio.html?ibge=' + encodeURIComponent(m.ibge) + '">Ficha do município</a><a class="btn sec" href="/gov-crm.html">CRM</a></div></div>';
  }

  G.carregar().then(function (D) {
    if (!window.RV_GOV_DEMO) { app.innerHTML = '<section class="gov-card">' + G.vazio('Disponível na demonstração', 'Este diagnóstico simulado só abre no ambiente de demonstração.', '<a class="btn" href="/gov.html?demo=1">Abrir demonstração</a>') + '</section>'; return; }
    var ib = (/[?&]ibge=(\d+)/.exec(location.search) || [])[1];
    var mp = ib && D.municipios.filter(function (x) { return String(x.ibge) === String(ib) && x.prev; })[0];
    if (mp) rodar(D, ib); else entrada(D);
  }).catch(function (e) { app.innerHTML = '<section class="gov-card">' + G.vazio('Não foi possível carregar', (e && e.message) || '') + '</section>'; });
})();
