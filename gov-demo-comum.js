// Reversa Gov: utilitários compartilhados pelas telas simuladas da Demonstração (Notas analisadas e Resultado).
// Depende de shell.js (RV) e gov-demo-dados.js (GovDemo). Todos os valores monetários chegam em centavos.
(function () {
  'use strict';
  var U = window.GovDemoUI = {};

  U.esc = function (s) { return RV.esc(s); };
  U.brl = function (c) { return RV.reais(c); };
  U.milReais = function (c) { return 'R$ ' + (c / 100000).toFixed(1).replace('.', ',') + ' mil'; };
  U.int = function (n) { return Number(n).toLocaleString('pt-BR'); };
  U.pct = function (x, casas) { return (x * 100).toFixed(casas == null ? 1 : casas).replace('.', ',') + '%'; };
  U.cnpj = function (c) { return RV.cnpj(c); };
  U.data = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; };
  U.norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  // selo de cor de segurança: texto + ponto (não depende só da cor)
  U.selo = function (cor) {
    var c = GovDemo.COR[cor];
    return '<span class="gov-badge ' + c.cls + ' gov-cor"><i aria-hidden="true"></i>' + c.nome + '</span>';
  };

  // CSV para Excel em português: separador ";", decimal com vírgula, UTF-8 com BOM
  U.csvNum = function (c) { return (c / 100).toFixed(2).replace('.', ','); };
  U.csvCel = function (v) {
    var s = v == null ? '' : String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  U.csvLinha = function (cels) { return cels.map(U.csvCel).join(';'); };
  U.baixarCsv = function (nome, linhas) {
    var blob = new Blob(['﻿' + linhas.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  };

  U.copiar = function (texto) {
    function ok() { RV.toast('Copiado.'); }
    function alt() {
      var t = document.createElement('textarea'); t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) { RV.toast('Não foi possível copiar.'); }
      t.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, alt); else alt();
  };

  // linhas do CSV de notas (respeita a lista que for passada)
  U.csvNotas = function (lista) {
    var linhas = ['# ' + GovDemo.AVISO];
    linhas.push(U.csvLinha(['Chave de acesso', 'Tipo', 'Nº', 'Emissão', 'Emitente (fictício)', 'CNPJ (fictício)', 'Regime', 'Natureza', 'Elemento de despesa', 'Empenho', 'Liquidação', 'Pagamento', 'Data do pagamento', 'Valor bruto', 'Valor pago', 'IRRF devido', 'IRRF retido', 'Diferença IRRF', 'INSS devido (simulado)', 'INSS retido', 'Diferença INSS', 'Evidência', 'Cor', 'O que falta provar']));
    lista.forEach(function (n) {
      linhas.push(U.csvLinha([
        n.chaveTipo === 'chave44' ? '="' + n.chave + '"' : n.chave, n.tipo, n.numero, U.data(n.emissao), n.emitente.razao, U.cnpj(n.emitente.cnpj), n.regime, n.natureza, n.elemento,
        n.empenho.numero, n.liquidacao.numero, n.pagamento.numero, U.data(n.pagamento.data), U.csvNum(n.valorBruto), U.csvNum(n.valorPago),
        U.csvNum(n.irrfDevido), U.csvNum(n.irrfRetido), U.csvNum(n.diferenca), U.csvNum(n.inssDevido), U.csvNum(n.inssRetido), U.csvNum(n.inssDiferenca),
        n.evidencia, GovDemo.COR[n.cor].nome, n.faltaProvar.join(' | ')
      ]));
    });
    return linhas;
  };
})();
