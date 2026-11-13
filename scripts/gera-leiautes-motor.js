// Gera os leiautes que os motores carregam, a partir dos catálogos oficiais.
//
// Cadeia de verdade: PDF oficial -> catálogo JSON (lib/sped/leiautes/*.json) -> este script
// -> leiaute do motor (lib/sped/leiautes/leiaute-*.js). O teste tests/paridade-leiautes.test.js
// refaz esta geração e compara: se o arquivo do motor divergir do catálogo, o teste falha.
//
// Uso: node scripts/gera-leiautes-motor.js [--check]
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'lib', 'sped', 'leiautes');

// Registros que cada motor usa (a lista vem do motor; se o motor ler outro registro, acrescentar aqui).
const CONTRIB = ['0000', '0110', '0111', 'M105', 'M505', '0140', '0200', 'C010', 'C100', 'C170', 'C180', 'C181', 'C185',
  'M100', 'M500', 'F010', 'F100', 'F120', 'F130', 'F150', 'M200', 'M210', 'M600', 'M610', '9999'];
const ICMS = ['0000', '0150', '0200', 'C100', 'C170', 'C190', 'C197', 'E100', 'E110', 'E111', 'E116', 'H010'];

// Tradução: nome interno usado pelo motor -> nome oficial do catálogo.
// Só o NOME DA CHAVE muda; a posição (índice) é a do catálogo. O que o motor grava na saída
// não muda: o nome interno continua sendo o da chave, para não quebrar a API do Reversa.
const TRADUCAO = {
  '0000': { NUM_REC_ANT: 'NUM_REC_ANTERIOR' },
  'C181': { CST: 'CST_PIS', VL_BC: 'VL_BC_PIS', ALIQ: 'ALIQ_PIS', VL_TRIB: 'VL_PIS' },
  'C185': { CST: 'CST_COFINS', VL_BC: 'VL_BC_COFINS', ALIQ: 'ALIQ_COFINS', VL_TRIB: 'VL_COFINS' },
  'M210': { ALIQ: 'ALIQ_PIS', QUANT_BC: 'QUANT_BC_PIS', ALIQ_QUANT: 'ALIQ_PIS_QUANT', VL_AJUS_ACRES_BC: 'VL_AJUS_ACRES_BC_PIS', VL_AJUS_REDUC_BC: 'VL_AJUS_REDUC_BC_PIS' },
  'M610': { ALIQ: 'ALIQ_COFINS', QUANT_BC: 'QUANT_BC_COFINS', ALIQ_QUANT: 'ALIQ_COFINS_QUANT', VL_AJUS_ACRES_BC: 'VL_AJUS_ACRES_BC_COFINS', VL_AJUS_REDUC_BC: 'VL_AJUS_REDUC_BC_COFINS' }
};

/** Nome de campo utilizável como chave: sem pontuação e sem o resto da descrição entre parênteses. */
function limpa(nome) {
  return String(nome || '').replace(/\(.*$/, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
}

// No leiaute oficial o mesmo nome aparece em dois campos (C170: ALIQ_PIS na alíquota percentual
// e na alíquota em reais). O motor precisa distinguir os dois; o nome interno é o do motor.
const ICMS_NOMES = {
  'C170': { 27: 'ALIQ_PIS_PERC', 29: 'ALIQ_PIS_REAIS', 33: 'ALIQ_COFINS_PERC', 35: 'ALIQ_COFINS_REAIS' }
};

/** Inverso da tradução: nome oficial -> nome interno do motor. */
function interno(reg, oficial) {
  const t = TRADUCAO[reg] || {};
  for (const k of Object.keys(t)) if (t[k] === oficial) return k;
  return oficial;
}

function umd(nomeGlobal, corpo) {
  return `/* Arquivo gerado por scripts/gera-leiautes-motor.js -- NAO EDITAR A MAO.
 * Fonte: lib/sped/leiautes/${'${FONTE}'}.json (catalogo oficial extraido do PDF da RFB).
 * Para mudar: mexa no catalogo (ou no PDF de origem) e rode o script de novo.
 */
(function (root) {
  'use strict';
  var dados = ${corpo};
  if (typeof module !== 'undefined' && module.exports) module.exports = dados;
  else root.${nomeGlobal} = dados;
})(typeof window !== 'undefined' ? window : this);
`;
}

function geraContrib(cat) {
  const registros = {};
  const avisos = [];
  for (const reg of CONTRIB) {
    const r = cat.registros[reg];
    if (!r) { avisos.push('registro ausente no catalogo: ' + reg); continue; }
    const mapa = {};
    const repetidos = [];
    for (const c of r.campos) {
      const oficial = limpa(c.nome);
      if (!oficial || oficial === 'REG') continue;
      const nome = interno(reg, oficial);
      if (mapa[nome] !== undefined) { repetidos.push(nome + ' (' + c.pos + ')'); continue; }
      mapa[nome] = c.pos - 1; // indice 0-based: posicao 1 = REG
    }
    registros[reg] = mapa;
    if (repetidos.length) avisos.push(reg + ': nomes repetidos (mantido o primeiro) -> ' + repetidos.join(', '));
  }
  return { registros, avisos };
}

function geraIcms(cat) {
  const registros = {};
  const avisos = [];
  for (const reg of ICMS) {
    const r = cat.registros[reg];
    if (!r) { avisos.push('registro ausente no catalogo: ' + reg); continue; }
    const porPos = (ICMS_NOMES[reg] || {});
    registros[reg] = r.campos.map((c) => porPos[c.pos] || limpa(c.nome) || ('CAMPO_' + c.pos));
    const vistos = {};
    r.campos.forEach((c) => {
      const n = limpa(c.nome);
      if (!n) return;
      vistos[n] = (vistos[n] || 0) + 1;
    });
    Object.keys(vistos).filter((n) => vistos[n] > 1).forEach((n) => avisos.push(reg + ': nome oficial repetido (' + n + ' x' + vistos[n] + ')'));
  }
  return { registros, avisos };
}

function escreve(nomeArquivo, nomeGlobal, dados, fonte) {
  const conteudo = umd(nomeGlobal, JSON.stringify(dados, null, 1)).replace('${FONTE}', fonte);
  const arquivo = path.join(DIR, nomeArquivo);
  if (process.argv.includes('--check')) {
    const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
    if (atual !== conteudo) { console.log('DIVERGENTE: ' + nomeArquivo + ' (rode: node scripts/gera-leiautes-motor.js)'); return false; }
    console.log('ok: ' + nomeArquivo);
    return true;
  }
  fs.writeFileSync(arquivo, conteudo);
  console.log('gerado: ' + nomeArquivo + ' (' + conteudo.length + ' bytes)');
  return true;
}

const catContrib = JSON.parse(fs.readFileSync(path.join(DIR, 'efd_contribuicoes.json'), 'utf8'));
const catIcms = JSON.parse(fs.readFileSync(path.join(DIR, 'efd_icms_ipi.json'), 'utf8'));

const c = geraContrib(catContrib);
const i = geraIcms(catIcms);
const ok1 = escreve('leiaute-efd-contribuicoes.js', 'SPED_LEIAUTE_EFD_CONTRIBUICOES', c.registros, 'efd_contribuicoes');
const ok2 = escreve('leiaute-efd-icms-ipi.js', 'SPED_LEIAUTE_EFD_ICMS_IPI', i.registros, 'efd_icms_ipi');
if (process.argv.includes('--check') && !(ok1 && ok2)) process.exit(1);

console.log('avisos:');
(c.avisos.concat(i.avisos)).forEach((a) => console.log('  ' + a));
if (!c.avisos.length && !i.avisos.length) console.log('  (nenhum)');
