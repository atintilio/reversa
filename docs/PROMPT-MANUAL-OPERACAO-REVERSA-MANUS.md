# Briefing para o Manus — Manual de operação do Reversa

Produza um manual visual, em português do Brasil, para a operação diária do Reversa web. É geral para todos os clientes; não use Personal Design nem dados reais.

## Entregáveis

- PDF navegável e Markdown editável.
- Prints reais da versão publicada, com dados fictícios/semeados e CNPJ mascarado.
- Demonstração passo a passo por fluxo, com setas/numeração sobre cada print.
- Legenda de cada tela: objetivo, pré-condições, ação, resultado e ressalva.

## Regras do produto

1. O card sempre mostra o **potencial total**. Validado, aprovado e recuperado são desdobramentos, nunca substitutos.
2. O fluxo é: **Identificado → Validado → Aprovado → Retificado → Transmitido → Homologado → Recuperado**.
3. Diagnóstico é exibido para revisão humana. Não publicar, retificar, transmitir ou compensar sem aprovação e evidência.
4. Cada cliente tem workspace com documentos, diagnósticos versionados, histórico, decisões e próximos passos em até dois cliques.

## Roteiro mínimo de telas

1. Login, permissões e navegação global.
2. Dashboard: KPIs, potencial total, funil e busca.
3. Cadastro de cliente sem arquivo; Tax ID/CNPJ, regime e dados básicos.
4. Workspace: resumo, status, documentos, versões e auditoria.
5. Ingestão de PDF/XML/ZIP por CLI ou upload; original, manifesto, hashes e validação.
6. Diagnóstico: valor total, teses, premissas e evidências.
7. Revisão: aprovar/devolver/rejeitar com justificativa.
8. Retificação/transmissão: checklist, responsável, protocolo e bloqueios; transmissão depende do fluxo autorizado.
9. Compensação mensal: tarefa para contabilidade, e-mail, WhatsApp Business fallback, escalonamento e confirmação.
10. Histórico/versões, exportações executivo/técnico e segurança/LGPD.
11. Troubleshooting e glossário.

## Checklist de captura

- Viewport desktop e mobile; data/versão visível.
- Nunca capturar tokens, e-mails pessoais ou documentos reais.
- Mostrar estados vazio, carregando, sucesso, erro e bloqueio.
- Registrar rota, perfil, dados semeados e resultado esperado de cada print.
- Evitar duplicação de textos e valores sem contexto.

## Aceite

O leitor deve conseguir cadastrar cliente, abrir workspace, importar documentos, abrir diagnóstico, revisar oportunidade, acompanhar o ciclo completo e localizar versão anterior sem treinamento. Toda decisão fiscal sensível deve permanecer revisável e auditável.
