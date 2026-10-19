/*
 * Reversa Tax — motor previdenciário: lê os XML do eSocial e estima as oportunidades das teses da folha.
 *
 * Eventos lidos (leiaute S-1.x):
 *   S-1000 (evtInfoEmpregador)  empregador
 *   S-1005 (evtTabEstab)        estabelecimentos: CNAE preponderante, alíquota RAT e FAP
 *   S-1010 (evtTabRubrica)      rubricas: descrição, natureza (natRubr), tipo (tpRubr) e incidência previdenciária (codIncCP)
 *   S-1020 (evtTabLotacao)      lotações: FPAS e código de terceiros (exibidos)
 *   S-1200 (evtRemun)           remuneração por trabalhador, competência e estabelecimento
 * Arquivos de lote (envioLoteEventos), retornos com o evento embutido e retificadoras (indRetif = 2) são aceitos.
 *
 * Regra de cálculo (estimativa preliminar, não é crédito):
 *   - Só rubricas de vencimento (tpRubr 1) com incidência patronal declarada no S-1010:
 *     codIncCP 11 (mensal), 12 (13º), 21 e 22 (salário-maternidade pago pela empresa).
 *   - A rubrica é associada a uma tese pela descrição (palavras-chave), sempre listada para conferência humana.
 *   - Valor = base × (CPP 20% + RAT × FAP do estabelecimento + terceiros).
 *     Terceiros: 5,8% estimado (salário-educação 2,5% + INCRA 0,2% + Sistema S 2,5% + SEBRAE 0,6%), a confirmar pelo FPAS.
 *   - RAT reflexos (13º, DSR, dias não trabalhados): base × RAT × FAP, para decisão da empresa.
 *   - "No prazo": competências dos últimos 5 anos (CTN, art. 168, I).
 * Funciona no navegador (window.MotorEsocial) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var CPP = 0.20, TERCEIROS_PADRAO = 0.058;
  var INCIDE_PATRONAL = { '11': 'mensal', '12': '13º salário', '21': 'salário-maternidade (empresa)', '22': 'salário-maternidade 13º (empresa)' };

  // ------------------------------------------------------------------ XML mínimo (sem dependências)
  function parseXml(texto) {
    var s = String(texto || '').replace(/^﻿/, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, function (m, c) { return c.replace(/</g, '&lt;'); });
    var raiz = { nome: '#doc', filhos: [], texto: '' }, pilha = [raiz];
    var re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(s))) {
      var topo = pilha[pilha.length - 1];
      if (m[5] !== undefined) { topo.texto += m[5]; continue; }
      var nome = m[2].split(':').pop();
      if (m[1]) { if (pilha.length > 1) pilha.pop(); continue; }
      var no = { nome: nome, filhos: [], texto: '', attrs: {} };
      Object.defineProperty(no, 'pai', { value: topo, enumerable: false }); // para achar o recibo do evento no retorno
      String(m[3] || '').replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, function (x, k, v) { no.attrs[k.split(':').pop()] = v; return x; });
      topo.filhos.push(no);
      if (!m[4] && !/\/\s*$/.test(m[3] || '')) pilha.push(no);
    }
    return raiz;
  }
  function decod(t) { return String(t || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim(); }
  function filho(no, nome) { if (!no) return null; for (var i = 0; i < no.filhos.length; i++) if (no.filhos[i].nome === nome) return no.filhos[i]; return null; }
  function filhos(no, nome) { return no ? no.filhos.filter(function (f) { return f.nome === nome; }) : []; }
  function txt(no, caminho) { var n = no; caminho.split('/').forEach(function (p) { n = filho(n, p); }); return n ? decod(n.texto) : ''; }
  function todos(no, nome, acc) { acc = acc || []; if (!no) return acc; no.filhos.forEach(function (f) { if (f.nome === nome) acc.push(f); todos(f, nome, acc); }); return acc; }
  function num(v) { var n = Number(String(v || '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }

  var EVENTOS = { evtInfoEmpregador: 'S-1000', evtTabEstab: 'S-1005', evtTabRubrica: 'S-1010', evtTabLotacao: 'S-1020', evtRemun: 'S-1200', evtFechaEvPer: 'S-1299' };

  /** Lê um arquivo XML e devolve os eventos reconhecidos. */
  function lerXml(texto, nomeArquivo) {
    var r = { arquivo: nomeArquivo || 'arquivo.xml', eventos: [], erros: [], avisos: [] };
    if (!/<([\w]+:)?eSocial[\s>]/.test(String(texto || ''))) { r.erros.push('Não é um XML do eSocial.'); return r; }
    var doc;
    try { doc = parseXml(texto); } catch (e) { r.erros.push('XML inválido.'); return r; }
    Object.keys(EVENTOS).forEach(function (tag) {
      todos(doc, tag).forEach(function (ev) { r.eventos.push({ tipo: EVENTOS[tag], no: ev, id: (ev.attrs && ev.attrs.Id) || '' }); });
    });
    if (!r.eventos.length) r.avisos.push('Nenhum evento usado no cálculo (S-1000, S-1005, S-1010, S-1020, S-1200) neste arquivo.');
    return r;
  }

  // ------------------------------------------------------------------ teses e palavras-chave das rubricas
  // Ordem importa: a primeira regra que casar define a tese da rubrica.
  var REGRAS = [
    { id: 'T004', re: /MATERNIDADE/, motivo: 'salário-maternidade' },
    { id: 'T064', re: /PATERNIDADE/, motivo: 'licença-paternidade' },
    { id: 'T005', re: /AVISO ?PREVIO INDENIZ|AV\.? ?PREV(IO)?\.? ?INDENIZ|AVISO INDENIZ/, motivo: 'aviso-prévio indenizado' },
    { id: 'T006', re: /15 (PRIMEIROS )?DIAS|PRIMEIROS 15|AUX(ILIO)?\.? ?DOENCA|AUX(ILIO)?\.? ?ENFERMIDADE|AFAST(AMENTO)?\.? ?(POR )?DOENCA/, motivo: '15 primeiros dias de afastamento' },
    { id: 'T063', re: /\bPLR\b|PARTICIPACAO (NOS |NO )?(LUCROS|RESULTADOS)|\bPPR\b/, motivo: 'participação nos lucros ou resultados' },
    { id: 'T067', re: /VALE[ -]?TRANSPORTE|AUX(ILIO)?\.? ?TRANSPORTE|\bV\.?T\.?\b/, motivo: 'vale-transporte' },
    { id: 'T066', re: /ALIMENTACAO|REFEICAO|TICKET|CESTA BASICA/, motivo: 'auxílio-alimentação' },
    { id: 'T068', re: /PLANO (DE )?SAUDE|ASSIST(ENCIA)?\.? ?(MEDICA|ODONTO)|ODONTOLOG|CONVENIO (MEDICO|ODONTO)|REEMBOLSO (MEDICO|DE MEDICAMENTOS?)|MEDICAMENTO/, motivo: 'assistência médica e odontológica' },
    { id: 'T062', re: /DOBRA|EM DOBRO|DOMINGOS? (E FERIADOS? )?TRAB|FERIADOS? TRAB/, motivo: 'domingos e feriados em dobro' },
    { id: 'T007', re: /^(?!.*INDENIZ).*(1\/3|TERCO (CONST(ITUCIONAL)? )?(DE )?FERIAS|ADICIONAL (CONST(ITUCIONAL)? )?(DE )?FERIAS)/, motivo: 'terço constitucional de férias' },
    { id: 'T065', re: /^(?!.*FERIAS).*(GRATIFICA|PREMIO|PREMIACAO|BONUS|BONIFICA|ABONO)/, motivo: 'gratificação, prêmio ou abono' },
    { id: 'T028', re: /INDENIZ|AJUDA DE CUSTO|DIARIAS? DE VIAGEM/, motivo: 'verba de natureza indenizatória' }
  ];
  // Reflexos para RAT (13º, DSR, dias não trabalhados): base própria, só a alíquota RAT × FAP.
  var REFLEXOS = /\bDSR\b|REPOUSO|DESCANSO SEMANAL|13 ?(O|º)? ?SAL|DECIMO TERCEIRO|FALTAS? (JUSTIFICADAS|ABONADAS)|DIAS NAO TRABALHADOS/;
  var NOMES = {
    T004: 'Contribuição previdenciária sobre salário-maternidade', T005: 'Contribuição previdenciária sobre aviso-prévio indenizado',
    T006: 'Contribuição previdenciária sobre primeiros 15 dias de afastamento', T007: 'Terço constitucional de férias',
    T028: 'INSS sobre verbas de natureza indenizatória', T062: 'Contribuição previdenciária sobre hora dobrada (domingos e feriados trabalhados)',
    T063: 'Contribuição previdenciária sobre PLR paga conforme a Lei 10.101/2000', T064: 'Contribuição previdenciária sobre licença-paternidade',
    T065: 'Contribuição previdenciária sobre gratificações e prêmios eventuais', T066: 'Contribuição previdenciária sobre auxílio-alimentação (tíquete, cartão ou in natura)',
    T067: 'Contribuição previdenciária sobre vale-transporte', T068: 'Contribuição previdenciária sobre assistência médica e odontológica',
    T069: 'RAT/GILRAT — reflexos sobre 13º salário, DSR e dias não trabalhados'
  };
  function classificar(dsc) {
    var d = norm(dsc);
    for (var i = 0; i < REGRAS.length; i++) if (REGRAS[i].re.test(d)) return REGRAS[i];
    return null;
  }

  // ------------------------------------------------------------------ apuração
  function vigente(lista, comp) {
    // registro de tabela vigente na competência (iniValid/fimValid em AAAA-MM)
    var ok = lista.filter(function (x) { return (!x.ini || x.ini <= comp) && (!x.fim || x.fim >= comp); });
    return (ok.length ? ok : lista)[ok.length ? ok.length - 1 : lista.length - 1] || null;
  }
  function cincoAnos(hoje) { var d = new Date(hoje || Date.now()); return (d.getFullYear() - 5) + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  /**
   * @param {Array} lidos  resultados de lerXml
   * @param {{hoje?: Date, terceiros?: number}} opts
   */
  function apurar(lidos, opts) {
    opts = opts || {};
    var terceiros = opts.terceiros == null ? TERCEIROS_PADRAO : Number(opts.terceiros);
    var limite = cincoAnos(opts.hoje);
    var rubricas = {}, estabs = {}, lotacoes = {}, empregador = { cnpjRaiz: '', nome: '' };
    var remun = {}, contagem = { 'S-1000': 0, 'S-1005': 0, 'S-1010': 0, 'S-1020': 0, 'S-1200': 0 }, avisos = [];
    lidos.forEach(function (l) {
      l.eventos.forEach(function (ev) {
        contagem[ev.tipo] = (contagem[ev.tipo] || 0) + 1;
        var n = ev.no, ide = filho(n, 'ideEmpregador');
        if (ide && !empregador.cnpjRaiz) empregador.cnpjRaiz = txt(ide, 'nrInsc');
        if (ev.tipo === 'S-1000') {
          var info = todos(n, 'infoCadastro')[0]; if (info) empregador.nome = empregador.nome || txt(info, 'nmRazao');
        } else if (ev.tipo === 'S-1010') {
          ['inclusao', 'alteracao'].forEach(function (op) {
            todos(n, op).forEach(function (o) {
              var ir = filho(o, 'ideRubrica'), dr = filho(o, 'dadosRubrica'); if (!ir || !dr) return;
              var k = txt(ir, 'ideTabRubr') + '|' + txt(ir, 'codRubr');
              (rubricas[k] = rubricas[k] || []).push({ ini: txt(ir, 'iniValid'), fim: txt(ir, 'fimValid'), cod: txt(ir, 'codRubr'), tab: txt(ir, 'ideTabRubr'),
                dsc: txt(dr, 'dscRubr'), natRubr: txt(dr, 'natRubr'), tpRubr: txt(dr, 'tpRubr'), codIncCP: txt(dr, 'codIncCP') });
            });
          });
        } else if (ev.tipo === 'S-1005') {
          ['inclusao', 'alteracao'].forEach(function (op) {
            todos(n, op).forEach(function (o) {
              var ie = filho(o, 'ideEstab'), de = filho(o, 'dadosEstab'); if (!ie || !de) return;
              var g = filho(de, 'aliqGilrat');
              (estabs[txt(ie, 'nrInsc')] = estabs[txt(ie, 'nrInsc')] || []).push({ ini: txt(ie, 'iniValid'), fim: txt(ie, 'fimValid'),
                cnae: txt(de, 'cnaePrep'), rat: num(txt(g, 'aliqRat')), fap: num(txt(g, 'fap')) || 1 });
            });
          });
        } else if (ev.tipo === 'S-1020') {
          ['inclusao', 'alteracao'].forEach(function (op) {
            todos(n, op).forEach(function (o) {
              var il = filho(o, 'ideLotacao'), dl = filho(o, 'dadosLotacao'); if (!il || !dl) return;
              (lotacoes[txt(il, 'codLotacao')] = lotacoes[txt(il, 'codLotacao')] || []).push({ ini: txt(il, 'iniValid'), fim: txt(il, 'fimValid'),
                fpas: txt(dl, 'fpasLotacao/fpas'), codTercs: txt(dl, 'fpasLotacao/codTercs') });
            });
          });
        } else if (ev.tipo === 'S-1200') {
          var ie2 = filho(n, 'ideEvento'), it = filho(n, 'ideTrabalhador');
          var per = txt(ie2, 'perApur'), ind = txt(ie2, 'indApuracao') || '1';
          var comp = /^\d{4}$/.test(per) ? per + '-12' : per;
          var chave = txt(it, 'cpfTrab') + '|' + per + '|' + ind;
          var retif = txt(ie2, 'indRetif') === '2';
          // retificadora substitui a original da mesma pessoa, competência e tipo de apuração
          if (!remun[chave] || retif || !remun[chave].retif) remun[chave] = { comp: comp, retif: retif, no: n, arquivo: l.arquivo };
        }
      });
    });

    var porTese = {}, semCadastro = {}, semIncidencia = {}, semTese = {}, rubricasUsadas = {}, comps = {}, reflexos = { base: 0, baseNoPrazo: 0, valor: 0, valorNoPrazo: 0, rubricas: {} };
    function acumula(tese, r, base, aliq, comp, motivo) {
      var t = porTese[tese] = porTese[tese] || { id: tese, nome: NOMES[tese], base: 0, baseNoPrazo: 0, valor: 0, valorNoPrazo: 0, rubricas: {}, competencias: {} };
      var noPrazo = comp >= limite;
      t.base += base; t.valor += base * aliq; t.competencias[comp] = 1;
      if (noPrazo) { t.baseNoPrazo += base; t.valorNoPrazo += base * aliq; }
      var k = r.tab + '|' + r.cod, x = t.rubricas[k] = t.rubricas[k] || { cod: r.cod, tab: r.tab, dsc: r.dsc, natRubr: r.natRubr, codIncCP: r.codIncCP, motivo: motivo, base: 0 };
      x.base += base;
    }
    Object.keys(remun).forEach(function (k) {
      var e = remun[k], comp = e.comp; comps[comp] = 1;
      todos(e.no, 'ideEstabLot').forEach(function (el) {
        var nrInsc = txt(el, 'nrInsc'), est = estabs[nrInsc] ? vigente(estabs[nrInsc], comp) : null;
        var ratAj = est ? est.rat / 100 * est.fap : null;
        todos(el, 'itensRemun').forEach(function (ir) {
          var cod = txt(ir, 'codRubr'), tab = txt(ir, 'ideTabRubr'), vr = num(txt(ir, 'vrRubr'));
          var lista = rubricas[tab + '|' + cod];
          if (!lista) { semCadastro[tab + '|' + cod] = (semCadastro[tab + '|' + cod] || 0) + vr; return; }
          var r = vigente(lista, comp);
          rubricasUsadas[tab + '|' + cod] = r;
          if (r.tpRubr !== '1' || !INCIDE_PATRONAL[r.codIncCP] || vr <= 0) {
            if (vr > 0) { var kn = r.dsc + ' (tipo ' + (r.tpRubr || '?') + ', incidência ' + (r.codIncCP || 'não informada') + ')'; semIncidencia[kn] = (semIncidencia[kn] || 0) + vr; }
            return;
          }
          var c = classificar(r.dsc);
          if (!c && !(REFLEXOS.test(norm(r.dsc)) && ratAj)) semTese[r.dsc] = (semTese[r.dsc] || 0) + vr;
          var aliq = CPP + (ratAj || 0) + terceiros;
          if (c) acumula(c.id, r, vr, aliq, comp, c.motivo);
          if (REFLEXOS.test(norm(r.dsc)) && ratAj) {
            reflexos.base += vr; reflexos.valor += vr * ratAj;
            if (comp >= limite) { reflexos.baseNoPrazo += vr; reflexos.valorNoPrazo += vr * ratAj; }
            var kr = tab + '|' + cod, xr = reflexos.rubricas[kr] = reflexos.rubricas[kr] || { cod: cod, tab: tab, dsc: r.dsc, natRubr: r.natRubr, codIncCP: r.codIncCP, motivo: 'reflexo (13º, DSR ou dias não trabalhados)', base: 0 };
            xr.base += vr;
          }
        });
        if (!est) avisos.push('Estabelecimento ' + nrInsc + ' sem S-1005: RAT e FAP não aplicados nas competências dele.');
      });
    });
    if (reflexos.base > 0) porTese.T069 = { id: 'T069', nome: NOMES.T069, base: reflexos.base, baseNoPrazo: reflexos.baseNoPrazo, valor: reflexos.valor, valorNoPrazo: reflexos.valorNoPrazo, rubricas: reflexos.rubricas, competencias: {} };

    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var teses = Object.keys(porTese).map(function (id) {
      var t = porTese[id];
      return { id: id, nome: t.nome, base: r2(t.base), baseNoPrazo: r2(t.baseNoPrazo), valor: r2(t.valor), valorNoPrazo: r2(t.valorNoPrazo),
        competencias: Object.keys(t.competencias).length,
        rubricas: Object.keys(t.rubricas).map(function (k) { var x = t.rubricas[k]; return Object.assign({}, x, { base: r2(x.base) }); }).sort(function (a, b) { return b.base - a.base; }) };
    }).sort(function (a, b) { return b.valorNoPrazo - a.valorNoPrazo; });
    var cs = Object.keys(comps).sort();
    if (!contagem['S-1010']) avisos.unshift('Faltam os eventos S-1010 (tabela de rubricas): sem eles não é possível saber a incidência de cada rubrica.');
    if (!contagem['S-1200']) avisos.unshift('Faltam os eventos S-1200 (remuneração): sem eles não há base para o cálculo.');
    if (!contagem['S-1005']) avisos.push('Faltam os eventos S-1005 (estabelecimentos): o RAT ajustado pelo FAP não foi aplicado.');
    var lista = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, 8).join('; '); };
    if (Object.keys(semIncidencia).length) avisos.push('Rubricas sem incidência patronal declarada no S-1010 (só rubricas de vencimento com código de incidência 11, 12, 21 ou 22 entram no cálculo): ' + lista(semIncidencia) + '.');
    if (Object.keys(semTese).length) avisos.push('Rubricas com incidência, mas sem tese associada pela descrição (a equipe técnica deve classificar): ' + lista(semTese) + '.');
    Object.keys(semCadastro).slice(0, 20).forEach(function (k) { avisos.push('Rubrica ' + k.split('|')[1] + ' (tabela ' + k.split('|')[0] + ') usada na folha sem cadastro no S-1010.'); });
    return {
      versaoMotor: VERSAO, geradoEm: new Date().toISOString(), empregador: empregador,
      periodo: { inicio: cs[0] || null, fim: cs[cs.length - 1] || null, competencias: cs.length }, limitePrazo: limite,
      eventos: contagem, trabalhadoresCompetencias: Object.keys(remun).length,
      estabelecimentos: Object.keys(estabs).map(function (k) { var e = vigente(estabs[k], cs[cs.length - 1] || '9999-12'); return { nrInsc: k, cnae: e.cnae, rat: e.rat, fap: e.fap }; }),
      lotacoes: Object.keys(lotacoes).map(function (k) { var x = lotacoes[k][lotacoes[k].length - 1]; return { cod: k, fpas: x.fpas, codTercs: x.codTercs }; }),
      premissas: { cpp: CPP, terceiros: terceiros, incidencias: Object.keys(INCIDE_PATRONAL) },
      teses: teses,
      total: { valor: r2(teses.reduce(function (s, t) { return s + t.valor; }, 0)), valorNoPrazo: r2(teses.reduce(function (s, t) { return s + t.valorNoPrazo; }, 0)) },
      rubricasAnalisadas: Object.keys(rubricasUsadas).length,
      avisos: avisos.filter(function (a, i) { return avisos.indexOf(a) === i; })
    };
  }

  var api = { VERSAO: VERSAO, lerXml: lerXml, apurar: apurar, classificar: classificar, parseXml: parseXml, INCIDE_PATRONAL: INCIDE_PATRONAL, NOMES: NOMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorEsocial = api;
})(typeof self !== 'undefined' ? self : this);
