# Operação do Reversa: Cloudflare + VPS

Arquitetura vigente: Cloudflare → proxy HTTP da VPS → serviço Reversa (`server.js`).
O código está no GitHub. Um push não comprova atualização do serviço de produção.
As credenciais e a conexão do banco pertencem ao ambiente do serviço na VPS; nunca ao repositório.

## Atualização

1. Na VPS, verificar `/opt/reversa`, commit instalado, alterações locais e forma de execução do serviço.
2. Conferir o backup antes de migrations; atualizar somente com árvore de trabalho compatível.
3. Atualizar pelo GitHub com `git pull --ff-only`.
4. Quando houver preparação de banco, executar conscientemente `REVERSA_DEPLOY_ENV=production npm run build` com as variáveis do serviço carregadas.
5. Reiniciar o serviço identificado na VPS e conferir seu estado.
6. Validar `/api/health` localmente e no domínio público; conferir a funcionalidade alterada na tela.

Para instalação nativa, consulte `instala-sem-docker.sh`. Para containers, consulte `README.md`.
O rollback usa uma versão previamente verificada na própria VPS, preservando a compatibilidade do banco.
