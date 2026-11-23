/*
 * Reversa Tax — leitor da DCTFWeb (documentos oficiais baixados do e-CAC):
 *   - XMLSaida_<CNPJ>_<MMAAAA>_<cat>.xml (também dentro do XmlSaidaComAssinaturaPkcs7_*.zip)
 *   - DeclaracaoCompleta_*.pdf (Relatório da Declaração Completa)
 *   - Recibo_*.pdf (Recibo de Entrega, com a Ficha Resumo)
 * O PDF chega como TEXTO já extraído (pdf.js, linhas de cima para baixo), como no motor de DARF.
 * Saída: débitos por código de receita (inclui os vindos do eSocial e do EFD-Reinf) e totais por tributo.
 * Funciona no navegador (window.MotorDctfWeb) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  // sistemaUsuarioDctf: origem da apuração (o PDF mostra 'eSocial', 'Reinf RET', 'MIT' para os códigos 1, 7 e 8)
  var ORIGEM = { '1': 'eSocial', '7': 'EFD-Reinf', '8': 'MIT' };

  function r2(n) { return Math.round(n * 100) / 100; }
  function num(s) { return s == null || s === '' ? null : Number(String(s).replace(/\./g, '').replace(',', '.')); }
  function dec(s) { return s === '' ? null : Number(s); } // XML: ponto decimal, sem milhar
  function tag(xml, nome) { var m = new RegExp('<(?:\\w+:)?' + nome + '>([^<]*)<').exec(xml); return m ? m[1].trim() : ''; }
  function competencia(mmaaaa) { var m = /^(\d{2})\/?(\d{4})$/.exec(mmaaaa || ''); return m ? m[2] + '-' + m[1] : null; }
  function codFmt(c) { c = String(c || '').replace(/\D/g, ''); return c.length === 6 ? c.slice(0, 4) + '-' + c.slice(4) : c; }
  function base(nome) { return { arquivo: nome || null, documento: null, cnpj: null, nome: null, competencia: null, recibo: null, retificadora: null, transmissao: null, origens: [], debitos: [], totais: {}, erros: [], avisos: [] }; }
  function fechar(r) {
    if (!r.cnpj) r.erros.push('CNPJ não encontrado.');
    if (!r.competencia) r.erros.push('Período de apuração não encontrado.');
    r.totalDebito = r2(r.debitos.reduce(function (s, d) { return s + (d.valor || 0); }, 0));
    r.totalSaldo = r2(r.debitos.reduce(function (s, d) { return s + (d.saldo || 0); }, 0));
    if (!r.debitos.length && !Object.keys(r.totais).length) r.avisos.push('Nenhum débito declarado no período.');
    return r;
  }

  function ehXmlDctf(texto) { return /<(?:\w+:)?(ProcDctf|DctfXml)[\s>]/.test(String(texto).slice(0, 4096)); }
  function ehPdfDctf(texto) { return /DCTFWeb/i.test(texto) && /(RELAT[ÓO]RIO DA DECLARA[ÇC][ÃA]O|Recibo de Entrega)/i.test(texto); }

  function lerXml(texto, nome) {
    var r = base(nome), x = String(texto || '');
    r.documento = 'XML';
    if (!ehXmlDctf(x)) { r.erros.push('O XML não é uma DCTFWeb.'); return r; }
    r.cnpj = tag(x, 'inscContrib').replace(/\D/g, '') || null;
    r.nome = tag(x, 'nomeContribuinte') || null;
    r.competencia = competencia(tag(x, 'perApuracao'));
    r.recibo = tag(x, 'numeroRecibo') || null;
    r.retificadora = !!tag(x, 'numRecibo'); // numRecibo = recibo da declaração retificada
    var dh = tag(x, 'dataHoraTransmissao').replace(/\D/g, ''); r.transmissao = dh.length >= 14 ? dh.slice(0, 4) + '-' + dh.slice(4, 6) + '-' + dh.slice(6, 8) + 'T' + dh.slice(8, 10) + ':' + dh.slice(10, 12) + ':' + dh.slice(12, 14) : null;
    var re = /<(?:\w+:)?CreditoTributarioApurado>([\s\S]*?)<\/(?:\w+:)?CreditoTributarioApurado>/g, m;
    while ((m = re.exec(x))) {
      var b = m[1];
      r.debitos.push({ codigo: codFmt(tag(b, 'codReceita')), descricao: tag(b, 'ctDescricaoTributo'), grupo: tag(b, 'ctDescGrupo'),
        valor: dec(tag(b, 'ctValor')), creditos: dec(tag(b, 'vlTotalCred')) || 0, saldo: dec(tag(b, 'saldoaPagar')) });
    }
    re = /<(?:\w+:)?sistemaUsuarioDctf>([^<]*)</g; while ((m = re.exec(x))) { var o = ORIGEM[m[1]] || 'Sistema ' + m[1]; if (r.origens.indexOf(o) < 0) r.origens.push(o); }
    return fechar(r);
  }

  // Texto do PDF (Declaração Completa ou Recibo). Cada valor é lido na linha do seu rótulo.
  function lerPdfTexto(texto, nome) {
    var r = base(nome), t = String(texto || ''), m;
    if (!ehPdfDctf(t)) { r.erros.push('O PDF não é uma DCTFWeb (Declaração Completa ou Recibo de Entrega).'); return r; }
    r.documento = /Recibo de Entrega/i.test(t) ? 'Recibo' : 'Declaração completa';
    if ((m = /(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/.exec(t))) r.cnpj = m.slice(1, 6).join('');
    if ((m = /^Nome\s+(?!do )(.+)$/m.exec(t))) r.nome = m[1].trim();
    else if ((m = /\n([^\n]+)\nNome do Contribuinte[^\n]*\n([A-Z .&-]{2,})\n/.exec(t))) r.nome = (m[1] + ' ' + m[2]).trim();
    if ((m = /Per[íi]odo (?:de )?apura[çc][ãa]o\s+(\d{2}\/\d{4})/i.exec(t))) r.competencia = competencia(m[1]);
    if ((m = /N[úu]mero do Recibo\s+(\d{6,})/.exec(t))) r.recibo = m[1];
    r.retificadora = /Declara[çc][ãa]o Retificadora\s+Sim/i.test(t) || /Recibo da Declara[çc][ãa]o Retificada\s+\d/i.test(t);
    if ((m = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})/.exec(t))) r.transmissao = m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4];
    var re = /\d+ \/ (eSocial|Reinf RET|Reinf CP|MIT)\s*$/gm;
    while ((m = re.exec(t))) { var o2 = /Reinf/.test(m[1]) ? 'EFD-Reinf' : m[1]; if (r.origens.indexOf(o2) < 0) r.origens.push(o2); }
    // Declaração completa: blocos "Código da Receita XXXX-XX Descrição ..." seguidos de "Débito Apurado" e "Saldo a Pagar"
    var blocos = t.split(/Código da Receita\s+/).slice(1);
    blocos.forEach(function (b) {
      var c = /^(\d{4}-\d{2})\s+Descri[çc][ãa]o\s+(.+)$/m.exec(b); if (!c) return;
      var v = /D[ée]bito Apurado\s+([\d.]+,\d{2})/.exec(b), s = /Saldo a Pagar\s+([\d.]+,\d{2})/.exec(b), cr = /Total (?:dos )?Cr[ée]ditos?(?: Vinculados?)?\s+([\d.]+,\d{2})/i.exec(b);
      r.debitos.push({ codigo: c[1], descricao: c[2].trim(), grupo: null, valor: v ? num(v[1]) : null, creditos: cr ? num(cr[1]) : 0, saldo: s ? num(s[1]) : null });
    });
    // Recibo: "Totalização dos tributos" — "<tributo> R$ débito R$ saldo"
    var re2 = /^(.+?)\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})\s*$/gm;
    while ((m = re2.exec(t))) r.totais[m[1].trim()] = { debito: num(m[2]), saldo: num(m[3]) };
    var out = fechar(r);
    if (r.documento === 'Recibo' && r.totais.TOTAL) { out.totalDebito = r.totais.TOTAL.debito; out.totalSaldo = r.totais.TOTAL.saldo; }
    return out;
  }

  // Consolida por competência: o XML vale como fonte; a declaração em PDF supre o que faltar; o recibo confere o total.
  function consolidar(lidos) {
    var por = {};
    (lidos || []).forEach(function (l) {
      if (!l || l.erros.length) return;
      var k = l.cnpj + '|' + l.competencia, c = por[k] = por[k] || { cnpj: l.cnpj, nome: l.nome, competencia: l.competencia, debitos: [], fonte: null, recibo: null, retificadora: false, transmissao: null, totalRecibo: null, documentos: [], avisos: [] };
      c.documentos.push(l.arquivo);
      c.nome = c.nome || l.nome; c.recibo = c.recibo || l.recibo; c.retificadora = c.retificadora || l.retificadora; c.transmissao = c.transmissao || l.transmissao;
      if (l.documento === 'Recibo') { c.totalRecibo = l.totalDebito; return; }
      if (l.documento === 'XML' || !c.fonte) { if (c.fonte !== 'XML') { c.debitos = l.debitos; c.fonte = l.documento; } }
    });
    return Object.keys(por).sort().map(function (k) {
      var c = por[k]; c.totalDebito = r2(c.debitos.reduce(function (s, d) { return s + (d.valor || 0); }, 0));
      c.totalSaldo = r2(c.debitos.reduce(function (s, d) { return s + (d.saldo || 0); }, 0));
      if (c.totalRecibo != null && c.fonte && Math.abs(c.totalRecibo - c.totalDebito) > 0.01) c.avisos.push('Total do recibo (' + c.totalRecibo + ') diferente da soma dos débitos (' + c.totalDebito + ').');
      if (!c.fonte) c.avisos.push('Só o recibo foi enviado: há o total, sem o detalhe por código de receita.');
      return c;
    });
  }

  var api = { VERSAO: VERSAO, ehXmlDctf: ehXmlDctf, ehPdfDctf: ehPdfDctf, lerXml: lerXml, lerPdfTexto: lerPdfTexto, consolidar: consolidar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorDctfWeb = api;
})(this);
