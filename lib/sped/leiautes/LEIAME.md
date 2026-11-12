# Catálogo de leiautes SPED (em construção)

Arquivos `*.base.json`: registros e campos extraídos do python-sped, **sem tamanhos** e **sem versão de leiaute**.
Todos marcados `[VALIDAR]` contra o Guia Prático oficial vigente.

## Defeitos conhecidos da base (conferidos em 12/11/2026 contra os motores do Reversa)
- `efd_contribuicoes` C100: campo 6 está como `COD_SIT;` (erro de digitação) e `CHV_NFE` aparece duplicado (posições 9 e 10); tudo depois dele fica deslocado em 1.
- `efd_contribuicoes` M210: leiaute antigo (13 campos); o Reversa usa o atual (inclui ajustes de base, com 15+ campos).
- Nomes de C181/C185 e C170 (PIS/COFINS) divergem só no rótulo (mesma posição).
- EFD ICMS/IPI cobre 201 registros e não traz os campos de COD_VER 019 a 021.
Onde o catálogo e os motores divergem, **vale o motor atual** até a conferência com a fonte oficial.

Reprodutibilidade: `PYTHON_SPED=<pasta do clone> python3 -I scripts/extrai-leiautes-python-sped.py` e `node scripts/compara-leiautes.js`.
