(function () {
  'use strict';
  var token = location.hash.slice(1);
  var $ = function (id) { return document.getElementById(id); };
  function cnpj(c) { return String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); }
  function api(method, body) {
    return fetch('/api/v1/accountant-review', { method: method, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Review-Token': token }, body: body ? JSON.stringify(body) : undefined
    }).then(async function (r) { var j = await r.json(); if (!r.ok) throw new Error(j.error && j.error.message || 'Falha ao registrar.'); return j; });
  }
  function concluir(rotulo, em) {
    $('form').hidden = true; var c = $('concluido'); c.hidden = false;
    c.textContent = 'Resposta registrada: ' + rotulo + ' · ' + new Date(em).toLocaleString('pt-BR') + '. O time técnico Argus Prime foi avisado.';
  }
  function render(j) {
    $('cliente').textContent = j.cliente.nome;
    $('sub').textContent = 'CNPJ ' + cnpj(j.cliente.cnpj) + ' · Preparado pelo ' + j.preparadoPor + (j.aprovadoEm ? ' · aprovado em ' + new Date(j.aprovadoEm).toLocaleDateString('pt-BR') : '');
    $('resumo').textContent = j.resumo || 'Resumo não informado.';
    var brl = function (c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    $('arquivos').innerHTML = (j.arquivos || []).length ? '<table><thead><tr><th>Competência</th><th>Arquivo</th><th class="n">PIS / previdenciário</th><th class="n">COFINS / estimativa</th><th>Pré-validação</th></tr></thead><tbody>' + j.arquivos.map(function (a) {
      return '<tr><td>' + esc(a.competencia.split('-').reverse().join('/')) + '</td><td>' + esc(a.tipo) + ' · ' + a.itensAlterados + ' itens<br><code>SHA-256 ' + esc(a.shaRetificada) + '</code></td>' +
        (a.previdenciario ? '<td class="n">Base retirada ' + brl(a.previdenciario.baseRetirada) + '</td><td class="n">Contribuição estimada ' + brl(a.previdenciario.contribuicaoEstimada) + '</td>'
          : '<td class="n">' + brl(a.pis.aRecolherOriginal) + ' → ' + brl(a.pis.aRecolherRetificado) + '</td><td class="n">' + brl(a.cofins.aRecolherOriginal) + ' → ' + brl(a.cofins.aRecolherRetificado) + '</td>') +
        '<td>' + (a.errosValidacao ? a.errosValidacao + ' erro(s)' : 'Sem erros') + (a.avisosValidacao ? ' · ' + a.avisosValidacao + ' aviso(s)' : '') + '</td></tr>';
    }).join('') + '</tbody></table>' : '';
    $('arq-nota').hidden = !(j.arquivos || []).length;
    $('validade').textContent = 'Link exclusivo. Não encaminhe.';
    $('conteudo').hidden = false; $('status').textContent = '';
    if (j.resposta) { concluir(j.respostaRotulo, j.respondidoEm); $('prazo').hidden = true; return; }
    // Contagem regressiva das 12 horas (ajustada pelo relógio do servidor).
    var desvio = Date.now() - new Date(j.agora).getTime(), fim = new Date(j.prazoResposta).getTime();
    function tique() {
      var ms = fim - (Date.now() - desvio);
      if (ms <= 0) {
        $('relogio').textContent = '00:00:00'; $('prazo').classList.add('fim'); $('enviar').disabled = true;
        $('status').textContent = 'O prazo de 12 horas terminou. Peça um novo link ao time técnico Argus Prime.'; clearInterval(t); return;
      }
      var s = Math.floor(ms / 1000), p = function (n) { return (n < 10 ? '0' : '') + n; };
      $('relogio').textContent = p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60);
    }
    var t = setInterval(tique, 1000); tique();
  }
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var sel = document.querySelector('[name=resposta]:checked');
    if (!sel) { $('status').textContent = 'Escolha uma resposta.'; return; }
    $('enviar').disabled = true;
    api('POST', { resposta: sel.value, nome: $('nome').value.trim(), comentario: $('comentario').value.trim() })
      .then(function (r) { $('status').textContent = ''; $('prazo').hidden = true; concluir(sel.parentNode.querySelector('b').textContent, r.respondidoEm); })
      .catch(function (err) { $('status').textContent = err.message; $('enviar').disabled = false; });
  });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { $('status').textContent = 'Abra o link completo recebido por e-mail.'; return; }
  api('GET').then(render).catch(function (err) { $('status').textContent = err.message; });
})();
