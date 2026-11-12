# Imagem do Reversa. Contexto de build = raiz do projeto (ver docker-compose.yml).
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# Instala somente dependencias de producao (camada em cache enquanto o lock nao mudar).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia o projeto (o que fica de fora esta em deploy/Dockerfile.dockerignore).
COPY . .

# Usuario nao-root (o usuario "node" ja existe na imagem oficial).
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
