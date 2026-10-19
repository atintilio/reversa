/*
 * Reversa Tax — motor de DARF: lê o TEXTO já extraído de um PDF de DARF (a extração com pdf.js é feita fora)
 * e confere se o IRPJ/CSLL declarado na ECF (motor-ecf.apurar().conferencia) foi pago.
 *
 * Códigos reconhecidos (confirmados no cadastro SIEF Receitas da Receita Federal, via consulta pública):
 *   0220 = IRPJ - PJ obrigadas ao Lucro Real, entidades não financeiras, balanço trimestral
 *   6012 = CSLL - demais PJ que apuram o IRPJ com base em Lucro Real, balanço trimestral
 * Qualquer outro código vira aviso "código não reconhecido" e o DARF não entra na conferência.
 * Ignora as letras soltas de marca d'água diagonal: cada campo é lido só na linha que casa com o formato esperado.
 * Funciona no navegador (window.MotorDarf) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var CODIGOS = { '0220': { tributo: 'IRPJ', descricao: 'IRPJ Lucro Real, balanço trimestral' }, '6012': { tributo: 'CSLL', descricao: 'CSLL Lucro Real, balanço trimestral' } };

  function r2(n) { return Math.round(n * 100) / 100; }
  function moeda(s) { var m = /R\$\s*([\d.]+,\d{2})/.exec(s); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null; }
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

  // Quebra o texto em campos pela numeração "NN RÓTULO"; cada campo = linhas seguintes até o próximo rótulo.
  function campos(texto) {
    var out = {}, atual = null;
    String(texto).split(/\r?\n/).forEach(function (l) {
      var m = /^\s*(\d{2})\s+(\S.*)$/.exec(l);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 11 && /[A-ZÁÉÍÓÚÃÕÇ]{3,}/.test(m[2]) && !/\d{2}\/\d{2}\/\d{4}/.test(m[2])) { atual = m[1]; out[atual] = []; return; }
      if (atual && l.trim()) out[atual].push(l.trim());
    });
    return out;
  }
  function acha(linhas, re) { for (var i = 0; linhas && i < linhas.length; i++) { var m = re.exec(linhas[i]); if (m) return m; } return null; }

  function lerDarfTexto(texto, nome) {
    var avisos = [], c = campos(texto), t = String(texto || '');
    var r = { arquivo: nome || null, cnpj: null, periodo: null, codigoReceita: null, principal: null, multa: null, juros: null, total: null, vencimento: null, referencia: null, sintetico: false, avisos: avisos };
    r.sintetico = /SINT[ÉE]TIC|DOCUMENTO DE TESTE|FIXTURE/i.test(t);
    if (r.sintetico) avisos.push('Documento sintético/de teste: não representa pagamento real.');

    var m = acha(c['03'], /(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})/);
    if (m) r.cnpj = m.slice(1, 6).join(''); else avisos.push('CNPJ não encontrado.');

    var p = acha(c['02'], /(\d)\s*[ºo°:]*\s*TRIMESTRE\s*\/\s*(\d{4})/i);
    if (p) r.periodo = { texto: p[0], ano: Number(p[2]), trimestre: Number(p[1]) };
    else if ((p = acha(c['02'], /(\d{2})\/(\d{4})/))) r.periodo = { texto: p[0], ano: Number(p[2]), mes: Number(p[1]) };
    else avisos.push('Período de apuração não encontrado.');

    m = acha(c['04'], /\b(\d{4})(?:-\d{2})?\b/);
    if (m) r.codigoReceita = m[1]; else avisos.push('Código da receita não encontrado.');
    if (r.codigoReceita && !CODIGOS[r.codigoReceita]) avisos.push('Código não reconhecido: ' + r.codigoReceita + ' (só 0220 e 6012 foram confirmados na Receita).');
    if (r.codigoReceita && CODIGOS[r.codigoReceita] && r.periodo && !r.periodo.trimestre) avisos.push('Código trimestral com período mensal.');

    m = acha(c['05'], /^[A-Za-z0-9._\/-]{3,}$/); r.referencia = m ? m[0] : null;
    m = acha(c['06'], /(\d{2})\/(\d{2})\/(\d{4})/); if (m) r.vencimento = m[3] + '-' + m[2] + '-' + m[1]; else avisos.push('Vencimento não encontrado.');

    [['07', 'principal'], ['08', 'multa'], ['09', 'juros'], ['10', 'total']].forEach(function (k) {
      var v = null; (c[k[0]] || []).some(function (l) { v = moeda(l); return v != null; });
      r[k[1]] = v;
      if (v == null) avisos.push('Valor não encontrado: ' + k[1] + '.');
    });
    if (r.principal != null && r.total != null && Math.abs(r.principal + (r.multa || 0) + (r.juros || 0) - r.total) > 0.01) avisos.push('Total diferente de principal + multa + juros.');
    return r;
  }

  // darfs: saída de lerDarfTexto; conferenciaEcf: [{ano, trimestre, irpjDeclarado, csllDeclarada}]
  function conferirComEcf(darfs, conferenciaEcf) {
    var avisos = [], porTri = {}, cnpjs = {};
    (darfs || []).forEach(function (d) {
      var nome = d.arquivo || d.referencia || '(sem nome)';
      if (d.cnpj) cnpjs[d.cnpj] = (cnpjs[d.cnpj] || 0) + 1;
      if (!d.codigoReceita || !CODIGOS[d.codigoReceita]) { avisos.push('DARF ' + nome + ': código não reconhecido (' + (d.codigoReceita || 'ausente') + '); ignorado.'); return; }
      if (!d.periodo || !d.periodo.trimestre) { avisos.push('DARF ' + nome + ': sem trimestre de apuração; ignorado.'); return; }
      var k = d.periodo.ano + '-' + d.periodo.trimestre, o = porTri[k] = porTri[k] || { ano: d.periodo.ano, trimestre: d.periodo.trimestre, irpjPago: 0, csllPago: 0, darfs: 0, usado: false };
      var v = d.principal == null ? 0 : d.principal;
      if (CODIGOS[d.codigoReceita].tributo === 'IRPJ') o.irpjPago += v; else o.csllPago += v;
      o.darfs++;
    });
    var lista = Object.keys(cnpjs);
    if (lista.length > 1) avisos.push('CNPJs diferentes entre os DARFs: ' + lista.join(', ') + '.');
    var cnpjEcf = (conferenciaEcf || []).map(function (e) { return e.cnpj; }).filter(Boolean)[0];
    if (cnpjEcf && lista.some(function (c) { return c !== String(cnpjEcf).replace(/\D/g, ''); })) avisos.push('CNPJ do DARF diferente do CNPJ da ECF (' + cnpjEcf + ').');

    var trimestres = (conferenciaEcf || []).map(function (e) {
      var k = e.ano + '-' + e.trimestre, o = porTri[k], dI = e.irpjDeclarado || 0, dC = e.csllDeclarada || 0;
      if (!o) { avisos.push('Trimestre ' + e.trimestre + 'T/' + e.ano + ' sem DARF.'); return { ano: e.ano, trimestre: e.trimestre, irpjDeclarado: dI, csllDeclarada: dC, irpjPago: 0, csllPago: 0, diferencaIrpj: r2(dI), diferencaCsll: r2(dC), confere: dI === 0 && dC === 0, semDarf: true }; }
      o.usado = true;
      var difI = r2(dI - o.irpjPago), difC = r2(dC - o.csllPago);
      return { ano: e.ano, trimestre: e.trimestre, irpjDeclarado: dI, csllDeclarada: dC, irpjPago: r2(o.irpjPago), csllPago: r2(o.csllPago), diferencaIrpj: difI, diferencaCsll: difC, confere: Math.abs(difI) < 0.01 && Math.abs(difC) < 0.01, semDarf: false };
    });
    Object.keys(porTri).forEach(function (k) { var o = porTri[k]; if (!o.usado) avisos.push('DARF do ' + o.trimestre + 'T/' + o.ano + ' sem trimestre correspondente na ECF.'); });
    return { trimestres: trimestres, confere: trimestres.length > 0 && trimestres.every(function (t) { return t.confere; }), avisos: avisos };
  }

  var api = { VERSAO: VERSAO, CODIGOS: CODIGOS, lerDarfTexto: lerDarfTexto, conferirComEcf: conferirComEcf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorDarf = api;
})(typeof self !== 'undefined' ? self : this);
