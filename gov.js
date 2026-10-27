// Reversa Gov — frontend do módulo IRRF Municipal (isolado, aditivo).
// Chamadas API via RV.api() e estado de tela.
// Nenhuma interação com páginas ou rotas existentes do Reversa.

(function () {
  'use strict';

  let paginaMun = 1;
  const POR_PAGINA = 50;
  const ROTULO_STATUS = { precadastrado: 'Pré-cadastrado', active: 'No CRM', suspended: 'Suspenso', archived: 'Arquivado' };

  async function carregarMunicipios() {
    const tbody = document.getElementById('tbody-municipios');
    try {
      const q = document.getElementById('busca-municipio').value.trim();
      const uf = document.getElementById('filtro-uf').value;
      const params = new URLSearchParams({ page: String(paginaMun), limit: String(POR_PAGINA) });
      if (q) params.set('q', q);
      if (uf) params.set('uf', uf);
      const dados = await RV.api('GET', `/api/v1/gov/municipios?${params}`);

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
        <tr class="click" data-ibge="${RV.esc(m.ibgeCode)}">
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
      try {
        const dados = await RV.api('GET', '/api/v1/gov/dashboard');
        document.getElementById('kpi-municipios').textContent = (dados.catalogo ?? dados.municipios ?? '—').toLocaleString('pt-BR');
        document.getElementById('kpi-candidatos').textContent = dados.candidatos ?? '—';
        document.getElementById('kpi-revisao').textContent = dados.emRevisao ?? '—';
        document.getElementById('kpi-validados').textContent = dados.validados ?? '—';
      } catch (e) {
        // Dashboard ainda não implementado no backend; manter placeholders
      }
    } catch (e) {
      // silencioso
    }
  }

  function esc(s) { return RV.esc(s == null ? '' : s); }

  let temporizador;
  document.getElementById('busca-municipio').addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { paginaMun = 1; carregarMunicipios(); }, 250);
  });
  document.getElementById('filtro-uf').addEventListener('change', () => { paginaMun = 1; carregarMunicipios(); });
  document.getElementById('mun-anterior').addEventListener('click', () => { paginaMun -= 1; carregarMunicipios(); });
  document.getElementById('mun-proxima').addEventListener('click', () => { paginaMun += 1; carregarMunicipios(); });
  document.getElementById('filtro-status').addEventListener('change', carregarCandidatos);

  // Navegação: clique em linha de município pode abrir detalhe (placeholder)
  document.getElementById('tbody-municipios').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-ibge]');
    if (tr) RV.toast(`Município ${tr.dataset.ibge} — o diagnóstico será gerado na próxima fase.`);
  });

  document.getElementById('tbody-candidatos').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) RV.toast(`Candidato ${tr.dataset.id} — detalhamento em próxima fase.`);
  });

  // Inicialização
  Promise.all([carregarMunicipios(), carregarCandidatos(), carregarKPIs()]);
})();
