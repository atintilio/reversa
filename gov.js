// Reversa Gov: frontend do módulo IRRF Municipal (isolado, aditivo).
// Carregado em gov.html (candidatos), gov-municipios.html (catálogo e seleção) e gov-exemplo.html (exemplo de entrega).
// Cada bloco só roda se os elementos da página existirem. Chamadas API via RV.api() e estado de tela.
// Nenhuma interação com páginas ou rotas existentes do Reversa.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let paginaMun = 1;
  let selecionado = null; // { ibge, nome, uf }
  const POR_PAGINA = 50;
  const ROTULO_STATUS = { precadastrado: 'Pré-cadastrado', active: 'No CRM', suspended: 'Suspenso', archived: 'Arquivado' };

  async function carregarMunicipios() {
    const tbody = document.getElementById('tbody-municipios');
    if (!tbody) return;
    try {
      const q = document.getElementById('busca-municipio').value.trim();
      const uf = document.getElementById('filtro-uf').value;
      const params = new URLSearchParams({ page: String(paginaMun), limit: String(POR_PAGINA) });
      if (q) params.set('q', q);
      if (uf) params.set('uf', uf);
      let dados;
      if (window.RV_GOV_DEMO) {
        // demonstração: lista a carteira simulada (nenhuma chamada à API)
        await new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
        const D = await window.GovDados.carregar(), REG = { MG: 'Sudeste', PR: 'Sul', GO: 'Centro-Oeste' };
        const todos = D.municipios.map((m) => ({ ibgeCode: m.ibge, name: m.nome, state: m.uf, region: REG[m.uf] || '', status: 'active', isCapital: false }))
          .filter((m) => (!uf || m.state === uf) && (!q || (m.name + ' ' + m.state + ' ' + m.ibgeCode).toLowerCase().includes(q.toLowerCase())));
        dados = { total: todos.length, page: paginaMun, municipios: todos.slice((paginaMun - 1) * POR_PAGINA, paginaMun * POR_PAGINA) };
      } else dados = await RV.api('GET', `/api/v1/gov/municipios?${params}`);

      const total = dados.total || 0;
      const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
      document.getElementById('mun-resumo').textContent = `${total.toLocaleString('pt-BR')} município(s)`;
      document.getElementById('mun-pagina').textContent = `Página ${dados.page} de ${paginas}`;
      document.getElementById('mun-anterior').disabled = dados.page <= 1;
      document.getElementById('mun-proxima').disabled = dados.page >= paginas;

      if (!dados.municipios || dados.municipios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="gov-empty">Nenhum município encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = dados.municipios.map((m) => `
        <tr class="click${selecionado && selecionado.ibge === String(m.ibgeCode) ? ' sel' : ''}" tabindex="0" aria-selected="${selecionado && selecionado.ibge === String(m.ibgeCode)}" data-ibge="${RV.esc(m.ibgeCode)}" data-nome="${RV.esc(m.name)}" data-uf="${RV.esc(m.state)}">
          <td><strong>${RV.esc(m.name)}</strong>${m.isCapital ? ' <span class="gov-badge warn">Capital</span>' : ''}</td>
          <td class="num">${RV.esc(m.ibgeCode)}</td>
          <td>${RV.esc(m.state)}</td>
          <td>${RV.esc(m.region)}</td>
          <td><span class="gov-badge ${m.status === 'active' ? 'ok' : 'warn'}">${RV.esc(ROTULO_STATUS[m.status] || m.status)}</span></td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="gov-alert bad">${RV.esc(e.message)}</td></tr>`;
    }
  }

  async function carregarCandidatos() {
    if (!document.getElementById('tbody-candidatos')) return;
    try {
      const status = document.getElementById('filtro-status').value;
      const params = status ? `?status=${encodeURIComponent(status)}` : '';
      const dados = await RV.api('GET', `/api/v1/gov/candidatos${params}`);
      const tbody = document.getElementById('tbody-candidatos');
      tbody.innerHTML = '';

      if (!dados.candidatos || dados.candidatos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="gov-empty">Nenhum candidato encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = dados.candidatos.map((c) => `
        <tr class="click" data-id="${RV.esc(c.id)}">
          <td><strong>${RV.esc(c.entityName || '—')}</strong><div class="muted mono" style="font-size:12px">${RV.esc(c.entityCnpj || '—')}</div></td>
          <td class="num">${RV.esc(c.period || '—')}</td>
          <td class="num">${RV.reaisCurto(c.withheldAmountCents)}</td>
          <td class="num">${c.potentialAmountCents != null ? RV.reaisCurto(c.potentialAmountCents) : '—'}</td>
          <td><span class="gov-badge ${c.confidence === 'HIGH' ? 'ok' : c.confidence === 'MEDIUM' ? 'warn' : 'info'}">${RV.esc(c.confidence || '—')}</span></td>
          <td><span class="gov-badge info">${RV.esc(c.status)}</span></td>
        </tr>
      `).join('');
    } catch (e) {
      const tbody = document.getElementById('tbody-candidatos');
      tbody.innerHTML = `<tr><td colspan="6" class="gov-alert bad">${RV.esc(e.message)}</td></tr>`;
    }
  }

  async function carregarKPIs() {
    try {
      // Tenta buscar dashboard; se não existir ainda, exibe placeholders
      if (window.RV_GOV_DEMO) {
        await new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
        const D = await window.GovDados.carregar(), el = document.getElementById('kpi-municipios');
        if (el) el.textContent = String(D.municipios.length);
        return;
      }
      try {
        const dados = await RV.api('GET', '/api/v1/gov/dashboard');
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        const cat = dados.catalogo ?? dados.municipios;
        set('kpi-municipios', cat == null ? '—' : Number(cat).toLocaleString('pt-BR'));
        set('kpi-candidatos', dados.candidatos ?? '—');
        set('kpi-revisao', dados.emRevisao ?? '—');
        set('kpi-validados', dados.validados ?? '—');
      } catch (e) {
        // Dashboard ainda não implementado no backend; manter placeholders
      }
    } catch (e) {
      // silencioso
    }
  }

  function esc(s) { return RV.esc(s == null ? '' : s); }

  let temporizador;
  if ($('busca-municipio')) {
    $('busca-municipio').addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => { paginaMun = 1; carregarMunicipios(); }, 250);
    });
    $('filtro-uf').addEventListener('change', () => { paginaMun = 1; carregarMunicipios(); });
    $('mun-anterior').addEventListener('click', () => { paginaMun -= 1; carregarMunicipios(); });
    $('mun-proxima').addEventListener('click', () => { paginaMun += 1; carregarMunicipios(); });
  }
  if ($('filtro-status')) $('filtro-status').addEventListener('change', carregarCandidatos);

  // Seleção de município: habilita "Confirmar", que leva ao diagnóstico do município escolhido.
  function marcarMunicipio(tr) {
    selecionado = { ibge: tr.dataset.ibge, nome: tr.dataset.nome, uf: tr.dataset.uf };
    document.querySelectorAll('#tbody-municipios tr.sel').forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-selected', 'false'); });
    tr.classList.add('sel'); tr.setAttribute('aria-selected', 'true');
    atualizarConfirmar();
  }
  function atualizarConfirmar() {
    const bt = $('mun-confirmar'); if (!bt) return;
    bt.disabled = !selecionado;
    $('mun-escolhido').innerHTML = selecionado
      ? `Município escolhido: <strong>${esc(selecionado.nome)}/${esc(selecionado.uf)}</strong> <span class="mono">(${esc(selecionado.ibge)})</span>`
      : 'Selecione um município na lista para continuar.';
  }
  if ($('tbody-municipios')) {
    $('tbody-municipios').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-ibge]');
      if (tr) marcarMunicipio(tr);
    });
    $('tbody-municipios').addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-ibge]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); marcarMunicipio(tr); }
    });
    $('tbody-municipios').addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr[data-ibge]');
      if (tr) { marcarMunicipio(tr); location.href = '/gov-diagnosticar.html?ibge=' + encodeURIComponent(tr.dataset.ibge); }
    });
    $('mun-confirmar').addEventListener('click', () => {
      if (selecionado) location.href = '/gov-diagnosticar.html?ibge=' + encodeURIComponent(selecionado.ibge);
    });
    atualizarConfirmar();
  }

  if ($('tbody-candidatos')) $('tbody-candidatos').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) RV.toast(`Candidato ${tr.dataset.id} — detalhamento em próxima fase.`);
  });

  // Exemplo de entrega (Tupaciguara/MG): números e download dos relatórios em PDF.
  function brl(v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }
  function milhoes(v) { return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'; }
  async function carregarExemplo() {
    try {
      const ex = await RV.api('GET', '/api/v1/gov/exemplo');
      const ref = ex.cenarios.find((c) => c.destaque);
      document.getElementById('ex-caixa').textContent = milhoes(ref.total36);
      document.getElementById('ex-retro').textContent = milhoes(ref.retro);
      document.getElementById('ex-rec').textContent = brl(ref.recAno);
      document.getElementById('ex-irrf').textContent = brl(ex.irrf.porAno);
    } catch (e) { /* o card segue sem números; os botões continuam */ }
  }
  const cardExemplo = document.querySelector('.gov-exemplo');
  if (cardExemplo) cardExemplo.addEventListener('click', (e) => {
    const bt = e.target.closest('[data-relatorio]');
    if (!bt) return;
    const tipo = bt.dataset.relatorio;
    const rotulo = bt.textContent;
    bt.disabled = true; bt.textContent = 'Gerando…';
    RV.toast('Gerando o PDF…');
    fetch('/api/v1/gov/exemplo/relatorio?tipo=' + encodeURIComponent(tipo), { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) { location.href = '/login.html'; throw new Error('Sessão expirada.'); }
        if (!r.ok) return r.json().then((j) => { throw new Error((j.error && j.error.message) || 'Falha ao gerar o PDF.'); });
        return r.blob();
      })
      .then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'Reversa-Gov-Tupaciguara-MG-Relatorio-' + (tipo === 'tecnico' ? 'Tecnico' : 'Comercial') + '.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      })
      .catch((err) => RV.toast(err.message))
      .finally(() => { bt.disabled = false; bt.textContent = rotulo; });
  });

  // Inicialização
  Promise.all([carregarMunicipios(), carregarCandidatos(), carregarKPIs(), cardExemplo ? carregarExemplo() : null]);
})();
