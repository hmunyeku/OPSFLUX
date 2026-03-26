#!/bin/bash
# =============================================================================
# OpsFlux VPS Deploy Script
# Usage: ssh root@72.60.188.156 'bash -s' < scripts/deploy-vps.sh [backend|frontend|both]
# =============================================================================
set -e
TARGET=${1:-both}
COMPOSE_DIR="/etc/dokploy/compose/opsflux-3gj1u6/code"
PROJECT="opsflux-3gj1u6"

cd "$COMPOSE_DIR"
git fetch origin && git reset --hard origin/main
echo "=== Code updated ==="

deploy_backend() {
  echo "=== Building backend ==="
  docker compose -p "$PROJECT" build --no-cache backend

  echo "=== Stopping old backend ==="
  # Stop any existing backend containers (both naming patterns)
  docker ps -a --filter "name=backend" --filter "label=com.docker.compose.project=$PROJECT" -q | xargs -r docker rm -f 2>/dev/null
  docker rm -f ${PROJECT}-backend-1 2>/dev/null || true

  echo "=== Starting backend with Traefik labels ==="
  docker run -d \
    --name ${PROJECT}-backend-1 \
    --network dokploy-network \
    --restart unless-stopped \
    --env-file "$COMPOSE_DIR/.env" \
    -v opsflux-3gj1u6_uploads_data:/opt/opsflux/static \
    -l "traefik.enable=true" \
    -l "traefik.docker.network=dokploy-network" \
    -l "traefik.http.routers.${PROJECT}-110-web.entrypoints=web" \
    -l "traefik.http.routers.${PROJECT}-110-web.middlewares=redirect-to-https@file" \
    -l "traefik.http.routers.${PROJECT}-110-web.rule=Host(\`api.opsflux.io\`)" \
    -l "traefik.http.routers.${PROJECT}-110-web.service=${PROJECT}-110-web" \
    -l "traefik.http.routers.${PROJECT}-110-websecure.entrypoints=websecure" \
    -l "traefik.http.routers.${PROJECT}-110-websecure.rule=Host(\`api.opsflux.io\`)" \
    -l "traefik.http.routers.${PROJECT}-110-websecure.service=${PROJECT}-110-websecure" \
    -l "traefik.http.routers.${PROJECT}-110-websecure.tls.certresolver=letsencrypt" \
    -l "traefik.http.services.${PROJECT}-110-web.loadbalancer.server.port=8000" \
    -l "traefik.http.services.${PROJECT}-110-websecure.loadbalancer.server.port=8000" \
    ${PROJECT}-backend

  # Connect to internal network for DB/Redis
  docker network connect ${PROJECT}_default ${PROJECT}-backend-1 2>/dev/null || true

  echo "=== Waiting for backend startup ==="
  sleep 12
  docker logs ${PROJECT}-backend-1 --tail 3
  echo ""
  STATUS=$(curl -sk -m5 -o /dev/null -w "%{http_code}" https://api.opsflux.io/api/v1/auth/sso/providers)
  echo "API status: $STATUS"
}

deploy_frontend() {
  echo "=== Building frontend ==="
  docker compose -p "$PROJECT" build --no-cache frontend

  echo "=== Stopping old frontend ==="
  docker rm -f ${PROJECT}-frontend-1 2>/dev/null || true

  echo "=== Starting frontend with Traefik labels ==="
  docker run -d \
    --name ${PROJECT}-frontend-1 \
    --network dokploy-network \
    --restart unless-stopped \
    -l "traefik.enable=true" \
    -l "traefik.docker.network=dokploy-network" \
    -l "traefik.http.routers.opsflux-frontend-web.entrypoints=web" \
    -l "traefik.http.routers.opsflux-frontend-web.middlewares=redirect-to-https@file" \
    -l "traefik.http.routers.opsflux-frontend-web.rule=Host(\`app.opsflux.io\`)" \
    -l "traefik.http.routers.opsflux-frontend-web.service=opsflux-frontend-web" \
    -l "traefik.http.routers.opsflux-frontend-websecure.entrypoints=websecure" \
    -l "traefik.http.routers.opsflux-frontend-websecure.rule=Host(\`app.opsflux.io\`)" \
    -l "traefik.http.routers.opsflux-frontend-websecure.service=opsflux-frontend-websecure" \
    -l "traefik.http.routers.opsflux-frontend-websecure.tls.certresolver=letsencrypt" \
    -l "traefik.http.services.opsflux-frontend-web.loadbalancer.server.port=80" \
    -l "traefik.http.services.opsflux-frontend-websecure.loadbalancer.server.port=80" \
    ${PROJECT}-frontend

  echo "=== Frontend deployed ==="
  sleep 2
  STATUS=$(curl -sk -m5 -o /dev/null -w "%{http_code}" https://app.opsflux.io/login)
  echo "Frontend status: $STATUS"
}

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  both)     deploy_backend && deploy_frontend ;;
  *)        echo "Usage: $0 [backend|frontend|both]"; exit 1 ;;
esac

echo "=== Deploy complete ==="
