// Reversa Gov: Mensagens. Tela só da demonstração; as respostas são adicionadas apenas localmente (simulado).
(function () {
  'use strict';
  var G = window.GovDados, esc = G.esc, raiz = document.getElementById('gm-raiz');
  if (!window.RV_GOV_DEMO) {
    raiz.innerHTML = G.vazio('Mensagens com municípios e parceiros estarão disponíveis em breve', 'Quando liberado, as conversas de cada caso aparecerão aqui.');
    return;
  }
  var CONV = [
    { nome: 'Tupaciguara/MG', sub: 'Secretaria de Fazenda · há 5 min', msgs: [
      ['o', 'Enviamos a folha analítica de jan/2021 a dez/2025 em PDF.'],
      ['e', 'Recebido. Vamos conferir as 65 competências e retornamos até amanhã.'],
      ['o', 'Precisamos também do comprovante de repasse do IRRF?']] },
    { nome: 'ERP', sub: 'Arquivo de pagamentos · 1 h', msgs: [
      ['o', 'Arquivo pagamentos_erp_2021-2025.csv enviado com 1.800 notas.'],
      ['e', 'Importação concluída. Todas as chaves foram reconhecidas.'],
      ['o', 'Próximo envio automático previsto para o dia 5.']] },
    { nome: 'Município exemplo C/SC', sub: 'Aguardando folha · ontem', msgs: [
      ['e', 'Olá! Para iniciar a análise precisamos da folha analítica dos últimos 5 anos.'],
      ['o', 'Vamos pedir ao setor de pessoal e enviamos nesta semana.'],
      ['e', 'Perfeito. Qualquer dúvida sobre o formato, é só avisar.']] }
  ];
  var atual = 0;
  raiz.innerHTML = '<div class="gm"><nav class="gm-l" id="gm-l" aria-label="Conversas"></nav><section class="gm-r" aria-label="Conversa selecionada"><div class="gm-t" id="gm-t"></div><div class="gm-b" id="gm-b" role="log" aria-live="polite"></div>' +
    '<form class="gm-f" id="gm-f" novalidate><label class="sr-only" for="gm-in" style="position:absolute;left:-9999px">Sua resposta</label><input id="gm-in" type="text" maxlength="500" placeholder="Escreva uma resposta" autocomplete="off"><button type="submit">Enviar</button></form></section></div>' +
    '<p class="gm-sim">Conversa simulada: as respostas não são enviadas a ninguém.</p>';
  var lista = document.getElementById('gm-l'), corpo = document.getElementById('gm-b'), tit = document.getElementById('gm-t'), inp = document.getElementById('gm-in');
  function desenhar() {
    lista.innerHTML = CONV.map(function (c, i) {
      return '<button type="button" data-i="' + i + '"' + (i === atual ? ' aria-current="true"' : '') + '><b>' + esc(c.nome) + '</b><small>' + esc(c.sub) + '</small></button>';
    }).join('');
    tit.textContent = CONV[atual].nome;
    corpo.innerHTML = CONV[atual].msgs.map(function (m) { return '<div class="gm-bub' + (m[0] === 'e' ? ' me' : '') + '">' + esc(m[1]) + '</div>'; }).join('');
    corpo.scrollTop = corpo.scrollHeight;
  }
  lista.addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (b) { atual = +b.dataset.i; desenhar(); } });
  document.getElementById('gm-f').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = inp.value.trim(); if (!t) return;
    CONV[atual].msgs.push(['e', t]); inp.value = ''; desenhar(); inp.focus();
  });
  desenhar();
})();
