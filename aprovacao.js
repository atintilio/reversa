(function () {
  'use strict';
  var token = location.hash.slice(1), snapshotHash, teses = [];
  var $ = function (id) { return document.getElementById(id); };
  var ROT = { verde: 'Provável', amarelo: 'Possível', vermelho: 'Remoto' };
  var ORDEM = { verde: 0, amarelo: 1, vermelho: 2 };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cnpj(c) { return String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); }
  function mes(p) { var m = String(p || '').split('-'); return m.length === 2 ? m[1] + '/' + m[0] : p; }
  function api(method, body) {
    return fetch('/api/v1/client-approval', { method: method, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Approval-Token': token }, body: body ? JSON.stringify(body) : undefined
    }).then(async function (r) { var j = await r.json(); if (!r.ok) throw new Error(j.error && j.error.message || 'Falha ao registrar.'); return j; });
  }
  function selecionadas() { return Array.from(document.querySelectorAll('[name=tese]:checked')).map(function (el) { return el.value; }); }
  // Recalcula o total conforme a seleção: tirar uma tese reduz o valor na hora.
  function recalcular() {
    var ids = selecionadas(), v = 0, a = 0, semValor = 0;
    teses.forEach(function (t) {
      if (ids.indexOf(t.id) < 0) return;
      if (t.value == null) { semValor += 1; return; }
      if (t.color === 'verde') v += Number(t.value); else a += Number(t.value);
    });
    $('total').textContent = brl(v + a);
    $('split').textContent = ids.length + ' tese' + (ids.length === 1 ? '' : 's') + ' · Provável ' + brl(v) + ' · Possível ' + brl(a) + (semValor ? ' · ' + semValor + ' a dimensionar' : '');
    $('enviar').disabled = !ids.length;
  }
  function concluir(r, contrato) {
    $('form').hidden = true;
    var c = $('concluido'); c.hidden = false;
    c.innerHTML = '<p class="eyebrow" style="margin-top:0">Aprovação registrada</p>' +
      '<p>Protocolo <b>' + esc(r.receiptId) + '</b> · ' + new Date(r.acceptedAt).toLocaleString('pt-BR') + '</p>' +
      (r.total != null ? '<p>Total estimado das teses aprovadas: <b>' + brl(r.total) + '</b></p>' : '') +
      (contrato && contrato.url
        ? '<p>Próximo passo: assinatura eletrônica do contrato.</p><p><a class="botao" href="' + esc(contrato.url) + '" target="_blank" rel="noopener noreferrer">Assinar o contrato</a></p><p class="muted">Assinatura por ' + esc(contrato.provider || 'VaultSign') + '. Uma confirmação foi enviada para o e-mail informado.</p>'
        : '<p>Próximo passo: a equipe Argus Prime enviará o contrato para assinatura eletrônica. Uma confirmação foi enviada para o e-mail informado.</p>');
    c.scrollIntoView();
  }
  function render(j) {
    var s = j.snapshot; snapshotHash = j.snapshotHash;
    teses = s.theses.slice().sort(function (a, b) { return (a.tax === 'Previdenciário') - (b.tax === 'Previdenciário') || (ORDEM[a.color] || 0) - (ORDEM[b.color] || 0) || (Number(b.value) || 0) - (Number(a.value) || 0); });
    $('cliente').textContent = s.taxpayer.name;
    $('periodo').textContent = 'CNPJ ' + cnpj(s.taxpayer.cnpj) + ' · Período: ' + mes(s.periodStart) + ' a ' + mes(s.periodEnd);
    $('termos').textContent = s.terms;
    $('versao').textContent = 'Documento ' + snapshotHash.slice(0, 16) + ' · Link válido até ' + new Date(j.expiresAt).toLocaleString('pt-BR');
    var html = '', grupoAtual = '';
    teses.forEach(function (t) {
      var g = t.tax === 'Previdenciário' ? 'Previdenciário' : 'Fiscal';
      if (g !== grupoAtual) { html += '<div class="grupo">' + g + '</div>'; grupoAtual = g; }
      var cor = ROT[t.color] ? t.color : 'amarelo';
      html += '<label class="tese"><input type="checkbox" name="tese" value="' + esc(t.id) + '"' + (cor !== 'vermelho' ? ' checked' : '') + '>' +
        '<span><span class="nome">' + esc(t.name) + '</span><div class="ref">' + esc(t.ref || t.legalBasis) + '</div></span>' +
        '<span class="dir"><span class="valor">' + (t.value == null ? '<span class="muted">a dimensionar</span>' : brl(t.value)) + '</span><br><span class="classe ' + cor + '">' + ROT[cor] + '</span></span>' +
        '<details><summary>Fundamentação</summary><p>Base legal: ' + esc(t.legalBasis) + (t.precedent && t.precedent !== '—' ? '<br>Jurisprudência: ' + esc(t.precedent) : '') + '</p>' +
        (t.riskEdit ? '<p>Classificação revista pela equipe (original: ' + esc(ROT[t.originalColor] || t.originalColor) + '): ' + esc(t.riskEdit.reason) + '</p>' : '') + '</details></label>';
    });
    $('teses').innerHTML = html;
    $('teses').addEventListener('change', recalcular);
    $('conteudo').hidden = false; $('status').textContent = '';
    recalcular();
    if (j.acceptedAt) {
      document.querySelectorAll('[name=tese]').forEach(function (el) { el.checked = j.selectedTheses.indexOf(el.value) >= 0; });
      recalcular();
      var total = teses.filter(function (t) { return j.selectedTheses.indexOf(t.id) >= 0; }).reduce(function (a, t) { return a + (Number(t.value) || 0); }, 0);
      concluir({ receiptId: '', acceptedAt: j.acceptedAt, total: total }, s.contract);
      $('concluido').querySelector('p:nth-child(2)').textContent = 'Aprovação registrada em ' + new Date(j.acceptedAt).toLocaleString('pt-BR') + '. Para mudar a seleção, solicite um novo link à equipe.';
    }
  }
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ids = selecionadas();
    if (!ids.length) { $('status').textContent = 'Selecione pelo menos uma tese.'; $('status').scrollIntoView(); return; }
    $('enviar').disabled = true;
    api('POST', { selectedTheses: ids, snapshotHash: snapshotHash, acceptedTerms: $('aceite').checked,
      name: $('nome').value.trim(), email: $('email').value.trim(), role: $('vinculo').value.trim()
    }).then(function (r) { $('status').textContent = ''; concluir(r, r.contract); })
      .catch(function (err) { $('status').textContent = err.message; $('enviar').disabled = false; $('status').scrollIntoView(); });
  });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { $('status').textContent = 'Abra o link completo fornecido pela equipe.'; return; }
  api('GET').then(render).catch(function (err) { $('status').textContent = err.message; });
})();
