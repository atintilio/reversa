// Reversa Gov: documentos PREVIDENCIÁRIOS SIMULADOS para a Demonstração (Tupaciguara/MG como exemplo).
// Tudo fictício e determinístico (seed fixa). Valores em CENTAVOS. Expõe window.GovDemoPrev.
// 214 inconsistências em 65 competências (60 mensais + 5 de 13º): 180 "ativo recuperável" (soma R$ 1.800.000,00)
// e 34 "passivo" (soma R$ 340.000,00, exposição que NÃO soma ao potencial).
(function () {
  'use strict';

  var SEED = 20261105;
  var ALVO_ATIVO = 180000000; // R$ 1.800.000,00
  var ALVO_PASSIVO = 34000000; // R$ 340.000,00
  var N_ATIVO = 180, N_PASSIVO = 34;
  var ALIQ_PATRONAL = 0.22;
  var AVISO = 'DADOS SIMULADOS PARA DEMONSTRAÇÃO. Documentos, rubricas e valores são fictícios.';

  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = rng(SEED);
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function inteiro(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function digitos(w) { var s = ''; for (var i = 0; i < w; i++) s += Math.floor(R() * 10); return s; }

  // competências: 2021-01 … 2025-12 e o 13º de cada ano ("2021-13")
  var COMPETENCIAS = [];
  for (var a = 2021; a <= 2025; a++) { for (var m = 1; m <= 12; m++) COMPETENCIAS.push(a + '-' + pad(m, 2)); COMPETENCIAS.push(a + '-13'); }

  var TIPOS = {
    vt: { id: 'vt', origem: 'Verbas que não incidem', rubrica: 'Vale-transporte pago em dinheiro', evento: 'S-1200', resultado: 'ativo', cor: 'verde',
      inconsistencia: 'Contribuição patronal recolhida sobre verba que não integra a base de cálculo.',
      porque: 'Vale-transporte pago em pecúnia, sem natureza salarial: a contribuição recolhida sobre ele é indevida.',
      base: 'Entendimento do STF sobre o vale-transporte em dinheiro (RE 478.410). A validar pelo jurídico.',
      prova: 'XML do evento S-1200, folha analítica da competência e guia GPS/DCTFWeb.', peso: 36, aliq: true },
    indeniz: { id: 'indeniz', origem: 'Indenizações', rubrica: 'Indenização de férias não gozadas', evento: 'S-1200', resultado: 'ativo', cor: 'amarelo',
      inconsistencia: 'Contribuição recolhida sobre verba de natureza indenizatória.',
      porque: 'Verba indenizatória não integra o salário de contribuição, mas depende da prova da natureza do pagamento.',
      base: 'Art. 28, §9º, da Lei 8.212/1991. A validar pelo jurídico.',
      prova: 'XML do evento S-1200, ato de concessão da indenização e folha analítica.', peso: 28, aliq: true },
    dup: { id: 'dup', origem: 'Guias em duplicidade', rubrica: 'Guia GPS paga em duplicidade', evento: 'S-1210', resultado: 'ativo', cor: 'verde',
      inconsistencia: 'Mesma competência recolhida duas vezes.',
      porque: 'Duas guias quitadas para a mesma competência e a mesma base: o valor repetido é indébito.',
      base: 'Restituição de indébito (art. 165 do CTN). A validar pelo jurídico.',
      prova: 'Comprovantes das duas guias, DCTFWeb e extrato bancário.', peso: 22, aliq: false },
    outras: { id: 'outras', origem: 'Outras', rubrica: 'Rubrica sem incidência confirmada', evento: 'S-1200', resultado: 'ativo', cor: 'amarelo',
      inconsistencia: 'Rubrica classificada com incidência, mas sem confirmação no cadastro do município.',
      porque: 'A classificação da rubrica no cadastro (evento S-1010) diverge do tratamento dado na folha.',
      base: 'Classificação de rubricas no eSocial (S-1010). A validar pelo jurídico.',
      prova: 'XML dos eventos S-1010 e S-1200 e parecer do município.', peso: 14, aliq: true },
    menor: { id: 'menor', origem: 'Passivo', rubrica: 'Remuneração informada abaixo do pago', evento: 'S-1200', resultado: 'passivo', cor: null,
      inconsistencia: 'Base informada no eSocial menor que a paga na folha: contribuição recolhida a menor.',
      porque: 'Diferença entre a remuneração paga e a informada. É exposição do município, não crédito.',
      base: 'Art. 22 da Lei 8.212/1991. A validar pelo jurídico.',
      prova: 'XML do S-1200, folha analítica e guia da competência.', peso: 20, aliq: true },
    semgps: { id: 'semgps', origem: 'Passivo', rubrica: 'Competência sem guia correspondente', evento: 'S-1299', resultado: 'passivo', cor: null,
      inconsistencia: 'Evento de fechamento enviado sem GPS quitada para a competência.',
      porque: 'Há declaração sem o recolhimento correspondente. É exposição do município, não crédito.',
      base: 'Obrigação de recolhimento da contribuição (Lei 8.212/1991). A validar pelo jurídico.',
      prova: 'XML do S-1299, DCTFWeb e relação de guias pagas.', peso: 12, aliq: false }
  };
  var ATIVOS = ['vt', 'indeniz', 'dup', 'outras'], PASSIVOS = ['menor', 'semgps'];

  function sorteia(ids) {
    var tot = 0; ids.forEach(function (i) { tot += TIPOS[i].peso; });
    var x = R() * tot, acc = 0;
    for (var i = 0; i < ids.length; i++) { acc += TIPOS[ids[i]].peso; if (x < acc) return TIPOS[ids[i]]; }
    return TIPOS[ids[ids.length - 1]];
  }

  var docs = [];
  function cria(tipo) {
    var comp = COMPETENCIAS[inteiro(0, COMPETENCIAS.length - 1)];
    docs.push({ tipo: tipo, comp: comp, peso0: 0.3 + R() * R() * 3.7, ano: +comp.slice(0, 4) });
  }
  var i;
  for (i = 0; i < N_ATIVO; i++) cria(sorteia(ATIVOS));
  for (i = 0; i < N_PASSIVO; i++) cria(sorteia(PASSIVOS));
  docs.sort(function (x, y) { return x.comp < y.comp ? -1 : x.comp > y.comp ? 1 : 0; });

  // escala os valores para fechar exatamente os alvos (o resíduo vai para o maior item)
  function calibra(lista, alvo) {
    var soma = 0; lista.forEach(function (d) { soma += d.peso0; });
    var tot = 0, maior = null;
    lista.forEach(function (d) { d.valor = Math.max(10000, Math.round(d.peso0 / soma * alvo / 100) * 100); tot += d.valor; if (!maior || d.valor > maior.valor) maior = d; });
    maior.valor += alvo - tot;
  }
  calibra(docs.filter(function (d) { return d.tipo.resultado === 'ativo'; }), ALVO_ATIVO);
  calibra(docs.filter(function (d) { return d.tipo.resultado === 'passivo'; }), ALVO_PASSIVO);

  var contEvento = 0;
  var DOCS = docs.map(function (d, idx) {
    var t = d.tipo, comp = d.comp;
    var partes = comp.split('-'), mm = partes[1] === '13' ? '13' : partes[1];
    contEvento += inteiro(1, 6);
    var idEvento = 'ID1169' + pad(contEvento, 6) + digitos(6);
    var arquivo = t.evento.replace('-', '') + '_' + partes[0] + mm + '_' + idEvento + '.xml';
    var baseRubrica = t.aliq ? Math.round(d.valor / ALIQ_PATRONAL) : d.valor;
    return {
      id: 'PRV-' + pad(idx + 1, 4), n: idx + 1, ano: d.ano,
      competencia: comp, competenciaTxt: mm === '13' ? '13º/' + partes[0] : mm + '/' + partes[0],
      evento: t.evento, idEvento: idEvento, arquivo: arquivo,
      rubrica: t.rubrica, origem: t.origem, tipoId: t.id,
      inconsistencia: t.inconsistencia, porque: t.porque, baseLegal: t.base, prova: t.prova,
      resultado: t.resultado, cor: t.cor,
      valor: d.valor, valorBase: baseRubrica, aliquota: t.aliq ? ALIQ_PATRONAL : null,
      calculo: t.aliq ? 'R$ ' + (baseRubrica / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' × 22% = R$ ' + (d.valor / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : 'Valor da guia em duplicidade/sem correspondência: R$ ' + (d.valor / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      servidores: t.aliq ? inteiro(18, 240) : null
    };
  });

  function soma(lista) { var s = 0; lista.forEach(function (d) { s += d.valor; }); return s; }
  var ATIVO = DOCS.filter(function (d) { return d.resultado === 'ativo'; });
  var PASSIVO = DOCS.filter(function (d) { return d.resultado === 'passivo'; });

  window.GovDemoPrev = {
    AVISO: AVISO, SEED: SEED, COMPETENCIAS: COMPETENCIAS, ANOS: [2021, 2022, 2023, 2024, 2025],
    docs: DOCS,
    totais: function () {
      var comps = {}; DOCS.forEach(function (d) { comps[d.competencia] = 1; });
      return { ativo: soma(ATIVO), passivo: soma(PASSIVO), inconsistencias: DOCS.length, competenciasComInconsistencia: Object.keys(comps).length, competencias: COMPETENCIAS.length };
    },
    porAno: function () { return this.ANOS.map(function (a) { return { ano: a, ativo: soma(ATIVO.filter(function (d) { return d.ano === a; })), passivo: soma(PASSIVO.filter(function (d) { return d.ano === a; })) }; }); },
    porOrigem: function () {
      var m = {}; ATIVO.forEach(function (d) { m[d.origem] = (m[d.origem] || 0) + d.valor; });
      return Object.keys(m).map(function (k) { return { nome: k, valor: m[k] }; }).sort(function (x, y) { return y.valor - x.valor; });
    },
    porCor: function () { return ['verde', 'amarelo'].map(function (c) { return { cor: c, valor: soma(ATIVO.filter(function (d) { return d.cor === c; })) }; }); }
  };
})();
