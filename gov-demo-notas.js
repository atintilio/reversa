// Reversa Gov: tela "Notas analisadas" da Demonstração (dados SIMULADOS gerados em gov-demo-dados.js).
(function () {
  'use strict';
  var G = window.GovDemo, U = window.GovDemoUI, $ = function (id) { return document.getElementById(id); };
  var esc = U.esc;

  // índice de busca por nota
  G.notas.forEach(function (n) {
    n._txt = U.norm([n.chave, n.emitente.razao, U.cnpj(n.emitente.cnpj), n.numero, n.natureza].join(' '));
    n._dig = (n.chave + ' ' + n.emitente.cnpj).replace(/\D/g, ' ');
  });

  var F = { ano: '', tipo: '', cor: '', dif: '', q: '', cnpj: '' };
  var pagina = 1, tam = 25, filtradas = G.notas, abertoId = null, gatilho = null;

  // ---------- filtros ----------
  function lerUrl() {
    var p = new URLSearchParams(location.search);
    Object.keys(F).forEach(function (k) { if (p.get(k)) F[k] = p.get(k); });
    if (F.cnpj) F.cnpj = F.cnpj.replace(/\D/g, '');
    $('f-ano').value = F.ano; $('f-tipo').value = F.tipo; $('f-cor').value = F.cor; $('f-dif').value = F.dif; $('f-q').value = F.q;
  }
  function gravarUrl() {
    var p = new URLSearchParams();
    Object.keys(F).forEach(function (k) { if (F[k]) p.set(k, F[k]); });
    var s = p.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) { /* ignora */ }
  }
  function aplicar() {
    var q = U.norm(F.q.trim()), qd = F.q.replace(/\D/g, ''), soNum = /^[\d.\-\/\s]+$/.test(F.q.trim()) && qd.length >= 3;
    filtradas = G.notas.filter(function (n) {
      if (F.ano && String(n.ano) !== F.ano) return false;
      if (F.tipo && n.tipo !== F.tipo) return false;
      if (F.cor && n.cor !== F.cor) return false;
      if (F.dif === '1' && !(n.diferenca > 0)) return false;
      if (F.cnpj && n.emitente.cnpj !== F.cnpj) return false;
      if (q) { if (n._txt.indexOf(q) < 0 && !(soNum && n._dig.indexOf(qd) >= 0)) return false; }
      return true;
    });
    var pags = Math.max(1, Math.ceil(filtradas.length / tam));
    if (pagina > pags) pagina = pags;
    gravarUrl();
    desenhar();
  }

  // ---------- tabela ----------
  var OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  function desenhar() {
    var ini = (pagina - 1) * tam, fim = Math.min(filtradas.length, ini + tam), pags = Math.max(1, Math.ceil(filtradas.length / tam));
    var linhas = filtradas.slice(ini, fim).map(function (n) {
      return '<tr data-id="' + n.id + '">' +
        '<td class="olho"><button type="button" class="gov-olho" data-ver="' + n.id + '" aria-label="Ver nota ' + esc(n.numero) + ' de ' + esc(n.emitente.razao) + '" title="Ver nota">' + OLHO + '</button></td>' +
        '<td class="chave"><code>' + esc(n.chave) + '</code></td>' +
        '<td class="num">' + n.numero + '</td>' +
        '<td class="nw">' + U.data(n.emissao) + '</td>' +
        '<td class="emit"><span>' + esc(n.emitente.razao) + '</span><small>' + U.cnpj(n.emitente.cnpj) + '</small></td>' +
        '<td class="nat">' + esc(n.natureza) + '</td>' +
        '<td class="num">' + U.brl(n.valorPago) + '</td>' +
        '<td class="num">' + U.brl(n.irrfDevido) + '</td>' +
        '<td class="num">' + U.brl(n.irrfRetido) + '</td>' +
        '<td class="num dif' + (n.diferenca > 0 ? ' pos' : '') + '">' + U.brl(n.diferenca) + '</td>' +
        '<td>' + U.selo(n.cor) + '</td></tr>';
    });
    $('tb-notas').innerHTML = linhas.length ? linhas.join('') : '<tr><td colspan="11" class="gov-empty">Nenhuma nota encontrada com esses filtros.</td></tr>';
    var t = G.totais(filtradas);
    $('resumo-filtro').innerHTML = '<strong>' + U.int(filtradas.length) + '</strong> ' + (filtradas.length === 1 ? 'nota' : 'notas') +
      ' <span aria-hidden="true">·</span> valor pago <strong>' + U.brl(t.pago) + '</strong> <span aria-hidden="true">·</span> diferença de IRRF <strong>' + U.brl(t.diferenca) + '</strong>';
    $('pg-info').textContent = filtradas.length ? 'Mostrando ' + U.int(ini + 1) + ' a ' + U.int(fim) + ' de ' + U.int(filtradas.length) + ' · página ' + pagina + ' de ' + pags : 'Nenhum resultado';
    $('pg-ant').disabled = pagina <= 1; $('pg-prox').disabled = pagina >= pags;
    $('pg-prim').disabled = pagina <= 1; $('pg-ult').disabled = pagina >= pags;
    // chip do fornecedor
    var chip = $('chip-forn');
    if (F.cnpj) {
      var n0 = G.notas.filter(function (n) { return n.emitente.cnpj === F.cnpj; })[0];
      chip.hidden = false;
      chip.innerHTML = 'Fornecedor: <strong>' + esc(n0 ? n0.emitente.razao : F.cnpj) + '</strong> (' + U.cnpj(F.cnpj) + ') <button type="button" class="sec mini" id="chip-x" aria-label="Remover filtro de fornecedor">Remover</button>';
    } else { chip.hidden = true; chip.innerHTML = ''; }
  }

  // ---------- painel "Nota fiscal" ----------
  var painel = $('painel'), veu = $('painel-veu');
  function linhaDef(r, v) { return '<div><dt>' + r + '</dt><dd>' + v + '</dd></div>'; }
  function passo(rot, formula, val, destaque) {
    return '<li' + (destaque ? ' class="fim"' : '') + '><span class="r">' + rot + '</span>' + (formula ? '<span class="f">' + formula + '</span>' : '') + '<strong>' + val + '</strong></li>';
  }
  function aliqTxt(n) { return n.aliquota ? U.pct(n.aliquota) : 'isento (Simples)'; }
  function montar(n, pos, total) {
    var simples = n.regime === 'Simples', rotNat = n.naturezaTipo === 'servico' ? 'serviço' : 'bem';
    var h = '';
    h += '<section class="gov-p-sec"><div class="gov-p-id"><span class="gov-badge info">' + n.tipo + (n.modelo ? ' · modelo ' + n.modelo : '') + '</span><span class="gov-badge warn">Simulado</span><span class="gov-badge ' + (n.evidencia === 'documentada' ? 'ok' : 'warn') + '">Evidência ' + n.evidencia + '</span></div>' +
      '<p class="gov-p-num">Nota nº <strong>' + n.numero + '</strong> · emitida em ' + U.data(n.emissao) + '</p>' +
      '<p class="gov-p-rot">' + (n.chaveTipo === 'chave44' ? 'Chave de acesso' : 'Número e código de verificação') + '</p>' +
      '<div class="gov-p-chave"><code>' + esc(n.chave) + '</code><button type="button" class="sec mini" data-copiar="' + n.id + '">Copiar</button></div></section>';
    h += '<section class="gov-p-sec"><h3>Emitente e destinatário</h3><dl class="gov-def">' +
      linhaDef('Emitente (fictício)', esc(n.emitente.razao)) + linhaDef('CNPJ (fictício)', U.cnpj(n.emitente.cnpj)) + linhaDef('Regime do fornecedor', simples ? 'Simples Nacional' : 'Regime normal') +
      linhaDef('Destinatário', esc(G.MUNICIPIO)) + linhaDef('CNPJ do destinatário (fictício)', U.cnpj(G.MUNICIPIO_CNPJ)) + '</dl></section>';
    h += '<section class="gov-p-sec"><h3>Natureza e origem da despesa</h3><dl class="gov-def">' +
      linhaDef('Natureza', esc(n.natureza) + ' <small>(' + rotNat + ')</small>') + linhaDef('Elemento de despesa', n.elemento) +
      linhaDef('Empenho', esc(n.empenho.numero) + '<small>' + U.data(n.empenho.data) + '</small>') +
      linhaDef('Liquidação', esc(n.liquidacao.numero) + '<small>' + U.data(n.liquidacao.data) + '</small>') +
      linhaDef('Pagamento', esc(n.pagamento.numero) + '<small>' + U.data(n.pagamento.data) + '</small>') +
      linhaDef('Fonte de recurso', esc(n.pagamento.fonte)) + '</dl></section>';
    h += '<section class="gov-p-sec"><h3>Valores</h3><dl class="gov-def">' + linhaDef('Valor bruto da nota', U.brl(n.valorBruto)) + linhaDef('Valor pago', U.brl(n.valorPago)) + '</dl></section>';
    h += '<section class="gov-p-sec"><h3>Cálculo do IRRF, passo a passo</h3><ol class="gov-calc">' +
      passo('1. Base de cálculo (valor pago)', '', U.brl(n.valorPago)) +
      passo('2. Alíquota para ' + rotNat, simples ? 'fornecedor do Simples: sem retenção' : '', aliqTxt(n)) +
      passo('3. IRRF devido', U.brl(n.valorPago) + ' × ' + (n.aliquota ? U.pct(n.aliquota) : '0%'), U.brl(n.irrfDevido)) +
      passo('4. IRRF retido e lançado', 'conforme a liquidação e o pagamento', U.brl(n.irrfRetido)) +
      passo('5. Diferença (potencial)', U.brl(n.irrfDevido) + ' − ' + U.brl(n.irrfRetido), U.brl(n.diferenca), true) + '</ol>' +
      '<p class="gov-p-nota">' + esc(n.motivo) + '</p></section>';
    h += '<section class="gov-p-sec"><h3>Regra e base legal</h3><p>' + esc(n.baseLegal) + '</p>' +
      '<p class="gov-p-nota">Alíquotas de triagem do motor: 1,2% para bens e 4,8% para serviços. Fornecedor do Simples: isento.</p></section>';
    if (n.inssAplica) {
      h += '<section class="gov-p-sec"><h3>Previdenciário (simulado) <span class="gov-badge warn">regra a confirmar</span></h3><ol class="gov-calc">' +
        passo('INSS devido', U.brl(n.valorPago) + ' × ' + U.pct(n.inssAliquota, 0), U.brl(n.inssDevido)) +
        passo('INSS retido', '', U.brl(n.inssRetido)) +
        passo('Diferença previdenciária', U.brl(n.inssDevido) + ' − ' + U.brl(n.inssRetido), U.brl(n.inssDiferenca), true) + '</ol>' +
        '<p class="gov-p-nota">' + esc(n.baseLegalInss) + ' Fora do potencial de IRRF.</p></section>';
    }
    h += '<section class="gov-p-sec"><h3>Cor de segurança</h3><p class="gov-p-cor">' + U.selo(n.cor) + '<span class="gov-badge ' + (n.evidencia === 'documentada' ? 'ok' : 'warn') + '">' + n.evidencia + '</span></p><p>' + esc(n.corTexto) + '</p>' +
      '<p class="gov-p-nota">Documentada: a prova está nos documentos da nota. Estimada: o valor foi inferido e precisa de confirmação.</p></section>';
    h += '<section class="gov-p-sec"><h3>O que falta provar</h3><ul class="gov-falta">' + n.faltaProvar.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>';
    h += '<p class="gov-p-aviso">' + esc(G.AVISO) + '</p>';
    $('painel-corpo').innerHTML = h;
    $('painel-tit').textContent = 'Nota fiscal · ' + n.tipo + ' nº ' + n.numero;
    $('painel-pos').textContent = pos + ' de ' + U.int(total);
    $('pn-ant').disabled = pos <= 1; $('pn-prox').disabled = pos >= total;
    $('painel-corpo').scrollTop = 0;
  }
  function abrir(id, origem) {
    var pos = -1, n = null;
    for (var i = 0; i < filtradas.length; i++) if (filtradas[i].id === id) { pos = i + 1; n = filtradas[i]; break; }
    if (!n) { n = G.notas[id - 1]; pos = 1; }
    if (abertoId == null) gatilho = origem || document.activeElement;
    abertoId = id;
    montar(n, pos, filtradas.length);
    painel.classList.add('aberto'); veu.classList.add('aberto'); painel.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('gov-sem-rolagem');
    $('painel-x').focus();
  }
  function fechar() {
    if (abertoId == null) return;
    abertoId = null;
    painel.classList.remove('aberto'); veu.classList.remove('aberto'); painel.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('gov-sem-rolagem');
    if (gatilho && document.contains(gatilho)) gatilho.focus();
    gatilho = null;
  }
  function vizinha(d) {
    var i = -1;
    for (var k = 0; k < filtradas.length; k++) if (filtradas[k].id === abertoId) { i = k; break; }
    var j = i + d; if (i < 0 || j < 0 || j >= filtradas.length) return;
    abrir(filtradas[j].id);
    // mantém a tabela na página da nota aberta
    var np = Math.floor(j / tam) + 1; if (np !== pagina) { pagina = np; desenhar(); gatilho = null; }
  }

  // ---------- eventos ----------
  function ler() { F.ano = $('f-ano').value; F.tipo = $('f-tipo').value; F.cor = $('f-cor').value; F.dif = $('f-dif').value; F.q = $('f-q').value; }
  ['f-ano', 'f-tipo', 'f-cor', 'f-dif'].forEach(function (id) { $(id).addEventListener('change', function () { ler(); pagina = 1; aplicar(); }); });
  var tq; $('f-q').addEventListener('input', function () { clearTimeout(tq); tq = setTimeout(function () { ler(); pagina = 1; aplicar(); }, 160); });
  $('f-limpar').addEventListener('click', function () { F = { ano: '', tipo: '', cor: '', dif: '', q: '', cnpj: '' }; ['f-ano', 'f-tipo', 'f-cor', 'f-dif', 'f-q'].forEach(function (id) { $(id).value = ''; }); pagina = 1; aplicar(); });
  $('f-tam').addEventListener('change', function () { tam = +this.value; pagina = 1; aplicar(); });
  $('pg-prim').addEventListener('click', function () { pagina = 1; desenhar(); });
  $('pg-ant').addEventListener('click', function () { pagina--; desenhar(); });
  $('pg-prox').addEventListener('click', function () { pagina++; desenhar(); });
  $('pg-ult').addEventListener('click', function () { pagina = Math.ceil(filtradas.length / tam); desenhar(); });
  $('chip-forn').addEventListener('click', function (e) { if (e.target.id === 'chip-x') { F.cnpj = ''; pagina = 1; aplicar(); } });
  $('tb-notas').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ver]'); if (b) abrir(+b.dataset.ver, b);
  });
  $('painel-corpo').addEventListener('click', function (e) {
    var c = e.target.closest('[data-copiar]'); if (c) U.copiar(G.notas[+c.dataset.copiar - 1].chave);
  });
  $('painel-x').addEventListener('click', fechar);
  veu.addEventListener('click', fechar);
  $('pn-ant').addEventListener('click', function () { vizinha(-1); });
  $('pn-prox').addEventListener('click', function () { vizinha(1); });
  document.addEventListener('keydown', function (e) {
    if (abertoId == null) return;
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/input|textarea|select/i.test((e.target.tagName || ''))) { e.preventDefault(); vizinha(e.key === 'ArrowLeft' ? -1 : 1); return; }
    if (e.key === 'Tab') { // mantém o foco dentro do painel
      var f = Array.prototype.filter.call(painel.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var p = f[0], u = f[f.length - 1];
      if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); } else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); } else if (!painel.contains(document.activeElement)) { e.preventDefault(); p.focus(); }
    }
  });
  $('bt-csv').addEventListener('click', function () {
    U.baixarCsv('reversa-gov-demo-notas-simuladas.csv', U.csvNotas(filtradas));
    RV.toast('CSV gerado com ' + U.int(filtradas.length) + ' notas (dados simulados).');
  });

  lerUrl();
  aplicar();
})();
