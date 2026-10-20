#!/usr/bin/env python3
"""Complemento fiscal sintético de 2022; não executa nem altera o previdenciário."""
from pathlib import Path
from decimal import Decimal as D, ROUND_HALF_UP
from collections import Counter
import json,re,csv,calendar,argparse,zipfile

ROOT=Path(__file__).resolve().parent
DEFAULT=Path('/Users/apple/.Trash/pacote_sped_sintetico_lucro_real_2022')
def q(v):return D(v).quantize(D('.01'),rounding=ROUND_HALF_UP)
def num(v,dec=2):return f'{D(v):.{dec}f}'.replace('.',',')
def line(code,*values):return '|'+code+'|'+'|'.join(str(v) for v in values)+'|'
def split(v,n):
    a,b=divmod(int(q(v)*100),n)
    return [D(a+(i<b))/100 for i in range(n)]
def dv_cnpj(s):
    s=re.sub(r'\D','',s)[:12]
    for weights in ([5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]):
        r=sum(int(c)*w for c,w in zip(s,weights))%11;s+=str(0 if r<2 else 11-r)
    return s
def make_efd(company,cnpj,month,revenue):
    end=calendar.monthrange(2022,month)[1];start=f'01{month:02}2022';finish=f'{end:02}{month:02}2022'
    # Novo cenário: receita por contrato; aluguel de prédio e máquinas pagos a PJ.
    rent=q(revenue*D('.05'));machines=q(revenue*D('.10'));bases=[rent,machines]
    pis=[q(v*D('.0165')) for v in bases];cof=[q(v*D('.076')) for v in bases]
    cp=sum(pis);cc=sum(cof);dp=q(revenue*D('.0165'));dc=q(revenue*D('.076'));np=dp-cp;nc=dc-cc
    rows=[]
    def add(code,*v):rows.append(line(code,*v))
    def empty(block):add(block+'001',1);add(block+'990',2)
    add('0000','006',0,'','',start,finish,company,cnpj,'SP','3550308','','00',9)
    add('0001',0)
    add('0100','RESPONSAVEL CONTABIL DO CENARIO','93000000127','SP000000O0','','01001000','RUA DO CENARIO','100','','CENTRO','','','contabilidade@example.invalid','3550308')
    add('0110',1,1,1,'')
    add('0140','MATRIZ',company,cnpj,'SP','','3550308','','')
    # Contrapartes artificiais diferentes do declarante; participantes nacionais.
    for code,name,ident in [('LOCADOR01','LOCADOR DE PREDIO DO CENARIO','997001010001'),('LOCADOR02','LOCADOR DE EQUIPAMENTOS DO CENARIO','997002020001'),('CLIENTE01','CONTRATANTE DO CENARIO','997003030001')]:
        add('0150',code,name,'1058',dv_cnpj(ident),'','','3550308','','RUA DO CENARIO','100','','CENTRO')
    add('0990',len(rows)+1)
    for block in ['A','C','D']:empty(block)
    begin=len(rows);add('F001',0);add('F010',cnpj)
    add('F100',1,'CLIENTE01','',finish,num(revenue),'01',num(revenue),'1,6500',num(dp),'01',num(revenue),'7,6000',num(dc),'','','','','RECEITA CONTRATUAL SINTETICA SEM NOTA FISCAL')
    for i,(base,p,c,nature,desc) in enumerate(zip(bases,pis,cof,['05','06'],['ALUGUEL DE PREDIO - CONTRATO SINTETICO','ALUGUEL DE EQUIPAMENTOS - CONTRATO SINTETICO']),1):
        add('F100',0,f'LOCADOR0{i}','',finish,num(base),'50',num(base),'1,6500',num(p),'50',num(base),'7,6000',num(c),nature,0,'','',desc)
    add('F990',len(rows)-begin+1)
    empty('I')
    begin=len(rows);add('M001',0)
    for prefix,rate,credit,debit,net,code in [('M1','1,6500',cp,dp,np,'691201'),('M5','7,6000',cc,dc,nc,'585601')]:
        add(prefix+'00','101',0,num(sum(bases)),rate,'','',num(credit),'0,00','0,00','0,00',num(credit),0,num(credit),'0,00')
        for nature,base in zip(['05','06'],bases):add(prefix+'05',nature,'50',num(base),'0,00',num(base),num(base),'','','ALUGUEL EM OPERACAO SINTETICA')
        reg='M200' if prefix=='M1' else 'M600';detail='M205' if prefix=='M1' else 'M605';contribution='M210' if prefix=='M1' else 'M610'
        add(reg,num(debit),num(credit),'0,00',num(net),'0,00','0,00',num(net),'0,00','0,00','0,00','0,00',num(net))
        add(detail,'08',code,num(net))
        add(contribution,'01',num(revenue),num(revenue),'0,00','0,00',num(revenue),rate,'','',num(debit),'0,00','0,00','0,00','0,00',num(debit))
    add('M990',len(rows)-begin+1)
    empty('P')
    add('1001',1);add('1990',2)
    begin=len(rows);add('9001',0);counts=Counter(r.split('|')[1] for r in rows)
    codes=sorted(set(counts)|{'9900','9990','9999'});counts.update({'9900':len(codes),'9990':1,'9999':1})
    for code in codes:add('9900',code,counts[code])
    add('9990',len(rows)-begin+1);add('9999',len(rows)+1)
    # Verificação pontual dos arquivos novos: campos, totais e encerramentos.
    field_counts={'0000':14,'0100':14,'0110':5,'0140':9,'0150':13,'F100':19,'M100':15,'M105':10,'M200':13,'M205':4,'M210':16,'M500':15,'M505':10,'M600':13,'M605':4,'M610':16}
    for row in rows:
        fields=row[1:-1].split('|');code=fields[0]
        if code in field_counts:assert len(fields)==field_counts[code],(code,len(fields))
    assert int(rows[-1].split('|')[2])==len(rows)
    assert dp-cp==np and dc-cc==nc
    summary={'empresa':company,'cnpj_artificial':cnpj,'competencia':f'2022-{month:02}','receita':str(revenue),'base_credito_predio':str(rent),'base_credito_equipamentos':str(machines),'credito_pis':str(cp),'credito_cofins':str(cc),'debito_pis':str(dp),'debito_cofins':str(dc),'pis_a_recolher':str(np),'cofins_a_recolher':str(nc)}
    return '\r\n'.join(rows)+'\r\n',summary