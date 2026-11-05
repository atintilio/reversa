// Reversa Gov: Arquivos e API. Demonstração: importações simuladas. Produção: só o modelo de campos e aviso.
(function () {
  'use strict';
  var G = window.GovDados, esc = G.esc, DEMO = !!window.RV_GOV_DEMO;
  if (DEMO) {
    var IMP = [
      ['pagamentos_erp_2021-2025.csv', '1.800 notas', 'Processado', 'g1'],
      ['folha_analitica_tupaciguara.pdf', '65 competências', 'Processando', 'y'],
      ['dirf_2024.txt', 'retenções', 'Na fila', 'n']
    ];
    document.getElementById('ga-lista').innerHTML = IMP.map(function (r) {
      return '<div class="ga-lin"><span class="nm">' + esc(r[0]) + '</span><small>' + esc(r[1]) + '</small><span class="gs-st ' + r[3] + '">' + esc(r[2]) + '</span></div>';
    }).join('');
  } else {
    document.getElementById('ga-aviso').hidden = false;
    document.getElementById('ga-import').hidden = true;
  }
  var bt = document.getElementById('ga-copiar');
  bt.addEventListener('click', function () {
    var txt = document.getElementById('ga-modelo').textContent;
    function ok() { if (window.RV && RV.toast) RV.toast('Modelo copiado.'); }
    function alt() {
      var t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) { if (window.RV && RV.toast) RV.toast('Não foi possível copiar. Selecione o texto manualmente.'); }
      document.body.removeChild(t);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, alt); else alt();
  });
})();
