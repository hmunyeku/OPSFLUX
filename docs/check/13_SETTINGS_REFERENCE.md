# OpsFlux — 13_SETTINGS_REFERENCE.md
# Référence complète de toutes les configurations

> Ce fichier est la source de vérité pour toutes les variables de configuration.
> 3 catégories :
> - **Infrastructure** : variables `.env` (backend + frontend + services)
> - **Module Settings** : paramètres configurables depuis l'UI Settings (stockés en DB)
> - **User Preferences** : préférences par utilisateur (localStorage + DB)

---

## LÉGENDE

| Champ | Signification |
|---|---|
| `slug` | Clé unique — utilisée dans le code et en DB |
| `scope` | `env` = `.env` fichier / `tenant` = par tenant en DB / `user` = par user en DB |
| `type` | Type de la valeur |
| `default_dev` | Valeur par défaut en développement |
| `default_prod` | Valeur recommandée en production |
| `required` | ✅ Obligatoire / ⚠ Obligatoire en prod / ❌ Optionnel |
| `secret` | 🔒 Ne jamais committer / logger |

---

# PARTIE 1 — Variables d'environnement (.env)

## 1.1 Général

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `ENVIRONMENT` | `string` | `development` | `production` | ✅ | Environnement actif. Valeurs : `development` / `staging` / `production` / `test` |
| `DEBUG` | `bool` | `False` | `False` | ✅ | Active les logs SQLAlchemy et le traceback détaillé |
| `SECRET_KEY` | `string` | `dev-secret-change-me` | _(généré)_ | ✅ 🔒 | Clé HMAC pour JWT OpsFlux + AES encryption. Min 32 chars. Générer avec `openssl rand -hex 32` |
| `ALLOWED_HOSTS` | `list[str]` | `*` | `app.opsflux.io` | ✅ | Hosts autorisés (TrustedHostMiddleware). Séparés par virgule |
| `ALLOWED_ORIGINS` | `list[str]` | `http://localhost:5173,http://localhost:3000` | `https://app.opsflux.io,https://web.opsflux.io` | ✅ | CORS origins. Séparés par virgule |

## 1.2 URLs et domaines

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `APP_URL` | `string` | `http://localhost:5173` | `https://app.opsflux.io` | ✅ | URL publique de l'application principale |
| `API_BASE_URL` | `string` | `http://localhost:8000` | `https://api.opsflux.io` | ✅ | URL publique de l'API backend |
| `WEB_URL` | `string` | `http://localhost:5174` | `https://web.opsflux.io` | ✅ | URL du portail public (share links, partenaires) |
| `WWW_URL` | `string` | `http://localhost:5175` | `https://www.opsflux.io` | ❌ | URL du site vitrine marketing |
| `FRONTEND_URL` | `string` | `http://localhost:5173` | `https://app.opsflux.io` | ✅ | Alias de APP_URL pour les redirections backend |
| `WWW_CONTACT_EMAIL` | `string` | `contact@opsflux.io` | _(à configurer)_ | ⚠ | Email qui reçoit le formulaire de contact du site vitrine |
| `WWW_CONTACT_CC` | `string` | _(vide)_ | _(vide)_ | ❌ | CC optionnel pour le formulaire de contact |

## 1.3 Base de données

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `DATABASE_URL` | `string` | `postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev` | _(à configurer)_ | ✅ 🔒 | URL PostgreSQL avec driver asyncpg |
| `DATABASE_URL_SYNC` | `string` | `postgresql://opsflux:password@localhost:5432/opsflux_dev` | _(à configurer)_ | ✅ 🔒 | URL PostgreSQL synchrone (pour pg_dump backup) |

## 1.4 Redis

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `REDIS_URL` | `string` | `redis://localhost:6379/0` | `redis://redis:6379/0` | ✅ | URL Redis (cache + ARQ queue + WS sessions) |

## 1.5 Authentification SSO Azure AD

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `AZURE_TENANT_ID` | `string` | _(vide)_ | _(ID tenant Azure Perenco)_ | ✅ 🔒 | ID du tenant Azure Active Directory Perenco |
| `AZURE_CLIENT_ID` | `string` | _(vide)_ | _(App registration ID)_ | ✅ 🔒 | Client ID de l'App Registration OpsFlux dans Azure |
| `AZURE_CLIENT_SECRET` | `string` | _(vide)_ | _(App registration secret)_ | ✅ 🔒 | Secret de l'App Registration |
| `AZURE_TENANT_CLAIM` | `string` | `extension_OpsFluxTenant` | _(à confirmer IT Perenco)_ | ⚠ | Nom du claim custom Azure pour le mapping tenant OpsFlux. **À confirmer avec IT Perenco avant prod** |

## 1.6 JWT

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | `480` | `480` | ✅ | Durée de vie du JWT access token (minutes). 480 = 8 heures |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `int` | `7` | `7` | ✅ | Durée de vie du refresh token (jours) |

## 1.7 Email SMTP

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SMTP_HOST` | `string` | `mailhog` | _(serveur SMTP Perenco)_ | ✅ | Hostname du serveur SMTP |
| `SMTP_PORT` | `int` | `1025` | `587` | ✅ | Port SMTP. 1025 = MailHog dev, 587 = TLS prod |
| `SMTP_USERNAME` | `string` | _(vide)_ | _(à configurer)_ | ⚠ | Identifiant SMTP (vide si auth désactivée) |
| `SMTP_PASSWORD` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Mot de passe SMTP |
| `SMTP_USE_TLS` | `bool` | `False` | `True` | ✅ | Activer STARTTLS |
| `SMTP_FROM_ADDRESS` | `string` | `noreply@opsflux.perenco.com` | `noreply@opsflux.perenco.com` | ✅ | Adresse expéditeur des emails |
| `SMTP_FROM_NAME` | `string` | `OpsFlux` | `OpsFlux` | ✅ | Nom affiché de l'expéditeur |

## 1.8 Stockage fichiers

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `STORAGE_BACKEND` | `string` | `local` | `minio` | ✅ | Backend de stockage. Valeurs : `local` / `minio` / `azure` |
| `STORAGE_LOCAL_PATH` | `string` | `./uploads` | _(N/A si minio)_ | ⚠ | Chemin absolu du dossier d'upload (backend local uniquement) |
| `STORAGE_MAX_FILE_SIZE_MB` | `int` | `50` | `50` | ✅ | Taille maximum par fichier uploadé (Mo) |
| `MINIO_ENDPOINT` | `string` | _(vide)_ | `minio:9000` | ⚠ | Endpoint MinIO (host:port, sans http) |
| `MINIO_ACCESS_KEY` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Access key MinIO |
| `MINIO_SECRET_KEY` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Secret key MinIO |
| `MINIO_BUCKET` | `string` | `opsflux` | `opsflux` | ⚠ | Nom du bucket MinIO |
| `AZURE_STORAGE_CONNECTION_STRING` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Chaîne de connexion Azure Blob Storage (si backend azure) |
| `AZURE_STORAGE_CONTAINER` | `string` | `opsflux` | `opsflux` | ⚠ | Nom du container Azure Blob |

## 1.9 Intelligence Artificielle

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `OLLAMA_BASE_URL` | `string` | `http://localhost:11434` | `http://ollama:11434` | ✅ | URL du serveur Ollama |
| `OLLAMA_DEFAULT_MODEL` | `string` | `llama3` | `llama3` | ✅ | Modèle LLM par défaut pour la génération de texte |
| `OLLAMA_EMBEDDING_MODEL` | `string` | `nomic-embed-text` | `nomic-embed-text` | ✅ | Modèle Ollama pour les embeddings RAG. Produit des vecteurs de dimension 768 |
| `EMBEDDING_DIMENSIONS` | `int` | `768` | `768` | ✅ | Dimension des vecteurs pgvector. **Doit correspondre au modèle embedding** |
| `LITELLM_MASTER_KEY` | `string` | `sk-dev` | _(généré)_ | ✅ 🔒 | Clé maître LiteLLM pour l'administration du proxy |
| `ANTHROPIC_API_KEY` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Clé API Anthropic Claude (si provider cloud activé) |
| `OPENAI_API_KEY` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Clé API OpenAI (si provider cloud activé) |

## 1.10 Collaboration temps réel (Hocuspocus)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `HOCUSPOCUS_PORT` | `int` | `1234` | `1234` | ✅ | Port d'écoute du serveur Hocuspocus |
| `HOCUSPOCUS_SECRET` | `string` | `dev-hocus-secret` | _(généré)_ | ✅ 🔒 | Secret partagé entre backend et Hocuspocus (legacy — remplacé par JWT dans l'impl. finale) |
| `HOCUSPOCUS_SERVICE_TOKEN` | `string` | _(généré au démarrage)_ | _(généré au démarrage)_ | ✅ 🔒 | JWT de service généré par FastAPI au démarrage. Hocuspocus le lit depuis le volume partagé |

## 1.11 Cartographie

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `MAP_PROVIDER` | `string` | `leaflet_osm` | `leaflet_osm` | ✅ | Provider cartographique. Valeurs : `leaflet_osm` / `google_maps` / `mapbox` |
| `GOOGLE_MAPS_API_KEY` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Clé API Google Maps (si MAP_PROVIDER=google_maps) |
| `MAPBOX_ACCESS_TOKEN` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Token Mapbox (si MAP_PROVIDER=mapbox) |

## 1.12 draw.io

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `DRAWIO_URL` | `string` | `https://embed.diagrams.net` | `https://drawio.app.opsflux.io` | ✅ | URL de l'instance draw.io. CDN en dev, self-hosted Docker en prod |

## 1.13 Monitoring

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SENTRY_DSN` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | DSN Sentry pour la capture d'erreurs en production |
| `PROMETHEUS_ENABLED` | `bool` | `False` | `True` | ✅ | Activer l'endpoint `/metrics` Prometheus |
| `PROMETHEUS_PORT` | `int` | `9090` | `9090` | ❌ | Port de l'endpoint Prometheus (si activé) |
| `GRAFANA_URL` | `string` | _(vide)_ | `https://monitoring.app.opsflux.io` | ⚠ | URL Grafana — affiché dans le dashboard /admin/health |

## 1.14 Administration

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SUPER_ADMIN_EMAILS` | `list[str]` | `admin@opsflux.io` | _(à configurer)_ | ✅ | Emails des super admins. Reçoivent les alertes critiques infra + backup. Séparés par virgule |

## 1.15 Backup

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `BACKUP_RETENTION_DAYS` | `int` | `7` | `30` | ✅ | Nombre de jours de rétention des dumps PostgreSQL |
| `BACKUP_DIR` | `string` | `/tmp/opsflux_backups` | `/opt/opsflux/backups` | ✅ | Chemin du volume de stockage des backups |

## 1.16 Déploiement

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `DOKPLOY_API_URL` | `string` | _(vide)_ | `https://dokploy.app.opsflux.io` | ⚠ | URL API Dokploy pour les déploiements CI/CD |
| `DOKPLOY_API_TOKEN` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Token API Dokploy |

## 1.17 Frontend Vite (VITE_*)

> Ces variables sont injectées dans le build frontend. Préfixe `VITE_` obligatoire.

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | `string` | `http://localhost:8000` | `https://api.opsflux.io` | ✅ | URL de l'API backend (appelée depuis le browser) |
| `VITE_WS_URL` | `string` | `ws://localhost:8000` | `wss://api.opsflux.io` | ✅ | URL WebSocket pour les notifications temps réel |
| `VITE_HOCUSPOCUS_URL` | `string` | `ws://localhost:1234` | `wss://collab.app.opsflux.io` | ✅ | URL WebSocket Hocuspocus pour la collaboration |
| `VITE_DRAWIO_URL` | `string` | `https://embed.diagrams.net` | `https://drawio.app.opsflux.io` | ✅ | URL draw.io pour l'éditeur PID |
| `VITE_APP_ENV` | `string` | `development` | `production` | ✅ | Environnement frontend (affecte les devtools) |
| `VITE_SENTRY_DSN` | `string` | _(vide)_ | _(à configurer)_ | ⚠ | DSN Sentry frontend |

## 1.18 Hocuspocus Node.js (variables du conteneur)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `PORT` | `int` | `1234` | `1234` | ✅ | Port d'écoute Hocuspocus |
| `JWT_SECRET` | `string` | _(identique à SECRET_KEY)_ | _(identique à SECRET_KEY)_ | ✅ 🔒 | Même clé que FastAPI pour valider les JWT OpsFlux |
| `API_URL` | `string` | `http://localhost:8000` | `http://backend:8000` | ✅ | URL interne FastAPI (réseau Docker) |
| `REDIS_HOST` | `string` | `localhost` | `redis` | ✅ | Hostname Redis (réseau Docker) |
| `HOCUSPOCUS_SERVICE_TOKEN` | `string` | _(lu depuis volume)_ | _(lu depuis volume)_ | ✅ 🔒 | JWT de service pour appels backend→backend |

## 1.19 GitHub Actions Secrets (CI/CD)

> Ces variables sont configurées dans **GitHub > Settings > Secrets and variables > Actions**.
> Ne jamais les mettre dans `.env`.

| Slug | Type | Description |
|---|---|---|
| `DOCKER_REGISTRY_URL` | `string` | URL du registry Docker. Ex: `registry.perenco.com` ou `ghcr.io/org` |
| `DOCKER_REGISTRY_USER` | `string` 🔒 | Utilisateur du registry Docker |
| `DOCKER_REGISTRY_PASSWORD` | `string` 🔒 | Mot de passe / token du registry Docker |
| `DOKPLOY_API_URL` | `string` | URL API Dokploy pour les déploiements auto |
| `DOKPLOY_API_TOKEN` | `string` 🔒 | Token API Dokploy |
| `STAGING_DATABASE_URL` | `string` 🔒 | URL DB staging (pour les migrations en CI) |
| `SENTRY_AUTH_TOKEN` | `string` 🔒 | Token Sentry pour l'upload des source maps |


---

# PARTIE 2 — Module Settings (stockés en DB, configurables depuis l'UI)

> **Table** : `module_settings_values`
> **Scope** : `tenant` = valeur partagée pour tout le tenant / `user` = valeur par utilisateur
> **Interface** : Settings > Modules > {Module}

## 2.1 Core — Général

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `core.default_language` | `select` | `tenant` | `fr` | `fr`, `en`, `ar` | Langue par défaut de l'interface pour ce tenant |
| `core.enabled_languages` | `multi_select` | `tenant` | `["fr"]` | `fr`, `en`, `ar` | Langues activées pour ce tenant |
| `core.timezone` | `select` | `tenant` | `Africa/Douala` | Timezones IANA | Fuseau horaire du tenant. Affiché dans les dates et les crons |
| `core.date_format` | `select` | `tenant` | `dd/MM/yyyy` | `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd` | Format d'affichage des dates |
| `core.theme` | `select` | `user` | `system` | `light`, `dark`, `system` | Thème de l'interface |
| `core.notification_email_enabled` | `toggle` | `user` | `true` | — | Recevoir les notifications par email |
| `core.notification_inapp_enabled` | `toggle` | `user` | `true` | — | Recevoir les notifications in-app |
| `core.home_page_dashboard_id` | `reference` | `user` | _(vide)_ | — | Dashboard affiché à la page d'accueil (personnalisé par user) |

## 2.2 Core — Carte

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `core.map_default_lat` | `number` | `tenant` | `3.848` | — | Latitude du centre par défaut de la carte (Cameroun) |
| `core.map_default_lng` | `number` | `tenant` | `10.497` | — | Longitude du centre par défaut (Cameroun) |
| `core.map_default_zoom` | `number` | `user` | `8` | 1–18 | Niveau de zoom par défaut de la carte |

## 2.3 Core — Email Templates

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `core.email_header_logo_url` | `text_short` | `tenant` | `/static/logo-perenco.png` | — | URL du logo dans les emails |
| `core.email_footer_text` | `text_long` | `tenant` | `OpsFlux — Perenco` | — | Texte de pied de page des emails |
| `core.email_accent_color` | `text_short` | `tenant` | `#1a56db` | — | Couleur d'accent des emails (hex) |

## 2.4 Core — AI (par tenant)

> La configuration des providers IA est stockée dans `module_settings_values.value` au format JSON complexe.

| Slug | Type | Scope | Défaut | Description |
|---|---|---|---|---|
| `core.ai_providers` | `json` | `tenant` | `[{"slug":"ollama","model":"llama3","functions":["generation","embedding","suggestion"],"is_active":true}]` | Liste des providers IA configurés. Chaque provider a : `slug`, `label`, `api_url`, `model`, `api_key_encrypted`, `functions`, `is_active` |
| `core.ai_chat_enabled` | `toggle` | `tenant` | `true` | — | Activer le panneau IA dans l'interface |
| `core.ai_briefing_enabled` | `toggle` | `user` | `true` | — | Afficher le briefing journalier dans le panneau IA |

## 2.5 Module — Report Editor

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `report_editor.default_export_format` | `select` | `user` | `pdf` | `pdf`, `docx` | Format d'export par défaut pour les documents |
| `report_editor.autosave_interval_seconds` | `number` | `user` | `30` | 10–300 | Intervalle d'auto-sauvegarde dans l'éditeur (secondes) |
| `report_editor.offline_quota_mb` | `number` | `tenant` | `50` | 10–500 | Quota de stockage hors-ligne par user (Mo) |
| `report_editor.enable_ai_autocomplete` | `toggle` | `user` | `true` | — | Activer la complétion automatique IA dans l'éditeur BlockNote |
| `report_editor.track_changes_on_edit` | `toggle` | `user` | `false` | — | Activer le suivi des modifications par défaut à l'ouverture |
| `report_editor.default_classification` | `select` | `tenant` | `INT` | `CONF`, `REST`, `INT`, `PUB` | Classification par défaut des nouveaux documents |
| `report_editor.require_comment_on_reject` | `toggle` | `tenant` | `true` | — | Rendre le commentaire obligatoire lors d'un rejet de workflow |
| `report_editor.max_revision_keep` | `number` | `tenant` | `50` | 10–999 | Nombre maximum de révisions conservées par document |

## 2.6 Module — PID/PFD + TagRegistry

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `pid_pfd.default_line_spec` | `select` | `tenant` | `150` | `150`, `300`, `600` | Classe de ligne par défaut (ASME) pour les nouvelles lignes de procédé |
| `pid_pfd.auto_suggest_tags` | `toggle` | `user` | `true` | — | Activer les suggestions automatiques de noms de tags DCS |
| `pid_pfd.drawio_grid_size` | `number` | `user` | `10` | 5–50 | Taille de la grille draw.io en pixels |
| `pid_pfd.tag_naming_strict_mode` | `toggle` | `tenant` | `true` | — | Mode strict : interdire la création de tags non conformes aux règles de nommage |
| `pid_pfd.pid_lock_timeout_minutes` | `number` | `tenant` | `30` | 5–120 | Durée du lock optimiste sur un PID (minutes) avant expiration automatique |

## 2.7 Module — Dashboard

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `dashboard.default_refresh_interval` | `select` | `user` | `0` | `0`, `30000`, `60000`, `300000`, `900000` | Intervalle de rafraîchissement automatique des widgets (ms). 0=manuel, 30000=30s, 60000=1min, 300000=5min |
| `dashboard.sql_widget_timeout_seconds` | `number` | `tenant` | `30` | 5–60 | Timeout maximum pour les requêtes SQL des widgets personnalisés. Requiert permission `dashboard.admin` |
| `dashboard.default_home_dashboard_id` | `reference` | `tenant` | _(vide)_ | — | Dashboard affiché par défaut pour les nouveaux utilisateurs du tenant |

## 2.8 Module — Asset Registry

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `asset_registry.default_import_mode` | `select` | `tenant` | `upsert` | `create_only`, `upsert`, `update_only` | Comportement par défaut lors de l'import CSV d'assets |
| `asset_registry.default_asset_view` | `select` | `user` | `list` | `list`, `map` | Vue par défaut de la liste des assets |
| `asset_registry.map_cluster_enabled` | `toggle` | `user` | `true` | — | Activer le clustering des markers sur la carte assets |

## 2.9 Module — Tiers

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `tiers.default_tiers_type` | `select` | `tenant` | `supplier` | `supplier`, `partner`, `client`, `subcontractor`, `other` | Type par défaut lors de la création d'un tiers |
| `tiers.auto_create_virtual_tiers` | `toggle` | `tenant` | `true` | — | Créer automatiquement un tiers virtuel pour les contacts standalone (sans société) |
| `tiers.enable_blacklist_warning` | `toggle` | `tenant` | `true` | — | Afficher une bannière d'avertissement sur les tiers blacklistés |

## 2.10 Module — AI & MCP

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `ai_mcp.rag_top_k` | `number` | `tenant` | `5` | 2–10 | Nombre de chunks utilisés comme contexte pour les réponses RAG |
| `ai_mcp.rag_chunk_size` | `number` | `tenant` | `600` | 200–1200 | Taille des chunks d'indexation en tokens |
| `ai_mcp.rag_chunk_overlap` | `number` | `tenant` | `100` | 0–300 | Overlap entre chunks consécutifs en tokens |
| `ai_mcp.mcp_rate_limit_per_minute` | `number` | `tenant` | `50` | 10–200 | Nombre maximum d'appels MCP tools par minute par utilisateur |
| `ai_mcp.autocomplete_debounce_ms` | `number` | `user` | `1000` | 500–3000 | Délai avant déclenchement de l'auto-complétion IA dans l'éditeur (ms) |

---

# PARTIE 3 — User Preferences (localStorage + DB)

> **Hook** : `useUserPreference(key, defaultValue)`
> **Stockage** : localStorage immédiat + sync async DB
> **API** : `GET/PATCH /api/v1/me/preferences/{key}`

| Slug | Type | Défaut | Description |
|---|---|---|---|
| `theme` | `string` | `system` | Thème UI : `light` / `dark` / `system` |
| `language` | `string` | _(langue tenant)_ | Langue de l'interface pour cet utilisateur |
| `dynamic_panel.pinned` | `bool` | `false` | Panneau dynamique épinglé — reste ouvert à la navigation |
| `sidebar.expanded` | `bool` | `true` | Sidebar étendue (180px) ou réduite (48px icônes) |
| `bu_context` | `string` | _(vide)_ | UUID de la BU active dans le switcher. Vide = toutes les BU |
| `table.documents.page_size` | `int` | `25` | Taille de page dans la liste des documents |
| `table.documents.sort` | `json` | `{"field":"updated_at","direction":"desc"}` | Tri par défaut de la liste documents |
| `table.assets.{type_slug}.page_size` | `int` | `25` | Taille de page dans une liste d'assets par type |
| `table.tiers.page_size` | `int` | `25` | Taille de page dans la liste des tiers |
| `table.contacts.page_size` | `int` | `25` | Taille de page dans la liste des contacts |
| `table.dcs_tags.page_size` | `int` | `25` | Taille de page dans le TagRegistry |
| `filters.documents` | `json` | `{}` | Filtres sauvegardés sur la liste documents (niveau 4) |
| `filters.assets.{type_slug}` | `json` | `{}` | Filtres sauvegardés sur une liste d'assets |
| `home_page_dashboard_id` | `string` | _(vide)_ | Dashboard personnalisé de l'utilisateur pour la page d'accueil |
| `ai_panel.open` | `bool` | `false` | Panneau IA ouvert ou fermé par défaut |
| `ai.autocomplete_enabled` | `bool` | `true` | Auto-complétion IA activée dans l'éditeur pour cet utilisateur |
| `editor.autosave_interval_seconds` | `int` | `30` | Intervalle d'auto-save personnel (override du setting module) |
| `editor.default_export_format` | `string` | `pdf` | Format d'export préféré (pdf ou docx) |
| `map.default_zoom` | `int` | `8` | Zoom par défaut de la carte assets |
| `dashboard.default_refresh_interval` | `int` | `0` | Rafraîchissement auto des dashboards (ms). Préférence user override du setting module |
| `notifications.email_enabled` | `bool` | `true` | Recevoir les notifications par email |
| `notifications.inapp_enabled` | `bool` | `true` | Recevoir les notifications in-app |
| `pid.drawio_grid_size` | `int` | `10` | Taille de grille draw.io personnelle |
| `pid.auto_suggest_tags` | `bool` | `true` | Suggestions de tags DCS activées |

---

# PARTIE 4 — Seuils d'alerte Infrastructure

> Configurés dans le code (`app/workers/health_monitor.py`).
> Modifiables uniquement par le super_admin dans `.env` ou via redéploiement.

| Métrique | Seuil Warning | Seuil Critical | Seuil Blocking | Action |
|---|---|---|---|---|
| `storage_percent` | 60% | 80% | 95% | Warning: email / Critical: email urgent + notif / Blocking: bloquer uploads |
| `db_size_gb` | 50 GB | 80 GB | — | Warning: email / Critical: email urgent |
| `db_connections_percent` | 70% | 90% | — | Warning: email / Critical: email urgent |
| `redis_memory_percent` | 70% | 85% | — | Warning: email / Critical: email urgent |
| `arq_queue_depth` | 50 jobs | 200 jobs | — | Warning: email / Critical: email urgent |
| `backup_age_hours` | 26h (backup manqué) | 50h | — | Warning: email / Critical: email urgent |
| `tag_sequence_percent` | 90% (SEQ:N proche de 10^N) | — | — | Warning visible dans Settings nomenclature |

---

# PARTIE 5 — Fichier .env.example complet

```bash
# ─────────────────────────────────────────────────────────────────
# OpsFlux — .env.example
# Copier en .env.dev / .env.staging / .env.prod
# Ne jamais committer les fichiers .env réels
# ─────────────────────────────────────────────────────────────────

# ── Général ──────────────────────────────────────────────────────
ENVIRONMENT=development                        # development | staging | production | test
DEBUG=False
SECRET_KEY=CHANGE_ME_generate_with_openssl_rand_hex_32
ALLOWED_HOSTS=*
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ── URLs ─────────────────────────────────────────────────────────
APP_URL=http://localhost:5173
API_BASE_URL=http://localhost:8000
WEB_URL=http://localhost:5174
WWW_URL=http://localhost:5175
FRONTEND_URL=http://localhost:5173
WWW_CONTACT_EMAIL=contact@opsflux.io
WWW_CONTACT_CC=

# ── Base de données ───────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev
DATABASE_URL_SYNC=postgresql://opsflux:password@localhost:5432/opsflux_dev

# ── Redis ─────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Azure AD / Entra ID ───────────────────────────────────────────
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_CLAIM=extension_OpsFluxTenant    # À confirmer avec IT Perenco

# ── JWT ───────────────────────────────────────────────────────────
ACCESS_TOKEN_EXPIRE_MINUTES=480
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── Email SMTP ────────────────────────────────────────────────────
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_USE_TLS=False
SMTP_FROM_ADDRESS=noreply@opsflux.perenco.com
SMTP_FROM_NAME=OpsFlux

# ── Stockage fichiers ─────────────────────────────────────────────
STORAGE_BACKEND=local                          # local | minio | azure
STORAGE_LOCAL_PATH=./uploads
STORAGE_MAX_FILE_SIZE_MB=50
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=opsflux
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER=opsflux

# ── Intelligence Artificielle ─────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3
OLLAMA_EMBEDDING_MODEL=nomic-embed-text        # dimension: 768
EMBEDDING_DIMENSIONS=768                       # DOIT correspondre au modèle embedding
LITELLM_MASTER_KEY=sk-dev-change-me
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# ── Collaboration (Hocuspocus) ────────────────────────────────────
HOCUSPOCUS_PORT=1234
HOCUSPOCUS_SECRET=dev-hocus-secret-change-me
# HOCUSPOCUS_SERVICE_TOKEN est généré au démarrage FastAPI — ne pas setter manuellement

# ── Cartographie ──────────────────────────────────────────────────
MAP_PROVIDER=leaflet_osm                       # leaflet_osm | google_maps | mapbox
GOOGLE_MAPS_API_KEY=
MAPBOX_ACCESS_TOKEN=

# ── draw.io ───────────────────────────────────────────────────────
DRAWIO_URL=https://embed.diagrams.net          # CDN dev / https://drawio.app.opsflux.io prod

# ── Monitoring ────────────────────────────────────────────────────
SENTRY_DSN=
PROMETHEUS_ENABLED=False
PROMETHEUS_PORT=9090
GRAFANA_URL=

# ── Administration ────────────────────────────────────────────────
SUPER_ADMIN_EMAILS=admin@opsflux.io            # virgule pour plusieurs: a@b.com,c@d.com

# ── Backup ────────────────────────────────────────────────────────
BACKUP_RETENTION_DAYS=30
BACKUP_DIR=/opt/opsflux/backups

# ── Dokploy ───────────────────────────────────────────────────────
DOKPLOY_API_URL=
DOKPLOY_API_TOKEN=

# ── Frontend (Vite) — copier dans frontend/.env.local ─────────────
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_HOCUSPOCUS_URL=ws://localhost:1234
VITE_DRAWIO_URL=https://embed.diagrams.net
VITE_APP_ENV=development
VITE_SENTRY_DSN=

# ── Hocuspocus Node.js — copier dans hocuspocus/.env ─────────────
# PORT=1234
# JWT_SECRET=       ← identique à SECRET_KEY
# API_URL=http://localhost:8000
# REDIS_HOST=localhost
```
