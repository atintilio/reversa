// Reversa Gov: fluxo de casos (Início, Diagnosticar, Casos e CRM Gov).
// Usa RV.api() (mesmos cookies de sessão do restante do Reversa) e o contrato /api/v1/gov/casos.
// A página escolhe o módulo pelo atributo data-gov-pag do <body>.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => RV.esc(s == null ? '' : s);

  const ETAPAS = [
    { id: 'a_apresentar', nome: 'A apresentar' },
    { id: 'apresentado', nome: 'Apresentado' },
    { id: 'em_analise_municipio', nome: 'Em análise pelo município' },
    { id: 'validacao_tecnica', nome: 'Validação técnica' },
    { id: 'proposta_contrato', nome: 'Proposta / contrato' },
    { id: 'em_execucao', nome: 'Em execução' },
    { id: 'concluido', nome: 'Concluído' },
    { id: 'perdido_pausado', nome: 'Perdido / pausado' },
  ];
  const TIPOS = {
    fiscal: 'Fiscal (IRRF)',
    previdenciario: 'Previdenciário',
    consolidado: 'Consolidado',
  };
  const nomeEtapa = (id) => (ETAPAS.find((e) => e.id === id) || {}).nome || id || '—';
  const nomeTipo = (id) => TIPOS[id] || id || '—';

  // valor_estimado é tratado como reais (mesma unidade dos números do exemplo de entrega).
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const brl = (v) => 'R$ ' + num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function brlCurto(v) {
    const n = num(v), a = Math.abs(n);
    if (a >= 1e9) return 'R$ ' + (n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi';
    if (a >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
    return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  }
  const valorCaso = (c) => (c.valor_estimado == null ? null : num(c.valor_estimado));
  const textoValor = (c, curto) => (valorCaso(c) == null ? 'A calcular' : (curto ? brlCurto : brl)(valorCaso(c)));

  // Chamada à API: converte falha de rede em mensagem clara.
  async function api(metodo, url, corpo) {
    try {
      return await RV.api(metodo, url, corpo);
    } catch (e) {
      if (e instanceof TypeError) throw new Error('Não foi possível falar com o servidor. Verifique a conexão e tente novamente.');
      throw e;
    }
  }
  // A API devolve camelCase; as telas usam snake_case. Normaliza uma vez, na entrada.
  const norm = (c) => {
    if (!c || typeof c !== 'object') return c;
    const m = { valorEstimado: 'valor_estimado', ibge: 'ibge_code', periodoAnos: 'periodo_anos', createdAt: 'created_at', updatedAt: 'updated_at', motivoPerda: 'motivo_perda' };
    Object.keys(m).forEach((k) => { if (c[m[k]] === undefined && c[k] !== undefined) c[m[k]] = c[k]; });
    return c;
  };
  const lista = (d) => (Array.isArray(d) ? d : (d && (d.casos || d.items)) || []).map(norm);
  const umCaso = (d) => norm((d && d.caso) || d);

  // Município e UF: vêm no caso ou, se faltarem, do catálogo (consulta por código IBGE, com cache).
  const cacheMun = new Map();
  function municipioPorIbge(ibge) {
    ibge = String(ibge);
    if (!cacheMun.has(ibge)) {
      cacheMun.set(ibge, api('GET', '/api/v1/gov/municipios?q=' + encodeURIComponent(ibge) + '&limit=5')
        .then((d) => (d.municipios || []).find((m) => String(m.ibgeCode) === ibge) || null)
        .catch(() => { cacheMun.delete(ibge); return null; }));
    }
    return cacheMun.get(ibge);
  }
  async function completar(casos) {
    await Promise.all(casos.map(async (c) => {
      if (c.municipio && c.uf) return;
      const m = await municipioPorIbge(c.ibge_code);
      if (m) { c.municipio = c.municipio || m.name; c.uf = c.uf || m.state; }
    }));
    return casos;
  }
  const rotuloMun = (c) => (c.municipio ? c.municipio + (c.uf ? '/' + c.uf : '') : 'IBGE ' + c.ibge_code);

  async function listarCasos() {
    const d = await api('GET', '/api/v1/gov/casos');
    return completar(lista(d));
  }

  const pillEtapa = (id) => `<span class="gov-etapa e-${esc(id)}">${esc(nomeEtapa(id))}</span>`;
  const erroHtml = (e) => `<div class="gov-alert bad" role="alert">${esc(e.message || e)}</div>`;

  function moverEtapa(id, etapa, nota) {
    const corpo = { etapa };
    if (nota) corpo.nota = nota;
    return api('POST', `/api/v1/gov/casos/${encodeURIComponent(id)}/etapa`, corpo);
  }

  // Download do PDF como blob (mesmo padrão do exemplo de entrega). Se a API responder 501, mostra a mensagem do servidor.
  function baixarPdf(caso, tipo, botao) {
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
    RV.toast('Gerando o PDF…');
    return fetch(`/api/v1/gov/casos/${encodeURIComponent(caso.id)}/relatorio?tipo=${encodeURIComponent(tipo)}`, { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) { location.href = '/login.html'; throw new Error('Sessão expirada.'); }
        if (!r.ok) {
          return r.json().catch(() => ({})).then((j) => {
            throw new Error((j.error && j.error.message) || j.erro || (r.status === 501 ? 'O relatório deste caso ainda não está disponível.' : 'Falha ao gerar o PDF.'));
          });
        }
        return r.blob();
      })
      .then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'Reversa-Gov-' + (caso.numero || caso.id) + '-Relatorio-' + (tipo === 'tecnico' ? 'Tecnico' : 'Comercial') + '.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      })
      .catch((err) => RV.toast(err instanceof TypeError ? 'Não foi possível falar com o servidor.' : err.message, 6000))
      .finally(() => { if (botao) { botao.disabled = false; botao.textContent = rotulo; } });
  }

  const param = (k) => new URLSearchParams(location.search).get(k);

  /* ------------------------------------------------------------ Início */
  async function inicio() {
    const box = $('painel-etapas');
    try {
      const casos = await listarCasos();
      const total = casos.length;
      const soma = casos.reduce((s, c) => s + (valorCaso(c) || 0), 0);
      const andamento = casos.filter((c) => c.etapa !== 'concluido' && c.etapa !== 'perdido_pausado').length;
      $('kpi-casos').textContent = total.toLocaleString('pt-BR');
      $('kpi-carteira').textContent = brlCurto(soma);
      $('kpi-andamento').textContent = andamento.toLocaleString('pt-BR');
      $('kpi-concluidos').textContent = casos.filter((c) => c.etapa === 'concluido').length.toLocaleString('pt-BR');
      if (!total) {
        box.innerHTML = '<div class="gov-empty">Nenhum caso cadastrado ainda. <a class="gov-link" href="/gov-municipios.html">Escolha um município</a> para gerar o primeiro, ou abra o <a class="gov-link" href="/gov-crm.html">CRM Gov</a> para cadastrar o exemplo.</div>';
        return;
      }
      const max = Math.max(1, ...ETAPAS.map((e) => casos.filter((c) => c.etapa === e.id).length));
      box.innerHTML = '<div class="gov-barras">' + ETAPAS.map((e) => {
        const col = casos.filter((c) => c.etapa === e.id);
        const v = col.reduce((s, c) => s + (valorCaso(c) || 0), 0);
        return `<div class="gov-barra e-${e.id}"><span class="rot">${esc(e.nome)}</span><div class="trilho"><div class="fill" style="width:${(col.length / max) * 100}%"></div></div><span class="val">${col.length}<small>${col.length ? brlCurto(v) : 'sem casos'}</small></span></div>`;
      }).join('') + '</div>';
    } catch (e) {
      ['kpi-casos', 'kpi-carteira', 'kpi-andamento', 'kpi-concluidos'].forEach((id) => { $(id).textContent = '—'; });
      box.innerHTML = erroHtml(e);
    }
  }

  /* ------------------------------------------------------------ Diagnosticar */
  async function diagnosticar() {
    const ibge = (param('ibge') || '').replace(/\D/g, '');
    let tipo = TIPOS[param('tipo')] ? param('tipo') : null;
    let municipio = null;
    const cabMun = $('dg-municipio'), btn = $('dg-gerar'), aviso = $('dg-aviso');

    function atualizar() {
      document.querySelectorAll('.gov-tipo').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === tipo)));
      document.querySelectorAll('[data-tipo-link]').forEach((a) => {
        if (a.dataset.tipoLink === tipo) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      btn.disabled = !(municipio && tipo);
      btn.textContent = tipo ? `Gerar caso ${nomeTipo(tipo).toLowerCase()}` : 'Gerar caso';
      aviso.textContent = !municipio ? 'Escolha um município para continuar.' : !tipo ? 'Escolha um tipo de diagnóstico.' : '';
    }
    document.querySelector('.gov-tipos').addEventListener('click', (e) => {
      const b = e.target.closest('.gov-tipo'); if (!b) return;
      tipo = b.dataset.tipo;
      const u = new URL(location.href); u.searchParams.set('tipo', tipo); history.replaceState(null, '', u);
      atualizar();
    });

    if (!ibge) {
      cabMun.innerHTML = '<div><h2>Nenhum município escolhido</h2><p class="meta">O diagnóstico é sempre feito para um município do catálogo.</p></div><a class="btn" href="/gov-municipios.html">Escolher município</a>';
    } else {
      cabMun.innerHTML = '<div class="meta">Carregando município…</div>';
      try {
        const d = await api('GET', '/api/v1/gov/municipios?q=' + encodeURIComponent(ibge) + '&limit=5');
        municipio = (d.municipios || []).find((m) => String(m.ibgeCode) === ibge) || null;
        cabMun.innerHTML = municipio
          ? `<div><h2>${esc(municipio.name)}/${esc(municipio.state)}</h2><p class="meta" style="margin:4px 0 0">Código IBGE <span class="mono">${esc(municipio.ibgeCode)}</span>${municipio.region ? ' · Região ' + esc(municipio.region) : ''}</p></div><a class="btn sec" href="/gov-municipios.html">Trocar município</a>`
          : `<div><h2>Município não encontrado</h2><p class="meta">Nenhum município do catálogo tem o código IBGE ${esc(ibge)}.</p></div><a class="btn" href="/gov-municipios.html">Escolher município</a>`;
      } catch (e) {
        cabMun.innerHTML = erroHtml(e) + '<a class="btn sec" href="/gov-municipios.html">Escolher município</a>';
      }
    }
    atualizar();

    btn.addEventListener('click', async () => {
      if (!municipio || !tipo) return;
      const rotulo = btn.textContent;
      btn.disabled = true; btn.textContent = 'Gerando caso…';
      try {
        const d = await api('POST', '/api/v1/gov/casos', { ibge: ibge, tipo: tipo });
        const caso = umCaso(d);
        if (!caso || caso.id == null) throw new Error('O servidor não devolveu o identificador do caso.');
        location.href = '/gov-casos.html?id=' + encodeURIComponent(caso.id);
      } catch (e) {
        RV.toast(e.message, 6000);
        btn.disabled = false; btn.textContent = rotulo;
      }
    });
  }

  /* ------------------------------------------------------------ Casos */
  async function casos() {
    const id = param('id');
    if (id) return detalhe(id);
    $('vista-lista').hidden = false;
    const corpo = $('tbody-casos'), filtro = $('filtro-etapa');
    filtro.innerHTML = '<option value="">Todas as etapas</option>' + ETAPAS.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
    let todos = [];
    function desenhar() {
      const f = filtro.value;
      const vis = todos.filter((c) => !f || c.etapa === f);
      $('casos-resumo').textContent = `${vis.length} caso(s)`;
      if (!todos.length) { corpo.innerHTML = '<tr><td colspan="6" class="gov-empty">Nenhum caso cadastrado ainda. <a class="gov-link" href="/gov-municipios.html">Escolha um município</a> para gerar o primeiro.</td></tr>'; return; }
      if (!vis.length) { corpo.innerHTML = '<tr><td colspan="6" class="gov-empty">Nenhum caso nesta etapa.</td></tr>'; return; }
      corpo.innerHTML = vis.map((c) => `
        <tr class="click" tabindex="0" data-id="${esc(c.id)}">
          <td><a class="gov-link" href="/gov-casos.html?id=${encodeURIComponent(c.id)}"><strong>${esc(c.numero || c.id)}</strong></a></td>
          <td>${esc(rotuloMun(c))}</td>
          <td>${esc(nomeTipo(c.tipo))}</td>
          <td class="num">${esc(textoValor(c))}</td>
          <td>${pillEtapa(c.etapa)}</td>
          <td class="num">${RV.data(c.created_at)}</td>
        </tr>`).join('');
    }
    filtro.addEventListener('change', desenhar);
    corpo.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a')) location.href = '/gov-casos.html?id=' + encodeURIComponent(tr.dataset.id); });
    corpo.addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') location.href = '/gov-casos.html?id=' + encodeURIComponent(tr.dataset.id); });
    try { todos = await listarCasos(); desenhar(); }
    catch (e) { $('casos-resumo').textContent = ''; corpo.innerHTML = `<tr><td colspan="6">${erroHtml(e)}</td></tr>`; }
  }

  function resultadoHtml(r) {
    if (r == null || (typeof r === 'object' && !Object.keys(r).length)) return null;
    if (typeof r !== 'object') return `<p style="margin:0;color:var(--fg)">${esc(r)}</p>`;
    const rot = (k) => { const t = k.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
    const simples = Object.entries(r).filter(([, v]) => v == null || typeof v !== 'object');
    const compostos = Object.entries(r).filter(([, v]) => v != null && typeof v === 'object');
    return (simples.length ? '<dl class="gov-def">' + simples.map(([k, v]) => `<div><dt>${esc(rot(k))}</dt><dd>${esc(v == null ? '—' : v)}</dd></div>`).join('') + '</dl>' : '')
      + compostos.map(([k, v]) => `<h3 style="margin:16px 0 6px;font-size:.95rem">${esc(rot(k))}</h3><pre class="gov-pre">${esc(JSON.stringify(v, null, 2))}</pre>`).join('');
  }

  async function detalhe(id) {
    $('vista-detalhe').hidden = false;
    const box = $('vista-detalhe');
    box.innerHTML = '<div class="gov-empty">Carregando caso…</div>';
    let caso;
    try {
      caso = umCaso(await api('GET', '/api/v1/gov/casos/' + encodeURIComponent(id)));
      await completar([caso]);
    } catch (e) {
      box.innerHTML = erroHtml(e) + '<p><a class="gov-link" href="/gov-crm.html">← Voltar para o CRM</a></p>';
      return;
    }
    function desenhar() {
      const res = resultadoHtml(caso.resultado);
      const hist = (caso.historico || []).slice().sort((a, b) => new Date(b.em) - new Date(a.em));
      $('cab-titulo').innerHTML = `Caso <em>${esc(caso.numero || caso.id)}</em>`;
      $('cab-sub').textContent = `${rotuloMun(caso)} · ${nomeTipo(caso.tipo)}`;
      box.innerHTML = `
        <p style="margin:0"><a class="gov-link" href="/gov-crm.html">← Voltar para o CRM</a></p>
        <section class="gov-card" aria-labelledby="t-dados">
          <h2 id="t-dados">Dados do caso</h2>
          <dl class="gov-def">
            <div><dt>Número</dt><dd>${esc(caso.numero || caso.id)}</dd></div>
            <div><dt>Município</dt><dd>${esc(rotuloMun(caso))}</dd></div>
            <div><dt>Código IBGE</dt><dd class="mono">${esc(caso.ibge_code)}</dd></div>
            <div><dt>Tipo</dt><dd>${esc(nomeTipo(caso.tipo))}</dd></div>
            <div><dt>Etapa</dt><dd>${pillEtapa(caso.etapa)}</dd></div>
            <div><dt>Valor estimado</dt><dd>${esc(textoValor(caso))}</dd></div>
            <div><dt>Período analisado</dt><dd>${caso.periodo_anos ? esc(caso.periodo_anos) + ' ano(s)' : '—'}</dd></div>
            <div><dt>Criado em</dt><dd>${RV.data(caso.created_at, true)}</dd></div>
            <div><dt>Atualizado em</dt><dd>${RV.data(caso.updated_at, true)}</dd></div>
          </dl>
        </section>
        <section class="gov-card" aria-labelledby="t-res">
          <h2 id="t-res">Resultado do diagnóstico</h2>
          ${res || '<div class="gov-alert warn" style="margin:0"><strong>Diagnóstico pendente de dados.</strong> Este caso foi cadastrado sem dados de folha. O valor estimado e o resultado só aparecem depois que os dados do município forem enviados e o cálculo for feito.</div>'}
        </section>
        <section class="gov-card" aria-labelledby="t-etapa">
          <h2 id="t-etapa">Mover de etapa</h2>
          <form class="gov-mover" id="form-etapa" novalidate>
            <label>Nova etapa
              <select id="sel-etapa">${ETAPAS.map((e) => `<option value="${e.id}"${e.id === caso.etapa ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
            </label>
            <label class="gov-field-nota" id="lbl-nota"><span id="txt-nota">Nota (opcional)</span>
              <input type="text" id="nota-etapa" maxlength="500" placeholder="Registre o que aconteceu">
            </label>
            <button type="submit" id="bt-mover">Mover</button>
          </form>
          <p id="erro-etapa" class="gov-alert bad" role="alert" hidden style="margin:12px 0 0"></p>
        </section>
        <section class="gov-card" aria-labelledby="t-pdf">
          <h2 id="t-pdf">Relatórios</h2>
          <p>O relatório comercial é o que se apresenta ao município. O técnico é de uso interno.</p>
          <div class="gov-actions">
            <button type="button" class="btn" data-pdf="tecnico">Exportar PDF técnico</button>
            <button type="button" class="btn sec" data-pdf="comercial">Exportar PDF comercial</button>
          </div>
        </section>
        <section class="gov-card" aria-labelledby="t-hist">
          <h2 id="t-hist">Histórico de etapas</h2>
          ${hist.length ? '<ol class="gov-hist">' + hist.map((h) => `<li><div class="q">${h.de ? esc(nomeEtapa(h.de)) + ' → ' : 'Início em '}${esc(nomeEtapa(h.para))}</div><div class="m">${RV.data(h.em, true)}</div>${h.nota ? `<div class="n">${esc(h.nota)}</div>` : ''}</li>`).join('') + '</ol>' : '<div class="gov-empty" style="padding:8px 0;text-align:left">Ainda não há movimentações registradas.</div>'}
        </section>`;
      ligar();
    }
    function ligar() {
      const sel = $('sel-etapa'), nota = $('nota-etapa'), erro = $('erro-etapa');
      function ajustaNota() {
        const obrig = sel.value === 'perdido_pausado';
        $('txt-nota').textContent = obrig ? 'Motivo (obrigatório)' : 'Nota (opcional)';
        nota.required = obrig;
        nota.placeholder = obrig ? 'Explique por que o caso foi perdido ou pausado' : 'Registre o que aconteceu';
      }
      sel.addEventListener('change', ajustaNota); ajustaNota();
      $('form-etapa').addEventListener('submit', async (e) => {
        e.preventDefault();
        erro.hidden = true;
        if (sel.value === caso.etapa) { erro.textContent = 'O caso já está nesta etapa.'; erro.hidden = false; return; }
        if (sel.value === 'perdido_pausado' && !nota.value.trim()) { erro.textContent = 'Informe o motivo para marcar o caso como perdido ou pausado.'; erro.hidden = false; nota.focus(); return; }
        const bt = $('bt-mover'); bt.disabled = true;
        try {
          await moverEtapa(caso.id, sel.value, nota.value.trim());
          RV.toast('Etapa atualizada.');
          const novo = umCaso(await api('GET', '/api/v1/gov/casos/' + encodeURIComponent(id)));
          caso = await completar([novo]).then((a) => a[0]);
          desenhar();
        } catch (err) { erro.textContent = err.message; erro.hidden = false; bt.disabled = false; }
      });
      box.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => baixarPdf(caso, b.dataset.pdf, b)));
    }
    desenhar();
  }

  /* ------------------------------------------------------------ CRM Gov */
  async function crm() {
    const quadro = $('gov-kanban');
    let todos = [];
    let pendente = null; // { id, etapa }: aguardando o motivo para perdido_pausado
    let arrastando = null;

    function cartao(c) {
      return `<article class="gov-cc" draggable="true" data-id="${esc(c.id)}">
        <div class="topo"><a class="num" href="/gov-casos.html?id=${encodeURIComponent(c.id)}">${esc(c.numero || c.id)}</a><span class="gov-etapa" style="font-size:11px;padding:2px 8px">${esc(nomeTipo(c.tipo))}</span></div>
        <div class="nm">${esc(rotuloMun(c))}</div>
        <div class="meta"><span class="val">${esc(textoValor(c, true))}</span><span title="Última movimentação">${RV.data(c.updated_at || c.created_at)}</span></div>
        <div class="acoes-cc">
          <select aria-label="Mover o caso ${esc(c.numero || c.id)} para outra etapa" data-mover="${esc(c.id)}">${ETAPAS.map((e) => `<option value="${e.id}"${e.id === c.etapa ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
          <details><summary>Exportar PDF</summary><div class="menu-pdf"><button type="button" data-pdf="tecnico" data-id="${esc(c.id)}">PDF técnico</button><button type="button" data-pdf="comercial" data-id="${esc(c.id)}">PDF comercial</button></div></details>
        </div>
      </article>`;
    }
    function formMotivo() {
      const c = todos.find((x) => String(x.id) === String(pendente.id));
      return `<form class="gov-motivo" data-motivo novalidate>
        <label>Motivo para mover ${esc(c ? (c.numero || c.id) : '')} para Perdido / pausado
          <textarea name="nota" maxlength="500" required placeholder="Explique por que o caso foi perdido ou pausado"></textarea></label>
        <small class="gov-motivo-erro" role="alert" hidden style="color:var(--bad)">Informe o motivo para continuar.</small>
        <div class="acoes"><button type="submit" class="mini">Confirmar</button><button type="button" class="mini sec" data-cancela>Cancelar</button></div>
      </form>`;
    }
    function desenhar() {
      quadro.innerHTML = ETAPAS.map((e) => {
        const col = todos.filter((c) => c.etapa === e.id);
        const soma = col.reduce((s, c) => s + (valorCaso(c) || 0), 0);
        return `<section class="gov-col" data-etapa="${e.id}" aria-label="${esc(e.nome)}"><header><b>${esc(e.nome)} · ${col.length}</b><span>${col.length ? brlCurto(soma) : 'R$ 0'}</span></header>` +
          (pendente && pendente.etapa === e.id ? formMotivo() : '') +
          (col.length ? col.map(cartao).join('') : '<p class="vazio-col">Nenhum caso</p>') + '</section>';
      }).join('');
      $('crm-vazio').hidden = todos.length > 0;
      const f = quadro.querySelector('textarea'); if (f) f.focus();
    }

    async function mover(id, etapa, nota) {
      const c = todos.find((x) => String(x.id) === String(id));
      if (!c || c.etapa === etapa) { pendente = null; desenhar(); return; }
      if (etapa === 'perdido_pausado' && !nota) { pendente = { id, etapa }; desenhar(); return; }
      try {
        const r = await moverEtapa(id, etapa, nota);
        const novo = r && norm(r.caso || (r.id != null ? r : null));
        c.etapa = (novo && novo.etapa) || etapa;
        c.updated_at = (novo && novo.updated_at) || new Date().toISOString();
        pendente = null;
        RV.toast(`${c.numero || c.id} movido para ${nomeEtapa(etapa)}.`);
      } catch (err) {
        RV.toast(err.message, 6000);
      }
      desenhar();
    }

    quadro.addEventListener('change', (e) => { const s = e.target.closest('select[data-mover]'); if (s) mover(s.dataset.mover, s.value); });
    quadro.addEventListener('click', (e) => {
      const p = e.target.closest('[data-pdf]');
      if (p) {
        const c = todos.find((x) => String(x.id) === String(p.dataset.id));
        const d = p.closest('details'); if (d) d.open = false;
        if (c) baixarPdf(c, p.dataset.pdf, p);
        return;
      }
      if (e.target.closest('[data-cancela]')) { pendente = null; desenhar(); }
    });
    quadro.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-motivo]'); if (!f) return;
      e.preventDefault();
      const nota = f.nota.value.trim();
      if (!nota) { f.querySelector('.gov-motivo-erro').hidden = false; f.nota.focus(); return; }
      mover(pendente.id, pendente.etapa, nota);
    });
    quadro.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.gov-cc'); if (!c) return;
      arrastando = c.dataset.id; c.classList.add('arrastando');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastando);
    });
    quadro.addEventListener('dragend', () => { arrastando = null; quadro.querySelectorAll('.arrastando,.alvo').forEach((x) => x.classList.remove('arrastando', 'alvo')); });
    quadro.addEventListener('dragover', (e) => {
      const col = e.target.closest('.gov-col'); if (!col || arrastando == null) return;
      e.preventDefault();
      quadro.querySelectorAll('.gov-col.alvo').forEach((x) => { if (x !== col) x.classList.remove('alvo'); });
      col.classList.add('alvo');
    });
    quadro.addEventListener('dragleave', (e) => { const col = e.target.closest('.gov-col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('alvo'); });
    quadro.addEventListener('drop', (e) => {
      const col = e.target.closest('.gov-col'); if (!col || arrastando == null) return;
      e.preventDefault(); col.classList.remove('alvo');
      const id = arrastando; arrastando = null;
      mover(id, col.dataset.etapa);
    });

    $('bt-exemplo').addEventListener('click', async (e) => {
      const bt = e.currentTarget; bt.disabled = true;
      try {
        await api('POST', '/api/v1/gov/casos/exemplo', {});
        todos = await listarCasos(); desenhar();
        RV.toast('Exemplo de Tupaciguara cadastrado.');
      } catch (err) { RV.toast(err.message, 6000); }
      bt.disabled = false;
    });

    quadro.innerHTML = '<div class="gov-empty" style="grid-column:1/-1">Carregando casos…</div>';
    quadro.setAttribute('aria-busy', 'true');
    try { todos = await listarCasos(); }
    catch (e) { $('crm-erro').innerHTML = erroHtml(e); $('crm-erro').hidden = false; todos = []; }
    quadro.removeAttribute('aria-busy');
    desenhar();
    // sem casos e com erro: não oferece o exemplo (evita duplicar quando só a rede falhou)
    if (!$('crm-erro').hidden) $('crm-vazio').hidden = true;
  }

  const pag = document.body.dataset.govPag;
  ({ inicio, diagnosticar, casos, crm }[pag] || (() => {}))();
})();
