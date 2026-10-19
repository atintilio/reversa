/*
 * Reversa Tax — motor da ECF: lê a ECF (Lucro Real trimestral) e estima o IRPJ/CSLL pago a maior
 * por despesas dedutíveis que foram adicionadas à base como "não dedutíveis".
 *
 * Registros lidos: 0000 (empresa), M300/M350 (resultado, adições e exclusões, uma linha por item "2.n"),
 * N500/N650 (base), N630/N670 (imposto a pagar do trimestre).
 *
 * Regra (tese "despesa dedutível adicionada por erro"), aprovada pelo André em 19/10/2026:
 *   Classes de adição pela descrição (palavras-chave), sempre listadas para conferência humana:
 *     - dedutível adicionada por erro: provisão de férias e 13º salário; perdas no recebimento de créditos;
 *       multas contratuais compensatórias.
 *     - indedutível, adição correta (controle): multas punitivas fiscais e de trânsito; doações sem amparo legal;
 *       despesas particulares de sócios.
 *     - sem classe reconhecida: não entra no cálculo; vai para "a classificar" pela equipe técnica.
 *   Valor = IRPJ recalculado (15% + adicional de 10% sobre o que passa de R$ 60 mil por trimestre) e CSLL (9%)
 *   sobre a base reduzida pela despesa. Valor nominal, sem a atualização pela Selic.
 *   Prazo: 5 anos do pagamento (CTN, art. 168, I).
 *   A base legal exata de cada tipo de despesa deve ser confirmada pela equipe técnica antes de ir ao relatório do cliente.
 * Funciona no navegador (window.MotorEcf) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var ALIQ_IRPJ = 0.15, ADIC_IRPJ = 0.10, LIMITE_ADIC_MES = 20000, ALIQ_CSLL = 0.09;

  // Ordem importa: o primeiro que casa vence. "revisar" e "indedutivel" vêm antes das dedutíveis.
  var CLASSES = [
    { classe: 'revisar', tipo: 'Reversão (exige análise humana)', re: /REVERS[ÃA]O/i },
    { classe: 'indedutivel', tipo: 'Provisão de contingência', re: /CONTING[ÊE]NCI/i },
    { classe: 'indedutivel', tipo: 'Multas punitivas fiscais e de trânsito', re: /MULTAS?.*(PUNITIV|FISCA|TR[ÂA]NSITO)/i },
    { classe: 'indedutivel', tipo: 'Doações sem amparo legal', re: /DOA[ÇC](Ã|A|Õ|O)(O|ES)?.*SEM/i },
    { classe: 'indedutivel', tipo: 'Despesas particulares de sócios', re: /PARTICULARES?.*S[ÓO]CIOS?/i },
    { classe: 'dedutivel', tipo: 'Provisão de férias e 13º salário', re: /PROVIS[AÃ]O.*(F[ÉE]RIAS|13\s*[ºo°]?\s*SAL)|F[ÉE]RIAS.*13\s*[ºo°]?\s*SAL/i },
    { classe: 'dedutivel', tipo: 'Perdas no recebimento de créditos', re: /^(?!.*PROVIS)\s*PERDAS?.*(RECEBIMENTO|CLIENTES|DUPLICATAS)/i },
    { classe: 'dedutivel', tipo: 'Multas contratuais compensatórias', re: /MULTAS?.*(CONTRATUA|COMPENSAT[ÓO]RIA)/i }
  ];

  // "1.234,56" → 1234.56; "1234.56" (ponto decimal) → 1234.56; ambíguo → NaN (o leitor avisa)
  function num(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return 0;
    if (s.indexOf(',') >= 0) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    if (/^-?\d+\.\d{1,2}$/.test(s)) return parseFloat(s);
    return parseFloat(s.replace(/\./g, '')) || 0;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function irpj(base) { return r2(Math.max(0, base) * ALIQ_IRPJ + Math.max(0, base - LIMITE_ADIC_MES * 3) * ADIC_IRPJ); }
  function csll(base) { return r2(Math.max(0, base) * ALIQ_CSLL); }
  function classificar(desc) {
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].re.test(desc)) return CLASSES[i];
    return null;
  }
  var FIM_TRI = ['3103', '3006', '3009', '3112'];
  function fimMesSeguinte(dtFin) { // ddmmaaaa do fim do trimestre → último dia do mês seguinte (vencimento estimado)
    var d = new Date(Date.UTC(+dtFin.slice(4), +dtFin.slice(2, 4) + 1, 0));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  function ehTrimestral(cod) { return /^(T0[1-4]|00[1-4])$/.test(String(cod || '')); }

  function lerEcf(texto, nome) {
    var out = { arquivo: nome || '', tipo: 'ecf', cnpj: '', empresa: '', ano: null, trimestres: [], avisos: [], periodos: [] };
    var linhas = String(texto || '').split(/\r?\n/), q = -1, tri = null, ponto = false;
    linhas.forEach(function (ln) {
      var f = ln.split('|');
      if (f.length < 3 || f[0] !== '') return;
      var reg = f[1];
      if (/^(M300|M350|N500|N650|N630|N670)$/.test(reg) && /\d\.\d{1,2}\|?$/.test(f[f.length - 2] || '') && (f[f.length - 2] || '').indexOf(',') < 0) ponto = true;
      if (reg === '0000') {
        out.empresa = f[5] || ''; out.cnpj = (f[6] || '').replace(/\D/g, ''); out.ano = +String(f[4] || '').slice(4) || null;
        if (f[2] !== 'LECF') out.avisos.push('O arquivo não é uma ECF (registro 0000 sem LECF).');
      } else if (reg === 'M030') {
        out.periodos.push({ cod: f[2], ini: f[3], fin: f[4] });
      } else if (reg === 'M300' && f[2] === '1') {
        q++; tri = out.trimestres[q] = { n: q + 1, resultado: num(f[4]), adicoes: [], exclusoes: 0, adicoesIrpjTotal: 0,
          resultadoCsll: null, adicoesCsll: [], adicoesCsllTotal: null, exclusoesCsll: null, pagoIrpj: 0, pagoCsll: 0, baseIrpj: 0, baseCsll: 0 };
      } else if (tri && reg === 'M350' && f[2] === '1') {
        tri.resultadoCsll = num(f[4]);
      } else if (tri && (reg === 'M300' || reg === 'M350')) {
        var cs = reg === 'M350';
        if (f[2] === '2') { if (cs) tri.adicoesCsllTotal = num(f[4]); else tri.adicoesIrpjTotal = num(f[4]); }
        else if (/^2\.\d+$/.test(f[2])) (cs ? tri.adicoesCsll : tri.adicoes).push({ cod: f[2], descricao: f[3], valor: num(f[4]) });
        else if (f[2] === '3') { if (cs) tri.exclusoesCsll = num(f[4]); else tri.exclusoes = num(f[4]); }
      } else if (/^N(500|650|630|670)$/.test(reg)) {
        // o trimestre vem no rótulo ("... 1T" ou "T1"); sem rótulo, vale o trimestre corrente
        var m = /(\d)\s*T\s*$/i.exec(f[2] || '') || /\bT\s*(\d)\s*$/i.exec(f[2] || ''), alvo = m ? out.trimestres[+m[1] - 1] : tri;
        if (!alvo) return;
        if (reg === 'N500') alvo.baseIrpj = num(f[3]); else if (reg === 'N650') alvo.baseCsll = num(f[3]);
        else if (reg === 'N630') alvo.pagoIrpj = num(f[3]); else alvo.pagoCsll = num(f[3]);
      }
    });
    if (ponto) out.avisos.push('Há valores com ponto decimal (ex.: 1234.56): foram lidos como decimais; confira o arquivo.');
    if (!out.cnpj) out.avisos.push('Registro 0000 não encontrado ou sem CNPJ.');
    if (!out.trimestres.length) out.avisos.push('Nenhum trimestre (M300/N630) encontrado: a ECF pode não ser do Lucro Real trimestral.');
    return out;
  }

  function apurar(ecfs, opts) {
    opts = opts || {};
    var hojeStr = (opts.hoje ? new Date(opts.hoje) : new Date()).toISOString().slice(0, 10);
    var avisos = [], teses = [], aClassificar = [], conferencia = [], mantidas = [], revisao = [], total = { irpj: 0, csll: 0, valor: 0, valorNoPrazo: 0 };
    var linhas = [], vistos = {};
    // mesma empresa e ano enviados duas vezes (original + retificadora): vale o último, sem dobrar
    var lista = [];
    (ecfs || []).forEach(function (e) {
      var k = e.cnpj + '|' + e.ano;
      if (e.cnpj && e.ano && vistos[k] !== undefined) { avisos.push(e.arquivo + ': mesma empresa e ano de "' + lista[vistos[k]].arquivo + '"; vale o último arquivo enviado, sem somar duas vezes.'); lista[vistos[k]] = e; }
      else { vistos[k] = lista.length; lista.push(e); }
    });
    lista.forEach(function (e) {
      (e.avisos || []).forEach(function (a) { avisos.push(e.arquivo + ': ' + a); });
      e.trimestres.forEach(function (t) {
        var rot = e.arquivo + ' ' + t.n + 'º trimestre';
        var per = e.periodos[t.n - 1];
        if (per && !ehTrimestral(per.cod)) { revisao.push({ arquivo: e.arquivo, trimestre: t.n, motivo: 'período não trimestral (M030 ' + per.cod + ')' }); avisos.push(rot + ': o período não é trimestral (M030 ' + per.cod + '); a ECF anual/estimativa não é calculada por este motor.'); return; }
        if (!per) avisos.push(rot + ': sem período M030; usei o fim de trimestre padrão para o prazo.');
        var base = t.resultado + t.adicoesIrpjTotal - t.exclusoes;
        var baseCs = (t.resultadoCsll == null ? t.resultado : t.resultadoCsll) + (t.adicoesCsllTotal == null ? t.adicoesIrpjTotal : t.adicoesCsllTotal) - (t.exclusoesCsll == null ? t.exclusoes : t.exclusoesCsll);
        var irpjCalc = irpj(base), csllCalc = csll(baseCs);
        var ok = Math.abs(irpjCalc - t.pagoIrpj) < 0.01 && Math.abs(csllCalc - t.pagoCsll) < 0.01;
        conferencia.push({ ano: e.ano, trimestre: t.n, base: r2(base), baseCsll: r2(baseCs), irpjCalculado: irpjCalc, irpjDeclarado: t.pagoIrpj, csllCalculada: csllCalc, csllDeclarada: t.pagoCsll, confere: ok });
        var somaDet = t.adicoes.reduce(function (s, a) { return s + a.valor; }, 0);
        if (t.adicoes.length && Math.abs(somaDet - t.adicoesIrpjTotal) > 0.01) avisos.push(rot + ': as adições detalhadas não somam o total declarado.');
        if (!t.adicoes.length && t.adicoesIrpjTotal > 0) { avisos.push(rot + ': as adições vêm sem detalhe (só o total de R$ ' + t.adicoesIrpjTotal.toFixed(2) + '); não há como identificar despesa dedutível.'); return; }
        // classifica os itens do IRPJ (M300) e, em separado, os da CSLL (M350; sem M350 detalhado, usa os do IRPJ)
        function separar(itensBase) {
          var indev = 0, itens = [];
          itensBase.forEach(function (a) {
            var c = classificar(a.descricao);
            if (!c || c.classe === 'revisar') { aClassificar.push({ arquivo: e.arquivo, ano: e.ano, trimestre: t.n, descricao: a.descricao, valor: a.valor, motivo: c ? c.tipo : 'descrição não reconhecida' }); return; }
            if (c.classe === 'dedutivel') { indev += a.valor; itens.push({ descricao: a.descricao, tipo: c.tipo, valor: a.valor }); }
            else if (itensBase === t.adicoes) mantidas.push({ arquivo: e.arquivo, ano: e.ano, trimestre: t.n, descricao: a.descricao, tipo: c.tipo, valor: a.valor });
          });
          return { indev: indev, itens: itens };
        }
        var si = separar(t.adicoes);
        if (!si.indev) return;
        if (!ok || !t.pagoIrpj) { revisao.push({ arquivo: e.arquivo, trimestre: t.n, motivo: 'imposto declarado não confere com o recalculado' }); avisos.push(rot + ': o imposto declarado não confere com o recalculado pela base (ou não há pagamento); o trimestre não entrou no valor — confira antes de usar.'); return; }
        var detCs = t.adicoesCsll.length ? t.adicoesCsll : t.adicoes;
        var sc = detCs === t.adicoes ? si : separar(detCs);
        var dIrpj = Math.min(r2(irpjCalc - irpj(base - si.indev)), t.pagoIrpj), dCsll = Math.min(r2(csllCalc - csll(baseCs - sc.indev)), t.pagoCsll);
        var venc = (per && fimMesSeguinte(per.fin)) || fimMesSeguinte(FIM_TRI[t.n - 1] + (e.ano || ''));
        if (!venc) { avisos.push(rot + ': sem data para calcular o prazo; trimestre não entrou no valor.'); return; }
        var limite = new Date(venc); limite.setUTCFullYear(limite.getUTCFullYear() + 5);
        var prazoLimite = limite.toISOString().slice(0, 10), noPrazo = hojeStr <= prazoLimite, valor = r2(dIrpj + dCsll);
        if (valor <= 0) return;
        linhas.push({ arquivo: e.arquivo, cnpj: e.cnpj, ano: e.ano, trimestre: t.n, baseOriginal: r2(base), despesaIndevida: r2(si.indev), itens: si.itens, irpj: dIrpj, csll: dCsll, valor: valor, vencimentoEstimado: venc, prazoLimite: prazoLimite, noPrazo: noPrazo });
        total.irpj += dIrpj; total.csll += dCsll; total.valor += valor; if (noPrazo) total.valorNoPrazo += valor;
      });
    });
    if (linhas.length) teses.push({ id: 'ECF-DEDUT', nome: 'Despesas dedutíveis adicionadas indevidamente ao lucro real (IRPJ/CSLL)', tributo: 'IRPJ/CSLL', linhas: linhas, valor: r2(total.valor), valorNoPrazo: r2(total.valorNoPrazo) });
    return {
      versao: VERSAO, teses: teses, total: { irpj: r2(total.irpj), csll: r2(total.csll), valor: r2(total.valor), valorNoPrazo: r2(total.valorNoPrazo) },
      aClassificar: aClassificar, adicoesMantidas: mantidas, revisao: revisao, conferencia: conferencia, avisos: avisos.filter(function (a, i) { return avisos.indexOf(a) === i; }),
      premissas: { irpj: ALIQ_IRPJ, adicional: ADIC_IRPJ, limiteAdicionalTrimestre: LIMITE_ADIC_MES * 3, csll: ALIQ_CSLL, selic: 'não aplicada (valores nominais)' }
    };
  }

  var api = { VERSAO: VERSAO, lerEcf: lerEcf, apurar: apurar, classificar: classificar, irpj: irpj, csll: csll };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorEcf = api;
})(typeof self !== 'undefined' ? self : this);
