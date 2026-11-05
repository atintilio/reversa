// Reversa Gov: camada de dados única para todas as telas (Demonstração e produção).
// - Demonstração (RV_GOV_DEMO): Tupaciguara/MG SIMULADO. IRRF R$ 2.000.000 e previdenciário R$ 1.800.000.
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
  G.ESTAGIOS = [{ id: 'identificado', nome: 'Identificado' }, { id: 'validado', nome: 'Validado' }, { id: 'compensacao', nome: 'Em compensação' }, { id: 'recuperado', nome: 'Recuperado' }];

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
      D.contratos = D.casos.map(function (c) {
        return { caso: c.numero, casoId: c.id, ibge: c.ibge, municipio: c.municipio, uf: c.uf, tributo: c.tributo, origem: c.origem, honorarioPct: c.honorarioPct, previsto: c.valor * c.honorarioPct, situacao: c.tributo === 'irrf' ? 'Vigente' : 'Em assinatura' };
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
    f.innerHTML = 'Ambiente simulado · Tupaciguara/MG · dados fictícios para demonstração · <a href="/gov.html?demo=0">Sair da demonstração</a>';
    document.body.appendChild(f);
  };
  document.addEventListener('DOMContentLoaded', G.rodapeDemo);

  // estado vazio padrão da produção
  G.vazio = function (titulo, texto, acaoHtml) {
    return '<div class="gov-empty gs-vazio"><strong>' + esc(titulo) + '</strong><span>' + esc(texto || '') + '</span>' + (acaoHtml || '') + '</div>';
  };
})();
