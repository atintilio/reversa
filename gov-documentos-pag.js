// Reversa Gov: tela "Documentos · Previdenciário". Demonstração usa GovDemoPrev (simulado, centavos); produção mostra estado vazio.
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
    if (!GovDados.demo) return vazio('Nenhum documento analisado ainda', 'Os documentos aparecem quando o município enviar XML do eSocial, folha analítica e guias.');
    if (params.get('ibge') && params.get('ibge') !== IBGE_DEMO) return vazio('Sem documentos para este município na demonstração', 'Só Tupaciguara/MG (3169604) tem dados simulados.');
    iniciar();
  }, function () { vazio('Não foi possível carregar os dados', 'Tente novamente em instantes.'); });

  function iniciar() {
    var P = window.GovDemoPrev, U = window.GovDemoUI, esc = U.esc, DOCS = P.docs;
    $('conteudo').hidden = false; $('acoes').hidden = false; $('aviso-sim').hidden = false;
    $('cab-sub').textContent = 'Tupaciguara/MG (simulado). Cada inconsistência aponta para o documento (XML do eSocial) onde foi encontrada. Clique no olho para abrir o detalhe.';

    DOCS.forEach(function (d) { d._txt = U.norm([d.competenciaTxt, d.competencia, d.evento, d.arquivo, d.rubrica, d.inconsistencia, d.origem].join(' ')); });
    var T = P.totais();
    $('kpis').innerHTML =
      '<div class="gsd-kpi"><div class="r">Documentos analisados</div><div class="v">' + T.competencias + ' competências</div><span class="n">jan/21 a dez/25, com 13º</span></div>' +
      '<div class="gsd-kpi"><div class="r">Inconsistências</div><div class="v">' + U.int(T.inconsistencias) + '</div><span class="n">em ' + T.competenciasComInconsistencia + ' competências</span></div>' +
      '<div class="gsd-kpi prev"><div class="r">Ativo recuperável</div><div class="v">' + U.brl(T.ativo) + '</div><span class="n">potencial de recuperação</span></div>' +
      '<div class="gsd-kpi"><div class="r">Passivo identificado</div><div class="v">' + U.brl(T.passivo) + '</div><span class="n">exposição, não soma</span></div>';

    var F = { res: '', ano: '', q: '' }, pagina = 1, tam = 25, filtradas = DOCS, abertoId = null, gatilho = null;
    var OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    function pill(d) { return d.resultado === 'ativo' ? '<span class="gs-st g1">Ativo recuperável</span>' : '<span class="gs-st r">Passivo</span>'; }
    function cor(d) { return d.cor ? GovDados.selo(d.cor) : '<span class="gov-badge info" title="Passivo não tem cor de segurança">—</span>'; }

    function lerUrl() { ['res', 'ano', 'q'].forEach(function (k) { if (params.get(k)) F[k] = params.get(k); }); $('f-res').value = F.res; $('f-ano').value = F.ano; $('f-q').value = F.q; }
    function gravarUrl() {
      var p = new URLSearchParams(location.search);
      Object.keys(F).forEach(function (k) { if (F[k]) p.set(k, F[k]); else p.delete(k); });
      var s = p.toString(); try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) { /* ignora */ }
    }
    function aplicar() {
      var q = U.norm(F.q.trim());
      filtradas = DOCS.filter(function (d) {
        if (F.res && d.resultado !== F.res) return false;
        if (F.ano && String(d.ano) !== F.ano) return false;
        if (q && d._txt.indexOf(q) < 0) return false;
        return true;
      });
      var pags = Math.max(1, Math.ceil(filtradas.length / tam)); if (pagina > pags) pagina = pags;
      gravarUrl(); desenhar();
    }
    function soma(lista, res) { var s = 0; lista.forEach(function (d) { if (d.resultado === res) s += d.valor; }); return s; }
    function desenhar() {
      var ini = (pagina - 1) * tam, fim = Math.min(filtradas.length, ini + tam), pags = Math.max(1, Math.ceil(filtradas.length / tam));
      var linhas = filtradas.slice(ini, fim).map(function (d) {
        return '<tr>' +
          '<td><button type="button" class="gs-eye" data-ver="' + d.n + '" aria-label="Abrir documento" title="Abrir ' + esc(d.evento) + ' · ' + esc(d.competenciaTxt) + '">' + OLHO + '</button></td>' +
          '<td class="comp">' + esc(d.competenciaTxt) + '</td>' +
          '<td class="xml"><b>' + esc(d.evento) + '</b><small title="' + esc(d.arquivo) + '">' + esc(d.arquivo) + '</small></td>' +
          '<td class="rub">' + esc(d.rubrica) + '</td>' +
          '<td class="inc">' + esc(d.inconsistencia) + '</td>' +
          '<td>' + pill(d) + '</td>' +
          '<td class="num val' + (d.resultado === 'passivo' ? ' pas' : '') + '">' + U.brl(d.valor) + '</td>' +
          '<td>' + cor(d) + '</td></tr>';
      });
      $('tb-docs').innerHTML = linhas.length ? linhas.join('') : '<tr><td colspan="8" class="gov-empty">Nenhum documento encontrado com esses filtros.</td></tr>';
      var a = soma(filtradas, 'ativo'), p = soma(filtradas, 'passivo');
      $('resumo-filtro').innerHTML = '<strong>' + U.int(filtradas.length) + '</strong> ' + (filtradas.length === 1 ? 'inconsistência' : 'inconsistências') +
        ' <span aria-hidden="true">·</span> ativo recuperável <strong>' + U.brl(a) + '</strong> <span aria-hidden="true">·</span> passivo <strong>' + U.brl(p) + '</strong> (não soma)';
      $('pg-info').textContent = filtradas.length ? 'Mostrando ' + U.int(ini + 1) + ' a ' + U.int(fim) + ' de ' + U.int(filtradas.length) + ' · página ' + pagina + ' de ' + pags : 'Nenhum resultado';
      $('pg-ant').disabled = pagina <= 1; $('pg-prox').disabled = pagina >= pags; $('pg-prim').disabled = pagina <= 1; $('pg-ult').disabled = pagina >= pags;
      $('rodape').innerHTML = '<span>Ativo recuperável total: <strong>' + U.brl(T.ativo) + '</strong> (soma ao potencial). Passivo total: <strong>' + U.brl(T.passivo) + '</strong> (exposição do município, não soma).</span>' +
        '<span>Base legal e enquadramento de cada item: a validar pelo jurídico antes de qualquer proposta.</span>';
    }

    // ---------- gaveta ----------
    var gv = $('gv'), fundo = $('gv-fundo');
    function def(r, v) { return '<div><dt>' + r + '</dt><dd>' + v + '</dd></div>'; }
    function montar(d, pos, total) {
      var ativo = d.resultado === 'ativo', h = '';
      h += '<div class="gsd-sec"><h3>Arquivo XML</h3><code>' + esc(d.arquivo) + '</code><p class="gsd-nota" style="margin-top:8px">ID do evento: ' + esc(d.idEvento) + '</p>' +
        '<p><button type="button" class="sec mini" data-copiar="' + d.n + '">Copiar nome do arquivo</button></p></div>';
      h += '<div class="gsd-sec"><h3>Documento e rubrica</h3><dl class="gsd-def">' + def('Evento eSocial', esc(d.evento)) + def('Competência', esc(d.competenciaTxt)) +
        def('Rubrica / item', esc(d.rubrica)) + def('Origem', esc(d.origem)) + '</dl></div>';
      h += '<div class="gsd-sec"><h3>Cálculo</h3><dl class="gsd-def">' + def('Base de cálculo', U.brl(d.valorBase)) + def('Alíquota', d.aliquota ? U.pct(d.aliquota, 0) + ' (patronal)' : 'não se aplica') + '</dl>' +
        '<p class="gsd-calc" style="margin-top:10px">' + esc(d.calculo) + '</p></div>';
      h += '<div class="gsd-sec"><h3>Inconsistência</h3><p>' + esc(d.inconsistencia) + '</p></div>';
      h += '<div class="gsd-sec"><h3>' + (ativo ? 'Por que é recuperável' : 'Por que é passivo') + '</h3><p>' + esc(d.porque) + '</p></div>';
      h += '<div class="gsd-sec"><h3>Base legal <span class="gs-chip n">a validar pelo jurídico</span></h3><p>' + esc(d.baseLegal) + '</p></div>';
      h += '<div class="gsd-sec"><h3>Prova exigida</h3><p>' + esc(d.prova) + '</p></div>';
      h += '<div class="gsd-sec"><h3>Resultado</h3><p class="gsd-res">' + pill(d) + '<span>' + U.brl(d.valor) + '</span>' + (d.cor ? GovDados.selo(d.cor) : '') + '</p>' +
        (ativo ? '' : '<p class="gsd-nota">Exposição do município. Não soma ao potencial de recuperação.</p>') + '</div>';
      h += '<p class="gsd-aviso">' + esc(P.AVISO) + '</p>';
      $('gv-corpo').innerHTML = h;
      $('gv-tit').textContent = d.evento + ' · ' + d.competenciaTxt;
      $('gv-pos').textContent = pos + ' de ' + U.int(total);
      $('gv-ant').disabled = pos <= 1; $('gv-prox').disabled = pos >= total;
      gv.scrollTop = 0;
    }
    function abrir(n, origem) {
      var pos = -1, d = null;
      for (var i = 0; i < filtradas.length; i++) if (filtradas[i].n === n) { pos = i + 1; d = filtradas[i]; break; }
      if (!d) { d = DOCS[n - 1]; pos = 1; }
      if (abertoId == null) gatilho = origem || document.activeElement;
      abertoId = n; montar(d, pos, filtradas.length);
      gv.hidden = false; fundo.hidden = false; gv.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('gov-sem-rolagem');
      $('gv-x').focus();
    }
    function fechar() {
      if (abertoId == null) return;
      abertoId = null; gv.hidden = true; fundo.hidden = true; gv.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('gov-sem-rolagem');
      if (gatilho && document.contains(gatilho)) gatilho.focus();
      gatilho = null;
    }
    function vizinha(dir) {
      var i = -1; for (var k = 0; k < filtradas.length; k++) if (filtradas[k].n === abertoId) { i = k; break; }
      var j = i + dir; if (i < 0 || j < 0 || j >= filtradas.length) return;
      abrir(filtradas[j].n);
      var np = Math.floor(j / tam) + 1; if (np !== pagina) { pagina = np; desenhar(); gatilho = null; }
    }

    function ler() { F.res = $('f-res').value; F.ano = $('f-ano').value; F.q = $('f-q').value; }
    ['f-res', 'f-ano'].forEach(function (id) { $(id).addEventListener('change', function () { ler(); pagina = 1; aplicar(); }); });
    var tq; $('f-q').addEventListener('input', function () { clearTimeout(tq); tq = setTimeout(function () { ler(); pagina = 1; aplicar(); }, 160); });
    $('f-limpar').addEventListener('click', function () { F = { res: '', ano: '', q: '' }; $('f-res').value = ''; $('f-ano').value = ''; $('f-q').value = ''; pagina = 1; aplicar(); });
    $('f-tam').addEventListener('change', function () { tam = +this.value; pagina = 1; aplicar(); });
    $('pg-prim').addEventListener('click', function () { pagina = 1; desenhar(); });
    $('pg-ant').addEventListener('click', function () { pagina--; desenhar(); });
    $('pg-prox').addEventListener('click', function () { pagina++; desenhar(); });
    $('pg-ult').addEventListener('click', function () { pagina = Math.ceil(filtradas.length / tam); desenhar(); });
    $('tb-docs').addEventListener('click', function (e) { var b = e.target.closest('[data-ver]'); if (b) abrir(+b.dataset.ver, b); });
    $('gv-corpo').addEventListener('click', function (e) { var c = e.target.closest('[data-copiar]'); if (c) U.copiar(DOCS[+c.dataset.copiar - 1].arquivo); });
    $('gv-x').addEventListener('click', fechar); fundo.addEventListener('click', fechar);
    $('gv-ant').addEventListener('click', function () { vizinha(-1); });
    $('gv-prox').addEventListener('click', function () { vizinha(1); });
    document.addEventListener('keydown', function (e) {
      if (abertoId == null) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(gv.querySelectorAll('button:not([disabled]), [href], input, select, textarea'), function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var p = f[0], u = f[f.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); } else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); } else if (!gv.contains(document.activeElement)) { e.preventDefault(); p.focus(); }
      }
    });
    $('bt-csv').addEventListener('click', function () {
      var L = ['# ' + P.AVISO, U.csvLinha(['Competência', 'Evento eSocial', 'Arquivo XML', 'ID do evento', 'Rubrica / item', 'Origem', 'Inconsistência', 'Resultado', 'Base de cálculo', 'Alíquota', 'Valor', 'Cor', 'Por quê', 'Base legal (a validar pelo jurídico)', 'Prova exigida'])];
      filtradas.forEach(function (d) {
        L.push(U.csvLinha([d.competenciaTxt, d.evento, d.arquivo, d.idEvento, d.rubrica, d.origem, d.inconsistencia, d.resultado === 'ativo' ? 'Ativo recuperável' : 'Passivo',
          U.csvNum(d.valorBase), d.aliquota ? U.pct(d.aliquota, 0) : '', U.csvNum(d.valor), d.cor ? (d.cor === 'verde' ? 'Verde' : 'Amarelo') : '', d.porque, d.baseLegal, d.prova]));
      });
      U.baixarCsv('reversa-gov-documentos-previdenciarios-simulados.csv', L);
      RV.toast('CSV gerado com ' + U.int(filtradas.length) + ' inconsistências (dados simulados).');
    });

    lerUrl(); aplicar();
  }
})();
