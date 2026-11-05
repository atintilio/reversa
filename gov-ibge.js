// Reversa Gov: perfil do município (IBGE) e leitura de inteligência para recuperação de créditos.
// Fonte dos números: IBGE, Censo Demográfico 2022 (população, área, densidade); PIB dos Municípios 2021 (PIB per capita); IDHM 2010 (Atlas do Desenvolvimento Humano / PNUD).
// Valores conferidos em site que reproduz os números do IBGE; confirmar no IBGE Cidades antes de uso externo.
(function () {
  'use strict';
  // ibge: [população 2022, área km², densidade hab/km², PIB per capita 2021 (R$), IDHM 2010]
  var DADOS = {
    '3169604': [25470, 1822.530, 13.98, 37169.53, 0.719],
    '3170206': [713224, 4115.206, 173.31, 61038.02, 0.789],
    '3170107': [337836, 4523.957, 74.68, 59943.87, 0.772],
    '3103504': [117808, 2729.777, 43.16, 49322.18, 0.773],
    '3134202': [102217, 2598.046, 39.34, 35891.17, 0.739],
    '3148004': [159235, 3190.456, 49.91, 39738.04, 0.765],
    '3143302': [47692, 1343.035, 35.51, 32440.12, 0.728],
    '4113700': [555965, 1652.569, 336.42, 40636.89, 0.778],
    '4115200': [409657, 487.012, 841.16, 51908.79, 0.808],
    '4104808': [348051, 2091.199, 166.44, 46976.49, 0.782],
    '4119905': [358371, 2054.732, 174.41, 54316.58, 0.763],
    '4118204': [145829, 822.838, 177.23, 86717.02, 0.750],
    '4108304': [285415, 609.192, 468.51, 73534.49, 0.751],
    '5201108': [398869, 935.672, 426.29, 44860.34, 0.737],
    '5218805': [225696, 8374.255, 26.95, 65948.14, 0.754],
    '5205109': [114427, 3826.370, 29.90, 87685.74, 0.766],
    '5204508': [107970, 2447.014, 44.12, 49832.28, 0.752]
  };
  var G = window.GovDados, esc = G.esc;
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function n(v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function porte(p) { return p <= 50000 ? 'Pequeno (até 50 mil hab.)' : p <= 100000 ? 'Médio (50 a 100 mil hab.)' : p <= 900000 ? 'Grande (100 a 900 mil hab.)' : 'Metrópole (acima de 900 mil hab.)'; }
  function mediana(a) { var s = a.slice().sort(function (x, y) { return x - y; }), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
  function soma(lista, ibge) { var t = 0; (lista || []).forEach(function (x) { if (String(x.ibge) === String(ibge) && x.potencial != null) t += G.num(x.potencial); }); return t; }

  function perfil(D, m) {
    var d = DADOS[String(m.ibge)]; if (!d) return '';
    var pop = d[0], pI = soma(D.irrf.municipios, m.ibge), pP = m.prev ? soma(D.prev.municipios, m.ibge) : 0, tot = pI + pP;
    // referência: carteira com dados do IBGE
    var ref = D.municipios.filter(function (x) { return DADOS[String(x.ibge)]; }).map(function (x) {
      var dd = DADOS[String(x.ibge)], t = soma(D.irrf.municipios, x.ibge) + (x.prev ? soma(D.prev.municipios, x.ibge) : 0);
      return { ibge: String(x.ibge), pop: dd[0], pc: t / dd[0], pib: dd[3] };
    });
    var medPc = mediana(ref.map(function (r) { return r.pc; })), medPib = mediana(ref.map(function (r) { return r.pib; }));
    var pc = tot / pop, ordem = ref.slice().sort(function (a, b) { return b.pc - a.pc; }).map(function (r) { return r.ibge; }).indexOf(String(m.ibge)) + 1;
    var terco = ref.length / 3, prio = ordem <= terco ? ['Alta', '#1A7F4B'] : ordem <= 2 * terco ? ['Média', '#C58A12'] : ['Baixa', '#5B6B7C'];
    var pcRel = pc / medPc;
    var hoje = new Date(), lim = new Date(hoje.getFullYear() - 5, hoje.getMonth(), 1), perda = tot / 60;
    var posPop = ref.slice().sort(function (a, b) { return b.pop - a.pop; }).map(function (r) { return r.ibge; }).indexOf(String(m.ibge)) + 1;

    var kpis = [
      ['População (Censo 2022)', n(pop), posPop + 'º maior da carteira'],
      ['Porte', porte(pop).split(' (')[0], porte(pop).split('(')[1].replace(')', '')],
      ['Área e densidade', n(d[1], 0) + ' km²', n(d[2], 1) + ' hab/km²'],
      ['PIB per capita (2021)', 'R$ ' + n(d[3], 0), d[3] >= medPib ? 'acima da mediana da carteira' : 'abaixo da mediana da carteira'],
      ['IDHM (2010)', n(d[4], 3), d[4] >= 0.8 ? 'muito alto' : d[4] >= 0.7 ? 'alto' : 'médio']
    ].map(function (k) { return '<div><div class="v">' + esc(k[1]) + '</div><small>' + esc(k[0]) + '</small><small class="s2">' + esc(k[2]) + '</small></div>'; }).join('');

    var leitura = [];
    leitura.push('<li><b>Prioridade sugerida: <span style="color:' + prio[1] + '">' + prio[0] + '</span>.</b> O potencial total por habitante é de ' + esc(G.brl(pc)) + ', ' + (pcRel >= 1 ? n((pcRel - 1) * 100, 0) + '% acima' : n((1 - pcRel) * 100, 0) + '% abaixo') + ' da mediana da carteira (' + esc(G.brl(medPc)) + '). Ocupa a ' + ordem + 'ª posição entre ' + ref.length + ' municípios. Critério: retorno relativo ao porte, para ordenar o esforço técnico.</li>');
    leitura.push('<li><b>Fiscal (IRRF): ' + esc(G.brl(pI / pop)) + ' por habitante.</b> O IRRF retido pelo município é receita própria (CF, art. 158, I). ' + (d[3] >= medPib ? 'A economia local está acima da mediana da carteira, o que sugere uma base mais ampla de fornecedores de serviços; é uma hipótese a confirmar nas notas.' : 'A economia local está abaixo da mediana da carteira; a base de fornecedores tende a ser menor, o que pede conferir se o volume de notas sustenta o potencial.') + '</li>');
    leitura.push(m.prev
      ? '<li><b>Previdenciário: ' + esc(G.brl(pP / pop)) + ' por habitante.</b> O diagnóstico considera só o RGPS. Confirmar se o município tem regime próprio (RPPS) e quem é segurado do RGPS (celetistas, temporários, comissionados sem vínculo efetivo e contribuintes individuais), porque a parte do RPPS fica fora.</li>'
      : '<li><b>Previdenciário: não contratado.</b> Oportunidade de ampliar o escopo. Antes, confirmar se o município tem RPPS e quem é segurado do RGPS, porque a parte do RPPS fica fora.</li>');
    leitura.push('<li><b>Janela de prescrição.</b> Em regra, o prazo para pedir a restituição é de 5 anos (CTN, art. 168). Hoje, competências anteriores a ' + MESES[lim.getMonth()] + '/' + lim.getFullYear() + ' já estão fora. Cada mês sem protocolar reduz o potencial em cerca de ' + esc(G.brl(perda)) + ' (potencial ÷ 60 meses, estimativa linear; o prazo exato depende da data de cada pagamento e de marcos interruptivos).</li>');

    return '<section class="gov-card gm-perfil gm-sec" aria-labelledby="t-perfil"><div class="vis-cab"><div><h3 id="t-perfil" style="margin:0">Perfil e leitura para recuperação</h3><div class="gs-s">Dados do IBGE e inteligência sobre o potencial deste município</div></div><span class="gov-badge info">IBGE</span></div>' +
      '<div class="gm-perfil-kpis">' + kpis + '</div>' +
      '<h4 class="gm-perfil-h">O que isso indica</h4><ul class="gm-perfil-lista">' + leitura.join('') + '</ul>' +
      '<p class="gs-s gm-perfil-fonte">Fontes: IBGE, Censo Demográfico 2022 (população, área e densidade); PIB dos Municípios 2021; IDHM 2010. Valores de potencial, prioridade e prescrição são estimativas do Reversa Gov, sujeitas à evidência documental e à revisão jurídica.</p></section>';
  }
  window.GovIBGE = { dados: DADOS, perfil: perfil };
})();
