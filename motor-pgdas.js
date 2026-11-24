/*
 * Reversa Tax — leitor do PGDAS-D (Declaração do Simples Nacional):
 *   - PGDASD-DECLARACAO-<CNPJ><AAAAMM><seq>.pdf  (Declaração completa do PGDAS-D)
 * O PDF chega como TEXTO já extraído (pdf.js, linhas de cima para baixo).
 * Extrai: CNPJ, competência, retificadora, receita bruta por atividade,
 *   tributos declarados (IRPJ, CSLL, COFINS, PIS, CPP, ICMS, IPI, ISS),
 *   total DAS, e segrega receitas "Com ST/monofásica" (Lei 10.485/2002).
 * Funciona no navegador (window.MotorPgdas) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';

  function r2(n) { return Math.round(n * 100) / 100; }
  function num(s) { return s == null ? null : Number(String(s).replace(/\./g, '').replace(',', '.')); }
  function competencia(s) {
    // "01/01/2021 a 31/01/2021" → "2021-01" ;  "01/2021" → "2021-01"
    var m = /(\d{2})\/(\d{4})/.exec(s || '');
    return m ? m[2] + '-' + m[1] : null;
  }

  function base(nome) {
    return {
      arquivo: nome || null, documento: 'PGDAS-D',
      cnpj: null, nome: null, competencia: null, numero: null,
      recibo: null, retificadora: false, transmissao: null,
      rpa: null, rbt12: null,
      atividades: [],   // [{descricao, receita, irpj, csll, cofins, pis, cpp, icms, ipi, iss, total}]
      totalDas: null,   // soma de todos os débitos
      pisCofinsMono: null, // PIS+COFINS sobre receitas "Com ST/monofásica"
      pisMono: null,       // PIS sobre receitas "Com ST/monofásica"
      cofinsMono: null,    // COFINS sobre receitas "Com ST/monofásica"
      receitaMono: null,   // receita bruta "Com ST/monofásica"
      erros: [], avisos: []
    };
  }

  function ehPgdas(texto) {
    return /Programa Gerador do Documento de Arrecada[çc][ãa]o[\s\S]{0,120}Simples Nacional[\s\S]{0,80}Declaratório/i.test(texto);
  }

  // Lê um bloco de tributos da linha de cabeçalho "IRPJ CSLL COFINS …"
  // seguido de uma linha com 8 valores separados por espaço.
  // Retorna {irpj, csll, cofins, pis, cpp, icms, ipi, iss, total} ou null.
  function parseTributos(bloco) {
    var m = /IRPJ\s+CSLL\s+COFINS\s+PIS[^\n]*\n([\d.,\s]+)/i.exec(bloco);
    if (!m) return null;
    var v = m[1].trim().split(/\s+/);
    if (v.length < 8) return null;
    return {
      irpj: num(v[0]), csll: num(v[1]), cofins: num(v[2]), pis: num(v[3]),
      cpp: num(v[4]), icms: num(v[5]), ipi: num(v[6]), iss: num(v[7]),
      total: v[8] != null ? num(v[8]) : r2((num(v[0])||0)+(num(v[1])||0)+(num(v[2])||0)+(num(v[3])||0)+(num(v[4])||0)+(num(v[5])||0)+(num(v[6])||0)+(num(v[7])||0))
    };
  }

  function lerPdfTexto(texto, nome) {
    var r = base(nome), t = String(texto || ''), m;
    if (!ehPgdas(t)) { r.erros.push('O PDF não é um PGDAS-D (Declaração do Simples Nacional).'); return r; }

    r.retificadora = /Declara[çc][ãa]o Retificadora/i.test(t);

    if ((m = /CNPJ Matriz:\s*([\d.\/\-]+)/.exec(t))) r.cnpj = m[1].replace(/\D/g, '');
    if ((m = /Nome empresarial:\s*([^\n]+)/.exec(t))) r.nome = m[1].trim();
    if ((m = /Per[íi]odo de Apura[çc][ãa]o:\s*([^\n]+)/.exec(t))) r.competencia = competencia(m[1]);
    if ((m = /N[^\s]{0,3}\s*da Declara[çc][ãa]o:\s*([\d]+)/.exec(t))) r.numero = m[1];
    if ((m = /N[úu]mero do Recibo:\s*([\d.\-]+)/.exec(t))) r.recibo = m[1].trim();
    if ((m = /Data e hor[áa]rio da transmiss[ãa]o.*?:\s*(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/.exec(t))) {
      var p = m[1]; r.transmissao = p.slice(6,10)+'-'+p.slice(3,5)+'-'+p.slice(0,2)+'T'+p.slice(11);
    }

    // RPA e RBT12 — aparecem na tabela "Discriminativo de Receitas"
    if ((m = /Receita Bruta do PA \(RPA\)[^\n]*\n?([\d.,]+)/.exec(t))) r.rpa = num(m[1]);
    if ((m = /Receita bruta acumulada nos doze meses anteriores.*?RBT12\)\s+([\d.,]+)/i.exec(t))) r.rbt12 = num(m[1]);
    // fallback: linha com dois valores separados por espaço
    if (!r.rbt12 && (m = /RBT12\)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/.exec(t))) r.rbt12 = num(m[3]);

    // ---- Atividades por estabelecimento ----
    // Descrição pode ser multilinha; termina em "Receita Bruta Informada: R$ X".
    var ATIV_RE = /(Revenda de mercadorias(?:[^\n]+\n)*?[^\n]*?)\nReceita Bruta Informada:\s*R\$\s*([\d.,]+)([\s\S]*?)(?=Revenda de mercadorias|Totais do Estabelecimento|Total do D[ée]bito|$)/g;
    var am;
    while ((am = ATIV_RE.exec(t)) !== null) {
      var desc = am[1].replace(/\n/g, ' ').trim();
      var receita = num(am[2]);
      var trib = parseTributos(am[3]) || {};
      var isMono = /Com substitui[çc][ãa]o tribut[áa]ria.*monof[áa]sica/i.test(desc);
      r.atividades.push({
        descricao: desc, receita: receita,
        irpj: trib.irpj||0, csll: trib.csll||0, cofins: trib.cofins||0, pis: trib.pis||0,
        cpp: trib.cpp||0, icms: trib.icms||0, ipi: trib.ipi||0, iss: trib.iss||0,
        total: trib.total||0, comMono: isMono
      });
    }

    // Total do débito declarado
    var totBlock = /Total do D[ée]bito Declarado[^\n]*\n[^\n]*\n([^\n]+)/.exec(t);
    if (totBlock) {
      var tv = totBlock[1].trim().split(/\s+/);
      r.totalDas = num(tv[tv.length - 1]);
    }
    // fallback: coluna Total na linha seguinte ao cabeçalho IRPJ…
    if (!r.totalDas && r.atividades.length) {
      r.totalDas = r2(r.atividades.reduce(function(s,a){ return s + (a.total||0); }, 0));
    }

    // Segregação monofásica: soma PIS+COFINS sobre receitas "Com ST/monofásica"
    var monoAtivs = r.atividades.filter(function(a){ return a.comMono; });
    if (monoAtivs.length) {
      r.receitaMono = r2(monoAtivs.reduce(function(s,a){ return s+(a.receita||0); }, 0));
      r.pisMono = r2(monoAtivs.reduce(function(s,a){ return s+(a.pis||0); }, 0));
      r.cofinsMono = r2(monoAtivs.reduce(function(s,a){ return s+(a.cofins||0); }, 0));
      r.pisCofinsMono = r2(r.pisMono + r.cofinsMono);
    }

    if (!r.cnpj)      r.erros.push('CNPJ não encontrado.');
    if (!r.competencia) r.erros.push('Período de apuração não encontrado.');
    if (!r.atividades.length) r.avisos.push('Nenhuma atividade de revenda encontrada.');
    return r;
  }

  // Consolida por CNPJ+competência; retificadora mais recente prevalece sobre a original.
  function consolidar(lidos) {
    var por = {};
    (lidos || []).forEach(function(l) {
      if (!l || l.erros.length) return;
      var k = (l.cnpj||'') + '|' + (l.competencia||'');
      var prev = por[k];
      if (!prev || l.retificadora) por[k] = l;
      else if (!l.retificadora && !prev.retificadora) {
        // dois originais? fica com o maior número de declaração
        if ((l.numero||'') > (prev.numero||'')) por[k] = l;
      }
    });
    return Object.keys(por).sort().map(function(k){ return por[k]; });
  }

  // Lê CSV exportado do Excel (Arquivo → Salvar como → CSV).
  // Colunas obrigatórias: Competência, PIS Mono, COFINS Mono (separador , ou ;).
  // Colunas opcionais: CNPJ, Receita Mono.
  // Aceita datas MM/AAAA ou AAAA-MM.
  function lerCsv(texto) {
    var linhas = String(texto || '').replace(/\r/g, '').split('\n').filter(function(l){ return l.trim(); });
    if (linhas.length < 2) return [];
    var sep = linhas[0].indexOf(';') > -1 ? ';' : ',';
    var COLS = {
      competencia: /compet[êe]ncia|compet[^;,]*/i,
      cnpj: /cnpj/i,
      receitaMono: /receita\s*(mono|bruta\s*mono|monof[áa]sic)/i,
      pisMono: /pis\s*(mono|monof[áa]sic)/i,
      cofinsMono: /cofins\s*(mono|monof[áa]sic)/i,
      pisCofinsMono: /pis\s*[\+e]\s*cofins\s*(mono)?/i
    };
    var header = linhas[0].split(sep).map(function(h){ return h.trim().replace(/["""]/g,''); });
    var idx = {};
    Object.keys(COLS).forEach(function(key) {
      header.forEach(function(h, i) { if (!idx[key] && COLS[key].test(h)) idx[key] = i; });
    });
    return linhas.slice(1).map(function(linha) {
      var v = linha.split(sep).map(function(x){ return x.trim().replace(/["""]/g,''); });
      var r = base(null); r.documento = 'PGDAS-D-CSV';
      if (idx.cnpj != null) r.cnpj = v[idx.cnpj].replace(/\D/g,'') || null;
      if (idx.competencia != null) r.competencia = competencia(v[idx.competencia]) || v[idx.competencia];
      if (idx.receitaMono != null) r.receitaMono = num(v[idx.receitaMono]);
      if (idx.pisMono != null) r.pisMono = num(v[idx.pisMono]);
      if (idx.cofinsMono != null) r.cofinsMono = num(v[idx.cofinsMono]);
      if (idx.pisCofinsMono != null) r.pisCofinsMono = num(v[idx.pisCofinsMono]);
      if (r.pisMono != null && r.cofinsMono != null && r.pisCofinsMono == null)
        r.pisCofinsMono = r2((r.pisMono || 0) + (r.cofinsMono || 0));
      if (!r.competencia) r.erros.push('Competência não encontrada na linha.');
      return r;
    }).filter(function(r){ return r.competencia; });
  }

  var api = { VERSAO: VERSAO, ehPgdas: ehPgdas, lerPdfTexto: lerPdfTexto, consolidar: consolidar, lerCsv: lerCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorPgdas = api;
})(this);
