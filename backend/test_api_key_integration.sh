#!/bin/bash
# Test d'integration complet pour les cles API utilisateur
# Ce script teste toutes les routes et fonctionnalites

set -e

API_URL="${API_URL:-http://localhost:8000}"
API_V1="$API_URL/api/v1"

echo "=================================================="
echo "Test d'integration - User API Keys"
echo "=================================================="
echo ""

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les resultats
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Variables
EMAIL="${TEST_EMAIL:-admin@example.com}"
PASSWORD="${TEST_PASSWORD:-changethis}"
JWT_TOKEN=""
API_KEY=""

echo "Configuration:"
echo "  API URL: $API_URL"
echo "  Email: $EMAIL"
echo ""

# 1. Authentification JWT
print_info "Etape 1/8: Authentification JWT..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_V1/login/access-token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$EMAIL&password=$PASSWORD")

JWT_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$JWT_TOKEN" ]; then
    print_error "Echec de l'authentification JWT"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

print_success "JWT Token obtenu: ${JWT_TOKEN:0:20}..."
echo ""

# 2. Generer une cle API
print_info "Etape 2/8: Generation d'une cle API..."
API_KEY_RESPONSE=$(curl -s -X POST "$API_V1/users/me/api-key" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test API Key"}')

API_KEY=$(echo $API_KEY_RESPONSE | grep -o '"key":"[^"]*' | grep -o '[^"]*$')
API_KEY_ID=$(echo $API_KEY_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')

if [ -z "$API_KEY" ]; then
    print_error "Echec de la generation de la cle API"
    echo "Response: $API_KEY_RESPONSE"
    exit 1
fi

# Verifier le format
if [[ ! $API_KEY =~ ^ofs_ ]]; then
    print_error "Format de cle invalide (doit commencer par 'ofs_')"
    echo "Cle: $API_KEY"
    exit 1
fi

print_success "Cle API generee: $API_KEY"
print_success "Format valide (commence par 'ofs_')"
echo ""

# 3. Consulter la cle active avec JWT
print_info "Etape 3/8: Consultation de la cle active (via JWT)..."
CURRENT_KEY=$(curl -s -X GET "$API_V1/users/me/api-key" \
  -H "Authorization: Bearer $JWT_TOKEN")

if [[ ! $CURRENT_KEY =~ "key_prefix" ]]; then
    print_error "Echec de la consultation de la cle"
    echo "Response: $CURRENT_KEY"
    exit 1
fi

print_success "Cle active recuperee (sans le secret complet)"
echo ""

# 4. Utiliser la cle API pour acceder a un endpoint
print_info "Etape 4/8: Test d'authentification avec X-API-Key..."
ME_RESPONSE=$(curl -s -X GET "$API_V1/users/me" \
  -H "X-API-Key: $API_KEY")

if [[ ! $ME_RESPONSE =~ "email" ]]; then
    print_error "Echec de l'authentification avec X-API-Key"
    echo "Response: $ME_RESPONSE"
    exit 1
fi

print_success "Authentification X-API-Key reussie"
echo ""

# 5. Tester l'acces a /openapi.json avec API Key
print_info "Etape 5/8: Test d'acces a /openapi.json avec API Key..."
OPENAPI_RESPONSE=$(curl -s -X GET "$API_URL/openapi.json" \
  -H "X-API-Key: $API_KEY")

if [[ ! $OPENAPI_RESPONSE =~ "openapi" ]]; then
    print_error "Echec d'acces a /openapi.json"
    echo "Response: $OPENAPI_RESPONSE"
    exit 1
fi

print_success "Acces a /openapi.json reussi avec API Key"
echo ""

# 6. Tester l'acces sans API Key (doit echouer)
print_info "Etape 6/8: Test d'acces a /openapi.json SANS API Key (doit echouer)..."
NO_KEY_RESPONSE=$(curl -s -w "%{http_code}" -X GET "$API_URL/openapi.json")
HTTP_CODE="${NO_KEY_RESPONSE: -3}"

if [ "$HTTP_CODE" != "401" ]; then
    print_error "L'acces devrait etre refuse sans API Key (code: $HTTP_CODE)"
    exit 1
fi

print_success "Acces refuse sans API Key (401 Unauthorized)"
echo ""

# 7. Consulter l'historique des cles
print_info "Etape 7/8: Consultation de l'historique des cles..."
ALL_KEYS=$(curl -s -X GET "$API_V1/users/me/api-key/all" \
  -H "Authorization: Bearer $JWT_TOKEN")

if [[ ! $ALL_KEYS =~ "count" ]]; then
    print_error "Echec de la consultation de l'historique"
    echo "Response: $ALL_KEYS"
    exit 1
fi

print_success "Historique des cles recupere"
echo ""

# 8. Revoquer la cle API
print_info "Etape 8/8: Revocation de la cle API..."
REVOKE_RESPONSE=$(curl -s -X DELETE "$API_V1/users/me/api-key" \
  -H "Authorization: Bearer $JWT_TOKEN")

if [[ ! $REVOKE_RESPONSE =~ "revoked successfully" ]]; then
    print_error "Echec de la revocation"
    echo "Response: $REVOKE_RESPONSE"
    exit 1
fi

print_success "Cle API revoquee avec succes"
echo ""

# 9. Tester que la cle revoquee ne fonctionne plus
print_info "Etape 9/8 (bonus): Verification que la cle revoquee ne fonctionne plus..."
REVOKED_TEST=$(curl -s -w "%{http_code}" -X GET "$API_V1/users/me" \
  -H "X-API-Key: $API_KEY")
REVOKED_HTTP_CODE="${REVOKED_TEST: -3}"

if [ "$REVOKED_HTTP_CODE" != "401" ]; then
    print_error "La cle revoquee devrait etre refusee (code: $REVOKED_HTTP_CODE)"
    exit 1
fi

print_success "Cle revoquee correctement refusee (401 Unauthorized)"
echo ""

# Résumé
echo "=================================================="
echo -e "${GREEN}TOUS LES TESTS PASSES AVEC SUCCES!${NC}"
echo "=================================================="
echo ""
echo "Tests executes:"
echo "  ✓ Authentification JWT"
echo "  ✓ Generation de cle API"
echo "  ✓ Format de cle valide (ofs_)"
echo "  ✓ Consultation de la cle active"
echo "  ✓ Authentification avec X-API-Key"
echo "  ✓ Acces a /openapi.json avec API Key"
echo "  ✓ Refus d'acces sans API Key"
echo "  ✓ Consultation de l'historique"
echo "  ✓ Revocation de cle"
echo "  ✓ Cle revoquee refusee"
echo ""
echo "Le systeme de cles API utilisateur fonctionne correctement!"
