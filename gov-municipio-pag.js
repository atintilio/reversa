// Reversa Gov: ficha do município (?ibge=NNNNNNN). Sem ibge, lista os municípios da carteira.
(function () {
  'use strict';
  var G = window.GovDados, GG = window.GovGraf, esc = G.esc;
  var COR = { irrf: '#2A5B93', prev: '#1E9488' };
  var app = document.getElementById('ficha-app');
  var NOME = { irrf: 'IRRF retido na fonte', prev: 'Previdenciário' };

  function qs(k) { var m = new RegExp('[?&]' + k + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1]).replace(/\D/g, '') : ''; }
  function soma(lista, ibge) {
    var t = null; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t = (t || 0) + G.num(x.potencial); });
    return t;
  }
  function dataBr(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : null; }
  function cnpj(v) { var d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (v || null); }
  function etapaMax(D, ibge) {
    var ids = D.casos.filter(function (c) { return String(c.ibge) === String(ibge); }).map(function (c) { return c.etapa; });
    if (!ids.length) return null;
    var ord = G.ETAPAS.map(function (e) { return e.id; }), melhor = null;
    ids.forEach(function (id) { if (id === 'perdido_pausado') return; if (melhor == null || ord.indexOf(id) > ord.indexOf(melhor)) melhor = id; });
    return melhor || ids[0];
  }
  function chips(m) { return (m.irrf ? G.chip('irrf') : '') + (m.prev ? G.chip('prev') : '') || '<span class="gs-chip n">Sem tributo</span>'; }
  function nomeMun(m, ibge) { return m && m.nome ? m.nome + (m.uf ? '/' + m.uf : '') : 'Município ' + ibge; }

  // ---------- lista de escolha (sem ibge) ----------
  function escolher(D) {
    if (!D.municipios.length) {
      app.innerHTML = '<section class="gov-card">' + G.vazio('Nenhum município em carteira ainda', 'Os municípios aparecem aqui quando existe pelo menos um caso cadastrado para eles. Cadastre um caso em Municípios para começar.', '<a class="gov-link" href="/gov-municipios.html">Escolher município</a>') + '</section>';
      return;
    }
    var linhas = D.municipios.map(function (m) {
      var pi = soma(D.irrf.municipios, m.ibge), pp = soma(D.prev.municipios, m.ibge), e = etapaMax(D, m.ibge);
      return '<tr><td><a class="gov-link" href="/gov-municipio.html?ibge=' + encodeURIComponent(m.ibge) + '"><b>' + esc(nomeMun(m, m.ibge)) + '</b></a></td><td>' + chips(m) + '</td><td class="num">' + G.brlInt(pi) + '</td><td class="num">' + G.brlInt(pp) + '</td><td>' + (e ? G.etapaPill(e) : '—') + '</td></tr>';
    }).join('');
    app.innerHTML = '<section class="gov-card"><h2>Escolha um município</h2><p>Abra a ficha de um município em carteira.</p><div class="gm-tbl-wrap"><table class="gov-table"><thead><tr><th>Município</th><th>Tributos</th><th class="num">Potencial IRRF</th><th class="num">Potencial Prev.</th><th>Etapa</th></tr></thead><tbody>' + linhas + '</tbody></table></div></section>';
  }

  // ---------- blocos ----------
  function bloco(D, m, t) {
    var X = D[t], fisc = t === 'irrf', cor = COR[t];
    var tag = fisc ? 'FISCAL' : 'SOCIAL', rot = fisc ? 'potencial de incremento de receita' : 'potencial de recuperação';
    var cab = '<span class="gs-lab">' + tag + '</span><h3>' + NOME[t] + '</h3>';
    if (!m[t]) return '<div class="gs-card ' + t + ' gm-bloco">' + cab + '<p class="gm-off">Este município não contratou este tributo.</p></div>';
    var pot = soma(X.municipios, m.ibge), h = '';
    var vHtml = '<div class="val">' + G.brl(pot) + '</div>';
    if (X.pct != null && X.base != null && pot != null) {
      var tip = fisc
        ? { conta: G.brlInt(pot) + ' ÷ ' + G.brlInt(X.base) + ' = ' + G.pct(X.pct), numerador: 'IRRF de fornecedores não retido ou não reconhecido, apurado nota a nota no período.', denominador: 'todo o IRRF retido pelo município no período.', fonte: 'Fonte: Siconfi/DCA 2021–2025.' + (D.modo === 'demo' ? ' Caso simulado.' : '') }
        : { conta: G.brlInt(pot) + ' ÷ ' + G.brlInt(X.base) + ' = ' + G.pct(X.pct), numerador: 'valores recolhidos a maior e ajustes identificados nas competências analisadas.', denominador: 'contribuições previdenciárias (servidor + patronal) do período.', fonte: 'Fonte: Siconfi/DCA e folha.' + (D.modo === 'demo' ? ' Caso simulado.' : '') };
      h = '<div class="gs-bloco-linha"><span class="gs-pcts" style="color:' + cor + '">' + G.balao(esc(G.pct(X.pct)), tip) + '</span><div><div class="rot">' + rot + '</div>' + vHtml + '</div></div>';
    } else {
      h = '<div class="rot">' + rot + '</div>' + vHtml + (pot == null ? '<div class="rot" style="margin-top:6px">Valor ainda não calculado.</div>' : '');
    }
    var k = fisc
      ? [['Notas analisadas', G.int(X.notas)], ['Notas com diferença', G.int(X.comDiferenca)], ['Devido', G.brlCurto(X.devido)], ['Retido', G.brlCurto(X.retido)]]
      : [['Competências', G.int(X.competencias)], ['Inconsistências', G.int(X.inconsistencias)], ['Passivo identificado', G.brlCurto(X.passivo)], ['CRP vencido', X.crpVencidoDias == null ? '—' : G.int(X.crpVencidoDias) + ' dias']];
    var mini = '<div class="gs-mini">' + k.map(function (x) { return '<div><div class="v">' + esc(x[1]) + '</div><small>' + esc(x[0]) + '</small></div>'; }).join('') + '</div>';
    var link = fisc ? '<a class="gov-link" href="/gov-notas.html?ibge=' + encodeURIComponent(m.ibge) + '">Ver notas ›</a>' : '<a class="gov-link" href="/gov-documentos.html?ibge=' + encodeURIComponent(m.ibge) + '">Ver documentos ›</a>';
    return '<div class="gs-card ' + t + ' gm-bloco">' + cab + h + mini + '<div class="acao">' + link + '</div></div>';
  }

  // ---------- linha do tempo e contratos ----------
  function timeline(D, m, t) {
    var cs = D.casos.filter(function (c) { return String(c.ibge) === String(m.ibge) && (t === 'todos' || c.tributo === t); });
    cs.sort(function (a, b) { return String(b.criado || '').localeCompare(String(a.criado || '')); });
    var corpo = cs.length ? '<div class="gs-tl">' + cs.map(function (c) {
      var rotT = c.tributo === 'irrf' ? 'IRRF' : c.tributo === 'prev' ? 'Previdenciário' : 'Consolidado';
      var sub = [dataBr(c.criado), c.numero].filter(Boolean).join(' · ');
      return '<div><b>' + rotT + ' · ' + esc(G.nomeEtapa(c.etapa)) + '</b><small>' + esc(sub || '—') + '</small></div>';
    }).join('') + '</div>' : G.vazio('Sem casos', 'Nenhum caso registrado para este recorte.');
    return '<div class="gs-card"><h3>Linha do tempo</h3><p class="gs-s">Histórico dos casos no CRM</p>' + corpo + '</div>';
  }
  function contratos(D, m, t) {
    var cs = (D.contratos || []).filter(function (c) { return String(c.ibge) === String(m.ibge) && (t === 'todos' || c.tributo === t); });
    var corpo = cs.length ? cs.map(function (c) {
      var hon = c.honorarioPct == null ? 'Honorário —' : G.pct(c.honorarioPct, 0) + ' do êxito';
      return '<div class="gs-row"><span>' + G.chip(c.tributo) + '</span><span>' + esc(hon) + '</span><span class="m">' + G.brlInt(c.previsto) + '</span><small>' + esc([c.caso, c.origem ? 'origem ' + c.origem : null, c.situacao].filter(Boolean).join(' · ')) + ' · honorário previsto</small></div>';
    }).join('') : '<p class="gm-off">Sem contrato registrado. O contrato aparece quando o caso chega a "Proposta / contrato".</p>';
    return '<div class="gs-card gm-ctr"><h3>Contratos</h3><p class="gs-s">Um por tributo</p>' + corpo + '<div class="acao" style="margin-top:12px"><a class="gov-link" href="/gov-contratos.html">Ver todos os contratos ›</a></div></div>';
  }

  // ---------- painéis das abas ----------
  function painel(D, m, aba) {
    if (aba === 'irrf' || aba === 'prev') {
      var X = D[aba], h = '';
      if (X.porAno && X.porAno.length) {
        h += '<div class="gs-card gm-sec"><h3>Potencial por ano</h3><p class="gs-s">R$ milhões</p><div style="max-width:560px">' + GG.barras(X.porAno.map(function (a) { return G.num(a.potencial) / 1e6; }), X.porAno.map(function (a) { return String(a.ano); }), COR[aba], function (v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }) + '</div></div>';
      }
      return h + '<div class="gs-g21">' + timeline(D, m, aba) + contratos(D, m, aba) + '</div>';
    }
    if (aba === 'consolidado') {
      var pi = soma(D.irrf.municipios, m.ibge), pp = soma(D.prev.municipios, m.ibge), tot = (pi != null && pp != null) ? pi + pp : null;
      var cs = (D.contratos || []).filter(function (c) { return String(c.ibge) === String(m.ibge); });
      var hon = cs.length && cs.every(function (c) { return c.previsto != null; }) ? cs.reduce(function (a, c) { return a + G.num(c.previsto); }, 0) : null;
      var hero;
      if (tot == null) hero = '<div class="gs-card gm-soma">' + G.vazio('Consolidado indisponível', 'O consolidado soma os dois tributos e só é exibido quando ambos têm valor calculado.') + '</div>';
      else {
        var wi = tot > 0 ? pi / tot * 100 : 50;
        hero = '<div class="gs-card gm-soma"><span class="gs-lab">POTENCIAL TOTAL · IRRF + PREVIDENCIÁRIO</span><div class="gs-big">' + G.brlCurto(tot) + '</div><div class="gs-split" role="img" aria-label="Divisão entre IRRF e previdenciário"><i style="width:' + wi + '%;background:' + COR.irrf + '"></i><i style="width:' + (100 - wi) + '%;background:' + COR.prev + '"></i></div><div class="gs-lg"><span><i class="gs-dot" style="background:' + COR.irrf + '"></i>IRRF (fiscal) <b>' + G.brlCurto(pi) + '</b></span><span><i class="gs-dot" style="background:' + COR.prev + '"></i>Previdenciário (social) <b>' + G.brlCurto(pp) + '</b></span></div><div class="gs-mini" style="margin-top:16px"><div><div class="v">' + G.brlInt(hon) + '</div><small>honorário previsto (soma dos contratos)</small></div><div><div class="v">' + G.brl(tot) + '</div><small>valor exato somado</small></div></div></div>';
      }
      return hero + '<div class="gs-g21">' + timeline(D, m, 'todos') + contratos(D, m, 'todos') + '</div>';
    }
    // documentos
    var q = encodeURIComponent(m.ibge);
    return '<div class="gs-g2"><div class="gs-card irrf"><h3>Notas analisadas</h3><p class="gs-s">Evidência do IRRF retido na fonte, nota a nota.</p><a class="gov-link" href="/gov-notas.html?ibge=' + q + '">Ver notas ›</a></div><div class="gs-card prev"><h3>Documentos previdenciários</h3><p class="gs-s">Evidência das competências e inconsistências.</p><a class="gov-link" href="/gov-documentos.html?ibge=' + q + '">Ver documentos ›</a></div></div>';
  }

  // ---------- ficha ----------
  function ficha(D, m, ibge) {
    var ambos = m.irrf && m.prev, aba = m.irrf ? 'irrf' : (m.prev ? 'prev' : 'documentos');
    var abas = [['irrf', 'IRRF · fiscal'], ['prev', 'Previdenciário · social']];
    if (ambos) abas.push(['consolidado', 'Consolidado']);
    abas.push(['documentos', 'Documentos']);
    var meta = ['IBGE <span class="mono">' + esc(ibge) + '</span>']; if (cnpj(m.cnpj)) meta.unshift('CNPJ <span class="mono">' + esc(cnpj(m.cnpj)) + '</span>');
    app.innerHTML =
      '<section class="gov-card"><div class="gm-cab"><div><h2>' + esc(nomeMun(m, ibge)) + '</h2><p class="meta">' + meta.join(' · ') + '</p><div class="gm-chips">' + chips(m) + '</div></div><a class="gov-link" href="/gov-municipio.html">Trocar município</a></div></section>' +
      '<div class="gs-g2 gm-sec">' + bloco(D, m, 'irrf') + bloco(D, m, 'prev') + '</div>' +
      '<div class="gm-tabs-wrap"><div class="gs-tabs" role="group" aria-label="Detalhe por tributo">' + abas.map(function (a) { return '<button type="button" data-aba="' + a[0] + '" aria-pressed="false">' + a[1] + '</button>'; }).join('') + '</div><div id="ficha-painel"></div></div>';
    function mostrar(a) {
      aba = a; app.querySelectorAll('[data-aba]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-aba') === a ? 'true' : 'false'); });
      document.getElementById('ficha-painel').innerHTML = painel(D, m, a);
    }
    app.querySelector('.gs-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-aba]'); if (b) mostrar(b.getAttribute('data-aba')); });
    mostrar(aba);
  }

  G.carregar().then(function (D) {
    var ibge = qs('ibge');
    if (!ibge) return escolher(D);
    var m = D.municipios.filter(function (x) { return String(x.ibge) === ibge; })[0];
    if (!m) { app.innerHTML = '<section class="gov-card">' + G.vazio('Município não encontrado em carteira', 'Nenhum caso cadastrado para o código IBGE ' + ibge + '.', '<a class="gov-link" href="/gov-municipio.html">Ver municípios em carteira</a>') + '</section>'; return; }
    ficha(D, m, ibge);
  }).catch(function (e) {
    app.innerHTML = '<section class="gov-card">' + G.vazio('Não foi possível carregar a ficha', (e && e.message) || 'Tente novamente em instantes.') + '</section>';
  });
})();
