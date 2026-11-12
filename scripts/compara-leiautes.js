const fs=require('fs'),vm=require('vm');
function grab(file,startRe){const s=fs.readFileSync(file,'utf8');const m=startRe.exec(s);if(!m)return null;let i=m.index+m[0].length-1,d=0,j=i;for(;j<s.length;j++){if(s[j]=='{')d++;if(s[j]=='}'){d--;if(!d)break}}return vm.runInNewContext('('+s.slice(i,j+1)+')');}
function cmp(nome,map,cat){let ok=0,dif=[],ausente=[];for(const[reg,campos]of Object.entries(map)){const c=cat.registros[reg];if(!c){ausente.push(reg);continue}const porPos={};c.campos.forEach(x=>porPos[x.pos-1]=x.nome);for(const[n,p]of Object.entries(campos)){if(typeof p!=='number')continue;if(porPos[p]===n)ok++;else dif.push(`${reg}.${n}@${p} catalogo=${porPos[p]||'-'}`)}}
console.log(`== ${nome}: ${ok} campos batem, ${dif.length} divergem, ${ausente.length} registros ausentes (${ausente.join(',')})`);dif.slice(0,40).forEach(x=>console.log('  ',x));}
const L1=grab('motor-creditos.js',/var L = \{/);cmp('motor-creditos x EFD-Contribuicoes',L1,require(process.cwd()+'/lib/sped/leiautes/efd_contribuicoes.base.json'));
const L2=grab('motor-efd-icms.js',/var LEIAUTE = \{/);if(L2)cmp('motor-efd-icms x EFD ICMS/IPI',L2,require(process.cwd()+'/lib/sped/leiautes/efd_icms_ipi.base.json'));
{const cat=require(process.cwd()+'/lib/sped/leiautes/efd_icms_ipi.base.json');let ok=0,dif=[],aus=[],qtd=0;
for(const[reg,arr]of Object.entries(L2)){const c=cat.registros[reg];if(!c){aus.push(reg);continue}qtd++;const n=c.campos.map(x=>x.nome);
arr.forEach((nm,i)=>{if(n[i]===nm)ok++;else dif.push(`${reg}[${i+1}] reversa=${nm} catalogo=${n[i]||'-'}`)});
if(n.length!==arr.length)dif.push(`${reg}: reversa ${arr.length} campos x catalogo ${n.length}`)}
console.log(`== (arrays) motor-efd-icms x ICMS/IPI: ${qtd} registros, ${ok} campos batem, ${dif.length} divergencias, ausentes: ${aus.join(',')}`);dif.slice(0,30).forEach(x=>console.log('  ',x));}
