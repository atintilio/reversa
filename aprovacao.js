(function () {
  'use strict';
  var token = location.hash.slice(1), snapshotHash;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(method, body) {
    return fetch('/api/v1/client-approval', { method: method, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Approval-Token': token }, body: body ? JSON.stringify(body) : undefined
    }).then(async function (r) { var j = await r.json(); if (!r.ok) throw new Error(j.error && j.error.message || 'Falha ao registrar.'); return j; });
  }
  function render(j) {
    var s = j.snapshot; snapshotHash = j.snapshotHash;
    $('cliente').textContent = s.taxpayer.name + ' · CNPJ ' + s.taxpayer.cnpj;
    $('periodo').textContent = 'Período autorizado: ' + s.periodStart + ' a ' + s.periodEnd;
    $('termos').textContent = s.terms;
    $('versao').textContent = 'Versão do catálogo: ' + s.catalogVersion + ' · Documento: ' + snapshotHash + ' · Link válido até ' + new Date(j.expiresAt).toLocaleString('pt-BR');
    $('teses').innerHTML = s.theses.map(function (t) {
      var color = ['verde', 'amarelo', 'vermelho'].includes(t.color) ? t.color : 'amarelo';
      return '<article><label><input type="checkbox" name="tese" value="' + esc(t.id) + '">' + esc(t.name) + '</label><p><span class="badge ' + color + '">' + color.toUpperCase() + '</span> · ' + esc(t.tax) + '</p>' +
        '<p>' + esc(t.note) + '</p><p class="muted">Base: ' + esc(t.legalBasis) + '<br>Precedente: ' + esc(t.precedent) + '<br>Documentos: ' + esc(t.documents.join('; ')) + '</p>' +
        (t.riskEdit ? '<p class="muted">Classificação original: ' + esc(t.originalColor) + '. Alterada pela equipe: ' + esc(t.riskEdit.reason) + ' · ' + esc(t.riskEdit.by) + '</p>' : '') + '</article>';
    }).join('');
    $('conteudo').hidden = false; $('status').textContent = '';
    if (j.acceptedAt) {
      document.querySelectorAll('[name=tese]').forEach(function (el) { el.checked = j.selectedTheses.includes(el.value); el.disabled = true; });
      $('form').querySelectorAll('input,button').forEach(function (el) { el.disabled = true; });
      $('status').textContent = 'Autorização já registrada em ' + new Date(j.acceptedAt).toLocaleString('pt-BR') + '. Para mudar, solicite um novo link à equipe.';
    }
  }
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ids = Array.from(document.querySelectorAll('[name=tese]:checked')).map(function (el) { return el.value; });
    if (!ids.length) { $('status').textContent = 'Selecione pelo menos uma tese.'; $('status').scrollIntoView(); return; }
    $('enviar').disabled = true;
    api('POST', { selectedTheses: ids, snapshotHash: snapshotHash, acceptedTerms: $('aceite').checked,
      name: $('nome').value.trim(), email: $('email').value.trim(), role: $('vinculo').value.trim()
    }).then(function (r) {
      $('status').textContent = 'Autorização registrada. Protocolo: ' + r.receiptId + '\nData: ' + new Date(r.acceptedAt).toLocaleString('pt-BR') + '\nTeses selecionadas: ' + r.selectedTheses.join(', ');
      $('form').querySelectorAll('input,button').forEach(function (el) { el.disabled = true; });
      $('status').scrollIntoView();
    }).catch(function (err) { $('status').textContent = err.message; $('enviar').disabled = false; $('status').scrollIntoView(); });
  });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { $('status').textContent = 'Abra o link completo fornecido pela equipe.'; return; }
  api('GET').then(render).catch(function (err) { $('status').textContent = err.message; });
})();
