#!/bin/bash

# Script d'arrêt intelligent OPSFLUX
# Lit automatiquement la variable ENVIRONMENT depuis .env

set -e

# Couleurs
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    OPSFLUX - Arrêt des services${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Charger .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

ENVIRONMENT=${ENVIRONMENT:-local}

echo -e "${BLUE}Mode:${NC} $ENVIRONMENT"
echo ""

# Arrêt selon le mode
if [ "$ENVIRONMENT" = "local" ]; then
    echo -e "${YELLOW}🛑 Arrêt des services en mode développement...${NC}"
    docker-compose down "$@"
else
    echo -e "${YELLOW}🛑 Arrêt des services en mode production...${NC}"
    docker-compose -f docker-compose.yml down "$@"
fi

echo ""
echo -e "${RED}✓ Services arrêtés${NC}"
echo ""
echo -e "${BLUE}================================================${NC}"
