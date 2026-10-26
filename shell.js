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

  // menu lateral + barra superior (estilos embutidos para funcionar também na página de cálculo, que não carrega shell.css)
  if (!document.getElementById('rv-nav-css')) {
    var st = document.createElement('style'); st.id = 'rv-nav-css';
    st.textContent = [
      'html.rv-menu body { padding-left: 244px; }',
      '.rv-side { position: fixed; inset: 0 auto 0 0; width: 244px; z-index: 60; background: #fff; border-right: 1px solid #E5E7EB; display: flex; flex-direction: column; padding: 18px 14px 14px; font-family: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; color: #0E2239; -webkit-font-smoothing: antialiased; overflow-y: auto; }',
      '.rv-side .marca { display: flex; align-items: center; gap: 10px; color: #0E2239; text-decoration: none; font-weight: 600; letter-spacing: .02em; font-size: 15px; margin: 0 6px 22px; }',
      '.rv-side .marca img { height: 32px; width: auto; }',
      '.rv-side .marca b { color: #1E8F88; font-weight: 600; }',
      '.rv-side .marca small { display: block; font-size: 11px; font-weight: 500; letter-spacing: 0; color: #5C6672; }',
      '.rv-side nav { display: grid; gap: 2px; }',
      '.rv-side .grp { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9AA3AE; margin: 18px 10px 6px; font-weight: 500; }',
      '.rv-side a.it { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 8px; font-size: 14px; font-weight: 500; color: #3A4655; text-decoration: none; }',
      '.rv-side a.it svg { width: 18px; height: 18px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: .85; }',
      '.rv-side a.it.sub { margin-left: 29px; padding: 5px 10px; font-size: 13px; font-weight: 400; }',
      '.rv-side a.it.sub[aria-current="true"] { background: #E6F4F2; color: #16736D; font-weight: 600; }',
      '.rv-side a.it:hover { background: #F4F6F8; color: #0E2239; }',
      '.rv-side a.it[aria-current="page"] { background: #E6F4F2; color: #16736D; font-weight: 600; }',
      '.rv-side a.it[aria-current="page"] svg { opacity: 1; }',
      '.rv-side [hidden] { display: none !important; }',
      '.rv-side .pe { margin-top: auto; padding-top: 16px; display: grid; gap: 8px; }',
      '.rv-side .amb { display: block; border: 1px solid #E5E7EB; border-radius: 12px; padding: 11px 12px; text-decoration: none; font-size: 12px; color: #5C6672; }',
      '.rv-side .amb strong { display: flex; align-items: center; gap: 7px; color: #0E2239; font-size: 13px; font-weight: 600; }',
      '.rv-side .amb strong i { width: 8px; height: 8px; border-radius: 50%; background: #1E8F88; }',
      '.rv-side .amb.demo { background: #FBF3E8; border-color: #F0DDC4; } .rv-side .amb.demo strong i { background: #C78054; }',
      '.rv-side .amb:hover { border-color: #1E8F88; }',
      '.rv-top { position: sticky; top: 0; z-index: 50; height: 60px; background: rgba(255,255,255,.92); backdrop-filter: saturate(1.4) blur(10px); -webkit-backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid #E5E7EB; display: flex; align-items: center; gap: 14px; padding: 0 24px; font-family: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; color: #0E2239; -webkit-font-smoothing: antialiased; }',
      '.rv-top .abre { display: none; border: 1px solid #E5E7EB; background: #fff; border-radius: 8px; width: 36px; height: 36px; padding: 0; cursor: pointer; color: #0E2239; box-shadow: none; }',
      '.rv-top .abre svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; }',
      '.rv-top form { flex: 1; max-width: 380px; position: relative; margin: 0; }',
      '.rv-top form input { width: 100%; font: 400 13px/1 "Geist", system-ui, sans-serif; color: #0E2239; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 44px 10px 34px; background: #F7F8FA; box-shadow: none; }',
      '.rv-top form input:focus { outline: 2px solid rgba(30,143,136,.35); border-color: #1E8F88; background: #fff; }',
      '.rv-top form svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; stroke: #9AA3AE; fill: none; stroke-width: 2; stroke-linecap: round; }',
      '.rv-top form kbd { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); font: 500 11px/1 "Geist", system-ui, sans-serif; color: #9AA3AE; border: 1px solid #E5E7EB; border-radius: 4px; padding: 3px 5px; background: #fff; }',
      '.rv-top .eu { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 13px; white-space: nowrap; }',
      '.rv-top .av { width: 34px; height: 34px; border-radius: 50%; background: #0E2239; color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 600; letter-spacing: .02em; }',
      '.rv-top .quem { line-height: 1.25; } .rv-top .quem .nome { display: block; font-weight: 600; max-width: 220px; overflow: hidden; text-overflow: ellipsis; } .rv-top .quem small { color: #5C6672; font-size: 12px; }',
      '.rv-top .sair { color: #5C6672; text-decoration: none; font-size: 13px; font-weight: 500; border: 1px solid #E5E7EB; border-radius: 8px; padding: 7px 12px; }',
      '.rv-top .sair:hover { border-color: #1E8F88; color: #0E2239; }',
      '.rv-veu { display: none; }',
      '@media (max-width: 960px) { html.rv-menu body { padding-left: 0; } .rv-side { transform: translateX(-100%); transition: transform .2s ease; box-shadow: 0 0 40px rgba(14,34,57,.18); } html.rv-menu-aberto .rv-side { transform: none; } html.rv-menu-aberto .rv-veu { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(14,34,57,.35); } .rv-top { padding: 0 12px; gap: 10px; } .rv-top .abre { display: grid; place-items: center; } .rv-top form kbd, .rv-top .quem { display: none; } }',
      '@media print { html.rv-menu body { padding-left: 0; } .rv-side, .rv-top, .rv-veu { display: none !important; } }',
      '.rv-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #0E2239; color: #fff; padding: 11px 18px; border-radius: 8px; font: 500 14px/1.4 "Geist", system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.18); z-index: 100; max-width: calc(100vw - 32px); }'
    ].join('\n');
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
  // menu lateral (ícones no estilo Lucide, MIT)
  var ICO = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    diag: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="m13.5 16.5 2 2"/>',
    lei: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    crm: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v10"/>',
    cli: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01"/>',
    exe: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    teses: '<path d="M12 3v18"/><path d="M5 21h14"/><path d="M3 7h18"/><path d="m6 7-3 7a3 3 0 0 0 6 0z"/><path d="m18 7-3 7a3 3 0 0 0 6 0z"/>',
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    met: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h7M8 11h7"/>',
    pgfn: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/>',
    master: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    gov: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICO[k] + '</svg>'; };
  var aqui = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  // [caminho, rótulo, ícone, href alternativo, atributo de visibilidade]
  var NO_GOV = /^\/gov(\.html)?(\/|$)/.test(location.pathname);
  var principais = NO_GOV ? [['/gov', 'Reversa Gov', 'gov']] : DEMO_AMB
    ? [['/demonstracao', 'Início', 'inicio'], ['/', 'Diagnosticar', 'diag', '/?demo=1'], ['/lei-do-bem', 'Lei do Bem', 'lei', '/lei-do-bem.html?demo=1'], ['/teses', 'Teses', 'teses', '/teses.html?demo=1'], ['/metodologia', 'Metodologia', 'met'], ['/execucao', 'Retificação', 'exe'], ['/pgfn', 'Transação PGFN', 'pgfn']]
    : [['/', 'Diagnosticar', 'diag'], ['/lei-do-bem', 'Lei do Bem', 'lei'], ['/crm', 'CRM', 'crm'], ['/clientes', 'Clientes', 'cli'], ['/teses', 'Teses', 'teses'], ['/metodologia', 'Metodologia', 'met'], ['/dashboard', 'Dashboard', 'dash']];
  var plataforma = (DEMO_AMB || NO_GOV) ? [] : [['/execucao', 'Execução', 'exe', null, 'data-plat'], ['/pgfn', 'Transação PGFN', 'pgfn', null, 'data-plat'], ['/usuarios', 'Usuários', 'users', null, 'data-admin'], ['/master', 'Master', 'master', null, 'data-master']];
  var href = function (p) { return p === '/' ? '/' : p + '.html'; };
  var item = function (l) {
    var atual = l[0] === '/' ? aqui === '/' : aqui.indexOf(l[0]) === 0;
    var a = '<a class="it" href="' + (l[3] || href(l[0])) + '"' + (l[4] ? ' ' + l[4] + ' hidden' : '') + (atual ? ' aria-current="page"' : '') + '>' + svg(l[2]) + '<span>' + l[1] + '</span></a>';
    if (l[2] === 'diag' && atual) {
      var AN = { tributario: 'tribfiscal', fiscal: 'tribfiscal', completo: 'consolidado' }, OK = { tribfiscal: 1, prev: 1, consolidado: 1 }, mm = (/[?&]modo=([a-z]+)/.exec(location.search) || [])[1];
      mm = AN[mm] || mm; if (!OK[mm]) { try { mm = localStorage.getItem('rv_modo_diag'); mm = AN[mm] || mm; } catch (e) { mm = null; } } if (!OK[mm]) mm = 'consolidado';
      var dm = DEMO_AMB ? '&demo=1' : '';
      a += [['tribfiscal', 'Tributário e fiscal'], ['prev', 'Previdenciário'], ['consolidado', 'Diagnóstico consolidado']].map(function (m) {
        return '<a class="it sub" href="/?modo=' + m[0] + dm + '" data-modo-link="' + m[0] + '"' + (mm === m[0] ? ' aria-current="true"' : '') + '><span>' + m[1] + '</span></a>';
      }).join('');
    }
    return a;
  };
  var side = document.createElement('aside');
  side.className = 'rv-side'; side.id = 'rv-side'; side.setAttribute('aria-label', 'Menu');
  side.innerHTML = '<a class="marca" href="' + (DEMO_AMB ? '/demonstracao.html' : '/') + '"><img src="/assets/reversa-r.png" alt=""><span>REVERSA <b>TAX</b><small>Uma solução Argus Prime</small></span></a>' +
    '<nav aria-label="Seções">' + principais.map(item).join('') +
    (plataforma.length ? '<div class="grp" data-grp hidden>Plataforma</div>' + plataforma.map(item).join('') : '') + '</nav>' +
    '<div class="pe"><a href="/ambiente.html" class="amb prod" title="Trocar de caminho"><strong><i></i>' + (NO_GOV ? 'Reversa Gov' : (DEMO_AMB ? 'Demonstração' : 'Reversa Tax')) + '</strong>Trocar para ' + (NO_GOV ? 'Reversa Tax' : 'Reversa Gov') + ' →</a><span class="ap" style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted,#5A6878)"><img src="/assets/argus-prime-monograma.png" alt="" style="height:20px;width:auto">Uma solução Argus Prime</span></div>';
  var nav = document.createElement('header');
  nav.className = 'rv-top';
  nav.innerHTML = '<button type="button" class="abre" aria-label="Abrir menu" aria-controls="rv-side" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>' +
    '<form role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" name="q" placeholder="' + (DEMO_AMB ? 'Ir para uma seção…' : 'Buscar cliente, CNPJ ou seção…') + '" aria-label="Buscar"><kbd>⌘K</kbd></form>' +
    '<div class="eu"><div class="av" aria-hidden="true">·</div><div class="quem"><span class="nome"></span><small class="papel"></small></div><a class="sair" href="/api/logout">Sair</a></div>';
  var veu = document.createElement('div'); veu.className = 'rv-veu';
  var raiz = document.documentElement;
  function menu(abrir) { raiz.classList.toggle('rv-menu-aberto', abrir); nav.querySelector('.abre').setAttribute('aria-expanded', String(abrir)); }
  nav.querySelector('.abre').addEventListener('click', function () { menu(!raiz.classList.contains('rv-menu-aberto')); });
  veu.addEventListener('click', function () { menu(false); });
  // busca: nome de seção leva à seção; qualquer outro termo abre Clientes já filtrado
  var campo = nav.querySelector('input');
  nav.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = campo.value.trim(); if (!t) return;
    var n = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var achou = Array.prototype.filter.call(side.querySelectorAll('a.it:not([hidden])'), function (a) { return a.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(n) === 0; })[0];
    if (achou) location.href = achou.getAttribute('href');
    else if (!DEMO_AMB) location.href = '/clientes.html?busca=' + encodeURIComponent(t);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); campo.focus(); campo.select(); }
    else if (e.key === 'Escape') menu(false);
  });
  function montar() {
    raiz.classList.add('rv-menu');
    document.body.insertBefore(veu, document.body.firstChild);
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(side, document.body.firstChild);
    var velho = document.getElementById('sair'); if (velho) velho.remove();
  }
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);

  // Inatividade: 15 min sem mouse, teclado, toque ou rolagem derrubam a sessão; com atividade, renova a cada minuto.
  (function () {
    var LIMITE = 15 * 60e3, ultima = Date.now(), tocou = 0;
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (ev) { window.addEventListener(ev, function () { ultima = Date.now(); }, { passive: true, capture: true }); });
    setInterval(function () {
      var agora = Date.now();
      if (agora - ultima >= LIMITE) { location.href = '/api/logout?inativo=1'; return; }
      if (agora - tocou >= 60e3 && agora - ultima < 60e3) { tocou = agora; fetch('/api/v1/me', { credentials: 'same-origin' }).then(function (r) { if (r.status === 401) location.href = '/login.html?inativo=1'; }).catch(function () {}); }
    }, 15e3);
  })();
  RV.eu = fetch('/api/v1/me', { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) { location.href = '/login.html'; return null; }
    return r.ok ? r.json() : null;
  }).catch(function () { return null; }).then(function (eu) {
    if (eu) {
      var nome = (eu.user && (eu.user.name || eu.user.email)) || '';
      nav.querySelector('.nome').textContent = nome;
      var ini = nome.split(/[\s@.]+/).filter(Boolean); nav.querySelector('.av').textContent = ((ini[0] || '·')[0] + (ini.length > 1 ? ini[ini.length - 1][0] : '')).toUpperCase();
      var papel = eu.master ? 'Master' : (RV.PAPEIS[eu.role || (eu.membership && eu.membership.role)] || '');
      if (eu.organization && eu.organization.kind === 'parceiro') papel = (papel ? papel + ' · ' : '') + eu.organization.name;
      nav.querySelector('.papel').textContent = papel;
      if (eu.permissions && eu.permissions.manageMembers) side.querySelectorAll('[data-admin]').forEach(function (a) { a.hidden = false; });
      if (eu.master) side.querySelectorAll('[data-master]').forEach(function (a) { a.hidden = false; });
      if (eu.organization && eu.organization.kind === 'plataforma') side.querySelectorAll('[data-plat]').forEach(function (a) { a.hidden = false; });
      var grp = side.querySelector('[data-grp]');
      if (grp) grp.hidden = !side.querySelector('[data-plat]:not([hidden]),[data-admin]:not([hidden]),[data-master]:not([hidden])');
    }
    RV.usuario = eu;
    return eu;
  });
})();

// Fundo animado do login aplicado à navegação (mesmo shader, cores e textura). Modo: faixa-sobrepoe
(function () {
  var MODO = 'faixa-sobrepoe';
  function criarFundo(cv) {
  
  var gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false }); if (!gl) return;
  var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var fs = [
    'precision highp float;uniform vec2 r;uniform float t;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);float s=t*.06;',
    'vec2 q=vec2(fbm(uv*1.6+s),fbm(uv*1.6-s+4.1));',
    'vec2 w=vec2(fbm(uv*1.4+2.2*q+vec2(1.7,9.2)+s*1.4),fbm(uv*1.4+2.2*q+vec2(8.3,2.8)-s));',
    'float f=fbm(uv*1.2+2.6*w);',
    // derivadas para simular reflexo metálico
    'float e=.004;float fx=fbm((uv+vec2(e,0))*1.2+2.6*w)-f;float fy=fbm((uv+vec2(0,e))*1.2+2.6*w)-f;',
    'vec3 nr=normalize(vec3(-fx*90.,-fy*90.,1.));float spec=pow(max(dot(reflect(vec3(0,0,-1),nr),normalize(vec3(-.4,.6,.7))),0.),18.);',
    'vec3 navy=vec3(.024,.07,.122),deep=vec3(.055,.133,.224),teal=vec3(.118,.561,.533),mint=vec3(.56,.88,.85),cobre=vec3(.78,.5,.33);',
    'vec3 c=mix(navy,deep,smoothstep(.2,.5,f));c=mix(c,teal,smoothstep(.45,.8,f)*.85);',
    'c=mix(c,cobre,smoothstep(.62,.9,w.y)*smoothstep(.5,.75,f)*.55);',
    'c+=mint*spec*.55+vec3(1.)*pow(spec,4.)*.35;',
    'c*=1.-.35*length(uv*.8);gl_FragColor=vec4(c,1.);}'
  ].join('\n');
  function sh(tipo, src) { var o = gl.createShader(tipo); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; }
  var a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs); if (!a || !b) return;
  var pr = gl.createProgram(); gl.attachShader(pr, a); gl.attachShader(pr, b); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uR = gl.getUniformLocation(pr, 'r'), uT = gl.getUniformLocation(pr, 't');
  var visivel = true; if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visivel = es[0].isIntersecting; if (visivel && !parado) requestAnimationFrame(quadro); }).observe(cv);
  var parado = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, t0 = performance.now();
  function tam() { var d = Math.min(window.devicePixelRatio || 1, 1.5), w = cv.clientWidth * d | 0, hh = cv.clientHeight * d | 0; if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; gl.viewport(0, 0, w, hh); } }
  function quadro(agora) {
    tam(); gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, parado ? 12 : (agora - t0) / 1000 + 12);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!parado && !document.hidden && visivel) requestAnimationFrame(quadro);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !parado) requestAnimationFrame(quadro); });
  window.addEventListener('resize', function () { if (parado) quadro(0); });
  requestAnimationFrame(quadro);
}
  var tentativas = 0;
  function iniciar() {
    var t = document.querySelector('.rv-top');
    if (!t) { if (tentativas++ < 100) setTimeout(iniciar, 30); return; }
    if (document.querySelector('.rv-fundo')) return;
    var st = document.createElement('style'); st.textContent = "\nhtml body .rv-top.rv-anim, html body .faixa { background: #06121F; isolation: isolate; overflow: hidden; }\nhtml body .faixa { position: relative; }\nhtml body .rv-top.rv-anim { border-bottom: 0; backdrop-filter: none; -webkit-backdrop-filter: none; }\nhtml body .rv-fundo { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; display: block; pointer-events: none; }\nhtml body .rv-anim .abre { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.3); color: #fff; }\nhtml body .rv-anim form input { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.28); color: #fff; }\nhtml body .rv-anim form input::placeholder { color: rgba(255,255,255,.78); }\nhtml body .rv-anim form input:focus { background: rgba(255,255,255,.2); border-color: #8FE0D9; outline-color: rgba(143,224,217,.45); }\nhtml body .rv-anim form svg { stroke: rgba(255,255,255,.8); }\nhtml body .rv-anim form kbd { background: transparent; color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.3); }\nhtml body .rv-anim .quem .nome { color: #fff; } html body .rv-anim .quem small { color: rgba(255,255,255,.75); }\nhtml body .rv-anim .av { background: #fff; color: #0E2239; }\nhtml body .rv-anim .sair { color: #fff; border-color: rgba(255,255,255,.35); } html body .rv-anim .sair:hover { border-color: #8FE0D9; color: #fff; }\nhtml body .faixa .rv-top { position: relative; background: transparent; border-bottom: 1px solid rgba(255,255,255,.14); }\nhtml body .faixa-cab { margin: 0 auto; padding-top: 40px; padding-bottom: 48px; color: #fff; }\nhtml body .faixa-cab > * { margin-bottom: 0; }\nhtml body .faixa-cab h1, html body .faixa-cab h2 { color: #fff; } html body .faixa-cab h1 em { color: #8FE0D9; }\nhtml body .faixa-cab .sub, html body .faixa-cab p { color: rgba(255,255,255,.8); }\nhtml body .faixa-cab .btn, html body .faixa-cab button:not(.amb) { border-color: rgba(255,255,255,.4); }\nhtml body .faixa-cab .gov-badge { background: rgba(255,255,255,.14); color: #fff; border-color: rgba(255,255,255,.3); }\nhtml.rv-sobrepoe body .faixa-cab { padding-bottom: 120px; }\nhtml.rv-sobrepoe body .rv-sobe { position: relative; z-index: 1; margin-top: -84px; }\nhtml.rv-sobrepoe body .rv-sobe .amb, html.rv-sobrepoe body .rv-sobe > * { box-shadow: 0 12px 32px rgba(6,18,31,.16); }\n"; document.head.appendChild(st);
    var cv = document.createElement('canvas'); cv.className = 'rv-fundo'; cv.setAttribute('aria-hidden', 'true');
    var cab = MODO === 'barra' ? null : document.querySelector('main > .cab:first-child, main.gov-page > .gov-header:first-child');
    if (!cab) { t.classList.add('rv-anim'); t.insertBefore(cv, t.firstChild); criarFundo(cv); return; }
    var main = cab.parentNode, cs = getComputedStyle(main);
    var faixa = document.createElement('section'); faixa.className = 'faixa rv-anim';
    t.parentNode.insertBefore(faixa, t);
    var w = document.createElement('div'); w.className = 'faixa-cab';
    w.style.maxWidth = cs.maxWidth; w.style.paddingLeft = cs.paddingLeft; w.style.paddingRight = cs.paddingRight;
    w.appendChild(cab); faixa.appendChild(cv); faixa.appendChild(t); faixa.appendChild(w);
    if (MODO === 'faixa-sobrepoe') { var prox = main.querySelector(':scope > .escolha, :scope > .gov-grid'); if (prox && prox === main.firstElementChild) { document.documentElement.classList.add('rv-sobrepoe'); prox.classList.add('rv-sobe'); } }
    criarFundo(cv);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
