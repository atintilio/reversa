// Reversa Gov · Relatórios do ambiente simulado (fiscal IRRF, previdenciário e consolidado) para qualquer município da carteira.
// Gera no navegador, a partir dos mesmos dados da tela (GovDados). Abre o relatório em nova aba, pronto para salvar em PDF.
(function () {
  'use strict';
  if (!window.GovDados) return;
  var G = window.GovDados, esc = G.esc;
  var TIT = { irrf: 'Relatório fiscal · IRRF retido na fonte', prev: 'Relatório previdenciário', consolidado: 'Relatório consolidado · IRRF + Previdenciário' };
  var COR = { irrf: '#2A5B93', prev: '#1E9488' };

  function soma(lista, ibge) { var t = null; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t = (t || 0) + G.num(x.potencial); }); return t; }
  function nome(m) { return m.nome ? m.nome + (m.uf ? '/' + m.uf : '') : 'IBGE ' + m.ibge; }
  function numeros(D, m, tipo) {
    var cs = D.casos.filter(function (c) { return String(c.ibge) === String(m.ibge) && (tipo === 'consolidado' || c.tributo === tipo); });
    return cs.length ? cs.map(function (c) { return c.numero; }).join(' · ') : 'sem caso aberto';
  }
  function hoje() { return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }

  function porAno(D, t, m, pot) {
    var X = D[t], anos = (X.porAno || []);
    if (!anos.length || pot == null) return null;
    if (m.detalhe !== false) return { exato: true, linhas: anos.map(function (a) { return [a.ano, G.num(a.potencial)]; }) };
    var tot = anos.reduce(function (s, a) { return s + G.num(a.potencial); }, 0) || 1;
    var acum = 0;
    return { exato: false, linhas: anos.map(function (a, i) { var v = i === anos.length - 1 ? pot - acum : Math.round(pot * G.num(a.potencial) / tot); acum += v; return [a.ano, v]; }) };
  }

  function secao(D, m, t) {
    var X = D[t], cor = COR[t], fisc = t === 'irrf', nm = fisc ? 'IRRF retido na fonte (fiscal)' : 'Previdenciário (social)';
    if (!m[t]) return '<section><h2 style="border-color:' + cor + '">' + nm + '</h2><p class="mut">Este município não contratou este tributo.</p></section>';
    var pot = soma(X.municipios, m.ibge), det = m.detalhe !== false;
    var h = '<section><h2 style="border-color:' + cor + '">' + nm + '</h2>';
    h += '<div class="kpis"><div><b style="color:' + cor + '">' + esc(G.brl(pot)) + '</b><small>' + (fisc ? 'potencial de incremento de receita' : 'potencial de recuperação') + '</small></div>';
    if (det && X.pct != null) h += '<div><b>' + esc(G.pct(X.pct)) + '</b><small>sobre ' + esc(G.brlInt(X.base)) + ' (' + (fisc ? 'IRRF retido no período' : 'contribuições do período') + ')</small></div>';
    if (det) {
      var k = fisc ? [[G.int(X.notas), 'notas analisadas'], [G.int(X.comDiferenca), 'notas com diferença']] : [[G.int(X.competencias), 'competências'], [G.int(X.inconsistencias), 'inconsistências']];
      k.forEach(function (x) { h += '<div><b>' + esc(x[0]) + '</b><small>' + x[1] + '</small></div>'; });
    }
    h += '</div>';
    var a = porAno(D, t, m, pot);
    if (a) {
      h += '<table><thead><tr><th>Ano</th><th class="n">Potencial</th></tr></thead><tbody>' + a.linhas.map(function (l) { return '<tr><td>' + l[0] + '</td><td class="n">' + esc(G.brl(l[1])) + '</td></tr>'; }).join('') + '</tbody></table>';
      if (!a.exato) h += '<p class="mut">Distribuição por ano simulada, proporcional à carteira. O detalhe documental deste município não está aberto na demonstração.</p>';
    }
    var cs = D.casos.filter(function (c) { return String(c.ibge) === String(m.ibge) && c.tributo === t; });
    if (cs.length) h += '<h3>Casos</h3><table><thead><tr><th>Caso</th><th>Etapa</th><th class="n">Potencial</th></tr></thead><tbody>' + cs.map(function (c) { return '<tr><td>' + esc(c.numero || '—') + '</td><td>' + esc(G.nomeEtapa(c.etapa)) + '</td><td class="n">' + esc(G.brlInt(c.valor)) + '</td></tr>'; }).join('') + '</tbody></table>';
    var ct = (D.contratos || []).filter(function (c) { return String(c.ibge) === String(m.ibge) && c.tributo === t; });
    if (ct.length) h += '<h3>Contrato</h3><table><tbody>' + ct.map(function (c) { return '<tr><td>' + esc([c.caso, c.situacao].filter(Boolean).join(' · ')) + '</td><td>' + (c.honorarioPct == null ? '—' : esc(G.pct(c.honorarioPct, 0)) + ' do êxito') + '</td><td class="n">' + esc(G.brlInt(c.previsto)) + ' (honorário previsto)</td></tr>'; }).join('') + '</tbody></table>';
    h += '<p class="mut">' + (fisc ? 'Método: IRRF de fornecedores não retido ou não reconhecido, apurado nota a nota. Fonte do denominador: Siconfi/DCA.' : 'Método: compensações e ajustes previdenciários nas competências analisadas. Fonte do denominador: Siconfi/DCA e folha.') + '</p></section>';
    return h;
  }

  function secaoNum(n, t) { return '<h2 class="sc"><span>' + n + '</span>' + t + '</h2>'; }
  function html(D, m, tipo) {
    var P = window.GovPrevMotor, temPrev = !!(P && m.prev), fisc = tipo === 'irrf' || tipo === 'consolidado', prev = tipo === 'prev' || tipo === 'consolidado';
    var R = temPrev ? P.calcular(D, m) : null, pi = soma(D.irrf.municipios, m.ibge), pp = soma(D.prev.municipios, m.ibge);
    var titulo = tipo === 'irrf' ? 'Diagnóstico Fiscal (IRRF)' : tipo === 'prev' ? 'Diagnóstico Previdenciário' : 'Diagnóstico Consolidado';
    var escopo = tipo === 'consolidado' ? 'Fiscal (IRRF) e Previdenciário' : tipo === 'irrf' ? 'Fiscal (IRRF)' : 'Previdenciário';
    var n = 0, corpo = '';
    // capa (sem valores)
    var capa = '<section class="capa"><div class="mk"><img src="' + location.origin + '/assets/reversa-r.png" alt="" height="44"><div><b>REVERSA <span>GOV</span></b><small>uma solução Argus Prime</small></div></div>' +
      '<div class="cp"><p class="ey">DIAGNÓSTICO PRELIMINAR</p><h1>' + esc(titulo) + '</h1><i class="tr"></i><p class="mn">' + esc(nome(m)) + '</p><p class="mt">' + esc(numeros(D, m, tipo)) + '   ·   IBGE ' + esc(m.ibge) + '</p><p class="mt">Escopo: ' + escopo + '</p></div>' +
      '<div class="rp"><p>' + hoje() + '   ·   Preparado pelo time técnico Argus Prime</p><small>Documento confidencial, de uso exclusivo do destinatário. Diagnóstico preliminar: indica oportunidades a confirmar e não constitui reconhecimento de crédito. Ambiente de demonstração: valores simulados, sem relação com dados reais do município.</small></div></section>';
    // introdução
    corpo += '<section class="pg">' + secaoNum(++n, 'Introdução') +
      '<p>Este relatório apresenta onde as contribuições e retenções do município podem ter sido recolhidas além do devido, e o que ainda precisa ser comprovado antes de qualquer pedido. O Reversa Gov não estima por mercado: confronta o que foi pago, o que a lei manda incluir, o que foi declarado e o que foi recolhido, e mostra a origem de cada diferença.</p>' +
      '<p><b>Escopo.</b> ' + escopo + ', exercícios de 2021 a 2025 (cinco anos, limite de recuperação do CTN, art. 168).</p>' +
      '<p><b>Como ler.</b> Cada oportunidade traz a base legal, o precedente, o documento de prova e a classificação por grau de segurança jurídica. Os valores são potenciais a validar; a exposição do município (valores recolhidos a menor) aparece à parte e nunca soma ao potencial.</p>' +
      '<p><b>Fontes.</b> Folha de pagamento e eventos do eSocial, DCTFWeb e guias de recolhimento, Siconfi/DCA e notas de despesa, conforme o tributo.</p></section>';
    // critério de classificação
    var CLS = [['verde', 'Chance de êxito maior que a de perda. Há precedente vinculante favorável, dispensa de contestação pela PGFN ou previsão expressa em lei.', 'Recomendada'], ['amarelo', 'Chance real de êxito, mas o tema não está pacificado ou depende da prova de como a verba foi paga e documentada.', 'Recomendada, com análise da prova'], ['vermelho', 'Chance pequena de êxito: tema sem referência consolidada, decidido de forma desfavorável pelos tribunais superiores ou com vedação expressa na legislação.', 'Não deve ser pleiteada sem análise específica']];
    corpo += '<section class="pg">' + secaoNum(++n, 'Critério de classificação') +
      '<p>Cada oportunidade é classificada pela chance de êxito, no conceito de provisões, passivos contingentes e ativos contingentes (CPC 25, e NBC TSP 03 para o setor público). A classificação considera a legislação, a jurisprudência atual do STF e do STJ e a posição da Receita Federal e da PGFN.</p>' +
      '<table class="cls"><thead><tr><th>Classificação</th><th>Definição</th><th>Tratamento</th></tr></thead><tbody>' + CLS.map(function (c) { var k = ({ verde: ['Provável', '#1A7F4B'], amarelo: ['Possível', '#C58A12'], vermelho: ['Remoto', '#B3402F'] })[c[0]]; return '<tr><td><b style="color:' + k[1] + '">' + k[0] + '</b></td><td>' + c[1] + '</td><td>' + c[2] + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p>Pelo conceito de ativo contingente, o crédito só é reconhecido quando sua realização é praticamente certa: decorre diretamente da legislação ou está assegurado por decisão definitiva ou por habilitação perante a Receita Federal. Até lá, o valor é uma expectativa de recuperação.</p>' +
      '<p><b>De onde vem a classificação.</b> Provável: tese com precedente vinculante do STF ou do STJ, dispensa da PGFN ou previsão expressa em lei. Possível: tema ainda em disputa ou dependente de prova. Remoto: tese desfavorável, que é listada apenas para transparência e não entra em nenhum valor.</p>' +
      '<p class="mut"><b>Fontes consideradas.</b> Constituição Federal e Código Tributário Nacional; leis e regulamentos de cada tributo; precedentes vinculantes do STF (repercussão geral) e do STJ (recursos repetitivos e súmulas); soluções de consulta da Receita Federal; pareceres e atos declaratórios da PGFN.</p>' +
      '<p class="mut"><b>Natureza deste documento.</b> Diagnóstico preliminar. Os valores são estimativas, sujeitas à revisão técnica, à validação dos documentos de suporte e à atualização pela Selic.</p></section>';
    if (prev && temPrev) {
      corpo += '<section class="pg">' + secaoNum(++n, 'Metodologia: de onde vêm os valores') + P.metodologia(m, R) + '</section>';
      corpo += '<section class="pg">' + secaoNum(++n, 'Diagnóstico Previdenciário') +
        '<p>As oportunidades previdenciárias dependem da análise rubrica a rubrica da folha de pagamento. Os valores são estimativas preliminares e serão confirmados após a leitura do eSocial e da DCTFWeb e a validação dos documentos de suporte. Foram identificadas ' + R.linhas.length + ' oportunidades, com valor estimado de ' + esc(G.brl(R.pot)) + '.</p>' + P.oportunidades(R) +
        '<div class="kpis" style="margin-top:14px"><div><b>' + esc(G.brl(R.passivo)) + '</b><small>exposição do município (recolhido a menor), não soma ao potencial</small></div></div>' +
        '<h3>Potencial por ano</h3><table class="mt-orig" style="width:100%"><tbody>' + R.porAno.map(function (a) { return '<tr><td>' + a.ano + '</td><td class="n" style="text-align:right">' + esc(G.brl(a.v)) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    } else if (tipo === 'prev') corpo += '<section class="pg">' + secaoNum(++n, 'Diagnóstico Previdenciário') + secao(D, m, 'prev') + '</section>';
    if (fisc) corpo += '<section class="pg">' + secaoNum(++n, 'Diagnóstico Fiscal (IRRF)') + secao(D, m, 'irrf') + '</section>';
    if (tipo === 'consolidado') {
      var tot = (pi || 0) + (pp || 0);
      corpo += '<section class="pg">' + secaoNum(++n, 'Diagnóstico Consolidado') +
        '<div class="kpis"><div><b>' + esc(G.brl(tot)) + '</b><small>potencial total a validar</small></div><div><b style="color:' + COR.irrf + '">' + esc(G.brl(pi)) + '</b><small>IRRF (fiscal)</small></div><div><b style="color:' + COR.prev + '">' + esc(G.brl(pp)) + '</b><small>Previdenciário (social)</small></div></div>' +
        '<p>Os dois tributos são acompanhados separadamente: cada um é um caso e um contrato próprios. Um questionamento em uma frente não trava a outra.</p>' +
        '<h3>Próximos passos</h3><ol class="ps"><li><b>Validação documental.</b> Reunir eSocial (S-1200, S-1210, S-1010), DCTFWeb, guias, notas e empenhos das competências indicadas.</li><li><b>Revisão jurídica.</b> Confirmar, tese a tese, base legal e precedente; teses "Possível" só seguem com a prova.</li><li><b>Proposta e contrato.</b> Formalizar o escopo por tributo, com honorário de êxito.</li><li><b>Execução.</b> Retificação, compensação via DCTFWeb ou pedido de restituição, conforme cada caso.</li><li><b>Acompanhamento.</b> Etapa, prazo e resultado no CRM, com o rastro do valor até o documento de origem.</li></ol></section>';
    }
    if (prev && temPrev) {
      corpo += '<section class="pg">' + secaoNum(++n, 'Apuração: memória de cálculo') + '<p>Base estimada × alíquota = valor. A alíquota de 22% é exemplo (20% patronal + 2% de RAT); o RAT real depende do grau de risco do município.</p>' + P.memoria(R) + '<h3>Premissas e limites</h3>' + P.limites() + '</section>';
      corpo += '<section class="pg">' + secaoNum(++n, 'Anexo: teses encontradas') + P.tabelaTeses(R) + '</section>';
      if (window.GovRubricas) corpo += '<section class="pg">' + secaoNum(++n, 'Anexo: base jurídica das rubricas da folha') + '<p>' + esc(window.GovRubricas.AVISO) + '</p>' + window.GovRubricas.tabela() + '</section>';
    }
    var css = (P ? P.CSS : '') + (window.GovRubricas ? window.GovRubricas.CSS : '') + 'body{font:14px/1.55 Manrope,Arial,sans-serif;color:#1D2B27;margin:0;background:#EEF2F5}.doc{max-width:820px;margin:0 auto;background:#fff}section{padding:36px 44px}.capa{min-height:1060px;box-sizing:border-box;position:relative;border-bottom:6px solid #1E8F88;display:flex;flex-direction:column;justify-content:space-between}.mk{display:flex;gap:12px;align-items:center;justify-content:flex-end}.mk b{display:block;letter-spacing:.12em;font-size:15px}.mk b span{color:#1E8F88}.mk small{color:#5B6B7C}.cp{margin-top:180px}.ey{color:#A9864F;letter-spacing:.2em;font-size:11px;font-weight:700;margin:0}.capa h1{font:400 38px/1.15 "DM Serif Display",Georgia,serif;margin:14px 0 18px}.tr{display:block;width:40px;height:2px;background:#1E8F88;margin-bottom:22px}.mn{font-size:19px;font-weight:700;margin:0}.mt{color:#5B6B7C;margin:6px 0;font-size:13px}.rp{font-size:12px}.rp small{display:block;color:#5B6B7C;margin-top:8px;max-width:78%;line-height:1.6}h2.sc{font:700 18px "Open Sans",Arial,sans-serif;margin:0 0 14px;border-bottom:2px solid #0E2239;padding-bottom:8px}h2.sc span{color:#1E8F88;margin-right:10px}h2{font:700 16px "Open Sans",Arial,sans-serif;border-left:5px solid #0E2239;padding-left:10px;margin:22px 0 10px}h3{font-size:12px;margin:16px 0 6px;color:#5B6B7C;text-transform:uppercase;letter-spacing:.07em}p{margin:8px 0}.mut{color:#5B6B7C;font-size:12.5px}.cls{width:100%;border-collapse:collapse;margin:12px 0}.cls td,.cls th,td,th{padding:7px 8px;border-bottom:1px solid #E1E6EC;text-align:left;font-size:13px;vertical-align:top}.cls th{font-size:11px;color:#5B6B7C;letter-spacing:.06em;text-transform:uppercase}.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpis>div{flex:1 1 150px;background:#EEF2F5;padding:10px 14px}.kpis b{display:block;font-size:19px}.kpis small{color:#5B6B7C;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:8px}.n{text-align:right;font-variant-numeric:tabular-nums}.ps li{margin:8px 0}.dp-lim li{margin:6px 0;font-size:13px}.dp-t small,.mt-orig small{display:block;color:#5B6B7C;margin-top:2px}.dp-cl{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;white-space:nowrap}.dp-cl i{width:10px;height:10px;border-radius:50%;display:inline-block}button{position:fixed;right:20px;bottom:20px;box-shadow:0 4px 14px rgba(0,0,0,.25);background:#1E8F88;color:#fff;border:0;padding:10px 16px;font:600 13px Manrope,Arial,sans-serif;cursor:pointer;z-index:9}footer{padding:18px 44px;color:#5B6B7C;font-size:11px}@media print{button{display:none}body{background:#fff}section{page-break-before:always}.capa{page-break-before:auto;min-height:260mm}h3,h2{page-break-after:avoid}tr{page-break-inside:avoid}}';
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc('Relatório Reversa Gov · ' + numeros(D, m, tipo) + ' · ' + nome(m)) + '</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Open+Sans:wght@700&family=DM+Serif+Display&display=swap"><style>' + css + '</style></head><body><button onclick="window.print()">Salvar como PDF / imprimir</button><div class="doc">' + capa + corpo + '<footer>Relatório Reversa Gov · ' + esc(numeros(D, m, tipo)) + ' · ' + esc(nome(m)) + ' · IBGE ' + esc(m.ibge) + '. Reversa · uma solução Argus Prime. Todo valor é rastreável até o documento de origem; nesta demonstração, os documentos são simulados.</footer></div></body></html>';
  }

  window.GovRelatorio = {
    abrir: function (ibge, tipo) {
      var w = window.open('', '_blank');
      G.carregar().then(function (D) {
        window.GovDadosSemPrev = {}; D.municipios.forEach(function (x) { if (!x.prev) window.GovDadosSemPrev[String(x.ibge)] = 1; });
        var m = D.municipios.filter(function (x) { return String(x.ibge) === String(ibge); })[0];
        if (!m) { if (w) w.close(); return; }
        if (!m.prev && tipo === 'prev') { var av = '<!doctype html><meta charset="utf-8"><title>Sem diagnóstico previdenciário</title><body style="font:15px Manrope,Arial,sans-serif;padding:48px;color:#1D2B27"><h2>' + esc(nome(m)) + '</h2><p>Este município ainda não tem diagnóstico previdenciário na carteira. Gere o relatório fiscal (IRRF) ou o consolidado.</p></body>'; if (w) { w.document.open(); w.document.write(av); w.document.close(); } return; }
        var h = html(D, m, tipo);
        if (w) { w.document.open(); w.document.write(h); w.document.close(); }
        else { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([h], { type: 'text/html;charset=utf-8' })); a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); }
      });
    },
    botoes: function (ibge, pequeno) {
      var sem = (window.GovDadosSemPrev || {})[String(ibge)];
      return ['irrf:Fiscal', 'prev:Previdenciário', 'consolidado:Consolidado'].filter(function (s) { return !(sem && s.indexOf('prev:') === 0); }).map(function (s) {
        var p = s.split(':'); return '<button type="button" class="' + (pequeno ? 'mini ' : 'btn sec ') + 'rv-rel" data-rel="' + p[0] + '" data-ibge="' + esc(ibge) + '">' + (pequeno ? p[1] : 'Relatório ' + p[1].toLowerCase()) + '</button>';
      }).join(' ');
    }
  };
  try { G.carregar().then(function (D) { window.GovDadosSemPrev = {}; D.municipios.forEach(function (x) { if (!x.prev) window.GovDadosSemPrev[String(x.ibge)] = 1; }); }).catch(function () {}); } catch (e) {}
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.rv-rel'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); window.GovRelatorio.abrir(b.getAttribute('data-ibge'), b.getAttribute('data-rel'));
  }, true);
})();
