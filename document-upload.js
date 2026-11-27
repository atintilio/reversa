(function () {
  'use strict';
  var CHUNK = 256 * 1024;
  var select = document.getElementById('ingest-client');
  var progress = document.getElementById('upload-progress');
  var failed = 0, received = 0;
  var output = document.getElementById('document-inventory');
  function showInventory(j) {
    var inv = j.inventory || j;
    output.textContent = (inv.documents || []).length + ' documento(s) recebido(s). ' + (inv.gaps || []).map(function (g) { return g.tipo + ' ' + g.competencia + ': ' + g.estado.replace(/_/g, ' '); }).join(' · ');
  }
  async function api(url, body) {
    var r = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    var j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message || 'Falha HTTP ' + r.status);
    return j;
  }
  api('/api/v1/taxpayers').then(function (j) {
    j.taxpayers.forEach(function (t) { var option = document.createElement('option'); option.value = t.id; option.textContent = t.legalName + ' · ' + t.cnpj; select.appendChild(option); });
    var id = new URLSearchParams(location.search).get('cliente');
    if (id) select.value = id;
  }).catch(function (e) { progress.textContent = 'Clientes: ' + e.message; });
  document.getElementById('refresh-inventory').onclick = async function () {
    if (!select.value) { output.textContent = 'Selecione o cliente.'; return; }
    try { showInventory(await api('/api/v1/taxpayers/' + select.value + '/documents')); } catch (e) { output.textContent = e.message; }
  };
  document.getElementById('document-gap-form').onsubmit = async function (event) {
    event.preventDefault();
    if (!select.value) { output.textContent = 'Selecione o cliente.'; return; }
    var get = function (id) { return document.getElementById(id).value; };
    var state = get('gap-state'), expected = { tipo: get('gap-kind'), competencia: get('gap-month') };
    var consultation = { ...expected, perfil: get('gap-profile'), referencia: get('gap-reference'), consultadaEm: get('gap-date'), acessoDisponivel: state !== 'acesso_nao_disponivel', encontrada: false };
    if (state === 'declaracao_nao_encontrada_ecac' && (!consultation.perfil || !consultation.referencia || !consultation.consultadaEm)) { output.textContent = 'Informe perfil, referência e data da consulta.'; return; }
    if (state === 'consulta_inconclusiva') delete consultation.encontrada;
    try { showInventory(await api('/api/v1/taxpayers/' + select.value + '/documents', { operation: 'inventory', expected: [expected], consultations: state === 'documento_ausente' ? [] : [consultation] })); } catch (e) { output.textContent = e.message; }
  };
  window.ReversaDocumentUpload = {
    send: async function (file) {
      if (!select.value) { progress.textContent = 'Selecione o cliente para preservar os originais no Dossiê de Documentos.'; return; }
      select.disabled = true;
      var client = select.value;
      try {
        if (!file.size || file.size > 256 * 1024 * 1024) throw new Error('Arquivo vazio ou maior que 256 MB.');
        var digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        var sha = Array.from(new Uint8Array(digest), function (n) { return n.toString(16).padStart(2, '0'); }).join('');
        var endpoint = '/api/v1/taxpayers/' + client + '/documents';
        var state = await api(endpoint + '?sha256=' + sha);
        for (var start = state.offset || 0; !state.complete && start < file.size;) {
          progress.textContent = 'Enviando ' + file.name + ' · ' + Math.round(start / file.size * 100) + '%';
          var bytes = new Uint8Array(await file.slice(start, start + CHUNK).arrayBuffer());
          var binary = ''; for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          var body = { name: file.name, sha256: sha, size: file.size, offset: start, data: btoa(binary) };
          var lastError;
          for (var attempt = 0; attempt < 3; attempt++) { try { state = await api(endpoint, body); lastError = null; break; } catch (e) { lastError = e; } }
          if (lastError) throw lastError;
          if (state.offset !== start + bytes.length) throw new Error('Bloco não confirmado pelo servidor.');
          start = state.offset;
        }
        if (!state.complete) throw new Error('Recebimento integral não confirmado.');
        received++;
        progress.textContent = received + ' original(is) preservado(s)' + (failed ? ' · ' + failed + ' envio(s) com falha; reenvie para retomar' : '');
      } catch (e) {
        failed++;
        progress.textContent = file.name + ': ' + e.message + ' · Reenvie para retomar. A leitura dos demais arquivos continua.';
      } finally { select.disabled = false; }
    }
  };
})();
