#!/usr/bin/env python3
"""Extrai do Guia Pratico da EFD Contribuicoes v1.35 as tabelas usadas no fluxo de creditos.

  4.3.6 - Codigo de Tipo de Credito   (COD_CRED dos registros M100/M500/1100/1500)
  4.3.7 - Codigo de Base de Calculo   (NAT_BC_CRED dos registros M105/C170/D101...)
  4.3.8 - Codigo de Ajustes           (COD_AJ dos registros M130/M130A/M530)

Uso: python3 -I scripts/extrai-tabelas-credito.py <guia.txt> <saida.json> "<origem>" <pdf>
"""
import hashlib
import json
import os
import re
import sys

RE_COD = re.compile(r'^\s*(\d{2,3})\s+(.+?)\s*$')
RE_CAB = re.compile(r'^\s*4\.3\.(\d)\s*[–-]\s*(Tabela[^:]*)')


def sha256_arquivo(caminho):
    h = hashlib.sha256()
    with open(caminho, 'rb') as fh:
        for pedaco in iter(lambda: fh.read(65536), b''):
            h.update(pedaco)
    return h.hexdigest()


def extrai(L):
    """Devolve {tabela: {codigo: descricao}}."""
    tabelas = {}
    atual = None
    grupo = None
    for linha in L:
        cab = RE_CAB.match(linha)
        if cab:
            num, titulo = cab.group(1), cab.group(2)
            if num == '6':
                atual, grupo = 'codigo_tipo_credito', None
            elif num == '7':
                atual, grupo = 'codigo_base_calculo', None
            elif num == '8':
                atual, grupo = 'codigo_ajustes', None
            else:
                atual = None
            if atual:
                tabelas.setdefault(atual, {'titulo': titulo.strip(), 'codigos': {}})
            continue
        if atual is None:
            continue
        s = linha.strip()
        if not s:
            continue
        if s.startswith('CÓDIGOS') or s.startswith('CODIGOS'):
            grupo = s
            continue
        m = RE_COD.match(linha)
        if not m:
            # continuacao da descricao (linha indentada): junta na ultima descricao
            if s.startswith(('Lei', 'art.', 'Art.')) or (len(tabelas[atual]['codigos']) and s[0].islower()):
                pass
            continue
        cod, desc = m.group(1), m.group(2).strip()
        if not re.match(r'^\d{2,3}$', cod):
            continue
        tabelas[atual]['codigos'][cod] = desc
    return tabelas


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    txt, saida, origem = sys.argv[1], sys.argv[2], sys.argv[3]
    pdf = sys.argv[4] if len(sys.argv) > 4 else None
    if pdf is None:
        candidato = os.path.splitext(txt)[0] + '.pdf'
        pdf = candidato if os.path.exists(candidato) else None

    L = open(txt, encoding='utf-8').read().split('\n')
    tabelas = extrai(L)

    doc = {
        'fonte': origem,
        'sha256': sha256_arquivo(pdf) if pdf else '',
        'observacao': 'tabelas 4.3.6 (tipo de credito), 4.3.7 (base de calculo) e 4.3.8 (ajustes) '
                      'do Guia Pratico da EFD Contribuicoes v1.35',
        'tabelas': tabelas,
    }
    os.makedirs(os.path.dirname(saida) or '.', exist_ok=True)
    with open(saida, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)

    for nome, t in tabelas.items():
        print('%s: %d codigos (%s)' % (nome, len(t['codigos']), t['titulo'][:60]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
