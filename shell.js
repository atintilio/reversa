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
    st.textContent = '.rv-nav { position: sticky; top: 0; z-index: 50; background: #0E2239; color: #fff; font-family: var(--f-body, "Manrope", system-ui, sans-serif); } .rv-nav .in { max-width: 1240px; margin: 0 auto; padding: 0 20px; height: 64px; display: flex; align-items: center; gap: 18px; } .rv-nav .marca { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; font-family: "Open Sans", system-ui, sans-serif; font-weight: 700; letter-spacing: .05em; font-size: 17px; white-space: nowrap; } .rv-nav .marca img { height: 30px; width: auto; } .rv-nav .marca b { color: #3DB8AE; font-weight: 700; } .rv-nav .links { display: flex; gap: 4px; flex: 1; overflow-x: auto; scrollbar-width: none; } .rv-nav .links a { color: #C9D6E3; text-decoration: none; font-size: 16px; font-weight: 700; padding: 10px 11px; border-radius: 6px; white-space: nowrap; } .rv-nav .links a:hover { color: #fff; background: rgba(255,255,255,.08); } .rv-nav .links a[aria-current="page"] { color: #fff; background: rgba(61,184,174,.22); } .rv-nav .eu { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #AFC0D2; white-space: nowrap; } .rv-nav .eu a { color: #fff; text-decoration: none; font-weight: 600; border: 1px solid rgba(255,255,255,.25); padding: 6px 12px; border-radius: 6px; } .rv-nav .eu a:hover { border-color: #3DB8AE; } .rv-nav .eu a.master { background: #3DB8AE; border-color: #3DB8AE; color: #0E2239; } .rv-nav .eu a.master[aria-current] { box-shadow: 0 0 0 2px #fff; } .rv-nav .eu a[hidden] { display: none; } .rv-nav .eu a.amb { font-size: 12px; padding: 5px 9px; } .rv-nav .eu a.amb.demo { background: #F6E8D3; color: #7A4B0E; border-color: #F6E8D3; } .rv-nav .eu a.amb.prod { color: #3DB8AE; border-color: rgba(61,184,174,.5); } .rv-nav .eu .nome { max-width: 96px; overflow: hidden; text-overflow: ellipsis; } @media (max-width: 760px) { .rv-nav .in { gap: 10px; padding: 0 12px; } .rv-nav .marca span, .rv-nav .eu .nome { display: none; } } .rv-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #0E2239; color: #fff; padding: 11px 18px; border-radius: 8px; font: 600 14px/1.4 "Manrope", system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.18); z-index: 100; max-width: calc(100vw - 32px); }';
    // tema visual claro (design LeadFlow com a paleta Reversa): barra branca, Geist, borda fina
    st.textContent += ' .rv-nav { background: rgba(254,254,254,.9); color: #0E2239; border-bottom: 1px solid rgba(14,34,57,.12); backdrop-filter: saturate(1.4) blur(10px); -webkit-backdrop-filter: saturate(1.4) blur(10px); font-family: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; } .rv-nav .marca { color: #0E2239; font-family: "Geist", system-ui, sans-serif; font-weight: 600; letter-spacing: -.01em; } .rv-nav .marca b { color: #1E8F88; font-weight: 600; } .rv-nav .links a { color: rgba(14,34,57,.6); font-weight: 500; font-size: 15px; } .rv-nav .links a:hover { color: #0E2239; background: #F4F6F8; } .rv-nav .links a[aria-current="page"] { color: #0E2239; background: #F4F6F8; box-shadow: inset 0 0 0 1px rgba(14,34,57,.12); } .rv-nav .eu { color: rgba(14,34,57,.55); } .rv-nav .eu a { color: #0E2239; border: 1px solid rgba(14,34,57,.14); font-weight: 500; box-shadow: 0 1px 2px rgba(14,34,57,.06); } .rv-nav .eu a:hover { border-color: #1E8F88; } .rv-nav .eu a.master { background: #1E8F88; border-color: #1E8F88; color: #fff; } .rv-nav .eu a.master[aria-current] { box-shadow: 0 0 0 2px rgba(30,143,136,.3); } .rv-nav .eu a.amb.prod { color: #16736D; border-color: rgba(30,143,136,.45); } .rv-toast { background: #0E2239; font-family: "Geist", system-ui, sans-serif; font-weight: 500; border-radius: 6px; }';
    if (!document.querySelector('link[href*="family=Geist"]')) { var fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Libre+Baskerville:ital@0;1&display=swap'; document.head.appendChild(fl); }
    document.head.appendChild(st);
  }
  // ambiente escolhido depois do login: produção (casos reais) ou demonstração (exemplos, nada gravado)
  RV.ambiente = function () { var m = /(?:^|;\s*)rv_amb=(demo|prod)/.exec(document.cookie); return m ? m[1] : 'prod'; };
  RV.definirAmbiente = function (v) { document.cookie = 'rv_amb=' + (v === 'demo' ? 'demo' : 'prod') + '; Path=/; Max-Age=43200; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); };
  var DEMO_AMB = RV.ambiente() === 'demo';
  if (DEMO_AMB) {
    var pag = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
    var comExemplo = { '/': 1, '/lei-do-bem': 1, '/teses': 1 };
    if (comExemplo[pag] && !/(^|[?&])demo=1(&|$)/.test(location.search.slice(1))) { RV.eu = new Promise(function () {}); location.replace(pag + (pag === '/' ? '' : '.html') + '?demo=1'); return; }
    if ({ '/crm': 1, '/clientes': 1, '/dashboard': 1 }[pag]) { RV.eu = new Promise(function () {}); location.replace('/demonstracao.html'); return; }
  }
  // barra de navegação
  var aqui = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  var links = DEMO_AMB
    ? [['/demonstracao', 'Início'], ['/', 'Diagnosticar', '/?demo=1'], ['/lei-do-bem', 'Lei do Bem', '/lei-do-bem.html?demo=1'], ['/teses', 'Teses', '/teses.html?demo=1']]
    : [['/', 'Diagnosticar'], ['/lei-do-bem', 'Lei do Bem'], ['/crm', 'CRM'], ['/clientes', 'Clientes'], ['/execucao', 'Execução'], ['/teses', 'Teses'], ['/dashboard', 'Dashboard'], ['/usuarios', 'Usuários']];
  var href = function (p) { return p === '/' ? '/' : p + '.html'; };
  var nav = document.createElement('header');
  nav.className = 'rv-nav';
  nav.innerHTML = '<div class="in"><a class="marca" href="' + (DEMO_AMB ? '/demonstracao.html' : '/') + '"><img src="/assets/reversa-r.png" alt=""><span>REVERSA <b>TAX</b></span></a>' +
    '<nav class="links" aria-label="Seções">' + links.map(function (l) {
      var atual = l[0] === '/' ? aqui === '/' : aqui.indexOf(l[0]) === 0;
      return '<a href="' + (l[2] || href(l[0])) + '"' + (l[0] === '/usuarios' ? ' data-admin hidden' : l[0] === '/execucao' ? ' data-plat hidden' : '') + (atual ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
    }).join('') + '</nav><div class="eu"><a href="/ambiente.html" class="amb ' + (DEMO_AMB ? 'demo' : 'prod') + '" title="Trocar de ambiente">' + (DEMO_AMB ? 'Demonstração' : 'Produção') + ' ⇄</a><span class="nome"></span><a href="/master.html" class="master" data-master hidden' + (aqui.indexOf('/master') === 0 ? ' aria-current="page"' : '') + '>Master</a><a href="/api/logout">Sair</a></div></div>';
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
      if (eu.master) { nav.querySelectorAll('[data-master]').forEach(function (a) { a.hidden = false; a.title = nav.querySelector('.nome').textContent; }); nav.querySelector('.nome').hidden = true; }
      if (eu.organization && eu.organization.kind === 'plataforma') nav.querySelectorAll('[data-plat]').forEach(function (a) { a.hidden = false; });
      if (eu.organization && eu.organization.kind === 'parceiro') nav.querySelector('.nome').textContent += ' · ' + eu.organization.name;
    }
    RV.usuario = eu;
    return eu;
  });
})();
