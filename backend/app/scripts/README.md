# Scripts de Maintenance et Vérification

Ce dossier contient tous les scripts de maintenance, population de données et vérification pour OpsFlux.

## 📋 Table des matières

- [Scripts de Vérification](#scripts-de-vérification)
- [Scripts de Population](#scripts-de-population)
- [Scripts de Correction](#scripts-de-correction)
- [Ordre d'exécution recommandé](#ordre-dexécution-recommandé)

---

## 🔍 Scripts de Vérification

### `startup_check.py`
**Usage:** Exécuté automatiquement au démarrage du backend

Vérifie rapidement l'état de santé de la base de données :
- Connexion à la base
- Version Alembic
- Tables essentielles
- Rôles de base (admin, user)
- Présence des permissions core

```bash
python app/scripts/startup_check.py
```

### `verify_migrations.py`
**Usage:** Vérification complète post-migration

Effectue une vérification approfondie de toutes les migrations :
- Version Alembic
- Toutes les tables importantes
- Rôles et permissions
- Assignations rôles-permissions
- Colonnes spécifiques

```bash
# Vérification simple
python app/scripts/verify_migrations.py

# Avec suggestions de corrections
python app/scripts/verify_migrations.py --fix
```

### `fix_missing_tables.py`
**Usage:** Diagnostic des tables manquantes

Identifie les tables qui devraient exister mais sont absentes.

```bash
python app/scripts/fix_missing_tables.py
```

---

## 📊 Scripts de Population

### `populate_all_core_permissions.py`
**Description:** Peuple les 65 permissions core du système

Crée toutes les permissions essentielles pour :
- API Keys (5)
- Webhooks (5)
- Email Templates (5)
- Cache (5)
- Storage (5)
- Queue (5)
- Metrics (4)
- Hooks (5)
- Search (4)
- Audit (4)
- Bookmarks (4)
- Tasks (4)
- Users (5)
- Roles (5)

**Auto-assignation :**
- Toutes les permissions → rôle `admin`
- Permissions par défaut (default=True) → rôle `user`

```bash
python app/scripts/populate_all_core_permissions.py
```

### `populate_rbac_permissions.py`
**Description:** Peuple les permissions RBAC

Crée les permissions pour :
- Gestion des rôles (roles.*)
- Gestion des groupes (groups.*)
- Invitation d'utilisateurs (users.invite)

```bash
python app/scripts/populate_rbac_permissions.py
```

### `populate_default_groups.py`
**Description:** Crée les groupes organisationnels par défaut

Crée 10 groupes standard :
- Direction
- Département IT
- Ressources Humaines
- Finance & Comptabilité
- Opérations
- Support Client
- Ventes & Commercial
- Marketing
- Production
- QHSE

```bash
python app/scripts/populate_default_groups.py
```

### `populate_email_templates.py`
**Description:** Peuple les templates d'email par défaut

Crée les templates pour :
- Bienvenue
- Réinitialisation de mot de passe
- Invitation
- Notifications

```bash
python app/scripts/populate_email_templates.py
```

### `populate_missing_translations.py`
**Description:** Peuple les traductions manquantes pour l'i18n

```bash
python app/scripts/populate_missing_translations.py
```

### `populate_profile_translations.py`
**Description:** Peuple les traductions spécifiques au profil utilisateur

```bash
python app/scripts/populate_profile_translations.py
```

---

## 🔧 Scripts de Correction

### `assign_orphan_permissions.py`
**Description:** Assigne les permissions orphelines au rôle admin

Trouve toutes les permissions qui ne sont assignées à aucun rôle et les assigne au rôle `admin`.

```bash
python app/scripts/assign_orphan_permissions.py
```

### `create_missing_tables.py`
**Description:** Crée les tables manquantes directement depuis les modèles

Utilise les métadonnées SQLModel pour créer les tables sans passer par les migrations.

**⚠️ ATTENTION :** À utiliser uniquement en cas de problème avec les migrations.

```bash
python app/scripts/create_missing_tables.py
```

---

## 📝 Ordre d'exécution recommandé

### Après une nouvelle installation

```bash
# 1. Appliquer les migrations
uv run alembic upgrade head

# 2. Peupler les permissions core
uv run python app/scripts/populate_all_core_permissions.py

# 3. Peupler les permissions RBAC
uv run python app/scripts/populate_rbac_permissions.py

# 4. Peupler les groupes par défaut
uv run python app/scripts/populate_default_groups.py

# 5. Peupler les templates d'email
uv run python app/scripts/populate_email_templates.py

# 6. Assigner les permissions orphelines (si nécessaire)
uv run python app/scripts/assign_orphan_permissions.py

# 7. Vérifier que tout est OK
uv run python app/scripts/verify_migrations.py
```

### Après une mise à jour / migration

```bash
# 1. Appliquer les nouvelles migrations
uv run alembic upgrade head

# 2. Vérifier l'état
uv run python app/scripts/verify_migrations.py

# 3. Corriger les problèmes détectés (si nécessaire)
# - Exécuter les scripts de population suggérés
# - Assigner les permissions orphelines

# 4. Re-vérifier
uv run python app/scripts/verify_migrations.py
```

### En cas de problème

```bash
# 1. Diagnostic complet
uv run python app/scripts/verify_migrations.py

# 2. Identifier les tables manquantes
uv run python app/scripts/fix_missing_tables.py

# 3. Créer les tables manquantes (dernier recours)
uv run python app/scripts/create_missing_tables.py

# 4. Peupler les données manquantes
uv run python app/scripts/populate_all_core_permissions.py
uv run python app/scripts/assign_orphan_permissions.py

# 5. Vérifier à nouveau
uv run python app/scripts/verify_migrations.py
```

---

## 🚀 Intégration CI/CD

Ces scripts peuvent être intégrés dans votre pipeline CI/CD :

```yaml
# Exemple GitHub Actions
- name: Run migrations
  run: uv run alembic upgrade head

- name: Populate data
  run: |
    uv run python app/scripts/populate_all_core_permissions.py
    uv run python app/scripts/populate_default_groups.py

- name: Verify migrations
  run: uv run python app/scripts/verify_migrations.py
```

---

## 📚 Documentation complémentaire

- [Guide des migrations Alembic](../MIGRATIONS_GUIDE.md)
- [Documentation Alembic](https://alembic.sqlalchemy.org/)
- [Documentation SQLModel](https://sqlmodel.tiangolo.com/)

---

## 🆘 Support

En cas de problème :

1. Consulter les logs : `docker logs perenco-opsflux-gwxapr-backend-1`
2. Exécuter le script de vérification : `verify_migrations.py`
3. Consulter le guide des migrations : `MIGRATIONS_GUIDE.md`
4. Créer une issue sur le dépôt Git

---

**Dernière mise à jour :** 2025-10-21
