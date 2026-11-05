// Reversa Gov: tela "Notas analisadas · IRRF". Demonstração usa GovDemo (simulado, centavos); produção mostra estado vazio.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var IBGE_DEMO = '3169604';
  var params = new URLSearchParams(location.search);

  function vazio(titulo, texto) {
    $('conteudo').hidden = true; $('acoes').hidden = true;
    var v = $('vazio'); v.hidden = false; v.innerHTML = GovDados.vazio(titulo, texto);
  }

  GovDados.carregar().then(function () {
    if (!GovDados.demo) {
      return vazio('Nenhuma nota analisada ainda', 'As notas aparecem aqui quando o município enviar o arquivo de pagamentos pelo ERP.');
    }
    if (params.get('ibge') && params.get('ibge') !== IBGE_DEMO) {
      return vazio('Sem notas para este município na demonstração', 'Só Tupaciguara/MG (3169604) tem dados simulados. Abra a demonstração sem filtro de município.');
    }
    iniciar();
  }, function () {
    vazio('Não foi possível carregar os dados', 'Tente novamente em instantes.');
  });

  function iniciar() {
    var G = window.GovDemo, U = window.GovDemoUI, esc = U.esc;
    $('conteudo').hidden = false; $('acoes').hidden = false; $('aviso-sim').hidden = false;
    $('cab-sub').textContent = 'Tupaciguara/MG (simulado). Cada valor aponta para a nota que o originou: clique no olho para abrir a nota e ver o cálculo.';

    G.notas.forEach(function (n) {
      n._txt = U.norm([n.chave, n.emitente.razao, U.cnpj(n.emitente.cnpj), n.numero, n.natureza].join(' '));
      n._dig = (n.chave + ' ' + n.emitente.cnpj).replace(/\D/g, ' ');
    });

    // ---------- KPIs ----------
    var T = G.totais(), pc = G.porCor(), tot = T.diferenca || 1;
    function pct(c) { return Math.round(c.diferenca / tot * 100); }
    var seg = pc.map(function (c) { return '<span><i class="c-' + c.cor + '" aria-hidden="true"></i>' + G.COR[c.cor].nome + ' ' + pct(c) + '%</span>'; }).join('');
    var barra = pc.map(function (c) { return '<i class="c-' + c.cor + '" style="width:' + (c.diferenca / tot * 100).toFixed(2) + '%"></i>'; }).join('');
    var anos = G.ANOS;
    $('kpis').innerHTML =
      '<div class="gsn-kpi"><div class="r">Notas analisadas</div><div class="v">' + U.int(T.n) + '</div><span class="n">' + anos[0] + ' a ' + anos[anos.length - 1] + '</span></div>' +
      '<div class="gsn-kpi"><div class="r">Com diferença</div><div class="v">' + U.int(T.comDiferenca) + '</div><span class="n">' + Math.round(T.comDiferenca / T.n * 100) + '% das notas</span></div>' +
      '<div class="gsn-kpi irrf"><div class="r">Diferença total</div><div class="v">' + U.brl(T.diferenca) + '</div><span class="n">potencial de IRRF</span></div>' +
      '<div class="gsn-kpi"><div class="r">Segurança por valor</div><div class="gsn-seg">' + seg + '</div><div class="gsn-bar" role="img" aria-label="Distribuição da diferença por cor">' + barra + '</div><span class="n">verde, amarelo e vermelho</span></div>';

    // ---------- estado ----------
    var F = { ano: '', tipo: '', cor: '', dif: '', q: '', cnpj: '' };
    var pagina = 1, tam = 25, filtradas = G.notas, abertoId = null, gatilho = null;
    var OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

    function lerUrl() {
      Object.keys(F).forEach(function (k) { if (params.get(k)) F[k] = params.get(k); });
      if (F.cnpj) F.cnpj = F.cnpj.replace(/\D/g, '');
      $('f-ano').value = F.ano; $('f-tipo').value = F.tipo; $('f-cor').value = F.cor; $('f-dif').value = F.dif; $('f-q').value = F.q;
    }
    function gravarUrl() {
      var p = new URLSearchParams(location.search);
      Object.keys(F).forEach(function (k) { if (F[k]) p.set(k, F[k]); else p.delete(k); });
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
        if (q && n._txt.indexOf(q) < 0 && !(soNum && n._dig.indexOf(qd) >= 0)) return false;
        return true;
      });
      var pags = Math.max(1, Math.ceil(filtradas.length / tam));
      if (pagina > pags) pagina = pags;
      gravarUrl(); desenhar();
    }
    function curta(ch) { return ch.length > 14 ? ch.slice(0, 4) + '…' + ch.slice(-6) : ch; }

    function desenhar() {
      var ini = (pagina - 1) * tam, fim = Math.min(filtradas.length, ini + tam), pags = Math.max(1, Math.ceil(filtradas.length / tam));
      var linhas = filtradas.slice(ini, fim).map(function (n) {
        return '<tr>' +
          '<td><button type="button" class="gs-eye" data-ver="' + n.id + '" aria-label="Abrir nota" title="Abrir nota ' + esc(n.numero) + ' de ' + esc(n.emitente.razao) + '">' + OLHO + '</button></td>' +
          '<td><code title="' + esc(n.chave) + '">' + esc(curta(n.chave)) + '</code></td>' +
          '<td class="forn"><b>' + esc(n.emitente.razao) + '</b><small>' + U.cnpj(n.emitente.cnpj) + '</small></td>' +
          '<td>' + esc(n.natureza) + '</td>' +
          '<td class="num">' + U.brl(n.valorPago) + '</td>' +
          '<td class="num">' + U.brl(n.irrfDevido) + '</td>' +
          '<td class="num">' + U.brl(n.irrfRetido) + '</td>' +
          '<td class="num dif' + (n.diferenca > 0 ? '' : ' zero') + '">' + U.brl(n.diferenca) + '</td>' +
          '<td>' + U.selo(n.cor) + '</td></tr>';
      });
      $('tb-notas').innerHTML = linhas.length ? linhas.join('') : '<tr><td colspan="9" class="gov-empty">Nenhuma nota encontrada com esses filtros.</td></tr>';
      var t = G.totais(filtradas);
      $('resumo-filtro').innerHTML = '<strong>' + U.int(filtradas.length) + '</strong> ' + (filtradas.length === 1 ? 'nota' : 'notas') +
        ' <span aria-hidden="true">·</span> valor pago <strong>' + U.brl(t.pago) + '</strong> <span aria-hidden="true">·</span> diferença de IRRF <strong>' + U.brl(t.diferenca) + '</strong>';
      $('pg-info').textContent = filtradas.length ? 'Mostrando ' + U.int(ini + 1) + ' a ' + U.int(fim) + ' de ' + U.int(filtradas.length) + ' · página ' + pagina + ' de ' + pags : 'Nenhum resultado';
      $('pg-ant').disabled = pagina <= 1; $('pg-prox').disabled = pagina >= pags; $('pg-prim').disabled = pagina <= 1; $('pg-ult').disabled = pagina >= pags;
      $('rodape').innerHTML = '<span>Soma das diferenças de todas as notas: <strong>' + U.brl(T.diferenca) + '</strong>' + (filtradas.length !== G.notas.length ? ' · nos filtros atuais: <strong>' + U.brl(t.diferenca) + '</strong>' : '') + '.</span>' +
        '<span>Regra de triagem: IRRF devido = valor pago × alíquota (serviços 4,8%, bens 1,2%; fornecedor do Simples Nacional: isento). Diferença = devido − retido. Base: IN RFB 1.234/2012.</span>';
      var chip = $('chip-forn');
      if (F.cnpj) {
        var n0 = G.notas.filter(function (n) { return n.emitente.cnpj === F.cnpj; })[0];
        chip.hidden = false;
        chip.innerHTML = 'Fornecedor: <strong>' + esc(n0 ? n0.emitente.razao : F.cnpj) + '</strong> (' + U.cnpj(F.cnpj) + ') <button type="button" class="sec mini" id="chip-x" aria-label="Remover filtro de fornecedor">Remover</button>';
      } else { chip.hidden = true; chip.innerHTML = ''; }
    }

    // ---------- gaveta da nota ----------
    var painel = $('painel'), veu = $('painel-veu');
    function linhaDef(r, v) { return '<div><dt>' + r + '</dt><dd>' + v + '</dd></div>'; }
    function passo(rot, formula, val, destaque) { return '<li' + (destaque ? ' class="fim"' : '') + '><span class="r">' + rot + '</span>' + (formula ? '<span class="f">' + formula + '</span>' : '') + '<strong>' + val + '</strong></li>'; }
    function montar(n, pos, total) {
      var simples = n.regime === 'Simples', rotNat = n.naturezaTipo === 'servico' ? 'serviço' : 'bem', h = '';
      h += '<section class="gov-p-sec"><div class="gov-p-id"><span class="gov-badge info">' + n.tipo + (n.modelo ? ' · modelo ' + n.modelo : '') + '</span><span class="gov-badge warn">Simulado</span><span class="gov-badge ' + (n.evidencia === 'documentada' ? 'ok' : 'warn') + '">Evidência ' + n.evidencia + '</span></div>' +
        '<p class="gov-p-num">Nota nº <strong>' + n.numero + '</strong> · emitida em ' + U.data(n.emissao) + '</p>' +
        '<p class="gov-p-rot">' + (n.chaveTipo === 'chave44' ? 'Chave de acesso' : 'Número e código de verificação') + '</p>' +
        '<div class="gov-p-chave"><code>' + esc(n.chave) + '</code><button type="button" class="sec mini" data-copiar="' + n.id + '">Copiar</button></div></section>';
      h += '<section class="gov-p-sec"><h3>Fornecedor e destinatário</h3><dl class="gov-def">' +
        linhaDef('Fornecedor (fictício)', esc(n.emitente.razao)) + linhaDef('CNPJ (fictício)', U.cnpj(n.emitente.cnpj)) + linhaDef('Regime do fornecedor', simples ? 'Simples Nacional' : 'Regime normal') +
        linhaDef('Destinatário', esc(G.MUNICIPIO)) + linhaDef('CNPJ do destinatário (fictício)', U.cnpj(G.MUNICIPIO_CNPJ)) + '</dl>' +
        '<p><button type="button" class="sec mini" data-forn="' + n.emitente.cnpj + '">Ver todas as notas deste fornecedor</button></p></section>';
      h += '<section class="gov-p-sec"><h3>Natureza e origem da despesa</h3><dl class="gov-def">' +
        linhaDef('Natureza', esc(n.natureza) + ' <small>(' + rotNat + ')</small>') + linhaDef('Elemento de despesa', n.elemento) +
        linhaDef('Empenho', esc(n.empenho.numero) + '<small>' + U.data(n.empenho.data) + '</small>') +
        linhaDef('Liquidação', esc(n.liquidacao.numero) + '<small>' + U.data(n.liquidacao.data) + '</small>') +
        linhaDef('Pagamento', esc(n.pagamento.numero) + '<small>' + U.data(n.pagamento.data) + '</small>') +
        linhaDef('Fonte de recurso', esc(n.pagamento.fonte)) + '</dl></section>';
      h += '<section class="gov-p-sec"><h3>Valores</h3><dl class="gov-def">' + linhaDef('Valor bruto da nota', U.brl(n.valorBruto)) + linhaDef('Valor pago', U.brl(n.valorPago)) + '</dl></section>';
      h += '<section class="gov-p-sec"><h3>De onde vem o valor: cálculo do IRRF</h3><ol class="gov-calc">' +
        passo('1. Base de cálculo (valor pago)', '', U.brl(n.valorPago)) +
        passo('2. Alíquota para ' + rotNat, simples ? 'fornecedor do Simples: sem retenção' : '', n.aliquota ? U.pct(n.aliquota) : 'isento (Simples)') +
        passo('3. IRRF devido', U.brl(n.valorPago) + ' × ' + (n.aliquota ? U.pct(n.aliquota) : '0%'), U.brl(n.irrfDevido)) +
        passo('4. IRRF retido e lançado', 'conforme a liquidação e o pagamento', U.brl(n.irrfRetido)) +
        passo('5. Diferença (potencial)', U.brl(n.irrfDevido) + ' − ' + U.brl(n.irrfRetido), U.brl(n.diferenca), true) + '</ol>' +
        '<p class="gov-p-nota">' + esc(n.motivo) + '</p></section>';
      h += '<section class="gov-p-sec"><h3>Regra e base legal</h3><p>' + esc(n.baseLegal) + '</p>' +
        '<p class="gov-p-nota">Alíquotas de triagem do motor: 1,2% para bens e 4,8% para serviços. Fornecedor do Simples: isento.</p></section>';
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
      abertoId = id; montar(n, pos, filtradas.length);
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
    $('tb-notas').addEventListener('click', function (e) { var b = e.target.closest('[data-ver]'); if (b) abrir(+b.dataset.ver, b); });
    $('painel-corpo').addEventListener('click', function (e) {
      var c = e.target.closest('[data-copiar]'); if (c) { U.copiar(G.notas[+c.dataset.copiar - 1].chave); return; }
      var f = e.target.closest('[data-forn]'); if (f) { F.cnpj = f.dataset.forn; pagina = 1; gatilho = null; fechar(); aplicar(); }
    });
    $('painel-x').addEventListener('click', fechar);
    veu.addEventListener('click', fechar);
    $('pn-ant').addEventListener('click', function () { vizinha(-1); });
    $('pn-prox').addEventListener('click', function () { vizinha(1); });
    document.addEventListener('keydown', function (e) {
      if (abertoId == null) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/input|textarea|select/i.test((e.target.tagName || ''))) { e.preventDefault(); vizinha(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(painel.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var p = f[0], u = f[f.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); } else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); } else if (!painel.contains(document.activeElement)) { e.preventDefault(); p.focus(); }
      }
    });
    $('bt-csv').addEventListener('click', function () {
      U.baixarCsv('reversa-gov-notas-irrf-simuladas.csv', U.csvNotas(filtradas));
      RV.toast('CSV gerado com ' + U.int(filtradas.length) + ' notas (dados simulados).');
    });
    $('bt-xls').addEventListener('click', function () {
      // "sep=;" faz o Excel (qualquer idioma) separar as colunas; decimal com vírgula e BOM UTF-8 já vêm do CSV
      U.baixarCsv('reversa-gov-notas-irrf-simuladas-excel.csv', ['sep=;'].concat(U.csvNotas(filtradas)));
      RV.toast('Arquivo para Excel gerado com ' + U.int(filtradas.length) + ' notas (dados simulados).');
    });

    lerUrl(); aplicar();
  }
})();
