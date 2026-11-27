# Ingestão documental — Cloudflare + VPS

O comando envia originais para o cliente no Reversa online. Não calcula tributos.

## Preparação do servidor

Configure `REVERSA_DOCUMENT_ROOT=/var/lib/reversa/documents` no ambiente do serviço.
Crie esse diretório fora do repositório, com acesso exclusivo ao usuário do serviço.
Instale o código atualizado e reinicie o serviço da VPS.
O storage organiza documentos por organização, cliente e SHA-256.

## Envio

Use o ID do cliente e um arquivo local privado contendo somente o cookie de sessão
`rv_sessao=...`, obtido de uma sessão autorizada do Reversa. Proteja esse arquivo
com modo `600`; não o inclua no Git ou em relatórios. Cookies não são exibidos pelo CLI.

```sh
npm run reversa-cli -- ingest "/pasta/do/cliente" "https://reversa.argusprime.com.br" "ID_CLIENTE" "/caminho/privado/sessao.txt"
```

Envio em blocos de 256 KB, até 256 MB por arquivo. Ao repetir o comando, arquivos
completos são reconhecidos pelo hash e os incompletos retomam do último bloco recebido.
Cada falha fica na saída com o caminho e o motivo; outros arquivos continuam.
Se a sessão expirar, renove-a no mesmo serviço e execute novamente.
ZIPs são preservados como originais; sua extração para cálculo usa o leitor web existente.

## Tela

Selecione o cliente antes de escolher os documentos. O indicador de armazenamento
confirma o recebimento dos originais; a fila mostra o resultado da leitura de cada documento.
Leitura local e armazenamento são estados separados: uma falha de envio permanece visível.

Em “Inventário e documentos pendentes”, registre a obrigação e competência esperadas.
Para “Declaração não encontrada no e-CAC”, preencha perfil, referência e data da consulta.
As pendências ficam no inventário do cliente e não interrompem os demais documentos.
