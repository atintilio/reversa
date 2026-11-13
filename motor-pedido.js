/*
 * Reversa Tax — motor de decisão do pedido de crédito de PIS/COFINS: PER (Pedido de
 * Ressarcimento) ou DCOMP (Declaração de Compensação), com o valor a pedir e o fundamento.
 *
 * FONTE OFICIAL (não é opinião deste código):
 *   "PER/DCOMP Web: Ressarcimento de PIS/Pasep e Cofins Não Cumulativos" — Receita Federal
 *   (https://www.gov.br/receitafederal/.../per_dcomp-web_-ressarcimento-de-pis_pasep-e-cofins-nao-cumulativos.pdf)
 *   Guía Prático da EFD Contribuições v1.35, registro 1100/1500 (Bloco 1).
 *
 * Regras implementadas (todas tiradas da fonte acima):
 *   1. Prazo: o direito de apresentar o pedido de ressarcimento se extingue após 5 anos,
 *      contados do encerramento do trimestre do crédito (CTN art. 168, I; SC Cosit 125/2021).
 *   2. Regra do PER obrigatório: "uma declaração de compensação só pode ser elaborada se
 *      tiver sido transmitido um pedido de ressarcimento antes" — com a exceção das bases
 *      legais 301/302/303/304/307, quando a DCOMP é transmitida antes do encerramento do
 *      trimestre de referência do crédito.
 *   3. Tipo do período do crédito no PER/DCOMP Web: trimestral quando o PER prévio é
 *      obrigatório; mensal quando não é.
 *   4. Saldo do crédito (aba "Saldo do Crédito"), por mês de apuração:
 *      crédito informado em "Valores Apurados" − valor da aba "Deduções e Descontos"
 *      − valor da aba "Utilização em DCOMP Anterior".
 *   5. Passibilidade: no PER/DCOMP Web só se informam créditos passíveis de
 *      ressarcimento/compensação; crédito que só pode ser usado em dedução/desconto na
 *      própria escrituração não deve ser informado.
 *   6. DCOMP compensa débitos próprios; o crédito entre o PER e a DCOMP é atualizado pela
 *      Selic (o PER/DCOMP Web calcula), e a compensação extingue o débito pelo valor do
 *      crédito atualizado.
 *   7. Crédito originário de DARF de PIS/Cofins pago indevidamente ou a maior NÃO é PER:
 *      é pedido de restituição (orientação própria da Receita).
 *
 * O que este módulo NÃO faz: não transmite nada, não escolhe o valor final (o valor do
 * pedido é o que o PER/DCOMP Web calcula) e não substitui o contador responsável. Ele diz
 * qual via se sustenta, por quê, o que falta e por onde o pedido é feito.
 *
 * Funciona no navegador (window.MotorPedido) e no Node (module.exports).
 */
(function (root) {
  'use strict';

  var TABELAS = (typeof module !== 'undefined' && module.exports)
    ? require('./lib/sped/tabelas/codigos-credito.js')
    : (root.SPED_CODIGOS_CREDITO || { tabelas: {} });
  var COD_TIPO_CREDITO = (TABELAS.tabelas && TABELAS.tabelas.codigo_tipo_credito && TABELAS.tabelas.codigo_tipo_credito.codigos) || {};

  var FONTE = 'Receita Federal — PER/DCOMP Web: Ressarcimento de PIS/Pasep e Cofins Não Cumulativos';

  // Códigos de receita do DARF (tabelas de códigos de extensão da Receita):
  // 6912 = PIS/Pasep Não Cumulativo; 5856 = Cofins Não Cumulativa.
  var COD_DARF = { '6912': 'PIS', '6912/01': 'PIS', '5856': 'COFINS', '5856/01': 'COFINS' };

  // creditos do pacote e principal do DARF ja vem em REAIS; os registros M100/M500 vem em CENTAVOS.
  function r2(v) { return Math.round(Number(v || 0) * 100) / 100; }
  function reais(c) { var v = Math.round(Number(c || 0)) / 100; return Math.round(v * 100) / 100; }
  function reaisTexto(v) { return Number(v || 0).toFixed(2).replace('.', ','); }
  function rotuloTipoCredito(cod) { return COD_TIPO_CREDITO[cod] || ('Código ' + (cod || '?')); }

  /**
   * Competencia do DARF em 'AAAA-MM'. DARF mensal usa o mes; DARF trimestral (IRPJ/CSLL) usa o
   * primeiro mes do trimestre — e isso fica declarado no aviso do motor (aproximacao).
   */
  function competenciaDoDarf(d) {
    var p = d && d.periodo;
    if (!p) return null;
    if (/^\d{4}-\d{2}$/.test(String(p.competencia || ''))) return p.competencia;
    if (p.ano && p.mes) return p.ano + '-' + (p.mes < 10 ? '0' : '') + p.mes;
    if (p.ano && p.trimestre) {
      var m = (p.trimestre - 1) * 3 + 1;
      return p.ano + '-' + (m < 10 ? '0' : '') + m;
    }
    return null;
  }

  /** 'AAAA-MM' ou 'MMAAAA' (como no Bloco 1) -> {ano, mes, trimestre, trimestreTexto}. */
  function periodo(comp) {
    var s = String(comp || '');
    var m = /^(\d{4})-(\d{2})$/.exec(s) || /^(\d{2})(\d{4})$/.exec(s);
    if (!m) return null;
    var ano, mes;
    if (s.indexOf('-') >= 0) { ano = +m[1]; mes = +m[2]; } else { mes = +m[1]; ano = +m[2]; }
    if (mes < 1 || mes > 12) return null;
    var tri = Math.ceil(mes / 3);
    return { ano: ano, mes: mes, trimestre: tri, trimestreTexto: ano + 'T' + tri, chave: ano + '-' + (mes < 10 ? '0' : '') + mes };
  }

  /** Fim do trimestre do crédito + 5 anos (CTN art. 168, I). */
  function limitePrazo(p) {
    if (!p) return null;
    var mesFim = p.trimestre * 3;                 // fim do trimestre
    var ano = p.ano + 5;                          // 5 anos contados do encerramento do trimestre
    return ano + '-' + (mesFim < 10 ? '0' : '') + mesFim;
  }

  function mesesNoTrimestre(p) {
    var ini = (p.trimestre - 1) * 3 + 1;
    return [ini, ini + 1, ini + 2].map(function (m) { return p.ano + '-' + (m < 10 ? '0' : '') + m; });
  }

  /**
   * Avalia os pedidos a fazer com os créditos declarados no Bloco 1.
   *
   * @param {Object} o
   *   creditos        [{ tributo, competenciaCredito, origem, cnpjSuc, codCredito, apurado,
   *                      usadoDescontoAnterior, usadoPerAnterior, usadoDcompAnterior,
   *                      disponivel, usadoDesconto, pedidoPer, pedidoDcomp, saldoFinal }]  (em reais)
   *   creditosApurados [{ tributo, competencia, codCredito, vlCred, vlCredDisp, sldCred, vlCredDesc }] (M100/M500, em centavos)
   *   darfs           [{ codigoReceita, principal, periodo:{competencia} }] (em centavos)
   *   competenciaRef  'AAAA-MM' — mês de referência (normalmente o da escrituração)
   *   dataPer         opcional 'AAAA-MM' — mês de transmissão do PER original (para a atualização da Selic)
   * @returns {Object} avaliação
   */
  function avaliar(o) {
    o = o || {};
    var creditos = o.creditos || [];
    var apurados = o.creditosApurados || [];
    var darfs = o.darfs || [];
    var ref = o.competenciaRef || '';
    var refP = periodo(ref);
    var avisos = [];

    // --- tributos pagos (DARF) por competência: dizem se há débito próprio a compensar
    var pagos = {};
    darfs.forEach(function (d) {
      var trib = COD_DARF[String(d.codigoReceita || '').trim()];
      if (!trib) return;
      var c = competenciaDoDarf(d);
      if (!c) return;
      pagos[c] = pagos[c] || { pis: 0, cofins: 0, total: 0 };
      pagos[c][trib.toLowerCase()] += Number(d.principal || 0);
      pagos[c].total += Number(d.principal || 0);
    });

    // --- crédito apurado por mês (M100/M500) e por trimestre
    var apuradoMes = {};
    apurados.forEach(function (a) {
      var c = a.competencia || '';
      if (!/^\d{4}-\d{2}$/.test(c)) return;
      apuradoMes[c] = apuradoMes[c] || {};
      var chave = a.tributo + '|' + a.codCredito;
      apuradoMes[c][chave] = (apuradoMes[c][chave] || 0) + Number(a.vlCred || 0);
    });

    // --- consolida por trimestre e por código de crédito (é assim que o PER/DCOMP Web pede)
    var grupos = {};
    creditos.forEach(function (c) {
      var p = periodo(c.competenciaCredito);
      if (!p) return;
      var chave = [c.tributo, p.trimestreTexto, c.codCredito].join('|');
      var g = grupos[chave] || (grupos[chave] = {
        tributo: c.tributo, trimestre: p.trimestreTexto, periodo: p, codCredito: c.codCredito,
        codCreditoRotulo: c.codCreditoRotulo || rotuloTipoCredito(c.codCredito),
        origem: c.origem, cnpjSuc: c.cnpjSuc, competencias: [],
        apurado: 0, deducoes: 0, utilizacoes: 0, saldo: 0, apuradoMes: 0, jaPedidoPer: 0
      });
      g.competencias.push(c.competenciaCredito);
      g.apurado += Number(c.apurado || 0);
      g.deducoes += Number(c.usadoDescontoAnterior || 0) + Number(c.usadoDesconto || 0);
      g.utilizacoes += Number(c.usadoDcompAnterior || 0) + Number(c.usadoDcompAnterior || 0) * 0;
      g.saldo += Number(c.disponivel || 0);
      g.jaPedidoPer += Number(c.pedidoPer || 0);
    });

    var pedidos = [];
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      var p = g.periodo;
      var fund = [], pend = [];

      // 1. prazo decadencial (5 anos do encerramento do trimestre do crédito)
      var limite = limitePrazo(p);
      var prescrito = !!(refP && limite && ref > limite);
      if (prescrito) {
        fund.push('Prazo: o direito de pedir se extingue após 5 anos contados do encerramento do trimestre do crédito (CTN art. 168, I; SC Cosit 125/2021). Trimestre ' + p.trimestreTexto + ' → limite em ' + limite + '.');
      }

      // 2. valor apurado do trimestre: o campo 06 (VL_CRED_APU) dos 1100/1500 do trimestre.
      // O próprio Guia diz que esse campo é "o valor total do crédito apurado na Escrituração
      // Fiscal Digital (Registro M100) ou em demonstrativo DACON de período anterior" — ou seja,
      // é o crédito apurado no mês de apuração, que é o que o PER/DCOMP Web pede em
      // "Valores Apurados".
      g.apuradoMes = r2(g.apurado);

      // 2b. conciliação: o M100/M500 da competência da escrituração diz quanto de crédito foi
      // apurado no período; o campo 06 do 1100/1500 da mesma competência diz o que a empresa
      // declarou. A diferença é o que o contador precisa conferir antes de pedir.
      var conc = [];
      if (o.competenciaEscrituracao) {
        var porMesEsc = apuradoMes[o.competenciaEscrituracao];
        if (porMesEsc) {
          var chaveEsc = g.tributo + '|' + g.codCredito;
          if (porMesEsc[chaveEsc]) {
            var apuradoMesEsc = reais(porMesEsc[chaveEsc]);
            conc.push({ competencia: o.competenciaEscrituracao, codCredito: g.codCredito, apurado: apuradoMesEsc, declarado: r2(g.apuradoMes) });
            if (Math.abs(apuradoMesEsc - r2(g.apuradoMes)) > 0.01) {
              pend.push('Conciliação da competência ' + o.competenciaEscrituracao + ': o M100/M500 aponta R$ ' + reaisTexto(apuradoMesEsc) + ' de crédito apurado e o 1100/1500 declara R$ ' + reaisTexto(r2(g.apuradoMes)) + '. Conferir antes de pedir.');
            }
          }
        }
      }

      // 3. saldo do crédito pela fórmula oficial do PER/DCOMP Web
      var saldo = r2(g.apurado - g.deducoes - g.utilizacoes);
      // ...e o saldo que a empresa declarou (campo 12 do 1100/1500) como conferência
      var declarado = r2(g.saldo);
      if (Math.abs(saldo - declarado) > 0.01 && declarado > 0) {
        pend.push('O saldo apurado por esta regra (' + reaisTexto(saldo) + ') difere do saldo disponível declarado pela empresa no 1100/1500 (' + reaisTexto(declarado) + '). Conferir antes de pedir.');
      }

      // 4. via: PER (ressarcimento) e, depois, DCOMP (compensação) vinculada
      var debitoFuturo = 0;
      Object.keys(pagos).forEach(function (c) {
        if (c > p.chave) debitoFuturo += pagos[c].total;
      });
      var temDebito = debitoFuturo > 0;
      var via = 'PER';
      var viaRotulo = 'Pedido de Ressarcimento (PER)';
      fund.push('Via: no regime não cumulativo o pedido de ressarcimento é o caminho do crédito apurado; a declaração de compensação (DCOMP) é posterior e vinculada a um PER já transmitido ("uma declaração de compensação só pode ser elaborada se tiver sido transmitido um pedido de ressarcimento antes").');
      if (temDebito) {
        via = 'PER_E_DCOMP';
        viaRotulo = 'PER e depois DCOMP (o crédito compensa débito próprio de R$ ' + reaisTexto(r2(debitoFuturo)) + ')';
        fund.push('Há tributos próprios recolhidos (DARF de PIS/Cofins/IRPJ/CSLL) em períodos posteriores à competência do crédito: existe débito a compensar, então a sequência é PER (pedido) e DCOMP (compensação) contra esse débito.');
      } else {
        fund.push('Não há DARF de PIS/Cofins/IRPJ/CSLL nos arquivos lidos em período posterior à competência do crédito: se realmente não houver débito próprio a compensar, a DCOMP não tem objeto — o caminho é o PER (o valor entra como restituição).');
        pend.push('Conferir no PER/DCOMP Web se há débito próprio a compensar (debitos futuros, parcelamentos ou autações): se houver, a DCOMP depois do PER é o caminho.');
      }
      if (g.jaPedidoPer > 0) {
        via = 'NENHUMA';
        viaRotulo = 'Crédito já objeto de PER neste período';
        pend.push('O 1100/1500 informa valor de crédito objeto de PER neste período de escrituração (campo 14): este crédito já foi pedido. Conferir no PER/DCOMP Web o número do PER antes de preparar outro pedido.');
      }
      if (prescrito) { via = 'NENHUMA'; viaRotulo = 'Prescrito (5 anos do encerramento do trimestre)'; }

      // 5. pendências de conteúdo (as que a Receita exige e o motor não pode resolver)
      if (g.origem === '02') {
        pend.push('Crédito transferido por pessoa jurídica sucedida: no PER/DCOMP Web o detentor é "Crédito apurado por empresa sucedida" e é preciso informar os dados do evento de sucessão (incorporação, fusão, cisão), que precisam estar informados no cadastro CNPJ da Receita, além do percentual do crédito transferido.');
      }
      pend.push('O PER/DCOMP Web só aceita crédito passível de ressarcimento/compensação, conforme o código do crédito e a base legal. Conferir a base legal do crédito no sistema antes de informar os valores.');
      pend.push('Existência de litígio: o PER/DCOMP só pode ser apresentado se o valor do crédito não estiver discutido em processo judicial ou administrativo (atestação no formulário).');
      pend.push('Verificar se o crédito é objeto de inconstitucionalidade de lei (a Receita bloqueia o PER/DCOMP nessas situações).');
      pend.push('Conferir se não há PER já transmitted para este crédito (a aba "Utilização em DCOMP Anterior" é recuperada pelo sistema) e se não há DCOMP trimestral anterior.');

      // 6. atualização pela Selic entre o PER e a DCOMP (exclusiva da DCOMP)
      var compensavel = saldo;
      if (via === 'PER_E_DCOMP') {
        fund.push('Na DCOMP o crédito é atualizado pela Selic desde o mês seguinte ao 361º dia do PER original (o PER/DCOMP Web calcula); o crédito usado na compensação é o total dos débitos dividido por (1 + Selic).');
        if (!o.dataPer) pend.push('Informar o mês de transmissão do PER original para estimar a atualização pela Selic da DCOMP (o valor oficial é o do PER/DCOMP Web).');
      }

      pedidos.push({
        id: k,
        tributo: g.tributo,
        trimestre: g.trimestre,
        competencias: g.competencias,
        codCredito: g.codCredito,
        codCreditoRotulo: g.codCreditoRotulo,
        origem: g.origem,
        cnpjSuc: g.cnpjSuc,
        apurado: g.apuradoMes,                 // valores apurados do trimestre (M100/M500)
        deducoes: r2(g.deducoes),
        utilizacoes: r2(g.utilizacoes),
        saldo: saldo,                          // saldo pela fórmula do PER/DCOMP Web
        saldoDeclarado: declarado,             // saldo declarado no 1100/1500
        conciliacao: conc,                     // confronto com o M100/M500 da competência da escrituração
        via: via,
        viaRotulo: viaRotulo,
        valorPedido: via === 'NENHUMA' ? 0 : saldo,
        valorCompensavel: via === 'PER_E_DCOMP' ? compensavel : 0,
        prazo: { trimestre: g.trimestre, limite: limite, situacao: prescrito ? 'prescrito' : 'no_prazo' },
        fundamento: fund,
        pendencias: pend,
        fonte: FONTE
      });
    });

    pedidos.sort(function (a, b) { return (a.trimestre + a.tributo + a.codCredito) < (b.trimestre + b.tributo + b.codCredito) ? -1 : 1; });

    var resumo = { totalPedido: 0, totalCompensavel: 0, porTributo: { pis: 0, cofins: 0 }, itens: pedidos.length };
    pedidos.forEach(function (p) {
      resumo.totalPedido += p.valorPedido;
      resumo.totalCompensavel += p.valorCompensavel;
      if (resumo.porTributo[p.tributo] !== undefined) resumo.porTributo[p.tributo] += p.valorPedido;
    });
    resumo.totalPedido = reais(resumo.totalPedido);
    resumo.totalCompensavel = reais(resumo.totalCompensavel);

    if (!pedidos.length) avisos.push('Nenhum crédito com saldo disponível nos registros 1100/1500: não há pedido a preparar.');
    if (darfs.some(function (d) { return d && d.periodo && d.periodo.trimestre; })) {
      avisos.push('DARF trimestral (IRPJ/CSLL) foi comparado pelo primeiro mês do trimestre: é uma aproximação para saber se existe débito próprio a compensar.');
    }

    return { competenciaRef: ref, pedidos: pedidos, resumo: resumo, avisos: avisos, fonte: FONTE };
  }

  /**
   * Ficha do pedido no formato do PER/DCOMP Web (a ordem das abas do roteiro oficial da Receita).
   * @param {Object} avaliacao
   * @returns {Array} linhas [ {aba, campo, valor} ]
   */
  function ficha(avaliacao) {
    var linhas = [];
    function add(aba, campo, valor) { linhas.push({ aba: aba, campo: campo, valor: valor == null ? '' : valor }); }
    (avaliacao && avaliacao.pedidos || []).forEach(function (p) {
      add('Identificar Documento', 'Tipo de crédito', p.tributo === 'pis'
        ? 'PIS/PASEP Não-Cumulativo - Ressarcimento/Compensação - PA a partir de Janeiro de 2014'
        : 'Cofins Não-Cumulativa - Ressarcimento/Compensação - PA a partir de Janeiro de 2014');
      add('Identificar Documento', 'Documento', p.via === 'PER_E_DCOMP' ? 'Pedido de Ressarcimento (a DCOMP vem depois, vinculada)' : 'Pedido de Ressarcimento');
      add('Identificar Documento', 'Apelido para identificação do documento', 'PIS/COFINS ' + p.tributo.toUpperCase() + ' ' + p.trimestre + ' — ' + p.codCredito);
      add('Identificação do Crédito', 'Detentor do crédito', p.origem === '02' ? 'Crédito apurado por empresa sucedida' : 'Crédito apurado pelo próprio contribuinte');
      add('Identificação do Crédito', 'Período do crédito (trimestre)', p.trimestre);
      add('Identificação do Crédito', 'Existência de litígio', 'A atestar pelo responsável');
      add('Valores Apurados', 'Código do crédito', p.codCredito + ' — ' + p.codCreditoRotulo);
      add('Valores Apurados', 'Crédito apurado no trimestre ' + p.trimestre + ' (competências ' + p.competencias.join(', ') + ')', reaisTexto(p.apurado));
      add('Saldo do Crédito', 'Saldo (apurado − deduções − utilizações em DCOMP anterior)', reaisTexto(p.saldo));
      add('Demonstrativo do Crédito', 'Crédito passível de ressarcimento / valor pedido', reaisTexto(p.valorPedido));
      add('Prazo', 'Limite (5 anos do encerramento do trimestre)', p.prazo.limite + ' — ' + (p.prazo.situacao === 'prescrito' ? 'PRESCRITO' : 'no prazo'));
      p.pendencias.forEach(function (t) { add('Pendências', 'A verificar', t); });
    });
    return linhas;
  }

  function mesesDoTrimestre(triTexto) {
    var m = /^(\d{4})T([123])$/.exec(String(triTexto || ''));
    if (!m) return [];
    var ano = +m[1], tri = +m[2], ini = (tri - 1) * 3 + 1;
    return [ini, ini + 1, ini + 2].map(function (x) { return ano + '-' + (x < 10 ? '0' : '') + x; });
  }

  /** Ficha em CSV (separador ';'), no formato do PER/DCOMP Web. */
  function csv(avaliacao) {
    var linhas = ficha(avaliacao);
    if (!linhas.length) return '';
    function cel(v) { var s = String(v == null ? '' : v); return (s.indexOf(';') >= 0 || s.indexOf('"') >= 0) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var out = [['Aba', 'Campo', 'Valor'].join(';')];
    linhas.forEach(function (l) { out.push([cel(l.aba), cel(l.campo), cel(l.valor)].join(';')); });
    return out.join('\r\n') + '\r\n';
  }

  var api = {
    avaliar: avaliar, ficha: ficha, csv: csv, competenciaDoDarf: competenciaDoDarf,
    COD_DARF: COD_DARF, FONTE: FONTE, reais: reais, reaisTexto: reaisTexto,
    periodo: periodo, limitePrazo: limitePrazo, rotuloTipoCredito: rotuloTipoCredito
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MotorPedido = api;
})(typeof window !== 'undefined' ? window : this);
