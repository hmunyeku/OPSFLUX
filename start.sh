#!/bin/bash

# Script de démarrage intelligent OPSFLUX
# Lit automatiquement la variable ENVIRONMENT depuis .env

set -e

# Couleurs pour l'affichage
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    OPSFLUX - Démarrage automatique${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Charger le fichier .env s'il existe
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}✓${NC} Fichier .env chargé"
else
    echo -e "${RED}✗${NC} Fichier .env introuvable!"
    echo -e "${YELLOW}➜${NC} Créez un fichier .env basé sur .env.example"
    exit 1
fi

# Déterminer le mode selon ENVIRONMENT
if [ -z "$ENVIRONMENT" ]; then
    echo -e "${YELLOW}⚠${NC}  Variable ENVIRONMENT non définie, utilisation de 'local' par défaut"
    ENVIRONMENT="local"
fi

echo -e "${BLUE}Mode détecté:${NC} $ENVIRONMENT"
echo ""

# Démarrage selon le mode
if [ "$ENVIRONMENT" = "local" ]; then
    echo -e "${GREEN}🚀 Démarrage en mode DÉVELOPPEMENT LOCAL${NC}"
    echo -e "${BLUE}   - Hot reload activé${NC}"
    echo -e "${BLUE}   - Ports mappés: Backend :8000, Frontend :3000, Adminer :8080${NC}"
    echo -e "${BLUE}   - Fichiers montés depuis: $(pwd)${NC}"
    echo ""

    # En mode local, docker-compose.override.yml s'applique automatiquement
    docker-compose up -d "$@"

    echo ""
    echo -e "${GREEN}✓ Services démarrés en mode développement${NC}"
    echo ""
    echo -e "${BLUE}Accès local:${NC}"
    echo -e "  Backend API:  ${GREEN}http://localhost:8000${NC}"
    echo -e "  Swagger UI:   ${GREEN}http://localhost:8000/api/schema/swagger-ui/${NC}"
    echo -e "  Frontend:     ${GREEN}http://localhost:3000${NC}"
    echo -e "  Adminer (DB): ${GREEN}http://localhost:8080${NC}"
    echo ""
    echo -e "${YELLOW}📝 Logs:${NC} docker-compose logs -f [service]"
    echo -e "${YELLOW}🛑 Arrêt:${NC} docker-compose down"

elif [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "staging" ]; then
    echo -e "${GREEN}🚀 Démarrage en mode PRODUCTION${NC}"
    echo -e "${BLUE}   - Traefik reverse proxy${NC}"
    echo -e "${BLUE}   - SSL automatique (Let's Encrypt)${NC}"
    echo -e "${BLUE}   - Domaine: ${DOMAIN}${NC}"
    echo ""

    # En mode production, ignorer docker-compose.override.yml
    docker-compose -f docker-compose.yml up -d "$@"

    echo ""
    echo -e "${GREEN}✓ Services démarrés en mode production${NC}"
    echo ""
    echo -e "${BLUE}Accès production:${NC}"
    echo -e "  Application: ${GREEN}https://${DOMAIN}${NC}"
    echo ""
    echo -e "${YELLOW}📝 Logs:${NC} docker-compose -f docker-compose.yml logs -f [service]"
    echo -e "${YELLOW}🛑 Arrêt:${NC} docker-compose -f docker-compose.yml down"

else
    echo -e "${RED}✗${NC} ENVIRONMENT invalide: '$ENVIRONMENT'"
    echo -e "${YELLOW}➜${NC} Valeurs acceptées: local, staging, production"
    exit 1
fi

echo ""
echo -e "${BLUE}================================================${NC}"
