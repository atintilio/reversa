// Reversa Gov: camada de dados única para todas as telas (Demonstração e produção).
// - Demonstração (RV_GOV_DEMO): carteira SIMULADA de 17 municípios (MG, PR e GO); Tupaciguara/MG com detalhe documental (IRRF R$ 2.000.000 e previdenciário R$ 1.800.000). Estoque de créditos da carteira: R$ 12.110.000.
// - Produção: casos reais de /api/v1/gov/casos. Campos sem fonte real ficam null (as telas mostram "—" ou estado vazio).
// Todos os valores de resumo são em REAIS (número). Notas e documentos detalhados ficam em CENTAVOS (GovDemo / GovDemoPrev).
// Uso: GovDados.carregar().then(function (D) { ... })
(function () {
  'use strict';
  var RVx = window.RV || {};
  var G = window.GovDados = {};
  var DEMO = !!window.RV_GOV_DEMO;
  G.demo = DEMO;

  var ETAPAS = [
    { id: 'a_apresentar', nome: 'A apresentar' }, { id: 'apresentado', nome: 'Apresentado' }, { id: 'em_analise_municipio', nome: 'Em análise pelo município' },
    { id: 'validacao_tecnica', nome: 'Validação técnica' }, { id: 'proposta_contrato', nome: 'Proposta / contrato' }, { id: 'em_execucao', nome: 'Em execução' },
    { id: 'concluido', nome: 'Concluído' }, { id: 'perdido_pausado', nome: 'Perdido / pausado' }
  ];
  G.ETAPAS = ETAPAS;
  G.nomeEtapa = function (id) { var e = ETAPAS.filter(function (x) { return x.id === id; })[0]; return e ? e.nome : (id || '—'); };
  // estágio do crédito derivado da etapa do caso
  var ESTAGIO = { a_apresentar: 'identificado', apresentado: 'identificado', em_analise_municipio: 'identificado', validacao_tecnica: 'validado', proposta_contrato: 'validado', em_execucao: 'compensacao', concluido: 'recuperado', perdido_pausado: null };
  G.ESTAGIOS = [{ id: 'identificado', nome: 'Identificado' }, { id: 'validado', nome: 'Validado' }, { id: 'compensacao', nome: 'Em compensação' }, { id: 'recuperado', nome: 'Realizado' }];

  var esc = RVx.esc || function (s) { return String(s == null ? '' : s); };
  G.esc = esc;
  G.num = function (v) { var n = Number(v); return Number.isFinite(n) ? n : 0; };
  G.brl = function (v) { return v == null ? '—' : 'R$ ' + G.num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  G.brlInt = function (v) { return v == null ? '—' : 'R$ ' + Math.round(G.num(v)).toLocaleString('pt-BR'); };
  G.brlCurto = function (v) {
    if (v == null) return '—';
    var n = G.num(v), a = Math.abs(n);
    if (a >= 1e9) return 'R$ ' + (n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi';
    if (a >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
    if (a >= 1e3) return 'R$ ' + Math.round(n / 1e3).toLocaleString('pt-BR') + ' mil';
    return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  };
  G.milhoes = function (v) { return v == null ? '—' : (G.num(v) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  G.int = function (v) { return v == null ? '—' : G.num(v).toLocaleString('pt-BR'); };
  G.pct = function (v, casas) { return v == null ? '—' : (G.num(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 2 : casas, maximumFractionDigits: casas == null ? 2 : casas }) + '%'; };
  G.cent = function (c) { return G.brl(G.num(c) / 100); }; // centavos → "R$ 1.234,56"
  G.TRIB = { irrf: 'IRRF retido na fonte', prev: 'Previdenciário', consolidado: 'Consolidado' };
  G.chip = function (t) {
    return t === 'irrf' ? '<span class="gs-chip i">IRRF</span>' : t === 'prev' ? '<span class="gs-chip p">Prev.</span>' : '<span class="gs-chip a">IRRF + Prev.</span>';
  };
  G.etapaPill = function (id) { return '<span class="gov-etapa e-' + esc(id) + '">' + esc(G.nomeEtapa(id)) + '</span>'; };
  G.selo = function (cor) {
    var m = { verde: ['ok', 'Verde'], amarelo: ['warn', 'Amarelo'], vermelho: ['bad', 'Vermelho'] }[cor];
    return m ? '<span class="gov-badge ' + m[0] + ' gov-cor"><i aria-hidden="true"></i>' + m[1] + '</span>' : '<span class="gov-badge info">—</span>';
  };
  // balão "de onde vem este número" (acessível por teclado). t = {pct, conta, numerador, denominador, fonte}
  G.balao = function (valorHtml, t) {
    return '<span class="gs-tip" tabindex="0">' + valorHtml + '<span class="gs-tt" role="tooltip"><b>De onde vem este número</b>' +
      (t.conta ? '<span class="f">' + esc(t.conta) + '</span>' : '') +
      (t.numerador ? '<b>Numerador</b> – ' + esc(t.numerador) + '<br>' : '') + (t.denominador ? '<b>Denominador</b> – ' + esc(t.denominador) : '') +
      (t.fonte ? '<small>' + esc(t.fonte) + '</small>' : '') + '</span></span>';
  };

  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { erro(new Error('Falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ---------------- Demonstração ----------------
  var BASE_IRRF = 12254900, BASE_PREV = 43000000;
  // Carteira simulada: Tupaciguara/MG (com detalhe documental) + 16 municípios de MG, PR e GO (valores fictícios, só potencial e etapa).
  var CART = [
    ['3170206', 'Uberlândia', 'MG', 480000, 520000, 'em_execucao', 'validacao_tecnica'], ['3170107', 'Uberaba', 'MG', 410000, 450000, 'validacao_tecnica', 'proposta_contrato'],
    ['3103504', 'Araguari', 'MG', 190000, null, 'proposta_contrato', null], ['3134202', 'Ituiutaba', 'MG', 210000, 240000, 'em_analise_municipio', 'apresentado'],
    ['3148004', 'Patos de Minas', 'MG', 260000, 310000, 'apresentado', 'em_analise_municipio'], ['3143302', 'Monte Carmelo', 'MG', 150000, null, 'a_apresentar', null],
    ['4113700', 'Londrina', 'PR', 440000, 560000, 'em_execucao', 'em_execucao'], ['4115200', 'Maringá', 'PR', 390000, 480000, 'validacao_tecnica', 'validacao_tecnica'],
    ['4104808', 'Cascavel', 'PR', 340000, 400000, 'proposta_contrato', 'apresentado'], ['4119905', 'Ponta Grossa', 'PR', 300000, 370000, 'apresentado', 'proposta_contrato'],
    ['4118204', 'Paranaguá', 'PR', 250000, null, 'em_analise_municipio', null], ['4108304', 'Foz do Iguaçu', 'PR', 230000, null, 'a_apresentar', null],
    ['5201108', 'Anápolis', 'GO', 260000, 410000, 'validacao_tecnica', 'a_apresentar'], ['5218805', 'Rio Verde', 'GO', 330000, 380000, 'proposta_contrato', 'em_analise_municipio'],
    ['5205109', 'Catalão', 'GO', 120000, null, 'apresentado', null], ['5204508', 'Itumbiara', 'GO', 70000, 300000, 'a_apresentar', 'apresentado']
  ];
  function ampliarCarteira(D, tp) {
    var n = 2, datas = ['2026-08-21', '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'];
    CART.forEach(function (c, i) {
      var ibge = c[0], nome = c[1], uf = c[2];
      D.municipios.push({ ibge: ibge, nome: nome, uf: uf, cnpj: null, irrf: true, prev: c[4] != null, detalhe: false });
      function caso(trib, valor, etapa) {
        n++; D.casos.push({ id: 'demo-' + n, numero: 'RGV-2026-' + String(n).padStart(4, '0'), ibge: ibge, municipio: nome, uf: uf, tributo: trib, valor: valor, etapa: etapa, origem: i % 3 === 0 ? 'Direta' : 'ERP', honorarioPct: 0.20, criado: datas[(i + n) % datas.length], responsavel: i % 2 ? 'Equipe Reversa' : 'André Tintilio' });
      }
      var SH = [0.18, 0.19, 0.20, 0.21, 0.22];
      function porAnoDe(pot) { var tot = 0; var a = SH.map(function (x, k) { var v = Math.round(pot * x / 1000) * 1000; tot += v; return { ano: 2021 + k, potencial: v }; }); a[4].potencial += pot - tot; return a; }
      var si = c[3] / 2000000, nN = Math.round(1800 * si), baseI = Math.round(c[3] / 0.1632 / 1000) * 1000;
      caso('irrf', c[3], c[5]); D.irrf.municipios.push({ ibge: ibge, nome: nome, uf: uf, notas: nN, comDiferenca: Math.round(nN * 0.29), potencial: c[3], base: baseI, retido: baseI, devido: baseI + c[3], porAno: porAnoDe(c[3]) });
      if (c[4] != null) {
        var sp = c[4] / 1800000, CRP = [0, 14, 27, 0, 52, 9];
        caso('prev', c[4], c[6]); D.prev.municipios.push({ ibge: ibge, nome: nome, uf: uf, competencias: 65, inconsistencias: Math.round(214 * sp), potencial: c[4], passivo: Math.round(c[4] * 0.1889 / 1000) * 1000, base: Math.round(c[4] / 0.0419 / 1000) * 1000, crpVencidoDias: CRP[i % 6], porAno: porAnoDe(c[4]) });
      }
    });
    // totais da carteira (17 municípios): IRRF 6.430.000 + Previdenciário 6.220.000. Estoque de créditos (não recuperado) = R$ 12.110.000.
    D.carteira = {
      municipios: D.municipios.length,
      irrf: { potencial: 6430000, base: 40000000, pct: 6430000 / 40000000, porAno: [1150000, 1220000, 1270000, 1340000, 1450000].map(function (v, k) { return { ano: 2021 + k, potencial: v }; }) },
      prev: { potencial: 6220000, base: 150000000, pct: 6220000 / 150000000, porAno: [1100000, 1190000, 1250000, 1310000, 1370000].map(function (v, k) { return { ano: 2021 + k, potencial: v }; }) }
    };
    D.estoque = {
      irrf: { identificado: 3100000, validado: 1860000, compensacao: 1200000, recuperado: 270000 },
      prev: { identificado: 3050000, validado: 1750000, compensacao: 1150000, recuperado: 270000 }
    };
    D.alertas = [
      { texto: 'CRP vencido há 38 dias · Tupaciguara/MG', nivel: 'critico' },
      { texto: 'Exercício 2021 prescreve em 112 dias · Tupaciguara/MG', nivel: 'atencao' },
      { texto: 'Contrato aguardando assinatura há 9 dias · Londrina/PR', nivel: 'atencao' },
      { texto: tp.inconsistencias + ' inconsistências sem prova anexada · Tupaciguara/MG', nivel: 'atencao' }
    ];
  }

  G.cart = CART;
  // notas e documentos de outro município: o gerador determinístico usa a escala do potencial do município
  (function () {
    try {
      var ib = new URLSearchParams(location.search).get('ibge');
      if (!ib || ib === '3169604' || !/gov-(notas|documentos)\.html/.test(location.pathname)) return;
      var c = CART.filter(function (x) { return x[0] === ib; })[0]; if (!c) return;
      var ativo = c[4] != null ? c[4] : Math.round(c[3] * 0.5);
      window.GovDemoCfg = { ibge: ib, nome: c[1] + '/' + c[2], temPrev: c[4] != null, seed: 20260611 + Number(ib.slice(-5)), alvoIrrf: c[3] * 100, alvoAtivo: ativo * 100, alvoPassivo: Math.round(ativo * 0.1889 / 1000) * 100000 };
    } catch (e) { /* sem cfg: Tupaciguara */ }
  })();
  // seletor de município nas telas de notas e documentos (demonstração)
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var pg = /gov-(notas|documentos)\.html/.exec(location.pathname), sub = document.getElementById('cab-sub');
      if (!pg || !sub || !window.RV_GOV_DEMO) return;
      var atual = new URLSearchParams(location.search).get('ibge') || '3169604';
      var opts = [['3169604', 'Tupaciguara/MG', true]].concat(CART.map(function (c) { return [c[0], c[1] + '/' + c[2], pg[1] === 'notas' || c[4] != null]; }));
      var w = document.createElement('p'); w.className = 'sub'; w.style.margin = '8px 0 0';
      w.innerHTML = '<label>Município: <select id="sel-mun-demo" style="font:inherit;padding:4px 8px">' + opts.filter(function (o) { return o[2]; }).map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === atual ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
      sub.parentNode.insertBefore(w, sub.nextSibling);
      w.querySelector('select').addEventListener('change', function (e) { location.href = location.pathname + '?demo=1&ibge=' + e.target.value; });
    } catch (e) { /* sem seletor */ }
  });
  function montarDemo() {
    return Promise.all([carregarScript('/gov-demo-dados.js'), carregarScript('/gov-demo-prev.js')]).then(function () {
      var GD = window.GovDemo, GP = window.GovDemoPrev;
      var ti = GD.totais(), tp = GP.totais(), anos = GD.ANOS;
      var irrfPot = ti.diferenca / 100, prevPot = tp.ativo / 100, prevPas = tp.passivo / 100;
      var cores = {}; GD.porCor().forEach(function (c) { cores[c.cor] = c.diferenca / 100; });
      var porNat = {}; GD.notas.forEach(function (n) { if (n.diferenca > 0) porNat[n.natureza] = (porNat[n.natureza] || 0) + n.diferenca / 100; });
      var porAnoI = GD.porAno(), porAnoP = GP.porAno();
      var prevAnoRecDesp = [[8.1, 8.4], [8.4, 8.9], [8.6, 9.3], [8.9, 9.8], [9.2, 10.2]];
      var D = {
        modo: 'demo',
        municipios: [{ ibge: '3169604', nome: 'Tupaciguara', uf: 'MG', cnpj: '18260489000104', irrf: true, prev: true }],
        casos: [
          { id: 'demo-1', numero: 'RGV-2026-0001', ibge: '3169604', municipio: 'Tupaciguara', uf: 'MG', tributo: 'irrf', valor: irrfPot, etapa: 'em_execucao', origem: 'ERP', honorarioPct: 0.20, criado: '2026-08-14', responsavel: 'André Tintilio' },
          { id: 'demo-2', numero: 'RGV-2026-0002', ibge: '3169604', municipio: 'Tupaciguara', uf: 'MG', tributo: 'prev', valor: prevPot, etapa: 'validacao_tecnica', origem: 'ERP', honorarioPct: 0.20, criado: '2026-10-27', responsavel: 'André Tintilio' }
        ],
        irrf: {
          potencial: irrfPot, base: BASE_IRRF, pct: irrfPot / BASE_IRRF, notas: ti.n, comDiferenca: ti.comDiferenca, devido: ti.devido / 100, retido: ti.retido / 100,
          verde: cores.verde || 0, amarelo: cores.amarelo || 0, vermelho: cores.vermelho || 0, temDetalhe: true,
          porAno: porAnoI.map(function (a) { return { ano: a.ano, devido: a.devido / 100, retido: a.retido / 100, potencial: a.diferenca / 100 }; }),
          porNatureza: Object.keys(porNat).map(function (k) { return { nome: k, valor: porNat[k] }; }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 6),
          municipios: [{ ibge: '3169604', nome: 'Tupaciguara', uf: 'MG', notas: ti.n, comDiferenca: ti.comDiferenca, potencial: irrfPot }]
        },
        prev: {
          potencial: prevPot, passivo: prevPas, base: BASE_PREV, pct: prevPot / BASE_PREV, inconsistencias: tp.inconsistencias, competencias: tp.competencias,
          competenciasComInconsistencia: tp.competenciasComInconsistencia, temDetalhe: true, score: 46, crpVencidoDias: 38, resultado: -4200000,
          porAno: porAnoP.map(function (a, i) { return { ano: a.ano, potencial: a.ativo / 100, passivo: a.passivo / 100, receita: prevAnoRecDesp[i][0] * 1e6, despesa: prevAnoRecDesp[i][1] * 1e6 }; }),
          porOrigem: GP.porOrigem().map(function (o) { return { nome: o.nome, valor: o.valor / 100 }; }),
          municipios: [{ ibge: '3169604', nome: 'Tupaciguara', uf: 'MG', competencias: tp.competencias, potencial: prevPot, passivo: prevPas }]
        },
        estoque: {
          irrf: { identificado: 1000000, validado: 600000, compensacao: 300000, recuperado: 100000 },
          prev: { identificado: 900000, validado: 500000, compensacao: 300000, recuperado: 100000 }
        },
        alertas: [
          { texto: 'CRP vencido há 38 dias', nivel: 'critico' },
          { texto: 'Exercício 2021 prescreve em 112 dias', nivel: 'atencao' },
          { texto: tp.inconsistencias + ' inconsistências sem prova anexada', nivel: 'atencao' }
        ]
      };
      ampliarCarteira(D, tp);
      D.contratos = D.casos.filter(function (c) { return c.ibge === '3169604' || c.etapa === 'proposta_contrato' || c.etapa === 'em_execucao' || c.etapa === 'concluido'; }).map(function (c) {
        return { caso: c.numero, casoId: c.id, ibge: c.ibge, municipio: c.municipio, uf: c.uf, tributo: c.tributo, origem: c.origem, honorarioPct: c.honorarioPct, previsto: c.valor * c.honorarioPct, situacao: c.etapa === 'em_execucao' ? 'Vigente' : 'Em assinatura' };
      });
      return D;
    });
  }

  // ---------------- Produção ----------------
  function tributoDoTipo(t) { return t === 'fiscal' ? 'irrf' : t === 'previdenciario' ? 'prev' : 'consolidado'; }
  function montarReal() {
    var api = RVx.api ? RVx.api('GET', '/api/v1/gov/casos') : Promise.resolve({ casos: [] });
    return api.then(function (d) {
      var lista = Array.isArray(d) ? d : (d && (d.casos || d.items)) || [];
      var casos = lista.map(function (c) {
        return { id: c.id, numero: c.numero, ibge: String(c.ibge || c.ibge_code || ''), municipio: c.municipio || null, uf: c.uf || null, tributo: tributoDoTipo(c.tipo), valor: c.valorEstimado == null ? (c.valor_estimado == null ? null : G.num(c.valor_estimado)) : G.num(c.valorEstimado),
          etapa: c.etapa, origem: null, honorarioPct: null, criado: c.createdAt || c.created_at || null, responsavel: c.responsavelNome || null };
      });
      function soma(f) { var t = 0, achou = false; casos.filter(f).forEach(function (c) { if (c.valor != null) { t += c.valor; achou = true; } }); return achou ? t : null; }
      var mapa = {};
      casos.forEach(function (c) {
        var m = mapa[c.ibge] || (mapa[c.ibge] = { ibge: c.ibge, nome: c.municipio, uf: c.uf, cnpj: null, irrf: false, prev: false });
        if (c.tributo === 'irrf' || c.tributo === 'consolidado') m.irrf = true;
        if (c.tributo === 'prev' || c.tributo === 'consolidado') m.prev = true;
      });
      var ci = casos.filter(function (c) { return c.tributo === 'irrf'; }), cp = casos.filter(function (c) { return c.tributo === 'prev'; });
      function estoque(lista) {
        var e = { identificado: 0, validado: 0, compensacao: 0, recuperado: 0 };
        lista.forEach(function (c) { var s = ESTAGIO[c.etapa]; if (s && c.valor != null) e[s] += c.valor; });
        return e;
      }
      var D = {
        modo: 'real', municipios: Object.keys(mapa).map(function (k) { return mapa[k]; }), casos: casos,
        irrf: { potencial: soma(function (c) { return c.tributo === 'irrf'; }), base: null, pct: null, notas: null, comDiferenca: null, devido: null, retido: null, verde: null, amarelo: null, vermelho: null, temDetalhe: false, porAno: [], porNatureza: [],
          municipios: ci.map(function (c) { return { ibge: c.ibge, nome: c.municipio, uf: c.uf, notas: null, comDiferenca: null, potencial: c.valor }; }) },
        prev: { potencial: soma(function (c) { return c.tributo === 'prev'; }), passivo: null, base: null, pct: null, inconsistencias: null, competencias: null, competenciasComInconsistencia: null, temDetalhe: false, score: null, crpVencidoDias: null, resultado: null, porAno: [], porOrigem: [],
          municipios: cp.map(function (c) { return { ibge: c.ibge, nome: c.municipio, uf: c.uf, competencias: null, potencial: c.valor, passivo: null }; }) },
        consolidado: soma(function (c) { return c.tributo === 'consolidado'; }),
        estoque: { irrf: estoque(ci), prev: estoque(cp), consolidado: estoque(casos.filter(function (c) { return c.tributo === 'consolidado'; })) },
        alertas: []
      };
      D.contratos = casos.filter(function (c) { return c.etapa === 'proposta_contrato' || c.etapa === 'em_execucao' || c.etapa === 'concluido'; }).map(function (c) {
        return { caso: c.numero, casoId: c.id, ibge: c.ibge, municipio: c.municipio, uf: c.uf, tributo: c.tributo, origem: c.origem, honorarioPct: null, previsto: null, situacao: G.nomeEtapa(c.etapa) };
      });
      return D;
    });
  }

  var cache = null;
  G.carregar = function () { if (!cache) cache = (DEMO ? montarDemo() : montarReal()); return cache; };
  // soma do estágio (para blocos de estoque)
  G.totalEstoque = function (e) { return e ? e.identificado + e.validado + e.compensacao + e.recuperado : 0; };
  G.etapasDoTributo = function (D, tributo) { return D.casos.filter(function (c) { return tributo === 'todos' || c.tributo === tributo; }); };

  // rodapé discreto da Demonstração (não vai no topo)
  G.rodapeDemo = function () {
    if (!DEMO || document.getElementById('gov-rodape-demo')) return;
    var f = document.createElement('footer'); f.id = 'gov-rodape-demo'; f.className = 'gov-simula';
    f.innerHTML = 'Ambiente simulado · carteira de 17 municípios (MG, PR e GO) · dados fictícios para demonstração · <a href="/gov.html?demo=0">Sair da demonstração</a>';
    document.body.appendChild(f);
  };
  document.addEventListener('DOMContentLoaded', G.rodapeDemo);

  // aviso da demonstração nas telas de acompanhamento: indicadores documentais são de Tupaciguara/MG; funil e municípios são da carteira
  G.notaDetalhe = function (D) {
    return DEMO && D && D.carteira ? '<p class="gs-s" style="margin:0 0 12px">Indicadores de nota e competência: município em análise documental (Tupaciguara/MG, simulado). Funil, recuperado e lista de municípios: carteira de ' + D.carteira.municipios + ' municípios.</p>' : '';
  };

  // estado vazio padrão da produção
  G.vazio = function (titulo, texto, acaoHtml) {
    return '<div class="gov-empty gs-vazio"><strong>' + esc(titulo) + '</strong><span>' + esc(texto || '') + '</span>' + (acaoHtml || '') + '</div>';
  };
})();
