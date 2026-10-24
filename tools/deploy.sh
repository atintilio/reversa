#!/usr/bin/env bash
# Deploy do Reversa (Tax + Gov) na Vercel.
#
# Caminho A — GitHub (recomendado): a branch vai para main e a Vercel faz o
# auto-deploy do projeto já ligado ao repositório (reversa-xi.vercel.app).
#   GITHUB_TOKEN=ghp_xxx ./tools/deploy.sh
#
# Caminho B — Vercel direto: publica direto na Vercel com o token da equipe.
#   VERCEL_TOKEN=xxx ./tools/deploy.sh
#
# Sem token nenhum o script não faz nada: o sandbox não tem credencial de deploy.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-feat/reversa-gov}"
REMOTE="${REMOTE:-https://github.com/atintilio/reversa.git}"
TARGET="${TARGET:-main}"

cd "$REPO_DIR"

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  echo "==> Caminho A: push para $REMOTE ($TARGET) — a Vercel auto-deploya."
  git remote set-url origin "$REMOTE"
  git push "$GITHUB_TOKEN@github.com:atintilio/reversa.git" "HEAD:$TARGET" --force-with-lease
  echo "==> Push concluído. Acompanhe em: https://vercel.com/atintilio"
  exit 0
fi

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  echo "==> Caminho B: vercel --prod."
  vercel whoami
  vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
  vercel build --prod --token="$VERCEL_TOKEN"
  vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
  echo "==> Deploy publicado."
  exit 0
fi

cat <<'EOF'
Falta credencial de deploy.

  Caminho A (recomendado — a Vercel já está ligada ao repositório e auto-deploya):
      export GITHUB_TOKEN=ghp_xxx      # escopo: repo
  Caminho B (deploy direto pela CLI):
      export VERCEL_TOKEN=xxx          # token da equipe na Vercel

Depois:  ./tools/deploy.sh
EOF
exit 1
