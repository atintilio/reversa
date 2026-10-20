/*
 * Reversa Tax — motor previdenciário EXTRA (teses T077 a T096), complemento do motor-esocial.js.
 *
 * Entrada: a mesma saída de MotorEsocial.lerXml (lista de arquivos lidos). Não altera o motor principal.
 *   apurarExtra(lidos, opts) -> { versao, teses: [...], avisos: [...], requerDocumento: [...], reclassifica: [...] }
 *
 * opts: { hoje, terceiros (padrão 5,8%), aliquota (substitui a alíquota total), forcarEscopo,
 *         classificar (padrão MotorEsocial.classificar), receitaBruta {'AAAA-MM': valor}, aliquotaCprb (T085),
 *         incluirChecklist (acrescenta em requerDocumento os itens sem gatilho nos XML: T084, T085, T092, T093) }
 *
 * Calculado a partir do eSocial (todas condicionais, natureza 'credito', pagamento não confirmado):
 *   T077 auxílio-creche/babá · T078 educação · T079 previdência privada · T080 ajuda de custo e diárias (diárias até 50% da remuneração;
 *   ajuda de custo só se parcela única) · T081 seguro de vida · T082 bolsa de estágio (categoria 901) · T086 stock options/ILP ·
 *   T089 retificação em duplicidade (evento original repetido) · T094 13º declarado na folha mensal e no 13º (indApuracao 2) ·
 *   T095 mesma rubrica/valor repetida em duas lotações do mesmo dmDev (só RAT×FAP + terceiros) · T096 verba da rescisão (S-2299) repetida na folha (S-1200).
 *   T085 (CPRB x folha) só com opts.receitaBruta e opts.aliquotaCprb; natureza 'planejamento' (economia, não é crédito recuperável).
 * Precisa de documento (valor 0, vai em requerDocumento): T083 cooperativas, T084 retenção 11%, T087 compensação de salário-família,
 *   T088 INSS do segurado entre empregadores (a parte dentro de um mesmo S-1200 já está na T074), T090 CPRB + 20% de CPP, T091 matriz/filial,
 *   T092 guia paga duas vezes, T093 retenção 11% duplicada.
 * `reclassifica`: rubricas que o motor principal classificava em outra tese (ex.: T028) e que passaram para uma tese deste módulo;
 *   quem integra os resultados deve retirá-las da tese anterior para não contar duas vezes.
 * Funciona no navegador (window.MotorEsocialExtra) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var CPP = 0.20, TERCEIROS_PADRAO = 0.058;
  var INCIDE = { '11': 1, '12': 1, '21': 1, '22': 1 };
  var NOMES = {
    T077: 'Auxílio-creche e babá (reembolso)', T078: 'Educação e bolsa de estudo (Lei 12.513/2011)', T079: 'Previdência privada complementar',
    T080: 'Ajuda de custo e diárias de viagem', T081: 'Seguro de vida em grupo', T082: 'Bolsa de estágio (categoria 901)',
    T083: 'Cooperativas de trabalho (STF, Tema 166)', T084: 'Retenção de 11% (cessão de mão de obra)', T085: 'CPRB x folha: regime mais vantajoso',
    T086: 'Stock options e incentivo de longo prazo', T087: 'Salário-família: compensação na guia não aproveitada',
    T088: 'INSS do segurado: múltiplos vínculos acima do teto', T089: 'Retificação em duplicidade (evento original repetido)',
    T090: 'CPRB e CPP de 20% recolhidos juntos', T091: 'Recolhimento no estabelecimento errado (matriz/filial)', T092: 'Guia paga em duplicidade',
    T093: 'Retenção de 11% em duplicidade', T094: '13º salário declarado em duplicidade', T095: 'RAT e terceiros sobre base repetida',
    T096: 'Verbas rescisórias declaradas na folha e na rescisão'
  };
  var CONDICOES = {
    T077: 'Reembolso mediante comprovação da despesa, filhos até a idade limite e política extensiva a todos (Súmula 310 do STJ). Conferir a política da empresa.',
    T078: 'Programa educacional disponível a todos os empregados e dirigentes, sem substituir a remuneração (Lei 12.513/2011). Conferir o regulamento.',
    T079: 'Plano de previdência complementar aberto à totalidade dos empregados e dirigentes. Conferir o regulamento do plano.',
    T080: 'Diárias: não integram até 50% da remuneração mensal (Lei 8.212/91, art. 28, §8º, a); ponto controvertido após a Lei 13.467/2017. Ajuda de custo: só parcela única por mudança de local (art. 470 da CLT).',
    T081: 'Seguro de vida em grupo previsto em acordo ou convenção coletiva e extensivo aos empregados. Conferir a apólice e o instrumento coletivo.',
    T082: 'Estágio regular (Lei 11.788/2008): termo de compromisso, instituição de ensino e supervisão. Conferir os termos.',
    T085: 'Planejamento: só vale se a atividade estiver na Lei 12.546/2011 e a opção pela CPRB for feita no prazo. Não é crédito dos últimos 5 anos.',
    T086: 'Tese controvertida: depende do desenho do plano (adesão voluntária, risco do beneficiário, onerosidade). Conferir o contrato do plano.',
    T089: 'Confirmar que o evento repetido foi totalizado nas bases da DCTFWeb e que o recolhimento incluiu as duas bases.',
    T094: 'Conferir se o 13º foi mesmo declarado na competência mensal e no S-1200 do 13º (indApuracao 2) e recolhido nas duas bases.',
    T095: 'Conferir se a rubrica repetida nas duas lotações é a mesma verba (e não pagamentos distintos) e se o RAT/terceiros foi recolhido sobre as duas bases.',
    T096: 'Conferir se a verba foi mesmo paga uma vez só e se a contribuição foi recolhida sobre as duas declarações.'
  };
  // Regras por descrição da rubrica (norm). A primeira que casar vale. A categoria 901 tem precedência (T082).
  var REGRAS = [
    { id: 'T077', re: /CRECHE|\bBABA\b/, motivo: 'auxílio-creche ou babá' },
    { id: 'T079', re: /PREVID(ENCIA)? ?(PRIVADA|COMPL)|\bPGBL\b|\bVGBL\b|FUNDO DE PENSAO|PLANO DE PENSAO/, motivo: 'previdência privada' },
    { id: 'T081', re: /SEGURO (DE )?VIDA|SEG\.? ?VIDA/, motivo: 'seguro de vida' },
    { id: 'T086', re: /STOCK ?OPTION|OPCAO DE COMPRA|OPCOES? DE ACOES|\bILP\b|INCENTIVO DE LONGO PRAZO|PHANTOM|\bRSU\b/, motivo: 'stock options / incentivo de longo prazo' },
    { id: 'T078', re: /EDUCA(CAO|CIONAL)|BOLSA (DE )?(ESTUDOS?|GRADUACAO|FORMACAO)|AUX(ILIO)?\.? ?(ESCOLAR|ESTUDOS?|EDUCACAO)|MENSALIDADE (ESCOLAR|FACULDADE)|FACULDADE|\bIDIOMAS?\b/, motivo: 'educação' },
    { id: 'T080', re: /AJUDA DE CUSTO|DIARIAS?/, motivo: 'ajuda de custo ou diárias' }
  ];
  var RE_13 = /\b13[ºO°.]?\s?(SAL|SALARIO)|DECIMO TERCEIRO|GRAT\w* (DE )?NATAL/;
  var RE_DIARIA = /DIARIAS?/, RE_SALFAM = /SALARIO[ -]?FAMILIA|SAL\.? ?FAMILIA/, RE_COOP = /COOPERATIV/;
  var CHECKLIST = {
    T084: { documentos: ['Notas fiscais/faturas de cessão de mão de obra ou empreitada', 'Retenções de 11% no EFD-Reinf (R-2010/R-2020) e na DCTFWeb', 'Compensações já feitas na guia'], motivo: 'Retenção de 11% não aparece no eSocial: depende do EFD-Reinf e da DCTFWeb.' },
    T085: { documentos: ['Receita bruta mensal por atividade', 'Alíquota da CPRB aplicável (Lei 12.546/2011)', 'Opção anual pela CPRB (DCTFWeb de janeiro)'], motivo: 'Comparar CPRB e folha exige a receita bruta, que não consta do eSocial.' },
    T092: { documentos: ['DARF/guias da DCTFWeb pagas', 'Extrato de pagamentos do e-CAC', 'Relatório de débitos x pagamentos por competência'], motivo: 'Guia paga em duplicidade só aparece no extrato de pagamentos.' },
    T093: { documentos: ['Notas fiscais retidas', 'EFD-Reinf R-2010/R-2020', 'DCTFWeb com as retenções'], motivo: 'Retenção de 11% em duplicidade depende do EFD-Reinf e da nota fiscal.' }
  };

  // ------------------------------------------------------------------ utilidades (o XML já vem lido por MotorEsocial.lerXml)
  function filho(no, nome) { if (!no) return null; for (var i = 0; i < no.filhos.length; i++) if (no.filhos[i].nome === nome) return no.filhos[i]; return null; }
  function decod(t) { return String(t || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim(); }
  function txt(no, caminho) { var n = no; caminho.split('/').forEach(function (p) { n = filho(n, p); }); return n ? decod(n.texto) : ''; }
  function todos(no, nome, acc) { acc = acc || []; if (!no) return acc; no.filhos.forEach(function (f) { if (f.nome === nome) acc.push(f); todos(f, nome, acc); }); return acc; }
  function num(v) { var n = Number(String(v || '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function acharTxt(no, nomes) {
    var set = nomes.map(function (x) { return x.toLowerCase(); }), res = '';
    (function walk(n) { if (!n) return; n.filhos.forEach(function (f) { if (!res && set.indexOf(f.nome.toLowerCase()) >= 0 && decod(f.texto)) res = decod(f.texto); walk(f); }); })(no);
    return res;
  }
  function mesAnterior(c) { var a = +c.slice(0, 4), m = +c.slice(5, 7) - 1; if (m < 1) { m = 12; a--; } return a + '-' + (m < 10 ? '0' : '') + m; }
  function cincoAnos(hoje) { var d = new Date(hoje || Date.now()); return (d.getFullYear() - 5) + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function cent(v) { return Math.round(v * 100); }
  function vigente(lista, comp) {
    var ok = lista.filter(function (x) { return (!x.ini || x.ini <= comp) && (!x.fim || x.fim >= comp); });
    return (ok.length ? ok : lista)[ok.length ? ok.length - 1 : lista.length - 1] || null;
  }
  function reciboDe(no) { for (var a = no && no.pai; a; a = a.pai) { var r = filho(a, 'recibo'); if (r && txt(r, 'nrRecibo')) return txt(r, 'nrRecibo'); } return ''; }
  function motorBase() {
    if (root.MotorEsocial) return root.MotorEsocial;
    try { if (typeof require !== 'undefined') return require('./motor-esocial.js'); } catch (e) { /* sem o motor principal */ }
    return null;
  }

  // ------------------------------------------------------------------ apuração
  function apurarExtra(lidos, opts) {
    opts = opts || {};
    lidos = lidos || [];
    var ME = motorBase();
    var classificar = typeof opts.classificar === 'function' ? opts.classificar : (ME && ME.classificar) || null;
    var terceiros = opts.terceiros == null ? TERCEIROS_PADRAO : Number(opts.terceiros);
    var limite = cincoAnos(opts.hoje), forcar = opts.forcarEscopo === true;
    var rubricas = {}, estabs = {}, regs = [], cands = [], exclusoes = [], avisos = [];

    lidos.forEach(function (l) {
      (l.eventos || []).forEach(function (ev) {
        var n = ev.no;
        if (ev.tipo === 'S-1000') {
          var info = todos(n, 'infoCadastro')[0], ops = [];
          ['inclusao', 'alteracao'].forEach(function (op) { todos(n, op).forEach(function (o) { ops.push(o); }); });
          if (!ops.length && info) ops.push(n);
          ops.forEach(function (o) {
            var ic = todos(o, 'infoCadastro')[0] || o, ct = acharTxt(ic, ['classTrib']); if (!ct) return;
            var idp = todos(o, 'idePeriodo')[0];
            regs.push({ ini: idp ? txt(idp, 'iniValid') : '', fim: idp ? txt(idp, 'fimValid') : '', classTrib: ct, cprb: acharTxt(ic, ['indDesFolha', 'indDesoneracao', 'indCPRB']) === '1' });
          });
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
              (estabs[txt(ie, 'nrInsc')] = estabs[txt(ie, 'nrInsc')] || []).push({ ini: txt(ie, 'iniValid'), fim: txt(ie, 'fimValid'), rat: num(txt(g, 'aliqRat')), fap: num(txt(g, 'fap')) || 1 });
            });
          });
        } else if (ev.tipo === 'S-1200') {
          var ie2 = filho(n, 'ideEvento'), it = filho(n, 'ideTrabalhador');
          var per = txt(ie2, 'perApur'), ind = txt(ie2, 'indApuracao') || '1';
          cands.push({ tipo: 'S-1200', chave: txt(it, 'cpfTrab') + '|' + per + '|' + ind, cpf: txt(it, 'cpfTrab'), comp: /^\d{4}$/.test(per) ? per + '-12' : per, ind: ind, retif: txt(ie2, 'indRetif') === '2', no: n, recibo: reciboDe(n), id: ev.id });
        } else if (ev.tipo === 'S-2299') {
          var cpfR = acharTxt(n, ['cpfTrab']), dt = acharTxt(n, ['dtDeslig']), pr = acharTxt(filho(n, 'ideEvento'), ['perApur']);
          var compR = /^\d{4}$/.test(pr) ? pr + '-12' : (pr || dt.slice(0, 7));
          cands.push({ tipo: 'S-2299', chave: cpfR + '|' + compR + '|resc', cpf: cpfR, comp: compR, ind: 'resc', retif: txt(filho(n, 'ideEvento'), 'indRetif') === '2', no: n, recibo: reciboDe(n), id: ev.id });
        } else if (ev.tipo === 'S-3000') {
          exclusoes.push({ nrRecEvt: acharTxt(n, ['nrRecEvt']) });
        }
      });
    });
    exclusoes.forEach(function (x) { if (x.nrRecEvt) cands = cands.filter(function (c) { return !(c.recibo && c.recibo === x.nrRecEvt); }); });

    // evento que vale = o último original, ou a retificadora; os demais originais da mesma chave são os "repetidos" (T089)
    var remun = {}, grupos = {};
    cands.forEach(function (c) { (grupos[c.chave] = grupos[c.chave] || []).push(c); if (!remun[c.chave] || c.retif || !remun[c.chave].retif) remun[c.chave] = c; });

    var hist = (function () { // histórico do regime (S-1000), mesmo critério do motor principal
      var porIni = {}; regs.forEach(function (r) { porIni[r.ini || ''] = r; });
      var l = Object.keys(porIni).sort().map(function (k) { return porIni[k]; });
      return l.map(function (r, i) { return { ini: r.ini || null, fim: r.fim || (l[i + 1] && l[i + 1].ini ? mesAnterior(l[i + 1].ini) : null), classTrib: r.classTrib, cprb: r.cprb }; });
    })();
    var regimeNaoIdent = false, foraEscopo = {};
    function regime(comp) {
      var ok = null; hist.forEach(function (h) { if (!h.ini || h.ini <= comp) ok = h; });
      if (ok && ok.fim && ok.fim < comp) ok = null;
      if (!ok || !ok.classTrib) { regimeNaoIdent = true; return { ok: true, cprb: false }; }
      return { ok: ok.classTrib === '99', cprb: ok.cprb, classTrib: ok.classTrib };
    }
    var semEstab = {};
    function taxa(comp, nrInsc, reg) { // alíquota total e a parte RAT×FAP + terceiros
      var est = estabs[nrInsc] ? vigente(estabs[nrInsc], comp) : null;
      if (!est) semEstab[nrInsc] = 1;
      var ratTerc = (est ? est.rat / 100 * est.fap : 0) + terceiros;
      var total = opts.aliquota != null ? Number(opts.aliquota) : (reg.cprb ? 0 : CPP) + ratTerc;
      return { total: total, ratTerc: opts.aliquota != null ? Number(opts.aliquota) : ratTerc };
    }
    function compDoEl(el, padrao) {
      for (var a = el.pai, i = 0; a && i < 6; a = a.pai, i++) { var p = filho(a, 'perRef'); if (p && /^\d{4}-\d{2}/.test(txt(a, 'perRef'))) return txt(a, 'perRef').slice(0, 7); }
      return padrao;
    }
    function linhasDe(e) { // todas as linhas de rubrica do evento, com a rubrica vigente
      var out = [], idx = 0;
      todos(e.no, 'dmDev').forEach(function (dm) {
        idx++;
        var categ = txt(dm, 'codCateg') || acharTxt(e.no, ['codCateg']), ideDm = txt(dm, 'ideDmDev') || String(idx);
        todos(dm, 'ideEstabLot').forEach(function (el) {
          var comp = e.tipo === 'S-2299' ? compDoEl(el, e.comp) : e.comp;
          var its = []; ['itensRemun', 'detVerbas'].forEach(function (tg) { todos(el, tg).forEach(function (x) { its.push(x); }); });
          its.forEach(function (ir) {
            var cod = txt(ir, 'codRubr'), tab = txt(ir, 'ideTabRubr'), vr = num(txt(ir, 'vrRubr'));
            var lista = rubricas[tab + '|' + cod], r = lista ? vigente(lista, comp) : null;
            out.push({ ev: e, tipo: e.tipo, cpf: e.cpf, comp: comp, ind: e.ind, categ: categ, dm: ideDm, nrInsc: txt(el, 'nrInsc'), lot: txt(el, 'codLotacao'),
              tab: tab, cod: cod, k: tab + '|' + cod, vr: vr, r: r, dsc: r ? norm(r.dsc) : '', inc: !!(r && r.tpRubr === '1' && INCIDE[r.codIncCP] && vr > 0) });
          });
        });
      });
      return out;
    }

    // ---- acumuladores
    var acc = {}, reclass = {}, reclassLista = [], docs = {};
    function emEscopo(comp) { var reg = regime(comp); if (!reg.ok) { foraEscopo[comp] = reg.classTrib; if (!forcar) return null; } return reg; }
    function lancar(id, l, base, aliq, motivo) {
      if (!(base > 0)) return;
      var t = acc[id] = acc[id] || { id: id, nome: NOMES[id], base: 0, baseNoPrazo: 0, valor: 0, valorNoPrazo: 0, comps: {}, porComp: {}, rubricas: {} };
      var v = base * aliq, noPrazo = l.comp >= limite;
      t.base += base; t.valor += v; t.comps[l.comp] = 1; t.porComp[l.comp] = (t.porComp[l.comp] || 0) + v;
      if (noPrazo) { t.baseNoPrazo += base; t.valorNoPrazo += v; }
      var x = t.rubricas[l.k] = t.rubricas[l.k] || { cod: l.cod, tab: l.tab, dsc: l.r ? l.r.dsc : '', natRubr: l.r ? l.r.natRubr : '', codIncCP: l.r ? l.r.codIncCP : '', motivo: motivo, base: 0 };
      x.base += base;
      if (classificar && l.r && !reclass[id + '|' + l.k]) {
        var pr = classificar(l.r.dsc, l.tipo === 'S-2299');
        if (pr) { reclass[id + '|' + l.k] = 1; reclassLista.push({ rubrica: l.k, descricao: l.r.dsc, de: pr.id, para: id }); }
      }
    }
    function pedirDoc(id, documentos, motivo, extra) {
      var d = docs[id] = docs[id] || { id: id, nome: NOMES[id], documentos: documentos, motivo: motivo, valor: 0 };
      if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
    }

    // ---- linhas dos eventos válidos
    var linhas = [];
    Object.keys(remun).forEach(function (k) { linhasDe(remun[k]).forEach(function (l) { linhas.push(l); }); });

    // classificação por linha (T077 a T082, T086)
    function teseDe(l) {
      if (!l.inc) return null;
      if (l.categ === '901') return { id: 'T082', motivo: 'bolsa de estágio (categoria 901)' };
      for (var i = 0; i < REGRAS.length; i++) if (REGRAS[i].re.test(l.dsc)) return REGRAS[i];
      return null;
    }
    // base de remuneração por trabalhador e competência (para o teto de 50% das diárias) e meses de ajuda de custo
    var remBase = {}, ajudaMeses = {}, diariaTot = {};
    linhas.forEach(function (l) {
      if (!l.inc) return;
      var t = teseDe(l), kc = l.cpf + '|' + l.comp;
      if (t && t.id === 'T080') {
        if (RE_DIARIA.test(l.dsc)) diariaTot[kc] = (diariaTot[kc] || 0) + l.vr;
        else { (ajudaMeses[l.cpf] = ajudaMeses[l.cpf] || {})[l.comp] = 1; }
      } else remBase[kc] = (remBase[kc] || 0) + l.vr;
    });
    var diariaAcima = {}, ajudaVarias = 0;
    linhas.forEach(function (l) {
      var t = teseDe(l); if (!t) return;
      var reg = emEscopo(l.comp); if (!reg) return;
      var kc = l.cpf + '|' + l.comp;
      if (t.id === 'T080') {
        if (RE_DIARIA.test(l.dsc)) { if (diariaTot[kc] > 0.5 * (remBase[kc] || 0)) { diariaAcima[l.comp] = 1; return; } }
        else if (Object.keys(ajudaMeses[l.cpf] || {}).length > 1) { ajudaVarias++; return; }
      }
      lancar(t.id, l, l.vr, taxa(l.comp, l.nrInsc, reg).total, t.motivo);
    });
    if (Object.keys(diariaAcima).length) avisos.push('Diárias acima de 50% da remuneração mensal integram o salário de contribuição pelo valor total (Lei 8.212/91, art. 28, §8º, a): não entraram na T080 (competências ' + Object.keys(diariaAcima).sort().join(', ') + ').');
    if (ajudaVarias) avisos.push('Ajuda de custo paga em mais de uma competência ao mesmo trabalhador é habitual e integra o salário: ' + ajudaVarias + ' lançamento(s) fora da T080 (só parcela única entra).');

    // T089: eventos originais repetidos (mesma chave); o último original vale, os outros são a base cobrada a mais
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k], valido = remun[k];
      if (valido.retif) return; // havendo retificadora, os originais foram substituídos de forma regular
      g.forEach(function (c) {
        if (c === valido || c.retif) return;
        linhasDe(c).forEach(function (l) {
          if (!l.inc) return;
          var reg = emEscopo(l.comp); if (!reg) return;
          lancar('T089', l, l.vr, taxa(l.comp, l.nrInsc, reg).total, 'evento original repetido (' + c.tipo + ')');
        });
      });
    });

    // T094: 13º na folha mensal (indApuracao 1) e também no 13º (indApuracao 2) do mesmo ano
    var anual = {}, mensal13 = {};
    linhas.forEach(function (l) {
      if (!l.inc) return;
      var ano = l.comp.slice(0, 4), kc = l.cpf + '|' + ano;
      if (l.ind === '2') anual[kc] = (anual[kc] || 0) + l.vr;
      else if (l.ind === '1' && RE_13.test(l.dsc)) (mensal13[kc] = mensal13[kc] || []).push(l);
    });
    Object.keys(mensal13).forEach(function (kc) {
      if (!(anual[kc] > 0)) return;
      var ls = mensal13[kc], soma = ls.reduce(function (s, l) { return s + l.vr; }, 0), dup = Math.min(soma, anual[kc]), fator = dup / soma;
      ls.forEach(function (l) {
        var reg = emEscopo(l.comp); if (!reg) return;
        lancar('T094', l, l.vr * fator, taxa(l.comp, l.nrInsc, reg).total, '13º salário declarado também no 13º (indApuracao 2)');
      });
    });

    // T095: mesma rubrica e valor repetida em lotações diferentes do mesmo dmDev (só RAT×FAP + terceiros); rubricas que o motor principal já credita ficam de fora
    var porDm = {};
    linhas.forEach(function (l) { if (l.inc && l.tipo === 'S-1200') (porDm[l.ev.chave + '|' + l.dm] = porDm[l.ev.chave + '|' + l.dm] || []).push(l); });
    Object.keys(porDm).forEach(function (kd) {
      var g = {};
      porDm[kd].forEach(function (l) { (g[l.k + '|' + cent(l.vr)] = g[l.k + '|' + cent(l.vr)] || []).push(l); });
      Object.keys(g).forEach(function (kk) {
        var ls = g[kk], lots = {}; ls.forEach(function (l) { lots[l.nrInsc + '|' + l.lot] = 1; });
        if (Object.keys(lots).length < 2) return;
        if (classificar && ls[0].r && classificar(ls[0].r.dsc, false)) return;
        var vistos = {}; vistos[ls[0].nrInsc + '|' + ls[0].lot] = 1; // a primeira lotação fica; as demais são a base repetida
        ls.forEach(function (l) {
          var kl = l.nrInsc + '|' + l.lot; if (vistos[kl]) return; vistos[kl] = 1;
          var reg = emEscopo(l.comp); if (!reg) return;
          lancar('T095', l, l.vr, taxa(l.comp, l.nrInsc, reg).ratTerc, 'mesma rubrica e valor em outra lotação do mesmo dmDev');
        });
      });
    });

    // T096: verba da rescisão (S-2299) que também está na folha (S-1200) da mesma competência, mesma descrição e valor
    var folhaPool = {};
    linhas.forEach(function (l) { if (l.inc && l.tipo === 'S-1200' && l.ind === '1') { var kk = l.cpf + '|' + l.comp + '|' + l.dsc + '|' + cent(l.vr); folhaPool[kk] = (folhaPool[kk] || 0) + 1; } });
    linhas.forEach(function (l) {
      if (!l.inc || l.tipo !== 'S-2299') return;
      var kk = l.cpf + '|' + l.comp + '|' + l.dsc + '|' + cent(l.vr);
      if (!folhaPool[kk]) return;
      folhaPool[kk]--;
      if (classificar && l.r && classificar(l.r.dsc, true)) return;
      var reg = emEscopo(l.comp); if (!reg) return;
      lancar('T096', l, l.vr, taxa(l.comp, l.nrInsc, reg).total, 'verba da rescisão também declarada na folha');
    });

    // T085: CPRB x folha (planejamento) — só com receita bruta e alíquota informadas
    var planej = null;
    if (opts.receitaBruta && opts.aliquotaCprb != null) {
      var baseComp = {}; linhas.forEach(function (l) { if (l.inc) baseComp[l.comp] = (baseComp[l.comp] || 0) + l.vr; });
      var t85 = { id: 'T085', nome: NOMES.T085, base: 0, baseNoPrazo: 0, valor: 0, valorNoPrazo: 0, comps: {}, porComp: {}, rubricas: {} };
      Object.keys(opts.receitaBruta).forEach(function (c) {
        var reg = regime(c); if (!reg.ok || reg.cprb || !baseComp[c]) return;
        var folha = baseComp[c] * CPP, cprb = Number(opts.receitaBruta[c]) * Number(opts.aliquotaCprb), eco = folha - cprb;
        if (eco <= 0) return;
        t85.base += baseComp[c]; t85.valor += eco; t85.comps[c] = 1; t85.porComp[c] = eco; if (c >= limite) { t85.baseNoPrazo += baseComp[c]; t85.valorNoPrazo += eco; }
      });
      if (t85.valor > 0) planej = t85;
    } else if (opts.incluirChecklist) pedirDoc('T085', CHECKLIST.T085.documentos, CHECKLIST.T085.motivo);

    // ---- itens que precisam de documento
    var cooperativa = false, salFam = {}, estabsUsados = {}, multiDm = {}, cprbBase = {}, algumCprb = false;
    linhas.forEach(function (l) {
      if (l.r && RE_COOP.test(l.dsc)) cooperativa = true;
      if (l.r && RE_SALFAM.test(l.dsc) && l.vr > 0) salFam[l.comp] = (salFam[l.comp] || 0) + l.vr;
      if (l.nrInsc) estabsUsados[l.nrInsc] = 1;
      if (l.inc) { var reg = regime(l.comp); if (reg.cprb) { algumCprb = true; cprbBase[l.comp] = (cprbBase[l.comp] || 0) + l.vr; } }
    });
    // INSS do segurado em mais de um dmDev do mesmo trabalhador e competência
    var inssDm = {};
    linhas.forEach(function (l) { if (l.r && l.r.tpRubr === '2' && (l.r.natRubr === '9201' || (l.r.codIncCP === '31' && /INSS|PREVID/.test(l.dsc))) && l.vr > 0) { var kc = l.cpf + '|' + l.comp; (inssDm[kc] = inssDm[kc] || {})[l.dm] = 1; } });
    Object.keys(inssDm).forEach(function (kc) { if (Object.keys(inssDm[kc]).length > 1) multiDm[kc.split('|')[1]] = (multiDm[kc.split('|')[1]] || 0) + 1; });

    if (cooperativa) pedirDoc('T083', ['Notas fiscais/faturas das cooperativas de trabalho', 'Contribuição de 15% recolhida (DCTFWeb/EFD-Reinf R-2010)', 'Decisão ou ação sobre o Tema 166 do STF'], 'Há rubrica de cooperativa na folha; o valor depende das notas fiscais e do recolhimento dos 15%.');
    if (Object.keys(salFam).length) pedirDoc('T087', ['Guias/DCTFWeb com a compensação do salário-família', 'Relatório de benefícios pagos pela empresa'], 'Salário-família pago na folha: compensação na guia não é visível no eSocial. Valor de referência = total pago.', { valorReferencia: r2(Object.keys(salFam).reduce(function (s, c) { return s + salFam[c]; }, 0)), competencias: Object.keys(salFam).sort() });
    if (Object.keys(multiDm).length) {
      pedirDoc('T088', ['Extrato do CNIS do trabalhador (todos os vínculos)', 'GPS/DCTFWeb dos demais empregadores', 'Folha de pagamento dos demais empregadores'], 'Trabalhadores com INSS retido em mais de um vínculo na mesma competência. O excesso dentro do mesmo S-1200 já está na T074; a parte entre empregadores diferentes precisa do CNIS.', { competencias: Object.keys(multiDm).sort(), trabalhadores: Object.keys(multiDm).reduce(function (s, c) { return s + multiDm[c]; }, 0) });
      avisos.push('T088: ' + Object.keys(multiDm).length + ' competência(s) com trabalhadores com INSS retido em mais de um vínculo; o excesso dentro do mesmo S-1200 já está na T074 (não somar).');
    }
    if (Object.keys(estabsUsados).length > 1) pedirDoc('T091', ['DARF/DCTFWeb por estabelecimento (matriz e filiais)', 'Comprovantes de pagamento com o CNPJ do recolhimento', 'Relatório de débitos por estabelecimento'], 'A folha tem mais de um estabelecimento: recolhimento no CNPJ errado só aparece nas guias.', { estabelecimentos: Object.keys(estabsUsados).length });
    if (algumCprb) {
      var potCprb = Object.keys(cprbBase).reduce(function (s, c) { return s + cprbBase[c] * CPP; }, 0);
      pedirDoc('T090', ['DCTFWeb/DARF com o recolhimento de 20% de CPP nas competências em CPRB', 'Extrato de pagamentos do e-CAC'], 'Há competências com CPRB (indDesFolha = 1): se os 20% de CPP também foram recolhidos, há pagamento indevido. Valor de referência = 20% sobre a base com incidência.', { valorReferencia: r2(potCprb), competencias: Object.keys(cprbBase).sort() });
    }
    if (opts.incluirChecklist) ['T084', 'T092', 'T093'].forEach(function (id) { pedirDoc(id, CHECKLIST[id].documentos, CHECKLIST[id].motivo); });

    // ---- resultado
    var teses = Object.keys(acc).map(function (id) {
      var t = acc[id];
      return { id: id, nome: t.nome, base: r2(t.base), baseNoPrazo: r2(t.baseNoPrazo), valor: r2(t.valor), valorNoPrazo: r2(t.valorNoPrazo),
        competencias: Object.keys(t.comps).length, condicional: true, condicao: CONDICOES[id] || null, natureza: 'credito', origem: 'esocial-extra',
        porCompetencia: Object.keys(t.porComp).sort().map(function (c) { return { competencia: c, valor: r2(t.porComp[c]), noPrazo: c >= limite }; }),
        rubricas: Object.keys(t.rubricas).map(function (k) { var x = t.rubricas[k]; return Object.assign({}, x, { base: r2(x.base) }); }).sort(function (a, b) { return b.base - a.base; }) };
    });
    if (planej) teses.push({ id: 'T085', nome: NOMES.T085, base: r2(planej.base), baseNoPrazo: r2(planej.baseNoPrazo), valor: r2(planej.valor), valorNoPrazo: r2(planej.valorNoPrazo),
      competencias: Object.keys(planej.comps).length, condicional: true, condicao: CONDICOES.T085, natureza: 'planejamento', origem: 'esocial-extra',
      porCompetencia: Object.keys(planej.porComp).sort().map(function (c) { return { competencia: c, valor: r2(planej.porComp[c]), noPrazo: c >= limite }; }), rubricas: [] });
    teses.sort(function (a, b) { return b.valorNoPrazo - a.valorNoPrazo; });
    if (Object.keys(foraEscopo).length && !forcar) avisos.push('Competências fora do escopo (classTrib diferente de 99) não foram calculadas: ' + Object.keys(foraEscopo).sort().join(', ') + '.');
    if (regimeNaoIdent) avisos.push('Regime não identificado em parte das competências: calculado como Lucro Real/Presumido.');
    if (Object.keys(semEstab).length) avisos.push('Estabelecimento sem S-1005 (' + Object.keys(semEstab).join(', ') + '): RAT×FAP não aplicado nas teses extras.');
    return {
      versao: VERSAO,
      teses: teses,
      avisos: avisos.filter(function (a, i) { return avisos.indexOf(a) === i; }),
      requerDocumento: Object.keys(docs).sort().map(function (id) { return docs[id]; }),
      reclassifica: reclassLista
    };
  }

  var api = { VERSAO: VERSAO, apurarExtra: apurarExtra, NOMES: NOMES, CONDICOES: CONDICOES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorEsocialExtra = api;
})(typeof self !== 'undefined' ? self : this);
