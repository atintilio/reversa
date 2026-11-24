/*
 * Reversa Tax — leitor de comprovantes de pagamento (qualquer regime):
 *   DAS   — Documento de Arrecadação do Simples Nacional (PDF/texto)
 *   DARF  — Documento de Arrecadação de Receitas Federais (LP, LR, PF)
 *   GPS   — Guia da Previdência Social (INSS)
 *   DAS-MEI — DAS do Microempreendedor Individual
 *
 * Funciona no navegador (window.MotorComprovantes) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';

  function r2(n) { return Math.round(n * 100) / 100; }
  function num(s) {
    if (s == null) return null;
    var v = Number(String(s).replace(/\./g, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }
  function data(s) {
    // "31/12/2024" → "2024-12-31"
    var m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
    return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
  }
  function competencia(s) {
    // "01/2024" ou "01/01/2024 a 31/01/2024" → "2024-01"
    var m = /(\d{2})\/(\d{4})/.exec(s || '');
    return m ? m[2] + '-' + m[1] : null;
  }
  function base(nome) {
    return {
      arquivo: nome || null,
      tipo: null,          // 'DAS' | 'DARF' | 'GPS' | 'DAS-MEI'
      cnpj: null, cpf: null,
      competencia: null,
      codigoReceita: null, // DARF: ex. "8109" (PIS), "2172" (COFINS), "2089" (IRPJ/LP)
      descricaoReceita: null,
      valorPrincipal: null,
      valorJuros: null,
      valorMulta: null,
      valorTotal: null,
      dataVencimento: null,
      dataPagamento: null,
      autenticacao: null,  // código bancário de autenticação
      linhaDigitavel: null,
      erros: []
    };
  }

  // ── Detectores ──────────────────────────────────────────────────────────────

  function ehDas(t) {
    return /Documento de Arrecada[çc][ãa]o do Simples Nacional/i.test(t) &&
           !/Microempreendedor Individual/i.test(t);
  }
  function ehDasMei(t) {
    return /Documento de Arrecada[çc][ãa]o do Simples Nacional/i.test(t) &&
           /Microempreendedor Individual/i.test(t);
  }
  function ehDarf(t) {
    return /Documento de Arrecada[çc][ãa]o de Receitas Federais/i.test(t);
  }
  function ehGps(t) {
    return /Guia da Previd[êe]ncia Social/i.test(t) ||
           /GPS[\s\-]*GUIA DA PREVID/i.test(t);
  }

  // ── DAS (Simples Nacional) ───────────────────────────────────────────────────

  function lerDas(t, nome, r) {
    r.tipo = 'DAS';
    var m;
    if ((m = /CNPJ(?:[^:\n]{0,20})?:\s*([\d.\/\-]{14,20})/.exec(t))) r.cnpj = m[1].replace(/\D/g, '');
    if ((m = /Per[íi]odo de Apura[çc][ãa]o[:\s]*([^\n]+)/.exec(t))) r.competencia = competencia(m[1]);
    if ((m = /Vencimento[:\s]*(\d{2}\/\d{2}\/\d{4})/.exec(t))) r.dataVencimento = data(m[1]);
    if ((m = /Data do Pagamento[:\s]*(\d{2}\/\d{2}\/\d{4})/.exec(t))) r.dataPagamento = data(m[1]);
    // Valor total do DAS: "Valor do DAS R$ 1.234,56" ou "Total a Pagar R$ 1.234,56"
    if ((m = /(?:Total a Pagar|Valor do DAS)[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorTotal = num(m[1]);
    if ((m = /Valor Principal[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorPrincipal = num(m[1]);
    if ((m = /Multa[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorMulta = num(m[1]);
    if ((m = /Juros[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorJuros = num(m[1]);
    // Autenticação bancária: linha longa de dígitos após "Autenticação" ou no rodapé
    if ((m = /Autentica[çc][ãa]o[:\s]*([\d\s]{15,})/.exec(t))) r.autenticacao = m[1].replace(/\s/g, '');
    if ((m = /Linha Digit[áa]vel[:\s]*([\d\s.]{30,})/.exec(t))) r.linhaDigitavel = m[1].replace(/\s/g, '');
    if (!r.cnpj) r.erros.push('CNPJ não encontrado.');
    if (!r.competencia) r.erros.push('Período de apuração não encontrado.');
    if (!r.valorTotal && !r.valorPrincipal) r.erros.push('Valor não encontrado.');
    return r;
  }

  // ── DAS-MEI ──────────────────────────────────────────────────────────────────

  function lerDasMei(t, nome, r) {
    lerDas(t, nome, r);
    r.tipo = 'DAS-MEI';
    var m;
    if (!r.cnpj && (m = /CPF[:\s]*([\d.\-]+)/.exec(t))) r.cpf = m[1].replace(/\D/g, '');
    return r;
  }

  // ── DARF ─────────────────────────────────────────────────────────────────────

  // Tabela de receitas mais comuns para descrição automática
  var DESC_RECEITA = {
    '8109': 'PIS/Pasep – Faturamento (Monofásico)',
    '2172': 'COFINS – Faturamento (Monofásico)',
    '2089': 'IRPJ – Lucro Presumido (Estimativa)',
    '2372': 'IRPJ – Lucro Presumido (Apuração)',
    '2484': 'CSLL – Lucro Presumido',
    '5856': 'PIS/Pasep – Faturamento',
    '2063': 'COFINS – Faturamento',
    '1708': 'IRPJ – Ganho de Capital',
    '0220': 'IRRF – Rendimentos do Trabalho',
    '1067': 'IRRF – Serviços'
  };

  function lerDarf(t, nome, r) {
    r.tipo = 'DARF';
    var m;
    if ((m = /CNPJ[:\s]*([\d.\/\-]+)/.exec(t))) r.cnpj = m[1].replace(/\D/g, '');
    if (!r.cnpj && (m = /CPF[:\s]*([\d.\-]+)/.exec(t))) r.cpf = m[1].replace(/\D/g, '');
    // Código de Receita: 4 dígitos, geralmente isolados numa célula
    if ((m = /C[óo]digo de Receita[:\s]*(\d{4})/.exec(t))) {
      r.codigoReceita = m[1];
    } else if ((m = /\b(\d{4})\b/.exec(t.slice(0, 400)))) {
      // fallback: primeiro número de 4 dígitos no início do documento
      r.codigoReceita = m[1];
    }
    if (r.codigoReceita) r.descricaoReceita = DESC_RECEITA[r.codigoReceita] || null;
    // Período de apuração: "MM/AAAA" ou "DD/MM/AAAA"
    if ((m = /Per[íi]odo de Apura[çc][ãa]o[:\s]*([^\n]{4,20})/.exec(t))) r.competencia = competencia(m[1]);
    if ((m = /Vencimento[:\s]*(\d{2}\/\d{2}\/\d{4})/.exec(t))) r.dataVencimento = data(m[1]);
    if ((m = /Data do Pagamento[:\s]*(\d{2}\/\d{2}\/\d{4})/.exec(t))) r.dataPagamento = data(m[1]);
    if ((m = /Valor do Principal[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorPrincipal = num(m[1]);
    if ((m = /Multa[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorMulta = num(m[1]);
    if ((m = /Juros[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorJuros = num(m[1]);
    if ((m = /Valor Total[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) {
      r.valorTotal = num(m[1]);
    } else if (r.valorPrincipal != null) {
      r.valorTotal = r2((r.valorPrincipal || 0) + (r.valorMulta || 0) + (r.valorJuros || 0));
    }
    if ((m = /Autentica[çc][ãa]o[:\s]*([\d\s]{10,})/.exec(t))) r.autenticacao = m[1].replace(/\s/g, '');
    if ((m = /Linha Digit[áa]vel[:\s]*([\d\s.]{30,})/.exec(t))) r.linhaDigitavel = m[1].replace(/\s/g, '');
    if (!r.cnpj && !r.cpf) r.erros.push('CNPJ/CPF não encontrado.');
    if (!r.codigoReceita) r.erros.push('Código de receita não encontrado.');
    if (!r.valorTotal && !r.valorPrincipal) r.erros.push('Valor não encontrado.');
    return r;
  }

  // ── GPS ──────────────────────────────────────────────────────────────────────

  function lerGps(t, nome, r) {
    r.tipo = 'GPS';
    var m;
    if ((m = /CNPJ[:\s]*([\d.\/\-]+)/.exec(t))) r.cnpj = m[1].replace(/\D/g, '');
    if (!r.cnpj && (m = /CPF[:\s]*([\d.\-]+)/.exec(t))) r.cpf = m[1].replace(/\D/g, '');
    if ((m = /Compet[êe]ncia[:\s]*(\d{2}\/\d{4})/.exec(t))) r.competencia = competencia(m[1]);
    if ((m = /Vencimento[:\s]*(\d{2}\/\d{2}\/\d{4})/.exec(t))) r.dataVencimento = data(m[1]);
    if ((m = /Data do Pagamento[:\s]*(\d{2}\/\d{2}\/\d{4})/.exec(t))) r.dataPagamento = data(m[1]);
    if ((m = /Valor das Contribui[çc][õo]es[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) r.valorPrincipal = num(m[1]);
    if ((m = /Outras Entidades[:\s]*R?\$?\s*([\d.,]+)/i.exec(t))) {
      r.valorTotal = r2((r.valorPrincipal || 0) + (num(m[1]) || 0));
    } else {
      r.valorTotal = r.valorPrincipal;
    }
    if ((m = /Autentica[çc][ãa]o[:\s]*([\d\s]{10,})/.exec(t))) r.autenticacao = m[1].replace(/\s/g, '');
    r.descricaoReceita = 'INSS – Contribuição Previdenciária';
    if (!r.cnpj && !r.cpf) r.erros.push('CNPJ/CPF não encontrado.');
    if (!r.competencia) r.erros.push('Competência não encontrada.');
    if (!r.valorTotal && !r.valorPrincipal) r.erros.push('Valor não encontrado.');
    return r;
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  function ehComprovante(texto) {
    return ehDas(texto) || ehDasMei(texto) || ehDarf(texto) || ehGps(texto);
  }

  function lerPdfTexto(texto, nome) {
    var t = String(texto || ''), r = base(nome);
    if (ehDasMei(t)) return lerDasMei(t, nome, r);
    if (ehDas(t))    return lerDas(t, nome, r);
    if (ehDarf(t))   return lerDarf(t, nome, r);
    if (ehGps(t))    return lerGps(t, nome, r);
    r.erros.push('O PDF não é um comprovante reconhecido (DAS, DARF ou GPS).');
    return r;
  }

  // Consolida por CNPJ+competência+codigoReceita; prefere o pago sobre o não-pago.
  function consolidar(lidos) {
    var por = {};
    (lidos || []).forEach(function(l) {
      if (!l || l.erros.length) return;
      var k = [l.cnpj || l.cpf || '', l.tipo || '', l.competencia || '', l.codigoReceita || ''].join('|');
      var prev = por[k];
      if (!prev || (!prev.dataPagamento && l.dataPagamento)) por[k] = l;
    });
    return Object.keys(por).sort().map(function(k) { return por[k]; });
  }

  var api = { VERSAO: VERSAO, ehComprovante: ehComprovante, lerPdfTexto: lerPdfTexto, consolidar: consolidar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorComprovantes = api;
})(this);
