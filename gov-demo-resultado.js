// Reversa Gov: tela "Resultado" da Demonstração (dados SIMULADOS).
(function () {
  'use strict';
  var G = window.GovDemo, U = window.GovDemoUI, $ = function (id) { return document.getElementById(id); };
  var esc = U.esc;
  var T = G.totais(), ANO = G.porAno(), COR = G.porCor(), FORN = G.porFornecedor().slice(0, 10);

  // KPIs
  function kpi(r, v, n, extra) { return '<div class="gov-kpi' + (extra ? ' ' + extra : '') + '"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="n">' + n + '</div></div>'; }
  $('kpis').innerHTML =
    kpi('Notas analisadas', U.int(T.n), U.int(T.comDiferenca) + ' com diferença de IRRF') +
    kpi('Valor pago analisado', U.brl(T.pago), 'de 2021 a 2025') +
    kpi('IRRF devido', U.brl(T.devido), 'pela regra de triagem') +
    kpi('IRRF retido', U.brl(T.retido), 'lançado nos pagamentos') +
    kpi('Potencial de incremento de receita', U.brl(T.diferenca), 'devido menos retido. Potencial de triagem.', 'destaque');
  $('kpi-prev').innerHTML = '<span class="r">Divergência previdenciária simulada</span><strong>' + U.brl(T.inssDiferenca) + '</strong><span class="n">INSS de 11% em cessão de mão de obra, regra a confirmar. Não entra no potencial de IRRF.</span>';

  // gráfico por ano: barras em SVG
  (function () {
    var W = 680, H = 300, ml = 62, mr = 16, mt = 34, mb = 52, iw = W - ml - mr, ih = H - mt - mb;
    var max = 0; ANO.forEach(function (a) { if (a.diferenca > max) max = a.diferenca; });
    var topo = Math.ceil(max / 2000000) * 2000000; // arredonda para cima em múltiplos de R$ 20 mil (4 faixas de R$ 35 mil)
    var passo = iw / ANO.length, bw = Math.min(78, passo * 0.56), s = '';
    for (var g = 0; g <= 4; g++) {
      var v = topo * g / 4, y = mt + ih - ih * g / 4;
      s += '<line class="grade" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text class="eixo" x="' + (ml - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + (v === 0 ? '0' : Math.round(v / 100000) + ' mil') + '</text>';
    }
    ANO.forEach(function (a, i) {
      var h = ih * a.diferenca / topo, x = ml + passo * i + (passo - bw) / 2, y = mt + ih - h;
      s += '<g class="barra"><rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="4" style="animation-delay:' + (i * 90) + 'ms"><title>' + a.ano + ': ' + U.brl(a.diferenca) + ' em ' + U.int(a.n) + ' notas</title></rect>' +
        '<text class="valor" x="' + (x + bw / 2) + '" y="' + (y - 8) + '" text-anchor="middle">' + U.milReais(a.diferenca) + '</text>' +
        '<text class="ano" x="' + (x + bw / 2) + '" y="' + (H - mb + 20) + '" text-anchor="middle">' + a.ano + '</text>' +
        '<text class="eixo" x="' + (x + bw / 2) + '" y="' + (H - mb + 37) + '" text-anchor="middle">' + U.int(a.n) + ' notas</text></g>';
    });
    $('grafico').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="graf-t">' +
      '<title id="graf-t">Potencial de IRRF por ano, em reais: ' + ANO.map(function (a) { return a.ano + ' ' + U.brl(a.diferenca); }).join('; ') + '</title>' + s + '</svg>';
  })();

  // quebra por cor
  var DESC = { verde: 'Retenção, repasse e prova consistentes.', amarelo: 'Depende de prova.', vermelho: 'Sem retenção comprovada. Não oferecer.' };
  $('cores').innerHTML = COR.map(function (c) {
    var parte = T.diferenca ? c.diferenca / T.diferenca : 0;
    return '<a class="gov-cor-card c-' + c.cor + '" href="/gov-demo-notas.html?cor=' + c.cor + '&dif=1" aria-label="Ver as notas ' + G.COR[c.cor].nome.toLowerCase() + ' com diferença">' +
      '<div class="topo">' + U.selo(c.cor) + '<span class="pc">' + U.pct(parte, 0) + ' do potencial</span></div>' +
      '<div class="v">' + U.brl(c.diferenca) + '</div>' +
      '<div class="trilho" aria-hidden="true"><div class="fill" style="width:' + Math.max(2, parte * 100).toFixed(1) + '%"></div></div>' +
      '<dl><div><dt>Notas</dt><dd>' + U.int(c.n) + '</dd></div><div><dt>Com diferença</dt><dd>' + U.int(c.comDiferenca) + '</dd></div><div><dt>Valor pago</dt><dd>' + U.brl(c.pago) + '</dd></div></dl>' +
      '<p>' + DESC[c.cor] + '</p></a>';
  }).join('');

  // top 10 fornecedores
  $('tb-forn').innerHTML = FORN.map(function (f, i) {
    return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(f.razao) + '</td><td class="nw">' + U.cnpj(f.cnpj) + '</td>' +
      '<td class="num">' + U.int(f.comDiferenca) + ' de ' + U.int(f.n) + '</td><td class="num"><strong>' + U.brl(f.diferenca) + '</strong></td><td class="num">' + U.pct(f.diferenca / T.diferenca) + '</td>' +
      '<td><a class="gov-link" href="/gov-demo-notas.html?cnpj=' + f.cnpj + '" aria-label="Ver as notas de ' + esc(f.razao) + '">Ver notas</a></td></tr>';
  }).join('');

  // CSV do resumo
  $('bt-csv').addEventListener('click', function () {
    var L = ['# ' + G.AVISO, U.csvLinha(['Indicador', 'Valor', 'Observação'])];
    L.push(U.csvLinha(['Notas analisadas', T.n, '']));
    L.push(U.csvLinha(['Valor pago analisado', U.csvNum(T.pago), '2021 a 2025']));
    L.push(U.csvLinha(['IRRF devido', U.csvNum(T.devido), '']));
    L.push(U.csvLinha(['IRRF retido', U.csvNum(T.retido), '']));
    L.push(U.csvLinha(['Potencial de incremento de receita (IRRF)', U.csvNum(T.diferenca), 'potencial de triagem, não é crédito reconhecido']));
    L.push(U.csvLinha(['Divergência previdenciária simulada', U.csvNum(T.inssDiferenca), 'regra a confirmar; fora do potencial de IRRF']));
    L.push('', U.csvLinha(['Ano', 'Notas', 'Valor pago', 'Potencial de IRRF']));
    ANO.forEach(function (a) { L.push(U.csvLinha([a.ano, a.n, U.csvNum(a.pago), U.csvNum(a.diferenca)])); });
    L.push('', U.csvLinha(['Cor', 'Notas', 'Notas com diferença', 'Valor pago', 'Potencial de IRRF']));
    COR.forEach(function (c) { L.push(U.csvLinha([G.COR[c.cor].nome, c.n, c.comDiferenca, U.csvNum(c.pago), U.csvNum(c.diferenca)])); });
    L.push('', U.csvLinha(['Top 10 fornecedores (fictícios)', 'CNPJ (fictício)', 'Notas com diferença', 'Notas', 'Potencial de IRRF']));
    FORN.forEach(function (f, i) { L.push(U.csvLinha([(i + 1) + '. ' + f.razao, U.cnpj(f.cnpj), f.comDiferenca, f.n, U.csvNum(f.diferenca)])); });
    U.baixarCsv('reversa-gov-demo-resultado-simulado.csv', L);
    RV.toast('CSV do resultado gerado (dados simulados).');
  });
})();
