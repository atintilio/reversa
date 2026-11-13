# Extração EFD-Contribuições v1.35

Fonte: Guia Prático EFD-Contribuições v1.35, atualização de 18/06/2021.

- 203 registros identificados no PDF oficial.
- A extração é determinística e não usa IA.
- Um registro só recebe `completo=true` quando contém exatamente as posições `1..N`, sem lacunas nem repetições, e começa por `REG`.
- Tabelas quebradas entre páginas e variantes históricas que o PDF mantém na mesma seção ficam marcadas como incompletas. Elas não devem alimentar um motor até reconciliação visual com a tabela oficial.
- `C100`, `M210` e `M610` permanecem pendentes porque a extração textual mistura uma repetição ou mais de uma versão da tabela. O catálogo não escolhe silenciosamente uma delas.

Reprodução:

```sh
python3 -I scripts/extrai-guia-efd-contribuicoes.py <guia-extraido.txt> lib/sped/leiautes/efd_contribuicoes.json
node --test tests/catalogo-efd-contribuicoes.test.js
```
