#!/bin/bash

################################################################################
# Script de création de module OpsFlux
#
# Ce script crée un nouveau module à partir du template avec remplacement
# automatique des placeholders.
#
# Usage:
#   ./create-module.sh mon-nouveau-module "Mon Nouveau Module" "Votre Nom"
#
# Arguments:
#   $1: Code du module (kebab-case, ex: inventory-management)
#   $2: Nom du module (ex: "Inventory Management")
#   $3: Auteur (ex: "John Doe") [optionnel]
################################################################################

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'aide
show_help() {
    echo -e "${BLUE}Usage:${NC}"
    echo -e "  ./create-module.sh <module-code> <module-name> [author]"
    echo ""
    echo -e "${BLUE}Exemples:${NC}"
    echo -e "  ./create-module.sh inventory-management \"Inventory Management\""
    echo -e "  ./create-module.sh hr-management \"HR Management\" \"John Doe\""
    echo ""
    echo -e "${BLUE}Arguments:${NC}"
    echo -e "  module-code    Code du module en kebab-case (ex: inventory-management)"
    echo -e "  module-name    Nom du module (ex: \"Inventory Management\")"
    echo -e "  author         Auteur du module [optionnel]"
}

# Vérifier les arguments
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    show_help
    exit 0
fi

if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}❌ Erreur: Arguments manquants${NC}"
    echo ""
    show_help
    exit 1
fi

MODULE_CODE=$1
MODULE_NAME=$2
AUTHOR=${3:-"OpsFlux Team"}

# Validation du code du module
if [[ ! $MODULE_CODE =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo -e "${RED}❌ Erreur: Le code du module doit être en kebab-case (ex: inventory-management)${NC}"
    exit 1
fi

# Vérifier que le module n'existe pas déjà
if [ -d "$MODULE_CODE" ]; then
    echo -e "${RED}❌ Erreur: Le module '$MODULE_CODE' existe déjà${NC}"
    exit 1
fi

# Convertir le code en CamelCase pour les noms de variables
# Ex: inventory-management -> InventoryManagement
MODULE_CAMEL=$(echo "$MODULE_CODE" | sed -r 's/(^|-)([a-z])/\U\2/g')

# Convertir en UPPER_CASE pour les constantes
# Ex: inventory-management -> INVENTORY_MANAGEMENT
MODULE_UPPER=$(echo "$MODULE_CODE" | tr '[:lower:]' '[:upper:]' | tr '-' '_')

echo -e "${BLUE}🚀 Création du module${NC}"
echo -e "  Code:   ${GREEN}$MODULE_CODE${NC}"
echo -e "  Nom:    ${GREEN}$MODULE_NAME${NC}"
echo -e "  Auteur: ${GREEN}$AUTHOR${NC}"
echo ""

# Copier le template
echo -e "${YELLOW}📦 Copie du template...${NC}"
cp -r _template "$MODULE_CODE"

# Fonction pour remplacer dans un fichier
replace_in_file() {
    local file=$1

    if [ ! -f "$file" ]; then
        return
    fi

    # Remplacer les placeholders
    sed -i "s/\[MODULE_CODE\]/$MODULE_CODE/g" "$file"
    sed -i "s/\[MODULE_NAME\]/$MODULE_NAME/g" "$file"
    sed -i "s/Votre Nom/$AUTHOR/g" "$file"
    sed -i "s/MyModule/${MODULE_CAMEL}Module/g" "$file"
    sed -i "s/MY_WIDGETS/${MODULE_UPPER}_WIDGETS/g" "$file"
}

# Remplacer dans tous les fichiers
echo -e "${YELLOW}✏️  Remplacement des placeholders...${NC}"
find "$MODULE_CODE" -type f | while read -r file; do
    replace_in_file "$file"
done

# Renommer le fichier README du template
if [ -f "$MODULE_CODE/README.md" ]; then
    rm "$MODULE_CODE/README.md"
fi

# Créer un README personnalisé pour le module
cat > "$MODULE_CODE/README.md" <<EOF
# $MODULE_NAME Module

Module de gestion $MODULE_NAME pour OpsFlux.

## Description

[Ajoutez ici une description détaillée de votre module]

## Fonctionnalités

- [ ] Fonctionnalité 1
- [ ] Fonctionnalité 2
- [ ] Fonctionnalité 3

## Structure

\`\`\`
$MODULE_CODE/
├── backend/                 # Code backend Python
│   ├── __init__.py
│   ├── register.py         # Script d'enregistrement
│   ├── api/                # Routes FastAPI
│   ├── models/             # Modèles SQLAlchemy
│   ├── schemas/            # Schémas Pydantic
│   └── services/           # Logique métier
└── frontend/               # Code frontend TypeScript/React
    ├── module.config.ts    # Configuration du module
    ├── index.ts            # Point d'entrée
    ├── types.ts            # Types TypeScript
    ├── api.ts              # Client API
    ├── components/         # Composants React
    └── widgets/            # Widgets pour dashboard
        └── registry.ts     # Registre des widgets
\`\`\`

## Installation

### 1. Enregistrer le module

\`\`\`bash
docker exec -it opsflux-backend python modules/$MODULE_CODE/backend/register.py
\`\`\`

### 2. Développer le backend

Ajoutez vos routes dans \`backend/api/routes.py\` :

\`\`\`python
from fastapi import APIRouter

router = APIRouter()

@router.get("/items")
async def get_items():
    return {"data": [], "total": 0}
\`\`\`

### 3. Développer le frontend

Créez vos widgets dans \`frontend/widgets/\` et enregistrez-les dans \`registry.ts\`.

### 4. Tester

Rechargez l'application, le module sera chargé automatiquement.

## Configuration

Le module est configuré dans \`frontend/module.config.ts\`. Vous pouvez :
- Ajouter des widgets
- Définir des routes personnalisées
- Implémenter des hooks d'initialisation/nettoyage

## API

[Documentez ici les endpoints de votre API]

## Widgets

[Listez et documentez vos widgets]

## Auteur

$AUTHOR

## Version

1.0.0
EOF

# Créer les dossiers manquants
mkdir -p "$MODULE_CODE/backend/api"
mkdir -p "$MODULE_CODE/backend/models"
mkdir -p "$MODULE_CODE/backend/schemas"
mkdir -p "$MODULE_CODE/backend/services"
mkdir -p "$MODULE_CODE/frontend/components"
mkdir -p "$MODULE_CODE/frontend/hooks"

# Afficher le résumé
echo ""
echo -e "${GREEN}✅ Module '$MODULE_CODE' créé avec succès !${NC}"
echo ""
echo -e "${BLUE}Prochaines étapes :${NC}"
echo -e "  1. ${YELLOW}cd $MODULE_CODE${NC}"
echo -e "  2. Développez votre module (backend + frontend)"
echo -e "  3. ${YELLOW}docker exec -it opsflux-backend python modules/$MODULE_CODE/backend/register.py${NC}"
echo -e "  4. Rechargez l'application pour voir votre module"
echo ""
echo -e "${BLUE}Fichiers importants :${NC}"
echo -e "  - ${GREEN}frontend/module.config.ts${NC}  Configuration du module"
echo -e "  - ${GREEN}frontend/widgets/registry.ts${NC}  Registre des widgets"
echo -e "  - ${GREEN}backend/register.py${NC}  Script d'enregistrement"
echo ""
echo -e "${BLUE}Documentation :${NC}"
echo -e "  Consultez ${GREEN}modules/README.md${NC} pour plus d'informations"
echo ""
