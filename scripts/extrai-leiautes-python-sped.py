import ast, json, sys, os
SRC=os.environ['PYTHON_SPED']+'/sped'
OUT='lib/sped/leiautes'
TIPO={'Campo':'C','CampoData':'D','CampoFixo':'F','CampoNumerico':'N','CampoNumerico_':'N'}
def extrai(path):
    tree=ast.parse(open(path,encoding='utf-8').read()); regs={}
    for n in tree.body:
        if isinstance(n,ast.ClassDef) and n.name.startswith('Registro') and n.name!='Registro':
            doc=(ast.get_docstring(n) or '').strip()
            campos=[]
            for b in n.body:
                if isinstance(b,ast.Assign) and getattr(b.targets[0],'id','')=='campos':
                    for c in b.value.elts:
                        t=TIPO.get(getattr(c.func,'id',''),'C'); a=c.args
                        item={'pos':a[0].value,'nome':a[1].value,'tipo':t}
                        if t=='N' and len(a)>2 and isinstance(a[2],ast.Constant): item['dec']=a[2].value
                        if t=='F' and len(a)>2: item['fixo']=a[2].value
                        campos.append(item)
            regs[n.name[8:]]={'descricao':doc,'campos':campos}
    return regs
alvos={'efd_icms_ipi':'efd/icms_ipi/registros.py','efd_contribuicoes':'efd/pis_cofins/registros.py','ecd':'ecd/registros.py','ecf':'ecf/registros.py'}
for k,p in alvos.items():
    r=extrai(os.path.join(SRC,p))
    doc={'leiaute':k,'origem':'python-sped (MIT, SPED-BR) - base portada por AST; sem tamanhos','validacao':'[VALIDAR] contra Guia Pratico oficial vigente','registros':r}
    json.dump(doc,open(f'{OUT}/{k}.base.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(k,len(r),'registros',sum(len(v['campos']) for v in r.values()),'campos')
