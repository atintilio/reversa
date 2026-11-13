#!/usr/bin/env python3
"""Extrai deterministicamente o catálogo do Guia Prático EFD-Contribuições v1.35."""
import json
import re
import sys

linhas = open(sys.argv[1], encoding="utf-8").read().splitlines()
saida = sys.argv[2]
cabecalho = re.compile(r"^\s*Registro\s+([0-9A-Z]{4})\s*[:\-–]\s*(.+?)\s*$", re.I)
inicio = re.compile(r"^\s*(\d{1,3})\s+([^\W\d]\w*)")
tipo = re.compile(r"\s([CNDL])\s+(\d{1,3}|-)(\*?)\s+(\d{1,2}|-)(?![\d*])")
tipo_sem_dec = re.compile(r"\s([CNDL])\s+(\d{1,3}|-)(\*?)\s{2,}(?=(?:OC|O|NA|Não|-)\b)")


def campo(linha):
    ini = inicio.match(linha)
    if not ini:
        return None
    trecho = linha[ini.end():]
    achados = list(tipo.finditer(trecho))
    if achados:
        fim = achados[-1]
        decimais = fim.group(4)
    else:
        achados = list(tipo_sem_dec.finditer(trecho))
        if not achados:
            return None
        fim = achados[-1]
        decimais = "-"
    tamanho = fim.group(2)
    return {
        "pos": int(ini.group(1)),
        "nome": ini.group(2),
        "tipo": fim.group(1),
        "tam": None if tamanho == "-" else int(tamanho),
        "tam_fixo": bool(fim.group(3)),
        "dec": None if decimais == "-" else int(decimais),
        "obrig_bruto": trecho[fim.end():].strip(),
    }


cabecalhos = [(i, m.group(1).upper(), m.group(2).strip()) for i, linha in enumerate(linhas)
              if (m := cabecalho.match(linha))]
registros = {}
for indice, (inicio_reg, codigo, titulo) in enumerate(cabecalhos):
    fim_reg = cabecalhos[indice + 1][0] if indice + 1 < len(cabecalhos) else len(linhas)
    campos = [item for linha in linhas[inicio_reg + 1:fim_reg] if (item := campo(linha))]
    if not campos:
        continue
    # O guia repete alguns registros após mudanças de leiaute. A tabela mais longa é a vigente.
    if codigo in registros and len(registros[codigo]["campos"]) >= len(campos):
        continue
    posicoes = [item["pos"] for item in campos]
    maior = max(posicoes)
    faltantes = [pos for pos in range(1, maior + 1) if pos not in posicoes]
    sequencia_ok = posicoes == list(range(1, maior + 1))
    registros[codigo] = {
        "titulo": titulo,
        "campos": campos,
        "posicoes_faltantes": faltantes,
        "completo": sequencia_ok and campos[0]["nome"] == "REG",
    }

documento = {
    "leiaute": "efd_contribuicoes",
    "fonte": "Guia Prático EFD-Contribuições v1.35 (18/06/2021), texto extraído do PDF oficial, sem IA",
    "validacao": "Registros sem tabela própria no guia permanecem explicitamente ausentes",
    "registros": dict(sorted(registros.items())),
}
with open(saida, "w", encoding="utf-8") as arquivo:
    json.dump(documento, arquivo, ensure_ascii=False, indent=1)

incompletos = [codigo for codigo, reg in registros.items() if not reg["completo"]]
print(f"{len(cabecalhos)} cabeçalhos; {len(registros)} registros; "
      f"{sum(len(reg['campos']) for reg in registros.values())} campos; incompletos: {incompletos}")
