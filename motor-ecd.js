/*
 * Reversa Tax — leitor da ECD (Escrituração Contábil Digital, registro 0000 LECD).
 * SOMENTE LEITURA: não aplica nenhuma tese tributária.
 *
 * Leiaute (Ato Cotepe/PMEC; campo n = posição n do registro, com REG = campo 1):
 *   0000: 2 LECD, 3 DT_INI, 4 DT_FIN, 5 NOME, 6 CNPJ, 7 UF, 14 IND_FIN_ESC
 *   I010: 2 IND_ESC, 3 COD_VER_LC
 *   I050: 2 DT_ALT, 3 COD_NAT, 4 IND_CTA (S/A), 5 NIVEL, 6 COD_CTA, 7 COD_CTA_SUP, 8 CTA
 *   I051: plano referencial — ver "duvidas" (usa-se o último campo preenchido como COD_CTA_REF)
 *   I150: 2 DT_INI, 3 DT_FIN
 *   I155: 2 COD_CTA, 3 COD_CCUS, 4 VL_SLD_INI, 5 IND_DC_INI, 6 VL_DEB, 7 VL_CRED, 8 VL_SLD_FIN, 9 IND_DC_FIN
 *   I200: 2 NUM_LCTO, 3 DT_LCTO, 4 VL_LCTO, 5 IND_LCTO (N normal, E encerramento, X extemporâneo)
 *   I250: 2 COD_CTA, 3 COD_CCUS, 4 VL_DC, 5 IND_DC (D/C), 6 NUM_ARQ, 7 COD_HIST_PAD, 8 HIST, 9 COD_PART
 *   J100: 2 COD_AGL, 3 IND_COD_AGL, 4 NIVEL_AGL, 5 COD_AGL_SUP, 6 IND_GRP_BAL, 7 DESCR_COD_AGL,
 *         8 VL_CTA_INI, 9 IND_DC_CTA_INI, 10 VL_CTA_FIN, 11 IND_DC_CTA_FIN, 12 NOTA_EXP_REF
 *   J150: 2 NU_ORDEM, 3 COD_AGL, 4 IND_COD_AGL, 5 NIVEL_AGL, 6 COD_AGL_SUP, 7 DESCR_COD_AGL,
 *         8 VL_CTA_INI, 9 IND_DC_CTA_INI, 10 VL_CTA_FIN, 11 IND_DC_CTA_FIN, 12 IND_GRP_DRE, 13 NOTA_EXP_REF
 * Valores: vírgula decimal, sem separador de milhar. Datas: ddmmaaaa (devolvidas em aaaa-mm-dd).
 * Funciona no navegador (window.MotorEcd) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  // Mínimo de campos (contando REG) para o registro ser lido; abaixo disso vira aviso e o registro é ignorado.
  var MIN = { '0000': 7, 'I010': 3, 'I050': 8, 'I051': 2, 'I150': 3, 'I155': 9, 'I200': 5, 'I250': 5, 'J100': 11, 'J150': 11 };

  var duvidas = [
    'I051: a página de leiaute consultada (documentacao.senior.com.br) lista só REG e COD_CUS, o que não bate com o leiaute vigente. Não confirmei no manual oficial da Receita se o registro tem COD_ENT_REF + COD_CCUS + COD_CTA_REF (versões antigas) ou só COD_CCUS + COD_CTA_REF; por isso o leitor usa o último campo preenchido como COD_CTA_REF.',
    'J100: o campo 10 aparece como VLR_CTA_FIN em uma fonte e VL_CTA_FIN em outra; a posição (10) é a mesma.',
    'Não consegui abrir o manual oficial da Receita/Sped (PDF); posições conferidas em documentação de terceiros (Senior) e na fixture de teste. Confirmar contra o Manual de Orientação do Leiaute da ECD vigente.'
  ];

  function r2(v) { return Math.round(v * 100) / 100; }
  function data(s) { s = String(s || ''); return /^\d{8}$/.test(s) ? s.slice(4) + '-' + s.slice(2, 4) + '-' + s.slice(0, 2) : s; }

  function lerEcd(texto, nome) {
    var out = { arquivo: nome || '', tipo: 'ecd', cnpj: '', empresa: '', ini: '', fin: '', escrituracao: '', versaoLeiaute: '',
      contas: [], planoReferencial: [], saldos: [], lancamentos: [], balanco: [], dre: [], avisos: [], duvidas: duvidas.slice() };
    var mapaContas = {}, atual = null, periodo = null, nLinhas = 0, total9999 = null, temLecd = false;

    function valor(s, reg, campo, nl) {
      s = String(s == null ? '' : s).trim();
      if (!s) return 0;
      if (s.indexOf('.') >= 0) {
        out.avisos.push('Linha ' + nl + ' (' + reg + '): valor "' + s + '" no campo ' + campo + ' tem ponto decimal; o leiaute usa vírgula. Lido como decimal, confira o arquivo.');
        return r2(parseFloat(s.replace(/,/g, '')) || 0);
      }
      var n = parseFloat(s.replace(',', '.'));
      if (isNaN(n)) { out.avisos.push('Linha ' + nl + ' (' + reg + '): valor "' + s + '" no campo ' + campo + ' não é numérico; lido como 0.'); return 0; }
      return r2(n);
    }

    String(texto || '').split(/\r?\n/).forEach(function (ln, i) {
      var nl = i + 1;
      if (!ln.trim()) return;
      nLinhas++;
      var f = ln.split('|');
      if (f.length < 3 || f[0] !== '') { out.avisos.push('Linha ' + nl + ': formato fora do padrão SPED (|REG|...|); ignorada.'); return; }
      var reg = f[1], n = f.length - 2; // quantidade de campos (REG incluso)
      if (MIN[reg] && n < MIN[reg]) { out.avisos.push('Linha ' + nl + ' (' + reg + '): só ' + n + ' campos, o mínimo é ' + MIN[reg] + '; registro ignorado.'); return; }

      if (reg === '0000') {
        temLecd = f[2] === 'LECD';
        if (!temLecd) out.avisos.push('O arquivo não é uma ECD (registro 0000 sem LECD).');
        out.ini = data(f[3]); out.fin = data(f[4]); out.empresa = f[5] || ''; out.cnpj = (f[6] || '').replace(/\D/g, '');
        out.finalidade = f[14] || '';
      } else if (reg === 'I010') {
        out.escrituracao = f[2]; out.versaoLeiaute = f[3];
      } else if (reg === 'I050') {
        var c = { codigo: f[6], nome: f[8], natureza: f[3], tipo: f[4], nivel: +f[5] || 0, superior: f[7] || '', dtAlt: data(f[2]), referencial: [] };
        if (mapaContas[c.codigo]) out.avisos.push('Linha ' + nl + ' (I050): conta ' + c.codigo + ' repetida; mantida a última.');
        else out.contas.push(c);
        if (mapaContas[c.codigo]) out.contas[out.contas.indexOf(mapaContas[c.codigo])] = c;
        mapaContas[c.codigo] = c; atual = c;
      } else if (reg === 'I051') {
        var campos = f.slice(2, f.length - 1), ref = '';
        for (var k = campos.length - 1; k >= 0; k--) if (campos[k]) { ref = campos[k]; break; }
        if (!atual) out.avisos.push('Linha ' + nl + ' (I051): sem I050 anterior; ignorado.');
        else if (ref) { atual.referencial.push(ref); out.planoReferencial.push({ conta: atual.codigo, ref: ref }); }
        else out.avisos.push('Linha ' + nl + ' (I051): sem código referencial.');
      } else if (reg === 'I150') {
        periodo = { ini: data(f[2]), fin: data(f[3]) };
      } else if (reg === 'I155') {
        if (!periodo) out.avisos.push('Linha ' + nl + ' (I155): sem I150 anterior; período desconhecido.');
        out.saldos.push({ ini: periodo && periodo.ini, fin: periodo && periodo.fin, conta: f[2], ccus: f[3] || '',
          sldIni: valor(f[4], reg, 4, nl), dcIni: f[5], deb: valor(f[6], reg, 6, nl), cred: valor(f[7], reg, 7, nl), sldFin: valor(f[8], reg, 8, nl), dcFin: f[9] });
      } else if (reg === 'I200') {
        atual = null;
        out.lancamentos.push({ num: f[2], data: data(f[3]), valor: valor(f[4], reg, 4, nl), ind: f[5], linha: nl, partidas: [], debitos: 0, creditos: 0, balanceado: true });
      } else if (reg === 'I250') {
        var l = out.lancamentos[out.lancamentos.length - 1];
        if (!l) { out.avisos.push('Linha ' + nl + ' (I250): partida sem I200 anterior; ignorada.'); return; }
        var dc = f[5];
        if (dc !== 'D' && dc !== 'C') out.avisos.push('Linha ' + nl + ' (I250): IND_DC "' + dc + '" inválido (esperado D ou C); partida não entra nos totais.');
        var p = { conta: f[2], ccus: f[3] || '', valor: valor(f[4], reg, 4, nl), dc: dc, hist: f[8] || '', linha: nl };
        l.partidas.push(p);
        if (dc === 'D') l.debitos = r2(l.debitos + p.valor); else if (dc === 'C') l.creditos = r2(l.creditos + p.valor);
      } else if (reg === 'J100') {
        out.balanco.push({ cod: f[2], ind: f[3], nivel: +f[4] || 0, sup: f[5] || '', grupo: f[6], descricao: f[7], sldIni: valor(f[8], reg, 8, nl), dcIni: f[9], sldFin: valor(f[10], reg, 10, nl), dcFin: f[11] });
      } else if (reg === 'J150') {
        out.dre.push({ ordem: f[2], cod: f[3], ind: f[4], nivel: +f[5] || 0, sup: f[6] || '', descricao: f[7], vlIni: valor(f[8], reg, 8, nl), dcIni: f[9], vlFin: valor(f[10], reg, 10, nl), dcFin: f[11], grupo: f[12] || '' });
      } else if (reg === '9999') {
        total9999 = +f[2];
      }
    });

    if (!out.cnpj) out.avisos.push('Registro 0000 não encontrado ou sem CNPJ.');
    if (total9999 !== null && total9999 !== nLinhas) out.avisos.push('O registro 9999 declara ' + total9999 + ' linhas, mas o arquivo tem ' + nLinhas + '.');
    out.lancamentos.forEach(function (l) {
      l.balanceado = Math.abs(l.debitos - l.creditos) < 0.005;
      if (!l.balanceado) out.avisos.push('Lançamento ' + l.num + ' (' + l.data + ') desbalanceado: débitos ' + l.debitos.toFixed(2) + ' x créditos ' + l.creditos.toFixed(2) + '.');
      else if (Math.abs(l.valor - l.debitos) > 0.005) out.avisos.push('Lançamento ' + l.num + ': VL_LCTO (' + l.valor.toFixed(2) + ') difere da soma das partidas (' + l.debitos.toFixed(2) + ').');
      l.partidas.forEach(function (p) { if (p.conta && !mapaContas[p.conta]) out.avisos.push('Lançamento ' + l.num + ': conta ' + p.conta + ' não consta no plano de contas (I050).'); });
    });
    return out;
  }

  function partidasPorConta(lido, codConta) {
    var res = { conta: codConta, nome: '', partidas: [], debitos: 0, creditos: 0 };
    ((lido && lido.contas) || []).forEach(function (c) { if (c.codigo === codConta) res.nome = c.nome; });
    ((lido && lido.lancamentos) || []).forEach(function (l) {
      l.partidas.forEach(function (p) {
        if (p.conta !== codConta) return;
        res.partidas.push({ num: l.num, data: l.data, ind: l.ind, valor: p.valor, dc: p.dc, hist: p.hist, ccus: p.ccus });
        if (p.dc === 'D') res.debitos = r2(res.debitos + p.valor); else if (p.dc === 'C') res.creditos = r2(res.creditos + p.valor);
      });
    });
    return res;
  }

  function resumo(lido) {
    var avisos = (lido.avisos || []).slice(), deb = 0, cred = 0, desb = [];
    (lido.lancamentos || []).forEach(function (l) {
      var d = 0, c = 0;
      l.partidas.forEach(function (p) { if (p.dc === 'D') d += p.valor; else if (p.dc === 'C') c += p.valor; });
      d = r2(d); c = r2(c); deb += d; cred += c;
      if (Math.abs(d - c) >= 0.005) { desb.push({ num: l.num, data: l.data, debitos: d, creditos: c }); }
    });
    deb = r2(deb); cred = r2(cred);
    if (desb.length) avisos.push(desb.length + ' lançamento(s) não fecham partidas dobradas (débitos ≠ créditos).');
    if (Math.abs(deb - cred) >= 0.005) avisos.push('Total geral de débitos (' + deb.toFixed(2) + ') difere do total de créditos (' + cred.toFixed(2) + ').');
    return { cnpj: lido.cnpj, empresa: lido.empresa, ini: lido.ini, fin: lido.fin, contas: lido.contas.length, saldos: lido.saldos.length,
      lancamentos: lido.lancamentos.length, partidas: lido.lancamentos.reduce(function (s, l) { return s + l.partidas.length; }, 0),
      totalDebitos: deb, totalCreditos: cred, partidasDobradasOk: !desb.length && Math.abs(deb - cred) < 0.005, desbalanceados: desb, avisos: avisos };
  }


  // ------------------------------------------------------------------ vale-transporte (insumo da tese T097)
  var RE_VT = /VALE[ -]?TRANSPORTE|AUX(ILIO)?\.? ?TRANSPORTE|\bV\.? ?T\.?\b/;
  var RE_VT_DESC = /DESCONT|RECUPERA|REEMBOLS|PARTICIPA\w* (D[OE] )?(EMPREGAD|FUNCION|COLABORAD)/;
  var RE_VT_IGNORA = /A PAGAR|A RECOLHER|ADIANTAMENTO|ANTECIPA/;
  function normNome(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  // Lê, da ECD, o gasto mensal com vale-transporte (contas ANALÍTICAS de despesa cujo nome indica VT; conta sintética só serve para achar as analíticas
  // filhas, nunca é somada, para não duplicar) e, se existir, a conta de desconto do empregado.
  // Saída: { porCompetencia: { 'AAAA-MM': { totalPago, descontoContabil|null } }, contasDespesa:[{conta,nome}], contasDesconto:[...], avisos:[] }
  // Limite: VT lançado em conta genérica de "benefícios" não é identificado.
  function valeTransporte(lido) {
    var out = { cnpj: (lido && lido.cnpj) || '', porCompetencia: {}, contasDespesa: [], contasDesconto: [], avisos: [] };
    var contas = (lido && lido.contas) || [], mapa = {};
    contas.forEach(function (c) { mapa[c.codigo] = c; });
    var filhosDe = {};
    contas.forEach(function (c) { if (c.superior) (filhosDe[c.superior] = filhosDe[c.superior] || []).push(c); });
    function analiticasAbaixo(c, acc) {
      (filhosDe[c.codigo] || []).forEach(function (f) { if (f.tipo === 'A') acc[f.codigo] = f; else analiticasAbaixo(f, acc); });
      return acc;
    }
    var alvo = {};
    contas.forEach(function (c) {
      if (!RE_VT.test(normNome(c.nome))) return;
      if (c.tipo === 'A') alvo[c.codigo] = c; else analiticasAbaixo(c, alvo);
    });
    var despesa = {}, desconto = {}, ignoradas = [];
    Object.keys(alvo).forEach(function (cod) {
      var c = alvo[cod], nm = normNome(c.nome);
      if (RE_VT_IGNORA.test(nm)) { ignoradas.push(c.nome); return; }
      if (RE_VT_DESC.test(nm)) { desconto[cod] = c; return; }
      if (c.natureza === '04' || !c.natureza) { despesa[cod] = c; return; } // natureza 04 = contas de resultado
      ignoradas.push(c.nome);
    });
    out.contasDespesa = Object.keys(despesa).map(function (k) { return { conta: k, nome: despesa[k].nome }; });
    out.contasDesconto = Object.keys(desconto).map(function (k) { return { conta: k, nome: desconto[k].nome }; });
    if (ignoradas.length) out.avisos.push('Contas de vale-transporte ignoradas por não serem de despesa (ativo/passivo/a pagar): ' + ignoradas.slice(0, 5).join('; ') + '.');
    var naoMensal = 0, visto = {};
    ((lido && lido.saldos) || []).forEach(function (sd) {
      var ehD = !!despesa[sd.conta], ehC = !!desconto[sd.conta];
      if (!ehD && !ehC) return;
      var fin = sd.fin || '', ini = sd.ini || '';
      if (!/^\d{4}-\d{2}/.test(fin)) return;
      var chave = [sd.conta, sd.ccus, ini, fin].join('|');
      if (visto[chave]) return; visto[chave] = 1;
      if (ini.slice(0, 7) !== fin.slice(0, 7)) naoMensal++;
      var comp = fin.slice(0, 7), x = out.porCompetencia[comp] = out.porCompetencia[comp] || { totalPago: 0, descontoContabil: null };
      if (ehD) x.totalPago = r2(x.totalPago + sd.deb - sd.cred);
      else x.descontoContabil = r2((x.descontoContabil || 0) + sd.cred - sd.deb);
    });
    Object.keys(out.porCompetencia).forEach(function (k) { if (out.porCompetencia[k].totalPago < 0) out.porCompetencia[k].totalPago = 0; });
    if (naoMensal) out.avisos.push('ECD com período de saldo não mensal em ' + naoMensal + ' linha(s) de vale-transporte: o valor foi atribuído ao mês final do período; confira.');
    if (!out.contasDespesa.length) out.avisos.push('ECD sem conta de despesa identificável como vale-transporte (nome com "vale-transporte"/"VT"): informe o valor manualmente. Vale-transporte em conta genérica de benefícios não é separado.');
    return out;
  }

  var api = { VERSAO: VERSAO, valeTransporte: valeTransporte, duvidas: duvidas, lerEcd: lerEcd, partidasPorConta: partidasPorConta, resumo: resumo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorEcd = api;
})(typeof self !== 'undefined' ? self : this);
