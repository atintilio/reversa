// Relatório executivo do diagnóstico preliminar (PDF, A4) — gerado no servidor com pdfkit.
// Conteúdo: capa, sumário executivo, prioridades, teses por grupo (Fiscal / Previdenciário), resultado do motor
// (quando houver cálculo) e próximos passos. Diagnóstico não é crédito (RB-09): valores só do motor, pendentes de revisão.
const path = require('node:path');
const PDFDocument = require('pdfkit');

const FONTES = path.join(__dirname, '..', 'assets', 'fonts');
const LOGO = path.join(__dirname, '..', 'assets', 'reversa-r.png');
const C = {
  navy: '#0E2239', navy2: '#16304D', teal: '#1E8F88', tealClaro: '#6FD0C7', cobre: '#C78054',
  texto: '#1B2B3C', muted: '#5B6B7C', linha: '#DDE3EA', fundo: '#F3F6F8',
  verde: '#1E7A4C', verdeBg: '#E3F2EA', amarelo: '#8A5A12', amareloBg: '#F7EBD3', vermelho: '#A33A2B', vermelhoBg: '#F8E3DF'
};
const SEG = { verde: ['Alta', C.verde, C.verdeBg], amarelo: ['Média', C.amarelo, C.amareloBg], vermelho: ['Baixa', C.vermelho, C.vermelhoBg] };
const ORDEM_SEG = { verde: 0, amarelo: 1, vermelho: 2 };
const NATUREZA = { credito: 'Crédito a recuperar', potencial: 'Potencial a validar', risco: 'Risco a regularizar' };
const M = 48; // margem lateral

const reais = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reaisCurto = (v) => {
  const n = Number(v || 0);
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (n >= 1e3) return 'R$ ' + Math.round(n / 1e3).toLocaleString('pt-BR') + ' mil';
  return reais(n);
};
const cnpjFmt = (c) => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const titulo = (t) => String(t).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (w) => w.toLowerCase());
const hoje = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

function ordenar(teses) {
  return teses.slice().sort((a, b) =>
    (a.estado === b.estado ? 0 : a.estado === 'provavel' ? -1 : 1) ||
    (ORDEM_SEG[a.seguranca] ?? 3) - (ORDEM_SEG[b.seguranca] ?? 3) || a.id.localeCompare(b.id));
}

// Prioridades: prováveis e de segurança alta/média primeiro; a análise do agente, se houver, tem precedência.
function prioridades(grupos, agente) {
  const todas = grupos.flatMap((g) => g.teses.map((t) => ({ ...t, grupo: g.nome })));
  const porId = new Map(todas.map((t) => [t.id, t]));
  const lista = [];
  ((agente && agente.tesesPrioritarias) || []).forEach((p) => { const t = porId.get(p.id); if (t && t.seguranca !== 'vermelho') lista.push({ ...t, motivo: p.motivo }); });
  ordenar(todas).filter((t) => t.seguranca !== 'vermelho').forEach((t) => { if (lista.length < 5 && !lista.some((x) => x.id === t.id)) lista.push({ ...t, motivo: t.origem }); });
  return lista.slice(0, 5);
}

function gerar(dados) {
  const { cliente, grupos, motor, agente, autor } = dados;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: M, right: M }, bufferPages: true,
    info: { Title: `Diagnóstico preliminar — ${cliente.legalName}`, Author: 'Reversa Tax · Argus Prime', Subject: 'Diagnóstico tributário preliminar' } });
  doc.registerFont('R', path.join(FONTES, 'Inter-Regular.otf'));
  doc.registerFont('M', path.join(FONTES, 'Inter-Medium.otf'));
  doc.registerFont('S', path.join(FONTES, 'Inter-SemiBold.otf'));
  doc.registerFont('B', path.join(FONTES, 'Inter-Bold.otf'));
  const W = doc.page.width, H = doc.page.height, LW = W - 2 * M;
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // reduz a fonte até o texto caber na largura (fonte B)
  const caber = (t, tam, larg) => { doc.font('B'); let f = tam; while (f > 10 && doc.fontSize(f).widthOfString(t) > larg) f -= 1; return f; };
  const todas = grupos.flatMap((g) => g.teses);
  const tot = { teses: todas.length, provavel: todas.filter((t) => t.estado === 'provavel').length,
    verde: todas.filter((t) => t.seguranca === 'verde').length, amarelo: todas.filter((t) => t.seguranca === 'amarelo').length,
    vermelho: todas.filter((t) => t.seguranca === 'vermelho').length };
  const valorMotor = motor.filter((m) => m.natureza === 'credito').reduce((s, m) => s + m.noPrazo, 0);
  const escopo = grupos.map((g) => g.nome).join(' e ');

  // ------------------------------------------------------------ capa
  const mbCapa = doc.page.margins.bottom; doc.page.margins.bottom = 0;
  doc.rect(0, 0, W, H).fill(C.navy);
  doc.rect(0, H - 8, W, 8).fill(C.teal);
  doc.image(LOGO, M, 56, { width: 54 });
  doc.font('B').fontSize(13).fillColor('#FFFFFF').text('REVERSA', M + 66, 70, { continued: true, characterSpacing: 1.5 }).fillColor(C.tealClaro).text(' TAX');
  doc.font('R').fontSize(9).fillColor('#AFC0D2').text('uma ferramenta Argus Prime', M + 66, 88);
  doc.font('S').fontSize(11).fillColor(C.cobre).text('DIAGNÓSTICO TRIBUTÁRIO PRELIMINAR', M, 250, { characterSpacing: 2 });
  doc.font('B').fontSize(34).fillColor('#FFFFFF').text(cliente.legalName, M, 276, { width: LW - 60, lineGap: 2 });
  let y = doc.y + 14;
  doc.rect(M, y, 64, 3).fill(C.teal);
  y += 18;
  const linhaCapa = [`CNPJ ${cnpjFmt(cliente.cnpj)}`, cliente.taxRegime || 'Regime não informado',
    cliente.publico && cliente.publico.municipio ? `${titulo(cliente.publico.municipio)}/${cliente.publico.uf}` : null].filter(Boolean).join('   ·   ');
  doc.font('R').fontSize(12).fillColor('#C9D6E3').text(linhaCapa, M, y, { width: LW });
  doc.font('M').fontSize(12).fillColor('#FFFFFF').text(`Escopo: ${escopo}`, M, doc.y + 6);
  // destaques na capa
  const caixas = [[String(tot.teses), 'teses aplicáveis'], [String(tot.verde), 'de alta segurança'], [valorMotor ? reaisCurto(valorMotor) : '—', valorMotor ? 'identificados pelo motor*' : 'valor após cálculo']];
  const bw = (LW - 24) / 3; y = H - 300;
  caixas.forEach(([v, r], i) => {
    const x = M + i * (bw + 12);
    doc.roundedRect(x, y, bw, 86, 8).fillOpacity(0.08).fill('#FFFFFF').fillOpacity(1);
    doc.font('B').fontSize(caber(v, 24, bw - 32)).fillColor(C.tealClaro).text(v, x + 16, y + 16, { width: bw - 32, lineBreak: false });
    doc.font('R').fontSize(10).fillColor('#C9D6E3').text(r, x + 16, y + 54, { width: bw - 32 });
  });
  doc.font('R').fontSize(10).fillColor('#AFC0D2').text(`${hoje()}${autor ? '   ·   Preparado por ' + autor : ''}`, M, H - 150);
  doc.font('R').fontSize(8).fillColor('#8FA3B8').text('Documento confidencial, de uso exclusivo do destinatário. Diagnóstico preliminar: indica oportunidades a confirmar e não constitui reconhecimento de crédito.' +
    (valorMotor ? ' *Valor calculado pelo motor sobre a EFD-Contribuições, sem correção, pendente de revisão técnica.' : ''), M, H - 128, { width: LW });
  doc.font('S').fontSize(9).fillColor('#FFFFFF').text('ARGUS PRIME', M, H - 72, { characterSpacing: 2, continued: true }).font('R').fillColor('#AFC0D2').text('   Engenharia Financeira e Tributária', { characterSpacing: 0, lineBreak: false });
  doc.page.margins.bottom = mbCapa;

  // ------------------------------------------------------------ helpers de página
  const novaPagina = () => { doc.addPage(); doc.x = M; doc.y = 64; };
  const cabeca = (sobre, titulo) => {
    doc.font('S').fontSize(9).fillColor(C.teal).text(sobre.toUpperCase(), M, doc.y, { characterSpacing: 1.5 });
    doc.font('B').fontSize(22).fillColor(C.navy).text(titulo, M, doc.y + 4, { width: LW });
    doc.moveDown(0.6);
  };
  const espaco = (h) => { if (doc.y + h > H - 72) { novaPagina(); return true; } return false; };
  const selo = (seg, x, yy) => {
    const s = SEG[seg] || ['—', C.muted, C.fundo];
    doc.font('S').fontSize(8);
    const w = doc.widthOfString(s[0]) + 14;
    doc.roundedRect(x, yy, w, 15, 7.5).fill(s[2]);
    doc.fillColor(s[1]).text(s[0], x + 7, yy + 3.6, { lineBreak: false });
    return w;
  };
  const paragrafo = (t, opts = {}) => doc.font(opts.font || 'R').fontSize(opts.size || 10.5).fillColor(opts.cor || C.texto).text(t, M, doc.y, { width: LW, lineGap: 3, ...opts });

  // ------------------------------------------------------------ sumário executivo
  novaPagina();
  cabeca('Sumário executivo', 'O que encontramos');
  const narrativa = agente && agente.resumo ? agente.resumo :
    `A partir do regime tributário (${cliente.taxRegime || 'não informado'}) e do perfil operacional de ${cliente.legalName}, o Reversa cruzou o catálogo de 60 teses e identificou ${tot.teses} oportunidades aplicáveis (${tot.provavel} prováveis e ${tot.teses - tot.provavel} a confirmar com informações adicionais). ` +
    `${tot.verde} delas estão pacificadas ou consolidadas e podem ser conduzidas com alta segurança jurídica.` +
    (valorMotor ? ` O cálculo já realizado pelo motor sobre a EFD-Contribuições identifica ${reais(valorMotor)} em créditos no prazo, pendentes de revisão técnica.` : ' O próximo passo é dimensionar os valores com os arquivos fiscais da empresa.');
  paragrafo(narrativa, { size: 11.5 });
  doc.moveDown(1);
  // KPIs
  const kp = [[tot.teses, 'Teses aplicáveis'], [tot.provavel, 'Prováveis'], [tot.verde, 'Alta segurança'], [valorMotor ? reaisCurto(valorMotor) : 'A calcular', 'Valor do motor']];
  const kw = (LW - 30) / 4; y = doc.y;
  kp.forEach(([v, r], i) => {
    const x = M + i * (kw + 10);
    doc.roundedRect(x, y, kw, 70, 8).fill(i === 0 ? C.navy : C.fundo);
    doc.font('B').fontSize(caber(String(v), 20, kw - 28)).fillColor(i === 0 ? C.tealClaro : C.navy).text(String(v), x + 14, y + 14, { width: kw - 28, lineBreak: false });
    doc.font('M').fontSize(9).fillColor(i === 0 ? '#C9D6E3' : C.muted).text(r.toUpperCase(), x + 14, y + 46, { width: kw - 28, characterSpacing: 0.6 });
  });
  doc.y = y + 92;
  // distribuição por segurança, por grupo
  doc.font('S').fontSize(12).fillColor(C.navy).text('Segurança jurídica por grupo', M, doc.y);
  doc.moveDown(0.5);
  const max = Math.max(1, ...grupos.map((g) => g.teses.length));
  grupos.forEach((g) => {
    y = doc.y; const n = { verde: 0, amarelo: 0, vermelho: 0 };
    g.teses.forEach((t) => { if (n[t.seguranca] != null) n[t.seguranca] += 1; });
    doc.font('M').fontSize(10).fillColor(C.texto).text(g.nome, M, y + 4, { width: 110 });
    let x = M + 115; const bwTot = LW - 115 - 70;
    ['verde', 'amarelo', 'vermelho'].forEach((s) => {
      const w = (n[s] / max) * bwTot; if (!w) return;
      doc.rect(x, y, w, 20).fill(SEG[s][1]);
      if (w > 18) doc.font('S').fontSize(9).fillColor('#FFFFFF').text(String(n[s]), x, y + 5.5, { width: w, align: 'center' });
      x += w;
    });
    doc.font('S').fontSize(10).fillColor(C.navy).text(`${g.teses.length} teses`, x + 8, y + 4);
    doc.y = y + 30;
  });
  y = doc.y + 2; let lx = M + 115;
  ['verde', 'amarelo', 'vermelho'].forEach((s) => {
    doc.rect(lx, y + 2, 9, 9).fill(SEG[s][1]);
    doc.font('R').fontSize(9).fillColor(C.muted).text(`Segurança ${SEG[s][0].toLowerCase()}`, lx + 13, y + 1, { lineBreak: false });
    lx += 110;
  });
  doc.y = y + 28;

  // prioridades
  const prio = prioridades(grupos, agente);
  if (prio.length) {
    espaco(120);
    doc.font('S').fontSize(12).fillColor(C.navy).text('Prioridades recomendadas', M, doc.y);
    doc.moveDown(0.5);
    prio.forEach((t, i) => {
      espaco(58);
      y = doc.y;
      doc.circle(M + 11, y + 11, 11).fill(C.teal);
      doc.font('B').fontSize(10).fillColor('#FFFFFF').text(String(i + 1), M, y + 5.5, { width: 22, align: 'center' });
      doc.font('S').fontSize(11).fillColor(C.navy).text(t.nome, M + 32, y + 2, { width: LW - 32 - 70 });
      const yAfter = doc.y;
      selo(t.seguranca, W - M - 50, y + 2);
      doc.font('R').fontSize(9).fillColor(C.muted).text(`${t.grupo} · ${t.estado === 'provavel' ? 'aplicação provável' : 'a confirmar'}${t.maturidade ? ' · ' + t.maturidade : ''}`, M + 32, yAfter + 1, { width: LW - 32 });
      if (t.motivo) doc.font('R').fontSize(9.5).fillColor(C.texto).text(t.motivo, M + 32, doc.y + 2, { width: LW - 32, lineGap: 1.5 });
      doc.y += 10;
    });
  }

  // ------------------------------------------------------------ teses por grupo
  grupos.forEach((g) => {
    novaPagina();
    cabeca(g.id === 'prev' ? 'Previdenciário · folha de pagamento' : 'Fiscal · faturamento e operações', `Teses ${g.nome === 'Fiscal' ? 'fiscais' : 'previdenciárias'} aplicáveis`);
    if (g.id === 'prev') paragrafo('Contribuições sobre a folha seguem rito próprio: apuração e compensação pela DCTFWeb/eSocial (Lei 11.457/2007, art. 26-A), rubrica a rubrica. Decisões desfavoráveis recentes (STF Tema 985; STJ Tema 1.079) foram consideradas na classificação de segurança.', { size: 9.5, cor: C.muted });
    else paragrafo('Oportunidades oriundas do faturamento e das políticas tributárias sobre ele: PIS/COFINS, ICMS, IPI, IRPJ/CSLL e tributos indiretos.', { size: 9.5, cor: C.muted });
    doc.moveDown(0.6);
    if (!g.teses.length) { paragrafo('Nenhuma tese aplicável com o perfil atual.'); return; }
    const orden = ordenar(g.teses);
    const fortes = orden.filter((t) => t.estado === 'provavel' && t.seguranca !== 'vermelho');
    const confirmar = orden.filter((t) => t.estado !== 'provavel' && t.seguranca !== 'vermelho');
    const fracas = orden.filter((t) => t.seguranca === 'vermelho');
    const subtitulo = (t, n) => { espaco(60); doc.moveDown(0.4); doc.font('S').fontSize(12).fillColor(C.navy).text(`${t}  `, M, doc.y, { continued: true }).font('R').fontSize(10).fillColor(C.muted).text(`${n} tese${n === 1 ? '' : 's'}`); doc.moveDown(0.4); };
    if (fortes.length) {
      subtitulo('Oportunidades com aplicação provável', fortes.length);
      fortes.forEach((t) => {
        const base = t.base ? `Base legal: ${t.base}` : '';
        const origem = t.origem ? `Origem: ${t.origem}` : '';
        doc.font('R').fontSize(8.8);
        const hTxt = doc.heightOfString([base, origem].filter(Boolean).join('\n'), { width: LW - 24, lineGap: 1.5 });
        espaco(46 + hTxt);
        y = doc.y;
        doc.rect(M, y, 3, 30 + hTxt).fill(SEG[t.seguranca] ? SEG[t.seguranca][1] : C.linha);
        doc.font('S').fontSize(10.5).fillColor(C.navy).text(`${t.id}  ${t.nome}`, M + 12, y, { width: LW - 12 - 70 });
        const y2 = doc.y;
        selo(t.seguranca, W - M - 50, y);
        doc.font('M').fontSize(8.8).fillColor(C.teal).text(t.maturidade || '', M + 12, y2 + 1, { width: LW - 12 });
        doc.font('R').fontSize(8.8).fillColor(C.muted).text([base, origem].filter(Boolean).join('\n'), M + 12, doc.y + 2, { width: LW - 24, lineGap: 1.5 });
        doc.y += 12;
      });
    }
    const compacta = (lista, coluna2) => {
      lista.forEach((t, i) => {
        doc.font('R').fontSize(8.8);
        const c2 = coluna2(t);
        const h = Math.max(doc.heightOfString(`${t.id}  ${t.nome}`, { width: 250 }), doc.heightOfString(c2, { width: LW - 330 })) + 10;
        espaco(h + 4); y = doc.y;
        if (i % 2 === 0) doc.rect(M, y, LW, h).fill(C.fundo);
        doc.font('M').fontSize(8.8).fillColor(C.texto).text(`${t.id}  ${t.nome}`, M + 8, y + 5, { width: 250 });
        doc.font('R').fontSize(8.5).fillColor(C.muted).text(c2, M + 268, y + 5, { width: LW - 330 });
        selo(t.seguranca, W - M - 52, y + (h - 15) / 2);
        doc.y = y + h;
      });
    };
    if (confirmar.length) {
      subtitulo('A confirmar com o cliente', confirmar.length);
      compacta(confirmar, (t) => `Confirmar: ${(t.faltam || []).join(', ') || 'dados operacionais'}${t.maturidade ? '. ' + t.maturidade : ''}`);
    }
    if (fracas.length) {
      subtitulo('Não recomendadas como recuperáveis', fracas.length);
      compacta(fracas, (t) => t.maturidade || 'Baixa segurança jurídica');
    }
  });

  // ------------------------------------------------------------ resultado do motor
  if (motor.length) {
    novaPagina();
    cabeca('Cálculo', 'Resultado do motor Reversa');
    paragrafo(`Cálculo sobre a EFD-Contribuições${motor[0].periodo ? ' do período ' + motor[0].periodo : ''}. Valores sem correção pela Selic e pendentes de revisão e aprovação humana; não constituem crédito reconhecido.`, { size: 9.5, cor: C.muted });
    doc.moveDown(0.8);
    y = doc.y;
    doc.rect(M, y, LW, 22).fill(C.navy);
    doc.font('S').fontSize(8.5).fillColor('#FFFFFF');
    doc.text('TESE', M + 10, y + 7); doc.text('NATUREZA', M + 260, y + 7); doc.text('REVISÃO', M + 370, y + 7); doc.text('NO PRAZO', M + 400, y + 7, { width: LW - 410, align: 'right' });
    doc.y = y + 22;
    motor.forEach((m, i) => {
      espaco(26); y = doc.y;
      if (i % 2) doc.rect(M, y, LW, 24).fill(C.fundo);
      doc.font('M').fontSize(9.5).fillColor(C.texto).text(m.nome, M + 10, y + 7, { width: 240, lineBreak: false, ellipsis: true });
      doc.font('R').fontSize(9).fillColor(C.muted).text(NATUREZA[m.natureza] || m.natureza, M + 260, y + 7, { lineBreak: false });
      doc.text(m.revisao === 'approved' ? 'Aprovada' : 'Pendente', M + 370, y + 7, { lineBreak: false });
      doc.font('S').fontSize(9.5).fillColor(C.navy).text(reais(m.natureza === 'risco' ? m.total : m.noPrazo), M + 400, y + 7, { width: LW - 410, align: 'right' });
      doc.y = y + 24;
    });
    y = doc.y + 4;
    doc.rect(M, y, LW, 28).fill(C.teal);
    doc.font('B').fontSize(10.5).fillColor('#FFFFFF').text('Créditos no prazo (a revisar)', M + 10, y + 8.5);
    doc.text(reais(valorMotor), M + 300, y + 8.5, { width: LW - 310, align: 'right' });
    doc.y = y + 40;
  }

  // ------------------------------------------------------------ próximos passos
  novaPagina();
  cabeca('Próximos passos', 'Como avançamos');
  const passos = (agente && agente.proximosPassos && agente.proximosPassos.length) ? agente.proximosPassos : [
    'Envio dos arquivos fiscais e da folha dos últimos 60 meses (lista abaixo).',
    'Cálculo pelo motor Reversa, item a item, com memória rastreável até a linha do SPED.',
    'Revisão técnica e jurídica de cada tese e definição da via (administrativa ou judicial).',
    'Apresentação do resultado consolidado e proposta de condução.'
  ];
  passos.forEach((p, i) => {
    espaco(40); y = doc.y;
    doc.roundedRect(M, y, 26, 26, 6).fill(C.navy);
    doc.font('B').fontSize(11).fillColor(C.tealClaro).text(String(i + 1), M, y + 7, { width: 26, align: 'center' });
    doc.font('M').fontSize(10.5).fillColor(C.texto).text(p, M + 38, y + 6, { width: LW - 38, lineGap: 2 });
    doc.y = Math.max(doc.y, y + 26) + 10;
  });
  const docs = [...new Set(prio.concat(ordenar(todas).filter((t) => t.estado === 'provavel')).flatMap((t) => t.docs || []))].slice(0, 10);
  if (docs.length) {
    espaco(80); doc.moveDown(0.6);
    doc.font('S').fontSize(12).fillColor(C.navy).text('Documentos necessários', M, doc.y);
    doc.moveDown(0.4);
    docs.forEach((d) => { espaco(18); doc.font('R').fontSize(10).fillColor(C.texto).text(`•  ${d}`, M + 6, doc.y, { width: LW - 6, lineGap: 2 }); });
  }
  if (agente && agente.perguntas && agente.perguntas.length) {
    espaco(80); doc.moveDown(0.8);
    doc.font('S').fontSize(12).fillColor(C.navy).text('Pontos para alinhar', M, doc.y);
    doc.moveDown(0.4);
    agente.perguntas.forEach((p) => { espaco(18); doc.font('R').fontSize(10).fillColor(C.texto).text(`•  ${p}`, M + 6, doc.y, { width: LW - 6, lineGap: 2 }); });
  }
  espaco(130); doc.moveDown(1.2);
  y = doc.y;
  doc.roundedRect(M, y, LW, 104, 8).fill(C.fundo);
  doc.font('S').fontSize(10).fillColor(C.navy).text('Metodologia e ressalvas', M + 16, y + 14);
  doc.font('R').fontSize(8.8).fillColor(C.muted).text(
    'O diagnóstico cruza o regime tributário e o perfil operacional da empresa com o catálogo de teses do Reversa, classificadas por segurança jurídica (alta, média, baixa) e maturidade (pacificada, consolidada, operacional, em disputa, desfavorável), com base legal e precedentes conferidos em fontes oficiais. ' +
    'Trata-se de diagnóstico preliminar: indica onde há oportunidade, sem reconhecer crédito. Valores dependem de cálculo sobre os arquivos fiscais, documentação de suporte e revisão humana. Teses de baixa segurança não são oferecidas como recuperáveis.',
    M + 16, y + 32, { width: LW - 32, lineGap: 2 });

  // ------------------------------------------------------------ rodapés
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.rect(0, 0, W, 6).fill(C.navy);
    doc.moveTo(M, H - 44).lineTo(W - M, H - 44).lineWidth(0.5).strokeColor(C.linha).stroke();
    doc.font('S').fontSize(8).fillColor(C.navy).text('REVERSA TAX', M, H - 34, { characterSpacing: 1, lineBreak: false });
    doc.font('R').fontSize(8).fillColor(C.muted).text(`Diagnóstico preliminar · ${cliente.legalName}`, M + 70, H - 34, { width: LW - 140, lineBreak: false, ellipsis: true });
    doc.text(`${i + 1} / ${range.count}`, W - M - 60, H - 34, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = mb;
  }
  doc.end();
  return fim;
}

module.exports = { gerar, prioridades };
