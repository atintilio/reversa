// Reversa Gov — relatórios em PDF (A4), gerados no servidor com pdfkit.
//  · comercial: para apresentar ao município — fluxo de caixa e arrecadação, sem ressalvas nem listas de documentos.
//  · tecnico: uso interno — premissas, cálculo, base legal e pontos de atenção.
// Marca: Reversa é uma solução Argus Prime. Paleta esmeralda e ouro velho.
const path = require('node:path');
const PDFDocument = require('pdfkit');
// Mapa do Brasil (paths SVG por estado) embutido em JSON: o pacote original é só ESM e não carrega no runtime.
const brasil = require('./mapa-brasil.json');
const { resumo } = require('./gov-exemplo');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const LOGO = path.join(ASSETS, 'reversa-r.png');
// Logo do Reversa sobre fundo escuro: aplicado sobre uma placa branca para manter o contraste.
function logoPlaca(doc, x, y, h) {
  doc.roundedRect(x, y, h * 1.25, h * 1.25, 8).fill('#FFFFFF');
  doc.image(LOGO, x + h * 0.125, y + h * 0.125, { height: h });
}
const C = { tinta: '#14201C', texto: '#2E3733', muted: '#5F6965', linha: '#E4E0D6', fundo: '#F6F4EE', esmeralda: '#0E7A5C', esmeraldaEsc: '#0A5A44', ouro: '#A9864F', mapa: '#D9DFDB', branco: '#FFFFFF' };
const M = 56;
// Estado de MG no mapa do Brasil (caixa em unidades do SVG) — usado para posicionar o município.
const MG = { x0: 358.93, y0: 305.29, x1: 533.18, y1: 447.1, lonW: -51.05, lonE: -39.86, latN: -14.23, latS: -22.92 };

const reais = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reaisInt = (v) => 'R$ ' + Math.round(Number(v || 0)).toLocaleString('pt-BR');
const milhoes = (v) => 'R$ ' + (Number(v) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
const mil = (v) => 'R$ ' + Math.round(Number(v) / 1000).toLocaleString('pt-BR') + ' mil';
const dataLonga = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

function novoDoc(titulo, assunto) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: M, right: M }, bufferPages: true,
    info: { Title: titulo, Author: 'Reversa Gov · Argus Prime', Subject: assunto } });
  doc.registerFont('R', path.join(ASSETS, 'fonts', 'Inter-Regular.otf'));
  doc.registerFont('M', path.join(ASSETS, 'fonts', 'Inter-Medium.otf'));
  doc.registerFont('S', path.join(ASSETS, 'fonts', 'Inter-SemiBold.otf'));
  doc.registerFont('B', path.join(ASSETS, 'fonts', 'Inter-Bold.otf'));
  doc.registerFont('T', path.join(ASSETS, 'fonts', 'Lora-Variable.ttf'));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  return { doc, fim };
}

// Utilitários de desenho compartilhados pelos dois relatórios.
function ferramentas(doc) {
  const W = doc.page.width, H = doc.page.height, LW = W - 2 * M;
  const t = (texto, o = {}) => doc.font(o.f || 'R').fontSize(o.s || 11).fillColor(o.c || C.texto)
    .text(texto, o.x ?? M, o.y ?? doc.y, { width: o.w ?? LW, lineGap: o.lg ?? 3, align: o.a || 'left', characterSpacing: o.cs || 0 });
  const regua = (y, cor = C.linha, lw = 0.6, x0 = M, x1 = W - M) => doc.moveTo(x0, y).lineTo(x1, y).lineWidth(lw).strokeColor(cor).stroke();
  const pagina = (kicker, titulo) => {
    doc.addPage(); doc.x = M; doc.y = 64;
    t(kicker.toUpperCase(), { f: 'S', s: 8, c: C.ouro, cs: 1.6 });
    t(titulo, { f: 'T', s: 24, c: C.tinta, y: doc.y + 4, lg: 2 });
    const y = doc.y + 10; doc.rect(M, y, 34, 1.6).fill(C.esmeralda); doc.y = y + 24;
  };
  const cartao = (x, y, w, h, o = {}) => {
    doc.roundedRect(x, y, w, h, 6).fill(o.fundo || C.fundo);
    if (o.borda) doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor(o.borda).stroke();
  };
  return { W, H, LW, t, regua, pagina, cartao };
}

// Rodapé em todas as páginas (exceto a capa): marca Argus Prime e numeração.
function rodapes(doc, rotulo) {
  const r = doc.bufferedPageRange();
  for (let i = r.start + 1; i < r.start + r.count; i += 1) {
    doc.switchToPage(i);
    const W = doc.page.width, H = doc.page.height;
    doc.page.margins.bottom = 0;
    doc.moveTo(M, H - 46).lineTo(W - M, H - 46).lineWidth(0.5).strokeColor(C.linha).stroke();
    doc.image(LOGO, M, H - 39, { height: 17 });
    doc.font('R').fontSize(7.5).fillColor(C.muted).text('Reversa é uma solução Argus Prime · ' + rotulo, M + 22, H - 34, { width: W - 2 * M - 80, lineBreak: false });
    doc.font('M').fontSize(7.5).fillColor(C.muted).text(String(i + 1), W - M - 40, H - 34, { width: 40, align: 'right', lineBreak: false });
  }
}

// Mapa do Brasil com o município em destaque (estado em esmeralda e pino).
function desenharMapa(doc, x, y, escala, caso, o = {}) {
  const corBase = o.base || C.mapa, corEstado = o.estado || C.esmeralda, corPino = o.pino || C.ouro, corMiolo = o.miolo || C.branco;
  doc.save();
  doc.translate(x, y).scale(escala);
  brasil.locations.forEach((l) => { doc.path(l.path).fill(l.id === 'mg' ? corEstado : corBase); });
  brasil.locations.forEach((l) => { doc.path(l.path).lineWidth(0.5 / escala).strokeColor(o.traco || C.branco).stroke(); });
  const fx = (caso.municipio.longitude - MG.lonW) / (MG.lonE - MG.lonW);
  const fy = (caso.municipio.latitude - MG.latN) / (MG.latS - MG.latN);
  const px = MG.x0 + fx * (MG.x1 - MG.x0), py = MG.y0 + fy * (MG.y1 - MG.y0);
  doc.circle(px, py, 15).fillOpacity(0.3).fill(corPino).fillOpacity(1);
  doc.circle(px, py, 7).fill(corPino);
  doc.circle(px, py, 3).fill(corMiolo);
  doc.restore();
  return { px: x + px * escala, py: y + py * escala };
}

// Curva do caixa acumulado (36 meses) dos três cenários.
function graficoCaixa(doc, x, y, w, h, cenarios) {
  const max = Math.max(...cenarios.map((c) => c.total36)) * 1.08;
  const n = cenarios[0].meses.length;
  doc.font('R').fontSize(8).fillColor(C.muted);
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const yy = y + h - f * h;
    doc.moveTo(x, yy).lineTo(x + w, yy).lineWidth(0.4).strokeColor(C.linha).stroke();
    doc.fillColor(C.muted).text(f === 0 ? '0' : milhoes(max * f / 1.0), x - 54, yy - 4, { width: 50, align: 'right', lineBreak: false });
  });
  [1, 6, 12, 18, 24, 30, 36].forEach((m) => {
    const xx = x + ((m - 1) / (n - 1)) * w;
    doc.fillColor(C.muted).text('mês ' + m, xx - 16, y + h + 6, { width: 32, align: 'center', lineBreak: false });
  });
  const cor = { conservador: C.ouro, referencia: C.esmeralda, potencial: C.esmeraldaEsc };
  cenarios.forEach((c) => {
    c.meses.forEach((mm, i) => {
      const xx = x + (i / (n - 1)) * w, yy = y + h - (mm.acumulado / max) * h;
      if (i === 0) doc.moveTo(xx, yy); else doc.lineTo(xx, yy);
    });
    doc.lineWidth(c.destaque ? 2.6 : 1.6).strokeColor(cor[c.id]).stroke();
    const ult = c.meses[n - 1];
    doc.circle(x + w, y + h - (ult.acumulado / max) * h, 3).fill(cor[c.id]);
  });
}

// ------------------------------------------------------------------------------------------------ comercial
async function comercial() {
  const caso = resumo();
  const ref = caso.cenarios.find((c) => c.destaque);
  const { doc, fim } = novoDoc('Diagnóstico de Recuperação de Receita — ' + caso.ente, 'Relatório comercial');
  const { W, H, LW, t, regua, pagina, cartao } = ferramentas(doc);

  // Capa
  doc.rect(0, 0, W, H).fill(C.esmeraldaEsc);
  doc.rect(0, H - 8, W, 8).fill(C.ouro);
  logoPlaca(doc, M, 50, 44);
  t('REVERSA GOV', { f: 'S', s: 9, c: '#E5D3AE', cs: 3, y: 128 });
  t('Diagnóstico de Recuperação de Receita', { f: 'T', s: 36, c: C.branco, y: 150, lg: 4 });
  t(caso.ente + ' / ' + caso.municipio.uf, { f: 'M', s: 17, c: '#E5D3AE', y: doc.y + 18 });
  desenharMapa(doc, W - M - 330, 400, 0.54, caso, { base: '#1B7A60', estado: '#E5D3AE', pino: '#FFFFFF', miolo: C.esmeraldaEsc, traco: C.esmeraldaEsc });
  doc.fillColor(C.branco);
  t('Quanto entra no caixa do município, mês a mês,\nsem esperar precatório.', { f: 'R', s: 14, c: '#D9E6E0', x: M, y: 470, w: 230, lg: 5 });
  t('Reversa é uma solução Argus Prime', { f: 'S', s: 9, c: '#E5D3AE', y: H - 96 });
  t('Preparado pelo time técnico Argus Prime · ' + dataLonga(), { f: 'R', s: 9, c: '#B9CCC4', y: H - 80 });

  // 1 — Sumário executivo
  pagina('Sumário executivo', 'O que isso muda no caixa de ' + caso.municipio.nome);
  const base = doc.y;
  desenharMapa(doc, M - 6, base - 4, 0.46, caso);
  const bx = M + 270;
  t('Caixa liberado em 36 meses', { f: 'S', s: 9, c: C.ouro, x: bx, y: base, w: LW - 270, cs: 1 });
  t(milhoes(ref.total36), { f: 'T', s: 38, c: C.esmeralda, x: bx, y: base + 14, w: LW - 270 });
  t('no cenário de referência, pagando a guia de INSS com o crédito em vez de dinheiro.', { s: 11, x: bx, y: base + 62, w: LW - 270 });
  const yc = base + 150;
  [[milhoes(ref.retro), 'de crédito recuperado, compensado em ' + caso.parcelas + ' parcelas de ' + mil(ref.parcela) + ' por mês'],
    [mil(ref.recAno) + ' por ano', 'de economia permanente na folha, a partir do 4º mês'],
    [mil(caso.irrf.porAno) + ' por ano', 'de arrecadação própria de IRRF, além do valor acima']].forEach(([g, p], i) => {
    const yy = yc + i * 84;
    cartao(bx, yy, LW - 270, 74, { fundo: C.fundo });
    doc.rect(bx, yy, 3, 74).fill(i === 2 ? C.ouro : C.esmeralda);
    t(g, { f: 'B', s: 17, c: C.tinta, x: bx + 14, y: yy + 11, w: LW - 296 });
    t(p, { s: 10, c: C.muted, x: bx + 14, y: yy + 36, w: LW - 296, lg: 2 });
  });
  doc.y = Math.max(yc + 3 * 84, base + 330);
  regua(doc.y, C.linha); doc.y += 14;
  t('Em uma frase: o município deixa de pagar em dinheiro parte da guia mensal de INSS e passa a pagar com crédito reconhecido. A diferença fica no caixa.', { f: 'M', s: 12.5, c: C.tinta, lg: 4 });

  // 2 — O que analisamos
  pagina('Escopo da análise', 'O que analisamos');
  t('Analisamos a folha de pagamento do município nos últimos cinco anos, no regime que sustenta o cálculo: o Regime Geral de Previdência Social.', { s: 12, lg: 4 });
  doc.y += 14;
  const linhas = [['Município', caso.ente + ' · ' + caso.municipio.uf + ' · IBGE ' + caso.municipio.ibge],
    ['CNPJ', caso.cnpj], ['Regime previdenciário', caso.regime], ['Entidades analisadas', caso.grupo.join(' · ')],
    ['Período', caso.periodo], ['Base legal', 'Art. 22, I e II, da Lei 8.212/91 · art. 158, I, da Constituição Federal']];
  linhas.forEach(([a, b], i) => {
    const yy = doc.y;
    t(a.toUpperCase(), { f: 'S', s: 8, c: C.ouro, w: 130, cs: 1, y: yy + 3 });
    t(b, { f: 'M', s: 11.5, c: C.tinta, x: M + 140, y: yy, w: LW - 140 });
    doc.y = Math.max(doc.y, yy + 22) + 8; regua(doc.y - 4, C.linha, 0.4);
  });
  doc.y += 10;
  t('Prefeitura e fundos municipais são analisados em conjunto, porque recolhem a mesma contribuição previdenciária patronal.', { s: 11, c: C.muted });

  // 3 — Fluxo de caixa
  pagina('Fluxo de caixa', 'Quanto entra, mês a mês');
  t('Caixa acumulado em 36 meses, em três cenários. A economia começa no 4º mês, depois de três meses de preparação.', { s: 11, lg: 4 });
  doc.y += 24;
  const gy = doc.y + 4;
  graficoCaixa(doc, M + 58, gy, LW - 78, 230, caso.cenarios);
  doc.y = gy + 262;
  const cw = (LW - 24) / 3;
  const yCards = doc.y;
  caso.cenarios.forEach((c, i) => {
    const xx = M + i * (cw + 12), yy = yCards;
    cartao(xx, yy, cw, 118, { fundo: c.destaque ? '#E6F2EE' : C.fundo, borda: c.destaque ? C.esmeralda : null });
    t(c.nome.toUpperCase(), { f: 'S', s: 8, c: c.destaque ? C.esmeraldaEsc : C.ouro, x: xx + 12, y: yy + 12, w: cw - 24, cs: 1 });
    t(milhoes(c.total36), { f: 'T', s: 22, c: C.tinta, x: xx + 12, y: yy + 28, w: cw - 24 });
    t('em 36 meses', { s: 9.5, c: C.muted, x: xx + 12, y: yy + 58, w: cw - 24 });
    t(milhoes(c.retro) + ' de crédito\n' + mil(c.recAno) + ' por ano de economia', { s: 9.5, c: C.texto, x: xx + 12, y: yy + 76, w: cw - 24, lg: 3 });
  });

  // 4 — Cronograma
  pagina('Cronograma', 'Como o dinheiro chega');
  const passos = [['Meses 1 a 3', 'Preparação', 'Organizamos o crédito e o pedido junto ao município. Nada muda na rotina da folha.'],
    ['Do mês 4 ao mês ' + (3 + caso.parcelas), 'Compensação em ' + caso.parcelas + ' parcelas', 'A cada mês, ' + mil(ref.parcela) + ' do crédito pagam parte da guia de INSS. É dinheiro que deixa de sair do caixa.'],
    ['A partir do mês 4', 'Economia permanente', 'A correção da base de cálculo reduz a guia mensal. No cenário de referência, ' + mil(ref.recAno) + ' por ano.'],
    ['Todo ano', 'Arrecadação própria de IRRF', 'O imposto de renda retido pelo município é receita municipal: cerca de ' + mil(caso.irrf.porAno) + ' por ano, à parte do caixa acima.']];
  passos.forEach(([quando, titulo, texto], i) => {
    const yy = doc.y;
    doc.circle(M + 12, yy + 14, 12).fill(i === 3 ? C.ouro : C.esmeralda);
    t(String(i + 1), { f: 'B', s: 12, c: C.branco, x: M, y: yy + 8, w: 24, a: 'center' });
    if (i < 3) doc.moveTo(M + 12, yy + 28).lineTo(M + 12, yy + 100).lineWidth(1).strokeColor(C.linha).stroke();
    t(quando.toUpperCase(), { f: 'S', s: 8, c: C.ouro, x: M + 40, y: yy + 2, w: LW - 40, cs: 1 });
    t(titulo, { f: 'T', s: 16, c: C.tinta, x: M + 40, y: yy + 16, w: LW - 40 });
    t(texto, { s: 11, x: M + 40, y: yy + 40, w: LW - 40, lg: 3 });
    doc.y = yy + 100;
  });

  // 5 — Como funciona
  pagina('Mecanismo', 'Como a compensação funciona');
  t('O município paga todo mês a contribuição previdenciária patronal. Com o crédito reconhecido, parte dessa guia é paga por compensação, e não em dinheiro.', { s: 12, lg: 4 });
  doc.y += 22;
  const bw = (LW - 40) / 3;
  const yMec = doc.y;
  [['Guia mensal de INSS', 'Cerca de ' + mil(caso.guiaMensal) + ' por mês'], ['Crédito compensa parte', mil(ref.parcela) + ' por mês, em ' + caso.parcelas + ' parcelas'], ['Caixa preservado', 'O dinheiro que sairia fica na prefeitura']].forEach(([a, b], i) => {
    const xx = M + i * (bw + 20), yy = yMec;
    cartao(xx, yy, bw, 112, { fundo: i === 2 ? '#E6F2EE' : C.fundo, borda: i === 2 ? C.esmeralda : null });
    t(a, { f: 'S', s: 12, c: C.tinta, x: xx + 14, y: yy + 16, w: bw - 28 });
    t(b, { s: 10.5, c: C.muted, x: xx + 14, y: yy + 58, w: bw - 28, lg: 3 });
    if (i < 2) t('→', { f: 'B', s: 18, c: C.ouro, x: xx + bw + 1, y: yy + 44, w: 18, a: 'center' });
  });
  doc.y = yMec + 150;
  t('Sem precatório e sem fila de pagamento: o benefício aparece na própria guia mensal.', { f: 'M', s: 12.5, c: C.esmeraldaEsc, lg: 4 });

  // 6 — Próximos passos
  pagina('Próximos passos', 'Para começar');
  [['Apresentação ao gestor', 'Reunião para apresentar o diagnóstico e tirar dúvidas.'], ['Autorização', 'Assinatura do termo que permite o início do trabalho.'], ['Início da preparação', 'Começa a contagem dos três meses até a primeira compensação.']].forEach(([a, b], i) => {
    const yy = doc.y;
    cartao(M, yy, LW, 70);
    t(String(i + 1).padStart(2, '0'), { f: 'T', s: 24, c: C.ouro, x: M + 18, y: yy + 20, w: 40 });
    t(a, { f: 'S', s: 13, c: C.tinta, x: M + 72, y: yy + 14, w: LW - 90 });
    t(b, { s: 11, c: C.muted, x: M + 72, y: yy + 36, w: LW - 90 });
    doc.y = yy + 84;
  });
  const ya = doc.y + 30;
  doc.image(LOGO, M, ya, { height: 64 });
  t('Reversa é uma solução Argus Prime — Engenharia Financeira e Tributária.', { f: 'M', s: 11, c: C.tinta, x: M + 90, y: ya + 8, w: LW - 90 });
  t('Diagnóstico preparado pelo time técnico Argus Prime.', { s: 10, c: C.muted, x: M + 90, y: ya + 42, w: LW - 90 });

  rodapes(doc, 'Diagnóstico de Recuperação de Receita');
  doc.end();
  return { nome: 'Reversa-Gov-Tupaciguara-MG-Relatorio-Comercial.pdf', pdf: await fim };
}

// ------------------------------------------------------------------------------------------------ técnico
async function tecnico() {
  const caso = resumo();
  const tec = caso.tecnico;
  const { doc, fim } = novoDoc('Diagnóstico técnico — ' + caso.ente, 'Relatório técnico · uso interno');
  const { W, H, LW, t, regua, pagina, cartao } = ferramentas(doc);

  doc.rect(0, 0, W, 190).fill(C.esmeraldaEsc);
  logoPlaca(doc, M, 34, 38);
  t('REVERSA GOV · USO INTERNO', { f: 'S', s: 8.5, c: '#E5D3AE', cs: 2.4, y: 104 });
  t('Diagnóstico técnico', { f: 'T', s: 30, c: C.branco, y: 118 });
  doc.y = 214;
  t(caso.ente + ' / ' + caso.municipio.uf, { f: 'S', s: 15, c: C.tinta });
  t('CNPJ ' + caso.cnpj + ' · IBGE ' + caso.municipio.ibge + ' · ' + caso.regime, { s: 10.5, c: C.muted, y: doc.y + 4 });
  t('Documento interno. Não encaminhar ao município: contém premissas, pontos de atenção e passivos que não são crédito.', { f: 'M', s: 10.5, c: C.ouro, y: doc.y + 12, lg: 3 });
  doc.y += 18; regua(doc.y);

  doc.y += 18;
  t('Resumo dos cenários', { f: 'T', s: 18, c: C.tinta });
  doc.y += 8;
  const cols = [['Cenário', 150], ['Crédito retroativo', 110], ['Economia / ano', 100], ['Caixa em 36 meses', LW - 360]];
  let xx = M, yy = doc.y;
  cols.forEach(([n, w], i) => { t(n.toUpperCase(), { f: 'S', s: 7.5, c: C.ouro, x: xx, y: yy, w, cs: 0.8, a: i ? 'right' : 'left' }); xx += w; });
  doc.y = yy + 16; regua(doc.y - 2, C.tinta, 0.8);
  caso.cenarios.forEach((c) => {
    xx = M; yy = doc.y + 4;
    [[c.nome + (c.destaque ? ' (referência)' : ''), 150], [reais(c.retro), 110], [reaisInt(c.recAno), 100], [reaisInt(c.total36), LW - 360]].forEach(([v, w], i) => {
      t(v, { f: c.destaque ? 'S' : 'R', s: 10, c: C.tinta, x: xx, y: yy, w, a: i ? 'right' : 'left' }); xx += w;
    });
    doc.y = yy + 18; regua(doc.y - 2);
  });

  pagina('Premissas e cálculo', 'Como chegamos nos números');
  [['Alíquota total', '22% sobre a remuneração: 20% de contribuição patronal + 2% de RAT, conforme art. 22, I e II, da Lei 8.212/91. FAP e CNAE não confirmados em documento oficial.'],
    ['Prazo', 'Cinco anos de competências (a partir de 11/2021), limite prescricional adotado no diagnóstico.'],
    ['Guia mensal', 'Estimada em cerca de ' + reaisInt(caso.guiaMensal) + ', a partir da folha de 2021 a 2025.'],
    ['Compensação', 'Crédito retroativo compensado em ' + caso.parcelas + ' parcelas mensais, a partir do 4º mês (três meses de preparação).'],
    ['Economia recorrente', 'Correção da base na guia mensal, a partir do 4º mês. Soma ao caixa até o mês 36.'],
    ['Caixa em 36 meses', 'Crédito retroativo + economia recorrente × 33 meses ativos (meses 4 a 36).']].forEach(([a, b]) => {
    const y0 = doc.y;
    t(a.toUpperCase(), { f: 'S', s: 8, c: C.ouro, w: 120, cs: 1, y: y0 + 2 });
    t(b, { s: 10.5, x: M + 130, y: y0, w: LW - 130, lg: 3 });
    doc.y = Math.max(doc.y, y0 + 18) + 8; regua(doc.y - 4, C.linha, 0.4);
  });
  doc.y += 14;
  t('Parcela mensal por cenário', { f: 'T', s: 16, c: C.tinta });
  doc.y += 6;
  caso.cenarios.forEach((c) => t(c.nome + ': ' + reais(c.parcela) + ' por mês em ' + caso.parcelas + ' meses · economia de ' + reais(c.recMes) + ' por mês', { s: 10.5, y: doc.y + 2 }));
  doc.y += 14;
  t('IRRF de arrecadação própria', { f: 'T', s: 16, c: C.tinta });
  doc.y += 6;
  t(reais(caso.irrf.cincoAnos) + ' em cinco anos, cerca de ' + reaisInt(caso.irrf.porAno) + ' por ano. Não está incluído nos cenários acima.', { s: 10.5, lg: 3 });

  pagina('Base legal', 'Fundamentos e referências');
  tec.referencias.forEach(([a, b]) => {
    const y0 = doc.y;
    t(a, { f: 'S', s: 11, c: C.tinta, w: 200, y: y0 });
    t(b, { s: 10.5, x: M + 210, y: y0, w: LW - 210, lg: 3 });
    doc.y = Math.max(doc.y, y0 + 20) + 8; regua(doc.y - 4, C.linha, 0.4);
  });

  pagina('Pontos de atenção', 'O que não vai para o município');
  tec.pontosAtencao.forEach((p) => {
    const y0 = doc.y;
    doc.circle(M + 4, y0 + 7, 3).fill(C.ouro);
    t(p, { s: 11, x: M + 18, y: y0, w: LW - 18, lg: 3 });
    doc.y += 10;
  });
  doc.y += 10;
  const yp = doc.y;
  cartao(M, yp, LW, 100, { fundo: C.fundo, borda: C.ouro });
  t('PASSIVO PATRONAL TOTAL NO PERÍODO', { f: 'S', s: 8, c: C.ouro, x: M + 16, y: yp + 14, w: LW - 32, cs: 1 });
  t(reais(tec.passivoPatronal), { f: 'T', s: 22, c: C.tinta, x: M + 16, y: yp + 30, w: LW - 32 });
  t(tec.passivoNota, { s: 9.5, c: C.muted, x: M + 16, y: yp + 64, w: LW - 32 });

  rodapes(doc, 'Diagnóstico técnico · uso interno');
  doc.end();
  return { nome: 'Reversa-Gov-Tupaciguara-MG-Relatorio-Tecnico.pdf', pdf: await fim };
}

module.exports = { comercial, tecnico };
