// Relatório do diagnóstico preliminar (PDF, A4) — gerado no servidor com pdfkit.
// Estrutura padrão: capa · critério de classificação (CPC 25) · diagnóstico fiscal · diagnóstico previdenciário ·
// diagnóstico consolidado (com próximos passos) · apuração do motor (se houver) · teses encontradas (anexo).
// Versão do cliente: sem teses remotas e sem os códigos internos (T0xx).
// Versão técnica (uso interno): completa, com teses remotas e destaque das que requerem aprofundamento jurídico.
// Diagnóstico não é crédito (RB-09): valores são estimativas pendentes de revisão.
const path = require('node:path');
const PDFDocument = require('pdfkit');

const FONTES = path.join(__dirname, '..', 'assets', 'fonts');
const LOGO = path.join(__dirname, '..', 'assets', 'reversa-r.png');
// Paleta sóbria: branco predominante, grafite esverdeado no texto, esmeralda e ouro velho só em detalhes.
const C = {
  tinta: '#1D2B27', texto: '#2E3733', muted: '#6E7773', claro: '#A3A9A5', linha: '#E4E0D6', fundo: '#F8F7F3',
  esmeralda: '#0E7A5C', ouro: '#A9864F', remoto: '#8C9591'
};
const CLASSE = { verde: ['Provável', C.esmeralda], amarelo: ['Possível', C.ouro], vermelho: ['Remoto', C.remoto] };
const ORDEM = { verde: 0, amarelo: 1, vermelho: 2 };
const NATUREZA = { credito: 'Crédito a recuperar', potencial: 'Potencial a validar', risco: 'Risco a regularizar' };
const M = 56; // margem lateral

// Famílias das verbas previdenciárias (agrupamento do quadro-resumo).
const FAMILIAS_PREV = [
  { nome: 'Afastamentos e licenças', ids: ['T004', 'T006', 'T064'] },
  { nome: 'Verbas rescisórias e férias', ids: ['T005', 'T007'] },
  { nome: 'Remuneração variável', ids: ['T028', 'T062', 'T063', 'T065'] },
  { nome: 'Benefícios', ids: ['T066', 'T067', 'T068'] },
  { nome: 'RAT/GILRAT e FAP', ids: ['T009', 'T010', 'T061', 'T069'] },
  { nome: 'Terceiros e rubricas', ids: ['T008', 'T041', 'T059'] }
];
const AREA_FISCAL = { 'PIS/COFINS': 'PIS/COFINS', ICMS: 'ICMS', IPI: 'IPI', 'IRPJ/CSLL': 'IRPJ/CSLL', Indiretos: 'Tributação indireta', 'Federais diversos': 'Outros tributos federais' };
const ORDEM_AREA = ['PIS/COFINS', 'ICMS', 'IPI', 'IRPJ/CSLL', 'Tributação indireta', 'Outros tributos federais'];

const reais = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cnpjFmt = (c) => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const capitular = (t) => String(t).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (w) => w.toLowerCase());
const dataLonga = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const valor = (t) => Number(t.valor) || 0;
const soma = (l) => l.reduce((a, t) => a + valor(t), 0);
const dataBr = (iso) => String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3/$2/$1');

// Tese que pede aprofundamento jurídico: fonte não conferida em base oficial, tema em disputa ou fundamento a definir.
const aprofundar = (t) => !t.validacao || ['em_disputa', 'a_definir', 'decisao_cliente'].includes(t.maturidadeId);

// Referência curta (lei · precedente) para o quadro-resumo.
function refCurta(t) {
  if (t.ref) return t.ref;
  const base = String(t.base || '').split(';').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' · ');
  const prec = String(t.precedente || '').split(/[:(;]/)[0].trim();
  const usa = prec && prec !== '—' && prec.length < 50 && !/^(Sem|Pendente|Não)/.test(prec) && !base.includes(prec);
  return [base, usa ? prec : ''].filter(Boolean).join(' · ');
}

function ordenar(teses) {
  return teses.slice().sort((a, b) => valor(b) - valor(a) || (ORDEM[a.seguranca] ?? 3) - (ORDEM[b.seguranca] ?? 3) || a.id.localeCompare(b.id));
}

// Prioridades (usadas pelo agente do CRM): maior valor e melhor classificação primeiro, sem remotas.
function prioridades(grupos, agente) {
  const todas = grupos.flatMap((g) => g.teses.map((t) => ({ ...t, grupo: g.nome })));
  const porId = new Map(todas.map((t) => [t.id, t]));
  const lista = [];
  ((agente && agente.tesesPrioritarias) || []).forEach((p) => { const t = porId.get(p.id); if (t && t.seguranca !== 'vermelho') lista.push({ ...t, motivo: p.motivo }); });
  ordenar(todas).filter((t) => t.seguranca !== 'vermelho').forEach((t) => { if (lista.length < 5 && !lista.some((x) => x.id === t.id)) lista.push({ ...t, motivo: t.origem }); });
  return lista.slice(0, 5);
}

function gerar(dados) {
  const { cliente, agente } = dados;
  const motor = dados.motor || [];
  const tecnica = dados.versao === 'tecnica';
  const grupos = dados.grupos.map((g) => ({ ...g, teses: tecnica ? g.teses : g.teses.filter((t) => t.seguranca !== 'vermelho') }));
  const nome = (t) => (tecnica ? `${t.id}  ${t.nome}` : t.nome);
  const temFiscal = grupos.some((g) => g.id === 'fiscal'), temPrev = grupos.some((g) => g.id === 'prev');
  const tituloDoc = temFiscal && temPrev ? 'Diagnóstico de Oportunidades Tributárias e Previdenciárias'
    : temPrev ? 'Diagnóstico de Oportunidades Previdenciárias' : 'Diagnóstico de Oportunidades Tributárias';
  const rotuloDoc = tecnica ? 'Diagnóstico técnico · uso interno' : 'Diagnóstico preliminar';

  const doc = new PDFDocument({ size: 'A4', margins: { top: 72, bottom: 72, left: M, right: M }, bufferPages: true,
    info: { Title: `${tituloDoc} — ${cliente.legalName}`, Author: 'Reversa Tax · Argus Prime', Subject: rotuloDoc } });
  doc.registerFont('R', path.join(FONTES, 'Inter-Regular.otf'));
  doc.registerFont('M', path.join(FONTES, 'Inter-Medium.otf'));
  doc.registerFont('S', path.join(FONTES, 'Inter-SemiBold.otf'));
  doc.registerFont('B', path.join(FONTES, 'Inter-Bold.otf'));
  doc.registerFont('T', path.join(FONTES, 'Lora-Variable.ttf'));
  const W = doc.page.width, H = doc.page.height, LW = W - 2 * M;
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const ativas = grupos.flatMap((g) => g.teses).filter((t) => t.seguranca !== 'vermelho');
  const comValor = ativas.some((t) => valor(t) > 0);
  const totV = soma(ativas.filter((t) => t.seguranca === 'verde')), totA = soma(ativas.filter((t) => t.seguranca === 'amarelo'));
  const valorMotor = motor.filter((m) => m.natureza === 'credito').reduce((s, m) => s + m.noPrazo, 0);

  // ------------------------------------------------------------ utilitários de página
  let y = 0;
  const novaPagina = () => { doc.addPage(); doc.x = M; doc.y = 72; };
  const espaco = (h) => { if (doc.y + h > H - 84) { novaPagina(); return true; } return false; };
  const regua = (yy, cor = C.linha, lw = 0.5, x0 = M, x1 = W - M) => doc.moveTo(x0, yy).lineTo(x1, yy).lineWidth(lw).strokeColor(cor).stroke();
  const par = (t, o = {}) => doc.font(o.f || 'R').fontSize(o.s || 9.5).fillColor(o.c || C.texto)
    .text(t, o.x ?? M, o.y ?? doc.y, { width: o.w ?? LW, lineGap: o.lg ?? 2.6, align: o.align || 'left' });
  let nSecao = 0;
  const secao = (titulo) => {
    novaPagina(); nSecao += 1;
    doc.font('S').fontSize(7.5).fillColor(C.ouro).text(String(nSecao).padStart(2, '0'), M, doc.y, { characterSpacing: 1.5 });
    doc.font('T').fontSize(19).fillColor(C.tinta).text(titulo, M, doc.y + 2, { width: LW });
    y = doc.y + 8; doc.rect(M, y, 28, 1.2).fill(C.esmeralda);
    doc.y = y + 18;
  };
  const subtitulo = (t, extra) => {
    espaco(60); doc.moveDown(0.7);
    y = doc.y;
    doc.font('S').fontSize(10.5).fillColor(C.tinta).text(t, M, y, { lineBreak: false });
    if (extra) doc.font('R').fontSize(8.5).fillColor(C.muted).text(extra, M, y + 1.5, { width: LW, align: 'right' });
    doc.y = y + 17; regua(doc.y, C.tinta, 0.6); doc.y += 8;
  };

  // ------------------------------------------------------------ capa (sem valores)
  doc.page.margins.bottom = 0;
  doc.image(LOGO, W - M - 150, 52, { height: 44 });
  doc.font('B').fontSize(13).fillColor(C.tinta).text('REVERSA', W - M - 100, 58, { lineBreak: false, characterSpacing: 1.6 });
  doc.font('B').fontSize(13).fillColor(C.esmeralda).text('TAX', W - M - 100 + doc.font('B').fontSize(13).widthOfString('REVERSA ', { characterSpacing: 1.6 }) + 4, 58, { lineBreak: false, characterSpacing: 1.6 });
  doc.font('R').fontSize(8.5).fillColor(C.muted).text('uma solução Argus Prime', W - M - 100, 78, { lineBreak: false });
  doc.font('S').fontSize(8).fillColor(C.ouro).text(tecnica ? 'DIAGNÓSTICO TÉCNICO · USO INTERNO' : dados.aprovadas ? 'DIAGNÓSTICO DAS TESES APROVADAS' : 'DIAGNÓSTICO PRELIMINAR', M, 292, { characterSpacing: 2 });
  doc.font('T').fontSize(27).fillColor(C.tinta).text(tituloDoc, M, 312, { width: LW - 60, lineGap: 4 });
  y = doc.y + 20; doc.rect(M, y, 36, 1.4).fill(C.esmeralda);
  doc.font('S').fontSize(13).fillColor(C.tinta).text(cliente.legalName, M, y + 22, { width: LW });
  const linhaCapa = [`CNPJ ${cnpjFmt(cliente.cnpj)}`, cliente.taxRegime || 'Regime não informado',
    cliente.publico && cliente.publico.municipio ? `${capitular(cliente.publico.municipio)}/${cliente.publico.uf}` : null].filter(Boolean).join('   ·   ');
  doc.font('R').fontSize(9.5).fillColor(C.muted).text(linhaCapa, M, doc.y + 6, { width: LW });
  doc.text(`Escopo: ${grupos.map((g) => g.nome).join(' e ')}`, M, doc.y + 3, { width: LW });
  if (dados.aprovadas) doc.text(`Teses aprovadas por ${dados.aprovadas.por} em ${new Date(dados.aprovadas.em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, M, doc.y + 3, { width: LW });
  doc.font('R').fontSize(9).fillColor(C.texto).text(`${dataLonga()}   ·   Preparado pelo time técnico Argus Prime`, M, H - 140, { width: LW });
  doc.font('R').fontSize(7.5).fillColor(C.muted).text('Documento confidencial, de uso exclusivo do destinatário. Diagnóstico preliminar: indica oportunidades a confirmar e não constitui reconhecimento de crédito.' +
    (tecnica ? ' Versão técnica para uso interno: não enviar ao cliente.' : ''), M, H - 122, { width: LW * 0.78, lineGap: 2 });
  doc.rect(0, H - 5, W * 0.7, 5).fill(C.esmeralda); doc.rect(W * 0.7, H - 5, W * 0.3, 5).fill(C.ouro);
  doc.page.margins.bottom = 72;

  // ------------------------------------------------------------ 1. critério de classificação
  secao('Critério de classificação');
  par('Cada oportunidade é classificada pela chance de êxito, conforme o conceito do Pronunciamento Técnico CPC 25 (Provisões, Passivos Contingentes e Ativos Contingentes), aprovado pela Resolução CVM 72/2022. A classificação considera a legislação, a jurisprudência atual do STF e do STJ e a posição da Receita Federal e da PGFN.');
  doc.moveDown(1);
  const cx = [M, M + 92, M + 370], cw = [84, 262, LW - 370];
  y = doc.y;
  doc.font('S').fontSize(7.5).fillColor(C.muted);
  doc.text('CLASSIFICAÇÃO', cx[0], y, { characterSpacing: 0.8, lineBreak: false });
  doc.text('DEFINIÇÃO', cx[1], y, { characterSpacing: 0.8, lineBreak: false });
  doc.text('TRATAMENTO', cx[2], y, { characterSpacing: 0.8, lineBreak: false });
  doc.y = y + 14; regua(doc.y, C.tinta, 0.6);
  [['verde', 'Chance de êxito maior que a de perda. Há precedente vinculante favorável, dispensa de contestação pela PGFN ou previsão expressa em lei.', 'Recomendada'],
    ['amarelo', 'Chance real de êxito, mas o tema não está pacificado ou depende da prova de como a verba foi paga e documentada.', 'Recomendada, com análise da prova'],
    ['vermelho', 'Chance pequena de êxito: tema sem referência consolidada, decidido de forma desfavorável pelos tribunais superiores ou com vedação expressa na legislação.', 'Cabe análise específica']
  ].forEach(([k, def, trat]) => {
    doc.font('R').fontSize(9);
    const h = Math.max(doc.heightOfString(def, { width: cw[1], lineGap: 2.4 }), doc.heightOfString(trat, { width: cw[2], lineGap: 2.4 })) + 18;
    y = doc.y;
    doc.rect(cx[0], y + 9, 2, 11).fill(CLASSE[k][1]);
    doc.font('S').fontSize(9.5).fillColor(CLASSE[k][1]).text(CLASSE[k][0], cx[0] + 9, y + 9, { lineBreak: false });
    doc.font('R').fontSize(9).fillColor(C.texto).text(def, cx[1], y + 9, { width: cw[1], lineGap: 2.4 });
    doc.text(trat, cx[2], y + 9, { width: cw[2], lineGap: 2.4 });
    doc.y = y + h; regua(doc.y);
  });
  doc.moveDown(1.4);
  par('Pelo CPC 25, o crédito só é reconhecido contabilmente quando sua realização é praticamente certa: quando decorre diretamente da legislação ou está assegurado por decisão judicial definitiva ou por habilitação perante a Receita Federal. Até lá, o valor é uma expectativa de recuperação.', { c: C.texto });
  doc.moveDown(1.2);
  doc.font('S').fontSize(9.5).fillColor(C.tinta).text('Fontes consideradas', M, doc.y); doc.moveDown(0.3);
  par('Constituição Federal e Código Tributário Nacional; leis e regulamentos de cada tributo; precedentes vinculantes do STF (repercussão geral) e do STJ (recursos repetitivos e súmulas); soluções de consulta da Receita Federal; pareceres e atos declaratórios da PGFN; decisões do CARF como referência da prática administrativa.', { c: C.muted, s: 9 });
  doc.moveDown(1);
  doc.font('S').fontSize(9.5).fillColor(C.tinta).text('Natureza deste documento', M, doc.y); doc.moveDown(0.3);
  par('Diagnóstico preliminar, elaborado a partir do regime tributário, do perfil operacional da empresa e, quando disponíveis, dos arquivos fiscais e da folha de pagamento. Os valores são estimativas, sujeitas à revisão técnica, à validação dos documentos de suporte e à atualização pela Selic.', { c: C.muted, s: 9 });
  if (tecnica) {
    doc.moveDown(1);
    doc.font('S').fontSize(9.5).fillColor(C.ouro).text('Aprofundamento jurídico (uso interno)', M, doc.y); doc.moveDown(0.3);
    par('Teses marcadas com "Requer aprofundamento jurídico" têm fonte ainda não conferida em base oficial, tema em disputa ou fundamento a definir. Devem passar por revisão jurídica antes de qualquer apresentação ao cliente.', { c: C.muted, s: 9 });
  }

  // ------------------------------------------------------------ utilitários de listas
  const nV = ativas.filter((t) => t.seguranca === 'verde').length, nA = ativas.length - nV;
  const lx = { nome: M, classe: M + LW - 190, valor: M + LW - 100 };
  const cabecalhoLista = () => {
    y = doc.y;
    doc.font('S').fontSize(7.5).fillColor(C.muted);
    doc.text('OPORTUNIDADE', lx.nome, y, { characterSpacing: 0.6, lineBreak: false });
    doc.text('CLASSIFICAÇÃO', lx.classe, y, { characterSpacing: 0.6, lineBreak: false });
    doc.text('VALOR ESTIMADO (R$)', lx.valor, y, { width: 100, align: 'right', characterSpacing: 0.6, lineBreak: false });
    doc.y = y + 13; regua(doc.y, C.tinta, 0.6); doc.y += 2;
  };
  const linhaTese = (t) => {
    const ref = refCurta(t);
    const flag = tecnica && aprofundar(t);
    doc.font('M').fontSize(9);
    const hN = doc.heightOfString(nome(t), { width: LW - 200 });
    doc.font('R').fontSize(7.8);
    const hR = ref ? doc.heightOfString(ref, { width: LW - 200, lineGap: 1.5 }) + 2 : 0;
    const h = hN + hR + (flag ? 11 : 0) + 13;
    if (espaco(h + 4)) cabecalhoLista();
    y = doc.y + 6;
    doc.font('M').fontSize(9).fillColor(C.texto).text(nome(t), lx.nome, y, { width: LW - 200 });
    if (ref) doc.font('R').fontSize(7.8).fillColor(C.muted).text(ref, lx.nome, doc.y + 2, { width: LW - 200, lineGap: 1.5 });
    if (flag) doc.font('S').fontSize(6.8).fillColor(C.ouro).text('REQUER APROFUNDAMENTO JURÍDICO', lx.nome, doc.y + 3, { characterSpacing: 0.6, lineBreak: false });
    const [rot, cor] = CLASSE[t.seguranca] || ['—', C.muted];
    doc.font('S').fontSize(8.5).fillColor(cor).text(rot, lx.classe, y, { lineBreak: false });
    if (valor(t)) doc.font('M').fontSize(9).fillColor(C.tinta).text(num(valor(t)), lx.valor, y, { width: 100, align: 'right', lineBreak: false });
    else doc.font('R').fontSize(8.5).fillColor(C.claro).text('a dimensionar', lx.valor, y, { width: 100, align: 'right', lineBreak: false });
    doc.y = y + h - 6; regua(doc.y);
  };
  const rotuloFamilia = (t) => { espaco(40); doc.font('S').fontSize(7.5).fillColor(C.esmeralda).text(t.toUpperCase(), M, doc.y + 10, { characterSpacing: 0.9 }); doc.y += 1; };
  const familiasDe = (g, lista) => {
    if (g.id === 'prev') {
      const fs = FAMILIAS_PREV.map((f) => ({ nome: f.nome, teses: lista.filter((t) => f.ids.includes(t.id)) }));
      const resto = lista.filter((t) => !FAMILIAS_PREV.some((f) => f.ids.includes(t.id)));
      if (resto.length) fs.push({ nome: 'Outras rubricas', teses: resto });
      return fs.filter((f) => f.teses.length);
    }
    const porArea = new Map();
    lista.forEach((t) => { const a = AREA_FISCAL[t.tributo] || 'Outros tributos federais'; if (!porArea.has(a)) porArea.set(a, []); porArea.get(a).push(t); });
    return ORDEM_AREA.filter((a) => porArea.has(a)).map((a) => ({ nome: a, teses: porArea.get(a) }));
  };
  const listaPrincipal = (g) => {
    const l = ordenar(g.teses.filter((t) => t.seguranca !== 'vermelho'));
    return comValor ? l.filter((t) => valor(t) > 0) : l;
  };
  const listaOutras = (g) => (comValor ? ordenar(g.teses.filter((t) => t.seguranca !== 'vermelho' && !valor(t))) : []);
  const listaRemotas = (g) => (tecnica ? ordenar(g.teses.filter((t) => t.seguranca === 'vermelho')) : []);
  const linhaTotal = (rot, v, a, forte) => {
    y = doc.y + 7;
    const cor = forte ? C.tinta : C.texto, f = forte ? 'S' : 'M';
    doc.font(f).fontSize(9).fillColor(cor).text(rot, M, y, { lineBreak: false });
    const partes = [v ? `Provável ${num(v)}` : null, a ? `Possível ${num(a)}` : null].filter(Boolean).join('   ·   ');
    doc.font('R').fontSize(8.3).fillColor(C.muted).text(partes, M + 120, y + 0.5, { width: LW - 240, lineBreak: false });
    doc.font(f).fontSize(9).fillColor(cor).text(num(v + a), lx.valor, y, { width: 100, align: 'right', lineBreak: false });
    doc.y = y + 17; regua(doc.y, C.tinta, 0.6);
  };

  // ------------------------------------------------------------ diagnóstico por grupo (uma seção por grupo)
  grupos.forEach((g) => {
    const principal = listaPrincipal(g);
    const ativG = g.teses.filter((t) => t.seguranca !== 'vermelho');
    secao(g.id === 'prev' ? 'Diagnóstico Previdenciário' : 'Diagnóstico Fiscal');
    if (g.id === 'prev') par('As oportunidades previdenciárias dependem da análise rubrica a rubrica da folha de pagamento. Os valores apresentados são estimativas preliminares e serão confirmados após a leitura do eSocial e da DCTFWeb e a validação dos documentos de suporte.', { s: 9.2 });
    else par('Oportunidades sobre o faturamento e as operações da empresa: PIS/COFINS, ICMS, IPI, IRPJ/CSLL e tributos indiretos. Os valores apresentados são estimativas preliminares, sujeitas à revisão técnica e à atualização pela Selic.', { s: 9.2 });
    doc.moveDown(0.5);
    const vG = soma(principal.filter((t) => t.seguranca === 'verde')), aG = soma(principal.filter((t) => t.seguranca === 'amarelo'));
    par(comValor
      ? `Foram identificadas ${principal.length} oportunidade${principal.length === 1 ? '' : 's'} com valor estimado de ${reais(vG + aG)}.`
      : `Foram identificadas ${ativG.length} oportunidades aplicáveis ao perfil da empresa. Os valores serão apurados na etapa seguinte.`, { s: 9.2, c: C.muted });
    doc.moveDown(0.8);
    if (principal.length) {
      cabecalhoLista();
      familiasDe(g, principal).forEach((f) => { rotuloFamilia(f.nome); f.teses.forEach(linhaTese); });
      if (comValor) { espaco(30); linhaTotal(`Subtotal ${g.id === 'prev' ? 'previdenciário' : 'fiscal'}`, vG, aG, true); }
    } else par('Nenhuma oportunidade com valor estimado neste grupo.', { s: 9, c: C.muted });
    const outras = listaOutras(g);
    if (outras.length) { doc.moveDown(0.8); par(`Outras ${outras.length} teses aplicáveis ao perfil da empresa foram identificadas e serão dimensionadas na etapa seguinte. A relação completa está no anexo "Teses encontradas".`, { s: 8.6, c: C.muted }); }
  });

  // ------------------------------------------------------------ próximos passos (após o diagnóstico)
  const proximosPassos = () => {
    subtitulo('Próximos passos');
    const link = !tecnica && !dados.aprovadas && dados.linkAprovacao;
    const passos = (agente && agente.proximosPassos && agente.proximosPassos.length) ? agente.proximosPassos : [
      ...(dados.aprovadas ? ['Assinatura eletrônica do contrato, conforme as teses aprovadas.']
        : ['Aprovação das teses pela empresa, uma a uma, no link exclusivo indicado abaixo. O valor estimado é recalculado conforme a seleção; em seguida, a empresa é direcionada para a assinatura eletrônica do contrato.']),
      'Validação técnica e jurídica de cada oportunidade com a documentação já disponibilizada e com os arquivos obtidos no e-CAC por procuração eletrônica.',
      'Apuração definitiva item a item pelo motor Reversa, com memória de cálculo rastreável até o arquivo de origem e atualização pela Selic.',
      'Definição da via de recuperação de cada oportunidade (retificação, PER/DCOMP ou medida judicial), cronograma de compensações e acompanhamento com relatórios periódicos.'
    ];
    passos.forEach((p, i) => {
      espaco(30); y = doc.y + 4;
      doc.font('T').fontSize(12).fillColor(C.esmeralda).text(String(i + 1).padStart(2, '0'), M, y - 1, { lineBreak: false });
      doc.font('R').fontSize(9.3).fillColor(C.texto).text(p, M + 30, y, { width: LW - 30, lineGap: 2.4 });
      doc.y += 6;
    });
    if (link) {
      espaco(70); doc.moveDown(0.6); y = doc.y;
      doc.rect(M, y, 2, 40).fill(C.esmeralda);
      doc.font('S').fontSize(9.5).fillColor(C.tinta).text('Aprovação das teses', M + 12, y + 2);
      doc.font('R').fontSize(8.6).fillColor(C.muted).text('Acesse o link exclusivo para aprovar as teses e seguir para a assinatura do contrato. Link pessoal: compartilhe apenas com o representante da empresa.', M + 12, doc.y + 2, { width: LW - 12 });
      doc.font('M').fontSize(8.6).fillColor(C.esmeralda).text('Abrir a página de aprovação', M + 12, doc.y + 4, { link, underline: true });
      doc.y += 8;
    }
    if (agente && agente.perguntas && agente.perguntas.length) {
      subtitulo('Pontos para alinhar');
      agente.perguntas.forEach((p) => { espaco(18); par(`•  ${p}`, { s: 9 }); doc.y += 2; });
    }
  };

  // ------------------------------------------------------------ diagnóstico consolidado
  if (grupos.length > 1) {
    secao('Diagnóstico Consolidado');
    par(comValor
      ? `O diagnóstico identificou potencial estimado de ${reais(totV + totA)}, dos quais ${reais(totV)} com classificação provável${totA ? ` e ${reais(totA)} com classificação possível` : ''}. Os valores são estimativas preliminares, sujeitas à revisão técnica, à validação dos documentos de suporte e à atualização pela Selic.`
      : `O diagnóstico identificou ${ativas.length} oportunidades aplicáveis ao perfil da empresa: ${nV} com classificação provável e ${nA} com classificação possível. Os valores serão apurados na etapa seguinte.`, { s: 9.4 });
    doc.moveDown(1);
    const mx = [M, M + LW - 300, M + LW - 200, M + LW - 100], mw = 100;
    const celula = (t, i, yy, f = 'R', cor = C.texto) => doc.font(f).fontSize(9.2).fillColor(cor).text(t, i ? mx[i] : mx[0], yy, { width: i ? mw : 200, align: i ? 'right' : 'left', lineBreak: false });
    y = doc.y;
    doc.font('S').fontSize(7.5).fillColor(C.muted);
    [comValor ? 'VALORES ESTIMADOS (R$)' : 'NÚMERO DE OPORTUNIDADES', 'PROVÁVEL', 'POSSÍVEL', 'TOTAL'].forEach((t, i) => doc.text(t, i ? mx[i] : mx[0], y, { width: i ? mw : 200, align: i ? 'right' : 'left', characterSpacing: 0.6, lineBreak: false }));
    doc.y = y + 14; regua(doc.y, C.tinta, 0.6);
    const fmt = (v) => (comValor ? (v ? num(v) : '–') : String(v || '–'));
    const medida = (l) => (comValor ? soma(l) : l.length);
    grupos.forEach((g) => {
      const l = g.teses.filter((t) => t.seguranca !== 'vermelho');
      const v = medida(l.filter((t) => t.seguranca === 'verde')), a = medida(l.filter((t) => t.seguranca === 'amarelo'));
      y = doc.y + 8;
      celula(g.id === 'prev' ? 'Previdenciário' : 'Fiscal', 0, y); celula(fmt(v), 1, y); celula(fmt(a), 2, y); celula(fmt(v + a), 3, y, 'M');
      doc.y = y + 19; regua(doc.y);
    });
    const v = medida(ativas.filter((t) => t.seguranca === 'verde')), a = medida(ativas.filter((t) => t.seguranca === 'amarelo'));
    y = doc.y + 8;
    celula('Total', 0, y, 'S', C.tinta); celula(fmt(v), 1, y, 'S', C.tinta); celula(fmt(a), 2, y, 'S', C.tinta); celula(fmt(v + a), 3, y, 'S', C.tinta);
    doc.y = y + 19; regua(doc.y, C.tinta, 0.6);
    doc.moveDown(1.2);
    proximosPassos();
  } else {
    proximosPassos();
  }

  // ------------------------------------------------------------ apuração do motor (quando houver)
  if (motor.length) {
    secao('Apuração pelo motor Reversa');
    par(`Cálculo sobre a EFD-Contribuições${motor[0].periodo ? ' do período ' + motor[0].periodo : ''}. Valores sem atualização pela Selic, pendentes de revisão e aprovação técnica; não constituem crédito reconhecido.`, { s: 9, c: C.muted });
    doc.moveDown(0.8);
    y = doc.y;
    doc.font('S').fontSize(7.5).fillColor(C.muted);
    doc.text('TESE', M, y, { characterSpacing: 0.6 }); doc.text('NATUREZA', M + 250, y, { characterSpacing: 0.6 });
    doc.text('REVISÃO', M + 360, y, { characterSpacing: 0.6 }); doc.text('NO PRAZO (R$)', M + 400, y, { width: LW - 400, align: 'right', characterSpacing: 0.6 });
    doc.y = y + 13; regua(doc.y, C.tinta, 0.6);
    motor.forEach((m) => {
      espaco(24); y = doc.y + 6;
      doc.font('M').fontSize(9).fillColor(C.texto).text(m.nome, M, y, { width: 240, lineBreak: false, ellipsis: true });
      doc.font('R').fontSize(8.6).fillColor(C.muted).text(NATUREZA[m.natureza] || m.natureza, M + 250, y, { lineBreak: false });
      doc.text(m.revisao === 'approved' ? 'Aprovada' : 'Pendente', M + 360, y, { lineBreak: false });
      doc.font('M').fontSize(9).fillColor(C.tinta).text(num(m.natureza === 'risco' ? m.total : m.noPrazo), M + 400, y, { width: LW - 400, align: 'right' });
      doc.y = y + 15; regua(doc.y);
    });
    y = doc.y + 7;
    doc.font('S').fontSize(9).fillColor(C.tinta).text('Créditos no prazo, a revisar', M, y, { lineBreak: false });
    doc.text(num(valorMotor), M + 400, y, { width: LW - 400, align: 'right' });
    doc.y = y + 16; regua(doc.y, C.tinta, 0.6);
  }

  // ------------------------------------------------------------ anexo: teses encontradas
  secao('Teses encontradas');
  par('Para cada tese: base legal, jurisprudência de referência, situação nos tribunais e na administração, origem na operação da empresa e documentos que suportam a apuração.', { s: 9, c: C.muted });
  const campo = (rot, txt) => {
    if (!txt || txt === '—') return;
    const yy = doc.y + 3;
    doc.font('S').fontSize(6.8).fillColor(C.claro).text(rot.toUpperCase(), M, yy + 1.2, { width: 84, characterSpacing: 0.6 });
    doc.font('R').fontSize(8.6).fillColor(C.texto).text(txt, M + 92, yy, { width: LW - 92, lineGap: 1.8 });
  };
  const altura = (campos) => campos.reduce((s2, [, txt]) => {
    if (!txt || txt === '—') return s2;
    doc.font('R').fontSize(8.6); return s2 + doc.heightOfString(txt, { width: LW - 92, lineGap: 1.8 }) + 3;
  }, 0);
  const blocoTese = (t) => {
    const campos = [['Base legal', t.base], ['Jurisprudência', t.precedente], ['Situação', t.maturidade], ['Origem', t.origem], ['Documentos', (t.docs || []).join('; ')]];
    if (tecnica) {
      campos.push(['Observação', t.nota]);
      campos.push(['Conferência', t.validacao ? `Fonte conferida em ${dataBr(t.validacao)}` : 'Pendente de conferência em fonte oficial']);
    }
    doc.font('S').fontSize(9.6);
    const hT = doc.heightOfString(nome(t), { width: LW - 170 });
    const flag = tecnica && aprofundar(t);
    espaco(hT + altura(campos) + (flag ? 14 : 0) + 26);
    y = doc.y + 8;
    doc.font('S').fontSize(9.6).fillColor(C.tinta).text(nome(t), M, y, { width: LW - 170 });
    const [rot, cor] = CLASSE[t.seguranca] || ['—', C.muted];
    doc.font('S').fontSize(8.3).fillColor(cor).text(valor(t) ? `${rot}  ·  ${reais(valor(t))}` : rot, M + LW - 165, y + 1, { width: 165, align: 'right', lineBreak: false });
    doc.y = Math.max(doc.y, y + 12) + 3;
    if (flag) { doc.font('S').fontSize(6.8).fillColor(C.ouro).text('REQUER APROFUNDAMENTO JURÍDICO', M, doc.y + 1, { characterSpacing: 0.6 }); doc.y += 2; }
    campos.forEach(([r2, txt]) => campo(r2, txt));
    doc.y += 9; regua(doc.y);
  };
  grupos.forEach((g) => {
    const principal = listaPrincipal(g), outras = listaOutras(g), remotas = listaRemotas(g);
    if (!principal.length && !outras.length && !remotas.length) return;
    subtitulo(g.id === 'prev' ? 'Previdenciário' : 'Fiscal');
    principal.forEach(blocoTese);
    if (outras.length) { rotuloFamilia(`Outras teses identificadas, a dimensionar (${outras.length})`); outras.forEach(blocoTese); }
    if (remotas.length) { rotuloFamilia(`Teses remotas avaliadas · uso interno (${remotas.length})`); remotas.forEach(blocoTese); }
  });

  // ------------------------------------------------------------ cabeçalho e rodapé das páginas internas
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.rect(0, 0, W * 0.7, 2).fill(C.esmeralda); doc.rect(W * 0.7, 0, W * 0.3, 2).fill(C.ouro);
    doc.image(LOGO, W - M - 70, 26, { height: 16 });
    doc.font('B').fontSize(7.5).fillColor(C.tinta).text('REVERSA', W - M - 50, 31, { lineBreak: false, characterSpacing: 1 });
    doc.font('B').fontSize(7.5).fillColor(C.esmeralda).text('TAX', W - M - 50 + doc.font('B').fontSize(7.5).widthOfString('REVERSA ', { characterSpacing: 1 }) + 1, 31, { lineBreak: false, characterSpacing: 1 });
    regua(H - 50, C.linha, 0.5);
    doc.font('S').fontSize(7.5).fillColor(C.tinta).text('Reversa Tax', M, H - 40, { lineBreak: false });
    doc.font('R').fontSize(7.5).fillColor(C.muted).text('  ·  uma solução Argus Prime', M + doc.font('S').fontSize(7.5).widthOfString('Reversa Tax'), H - 40, { lineBreak: false });
    doc.font('R').fontSize(7.5).fillColor(C.muted).text(`${rotuloDoc} · ${cliente.legalName}     ${i + 1} / ${range.count}`, M + 170, H - 40, { width: LW - 170, align: 'right', lineBreak: false, ellipsis: true });
    doc.page.margins.bottom = mb;
  }
  doc.end();
  return fim;
}

module.exports = { gerar, prioridades };
