// Junta as extracoes brutas da NT 2026.001 e confere cobertura e divergencias. Uso: node scripts/junta-nt2026.js
const fs=require('fs'),path=require('path'),D='lib/sped/leiautes/_extraidos/';
const norm=c=>({pos:c.pos??c.n,nome:c.nome??c.campo,tipo:c.tipo,tam:c.tam??c.tamanho??null,dec:c.dec??c.decimais??null,obrig:c.obrig??c.obrigatoriedade??null});
const reg={},inc=new Set(),dup=[];
for(const f of ['nt2026-001-offset100000.json','nt2026-001-offset200000.json','nt2026-001-offset300000.json']){
  const j=JSON.parse(fs.readFileSync(D+f,'utf8'));
  for(const[k,v]of Object.entries(j.registros||{})){v.campos=(v.campos||[]).map(norm);if(reg[k]){dup.push(k);if(JSON.stringify(reg[k].campos)!==JSON.stringify(v.campos))console.log('DUPLICADO DIVERGENTE',k)}else reg[k]=v}
  (j.incompletos||[]).forEach(x=>inc.add(String(x).slice(0,60)));
}
const est=JSON.parse(fs.readFileSync(D+'nt2026-001-estrutura.json','utf8')).registros.map(r=>r.reg);
const faltam=est.filter(r=>!reg[r]),sobram=Object.keys(reg).filter(r=>!est.includes(r));
console.log(`estrutura: ${est.length} registros | com campos: ${Object.keys(reg).length} | duplicados: ${dup.join(',')||'-'}`);
console.log('faltam campos para:',faltam.join(' '));console.log('fora da estrutura:',sobram.join(' ')||'-');
// consistencia interna: posicoes sequenciais e REG fixo
let problemas=[];for(const[k,v]of Object.entries(reg)){const c=v.campos||[];c.forEach((x,i)=>{if(x.pos!==i+1)problemas.push(`${k}: pos ${x.pos} no indice ${i+1}`)});if(c[0]&&c[0].nome!=='REG')problemas.push(`${k}: 1o campo ${c[0].nome}`)}
console.log('inconsistencias de posicao:',problemas.length,problemas.slice(0,15));
// confronto com motor-efd-icms
const s=fs.readFileSync('motor-efd-icms.js','utf8');const m=/var LEIAUTE = \{/.exec(s);let i=m.index+m[0].length-1,d=0,j=i;for(;j<s.length;j++){if(s[j]=='{')d++;if(s[j]=='}'){d--;if(!d)break}}
const L=require('vm').runInNewContext('('+s.slice(i,j+1)+')');let ok=0,dif=[];
for(const[k,arr]of Object.entries(L)){const c=reg[k];if(!c){dif.push(`${k}: sem dados na NT`);continue}const n=c.campos.map(x=>x.nome);if(n.length!==arr.length)dif.push(`${k}: Reversa ${arr.length} campos x NT ${n.length}`);arr.forEach((nm,x)=>{if(n[x]===nm)ok++;else dif.push(`${k}[${x+1}] Reversa=${nm} NT=${n[x]||'-'}`)})}
console.log(`confronto motor-efd-icms: ${ok} campos batem, ${dif.length} divergencias`);dif.forEach(x=>console.log('  ',x));
fs.writeFileSync('lib/sped/leiautes/efd_icms_ipi.nt2026-001.json',JSON.stringify({leiaute:'efd_icms_ipi',versao_leiaute:'021 (vigencia 2027-01-01)',origem:'NT 2026.001 v1.0 - extracao via WebFetch por agentes',validacao:'[VALIDAR] contra o PDF oficial; obrigatoriedade ausente; nomes com acentos/espacos a normalizar',registros:reg},null,1));
