// Reversa Tax — barra de navegação e utilitários comuns (carregado por todas as páginas internas).
(function () {
  'use strict';
  var RV = window.RV = window.RV || {};

  RV.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  RV.reais = function (c) {
    var neg = c < 0; c = Math.abs(Math.round(Number(c) || 0));
    var s = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var r = (c % 100).toString(); if (r.length < 2) r = '0' + r;
    return (neg ? '-' : '') + 'R$ ' + s + ',' + r;
  };
  RV.reaisCurto = function (c) {
    var v = (Number(c) || 0) / 100, a = Math.abs(v);
    if (a >= 1e9) return 'R$ ' + (v / 1e9).toFixed(1).replace('.', ',') + ' bi';
    if (a >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
    if (a >= 1e4) return 'R$ ' + Math.round(v / 1e3) + ' mil';
    return RV.reais(c);
  };
  RV.cnpj = function (c) { c = String(c || ''); return /^\d{14}$/.test(c) ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '—'); };
  RV.data = function (d, comHora) {
    if (!d) return '—';
    var x = new Date(d); if (isNaN(x)) return '—';
    var o = { day: '2-digit', month: '2-digit', year: 'numeric' }; if (comHora) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return x.toLocaleString('pt-BR', o);
  };
  RV.comp = function (c) { var p = String(c || '').split('-'); return p.length === 2 ? p[1] + '/' + p[0] : (c || '—'); };
  var tt;
  RV.toast = function (msg, ms) {
    var t = document.querySelector('.rv-toast');
    if (!t) { t = document.createElement('div'); t.className = 'rv-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, ms || 3600);
  };
  RV.api = function (metodo, url, corpo) {
    var op = { method: metodo, credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    return fetch(url, op).then(function (r) {
      if (r.status === 401) { location.href = '/login.html'; throw new Error('Sessão expirada.'); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error((j.error && j.error.message) || j.erro || ('Erro ' + r.status));
        return j;
      });
    });
  };
  RV.FASES = [
    { id: 'a_apresentar', nome: 'A apresentar' }, { id: 'apresentado', nome: 'Apresentado' },
    { id: 'aguardando_autorizacao', nome: 'Aguardando autorização' }, { id: 'contrato', nome: 'Contrato' }, { id: 'perdido', nome: 'Perdido' }
  ];
  RV.PAPEIS = { owner: 'Proprietário', admin: 'Administrador', analyst: 'Analista', viewer: 'Leitor', support: 'Suporte' };
  RV.pode = function (p) { return !!(RV.usuario && RV.usuario.permissions && RV.usuario.permissions[p]); };
  RV.nomeFase = function (id) { var f = RV.FASES.filter(function (x) { return x.id === id; })[0]; return f ? f.nome : id; };

  // barra de navegação (estilos embutidos para funcionar também na página de cálculo, que não carrega shell.css)
  if (!document.getElementById('rv-nav-css')) {
    var st = document.createElement('style'); st.id = 'rv-nav-css';
    st.textContent = '.rv-nav { position: sticky; top: 0; z-index: 50; background: #0E2239; color: #fff; font-family: var(--f-body, "Manrope", system-ui, sans-serif); } .rv-nav .in { max-width: 1240px; margin: 0 auto; padding: 0 20px; height: 56px; display: flex; align-items: center; gap: 22px; } .rv-nav .marca { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; font-family: "Open Sans", system-ui, sans-serif; font-weight: 700; letter-spacing: .05em; font-size: 15px; white-space: nowrap; } .rv-nav .marca img { height: 26px; width: auto; } .rv-nav .marca b { color: #3DB8AE; font-weight: 700; } .rv-nav .links { display: flex; gap: 4px; flex: 1; overflow-x: auto; scrollbar-width: none; } .rv-nav .links a { color: #C9D6E3; text-decoration: none; font-size: 14px; font-weight: 600; padding: 8px 12px; border-radius: 6px; white-space: nowrap; } .rv-nav .links a:hover { color: #fff; background: rgba(255,255,255,.08); } .rv-nav .links a[aria-current="page"] { color: #fff; background: rgba(61,184,174,.22); } .rv-nav .eu { display: flex; align-items: center; gap: 12px; font-size: 13px; color: #AFC0D2; white-space: nowrap; } .rv-nav .eu a { color: #fff; text-decoration: none; font-weight: 600; border: 1px solid rgba(255,255,255,.25); padding: 6px 12px; border-radius: 6px; } .rv-nav .eu a:hover { border-color: #3DB8AE; } @media (max-width: 760px) { .rv-nav .in { gap: 10px; padding: 0 12px; } .rv-nav .marca span, .rv-nav .eu .nome { display: none; } } .rv-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #0E2239; color: #fff; padding: 11px 18px; border-radius: 8px; font: 600 14px/1.4 "Manrope", system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.18); z-index: 100; max-width: calc(100vw - 32px); }';
    document.head.appendChild(st);
  }
  // barra de navegação
  var aqui = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  var links = [['/', 'Calcular'], ['/crm', 'CRM'], ['/clientes', 'Clientes'], ['/teses', 'Teses'], ['/dashboard', 'Dashboard'], ['/usuarios', 'Usuários']];
  var href = function (p) { return p === '/' ? '/' : p + '.html'; };
  var nav = document.createElement('header');
  nav.className = 'rv-nav';
  nav.innerHTML = '<div class="in"><a class="marca" href="/"><img src="/assets/reversa-r.png" alt=""><span>REVERSA <b>TAX</b></span></a>' +
    '<nav class="links" aria-label="Seções">' + links.map(function (l) {
      var atual = l[0] === '/' ? aqui === '/' : aqui.indexOf(l[0]) === 0;
      return '<a href="' + href(l[0]) + '"' + (l[0] === '/usuarios' ? ' data-admin hidden' : '') + (atual ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
    }).join('') + '</nav><div class="eu"><span class="nome"></span><a href="/api/logout">Sair</a></div></div>';
  function montar() {
    document.body.insertBefore(nav, document.body.firstChild);
    var velho = document.getElementById('sair'); if (velho) velho.remove();
  }
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);

  RV.eu = fetch('/api/v1/me', { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) { location.href = '/login.html'; return null; }
    return r.ok ? r.json() : null;
  }).catch(function () { return null; }).then(function (eu) {
    if (eu) {
      nav.querySelector('.nome').textContent = (eu.user && (eu.user.name || eu.user.email)) || '';
      if (eu.permissions && eu.permissions.manageMembers) nav.querySelectorAll('[data-admin]').forEach(function (a) { a.hidden = false; });
    }
    RV.usuario = eu;
    return eu;
  });
})();
