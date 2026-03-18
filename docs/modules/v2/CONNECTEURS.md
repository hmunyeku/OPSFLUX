# Module Connecteurs — Spécification

> **Phase** : v2
> **Dépendances** : Core (multi-tenant, RBAC, audit), Dashboard (widgets), ReportEditor (DynamicDataBlock)
>
> Le module Connecteurs permet d'intégrer des sources de données externes dans OpsFlux.
> Les données importées alimentent les widgets du Dashboard et les sections "données connectées" des documents.

---

## 1. Vue d'ensemble

Le module Connecteurs fournit un framework unifié pour :
- Se connecter à des sources de données externes (fichiers, APIs, bases de données, exports DCS)
- Transformer les données brutes via un pipeline visuel
- Planifier la synchronisation automatique
- Exposer les données transformées aux widgets Dashboard et aux DynamicDataBlock du ReportEditor

---

## 2. Types de connecteurs

### 2.1 Connecteur Fichier (Excel/CSV)

- Upload manuel d'un fichier Excel (.xlsx) ou CSV
- Configuration : encodage (UTF-8, Latin-1), séparateur (virgule, point-virgule, tabulation), ligne d'en-tête
- Pour les fichiers Excel : sélection de l'onglet source
- Rafraîchissement : upload manuel d'une nouvelle version du fichier
- Optionnel : chemin réseau partagé pour import automatique périodique

### 2.2 Connecteur API REST

- Configuration : URL, méthode HTTP (GET/POST), en-têtes personnalisés, corps de requête (pour POST)
- Authentification : sans auth, clé API (header ou query param), Basic Auth, OAuth2 (client credentials)
- Extraction des données : JSONPath pour extraire le tableau de données depuis la réponse JSON
- Pagination : support automatique (offset/limit, cursor, next_url)
- Fréquence de rafraîchissement configurable

### 2.3 Connecteur Export DCS (Rockwell/Allen-Bradley)

- Variante spécialisée du connecteur CSV pour les exports DCS
- Configuration : chemin réseau du fichier d'export, mapping colonnes → tags DCS
- Détection automatique des colonnes timestamp, valeur, qualité
- Rafraîchissement : toutes les 5-60 minutes selon la configuration

### 2.4 Connecteur Base de données

- Connexion directe à une base de données externe : SQL Server, PostgreSQL, MySQL, Oracle
- Configuration : host, port, database, user, password (chiffré)
- Requête SQL d'extraction (SELECT uniquement — pas de modification)
- Timeout configurable (défaut 30s, max 120s)
- Fréquence de rafraîchissement configurable

---

## 3. Pipeline de transformation

Chaque connecteur peut avoir un pipeline de transformations appliquées aux données brutes :

| Étape | Description |
|---|---|
| **Renommer** | Renommer une ou plusieurs colonnes |
| **Filtrer** | Filtrer les lignes selon une condition (colonne, opérateur, valeur) |
| **Calculer** | Créer une colonne calculée (formule sur les colonnes existantes) |
| **Formater** | Appliquer un format (date, nombre, devise) |
| **Agréger** | Grouper par colonne(s) et appliquer une fonction (somme, moyenne, min, max, count) |

- Les étapes sont ordonnées et exécutées séquentiellement
- **Prévisualisation** : après chaque étape, affichage des 5 premières lignes du résultat
- Les transformations sont sauvegardées en JSONB et rejouées à chaque synchronisation

---

## 4. Planification et synchronisation

| Fréquence | Description |
|---|---|
| Manuelle | Synchronisation uniquement sur clic "Rafraîchir" |
| Toutes les 5 min | Pour les données temps réel (DCS) |
| Toutes les 15 min | |
| Toutes les 30 min | |
| Toutes les heures | |
| Toutes les 6 heures | |
| Toutes les 12 heures | |
| Quotidien à HH:MM | Pour les rapports quotidiens |
| Hebdomadaire jour + HH:MM | Pour les rapports hebdomadaires |

- Job APScheduler pour chaque connecteur avec synchronisation active
- Statut de dernière synchronisation affiché : date/heure, durée, nombre de lignes, succès/échec
- En cas d'échec : notification email à l'administrateur du connecteur, retry automatique après 5 min (max 3 retries)
- Historique des 50 dernières synchronisations conservé

---

## 5. Test et aperçu

- Bouton "Tester la connexion" : vérifie que la source est accessible et retourne un échantillon de 5 lignes
- Bouton "Aperçu des données" : exécute la requête/l'import et affiche les 20 premières lignes avec les types détectés
- Le connecteur ne peut être activé qu'après un test réussi

---

## 6. Sécurité

- **Chiffrement des credentials** : tous les mots de passe, tokens et clés API sont chiffrés en base (AES-256 via `SECRET_KEY`)
- **Isolation par tenant** : chaque connecteur appartient à un tenant, pas d'accès cross-tenant
- **Accès restreint** : seuls les `tenant_admin` et utilisateurs avec permission `connector.manage` peuvent créer/modifier des connecteurs
- **Requêtes SQL en lecture seule** : les connecteurs base de données n'exécutent que des SELECT. Toute requête contenant INSERT/UPDATE/DELETE/DROP/ALTER est rejetée
- **Timeout** : toutes les requêtes ont un timeout configurable (défaut 30s) pour éviter les requêtes longues

---

## 7. Utilisation dans les modules

### 7.1 Dashboard

- Lors de la configuration d'un widget, l'utilisateur peut sélectionner un connecteur comme source de données
- Le widget affiche les données du connecteur après application du pipeline de transformation
- Rafraîchissement du widget = rafraîchissement des données du connecteur

### 7.2 Report Editor

- Les DynamicDataBlock des documents peuvent référencer un connecteur
- Les données sont figées (snapshot) au moment de l'export PDF
- En mode édition, les données sont live (dernière synchronisation)

---

## 8. Modèle de données

```sql
CREATE TABLE connectors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id       UUID NOT NULL REFERENCES entities(id),
    name            VARCHAR(200) NOT NULL,
    connector_type  VARCHAR(30) NOT NULL,  -- file | api_rest | dcs_rockwell | database
    config          JSONB NOT NULL,        -- configuration spécifique au type (chiffrée pour les credentials)
    pipeline        JSONB DEFAULT '[]',    -- étapes de transformation ordonnées
    schedule_type   VARCHAR(30) DEFAULT 'manual',  -- manual | interval | daily | weekly
    schedule_config JSONB,                 -- détails du planning (interval_minutes, time, day_of_week)
    is_active       BOOLEAN DEFAULT true,
    last_sync_at    TIMESTAMPTZ,
    last_sync_status VARCHAR(20),          -- success | error | running
    last_sync_rows  INTEGER,
    last_sync_error TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_connectors_entity ON connectors(entity_id, is_active);
CREATE INDEX idx_connectors_schedule ON connectors(schedule_type) WHERE is_active = true;

CREATE TABLE connector_sync_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id    UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL,  -- success | error | timeout
    rows_count      INTEGER,
    duration_ms     INTEGER,
    error_message   TEXT,
    triggered_by    VARCHAR(20) NOT NULL   -- schedule | manual | retry
);
CREATE INDEX idx_sync_history ON connector_sync_history(connector_id, started_at DESC);

CREATE TABLE connector_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id    UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    data            JSONB NOT NULL,        -- tableau de lignes après transformation
    columns         JSONB NOT NULL,        -- métadonnées des colonnes (nom, type détecté)
    synced_at       TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_connector_data ON connector_data(connector_id);
```

---

## 9. API Endpoints

```
# CRUD Connecteurs
GET    /api/v1/connectors                    Liste des connecteurs (entity_id)
POST   /api/v1/connectors                    Créer un connecteur
GET    /api/v1/connectors/:id                Détail d'un connecteur
PATCH  /api/v1/connectors/:id                Modifier un connecteur
DELETE /api/v1/connectors/:id                Archiver un connecteur

# Test et sync
POST   /api/v1/connectors/:id/test           Tester la connexion
POST   /api/v1/connectors/:id/sync           Déclencher une synchronisation manuelle
GET    /api/v1/connectors/:id/preview        Aperçu des données (20 premières lignes)
GET    /api/v1/connectors/:id/data           Données transformées complètes

# Historique
GET    /api/v1/connectors/:id/history        Historique des synchronisations

# Pipeline
PUT    /api/v1/connectors/:id/pipeline       Mettre à jour le pipeline de transformation
POST   /api/v1/connectors/:id/pipeline/preview  Prévisualiser le résultat du pipeline
```

---

## 10. Permissions

| Permission | Description |
|---|---|
| `connector.read` | Voir les connecteurs et leurs données |
| `connector.manage` | Créer, modifier, supprimer des connecteurs |
| `connector.sync` | Déclencher une synchronisation manuelle |

---

## 11. Enregistrement module

```python
def register(registry: ModuleRegistry):
    registry.add_routes(router, prefix="/api/v1/connectors")
    registry.add_permissions([
        "connector.read",
        "connector.manage",
        "connector.sync",
    ])
    registry.add_roles([
        Role("CONNECTOR_ADMIN", permissions=["connector.read", "connector.manage", "connector.sync"]),
    ])
```
