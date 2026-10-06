// Diagnóstico preliminar por cliente (servidor): teses aplicáveis por grupo, com segurança, maturidade e base legal.
// Fonte única para o CRM e o agente. Diagnóstico não é crédito (RB-09): aponta onde procurar.
const Regras = require('../teses-regras.js');
const Diag = require('../teses-diagnostico.js');

const GRUPOS = [
  { id: 'fiscal', nome: 'Fiscal', de: (t) => t.tributo !== 'Previdenciário' },
  { id: 'prev', nome: 'Previdenciário', de: (t) => t.tributo === 'Previdenciário' }
];

function teseInfo(tese, avaliacao) {
  const d = Diag.de(tese.id) || {};
  return {
    id: tese.id, nome: tese.nome, tributo: tese.tributo, estado: avaliacao.estado, faltam: avaliacao.faltam || [],
    seguranca: d.seguranca || null,
    maturidade: d.maturidade ? Diag.MATURIDADE[d.maturidade] || d.maturidade : null,
    base: d.base || null, precedente: d.precedente || null, origem: d.origem || null, docs: d.docs || [], nota: d.nota || null
  };
}

// cliente: { regime, perfil }
function diagnosticar(cliente) {
  return GRUPOS.map((g) => {
    const teses = Regras.TESES.filter(g.de)
      .map((t) => ({ t, a: Regras.avaliar(t, cliente) }))
      .filter((x) => x.a.estado !== 'nao')
      .map((x) => teseInfo(x.t, x.a));
    const n = { provavel: 0, verificar: 0, verde: 0, amarelo: 0, vermelho: 0 };
    teses.forEach((t) => { n[t.estado] += 1; if (t.seguranca) n[t.seguranca] += 1; });
    return { id: g.id, nome: g.nome, total: teses.length, ...n, teses };
  });
}

// Resumo leve para o funil (sem a lista de teses).
function resumo(cliente) {
  return diagnosticar(cliente).map(({ teses, ...r }) => r);
}

// ------------------------------------------------------------------ dados públicos do CNPJ (BrasilAPI, gratuita)
// Falha de serviço externo vira 502 com mensagem clara (não 500 genérico).
function falha(msg) { const { HttpError } = require('./authz'); return new HttpError(502, 'UPSTREAM_UNAVAILABLE', msg); }

const CNPJ_URL = process.env.CNPJ_API_URL || 'https://brasilapi.com.br/api/cnpj/v1/';

function publico(j) {
  return {
    razaoSocial: j.razao_social || null, nomeFantasia: j.nome_fantasia || null,
    situacao: j.descricao_situacao_cadastral || null, abertura: j.data_inicio_atividade || null,
    naturezaJuridica: j.natureza_juridica || null, porte: j.porte || j.descricao_porte || null,
    capitalSocial: j.capital_social == null ? null : Number(j.capital_social),
    municipio: j.municipio || null, uf: j.uf || null,
    cnae: j.cnae_fiscal ? { codigo: String(j.cnae_fiscal), descricao: j.cnae_fiscal_descricao || '' } : null,
    cnaesSecundarios: (j.cnaes_secundarios || []).filter((c) => c && c.codigo).slice(0, 30).map((c) => ({ codigo: String(c.codigo), descricao: c.descricao || '' })),
    simples: j.opcao_pelo_simples === true, mei: j.opcao_pelo_mei === true,
    consultadoEm: new Date().toISOString()
  };
}

async function consultarCnpj(cnpj, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    let r;
    try { r = await fetchImpl(CNPJ_URL + cnpj, { signal: ctrl.signal, headers: { accept: 'application/json' } }); }
    catch { throw falha('Consulta do CNPJ indisponível no momento. Tente de novo em instantes.'); }
    if (r.status === 404) return null;
    if (!r.ok) throw falha(`Consulta do CNPJ indisponível (${r.status}).`);
    return publico(await r.json());
  } finally { clearTimeout(timer); }
}

// Sugestão determinística de perfil pela CNAE (divisão = 2 primeiros dígitos). Só sugere; quem confirma é a pessoa.
function sugerirPerfil(pub) {
  if (!pub || !pub.cnae) return {};
  const divs = [pub.cnae, ...pub.cnaesSecundarios].map((c) => Number(String(c.codigo).padStart(7, '0').slice(0, 2)));
  const principal = divs[0];
  const tem = (f) => divs.some(f);
  const s = {};
  const marca = (k, cond, ev) => { if (cond) s[k] = { valor: true, evidencia: ev }; };
  marca('industria', principal >= 10 && principal <= 33, 'CNAE principal na indústria de transformação');
  marca('comercio', tem((d) => d >= 45 && d <= 47), 'CNAE de comércio');
  marca('transporte', tem((d) => d >= 49 && d <= 53), 'CNAE de transporte/logística');
  marca('agro', tem((d) => d >= 1 && d <= 3), 'CNAE agropecuária');
  marca('saude', tem((d) => d >= 86 && d <= 88), 'CNAE de saúde');
  marca('servicos', (principal >= 55 && !(principal >= 86 && principal <= 88)) || tem((d) => d >= 62 && d <= 82), 'CNAE de serviços');
  return s;
}

module.exports = { GRUPOS, diagnosticar, resumo, consultarCnpj, sugerirPerfil, publico };
