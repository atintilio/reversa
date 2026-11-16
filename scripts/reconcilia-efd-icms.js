// Gera lib/sped/leiautes/efd_icms_ipi.json: Guia 3.2.4 (oficial, vigente 2026) com nomes truncados reparados pela NT 2026.001 quando for prefixo unico.
const fs=require('fs');const D='lib/sped/leiautes/';
const G=JSON.parse(fs.readFileSync(D+'efd_icms_ipi.guia-3.2.4.json','utf8')),N=JSON.parse(fs.readFileSync(D+'efd_icms_ipi.nt2026-001.json','utf8')).registros;
const c=(pos,nome,tipo,tam=null,tam_fixo=false,dec=null,obrig_bruto='')=>({pos,nome,tipo,tam,tam_fixo,dec,obrig_bruto});
// Linhas conferidas diretamente nas tabelas do Guia 3.2.4; o pdftotext perdeu células mescladas e nomes em mais de uma linha.
const CORRECOES={
  B035:[c(2,'VL_CONT_P','N',null,false,2,'O')],
  C115:[c(5,'CPF_COL','N',11,true,null,'OC')],
  C165:[c(2,'COD_PART','C',60,false,null,'OC'),c(9,'PESO_BRT','N',null,false,2,'O'),c(10,'PESO_LIQ','N',null,false,2,'O')],
  C173:[c(3,'QTD_ITEM','N',null,false,3,'O O')],
  C180:[c(1,'REG','C',4,false,null,'O Não apresentar'),c(7,'VL_UNIT_BC_ICMS_ST_CONV','N',null,false,6,'O')],
  C181:[
    c(13,'VL_UNIT_ICMS_OP_ESTOQUE_CONV_SAIDA','N',null,false,6,'OC'),c(14,'VL_UNIT_ICMS_ST_ESTOQUE_CONV_SAIDA','N',null,false,6,'OC'),
    c(15,'VL_UNIT_FCP_ICMS_ST_ESTOQUE_CONV_SAIDA','N',null,false,6,'OC'),c(16,'VL_UNIT_ICMS_NA_OPERACAO_CONV_SAIDA','N',null,false,6,'OC'),
    c(17,'VL_UNIT_ICMS_OP_CONV_SAIDA','N',null,false,6,'OC'),c(18,'VL_UNIT_ICMS_ST_CONV_REST','N',null,false,6,'OC'),
    c(19,'VL_UNIT_FCP_ST_CONV_REST','N',null,false,6,'OC'),c(20,'VL_UNIT_ICMS_ST_CONV_COMPL','N',null,false,6,'OC'),c(21,'VL_UNIT_FCP_ST_CONV_COMPL','N',null,false,6,'OC')
  ],
  C185:[
    c(1,'REG','C',4,false,null,'Não apresentar O'),c(2,'NUM_ITEM','N',3,false,null,'O'),c(3,'COD_ITEM','C',60,false,null,'O'),c(4,'CST_ICMS','N',3,true,null,'O'),
    c(6,'COD_MOT_REST_COMPL','C',5,true,null,'O'),c(8,'UNID','C',6,false,null,'O'),c(9,'VL_UNIT_CONV','N',null,false,6,'O'),
    c(10,'VL_UNIT_ICMS_NA_OPERACAO_CONV','N',null,false,6,'OC'),c(11,'VL_UNIT_ICMS_OP_CONV','N',null,false,6,'OC'),
    c(12,'VL_UNIT_ICMS_OP_ESTOQUE_CONV','N',null,false,6,'OC'),c(13,'VL_UNIT_ICMS_ST_ESTOQUE_CONV','N',null,false,6,'OC'),
    c(14,'VL_UNIT_FCP_ICMS_ST_ESTOQUE_CONV','N',null,false,6,'OC'),c(15,'VL_UNIT_ICMS_ST_CONV_REST','N',null,false,6,'OC'),
    c(16,'VL_UNIT_FCP_ST_CONV_REST','N',null,false,6,'OC'),c(17,'VL_UNIT_ICMS_ST_CONV_COMPL','N',null,false,6,'OC'),c(18,'VL_UNIT_FCP_ST_CONV_COMPL','N',null,false,6,'OC')
  ],
  C350:[c(7,'VL_MERC','N',null,false,2,'O')],
  C500:[c(28,'CHV_DOCe','C',44,true,null,'OC OC'),c(29,'FIN_DOCe','N',1,true,null,'OC OC'),c(30,'CHV_DOCe_REF','C',44,true,null,'OC OC'),c(31,'IND_DEST','N',1,true,null,'N O'),c(32,'COD_MUN_DEST','N',7,true,null,'N O'),c(33,'COD_CTA','C',null,false,null,'OC OC')],
  D190:[c(3,'CFOP','N',4,true,null,'O O'),c(5,'VL_OPR','N',null,false,2,'O O'),c(6,'VL_BC_ICMS','N',null,false,2,'O O'),c(7,'VL_ICMS','N',null,false,2,'O O')],
  D690:[c(8,'VL_BC_ICMS_UF','N',null,false,2,'O'),c(9,'VL_ICMS_UF','N',null,false,2,'O')],
  D696:[c(2,'CST_ICMS','N',3,true,null,'O'),c(5,'VL_OPR','N',null,false,2,'O'),c(6,'VL_BC_ICMS','N',null,false,2,'O'),c(7,'VL_ICMS','N',null,false,2,'O'),c(8,'VL_BC_ICMS_UF','N',null,false,2,'O'),c(9,'VL_ICMS_UF','N',null,false,2,'O')],
  D750:[c(9,'VL_SERV_NT','N',null,false,2,'- O')],
  K275:[c(3,'QTD_COR_POS','N',null,false,6,'OC'),c(4,'QTD_COR_NEG','N',null,false,6,'OC')],
  K280:[c(2,'DT_EST','N',8,true,null,'O'),c(4,'QTD_COR_POS','N',null,false,3,'OC'),c(5,'QTD_COR_NEG','N',null,false,3,'OC'),c(6,'IND_EST','C',1,false,null,'O'),c(7,'COD_PART','C',60,false,null,'OC')]
};
let reparados=0,pendentes=[];const out={};
for(const[k,v]of Object.entries(G.registros)){
  const nt=N[k]?N[k].campos:[],porPos=new Map(v.campos.map(x=>[x.pos,x]));
  (CORRECOES[k]||[]).forEach(x=>porPos.set(x.pos,x));
  const campos=[...porPos.values()].sort((a,b)=>a.pos-b.pos).map(c=>{let nome=c.nome;const n=nt.find(x=>x.pos===c.pos&&x.nome&&x.nome.replace(/[ç]/gi,'c')!==nome);
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
