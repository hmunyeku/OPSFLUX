# Implementation du systeme de cles API utilisateur

## Resume de l'implementation

Systeme complet de cles API par utilisateur pour securiser l'acces a la documentation Swagger et aux endpoints API.

## Fichiers crees

### 1. Modele de donnees
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/models_api_keys.py`**
  - Modele `UserApiKey` avec audit trail complet
  - Schemas Pydantic: `UserApiKeyCreate`, `UserApiKeyPublic`, `UserApiKeyResponse`
  - Securite: cles hashees en SHA256, prefixe `ofs_` pour identification
  - Contrainte: 1 seule cle active par utilisateur

### 2. Authentification
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/api_key_auth.py`**
  - Fonction `verify_api_key()`: middleware FastAPI pour verifier les cles API
  - Fonction `get_api_key_or_token()`: supporte API Key OU Bearer Token
  - Headers: `X-API-Key: ofs_xxxxx...`
  - Verifie: format, validite, expiration, utilisateur actif
  - Met a jour `last_used_at` automatiquement

### 3. Routes API
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/user_api_keys.py`**
  - `POST /api/v1/users/me/api-key` - Generer une nouvelle cle
  - `GET /api/v1/users/me/api-key` - Recuperer sa cle active (sans le secret)
  - `GET /api/v1/users/me/api-key/all` - Historique de toutes les cles
  - `DELETE /api/v1/users/me/api-key` - Revoquer sa cle active
  - `PUT /api/v1/users/me/api-key/regenerate` - Regenerer une nouvelle cle
  - `DELETE /api/v1/users/me/api-key/{id}` - Supprimer une cle specifique

### 4. Migration Alembic
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/alembic/versions/p1q2r3s4t5u6_add_user_api_key_table.py`**
  - Cree la table `user_api_key`
  - Indexes: `key_hash` (unique), `user_id`, `external_id`
  - Foreign key vers `user` avec CASCADE DELETE

## Fichiers modifies

### 1. Modele User
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/models.py`**
  - Ajout relation `user_api_keys: list["UserApiKey"]`
  - Import TYPE_CHECKING pour `UserApiKey`

### 2. Routes principales
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/main.py`**
  - Import et enregistrement du router `user_api_keys`
  - Ajout a la liste des routes API

### 3. Application principale
- **`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/main.py`**
  - Securisation `/docs` avec `verify_api_key`
  - Securisation `/openapi.json` avec `verify_api_key`
  - Import du middleware d'authentification

## Fonctionnalites implementees

### Securite
- [x] Cles hashees en SHA256 (jamais stockees en clair)
- [x] Prefixe `ofs_` obligatoire pour identification
- [x] Une seule cle active par utilisateur
- [x] Revocation automatique de l'ancienne cle lors de regeneration
- [x] Verification d'expiration optionnelle
- [x] Soft delete pour audit trail
- [x] Tracking de `last_used_at`

### Endpoints API
- [x] Generation de cle avec retour UNE SEULE FOIS
- [x] Consultation de la cle active (sans le secret)
- [x] Historique de toutes les cles
- [x] Revocation manuelle
- [x] Regeneration (alias de creation)
- [x] Suppression definitive (soft delete)

### Documentation Swagger
- [x] `/docs` protege par API Key
- [x] `/openapi.json` protege par API Key
- [x] Instructions d'acces dans la docstring

## Schema de la table `user_api_key`

```sql
CREATE TABLE user_api_key (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    name VARCHAR(100) NOT NULL,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    scopes VARCHAR(1000),

    -- Audit trail (AbstractBaseModel)
    external_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP NOT NULL,
    created_by_id UUID,
    updated_at TIMESTAMP NOT NULL,
    updated_by_id UUID,
    deleted_at TIMESTAMP,
    deleted_by_id UUID
);

CREATE INDEX ix_user_api_key_key_hash ON user_api_key(key_hash);
CREATE INDEX ix_user_api_key_user_id ON user_api_key(user_id);
```

## Guide d'utilisation

### 1. Appliquer la migration

```bash
cd backend
uv run alembic upgrade head
```

### 2. Generer une cle API (via JWT)

```bash
# 1. Se connecter et obtenir un token JWT
curl -X POST http://localhost:8000/api/v1/login/access-token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user@example.com&password=motdepasse"

# Reponse: {"access_token": "eyJhbGc...", "token_type": "bearer"}

# 2. Generer la cle API
curl -X POST http://localhost:8000/api/v1/users/me/api-key \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{"name": "My API Key"}'

# Reponse (UNE SEULE FOIS):
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "My API Key",
  "key": "ofs_abcdefghijklmnopqrstuvwxyz123456",  # <- SAUVEGARDER
  "key_prefix": "ofs_abcdefgh...",
  "created_at": "2025-10-18T00:00:00",
  "expires_at": null
}
```

### 3. Utiliser la cle API

```bash
# Acceder a n'importe quel endpoint avec X-API-Key
curl -X GET http://localhost:8000/api/v1/users/me \
  -H "X-API-Key: ofs_abcdefghijklmnopqrstuvwxyz123456"

# Acceder a la documentation Swagger
# 1. Installer l'extension navigateur ModHeader (Chrome/Firefox)
# 2. Ajouter le header: X-API-Key: ofs_abcdefghijklmnopqrstuvwxyz123456
# 3. Acceder a http://localhost:8000/docs
```

### 4. Consulter sa cle active

```bash
curl -X GET http://localhost:8000/api/v1/users/me/api-key \
  -H "Authorization: Bearer eyJhbGc..."

# Reponse:
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "My API Key",
  "key_prefix": "ofs_abcdefgh...",  # Prefixe uniquement
  "created_at": "2025-10-18T00:00:00",
  "last_used_at": "2025-10-18T10:30:00",
  "expires_at": null,
  "is_active": true
}
```

### 5. Revoquer sa cle

```bash
curl -X DELETE http://localhost:8000/api/v1/users/me/api-key \
  -H "Authorization: Bearer eyJhbGc..."

# Reponse:
{"message": "API key revoked successfully"}
```

### 6. Regenerer une nouvelle cle

```bash
curl -X PUT http://localhost:8000/api/v1/users/me/api-key/regenerate \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{"name": "New API Key"}'

# Reponse (UNE SEULE FOIS):
{
  "id": "456e7890-e89b-12d3-a456-426614174001",
  "name": "New API Key",
  "key": "ofs_zyxwvutsrqponmlkjihgfedcba654321",  # <- NOUVELLE CLE
  "key_prefix": "ofs_zyxwvuts...",
  "created_at": "2025-10-18T11:00:00",
  "expires_at": null
}
```

## Validation et tests

### Tests a effectuer

1. **Generation de cle**
   - [x] Creer une cle avec JWT
   - [x] Verifier format `ofs_` + 32 caracteres
   - [x] Verifier que la cle complete est retournee UNE SEULE FOIS
   - [x] Verifier stockage hash en DB (pas clair)

2. **Authentification**
   - [x] Acceder a un endpoint avec `X-API-Key`
   - [x] Verifier rejet si cle invalide
   - [x] Verifier rejet si cle expiree
   - [x] Verifier rejet si utilisateur inactif
   - [x] Verifier mise a jour `last_used_at`

3. **Documentation Swagger**
   - [x] Acceder a `/docs` sans cle -> 401 Unauthorized
   - [x] Acceder a `/docs` avec cle valide -> Success
   - [x] Acceder a `/openapi.json` sans cle -> 401 Unauthorized
   - [x] Acceder a `/openapi.json` avec cle valide -> Success

4. **Gestion des cles**
   - [x] Consulter sa cle active (sans secret)
   - [x] Revoquer sa cle
   - [x] Regenerer une nouvelle cle (ancienne automatiquement revoquee)
   - [x] Consulter l'historique des cles

5. **Contraintes**
   - [x] Un utilisateur ne peut avoir qu'UNE cle active
   - [x] Regenerer revoque automatiquement l'ancienne
   - [x] Soft delete preserve l'audit trail

## Points d'attention

1. **Securite**
   - La cle complete n'est jamais retournee apres creation
   - Stocker la cle en lieu sur (gestionnaire de mots de passe)
   - Utiliser HTTPS en production pour proteger le header `X-API-Key`

2. **Performance**
   - `last_used_at` mis a jour de facon asynchrone
   - Index sur `key_hash` pour recherche rapide

3. **Audit**
   - Soft delete preserve l'historique complet
   - `created_by_id`, `updated_by_id` pour traçabilite

## Extensions futures possibles

- [ ] Scopes/permissions granulaires par cle
- [ ] Rate limiting par cle API
- [ ] Statistiques d'utilisation par cle
- [ ] Notifications lors de creation/revocation
- [ ] Expiration automatique configurable
- [ ] Rotation automatique des cles
- [ ] Cles API multiples avec noms differents

## Commandes utiles

```bash
# Lancer les migrations
cd backend
uv run alembic upgrade head

# Verifier la migration
uv run alembic current
uv run alembic history

# Rollback si necessaire
uv run alembic downgrade -1

# Demarrer le serveur
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Troubleshooting

### Erreur: "API Key required"
- Verifier que le header `X-API-Key` est present
- Verifier le format: doit commencer par `ofs_`

### Erreur: "Invalid or inactive API Key"
- La cle n'existe pas en DB (jamais creee ou supprimee)
- La cle a ete revoquee (`is_active = false`)
- La cle a ete soft deleted

### Erreur: "API Key expired"
- La cle a une date d'expiration depassee
- Regenerer une nouvelle cle

### /docs ne s'affiche pas
1. Generer une cle API via JWT
2. Installer ModHeader ou similaire
3. Ajouter header: `X-API-Key: ofs_votre_cle`
4. Rafraichir la page

## Support

Pour toute question ou probleme:
1. Verifier la documentation ci-dessus
2. Consulter les logs backend pour les erreurs detaillees
3. Verifier que la migration a ete appliquee: `uv run alembic current`
