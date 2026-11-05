// Reversa Gov: Fontes de dados. Na demonstração todas aparecem conectadas; em produção, o estado real de cada fonte.
(function () {
  'use strict';
  var G = window.GovDados, esc = G.esc, DEMO = !!window.RV_GOV_DEMO;
  var FONTES = [
    { nome: 'Siconfi / DCA', desc: 'Dados públicos consolidados, mesma metodologia em todos os municípios.', prod: ['Planejada', 'n'] },
    { nome: 'ERP do município', desc: 'Chaves e notas dos pagamentos enviadas pelo ERP de qualquer fornecedor.', prod: ['Em implantação', 'y'] },
    { nome: 'Arquivos do município', desc: 'XML, resumo analítico da folha, DIRF, EFD-Reinf.', prod: ['Em implantação', 'y'] },
    { nome: 'CAUC / CRP', desc: 'Situação de regularidade previdenciária.', prod: ['Planejada', 'n'] },
    { nome: 'Portal da transparência', desc: 'Despesas empenhadas e pagas.', prod: ['Planejada', 'n'] },
    { nome: 'Portal Nacional NF-e / NFS-e', desc: 'Consulta por chave, exige certificado.', prod: ['Em estudo', 'n'] }
  ];
  document.getElementById('gf-grid').innerHTML = FONTES.map(function (f) {
    var st = DEMO ? ['Conectado', 'g1'] : f.prod;
    return '<article class="gs-card"><h3>' + esc(f.nome) + '</h3><p>' + esc(f.desc) + '</p>' +
      '<span class="gs-st ' + st[1] + '">' + (DEMO ? '<span aria-hidden="true">● </span>' : '') + esc(st[0]) + '</span></article>';
  }).join('');
  document.getElementById('gf-nota').textContent = DEMO
    ? 'Ambiente simulado: todas as fontes aparecem conectadas apenas para demonstrar o fluxo.'
    : 'Nenhuma fonte está conectada ainda. Este quadro mostra o estágio de cada uma.';
})();
