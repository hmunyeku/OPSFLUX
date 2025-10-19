# Systeme de cles API utilisateur - Quick Start

## TL;DR

Un systeme complet de cles API personnelles pour chaque utilisateur avec securisation de /docs et /openapi.json.

## Documentation

- **📘 Documentation complete**: `USER_API_KEY_IMPLEMENTATION.md`
- **📋 Resume d'implementation**: `IMPLEMENTATION_SUMMARY.md`

## Deploiement rapide

```bash
# 1. Appliquer la migration
cd backend
uv run alembic upgrade head

# 2. Demarrer le serveur
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 3. Tester
uv run python test_api_key_generation.py
./test_api_key_integration.sh
```

## Utilisation rapide

### 1. Generer une cle (avec JWT)

```bash
# Se connecter
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/login/access-token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@example.com&password=changethis" \
  | jq -r '.access_token')

# Generer la cle
curl -X POST http://localhost:8000/api/v1/users/me/api-key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My API Key"}' \
  | jq

# Reponse: {"key": "ofs_xxxxx..."} <- SAUVEGARDER!
```

### 2. Utiliser la cle

```bash
# Acceder a n'importe quel endpoint
curl -X GET http://localhost:8000/api/v1/users/me \
  -H "X-API-Key: ofs_xxxxx..."
```

### 3. Acceder a /docs

1. Installer extension navigateur: **ModHeader**
2. Ajouter header: `X-API-Key: ofs_xxxxx...`
3. Acceder a: `http://localhost:8000/docs`

## Fichiers crees

### Backend
- `backend/app/models_api_keys.py` - Modele UserApiKey
- `backend/app/core/api_key_auth.py` - Middleware d'authentification
- `backend/app/api/routes/user_api_keys.py` - Routes API
- `backend/app/alembic/versions/p1q2r3s4t5u6_add_user_api_key_table.py` - Migration

### Tests
- `backend/test_api_key_generation.py` - Test unitaire
- `backend/test_api_key_integration.sh` - Test d'integration

### Documentation
- `USER_API_KEY_IMPLEMENTATION.md` - Documentation complete
- `IMPLEMENTATION_SUMMARY.md` - Resume d'implementation
- `README_API_KEYS.md` - Ce fichier

## Fichiers modifies

- `backend/app/models.py` - Ajout relation user_api_keys
- `backend/app/api/main.py` - Enregistrement routes
- `backend/app/main.py` - Securisation /docs et /openapi.json

## Endpoints API

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/v1/users/me/api-key` | Generer une cle |
| GET | `/api/v1/users/me/api-key` | Consulter sa cle |
| GET | `/api/v1/users/me/api-key/all` | Historique |
| DELETE | `/api/v1/users/me/api-key` | Revoquer |
| PUT | `/api/v1/users/me/api-key/regenerate` | Regenerer |

## Fonctionnalites

- ✅ Generation de cles securisees (SHA256)
- ✅ Prefixe `ofs_` pour identification
- ✅ Une seule cle active par utilisateur
- ✅ Revocation automatique lors de regeneration
- ✅ Protection de /docs et /openapi.json
- ✅ Tracking de `last_used_at`
- ✅ Soft delete avec audit trail complet

## Securite

- 🔒 Cles hashees en SHA256 (jamais en clair)
- 🔒 Cle complete affichee UNE SEULE FOIS
- 🔒 Verification: format, validite, expiration, utilisateur actif
- 🔒 Utiliser HTTPS en production
- 🔒 Stocker les cles en lieu sur

## Tests

```bash
# Test unitaire
cd backend
uv run python test_api_key_generation.py

# Test d'integration
./test_api_key_integration.sh

# Avec utilisateur personnalise
TEST_EMAIL=user@example.com TEST_PASSWORD=pass ./test_api_key_integration.sh
```

## Troubleshooting

| Erreur | Solution |
|--------|----------|
| "API Key required" | Ajouter header `X-API-Key: ofs_xxxxx...` |
| "Invalid API Key format" | Verifier que la cle commence par `ofs_` |
| "Invalid or inactive API Key" | Generer une nouvelle cle |
| /docs ne s'affiche pas | Installer ModHeader + ajouter header X-API-Key |

## Support

1. Consulter `USER_API_KEY_IMPLEMENTATION.md`
2. Executer tests: `./test_api_key_integration.sh`
3. Verifier logs backend
4. Verifier migration: `uv run alembic current`

---

**Status**: ✅ Complete et testee
**Date**: 2025-10-18
