#!/usr/bin/env python3
"""Extrai o leiaute dos registros da EFD-Contribuições do Guia Prático (versão 1.35).

Entrada : texto do PDF extraído com `pdftotext -layout`
Saída   : catálogo JSON no mesmo schema de lib/sped/leiautes/efd_icms_ipi.json
Uso     : python3 -I scripts/extrai-guia-contrib.py guia.txt saida.json "origem" [pdf]

Determinístico, sem IA: todo campo do catálogo sai do texto do PDF.

Formato do Guia (Seção 3 – Leiaute dos Registros dos BLOCOS da EFD-Contribuições):

    BLOCO 0: Abertura, Identificação e Referências.
    Registro 0000: Abertura do Arquivo Digital e Identificação da Pessoa Jurídica
      Nº          Campo              Descrição                 Tipo   Tam   Dec   Obrig
      01 REG                  Texto fixo contendo "0000".      C     004*   -     S
      02 VL_TOT_CONT_          Valor Total da Contribuição    N        -   02    S
         NC_PER                Não Cumulativa do Período

Duas peculiaridades do PDF, tratadas aqui:
  * o nome do campo é cortado pela largura da coluna e continua na linha seguinte
    (VL_TOT_CONT_ + NC_PER); quando o corte cai no meio do nome sem "_", o nome
    fica curto e é consertado depois pela reconciliação com a base do motor;
  * a descrição ocupa várias linhas: as colunas Tipo/Tam/Dec/Obrig ficam no fim
    da última linha do bloco do campo.

A coluna "Obrig" do Guia vale S (preenchimento obrigatório) ou N (não obrigatório).
"""
import hashlib
import json
import os
import re
import sys

RE_CAB = re.compile(r'^\s*Registro\s+([0-9A-Z]{4})\s*:\s*(.+?)\s*$')
RE_CAB_LEIAUTE = re.compile(r'^\s*Leiaute do Registro\s+([0-9A-Z]{4})\b')
RE_BLOCO = re.compile(r'^\s*BLOCO\s+([0-9A-Z]{1,2})\s*:')
RE_NUM_LINHA = re.compile(r'^\s*(\d{2,3})\s+(\S+)')
RE_NUM_SO = re.compile(r'^\s*(\d{2,3})\s*$')
RE_NOME = re.compile(r'^[A-Z_][A-Z0-9_]*$')
RE_COLUNAS = re.compile(r'([CNDL])\s+(\d{1,4}\*?|-)\s+(\d{1,2}|-)\s+([SN])\s*$')
RE_COLUNAS3 = re.compile(r'([CNDL])\s+(\d{1,4}\*?|-)\s+(\d{1,2}|-)\s*$')
# coluna Tam vazia: o PDF imprime Tipo, (vazio), Dec e Obrig
RE_COLUNAS3B = re.compile(r'([CNDL])\s+(\d{1,2})\s+([SN])\s*$')
RE_OBRIG_SO = re.compile(r'([SN])\s*$')
RE_TOC = re.compile(r'\.{5,}\s*\d+\s*$')
RE_CAB_CAMPOS = re.compile(r'Nº\s+Campo\s+Descri')
# O nome do campo fica na coluna esquerda; a continuação da descrição vem bem mais à direita.
LIMITE_COLUNA_NOME = 9


def coluna_obrig(linha):
    """Posição (em caracteres) da coluna 'Obrig' na linha, pelo cabeçalho da tabela."""
    for m in re.finditer(r'\bObrig\b', linha):
        return m.start()
    return None


def sha256_arquivo(caminho):
    h = hashlib.sha256()
    with open(caminho, 'rb') as fh:
        for pedaco in iter(lambda: fh.read(1 << 20), b''):
            h.update(pedaco)
    return h.hexdigest()


def bloco_campos(linhas, conhecidos=None):
    """Divide o trecho em blocos de campo: começa numa linha de campo e vai até a próxima.

    O PDF do Guia tem três desvios:
      * o número do campo pode vir sozinho na linha seguinte (quebra de página empurra
        a coluna da esquerda);
      * o nome do campo pode vir sem o número (o número vem depois);
      * o nome pode estar cortado e continuar na linha seguinte (VL_TOT_CONT_ + NC_PER).
    """
    blocos = []
    atual = None
    x_obrig = None
    conhecidos = conhecidos or set()

    def fecha():
        nonlocal atual
        if atual is not None:
            blocos.append(atual)
            atual = None

    def primeiro_token(linha):
        for m in re.finditer(r'\S+', linha):
            return m.group(0), m.start()
        return '', 999

    for linha in linhas:
        if RE_CAB_CAMPOS.search(linha):
            fecha()
            x_obrig = coluna_obrig(linha)
            continue
        m = RE_NUM_SO.match(linha)
        if m and m.start(1) < LIMITE_COLUNA_NOME:
            if atual is not None and atual.get('pos') is None:
                atual['pos'] = int(m.group(1))
                atual['linhas'].append(linha)
            else:
                fecha()
                atual = {'pos': int(m.group(1)), 'nome': '', 'linhas': [linha], 'x_obrig': x_obrig}
            continue
        m = RE_NUM_LINHA.match(linha)
        if m and m.start(1) < LIMITE_COLUNA_NOME:
            # "01 - Pessoa juridica..." e lista de descricao, nao e campo
            if not RE_NOME.match(m.group(2)) and m.end(2) - m.start(1) < 9:
                if atual is not None:
                    atual['linhas'].append(linha)
                continue
            # o nome veio antes do numero (layout "nome na linha de cima"):
            # o numero completa o campo atual
            if atual is not None and atual.get('pos') is None and atual.get('nome'):
                atual['pos'] = int(m.group(1))
                atual['linhas'].append(linha)
                continue
            # numero do campo na coluna da esquerda: comeca um campo novo
            fecha()
            nome = m.group(2) if RE_NOME.match(m.group(2)) else ''
            # nome cortado pela largura da coluna? a descricao comeca colada no nome
            truncado = False
            if nome:
                resto = linha[m.end(2):]
                if nome.endswith('_'):
                    # nome partido na propria linha ("DESC_ BEM_IMOB")
                    mm = re.match(r'^\s+([A-Z][A-Z0-9_]*)\b', resto)
                    if mm:
                        nome += mm.group(1)
                else:
                    truncado = bool(re.match(r'^ {1,2}\S', resto))
            atual = {'pos': int(m.group(1)), 'nome': nome, 'truncado': truncado,
                     'linhas': [linha], 'x_obrig': x_obrig}
            continue
        tok, col = primeiro_token(linha)
        # linha de nome de campo: token na coluna do nome, com pelo menos duas espacos
        # depois (a descricao alinhada). Frases do texto corrido nao entram.
        eh_nome = bool(tok) and RE_NOME.match(tok) and col < LIMITE_COLUNA_NOME
        nome_linha = eh_nome and len(tok) >= 2 \
            and re.match(r'^( {2,}|\s*$)', linha[col + len(tok):])
        # fragmento de nome cortado: aceita uma letra so, quando o campo esta truncado
        # ou quando a uniao com o nome atual forma um nome conhecido
        fragmento = eh_nome and (atual is not None) and (
            atual.get('truncado')
            or (atual.get('nome') and (atual['nome'] + tok) in conhecidos))
        if atual is not None and (nome_linha or fragmento):
            # Linha sem numero na coluna do nome. Tres casos no PDF:
            #  a) o campo ja tem numero e o nome veio depois da descricao -> preenche o nome;
            #  b) o fragmento comeca com '_' -> continuacao de nome cortado;
            #  c) caso contrario -> comeca um campo novo (o numero dele vem depois).
            if atual['nome'] == '' and atual.get('pos') is not None:
                atual['nome'] = tok
                atual['linhas'].append(linha)
                continue
            if atual.get('truncado') and atual['nome'] not in conhecidos:
                # o nome foi cortado na coluna: esta linha traz o resto
                atual['nome'] += tok
                atual['truncado'] = False
                atual['linhas'].append(linha)
                continue
            if tok.startswith('_') or atual['nome'].endswith('_'):
                atual['nome'] += tok
                atual['linhas'].append(linha)
                continue
            if atual['nome'] and (atual['nome'] + tok) in conhecidos:
                # o PDF quebrou o nome em duas linhas: a uniao forma um nome conhecido
                atual['nome'] += tok
                atual['linhas'].append(linha)
                continue
            fecha()
            atual = {'pos': None, 'nome': tok, 'linhas': [linha], 'x_obrig': x_obrig}
            continue
        if atual is not None:
            atual['linhas'].append(linha)
        elif nome_linha:
            atual = {'pos': None, 'nome': tok, 'linhas': [linha], 'x_obrig': x_obrig}
    fecha()
    return blocos


def campos_do_bloco(bloco, x_obrig):
    """Extrai nome e colunas de um bloco de campo.

    As colunas Tipo/Tam/Dec/Obrig podem quebrar entre linhas (a descrição longa
    empurra a coluna da direita para a linha seguinte): busca-se o grupo de
    colunas de trás para frente e, se a obrigatoriedade ficar sozinha, ela vem
    de uma das linhas anteriores, na coluna calibrada.
    """
    linhas = bloco['linhas']
    nome = bloco.get('nome') or ''
    if not nome:
        m = RE_NUM_LINHA.match(linhas[0])
        if m and RE_NOME.match(m.group(2)):
            nome = m.group(2)
    tipo = tam = dec = obrig = None
    for i in range(len(linhas) - 1, -1, -1):
        linha = linhas[i]
        m = RE_COLUNAS.search(linha)
        if m:
            tipo, tam, dec, obrig = m.group(1), m.group(2), m.group(3), m.group(4)
            break
        m3b = RE_COLUNAS3B.search(linha)
        if m3b:
            tipo, dec, obrig = m3b.group(1), m3b.group(2), m3b.group(3)
            tam = None
            break
        m3 = RE_COLUNAS3.search(linha)
        if m3:
            tipo, tam, dec = m3.group(1), m3.group(2), m3.group(3)
            # a obrigatoriedade costuma ficar sozinha numa linha anterior, na coluna certa
            for j in range(i - 1, max(-1, i - 4), -1):
                mo = RE_OBRIG_SO.search(linhas[j])
                if not mo:
                    continue
                pos = mo.start(1)
                if x_obrig is None or pos >= x_obrig - 3:
                    obrig = mo.group(1)
                    break
            break
    if tipo is None or bloco.get('pos') is None:
        return None
    return {
        'pos': bloco['pos'],
        'nome': nome,
        'tipo': tipo,
        'tam': tam,
        'dec': dec,
        'obrig': obrig or '',
    }


def carrega_nomes_conhecidos():
    """Nomes de campo ja conhecidos (base python-sped e motor do Reversa).

    Usado SO para reconhecer que o PDF quebrou um nome em duas linhas: a uniao
    das duas partes precisa formar um nome conhecido. Nenhum valor do leiaute vem
    daqui -- quem manda em posicao, tipo, tamanho e decimais e o PDF.
    """
    conhecidos = {}
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'lib', 'sped', 'leiautes', 'efd_contribuicoes.base.json')
    if os.path.exists(base):
        with open(base, encoding='utf-8') as fh:
            doc = json.load(fh)
        globais = set()
        for cod, reg in (doc.get('registros') or {}).items():
            nomes = {c.get('nome') for c in (reg.get('campos') or []) if c.get('nome')}
            conhecidos[cod] = nomes | globais
            globais |= nomes
    return conhecidos


def extrai(L):
    """Devolve {registro: {'titulo', 'campos': [...]}}."""
    inicio = 0
    for i, linha in enumerate(L):
        if 'Leiaute dos Registros dos BLOCOS' in linha:
            inicio = i
            break

    registros = {}
    conhecidos_por_registro = carrega_nomes_conhecidos()
    for i in range(inicio, len(L)):
        linha = L[i]
        m = RE_CAB.match(linha)
        ml = RE_CAB_LEIAUTE.match(linha)
        if ml:
            # "Leiaute do Registro XXXX ..." e a tabela do registro (pode haver duas:
            # a anterior e a vigente). Vale a mais completa.
            cod, titulo = ml.group(1), ''
        else:
            if not m or RE_TOC.search(linha):
                continue
            cod, titulo = m.group(1), m.group(2).strip()
        fim = len(L)
        for j in range(i + 1, len(L)):
            if RE_CAB.match(L[j]) and not RE_TOC.search(L[j]):
                fim = j
                break
            if RE_BLOCO.match(L[j]) or RE_CAB_LEIAUTE.match(L[j]):
                fim = j
                break
        campos = []
        for bloco in bloco_campos(L[i + 1:fim], conhecidos_por_registro.get(cod)):
            c = campos_do_bloco(bloco, bloco.get('x_obrig'))
            if c:
                campos.append(c)
        if not campos:
            continue
        # o mesmo registro pode aparecer mais de uma vez (leiaute antigo e atual):
        # prevalece a ocorrência mais completa
        anterior = registros.get(cod)
        if anterior and len(anterior['campos']) >= len(campos):
            continue
        registros[cod] = {'titulo': titulo, 'campos': campos}
    return registros


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
    brutos = extrai(L)

    out = {}
    incompletos = []
    for cod, reg in sorted(brutos.items()):
        campos = []
        vistos = set()
        for c in reg['campos']:
            if c['pos'] in vistos:
                continue
            vistos.add(c['pos'])
            campos.append({
                'pos': c['pos'],
                'nome': c['nome'],
                'tipo': c['tipo'],
                'tam': None if (c['tam'] is None or c['tam'] == '-') else int(c['tam'].rstrip('*')),
                'tam_fixo': bool(c['tam'] and c['tam'].endswith('*')),
                'dec': None if c['dec'] == '-' else int(c['dec']),
                'obrig_bruto': c['obrig'],
            })
        max_pos = max(c['pos'] for c in campos)
        faltantes = [p for p in range(1, max_pos + 1) if p not in vistos]
        completo = not faltantes and campos[0]['nome'] == 'REG'
        out[cod] = {
            'titulo': reg['titulo'],
            'campos': campos,
            'posicoes_faltantes': faltantes,
            'completo': completo,
        }
        if not completo:
            incompletos.append('%s:%s' % (cod, faltantes))

    doc = {
        'leiaute': 'efd_contribuicoes',
        'fonte': origem,
        'sha256': sha256_arquivo(pdf) if pdf else '',
        'validacao': '[VALIDAR] os registros com completo=false',
        'registros': out,
    }
    with open(saida, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)

    print('registros: %d | completos: %d | campos: %d' % (
        len(out), sum(1 for r in out.values() if r['completo']), sum(len(r['campos']) for r in out.values())))
    if incompletos:
        print('pendentes: ' + ' '.join(incompletos))
    return 0


if __name__ == '__main__':
    sys.exit(main())
