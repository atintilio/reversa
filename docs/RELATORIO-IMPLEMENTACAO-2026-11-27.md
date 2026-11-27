# Implementação — 27/11/2026

Itens 1 a 6: API autenticada por cliente/organização com envio em blocos de 256 KB;
CLI recursivo de pasta; retomada e confirmação SHA-256; fila web sequencial aguardando
extração PDF; falhas individuais isoladas; recibos preservados; seleção de cliente;
inventário com original/retificadora quando identificável e lacunas com evidências.

Há formulário para registrar competência esperada e resultado da consulta. Recibo
não satisfaz declaração ausente. Documentos disponíveis continuam processáveis.
O código preserva os originais em diretório privado fora do repositório.

Verificação: nove testes automatizados aprovados de fila, inventário, storage, CLI e
API com dependências controladas, além da validação de sintaxe.

Operação: `INGESTAO-LINHA-DE-COMANDO.md`. Configurar `REVERSA_DOCUMENT_ROOT` no serviço
da VPS; `deploy/configura-storage.sh` prepara o diretório na instalação nativa.
ZIPs são preservados; extração para cálculo usa o leitor web. Identificação de PDF
por nome permanece marcada como aguardando extração.

Este registro comprova implementação e testes, não instalação na VPS nem
confirmação do valor da Personal. A lista integral permanece em `ACOMPANHAMENTO-35-DECISOES.md`.
