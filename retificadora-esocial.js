/*
 * Reversa Tax — pacote de retificação do eSocial para teses previdenciárias aprovadas.
 * Roda no navegador (window.RetificadoraEsocial) e no Node. Os XML do cliente não saem da máquina.
 *
 * Sequência gerada (Manual de Orientação do eSocial: retificação de eventos periódicos):
 *   1. S-1010 (evtTabRubrica) — alteração da incidência previdenciária (codIncCP) das rubricas escolhidas
 *      a partir da competência inicial. Se a rubrica vigora desde antes, o registro atual é encerrado na
 *      competência anterior (novaValidade) e um novo registro é incluído com a nova incidência.
 *   2. Por competência fechada: S-1298 (reabertura) → S-1200 retificadores (indRetif = 2 e nrRecibo do original)
 *      dos trabalhadores com as rubricas → S-1299 (fechamento, com as mesmas indicações do fechamento original).
 *   Depois do fechamento, a DCTFWeb da competência é recalculada pelos totalizadores e deve ser retransmitida;
 *   o crédito vai para o PER/DCOMP Web.
 *
 * O sistema não decide a incidência: a equipe escolhe as rubricas e a nova incidência (padrão 00 — não é base),
 * conforme as teses aprovadas pelo cliente. Os XML saem sem assinatura: a assinatura digital (certificado do
 * procurador ou da empresa) e o envio são feitos no programa de transmissão.
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var LEIAUTE = 'v_S_01_03_00';
  var NS = 'http://www.esocial.gov.br/schema/evt/';
  var INCIDENCIAS = { '00': 'Não é base de cálculo', '11': 'Base de cálculo mensal', '12': 'Base de cálculo 13º salário', '21': 'Salário-maternidade mensal pago pelo empregador', '22': 'Salário-maternidade 13º pago pelo empregador' };

  function ME() { return root.MotorEsocial || (typeof require === 'function' ? require('./motor-esocial.js') : null); }
  function filho(no, nome) { if (!no) return null; for (var i = 0; i < no.filhos.length; i++) if (no.filhos[i].nome === nome) return no.filhos[i]; return null; }
  function todos(no, nome, acc) { acc = acc || []; if (!no) return acc; no.filhos.forEach(function (f) { if (f.nome === nome) acc.push(f); todos(f, nome, acc); }); return acc; }
  function txt(no, caminho) { var n = no; caminho.split('/').forEach(function (p) { n = filho(n, p); }); return n ? String(n.texto || '').trim() : ''; }
  function escTxt(s) { return String(s).replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function el(nome, filhos) { return { nome: nome, filhos: filhos || [], texto: '', attrs: {} }; }
  function folha(nome, valor) { return { nome: nome, filhos: [], texto: escTxt(valor), attrs: {} }; }
  function clonar(no) { return { nome: no.nome, filhos: no.filhos.map(clonar), texto: no.texto, attrs: Object.assign({}, no.attrs) }; }
  function xml(no) {
    var a = Object.keys(no.attrs || {}).map(function (k) { return ' ' + k + '="' + String(no.attrs[k]).replace(/"/g, '&quot;') + '"'; }).join('');
    if (!no.filhos.length) { var t = String(no.texto || '').trim(); return '<' + no.nome + a + (t ? '>' + t + '</' + no.nome + '>' : '/>'); }
    return '<' + no.nome + a + '>' + no.filhos.map(xml).join('') + '</' + no.nome + '>';
  }
  function documento(evt, corpo) {
    return '<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="' + NS + evt + '/' + LEIAUTE + '">' + xml(corpo) + '</eSocial>';
  }
  // Id do evento: "ID" + tpInsc + nrInsc (14 posições) + AAAAMMDDHHMMSS + sequencial (5).
  function idEvento(tpInsc, nrInsc, quando, seq) {
    var d = quando, p = function (n, t) { n = String(n); while (n.length < t) n = '0' + n; return n; };
    var ins = String(nrInsc); while (ins.length < 14) ins += '0';
    return 'ID' + tpInsc + ins + d.getUTCFullYear() + p(d.getUTCMonth() + 1, 2) + p(d.getUTCDate(), 2) + p(d.getUTCHours(), 2) + p(d.getUTCMinutes(), 2) + p(d.getUTCSeconds(), 2) + p(seq, 5);
  }
  function compAnterior(c) { var a = +c.slice(0, 4), m = +c.slice(5, 7) - 1; if (!m) { m = 12; a--; } return a + '-' + (m < 10 ? '0' : '') + m; }
  function cpfOk(c) {
    if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
    return true;
  }
  // Recibo do evento original: no retorno do eSocial que acompanha o XML baixado (fora do próprio evento).
  function reciboDe(ev) {
    var a = ev.pai;
    while (a) {
      if (todos(a, ev.nome).length > 1) return '';
      var recs = todos(a, 'recibo').map(function (r) { return txt(r, 'nrRecibo'); }).filter(Boolean);
      if (recs.length) return recs[0];
      a = a.pai;
    }
    return '';
  }
  function cent(v) { var n = Number(String(v || '0').replace(',', '.')); return Math.round((isFinite(n) ? n : 0) * 100); }

  /** Lê os eventos relevantes dos XML (já lidos por MotorEsocial.lerXml). */
  function indexar(lidos) {
    var rub = {}, s1200 = {}, s1299 = {}, estab = {}, emp = null;
    lidos.forEach(function (l) {
      l.eventos.forEach(function (e) {
        var n = e.no, ide = filho(n, 'ideEmpregador');
        if (ide && !emp) emp = { tpInsc: txt(ide, 'tpInsc') || '1', nrInsc: txt(ide, 'nrInsc') };
        if (e.tipo === 'S-1010') {
          ['inclusao', 'alteracao'].forEach(function (op) {
            todos(n, op).forEach(function (o) {
              var ir = filho(o, 'ideRubrica'), dr = filho(o, 'dadosRubrica'); if (!ir || !dr) return;
              var k = txt(ir, 'ideTabRubr') + '|' + txt(ir, 'codRubr');
              var nv = filho(o, 'novaValidade');
              (rub[k] = rub[k] || []).push({ cod: txt(ir, 'codRubr'), tab: txt(ir, 'ideTabRubr'), ini: nv ? txt(nv, 'iniValid') : txt(ir, 'iniValid'), fim: nv ? txt(nv, 'fimValid') : txt(ir, 'fimValid'),
                dsc: txt(dr, 'dscRubr'), codIncCP: txt(dr, 'codIncCP'), tpRubr: txt(dr, 'tpRubr'), dados: dr });
            });
          });
        } else if (e.tipo === 'S-1200') {
          var ie = filho(n, 'ideEvento'), per = txt(ie, 'perApur'), ind = txt(ie, 'indApuracao') || '1';
          var k2 = txt(n, 'ideTrabalhador/cpfTrab') + '|' + per + '|' + ind, retif = txt(ie, 'indRetif') === '2';
          if (!s1200[k2] || retif || !s1200[k2].retif) s1200[k2] = { no: n, per: per, ind: ind, cpf: txt(n, 'ideTrabalhador/cpfTrab'), retif: retif, recibo: reciboDe(n), arquivo: l.arquivo };
        } else if (e.tipo === 'S-1299') {
          var ie3 = filho(n, 'ideEvento');
          s1299[txt(ie3, 'perApur') + '|' + (txt(ie3, 'indApuracao') || '1')] = { no: n, indGuia: txt(ie3, 'indGuia') };
        } else if (e.tipo === 'S-1005') {
          todos(n, 'dadosEstab').forEach(function (d) { var g = filho(d, 'aliqGilrat'); if (g) estab.ratAj = Number(txt(g, 'aliqRat') || 0) / 100 * (Number(txt(g, 'fap') || 1) || 1); });
        }
      });
    });
    Object.keys(rub).forEach(function (k) { rub[k].sort(function (a, b) { return a.ini < b.ini ? -1 : 1; }); });
    return { rub: rub, s1200: s1200, s1299: s1299, emp: emp, ratAj: estab.ratAj || 0 };
  }

  /** Rubricas de vencimento com incidência patronal, para a equipe escolher o que retificar. */
  function rubricas(lidos) {
    var ix = indexar(lidos), uso = {};
    Object.keys(ix.s1200).forEach(function (k) {
      var e = ix.s1200[k];
      todos(e.no, 'itensRemun').forEach(function (it) {
        var kk = txt(it, 'ideTabRubr') + '|' + txt(it, 'codRubr'); var u = uso[kk] = uso[kk] || { base: 0, comps: {} };
        u.base += cent(txt(it, 'vrRubr')); u.comps[e.per] = 1;
      });
    });
    var cls = ME() && ME().classificar;
    return Object.keys(ix.rub).map(function (k) {
      var r = ix.rub[k][ix.rub[k].length - 1], c = cls ? cls(r.dsc) : null;
      return { chave: k, cod: r.cod, tab: r.tab, dsc: r.dsc, tpRubr: r.tpRubr, codIncCP: r.codIncCP, tese: c ? c.id : null, motivo: c ? c.motivo : null,
        base: uso[k] ? uso[k].base : 0, competencias: uso[k] ? Object.keys(uso[k].comps).length : 0 };
    }).filter(function (r) { return r.tpRubr === '1' && ['11', '12', '21', '22'].indexOf(r.codIncCP) >= 0 && r.base > 0; })
      .sort(function (a, b) { return b.base - a.base; });
  }

  /**
   * @param lidos  saídas de MotorEsocial.lerXml (S-1005, S-1010, S-1200, S-1299 do período)
   * @param opts   { rubricas: [{chave, novoCodIncCP}], desde: 'AAAA-MM', recibos: {chaveS1200: nrRecibo}, agora: Date, terceiros }
   */
  function gerar(lidos, opts) {
    opts = opts || {};
    var ix = indexar(lidos), erros = [], avisos = [], arquivos = [], seq = 0, agora = opts.agora || new Date();
    var desde = String(opts.desde || ''), terceiros = opts.terceiros == null ? 0.058 : opts.terceiros;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(desde)) erros.push('Informe a competência inicial (AAAA-MM).');
    if (!ix.emp || !ix.emp.nrInsc) erros.push('Empregador não identificado nos XML.');
    var escolhidas = (opts.rubricas || []).filter(function (r) { return ix.rub[r.chave]; });
    if (!escolhidas.length) erros.push('Escolha ao menos uma rubrica.');
    escolhidas.forEach(function (r) { if (!INCIDENCIAS[r.novoCodIncCP || '00']) erros.push('Incidência inválida para a rubrica ' + r.chave.split('|')[1] + '.'); });
    if (erros.length) return { versao: VERSAO, arquivos: [], erros: erros, avisos: avisos, competencias: [] };
    var emp = ix.emp, ideEmp = function () { return el('ideEmpregador', [folha('tpInsc', emp.tpInsc), folha('nrInsc', emp.nrInsc)]); };
    var verProc = 'Reversa ' + VERSAO;
    function novo(evt, nome, filhos) { var id = idEvento(emp.tpInsc, emp.nrInsc, agora, ++seq); var c = el(evt, filhos); c.attrs.Id = id; arquivos.push({ ordem: arquivos.length + 1, nome: nome, evento: evt, id: id, xml: documento(evt, c) }); }

    // 1. S-1010
    var novaInc = {};
    escolhidas.forEach(function (r) {
      var lista = ix.rub[r.chave], cod = r.novoCodIncCP || '00';
      novaInc[r.chave] = cod;
      lista.filter(function (x) { return !x.fim || x.fim >= desde; }).forEach(function (x) {
        if (x.codIncCP === cod) return;
        var ide = function (ini, fim) { var f = [folha('codRubr', x.cod), folha('ideTabRubr', x.tab), folha('iniValid', ini)]; if (fim) f.push(folha('fimValid', fim)); return el('ideRubrica', f); };
        var dados = function (inc) { var d = clonar(x.dados); var c = filho(d, 'codIncCP'); if (c && inc) c.texto = inc; return d; };
        var ops = [];
        if (x.ini < desde) {
          // encerra o registro vigente na competência anterior e inclui o novo a partir de "desde"
          ops.push(el('alteracao', [ide(x.ini, x.fim), dados(null), el('novaValidade', [folha('iniValid', x.ini), folha('fimValid', compAnterior(desde))])]));
          novo('evtTabRubrica', 'S-1010-' + x.cod + '-encerra-' + compAnterior(desde) + '.xml', [el('ideEvento', [folha('tpAmb', '1'), folha('procEmi', '1'), folha('verProc', verProc)]), ideEmp(), el('infoRubrica', ops)]);
          ops = [el('inclusao', [ide(desde, x.fim), dados(cod)])];
          novo('evtTabRubrica', 'S-1010-' + x.cod + '-inclui-' + desde + '.xml', [el('ideEvento', [folha('tpAmb', '1'), folha('procEmi', '1'), folha('verProc', verProc)]), ideEmp(), el('infoRubrica', ops)]);
        } else {
          ops.push(el('alteracao', [ide(x.ini, x.fim), dados(cod)]));
          novo('evtTabRubrica', 'S-1010-' + x.cod + '-altera-' + x.ini + '.xml', [el('ideEvento', [folha('tpAmb', '1'), folha('procEmi', '1'), folha('verProc', verProc)]), ideEmp(), el('infoRubrica', ops)]);
        }
      });
    });

    // 2. Competências: S-1298 → S-1200 retificadores → S-1299
    var porComp = {};
    Object.keys(ix.s1200).forEach(function (k) {
      var e = ix.s1200[k];
      if (e.per.length !== 7 || e.per < desde) return;
      var base = 0;
      todos(e.no, 'itensRemun').forEach(function (it) { var kk = txt(it, 'ideTabRubr') + '|' + txt(it, 'codRubr'); if (novaInc[kk] && cent(txt(it, 'vrRubr')) > 0) base += cent(txt(it, 'vrRubr')); });
      if (!base) return;
      (porComp[e.per + '|' + e.ind] = porComp[e.per + '|' + e.ind] || []).push({ chave: k, ev: e, base: base });
    });
    var competencias = Object.keys(porComp).sort().map(function (ck) {
      var per = ck.split('|')[0], ind = ck.split('|')[1], lista = porComp[ck], fech = ix.s1299[ck];
      var res = { competencia: per, indApuracao: ind, trabalhadores: lista.length, baseRetirada: 0, contribuicaoEstimada: 0, eventos: 0, pendencias: [] };
      if (!fech) res.pendencias.push('S-1299 original da competência não enviado: inclua o fechamento baixado do eSocial.');
      lista.forEach(function (x) {
        if (!cpfOk(x.ev.cpf)) res.pendencias.push('CPF inválido no S-1200 de ' + x.ev.cpf + '.');
        if (!(x.ev.recibo || (opts.recibos || {})[x.chave])) res.pendencias.push('Recibo do S-1200 original não encontrado (CPF ' + x.ev.cpf + ').');
      });
      res.pendencias = res.pendencias.filter(function (p, i, a) { return a.indexOf(p) === i; });
      if (res.pendencias.length) { res.pendencias.forEach(function (p) { erros.push(per + ': ' + p); }); return res; }
      var ideEv = function (extra) { var f = [folha('indApuracao', ind), folha('perApur', per)]; if (fech.indGuia) f.push(folha('indGuia', fech.indGuia)); return el('ideEvento', f.concat(extra || []).concat([folha('tpAmb', '1'), folha('procEmi', '1'), folha('verProc', verProc)])); };
      novo('evtReabreEvPer', per + '-1-S-1298-reabertura.xml', [ideEv(), ideEmp()]); res.eventos++;
      lista.forEach(function (x) {
        var c = clonar(x.ev.no); delete c.attrs.Id;
        var ie = filho(c, 'ideEvento'), orig = ie.filhos;
        var manter = function (nome) { var n = orig.filter(function (f) { return f.nome === nome; })[0]; return n ? clonar(n) : null; };
        ie.filhos = [folha('indRetif', '2'), folha('nrRecibo', x.ev.recibo || opts.recibos[x.chave]), manter('indApuracao') || folha('indApuracao', ind), manter('perApur') || folha('perApur', per)]
          .concat(manter('indGuia') ? [manter('indGuia')] : []).concat([folha('tpAmb', '1'), folha('procEmi', '1'), folha('verProc', verProc)]);
        var id = idEvento(emp.tpInsc, emp.nrInsc, agora, ++seq); c.attrs.Id = id;
        arquivos.push({ ordem: arquivos.length + 1, nome: per + '-2-S-1200-' + x.ev.cpf + '.xml', evento: 'evtRemun', id: id, xml: documento('evtRemun', c) });
        res.baseRetirada += x.base; res.eventos++;
      });
      var inf = filho(fech.no, 'infoFech');
      novo('evtFechaEvPer', per + '-3-S-1299-fechamento.xml', [ideEv(), ideEmp(), clonar(inf)]); res.eventos++;
      res.contribuicaoEstimada = Math.round(res.baseRetirada * (0.20 + ix.ratAj + terceiros));
      return res;
    });
    if (!competencias.length) avisos.push('Nenhuma remuneração com as rubricas escolhidas a partir de ' + desde + '.');
    avisos.push('Os XML saem sem assinatura digital: assine e transmita na ordem dos arquivos (S-1010, depois reabertura, retificadores e fechamento de cada competência).');
    avisos.push('Gerado no leiaute ' + LEIAUTE + '. Confira no validador do programa de transmissão antes do envio.');
    if (!ix.ratAj) avisos.push('Sem S-1005: a contribuição estimada não inclui RAT × FAP.');
    return { versao: VERSAO, leiaute: LEIAUTE, arquivos: erros.length ? [] : arquivos, erros: erros, avisos: avisos, competencias: competencias,
      total: { baseRetirada: competencias.reduce(function (s, c) { return s + c.baseRetirada; }, 0), contribuicaoEstimada: competencias.reduce(function (s, c) { return s + c.contribuicaoEstimada; }, 0) } };
  }

  /** Pré-validação estrutural do pacote gerado (não substitui o XSD oficial nem as regras do ambiente nacional). */
  function validar(pacote) {
    var erros = [], ids = {}, M = ME();
    (pacote.arquivos || []).forEach(function (a) {
      var l = M.lerXml(a.xml, a.nome);
      if (l.erros.length) { erros.push(a.nome + ': ' + l.erros[0]); return; }
      if (!/^ID[12]\d{14}\d{14}\d{5}$/.test(a.id)) erros.push(a.nome + ': Id do evento fora do padrão.');
      if (ids[a.id]) erros.push(a.nome + ': Id repetido.'); ids[a.id] = 1;
      var raiz = M.parseXml(a.xml), evt = todos(raiz, a.evento)[0];
      if (!evt) { erros.push(a.nome + ': evento ausente.'); return; }
      var ie = filho(evt, 'ideEvento');
      ['tpAmb', 'procEmi', 'verProc'].forEach(function (c) { if (!txt(ie, c)) erros.push(a.nome + ': ideEvento/' + c + ' obrigatório.'); });
      if (!txt(evt, 'ideEmpregador/nrInsc')) erros.push(a.nome + ': ideEmpregador/nrInsc obrigatório.');
      if (a.evento === 'evtRemun') {
        if (txt(ie, 'indRetif') !== '2' || !txt(ie, 'nrRecibo')) erros.push(a.nome + ': retificador sem indRetif = 2 e nrRecibo.');
        if (!cpfOk(txt(evt, 'ideTrabalhador/cpfTrab'))) erros.push(a.nome + ': CPF inválido.');
        if (!todos(evt, 'itensRemun').length) erros.push(a.nome + ': sem itens de remuneração.');
      }
      if (a.evento === 'evtTabRubrica') todos(evt, 'codIncCP').forEach(function (c) { if (!INCIDENCIAS[String(c.texto).trim()] && !/^(00|01|11|12|21|22|25|26|31|32|34|35|51|91|92|93|94|95|96|97|98)$/.test(String(c.texto).trim())) erros.push(a.nome + ': codIncCP inválido.'); });
      if (a.evento === 'evtFechaEvPer' && !filho(evt, 'infoFech')) erros.push(a.nome + ': infoFech obrigatório.');
    });
    // ordem: cada competência abre, retifica e fecha
    var comps = {};
    (pacote.arquivos || []).forEach(function (a, i) { var m = /^(\d{4}-\d{2})-(\d)-/.exec(a.nome); if (m) (comps[m[1]] = comps[m[1]] || []).push(+m[2]); });
    Object.keys(comps).forEach(function (c) { var s = comps[c]; if (s[0] !== 1 || s[s.length - 1] !== 3 || s.filter(function (x) { return x === 2; }).length < 1) erros.push(c + ': sequência reabertura → retificadores → fechamento incompleta.'); });
    return { erros: erros, eventos: (pacote.arquivos || []).length };
  }

  var api = { VERSAO: VERSAO, LEIAUTE: LEIAUTE, INCIDENCIAS: INCIDENCIAS, rubricas: rubricas, gerar: gerar, validar: validar, idEvento: idEvento, cpfOk: cpfOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RetificadoraEsocial = api;
})(typeof self !== 'undefined' ? self : this);
