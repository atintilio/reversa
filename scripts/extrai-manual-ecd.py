#!/usr/bin/env python3
"""Extrai o leiaute 12 da ECF (Escrituração Contábil Fiscal) do texto do PDF oficial.

Entrada : texto do PDF extraído com `pdftotext -layout`
          (Manual de Orientação do Leiaute 9 da ECD - Anexo ao ADE Cofis nº 2/2026).
Saída   : catálogo JSON no mesmo schema de lib/sped/leiautes/efd_icms_ipi.json.
Uso     : python3 -I scripts/extrai-manual-ecd.py manual.txt saida.json "origem" [pdf]

Determinístico, sem IA: todo campo do catálogo sai do texto do PDF.
O quarto argumento (opcional) é o caminho do PDF oficial; ele é usado só para
gravar o sha256 do documento no catálogo. Se não for informado, o script procura
um PDF com o mesmo nome base ao lado do .txt.
"""
import hashlib
import json
import os
import re
import sys
from collections import Counter

RE_CAB_UPPER = re.compile(r'REGISTRO\s+([0-9A-Z]{4})\s*:')
RE_CAB_TITULO = re.compile(r'^\s*Registro\s+([0-9A-Z]{4})\s*:\s*(.+?)\s*$')
RE_NOME = re.compile(r'^[A-Z\xC0-\xDE][A-Z0-9_\-\xC0-\xDE]*$')
RE_NUM = re.compile(r'^\d{1,3}$')
RE_DIG = re.compile(r'^\d{1,4}$')
RE_RODAPE = re.compile(r'RFB/Subsecretaria de Fiscaliza')
RE_BLOCO = re.compile(r'^Bloco [0-9A-Z]{1,2}:')
# Fim da secao de leiaute: depois da tabela de campos vem a parte de observacoes/tabelas
# dinamicas do proprio registro, que nao sao campos e poluem o catalogo.
RE_FIM_SECAO = re.compile(r'^\s*(?:[IVX]+\s*[-–—]\s*)?(?:Observações|Tabelas do Registro|Tabela Dinâmica|Exemplos?)\b')
TIPOS = ('C', 'N', 'NS')
OBRIG = ('Sim', 'Não', 'sim', 'não', 'S', 'N')
TOL_POS = 2         # tolerância (colunas) para o número do campo e para o nome
TOL_TIPO = 3        # tolerância (colunas) para a coluna Tipo


def tokens(linha):
    """[(texto, início, fim)] dos trechos não brancos da linha."""
    return [(m.group(0), m.start(), m.end()) for m in re.finditer(r'\S+', linha)]


def sha256_arquivo(caminho):
    h = hashlib.sha256()
    with open(caminho, 'rb') as fh:
        for pedaco in iter(lambda: fh.read(1 << 20), b''):
            h.update(pedaco)
    return h.hexdigest()


# ------------------------------------------------------------------- páginas
def divide_paginas(linhas):
    """Separa o trecho em páginas do PDF (o rodapé marca a quebra)."""
    paginas, atual = [], []
    for idx, linha in enumerate(linhas):
        atual.append((idx, linha))
        if RE_RODAPE.search(linha):
            paginas.append(atual)
            atual = []
    if atual:
        paginas.append(atual)
    return paginas


def cabecalho_leiaute(linha):
    """Cabeçalho da tabela de leiaute: Nº | Campo | Descrição | Tipo | Tamanho | Decimal | ... | Obrigatório."""
    return 'Tamanho' in linha and 'Decimal' in linha and 'Campo' in linha


def cabecalho_regras(linha):
    """Cabeçalho da tabela de regras de validação de campos (não é leiaute)."""
    t = linha.lower()
    return 'regras de valida' in t and 'campo' in t and 'tipo' in t


# ---------------------------------------------------------------- calibração
def tipo_de_linha(toks):
    """Índice do token que é o Tipo (C/N/NS) da linha, ou None.

    Só aceita o token se os dois tokens seguintes também forem de coluna
    (dígito, '-' ou '['); assim o 'N' de 'N - Não' da descrição não pega.
    """
    for i, t in enumerate(toks):
        if t[0] not in TIPOS:
            continue
        prox = toks[i + 1:i + 3]
        if len(prox) < 2:
            continue
        if not (RE_DIG.match(prox[0][0]) or prox[0][0] in ('-', '[')):
            continue
        if not (RE_DIG.match(prox[1][0]) or prox[1][0] in ('-', '[')):
            continue
        return i
    return None


def calcula_calibracao(linhas):
    """Calibra, nos dados da página, as colunas Nº, Campo e Tipo.

    Nº e Campo saem das linhas em que o número do campo vem seguido do nome
    do campo (par inequívoco); Tipo sai das linhas em que há um C/N/NS seguido
    de duas colunas.
    """
    pares = []
    x_tipo = Counter()
    for idx, linha in linhas:
        toks = tokens(linha)
        if not toks:
            continue
        if (len(toks) > 1 and RE_NUM.match(toks[0][0])
                and RE_NOME.match(toks[1][0]) and len(toks[1][0]) > 1):
            pares.append((toks[0][1], toks[1][1]))
        i = tipo_de_linha(toks)
        if i is not None:
            x_tipo[toks[i][1]] += 1
    if pares:
        x_no = Counter(p[0] for p in pares).most_common(1)[0][0]
        x_nome = Counter(p[1] for p in pares).most_common(1)[0][0]
    else:
        x_no = x_nome = None
    return (x_no, x_nome,
            x_tipo.most_common(1)[0][0] if x_tipo else None)


def x_no_do_cabecalho(pagina):
    """Posição da coluna Nº segundo o cabeçalho da tabela de leiaute."""
    for _, linha in pagina:
        if cabecalho_leiaute(linha):
            for txt, ini, fim in tokens(linha):
                if txt == 'Nº':
                    return ini
    return None


def token_tipo(toks, x_tipo):
    """Token do Tipo (C/N/NS) da linha, pela posição calibrada da coluna."""
    melhor = None
    for i, t in enumerate(toks):
        if t[0] not in TIPOS:
            continue
        d = abs(t[1] - x_tipo)
        if d <= TOL_TIPO and (melhor is None or d < melhor[0]):
            melhor = (d, i)
    return melhor[1] if melhor is not None else None


def monta_nome(nome, proximos):
    """Junta o nome quebrado na mesma linha (ex.: 'IND_' + 'REC_EXT' -> 'IND_REC_EXT')."""
    if not nome.endswith('_'):
        return nome
    for txt, _, _ in proximos:
        if RE_NOME.match(txt) and ('_' in txt or any(c.isdigit() for c in txt)):
            return nome + txt
    return nome


# -------------------------------------------------------------------- extração
def le_colunas(toks, i):
    """Lê tamanho, decimais e obrigatoriedade a partir do token do Tipo."""
    col = {'tipo': toks[i][0], 'tam': None, 'dec': None, 'obrig': ''}
    resto = toks[i + 1:]
    if not resto:
        return col
    if not (RE_DIG.match(resto[0][0]) or resto[0][0] == '-'):
        return col
    col['tam'] = resto[0][0]
    resto = resto[1:]
    # obrigatoriedade: último token, se for "Sim"/"Não"/"S"/"N"
    if resto and resto[-1][0] in OBRIG:
        col['obrig'] = resto[-1][0]
        resto = resto[:-1]
    if resto:
        if RE_DIG.match(resto[0][0]):
            col['dec'] = resto[0][0]
        elif resto[0][0] == '-':
            col['dec'] = '-'
        # o que sobrar (valores válidos) não faz parte do schema do catálogo
    return col


def extrai_registro(linhas):
    """Extrai os campos de um registro a partir do trecho do manual.

    Devolve {pos: {'nomes': [...], 'col': {...}}}.
    """
    paginas = divide_paginas(linhas)
    eventos = []
    eventos_num = []
    campos_parametrizados = []
    ult = (None, None, None)
    for pagina in paginas:
        x_no, x_nome, x_tipo = calcula_calibracao(pagina)
        if x_no is None:
            x_no = x_no_do_cabecalho(pagina)
        if x_no is None or x_nome is None or x_tipo is None:
            # sem calibração própria: herda da página anterior do mesmo registro
            x_no, x_nome, x_tipo = ult
            if x_no is None or x_nome is None or x_tipo is None:
                continue
        ult = (x_no, x_nome, x_tipo)
        ultimo_num = None
        for idx, linha in pagina:
            if cabecalho_regras(linha):
                continue
            toks = tokens(linha)
            if not toks:
                continue
            num = None
            parametrizado = None
            if toks[0][0] == '*':
                # campo com numero de posicao variavel (registro parametrizavel):
                # o proprio manual remete a outro registro para a lista de campos.
                for t in toks:
                    if RE_NOME.match(t[0]) and len(t[0]) > 2:
                        parametrizado = t[0]
                        break
                if parametrizado:
                    campos_parametrizados.append(parametrizado)
                nome = None
            elif RE_NUM.match(toks[0][0]) and abs(toks[0][1] - x_no) <= TOL_POS:
                num = int(toks[0][0])
            nome = None
            for t in toks:
                if abs(t[1] - x_nome) <= TOL_POS and RE_NOME.match(t[0]):
                    nome = monta_nome(t[0], [x for x in toks if x[1] > t[2]])
                    break
            col = None
            i = token_tipo(toks, x_tipo)
            if i is not None:
                col = le_colunas(toks, i)
            if num is not None:
                eventos_num.append((idx, num))
                ultimo_num = (idx, num)
                eventos.append((idx, num, nome, col))
            else:
                if ultimo_num is None or idx - ultimo_num[0] > 2:
                    # Linha sem Nº e sem continuação: não é linha de campo.
                    # Sem esta guarda, "Campo(s) chave: ..." e o "Exemplo de Preenchimento"
                    # entram no catálogo como nome de campo.
                    continue
                eventos.append((idx, ultimo_num[1], nome, col))

    if not eventos_num:
        return {}

    campos = {}
    for idx, num, nome, col in eventos:
        c = campos.setdefault(num, {'nomes': [], 'col': None})
        if nome:
            c['nomes'].append(nome)
        if col is not None and c['col'] is None:
            c['col'] = col
    if campos_parametrizados:
        campos.setdefault('__parametrico__', {'nomes': campos_parametrizados, 'col': None})
    return campos


def extrai(L):
    """Extrai todos os registros do manual."""
    titulos = {}
    cabecalhos = []
    for i, linha in enumerate(L):
        m = RE_CAB_TITULO.match(linha)
        if m:
            titulos[m.group(1)] = m.group(2).strip()
        m2 = RE_CAB_UPPER.match(linha)
        if m2:
            titulos.setdefault(m2.group(1), linha.strip())
    for i, linha in enumerate(L):
        if not linha.strip().startswith('REGISTRO '):
            continue
        m = RE_CAB_UPPER.search(linha)
        if m:
            cabecalhos.append((i, m.group(1)))

    # O manual traz o mesmo registro mais de uma vez (secao de alteracoes e leiaute completo).
    # Extrai cada ocorrencia e consolida por posicao, prevalecendo a tabela mais completa.
    por_cod = {}
    for k, (i, cod) in enumerate(cabecalhos):
        fim = cabecalhos[k + 1][0] if k + 1 < len(cabecalhos) else len(L)
        # O leiaute de um registro termina no próximo registro ou no próximo bloco:
        # sem este corte, o texto introdutório do bloco seguinte entra no catálogo
        # (o registro de encerramento de cada bloco é o mais afetado).
        for j, linha in enumerate(L[i + 1:fim], start=i + 1):
            if RE_BLOCO.match(linha) or RE_FIM_SECAO.match(linha):
                fim = j
                break
        brutos = extrai_registro(L[i + 1:fim])
        if not brutos:
            continue
        por_cod.setdefault(cod, []).append(brutos)

    for cod, ocorrencias in por_cod.items():
        ocorrencias.sort(key=lambda b: len(b), reverse=True)
        brutos = {}
        for ocorrencia in ocorrencias:
            for pos, bruto in ocorrencia.items():
                brutos.setdefault(pos, bruto)
        parametrico = brutos.pop('__parametrico__', None)
        max_pos = max(brutos)
        campos, faltantes = [], []
        for pos in range(1, max_pos + 1):
            bruto = brutos.get(pos)
            if bruto is None:
                faltantes.append(pos)
                continue
            nome = ''.join(bruto['nomes']).replace(' ', '')
            col = bruto['col'] or {'tipo': None, 'tam': None, 'dec': None, 'obrig': ''}
            tam_txt = col['tam']
            campos.append({
                'pos': pos,
                'nome': nome,
                'tipo': col['tipo'],
                'tam': None if tam_txt in (None, '-') else int(tam_txt),
                'tam_fixo': bool(tam_txt and tam_txt.endswith('*')),
                'dec': None if col['dec'] in (None, '-') else int(col['dec']),
                'obrig_bruto': col['obrig'],
            })
        completo = not faltantes and bool(campos) and campos[0]['nome'] == 'REG' and not parametrico
        registro = {
            'titulo': titulos.get(cod, ''),
            'campos': campos,
            'posicoes_faltantes': faltantes,
            'completo': completo,
        }
        if parametrico:
            registro['campo_parametrico'] = parametrico['nomes']
            registro['observacao'] = ('registro parametrizado: o manual nao fixa o numero de campos; '
                                      'a lista de campos vem do registro indicado em ' + ', '.join(parametrico['nomes']) + '.')
        yield cod, registro


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    txt, saida, origem = sys.argv[1], sys.argv[2], sys.argv[3]
    pdf = sys.argv[4] if len(sys.argv) > 4 else None
    if pdf is None:
        candidato = os.path.splitext(txt)[0] + '.pdf'
        pdf = candidato if os.path.exists(candidato) else None

    L = open(txt, encoding='utf-8').read().split('\n')
    registros = {}
    for cod, reg in extrai(L):
        registros[cod] = reg

    sha = sha256_arquivo(pdf) if pdf and os.path.exists(pdf) else sha256_arquivo(txt)
    doc = {
        'leiaute': 'ecf',
        'fonte': origem,
        'sha256': sha,
        'nomes': ('nomes de campo lidos do texto do PDF; quando o nome veio quebrado '
                  'entre linhas (ex.: IND_ + REC_EXT), as partes foram juntadas'),
        'validacao': '[VALIDAR] os registros com completo=false contra o PDF oficial',
        'registros': registros,
    }
    with open(saida, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    total = len(registros)
    completos = sum(1 for r in registros.values() if r['completo'])
    print('%d registros; %d completos; %d incompletos; %d campos' % (
        total, completos, total - completos, sum(len(r['campos']) for r in registros.values())))
    for cod, r in registros.items():
        if not r['completo']:
            print('  incompleto %s: faltam %s' % (cod, r['posicoes_faltantes']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
