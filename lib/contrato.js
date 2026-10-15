// Contrato padrão de prestação de serviços tributários (minuta Reversa, base no modelo Nimbus).
// A Argus Prime figura sempre como CONTRATADA, identificada pelo nome fantasia e pelo CNPJ.
// O objeto não nomeia teses: diz apenas se o trabalho é fiscal/tributário, previdenciário ou ambos.
const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');
const path = require('node:path');

const VERSAO = 'padrao-2026.1';
const HONORARIOS = 25;
const CONTRATADA = {
  nome: 'Argus Prime',
  cnpj: '66279651000170',
  endereco: process.env.CONTRATADA_ENDERECO || 'Av. Liberdade, 1000, sala 1005',
  representante: process.env.CONTRATADA_REPRESENTANTE || 'André Carlos Tintilio',
  email: process.env.CONTRATADA_EMAIL || ''
};

const cnpjFmt = (c) => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const cpfFmt = (c) => String(c || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const extenso = { 25: 'vinte e cinco' };

// Natureza do objeto a partir das teses sem oposição.
function natureza(teses) {
  const prev = teses.some((t) => t.tax === 'Previdenciário'), fisc = teses.some((t) => t.tax !== 'Previdenciário');
  return prev && fisc ? 'ambos' : prev ? 'previdenciario' : 'fiscal';
}
function objetoTexto(nat) {
  const oport = nat === 'ambos' ? 'oportunidades de natureza fiscal/tributária e previdenciária'
    : nat === 'previdenciario' ? 'oportunidades de natureza previdenciária' : 'oportunidades de natureza fiscal/tributária';
  return `O presente contrato tem por objeto a prestação de serviços de consultoria tributária especializada pela CONTRATADA à CONTRATANTE, compreendendo o levantamento, a apuração, a quantificação e a implementação, pela via administrativa, de ${oport} identificadas no diagnóstico apresentado à CONTRATANTE, relativas aos últimos 5 (cinco) anos.`;
}

// Cláusulas: [título, [parágrafos]]. O conteúdo segue a minuta de referência, sem a cláusula de uso de marca.
function clausulas(s, nat) {
  const h = s.contract && s.contract.fee || HONORARIOS;
  return [
    ['Objeto', [
      '1.1. ' + objetoTexto(nat),
      '1.2. O objeto descrito na Cláusula 1.1 é delimitado, em caráter indissociável, pelo Capítulo 3 (Limitação de responsabilidade), que integra a definição do que é e do que não é prestado por força deste contrato.',
      '1.3. Os valores dos créditos decorrentes das oportunidades são corrigidos mensalmente, razão pela qual não são fixados neste instrumento e serão apurados e confirmados quando de sua utilização, após a validação documental, sem que as estimativas constantes do diagnóstico apresentado à CONTRATANTE constituam garantia de resultado, nos termos do Capítulo 3.']],
    ['Procedimento', [
      '2.1. A CONTRATANTE se compromete a disponibilizar os documentos, dados, acessos e informações necessários à execução dos trabalhos, designando interlocutor responsável pelo atendimento das demandas.',
      '2.2. A CONTRATADA se obriga a propor todas as medidas, conforme interesse da CONTRATANTE, que entender necessárias à consecução do objeto deste contrato, incluindo: (i) reuniões; (ii) análise de documentos; (iii) elaboração de cálculos do benefício fiscal; (iv) implementação do benefício fiscal pela via administrativa não contenciosa, incluindo retificação de obrigações acessórias e PER/DCOMP; e (v) acompanhamento e consultoria sobre a contabilização dos benefícios apurados.',
      '2.3. O prosseguimento do trabalho pela via administrativa é prerrogativa exclusiva da CONTRATANTE, a quem incumbe validar, de forma formal, expressa e por escrito, as premissas adotadas para a execução do serviço. A validação escrita das premissas é condição para o prosseguimento dos trabalhos e constitui o lastro das disposições do Capítulo 3, podendo ser formalizada por e-mail dos interlocutores designados.',
      '2.4. Uma vez reconhecidos os créditos na escrita fiscal da empresa, a transmissão das compensações (PER/DCOMP) caberá à CONTRATANTE, que informará a CONTRATADA em até 5 (cinco) dias úteis para fins de faturamento, sendo necessária a manutenção dos acessos ao e-CAC para consultas e validações pela CONTRATADA. Não havendo informação no prazo, a CONTRATADA poderá apurar a utilização diretamente pelos acessos disponibilizados, que deverão ser mantidos pela CONTRATANTE por todo o período de vigência do contrato, presumindo-se utilizados os créditos assim identificados.',
      '2.5. Caso as transmissões sejam realizadas pela CONTRATADA, a transmissão constitui mero ato material praticado por conta e ordem da CONTRATANTE, sobre premissas por esta validadas por escrito.',
      '2.6. Na qualidade de consultoria técnico-tributária, o resultado dos trabalhos da CONTRATADA refletirá sua convicção sobre a melhor interpretação e aplicação da legislação vigente até a data da apresentação das conclusões referentes à matéria.',
      '2.7. O escopo deste contrato não abrange atividades gerenciais ou a tomada de decisões em nome da CONTRATANTE, que está ciente de que a interpretação de textos legais, sobretudo na área tributária, está sempre sujeita à possibilidade de entendimentos diversos por parte das autoridades competentes, sem que tal divergência interpretativa configure erro, falha técnica ou inadimplemento da CONTRATADA.',
      '2.8. As análises realizadas pela CONTRATADA se darão com base, exclusivamente, nos documentos, informações e dados apresentados pela CONTRATANTE, que serão tomados como verídicos, precisos e completos.']],
    ['Limitação de responsabilidade', [
      '3.1. Os trabalhos objeto deste contrato não constituem exame ou auditoria realizada em revisão limitada em conformidade com as normas de auditoria, tampouco exame dos controles internos de acordo com essas normas.',
      '3.2. Como boa prática de gestão tributária, recomenda-se que a CONTRATANTE realize uma revisão dos trabalhos apresentados antes de eventual encaminhamento ao Fisco, não podendo a CONTRATADA ser penalizada por eventual inconsistência nas informações prestadas.',
      '3.3. A CONTRATADA atua na elaboração de estudos e recomendações tributárias, cabendo à administração da CONTRATANTE a decisão sobre sua implementação, sem que a CONTRATADA possa ser responsabilizada por escolhas estratégicas adotadas pela gestão.',
      '3.4. As PARTES reconhecem que (a) a atividade objeto deste contrato demanda padrão de diligência na sua execução, sem vinculá-la a resultado certo e determinado, sendo o conteúdo obrigacional da CONTRATADA obrigação de meio, que não guarda relação com obrigação de garantia ou de eliminação do risco de questionamentos ou autuações por parte do poder público; e (b) a fidedignidade dos documentos apresentados é de exclusiva responsabilidade da administração da CONTRATANTE.',
      '3.5. O relatório final será elaborado a partir da experiência profissional da CONTRATADA e não deve ser considerado opinião legal, recomendando-se que a CONTRATANTE consulte seus advogados quanto aos assuntos abordados.',
      '3.6. Os relatórios e demais conteúdos apresentados em razão do presente contrato destinam-se exclusivamente ao uso interno da CONTRATANTE, vedada a divulgação a terceiros sem prévio consentimento escrito da CONTRATADA, ressalvados os advogados da CONTRATANTE e as hipóteses de ordem judicial.',
      '3.7. Não estão contidas nas obrigações da CONTRATADA eventuais erros ou inconsistências advindos de registros pretéritos ou de informações gerais prestadas pela administração da CONTRATANTE.']],
    ['Confidencialidade', [
      '4.1. Compreende-se, na definição de "Informações Confidenciais", qualquer dado, metodologia, documentação e informação, de natureza técnica, administrativa, comercial, jurídica, estratégica ou diversa, revelada a qualquer momento pelas PARTES, que serão tratadas em caráter de absoluto sigilo.',
      '4.2. As PARTES obrigam-se, por si e seus sócios, empregados, prepostos, representantes ou profissionais contratados, a manter sigilo sobre os dados, informações e documentos de que tenham conhecimento em razão do presente contrato.',
      '4.3. Excetuam-se do dever de sigilo as informações: (i) de domínio público sem descumprimento deste contrato; (ii) obtidas de terceiros não sujeitos a obrigação de sigilo; (iii) já conhecidas ou geradas de forma independente; (iv) necessárias para fazer valer direitos previstos neste contrato; e (v) cuja divulgação seja exigida por lei, inclusive as comunicações ao COAF de que trata o Capítulo 12.',
      '4.4. As obrigações de confidencialidade perdurarão durante toda a vigência da contratação e pelos 5 (cinco) anos seguintes ao seu encerramento.']],
    ['Honorários sobre o proveito econômico', [
      `5.1. A CONTRATANTE pagará à CONTRATADA, a título de honorários, ${h}% (${extenso[h] || h + ' por cento'} por cento) sobre o proveito econômico, quanto aos créditos relativos aos últimos 5 (cinco) anos.`.replace(' por cento por cento', ' por cento'),
      '5.2. Entende-se por proveito econômico toda e qualquer vantagem econômica decorrente dos trabalhos desenvolvidos, incluindo, sem limitação: (i) redução de tributos correntes ou futuros; (ii) reconhecimento e utilização de créditos tributários; (iii) compensações, restituições ou ressarcimentos; (iv) liquidação de obrigações mediante utilização de créditos; (v) monetização, cessão ou qualquer outra forma de aproveitamento econômico dos créditos; e (vi) redução de passivos tributários.',
      '5.3. O período de apuração do proveito econômico compreenderá os últimos 5 (cinco) anos contados retroativamente da data de assinatura deste contrato, bem como os efeitos prospectivos decorrentes das oportunidades implementadas.',
      '5.4. Considera-se ocorrido o fato gerador dos honorários no momento da utilização do crédito ou da fruição do proveito econômico, assim entendida: (i) a compensação mediante dedução nas apurações correntes; e/ou (ii) a formalização da compensação por meio da transmissão de PER/DCOMP ou instrumento equivalente.',
      '5.5. Os honorários serão exigíveis à medida em que os créditos forem sendo utilizados. Caso a CONTRATANTE deixe de utilizar os créditos reconhecidos por período superior a 6 (seis) meses consecutivos, ficará obrigada ao pagamento integral dos honorários relativos aos créditos já reconhecidos, os quais poderão ser quitados em 6 (seis) parcelas mensais, iguais e sucessivas.',
      '5.6. A eventual não utilização dos créditos por liberalidade, estratégia financeira ou qualquer outra razão alheia à CONTRATADA não afastará o direito à percepção integral dos honorários.',
      '5.7. A base de cálculo dos honorários corresponderá ao valor bruto do proveito econômico identificado, não sendo passível de redução por contingências, riscos, glosas ou eventos supervenientes.',
      '5.8. Os honorários não incluem os tributos incidentes sobre a prestação de serviços, os quais serão acrescidos ao valor faturado conforme a legislação vigente, inclusive o IBS e a CBS durante o período de transição da Emenda Constitucional nº 132/2023.',
      '5.9. O atraso no pagamento dos honorários acarretará correção monetária pelo IPCA-IBGE, multa de mora de 2% (dois por cento) e juros de 1% (um por cento) ao mês.',
      '5.10. Os honorários serão devidos conforme o proveito econômico apurado, seja em razão de procedimentos realizados pela CONTRATADA, pela CONTRATANTE ou por terceiros, inclusive na hipótese de aproveitamento, direto ou indireto, de oportunidade identificada ou quantificada pela CONTRATADA, e permanecem exigíveis pelo prazo de 24 (vinte e quatro) meses contados da extinção deste contrato.',
      '5.11. Outras oportunidades alheias ao objeto deste contrato poderão ser aproveitadas mediante prévia e expressa autorização da CONTRATANTE, formalizada por aditivo escrito.']],
    ['Prazo e vigência', [
      '6.1. O presente contrato vigorará por prazo indeterminado, podendo ser revogado mediante notificação com 30 (trinta) dias de antecedência, sendo devidos os honorários dos trabalhos realizados.',
      '6.2. Sobrevivem ao término deste contrato: (i) o direito da CONTRATADA aos honorários relativos a créditos ou oportunidades identificados, quantificados ou implementados durante a vigência; (ii) as obrigações de confidencialidade; (iii) as disposições de propriedade intelectual; (iv) a vedação de aliciamento; e (v) as limitações de responsabilidade.']],
    ['Despesas e custas', ['7.1. A CONTRATANTE obriga-se ao recolhimento de eventuais taxas e custas devidas ao poder público, assim como de despesas essenciais à execução dos serviços, desde que com prévia e expressa autorização.']],
    ['Propriedade intelectual', [
      '8.1. A metodologia, os modelos, as planilhas, os papéis de trabalho, os sistemas, os algoritmos, as bases de conhecimento e as teses tributárias empregados ou desenvolvidos pela CONTRATADA são de sua exclusiva titularidade.',
      '8.2. A CONTRATANTE recebe, quanto aos entregáveis, licença de uso interno, não exclusiva e intransferível, ressalvado o uso perante as autoridades fiscais para a finalidade própria dos trabalhos.']],
    ['Responsabilidade trabalhista e não aliciamento', [
      '9.1. Os profissionais que participarem deste projeto não manterão com a CONTRATANTE qualquer vínculo trabalhista.',
      '9.2. Fica vedada a contratação, pela CONTRATANTE, de profissionais envolvidos diretamente neste projeto durante a vigência contratual e até 2 (dois) anos após a sua conclusão, salvo acordo entre as PARTES.']],
    ['Lei anticorrupção', ['10.1. As PARTES declaram conhecer e cumprir a Lei nº 12.846/2013 e o Decreto nº 8.420/2015, comprometendo-se a conduzir suas práticas comerciais de maneira ética. Qualquer descumprimento ensejará a rescisão motivada imediata deste contrato.']],
    ['Proteção de dados pessoais (LGPD)', ['11.1. Cada PARTE será individualmente responsável pelo cumprimento da Lei nº 13.709/2018. Os dados da CONTRATANTE serão utilizados apenas para a finalidade deste contrato, coletados na medida do necessário, não repassados a terceiros estranhos ao projeto e eliminados após o prazo prescricional, ressalvadas as hipóteses de guarda obrigatória.']],
    ['Prevenção à lavagem de dinheiro', ['12.1. A CONTRATANTE declara-se ciente das Leis nº 9.613/1998 e nº 12.683/2012 e das obrigações de comunicação ao COAF a que está sujeita a CONTRATADA, comunicações essas que não constituem violação ao dever de sigilo.']],
    ['Resolução', ['13.1. Esta contratação poderá ser resolvida de pleno direito, mediante comunicação escrita, nos casos de: (a) inadimplemento não sanado em 10 (dez) dias úteis após comunicação formal; (b) liquidação; (c) recuperação judicial ou extrajudicial ou falência; (d) inexequibilidade do objeto por norma superveniente; e (e) caso fortuito ou força maior (art. 393 do Código Civil), sem prejuízo dos honorários devidos pelos trabalhos já realizados.']],
    ['Disposições finais', [
      '14.1. A presente contratação substitui quaisquer entendimentos anteriores com respeito aos mesmos serviços, e qualquer alteração deverá ser acordada em instrumento aditivo.',
      '14.2. Os direitos e obrigações deste contrato não poderão ser cedidos sem o prévio e expresso consentimento escrito da outra parte.',
      '14.3. As notificações serão feitas por escrito, inclusive por correio eletrônico dirigido aos endereços informados pelas PARTES.',
      '14.4. A tolerância de qualquer das PARTES não constituirá novação, e a invalidade de qualquer cláusula não afetará as demais.']],
    ['Foro de eleição', ['15.1. As PARTES elegem o foro da Comarca de Florianópolis, Estado de Santa Catarina, para dirimir quaisquer controvérsias a respeito deste contrato.']],
    ['Assinatura eletrônica e aceite', [
      '16.1. As PARTES reconhecem que as assinaturas deste contrato são realizadas por meio eletrônico, admitindo-se, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, a validade de documentos assinados por meio não vinculado à ICP-Brasil, observados os parâmetros da Lei nº 14.063/2020.',
      '16.2. As PARTES, por estarem de pleno acordo, assinam este documento com dispensa de testemunhas, com fulcro na Lei nº 14.620/2023, sendo a assinatura da CONTRATANTE coletada com confirmação de e-mail por código, registro de data, hora e IP e impressão digital (SHA-256) do conteúdo aceito.']]
  ];
}

// Conteúdo completo, em ordem; usado na página, no PDF e no cálculo da impressão digital.
function montar(s, aceitas) {
  const teses = s.theses.filter((t) => aceitas.includes(t.id));
  const nat = natureza(teses);
  const contratante = `${String(s.taxpayer.name || '').toUpperCase()}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${cnpjFmt(s.taxpayer.cnpj)}, doravante denominada CONTRATANTE, representada na forma de seu contrato social.`;
  const c = s.contract && s.contract.contratada || CONTRATADA;
  const contratada = `${c.nome.toUpperCase()}, inscrita no CNPJ sob o nº ${cnpjFmt(c.cnpj)}${c.endereco ? ', com sede na ' + c.endereco : ''}, doravante denominada CONTRATADA${c.representante ? ', representada neste ato por ' + c.representante : ''}${c.email ? ', com endereço eletrônico ' + c.email : ''}.`;
  return { versao: s.contract && s.contract.model || VERSAO, natureza: nat, contratante, contratada, clausulas: clausulas(s, nat) };
}
function impressao(conteudo, assinatura) {
  return crypto.createHash('sha256').update(JSON.stringify({ conteudo, assinatura: assinatura || null })).digest('hex');
}

function pdf(conteudo, assinatura) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 64, right: 64 }, info: { Title: 'Contrato de Prestação de Serviços Tributários', Author: 'Argus Prime' } });
    const out = []; doc.on('data', (b) => out.push(b)); doc.on('end', () => resolve(Buffer.concat(out))); doc.on('error', reject);
    const W = doc.page.width - 128, verde = '#16736D', tinta = '#0E2239', muted = '#5C6672';
    try {
      const logo = path.join(__dirname, '..', 'assets', 'reversa-r.png');
      doc.image(logo, 64, 40, { height: 22 });
    } catch (e) { /* segue sem logo */ }
    doc.font('Helvetica-Bold').fontSize(14).fillColor(tinta).text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS TRIBUTÁRIOS', 64, 80, { width: W, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(muted).text('Instrumento particular · minuta ' + conteudo.versao, { width: W, align: 'center' });
    doc.moveDown(1.4);
    const par = (t, o = {}) => doc.font(o.b ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.s || 9.6).fillColor(o.c || tinta).text(t, { width: W, align: 'justify', lineGap: 2 }).moveDown(o.gap == null ? 0.5 : o.gap);
    par('CONTRATANTE', { b: true, gap: 0.1, c: verde }); par(conteudo.contratante);
    par('CONTRATADA', { b: true, gap: 0.1, c: verde }); par(conteudo.contratada, { gap: 1 });
    conteudo.clausulas.forEach(([titulo, ps], i) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      par(`${i + 1} · ${titulo.toUpperCase()}`, { b: true, c: verde, gap: 0.3 });
      ps.forEach((p) => par(p));
      doc.moveDown(0.4);
    });
    doc.addPage();
    par('REGISTRO DE ASSINATURA ELETRÔNICA', { b: true, c: verde, s: 11, gap: 0.8 });
    if (assinatura) {
      [['Contratante', conteudo.contratante.split(',')[0]], ['Assinado por', assinatura.nome], ['CPF', cpfFmt(assinatura.cpf)], ['Cargo', assinatura.cargo],
        ['E-mail confirmado por código', assinatura.email], ['Data e hora', new Date(assinatura.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (horário de Brasília)'],
        ['IP', assinatura.ip || '—'], ['Protocolo', assinatura.protocolo]].forEach(([k, v]) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text(k, { continued: true }).font('Helvetica').fillColor(tinta).text('  ' + v); doc.moveDown(0.3);
      });
      doc.moveDown(0.6);
      par('Impressão digital (SHA-256) do conteúdo aceito:', { b: true, s: 9, gap: 0.1 });
      doc.font('Courier').fontSize(8.5).fillColor(tinta).text(assinatura.hash, { width: W }); doc.moveDown(1);
      par('Contratada: ' + (conteudo.contratada.split(',')[0]) + ' · minuta emitida pela CONTRATADA pela plataforma Reversa Tax.', { s: 9, c: muted });
    } else par('Minuta para conferência. Este documento ainda não foi assinado.', { c: muted });
    doc.end();
  });
}

module.exports = { VERSAO, HONORARIOS, CONTRATADA, natureza, montar, impressao, pdf, cnpjFmt, cpfFmt };
