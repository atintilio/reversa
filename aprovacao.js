(function () {
  'use strict';
  var token = location.hash.slice(1), dados = null, previa = null;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cnpj(c) { return String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); }
  function status(msg, info) { $('status').textContent = msg || ''; $('status').className = info ? 'info' : ''; if (msg) $('status').scrollIntoView({ block: 'nearest' }); }
  function chamar(method, body) {
    return fetch('/api/v1/client-approval', { method: method, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Approval-Token': token }, body: body ? JSON.stringify(body) : undefined });
  }
  function api(method, body) {
    return chamar(method, body).then(async function (r) { var j = await r.json().catch(function () { return {}; }); if (!r.ok) throw new Error(j.error && j.error.message || 'Não foi possível concluir.'); return j; });
  }
  function opostas() { return Array.from(document.querySelectorAll('[name=oposicao]:checked')).map(function (el) { return el.value; }); }
  function etapa(n) {
    ['etapa1', 'etapa2', 'etapa3'].forEach(function (id, i) { $(id).hidden = i + 1 !== n; });
    ['p1', 'p2', 'p3'].forEach(function (id, i) { $(id).className = i + 1 === n ? 'on' : i + 1 < n ? 'ok' : ''; });
    status(''); window.scrollTo(0, 0);
  }
  function resumo() {
    var op = opostas().length, total = dados.theses.length, seg = total - op;
    $('resumo').innerHTML = '<b>' + seg + ' de ' + total + '</b> oportunidade' + (total === 1 ? '' : 's') + ' segue' + (seg === 1 ? '' : 'm') + ' para o trabalho' + (op ? ' · ' + op + ' com oposição' : '');
    $('ir2').disabled = seg === 0;
    document.querySelectorAll('.tese').forEach(function (el) { el.classList.toggle('oposta', el.querySelector('input').checked); });
  }
  function renderDoc(c) {
    $('doc').innerHTML = '<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS TRIBUTÁRIOS</h2><p class="c">Instrumento particular · minuta ' + esc(c.versao) + '</p>' +
      '<h3>Contratante</h3><p>' + esc(c.contratante) + '</p><h3>Contratada</h3><p>' + esc(c.contratada) + '</p>' +
      c.clausulas.map(function (cl, i) { return '<h3>' + (i + 1) + ' · ' + esc(cl[0]) + '</h3>' + cl[1].map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); }).join('');
    $('doc').scrollTop = 0;
  }
  function concluir(r) {
    ['etapa1', 'etapa2', 'etapa3'].forEach(function (id) { $(id).hidden = true; });
    ['p1', 'p2', 'p3'].forEach(function (id) { $(id).className = 'ok'; });
    var f = $('fim'); f.hidden = false;
    f.innerHTML = '<h1>Contrato <em class="d">assinado</em></h1><div class="ok-box"><p>Assinado em <b>' + new Date(r.acceptedAt).toLocaleString('pt-BR') + '</b>' + (r.receiptId ? ' · protocolo ' + esc(r.receiptId) : '') + '.</p>' +
      (r.contractHash ? '<p class="hash">Impressão digital (SHA-256): ' + esc(r.contractHash) + '</p>' : '') +
      '<p>Próximo passo: a equipe Argus Prime fará a validação técnica com a documentação da empresa.</p><p><button type="button" id="baixar-ass">Baixar contrato assinado</button></p></div>';
    $('baixar-ass').onclick = function () { baixar({}); };
    status('');
  }
  function baixar(extra) {
    chamar('POST', Object.assign({ action: 'pdf', opposedTheses: opostas() }, extra)).then(async function (r) {
      if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.error && j.error.message || 'Falha ao gerar o PDF.'); }
      var b = await r.blob(), a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = (dados.acceptedAt ? 'Contrato-assinado-' : 'Minuta-contrato-') + dados.taxpayer.cnpj + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }).catch(function (e) { status(e.message); });
  }
  function render(j) {
    dados = j;
    $('cab').textContent = 'Link exclusivo · ' + j.taxpayer.name + ' · CNPJ ' + cnpj(j.taxpayer.cnpj);
    $('termos').textContent = j.terms;
    $('rodape').textContent = 'Documento ' + j.snapshotHash.slice(0, 16) + ' · Link válido até ' + new Date(j.expiresAt).toLocaleString('pt-BR') + ' · Compartilhe apenas com o responsável pela empresa.';
    var fisc = j.theses.filter(function (t) { return t.tax !== 'Previdenciário'; }), prev = j.theses.filter(function (t) { return t.tax === 'Previdenciário'; });
    var linha = function (t) {
      return '<div class="tese"><div><b>' + esc(t.name) + '</b>' + (t.ref ? '<small>' + esc(t.ref) + '</small>' : '') + '</div>' +
        '<label class="op"><input type="checkbox" name="oposicao" value="' + esc(t.id) + '"' + (j.opposedTheses.indexOf(t.id) >= 0 ? ' checked' : '') + (j.acceptedAt ? ' disabled' : '') + '> Me oponho</label></div>';
    };
    $('teses').innerHTML = (fisc.length ? '<div class="grupo">Fiscal e tributário</div>' + fisc.map(linha).join('') : '') + (prev.length ? '<div class="grupo">Previdenciário</div>' + prev.map(linha).join('') : '');
    $('teses').addEventListener('change', resumo);
    $('conteudo').hidden = false; status('');
    resumo();
    if (j.acceptedAt) concluir({ acceptedAt: j.acceptedAt });
    else if (!j.contract) { status('Este link é de uma versão antiga, sem contrato. Solicite um novo link à equipe Argus Prime.'); $('ir2').disabled = true; }
  }
  $('ir2').onclick = function () {
    $('ir2').disabled = true;
    api('POST', { action: 'previa', opposedTheses: opostas() }).then(function (r) { previa = r; renderDoc(r.contract); etapa(2); })
      .catch(function (e) { status(e.message); }).finally(function () { $('ir2').disabled = false; });
  };
  $('volta1').onclick = function () { etapa(1); };
  $('volta2').onclick = function () { etapa(2); };
  $('ir3').onclick = function () { etapa(3); $('nome').focus(); };
  $('baixar').onclick = function () { baixar({}); };
  $('cpf').addEventListener('input', function () {
    var d = this.value.replace(/\D/g, '').slice(0, 11);
    this.value = d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  });
  $('pedir').onclick = function () {
    var email = $('email').value.trim(), nome = $('nome').value.trim();
    if (nome.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status('Informe nome e e-mail antes de pedir o código.'); return; }
    var bt = this; bt.disabled = true;
    api('POST', { action: 'codigo', email: email, name: nome }).then(function (r) {
      status('Código enviado para ' + r.email + '. Ele vale por 15 minutos.' + (r.devCode ? ' (ambiente de teste: ' + r.devCode + ')' : ''), true);
      $('codigo').focus();
    }).catch(function (e) { status(e.message); }).finally(function () { setTimeout(function () { bt.disabled = false; }, 20000); });
  };
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!$('aceite').checked) { status('Confirme que leu e concorda com o contrato.'); return; }
    if (!/^\d{6}$/.test($('codigo').value.trim())) { status('Informe o código de 6 dígitos enviado por e-mail.'); return; }
    $('assinar').disabled = true;
    api('POST', { action: 'assinar', opposedTheses: previa ? previa.opposed : opostas(), snapshotHash: dados.snapshotHash, contractHash: previa && previa.contractHash,
      acceptedTerms: true, name: $('nome').value.trim(), cpf: $('cpf').value, role: $('cargo').value.trim(), email: $('email').value.trim(), code: $('codigo').value.trim()
    }).then(function (r) { dados.acceptedAt = r.acceptedAt; concluir(r); })
      .catch(function (err) { status(err.message); $('assinar').disabled = false; });
  });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { status('Abra o link completo fornecido pela equipe.'); return; }
  api('GET').then(render).catch(function (err) { status(err.message); });
})();
