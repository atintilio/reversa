// Gera lib/sped/leiautes/efd_icms_ipi.json: Guia 3.2.4 (oficial, vigente 2026) com nomes truncados reparados pela NT 2026.001 quando for prefixo unico.
const fs=require('fs');const D='lib/sped/leiautes/';
const G=JSON.parse(fs.readFileSync(D+'efd_icms_ipi.guia-3.2.4.json','utf8')),N=JSON.parse(fs.readFileSync(D+'efd_icms_ipi.nt2026-001.json','utf8')).registros;
let reparados=0,pendentes=[];const out={};
for(const[k,v]of Object.entries(G.registros)){
  const nt=N[k]?N[k].campos:[];
  const campos=v.campos.map(c=>{let nome=c.nome;const n=nt.find(x=>x.pos===c.pos&&x.nome&&x.nome.replace(/[ç]/gi,'c')!==nome);
    if(n&&n.nome.startsWith(nome)&&n.nome.length>nome.length){nome=n.nome;reparados++}
    else if(n&&n.nome.replace(/\s*\(.*\)/,'')===nome){/* rotulo de PIS/COFINS */}
    return {...c,nome:nome.replace(/\s+/g,'')}});
  const pos=campos.map(c=>c.pos),faltam=[];for(let i=1;i<=Math.max(...pos);i++)if(!pos.includes(i))faltam.push(i);
  if(faltam.length)pendentes.push(`${k}:${faltam}`);
  out[k]={titulo:v.titulo,campos,posicoes_faltantes:faltam,completo:!faltam.length&&campos[0]&&campos[0].nome==='REG'};
}
// registros sem tabela no Guia (cortados) -> marca
for(const k of Object.keys(N))if(!out[k])out[k]={titulo:N[k].titulo,campos:[],completo:false,origem:'so na NT 021 (2027)'};
fs.writeFileSync(D+'efd_icms_ipi.json',JSON.stringify({leiaute:'efd_icms_ipi',fonte:'Guia Pratico EFD ICMS/IPI v3.2.4 (30/07/2026) - texto extraido por script (pdftotext), sem IA',nomes:'reparados com a NT 2026.001 quando truncados pela quebra de linha do PDF',validacao:'[VALIDAR] os registros com completo=false',registros:out},null,1));
const tot=Object.values(out);console.log(`registros: ${tot.length} | completos: ${tot.filter(x=>x.completo).length} | nomes reparados: ${reparados}\npendentes: ${pendentes.join(' ')}`);
