#!/usr/bin/env python3
"""Extrai registros/campos do texto (pdftotext -layout) do Guia Pratico EFD ICMS/IPI ou EFD-Contribuicoes.
Uso: python3 -I extrai-guia-efd.py guia.txt saida.json "origem"  (determinístico, sem IA)"""
import re, sys, json
txt, out, origem = sys.argv[1], sys.argv[2], sys.argv[3]
L = open(txt, encoding='utf-8').read().split('\n')
HDR = re.compile(r'^\s*REGISTRO\s+([0-9A-Z]{4})\s*[:\-–]\s*(.+?)\s*$')
INI = re.compile(r'^\s*(\d{1,3})\s+([^\W\d]\w*)')
TIP = re.compile(r'\s([CNDL])\s+(\d{1,3}|-)(\*?)\s+(\d{1,2}|-)(?![\d*])')
TIP2 = re.compile(r'\s([CNDL])\s+(\d{1,3}|-)(\*?)\s{2,}(?=(?:OC|O|NA|Não|-)\b)')
def lê(l):
    m = INI.match(l)
    if not m: return None
    ms = list(TIP.finditer(l[m.end():]))
    if ms:
        t = ms[-1]; cauda = l[m.end():][t.end():].strip(); dec = t.group(4)
    else:
        ms = list(TIP2.finditer(l[m.end():]))
        if not ms: return None
        t = ms[-1]; cauda = l[m.end():][t.end():].strip(); dec = '-'
    return int(m.group(1)), m.group(2), t.group(1), t.group(2), bool(t.group(3)), dec, cauda
heads = [(i, m.group(1), m.group(2)) for i, l in enumerate(L) if (m := HDR.match(l))]
regs, dubios = {}, []
for k, (i, reg, tit) in enumerate(heads):
    fim = heads[k+1][0] if k+1 < len(heads) else len(L)
    campos = []
    for l in L[i+1:fim]:
        r = lê(l)
        if r:
            pos, nome, tipo, tam, ast, dec, cauda = r
            campos.append({'pos': pos, 'nome': nome, 'tipo': tipo, 'tam': None if tam == '-' else int(tam), 'tam_fixo': ast,
                           'dec': None if dec == '-' else int(dec), 'obrig_bruto': cauda})
    if not campos: continue
    pos = [c['pos'] for c in campos]
    ok = pos == list(range(1, len(pos)+1)) and campos[0]['nome'] == 'REG'
    if reg in regs and len(regs[reg]['campos']) >= len(campos): continue
    regs[reg] = {'titulo': tit.strip(), 'campos': campos, 'sequencia_ok': ok}
    if not ok: dubios.append(reg)
json.dump({'origem': origem, 'registros': regs}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(heads), 'cabecalhos;', len(regs), 'registros com campos;', sum(len(r['campos']) for r in regs.values()), 'campos;', 'sequencia duvidosa:', dubios)
