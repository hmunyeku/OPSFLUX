# OpsFlux — 08_SETTINGS.md
# Référence complète de toutes les configurations

> **Source de vérité** pour toutes les variables de configuration OpsFlux.
>
> **Architecture multi-tenant** : Tenant (schéma PG) > Entité (entity_id) > BU.
> Base platform (`opsflux_platform`) + schémas par tenant.
>
> **Catégories :**
> - **Partie 1** — Variables `.env` (infrastructure, services, modules métier)
> - **Partie 2** — Platform DB Settings (gestion des tenants)
> - **Partie 3** — Module Settings (paramètres en DB, configurables depuis l'UI, par entité)
> - **Partie 4** — User Preferences (localStorage + DB, par utilisateur)
> - **Partie 5** — Seuils d'alerte infrastructure
> - **Partie 6** — Fichier `.env.example` complet

---

## LÉGENDE

| Champ | Signification |
|---|---|
| `slug` | Clé unique — utilisée dans le code et en DB |
| `scope` | `env` = `.env` fichier / `platform` = DB platform / `tenant` = par tenant en DB / `entity` = par entité en DB / `user` = par user en DB |
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
| `ALLOWED_HOSTS` | `list[str]` | `*` | `app.opsflux.io,api.opsflux.io,web.opsflux.io` | ✅ | Hosts autorisés (TrustedHostMiddleware). Séparés par virgule |
| `ALLOWED_ORIGINS` | `list[str]` | `http://localhost:5173,http://localhost:3000` | `https://app.opsflux.io,https://web.opsflux.io` | ✅ | CORS origins. Séparés par virgule |
| `LOG_LEVEL` | `string` | `DEBUG` | `INFO` | ✅ | Niveau de log applicatif |

---

## 1.2 URLs et domaines

> **Convention domaines** : `*.opsflux.io` — `app.opsflux.io` (PWA), `api.opsflux.io` (backend), `web.opsflux.io` (portail public/partenaires).

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `APP_URL` | `string` | `http://localhost:5173` | `https://app.opsflux.io` | ✅ | URL publique de l'application principale |
| `API_BASE_URL` | `string` | `http://localhost:8000` | `https://api.opsflux.io` | ✅ | URL publique de l'API backend |
| `WEB_URL` | `string` | `http://localhost:5174` | `https://web.opsflux.io` | ✅ | URL du portail public (share links, portails externes, partenaires) |
| `FRONTEND_URL` | `string` | `http://localhost:5173` | `https://app.opsflux.io` | ✅ | Alias de APP_URL pour les redirections backend |

---

## 1.3 Base de données (PostgreSQL)

> **Architecture** : base `opsflux_platform` (gestion tenants, licensing) + un schéma PG par tenant.
> Extensions requises : `pg_trgm`, `pgvector`, `ltree`, `PostGIS`, `pg_partman`.

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `DATABASE_URL` | `string` | `postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev` | _(à configurer)_ | ✅ 🔒 | URL PostgreSQL avec driver asyncpg |
| `DATABASE_URL_SYNC` | `string` | `postgresql://opsflux:password@localhost:5432/opsflux_dev` | _(à configurer)_ | ✅ 🔒 | URL PostgreSQL synchrone (Alembic migrations + pg_dump backup) |
| `DATABASE_POOL_SIZE` | `int` | `10` | `20` | ✅ | Taille du pool de connexions SQLAlchemy |
| `DATABASE_MAX_OVERFLOW` | `int` | `10` | `30` | ✅ | Connexions supplémentaires autorisées au-delà du pool |

---

## 1.4 Cache & Pub-Sub (Redis)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `REDIS_URL` | `string` | `redis://localhost:6379/0` | `redis://redis:6379/0` | ✅ | URL Redis (cache + APScheduler queue + WS sessions + révocation JWT) |
| `REDIS_TTL_POSITION` | `int` | `86400` | `86400` | ✅ | TTL cache positions IoT (secondes). 86400 = 24h |
| `REDIS_TTL_SIMULATION` | `int` | `14400` | `14400` | ✅ | TTL sessions simulation planning (secondes). 14400 = 4h |
| `REDIS_TTL_OTP` | `int` | `600` | `600` | ✅ | TTL tokens OTP portail externe (secondes). 600 = 10min |
| `SESSION_REVOCATION_BACKEND` | `string` | `redis` | `redis` | ✅ | Backend révocation sessions JWT. Valeurs : `redis` / `database` |

---

## 1.5 Authentification & Sécurité

> **Multi-provider** : SAML/OIDC/LDAP supportés. Pas de dépendance exclusive à Azure AD.

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `AUTH_ENABLED_METHODS` | `string` | `sso,email_password` | `sso` | ✅ | Méthodes d'authentification actives. Séparées par virgule |
| `JWT_ALGORITHM` | `string` | `HS256` | `HS256` | ✅ | Algorithme de signature JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | `480` | `15` | ✅ | Durée de vie du JWT access token (minutes). Dev=8h, Prod=15min |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `int` | `7` | `7` | ✅ | Durée de vie du refresh token (jours) |
| `AUTH_MAX_FAILED_ATTEMPTS` | `int` | `10` | `5` | ✅ | Verrouillage compte après N échecs de connexion |
| `AUTH_LOCKOUT_DURATION_MIN` | `int` | `5` | `15` | ✅ | Durée de verrouillage (minutes) |
| `AUTH_PASSWORD_MIN_LENGTH` | `int` | `8` | `12` | ✅ | Longueur minimale du mot de passe |
| `AUTH_PASSWORD_REQUIRE_SPECIAL` | `bool` | `False` | `True` | ✅ | Exiger un caractère spécial dans le mot de passe |

---

## 1.6 SSO — Multi-provider (SAML2 / OIDC / LDAP)

> Support multi-provider : SAML2 (ADFS, Okta, etc.), OIDC (Azure AD / Entra ID, Google, etc.), LDAP.
> Le choix du protocole dépend de l'infrastructure IAM du client.

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SSO_ENABLED` | `bool` | `False` | `True` | ✅ | Activer l'authentification SSO |
| `SSO_PROTOCOL` | `string` | `oidc` | `saml2` | ✅ | Protocole SSO actif. Valeurs : `saml2` / `oidc` / `ldap` |
| `AZURE_TENANT_ID` | `string` | _(vide)_ | _(ID tenant Azure)_ | ⚠ 🔒 | ID du tenant Azure Active Directory (si provider Azure) |
| `AZURE_CLIENT_ID` | `string` | _(vide)_ | _(App registration ID)_ | ⚠ 🔒 | Client ID de l'App Registration OpsFlux dans Azure |
| `AZURE_CLIENT_SECRET` | `string` | _(vide)_ | _(App registration secret)_ | ⚠ 🔒 | Secret de l'App Registration |
| `AZURE_TENANT_CLAIM` | `string` | `extension_OpsFluxTenant` | _(à confirmer avec IT client)_ | ⚠ | Nom du claim custom Azure pour le mapping tenant |
| `SAML_IDP_METADATA_URL` | `string` | _(vide)_ | _(URL métadonnées IDP)_ | ⚠ | URL des métadonnées de l'IDP SAML (si SSO_PROTOCOL=saml2) |
| `SAML_SP_ENTITY_ID` | `string` | _(vide)_ | `https://app.opsflux.io` | ⚠ | Entity ID du service provider OpsFlux |
| `SAML_SP_ACS_URL` | `string` | _(vide)_ | `https://app.opsflux.io/auth/saml/callback` | ⚠ | URL ACS (Assertion Consumer Service) |
| `SAML_ATTRIBUTE_MAPPING` | `json` | `{}` | `{"email":"emailaddress","first_name":"givenname","last_name":"surname","department":"department"}` | ⚠ | Mapping attributs SAML vers OpsFlux |
| `SSO_SLO_ENABLED` | `bool` | `False` | `True` | ✅ | Activer Single Logout à la déconnexion |
| `LDAP_HOST` | `string` | _(vide)_ | _(hôte LDAP client)_ | ❌ | Hôte LDAP (si SSO_PROTOCOL=ldap) |
| `LDAP_PORT` | `int` | `636` | `636` | ❌ | Port LDAP |
| `LDAP_BASE_DN` | `string` | _(vide)_ | _(DN de base)_ | ❌ | DN de base pour la recherche LDAP |
| `LDAP_BIND_DN` | `string` | _(vide)_ | _(DN compte de service)_ | ❌ | DN du compte de service LDAP |
| `LDAP_BIND_PASSWORD` | `string` | _(vide)_ | _(à configurer)_ | ❌ 🔒 | Mot de passe compte de service LDAP |
| `LDAP_USE_SSL` | `bool` | `True` | `True` | ❌ | Connexion LDAPS |

---

## 1.7 Bootstrap (démarrage initial)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `BOOTSTRAP_ENABLED` | `bool` | `True` | `False` | ✅ | Activer le mode bootstrap (1er démarrage). **Désactiver immédiatement après setup** |
| `BOOTSTRAP_SECRET` | `string` | `dev-bootstrap-secret` | _(généré aléatoirement)_ | ✅ 🔒 | Secret d'accès pour le compte admin initial. Usage unique |

> **Important** : mettre `BOOTSTRAP_ENABLED=false` et supprimer `BOOTSTRAP_SECRET` immédiatement après le premier démarrage.

---

## 1.8 Email SMTP

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SMTP_HOST` | `string` | `mailhog` | _(serveur SMTP client)_ | ✅ | Hostname du serveur SMTP. `mailhog` en dev |
| `SMTP_PORT` | `int` | `1025` | `587` | ✅ | Port SMTP. 1025 = MailHog dev, 587 = STARTTLS prod |
| `SMTP_USERNAME` | `string` | _(vide)_ | _(à configurer)_ | ⚠ | Identifiant SMTP (vide si auth désactivée) |
| `SMTP_PASSWORD` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Mot de passe SMTP |
| `SMTP_USE_TLS` | `bool` | `False` | `True` | ✅ | Activer STARTTLS |
| `SMTP_FROM_ADDRESS` | `string` | `noreply@opsflux.io` | `noreply@opsflux.io` | ✅ | Adresse expéditeur des emails |
| `SMTP_FROM_NAME` | `string` | `OpsFlux` | `OpsFlux` | ✅ | Nom affiché de l'expéditeur |
| `INVITATION_EXPIRY_HOURS` | `int` | `72` | `72` | ✅ | Durée de validité des invitations email (heures) |

---

## 1.9 SMS

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SMS_PROVIDER` | `string` | `none` | `twilio` | ✅ | Fournisseur SMS. Valeurs : `twilio` / `orange_cm` / `both` / `none` |
| `TWILIO_ACCOUNT_SID` | `string` | _(vide)_ | _(depuis Twilio)_ | ⚠ 🔒 | SID du compte Twilio |
| `TWILIO_AUTH_TOKEN` | `string` | _(vide)_ | _(depuis Twilio)_ | ⚠ 🔒 | Token Twilio |
| `TWILIO_FROM_NUMBER` | `string` | _(vide)_ | `+237XXXXXXXXX` | ⚠ | Numéro expéditeur Twilio |
| `SMS_ORANGE_CM_TOKEN` | `string` | _(vide)_ | _(token Orange CM)_ | ❌ 🔒 | Token API Orange Cameroun (fallback local) |
| `SMS_FALLBACK_TO_EMAIL` | `bool` | `True` | `True` | ✅ | Si SMS échoue, email automatique en fallback |

---

## 1.10 Stockage fichiers (S3-compatible)

> **Décision** : backend S3-compatible (compatible MinIO, AWS S3, Scaleway, OVH, etc.).
> Pas de dépendance à MinIO ou Azure spécifiquement.

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `STORAGE_BACKEND` | `string` | `local` | `s3` | ✅ | Backend de stockage. Valeurs : `local` / `s3` |
| `STORAGE_LOCAL_PATH` | `string` | `./uploads` | _(N/A si s3)_ | ⚠ | Chemin absolu du dossier d'upload (backend local uniquement) |
| `STORAGE_MAX_FILE_SIZE_MB` | `int` | `50` | `50` | ✅ | Taille maximum par fichier uploadé (Mo) |
| `UPLOAD_ALLOWED_TYPES` | `string` | `application/pdf,image/jpeg,image/png,image/webp,...` | _(idem dev)_ | ✅ | Types MIME acceptés, séparés par virgule |
| `S3_ENDPOINT` | `string` | _(vide)_ | _(endpoint S3-compatible)_ | ⚠ | Endpoint S3 (host:port). Ex: `minio:9000`, `s3.amazonaws.com` |
| `S3_ACCESS_KEY` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Access key S3-compatible |
| `S3_SECRET_KEY` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Secret key S3-compatible |
| `S3_BUCKET` | `string` | `opsflux` | `opsflux-prod` | ⚠ | Nom du bucket S3 |
| `S3_REGION` | `string` | `us-east-1` | _(selon provider)_ | ❌ | Région S3 (requis pour AWS, ignoré par MinIO) |
| `S3_USE_SSL` | `bool` | `False` | `True` | ✅ | Connexion HTTPS vers le endpoint S3 |
| `S3_PRESIGN_EXPIRY_SECONDS` | `int` | `3600` | `3600` | ✅ | Durée de validité des URLs pré-signées (secondes) |

---

## 1.11 Module PaxLog

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `PAX_DEDUP_THRESHOLD` | `float` | `0.85` | `0.85` | ✅ | Seuil similarité fuzzy déduplication PAX (0–1) |
| `PAX_ADS_NOTICE_HOURS` | `int` | `24` | `24` | ✅ | Préavis minimum avant start_date d'une AdS (heures) |
| `PAX_OTP_LENGTH` | `int` | `6` | `6` | ✅ | Longueur du code OTP portail externe |
| `PAX_EXT_LINK_EXPIRY_HOURS` | `int` | `72` | `72` | ✅ | Durée de vie par défaut d'un lien portail Tiers (heures) |
| `PAX_EXT_LINK_RATE_LIMIT` | `int` | `20` | `10` | ✅ | Requêtes/min max par IP sur portail externe |
| `PAX_ROTATION_BATCH_HOUR` | `int` | `6` | `6` | ✅ | Heure du batch quotidien création automatique des AdS de rotation |
| `PAX_MEDICAL_WARN_DAYS` | `int` | `30` | `30` | ✅ | Alerte si aptitude médicale expire dans < N jours |
| `PAX_CREDENTIAL_WARN_DAYS` | `int` | `30` | `30` | ✅ | Alerte certifications expirant dans < N jours |
| `PAX_REQUIRES_REVIEW_WARN_DAYS` | `int` | `14` | `14` | ✅ | Rappel au demandeur si AdS en `requires_review` depuis N jours |
| `PAX_REQUIRES_REVIEW_FORCE_DAYS` | `int` | `28` | `28` | ✅ | CDS peut forcer `cancelled` si AdS en `requires_review` depuis N jours |
| `PAX_MAX_COMPANY_DEDUP_SEARCH` | `string` | `all` | `all` | ✅ | Périmètre recherche doublon PAX : `entity` ou `all` |
| `MEDICAL_POLICY_ENCRYPT` | `bool` | `False` | `False` | ⚠ | Chiffrement données médicales. **A valider avec DRH avant prod** |

---

## 1.12 Module AVM (Avis de Mission)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `AVM_DEFAULT_MISSION_TYPE` | `string` | `standard` | `standard` | ✅ | Type de mission par défaut. Valeurs : `standard` / `vip` / `regulatory` / `emergency` |
| `AVM_EPI_MEASUREMENTS_FIELDS` | `json` | `["taille_vetement","pointure","tour_tete","tour_taille"]` | _(idem dev)_ | ✅ | Champs de mensurations EPI demandés lors du lancement AVM |
| `AVM_GLOBAL_DOC_TYPES` | `json` | `["ordre_mission","loi","programme_officiel","contrat","autre"]` | _(idem dev)_ | ✅ | Types de documents globaux disponibles sur une AVM |
| `AVM_PAX_DOC_TYPES` | `json` | `["passport","visa","medical_fit","autre"]` | _(idem dev)_ | ✅ | Types de documents par PAX disponibles sur une AVM |

---

## 1.13 Module Planner

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `PLANNER_GANTT_MAX_ASSETS` | `int` | `200` | `200` | ✅ | Nombre maximum d'assets affichés dans le Gantt Planner |
| `PLANNER_CONFLICT_NOTIFY_DO` | `bool` | `True` | `True` | ✅ | Notifier le DO à chaque conflit de capacité |
| `PLANNER_CAPACITY_CACHE_TTL` | `int` | `300` | `300` | ✅ | TTL du cache capacité résiduelle (secondes) |
| `PLANNER_MATVIEW_REFRESH_INTERVAL` | `int` | `5` | `5` | ✅ | Intervalle rafraîchissement vue matérialisée `daily_pax_load` (minutes) |
| `PLANNER_DRILLING_MIN_PRIORITY` | `string` | `high` | `high` | ✅ | Priorité minimale imposée pour les activités de type `drilling` |

---

## 1.14 Module Projets

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `PROJECTS_TASK_REMINDER_DAYS` | `string` | `7,1` | `7,1` | ✅ | Rappels avant échéance d'une tâche (jours, séparés par virgule) |
| `PROJECTS_GANTT_LIBRARY` | `string` | `svar_mit` | `svar_mit` | ✅ | Librairie Gantt utilisée. Valeur : `svar_mit` |

---

## 1.15 Module TravelWiz

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `TRIP_DELAY_REASSIGN_THRESHOLD_HOURS` | `int` | `4` | `4` | ✅ | Délai (heures) au-delà duquel le LOG_BASE peut réassigner les PAX d'un trip retardé |
| `CAPTAIN_PORTAL_CODE_LENGTH` | `int` | `6` | `6` | ✅ | Longueur du code d'accès portail capitaine |
| `CAPTAIN_PORTAL_CODE_EXPIRY_HOURS` | `int` | `48` | `48` | ✅ | Durée de validité du code capitaine (heures) |
| `CAPTAIN_PORTAL_RATE_LIMIT` | `int` | `20` | `10` | ✅ | Requêtes/min max par IP sur portail capitaine |
| `MANIFEST_PDF_TEMPLATE_DIR` | `string` | `/app/templates/pdf` | `/app/templates/pdf` | ✅ | Répertoire des templates PDF manifestes |
| `MANIFEST_REPORTS_DIR` | `string` | `/tmp/reports` | `/tmp/reports` | ✅ | Répertoire temporaire des rapports générés |
| `KPI_CALCULATION_CRON` | `string` | `0 2 * * *` | `0 2 * * *` | ✅ | Cron de recalcul des KPIs voyage (défaut : 2h chaque nuit) |
| `KPI_PRODUCTIVE_THRESHOLD` | `int` | `70` | `70` | ✅ | Seuil alerte productivité voyage (%). En dessous, alerte |
| `PAX_DEFAULT_WEIGHT_KG` | `int` | `85` | `85` | ✅ | Poids PAX par défaut si non renseigné (kg) |

---

## 1.16 IoT & Tracking

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `IOT_POSITION_STALE_MINUTES` | `int` | `15` | `15` | ✅ | Délai avant qu'une position soit considérée stale (minutes) |
| `IOT_STREAM_HEARTBEAT_SECONDS` | `int` | `30` | `30` | ✅ | Fréquence heartbeat SSE (secondes) |
| `IOT_STALE_CHECK_INTERVAL_MINUTES` | `int` | `5` | `5` | ✅ | Intervalle de vérification des positions stales (minutes) |
| `IOT_PARTITION_BY` | `string` | `week` | `week` | ✅ | Partitionnement table `vehicle_positions`. Valeurs : `week` / `month` |
| `IOT_PRIORITY_STALE_THRESHOLD_MIN` | `int` | `5` | `5` | ✅ | Délai avant basculement sur device secondaire (minutes) |

---

## 1.17 Météo

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `WEATHER_PROVIDER` | `string` | `open_meteo` | `open_meteo` | ✅ | Fournisseur météo. Valeurs : `open_meteo` / `openweathermap` / `stormglass` / `none` |
| `WEATHER_API_KEY` | `string` | _(vide)_ | _(vide si open_meteo)_ | ❌ 🔒 | Clé API météo (non requise pour open_meteo) |
| `WEATHER_FETCH_INTERVAL_MINUTES` | `int` | `30` | `30` | ✅ | Fréquence de fetch météo pour vecteurs actifs (minutes) |
| `WEATHER_WARN_BEAUFORT` | `int` | `6` | `6` | ✅ | Alerte vent si force Beaufort >= N |

---

## 1.18 Cargo

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `CARGO_STALL_DAYS` | `int` | `5` | `5` | ✅ | Alerte si un colis est immobile depuis N jours |

---

## 1.19 Ramassage terrestre

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `PICKUP_GEOFENCE_RADIUS_M` | `int` | `100` | `100` | ✅ | Rayon (mètres) pour déclencher la confirmation GPS "RAMASSE" |
| `PICKUP_ETA_NOTIFY_MINUTES` | `int` | `5` | `5` | ✅ | SMS envoyé automatiquement au PAX N minutes avant l'arrivée du véhicule |

---

## 1.20 Intelligence Artificielle & LLM / MCP

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `OLLAMA_BASE_URL` | `string` | `http://localhost:11434` | `http://ollama:11434` | ✅ | URL du serveur Ollama (LLM local) |
| `OLLAMA_DEFAULT_MODEL` | `string` | `llama3` | `llama3` | ✅ | Modèle LLM par défaut pour la génération de texte |
| `OLLAMA_EMBEDDING_MODEL` | `string` | `nomic-embed-text` | `nomic-embed-text` | ✅ | Modèle pour les embeddings RAG. Produit des vecteurs de dimension 768 |
| `EMBEDDING_DIMENSIONS` | `int` | `768` | `768` | ✅ | Dimension des vecteurs pgvector. **Doit correspondre au modèle embedding** |
| `LITELLM_MASTER_KEY` | `string` | `sk-dev` | _(généré)_ | ✅ 🔒 | Clé maître LiteLLM pour l'administration du proxy IA |
| `ANTHROPIC_API_KEY` | `string` | _(vide)_ | `sk-ant-...` | ❌ 🔒 | Clé API Anthropic Claude (génération rapports narratifs, matching SAP) |
| `ANTHROPIC_MODEL` | `string` | `claude-sonnet-4-6` | `claude-sonnet-4-6` | ❌ | Modèle Claude utilisé |
| `OPENAI_API_KEY` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Clé API OpenAI (si provider cloud activé) |
| `SAP_MATCH_THRESHOLD` | `float` | `0.75` | `0.75` | ✅ | Seuil de confiance minimum pour les suggestions SAP (0–1) |
| `SAP_MATCH_TOP_K` | `int` | `3` | `3` | ✅ | Nombre de suggestions SAP retournées |
| `ANOMALY_BATCH_HOUR` | `int` | `2` | `2` | ✅ | Heure du batch quotidien de détection d'anomalies IA |

---

## 1.21 Synchronisation Intranet

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `INTRANET_SYNC_MODE` | `string` | `csv` | `api` | ✅ | Mode de synchronisation des employés. Valeurs : `api` / `ldap` / `csv` |
| `INTRANET_API_BASE_URL` | `string` | _(vide)_ | _(URL API intranet client)_ | ⚠ | URL de l'API intranet |
| `INTRANET_API_KEY` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Clé API intranet |
| `INTRANET_SYNC_CRON` | `string` | `0 */4 * * *` | `0 */4 * * *` | ✅ | Cron de synchronisation (défaut : toutes les 4h) |
| `INTRANET_DEACTIVATION_CYCLES` | `int` | `2` | `2` | ✅ | Cycles sans apparition avant désactivation automatique d'un PAX |

---

## 1.22 Cartographie

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `MAP_PROVIDER` | `string` | `leaflet_osm` | `leaflet_osm` | ✅ | Provider cartographique. Valeurs : `leaflet_osm` / `google_maps` / `mapbox` |
| `GOOGLE_MAPS_API_KEY` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Clé API Google Maps (si MAP_PROVIDER=google_maps) |
| `MAPBOX_ACCESS_TOKEN` | `string` | _(vide)_ | _(optionnel)_ | ❌ 🔒 | Token Mapbox (si MAP_PROVIDER=mapbox) |
| `MAP_DEFAULT_CENTER_LAT` | `float` | `3.848` | `3.848` | ✅ | Latitude du centre par défaut de la carte |
| `MAP_DEFAULT_CENTER_LON` | `float` | `9.54` | `9.54` | ✅ | Longitude du centre par défaut |
| `MAP_DEFAULT_ZOOM` | `int` | `8` | `8` | ✅ | Niveau de zoom par défaut |
| `GEOCODING_PROVIDER` | `string` | `nominatim` | `nominatim` | ✅ | Fournisseur géocodage adresses (ramassage terrestre) |

---

## 1.23 Draw.io (éditeur PID/PFD)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `DRAWIO_URL` | `string` | `https://embed.diagrams.net` | `https://drawio.app.opsflux.io` | ✅ | URL de l'instance draw.io. CDN en dev, self-hosted Docker en prod |

---

## 1.24 Rapports & API

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `REPORT_GENERATION_TIMEOUT_S` | `int` | `60` | `60` | ✅ | Timeout génération rapport PDF/DOCX (secondes) |
| `REPORT_MAX_EXPORT_ROWS` | `int` | `50000` | `50000` | ✅ | Nombre maximum de lignes dans un export CSV |
| `API_DEFAULT_PAGE_SIZE` | `int` | `20` | `20` | ✅ | Taille de page par défaut pour les listes API |
| `API_MAX_PAGE_SIZE` | `int` | `100` | `100` | ✅ | Taille de page maximum autorisée |

---

## 1.25 Monitoring

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SENTRY_DSN` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | DSN Sentry pour la capture d'erreurs en production |
| `PROMETHEUS_ENABLED` | `bool` | `False` | `True` | ✅ | Activer l'endpoint `/metrics` Prometheus |
| `PROMETHEUS_PORT` | `int` | `9090` | `9090` | ❌ | Port de l'endpoint Prometheus |
| `GRAFANA_URL` | `string` | _(vide)_ | `https://monitoring.app.opsflux.io` | ⚠ | URL Grafana — affiché dans le dashboard /admin/health |

---

## 1.26 Administration & Backup

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `SUPER_ADMIN_EMAILS` | `list[str]` | `admin@opsflux.io` | _(à configurer)_ | ✅ | Emails super admins. Reçoivent les alertes critiques infra + backup. Séparés par virgule |
| `BACKUP_RETENTION_DAYS` | `int` | `7` | `30` | ✅ | Rétention des dumps PostgreSQL (jours) |
| `BACKUP_DIR` | `string` | `/tmp/opsflux_backups` | `/opt/opsflux/backups` | ✅ | Chemin du volume de stockage des backups |

---

## 1.27 Déploiement (Dokploy)

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `DOKPLOY_API_URL` | `string` | _(vide)_ | `https://dokploy.app.opsflux.io` | ⚠ | URL API Dokploy pour les déploiements CI/CD |
| `DOKPLOY_API_TOKEN` | `string` | _(vide)_ | _(à configurer)_ | ⚠ 🔒 | Token API Dokploy |

---

## 1.28 Frontend Vite (VITE_*)

> Ces variables sont injectées dans le build frontend. Préfixe `VITE_` obligatoire.
> **Pas de Hocuspocus en v1** — la co-édition temps réel (Hocuspocus/Yjs) est prévue pour la v2.

| Slug | Type | Default dev | Default prod | Requis | Description |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | `string` | `http://localhost:8000` | `https://api.opsflux.io` | ✅ | URL de l'API backend (appelée depuis le browser) |
| `VITE_WS_URL` | `string` | `ws://localhost:8000` | `wss://api.opsflux.io` | ✅ | URL WebSocket pour les notifications temps réel |
| `VITE_DRAWIO_URL` | `string` | `https://embed.diagrams.net` | `https://drawio.app.opsflux.io` | ✅ | URL draw.io pour l'éditeur PID/PFD |
| `VITE_APP_ENV` | `string` | `development` | `production` | ✅ | Environnement frontend (affecte les devtools React) |
| `VITE_SENTRY_DSN` | `string` | _(vide)_ | _(à configurer)_ | ⚠ | DSN Sentry frontend |
| `VITE_WEB_URL` | `string` | `http://localhost:5174` | `https://web.opsflux.io` | ✅ | URL portail web (liens dans les notifications) |

---

## 1.29 GitHub Actions Secrets (CI/CD)

> Configurés dans **GitHub > Settings > Secrets and variables > Actions**. Ne jamais mettre dans `.env`.

| Slug | Type | Description |
|---|---|---|
| `DOCKER_REGISTRY_URL` | `string` | URL du registry Docker. Ex: `ghcr.io/org` |
| `DOCKER_REGISTRY_USER` | `string` 🔒 | Utilisateur du registry Docker |
| `DOCKER_REGISTRY_PASSWORD` | `string` 🔒 | Mot de passe / token du registry Docker |
| `DOKPLOY_API_URL` | `string` | URL API Dokploy pour les déploiements auto |
| `DOKPLOY_API_TOKEN` | `string` 🔒 | Token API Dokploy |
| `STAGING_DATABASE_URL` | `string` 🔒 | URL DB staging (pour les migrations en CI) |
| `SENTRY_AUTH_TOKEN` | `string` 🔒 | Token Sentry pour l'upload des source maps |

---

# PARTIE 2 — Platform DB Settings (gestion des tenants)

> **Table** : `platform.tenants` (dans la base `opsflux_platform`)
> **Architecture** : Tenant (schéma PG) > Entité (entity_id) > BU
>
> Chaque tenant dispose d'un schéma PostgreSQL dédié. La base platform gère :
> - L'enregistrement des tenants
> - Le licensing et les quotas
> - Le routage des requêtes vers le bon schéma

## 2.1 Table `platform.tenants`

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Identifiant unique du tenant |
| `slug` | `string` | Slug unique du tenant (utilisé comme nom de schéma PG). Ex: `perenco_cmr` |
| `name` | `string` | Nom d'affichage du tenant |
| `schema_name` | `string` | Nom du schéma PostgreSQL. Convention : `tenant_{slug}` |
| `is_active` | `bool` | Tenant actif ou suspendu |
| `plan` | `string` | Plan de licence : `starter` / `professional` / `enterprise` |
| `max_users` | `int` | Nombre maximum d'utilisateurs autorisés |
| `max_entities` | `int` | Nombre maximum d'entités autorisées |
| `max_storage_gb` | `int` | Quota de stockage S3 (Go) |
| `features_enabled` | `json` | Modules activés pour ce tenant. Ex: `["projets","planner","paxlog","travelwiz","ai_mcp"]` |
| `sso_config` | `json` | Configuration SSO spécifique au tenant (provider, metadata URL, mappings) |
| `created_at` | `timestamp` | Date de création |
| `updated_at` | `timestamp` | Dernière modification |

## 2.2 Table `platform.entities`

> Chaque tenant peut avoir plusieurs entités (filiales, sites, pays).

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Identifiant unique de l'entité (`entity_id`) |
| `tenant_id` | `uuid` FK | Référence vers le tenant |
| `slug` | `string` | Slug unique au sein du tenant. Ex: `perenco_cameroun`, `perenco_gabon` |
| `name` | `string` | Nom d'affichage |
| `timezone` | `string` | Fuseau horaire IANA de l'entité |
| `default_language` | `string` | Langue par défaut : `fr` / `en` |
| `is_active` | `bool` | Entité active |
| `settings_override` | `json` | Surcharge des settings du tenant au niveau entité |

## 2.3 Table `platform.bus` (Business Units)

> Sous-division d'une entité.

| Colonne | Type | Description |
|---|---|---|
| `id` | `uuid` | Identifiant unique de la BU |
| `entity_id` | `uuid` FK | Référence vers l'entité |
| `slug` | `string` | Slug unique au sein de l'entité |
| `name` | `string` | Nom d'affichage |
| `is_active` | `bool` | BU active |

---

# PARTIE 3 — Module Settings (stockés en DB, configurables depuis l'UI)

> **Table** : `module_settings_values` (dans le schéma du tenant)
> **Scope** : `entity` = valeur par entité / `user` = valeur par utilisateur
> **Interface** : Settings > Modules > {Module}
> **i18n** : FR + EN supportés

## 3.1 Core — Général

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `core.default_language` | `select` | `entity` | `fr` | `fr`, `en` | Langue par défaut de l'interface pour cette entité |
| `core.enabled_languages` | `multi_select` | `entity` | `["fr","en"]` | `fr`, `en` | Langues activées pour cette entité |
| `core.timezone` | `select` | `entity` | `Africa/Douala` | Timezones IANA | Fuseau horaire de l'entité. Affiché dans les dates et les crons |
| `core.date_format` | `select` | `entity` | `dd/MM/yyyy` | `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd` | Format d'affichage des dates |
| `core.theme` | `select` | `user` | `system` | `light`, `dark`, `system` | Thème de l'interface |
| `core.notification_email_enabled` | `toggle` | `user` | `true` | — | Recevoir les notifications par email |
| `core.notification_inapp_enabled` | `toggle` | `user` | `true` | — | Recevoir les notifications in-app |
| `core.home_page_dashboard_id` | `reference` | `user` | _(vide)_ | — | Dashboard affiché à la page d'accueil (personnalisé par user) |

## 3.2 Core — Carte

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `core.map_default_lat` | `number` | `entity` | `3.848` | — | Latitude du centre par défaut de la carte |
| `core.map_default_lng` | `number` | `entity` | `9.54` | — | Longitude du centre par défaut |
| `core.map_default_zoom` | `number` | `user` | `8` | 1–18 | Niveau de zoom par défaut de la carte |

## 3.3 Core — Email Templates

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `core.email_header_logo_url` | `text_short` | `entity` | `/static/logo-opsflux.png` | — | URL du logo dans les emails |
| `core.email_footer_text` | `text_long` | `entity` | `OpsFlux` | — | Texte de pied de page des emails |
| `core.email_accent_color` | `text_short` | `entity` | `#1a56db` | — | Couleur d'accent des emails (hex) |

## 3.4 Core — IA (par entité)

> La configuration des providers IA est stockée dans `module_settings_values.value` au format JSON complexe.

| Slug | Type | Scope | Défaut | Description |
|---|---|---|---|---|
| `core.ai_providers` | `json` | `entity` | `[{"slug":"ollama","model":"llama3","functions":["generation","embedding","suggestion"],"is_active":true}]` | Liste des providers IA. Chaque provider a : `slug`, `label`, `api_url`, `model`, `api_key_encrypted`, `functions`, `is_active` |
| `core.ai_enabled` | `toggle` | `entity` | `true` | **Toggle global IA.** Si désactivé, aucune fonction AI Assist ni panneau IA ne sont disponibles |
| `core.ai_chat_enabled` | `toggle` | `entity` | `true` | Activer le panneau IA conversationnel dans l'interface |
| `core.ai_briefing_enabled` | `toggle` | `user` | `true` | Afficher le briefing journalier dans le panneau IA |
| `core.ai_category_prefill_enabled` | `toggle` | `entity` | `true` | Activer toutes les fonctions de pré-remplissage IA |
| `core.ai_category_suggest_enabled` | `toggle` | `entity` | `true` | Activer toutes les fonctions de suggestion IA |
| `core.ai_category_detect_enabled` | `toggle` | `entity` | `true` | Activer toutes les fonctions de détection IA (doublons, anomalies, compliance) |
| `core.ai_category_generate_enabled` | `toggle` | `entity` | `true` | Activer toutes les fonctions de génération IA (WBS, rapports, widgets) |
| `core.ai_category_analyze_enabled` | `toggle` | `entity` | `true` | Activer toutes les fonctions d'analyse IA (prévisions, digest) |

### Toggles individuels par fonction AI Assist

> Chaque fonction enregistrée via `AIAssistRegistry` est configurable individuellement.
> Le slug de la fonction sert de clé dans `module_settings_values` avec le module `ai_assist`.
> **Hiérarchie de résolution** : `core.ai_enabled` → `core.ai_category_{cat}_enabled` → toggle individuel.
> Si un niveau supérieur est désactivé, le niveau inférieur est ignoré.

| Slug | Type | Scope | Défaut | LLM | Description |
|---|---|---|---|---|---|
| `paxlog.ads.prefill_from_description` | `toggle` | `entity` | `true` | Oui | Pré-remplir l'AdS depuis une description libre |
| `paxlog.ads.enrich_from_avm` | `toggle` | `entity` | `true` | Non | Enrichir l'AdS auto-créée par un AVM (transport, imputation) |
| `paxlog.ads.suggest_from_history` | `toggle` | `entity` | `true` | Non | Suggestions basées sur l'historique du PAX/demandeur |
| `paxlog.compliance.proactive_alerts` | `toggle` | `entity` | `true` | Non | Alertes proactives certifications expirantes |
| `paxlog.pax.detect_duplicates` | `toggle` | `entity` | `true` | Non | Détection doublons profils PAX |
| `paxlog.ads.estimate_duration` | `toggle` | `entity` | `true` | Non | Estimation durée de séjour |
| `planner.activity.suggest_resources` | `toggle` | `entity` | `true` | Non | Suggestion ressources/durée depuis historique |
| `planner.conflict.suggest_resolution` | `toggle` | `entity` | `true` | Oui | Suggestion résolution de conflit |
| `planner.capacity.forecast` | `toggle` | `entity` | `true` | Non | Prévision charge PAX |
| `projets.wbs.generate_skeleton` | `toggle` | `entity` | `true` | Oui | Génération squelette WBS |
| `projets.risk.identify` | `toggle` | `entity` | `true` | Oui | Identification risques projet |
| `projets.schedule.suggest_durations` | `toggle` | `entity` | `true` | Non | Suggestion durées tâches |
| `travelwiz.cargo.match_sap` | `toggle` | `entity` | `true` | Oui | Matching code SAP |
| `travelwiz.cargo.prefill_from_description` | `toggle` | `entity` | `true` | Oui | Pré-remplir déclaration cargo |
| `travelwiz.manifest.suggest_grouping` | `toggle` | `entity` | `true` | Non | Suggestion regroupement PAX par transport |
| `travelwiz.route.suggest_transport` | `toggle` | `entity` | `true` | Non | Suggestion mode transport depuis historique |
| `core.tiers.detect_duplicates` | `toggle` | `entity` | `true` | Non | Détection doublons tiers |
| `core.tiers.prefill_from_name` | `toggle` | `entity` | `true` | Oui | Pré-remplir catégorie/secteur tiers |
| `core.asset.suggest_parent` | `toggle` | `entity` | `true` | Non | Suggestion parent dans hiérarchie asset |
| `core.workflow.suggest_template` | `toggle` | `entity` | `true` | Non | Suggestion template workflow |
| `core.dashboard.nlq_to_widget` | `toggle` | `entity` | `true` | Oui | Widget KPI depuis question en langage naturel |
| `core.notifications.smart_digest` | `toggle` | `entity` | `true` | Oui | Digest intelligent des notifications |
| `report.autocomplete` | `toggle` | `entity` | `true` | Oui | Auto-complétion IA dans l'éditeur |
| `report.generate_section` | `toggle` | `entity` | `true` | Oui | Génération section de rapport |
| `report.suggest_template` | `toggle` | `entity` | `true` | Non | Suggestion template rapport |

## 3.5 Module — Report Editor

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `report_editor.default_export_format` | `select` | `user` | `pdf` | `pdf`, `docx` | Format d'export par défaut |
| `report_editor.autosave_interval_seconds` | `number` | `user` | `30` | 10–300 | Intervalle d'auto-sauvegarde dans l'éditeur (secondes) |
| `report_editor.offline_quota_mb` | `number` | `entity` | `50` | 10–500 | Quota de stockage hors-ligne par user (Mo) |
| `report_editor.enable_ai_autocomplete` | `toggle` | `user` | `true` | — | Activer la complétion automatique IA dans l'éditeur BlockNote |
| `report_editor.track_changes_on_edit` | `toggle` | `user` | `false` | — | Activer le suivi des modifications par défaut à l'ouverture |
| `report_editor.default_classification` | `select` | `entity` | `INT` | `CONF`, `REST`, `INT`, `PUB` | Classification par défaut des nouveaux documents |
| `report_editor.require_comment_on_reject` | `toggle` | `entity` | `true` | — | Commentaire obligatoire lors d'un rejet de workflow |
| `report_editor.max_revision_keep` | `number` | `entity` | `50` | 10–999 | Nombre maximum de révisions conservées par document |

## 3.6 Module — PID/PFD + TagRegistry

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `pid_pfd.default_line_spec` | `select` | `entity` | `150` | `150`, `300`, `600` | Classe de ligne par défaut (ASME) pour les nouvelles lignes de procédé |
| `pid_pfd.auto_suggest_tags` | `toggle` | `user` | `true` | — | Suggestions automatiques de noms de tags DCS |
| `pid_pfd.drawio_grid_size` | `number` | `user` | `10` | 5–50 | Taille de la grille draw.io en pixels |
| `pid_pfd.tag_naming_strict_mode` | `toggle` | `entity` | `true` | — | Mode strict : interdire les tags non conformes aux règles de nommage |
| `pid_pfd.pid_lock_timeout_minutes` | `number` | `entity` | `30` | 5–120 | Durée du lock optimiste sur un PID (minutes) avant expiration |

## 3.7 Module — Dashboard

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `dashboard.default_refresh_interval` | `select` | `user` | `0` | `0`, `30000`, `60000`, `300000`, `900000` | Intervalle de rafraîchissement automatique (ms). 0=manuel |
| `dashboard.sql_widget_timeout_seconds` | `number` | `entity` | `30` | 5–60 | Timeout maximum pour les requêtes SQL des widgets personnalisés |
| `dashboard.default_home_dashboard_id` | `reference` | `entity` | _(vide)_ | — | Dashboard affiché par défaut pour les nouveaux utilisateurs |

## 3.8 Module — Asset Registry

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `asset_registry.default_import_mode` | `select` | `entity` | `upsert` | `create_only`, `upsert`, `update_only` | Comportement par défaut lors de l'import CSV d'assets |
| `asset_registry.default_asset_view` | `select` | `user` | `list` | `list`, `map` | Vue par défaut de la liste des assets |
| `asset_registry.map_cluster_enabled` | `toggle` | `user` | `true` | — | Activer le clustering des markers sur la carte |

## 3.9 Module — Tiers

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `tiers.default_tiers_type` | `select` | `entity` | `contractor` | `supplier`, `partner`, `client`, `subcontractor`, `contractor`, `transporter`, `other` | Type par défaut lors de la création d'un tiers |
| `tiers.auto_create_virtual_tiers` | `toggle` | `entity` | `true` | — | Créer automatiquement un tiers virtuel pour les contacts standalone |
| `tiers.enable_blacklist_warning` | `toggle` | `entity` | `true` | — | Bannière d'avertissement sur les tiers blacklistés |
| `tiers.ext_link_default_expiry_hours` | `number` | `entity` | `72` | 24–720 | Durée de vie par défaut des liens portail Tiers (heures) |

## 3.10 Module — PaxLog

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `paxlog.compliance_check_before_submit` | `toggle` | `entity` | `true` | — | Vérifier la compliance HSE avant soumission d'une AdS |
| `paxlog.ads_notice_hours` | `number` | `entity` | `24` | 0–168 | Préavis minimum avant start_date d'une AdS (heures) |
| `paxlog.pax_dedup_threshold` | `number` | `entity` | `0.85` | 0.7–0.99 | Seuil déduplication fuzzy PAX |
| `paxlog.default_visit_category` | `select` | `entity` | `visit` | `project_work`, `workover`, `drilling`, `integrity`, `maintenance`, `inspection`, `permanent_ops`, `visit`, `other` | Catégorie de visite par défaut pour les nouvelles AdS |
| `paxlog.max_pax_per_ads` | `number` | `entity` | `50` | 1–200 | Nombre maximum de PAX par AdS |

## 3.11 Module — Planner

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `planner.conflict_notify_do` | `toggle` | `entity` | `true` | — | Notifier le DO à chaque conflit de capacité |
| `planner.default_activity_priority` | `select` | `entity` | `medium` | `critical`, `high`, `medium`, `low` | Priorité par défaut des nouvelles activités |
| `planner.gantt_max_assets` | `number` | `entity` | `200` | 50–500 | Nombre maximum d'assets dans le Gantt Planner |
| `planner.activity_types_custom` | `json` | `entity` | `[]` | — | Types d'activités supplémentaires définis par l'admin |

## 3.12 Module — TravelWiz

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `travelwiz.trip_delay_reassign_threshold_hours` | `number` | `entity` | `4` | 1–24 | Délai (h) au-delà duquel réassignation PAX possible |
| `travelwiz.weather_warn_beaufort` | `number` | `entity` | `6` | 3–12 | Alerte si force Beaufort >= N |
| `travelwiz.cargo_stall_days` | `number` | `entity` | `5` | 1–30 | Alerte si colis immobile depuis N jours |
| `travelwiz.pax_default_weight_kg` | `number` | `entity` | `85` | 60–120 | Poids PAX par défaut (kg) si non renseigné |
| `travelwiz.kpi_productive_threshold` | `number` | `entity` | `70` | 50–100 | Seuil productivité voyage (%). En dessous, alerte |

## 3.13 Module — IA & MCP

| Slug | Type | Scope | Défaut | Options | Description |
|---|---|---|---|---|---|
| `ai_mcp.rag_top_k` | `number` | `entity` | `5` | 2–10 | Nombre de chunks utilisés comme contexte pour les réponses RAG |
| `ai_mcp.rag_chunk_size` | `number` | `entity` | `600` | 200–1200 | Taille des chunks d'indexation en tokens |
| `ai_mcp.rag_chunk_overlap` | `number` | `entity` | `100` | 0–300 | Overlap entre chunks consécutifs en tokens |
| `ai_mcp.mcp_rate_limit_per_minute` | `number` | `entity` | `50` | 10–200 | Nombre maximum d'appels MCP tools par minute par utilisateur |
| `ai_mcp.autocomplete_debounce_ms` | `number` | `user` | `1000` | 500–3000 | Délai avant déclenchement de l'auto-complétion IA (ms) |
| `ai_mcp.sap_match_threshold` | `number` | `entity` | `0.75` | 0.5–0.99 | Seuil confiance minimum pour suggestions SAP |
| `ai_mcp.sap_match_top_k` | `number` | `entity` | `3` | 1–10 | Nombre de suggestions SAP retournées |

---

# PARTIE 4 — User Preferences (localStorage + DB)

> **Hook** : `useUserPreference(key, defaultValue)`
> **Stockage** : localStorage immédiat + sync async DB
> **API** : `GET/PATCH /api/v1/me/preferences/{key}`

| Slug | Type | Défaut | Description |
|---|---|---|---|
| `theme` | `string` | `system` | Thème UI : `light` / `dark` / `system` |
| `language` | `string` | _(langue entité)_ | Langue de l'interface pour cet utilisateur (`fr` / `en`) |
| `dynamic_panel.pinned` | `bool` | `false` | Panneau dynamique épinglé — reste ouvert à la navigation |
| `sidebar.expanded` | `bool` | `true` | Sidebar étendue (180px) ou réduite (48px icônes) |
| `bu_context` | `string` | _(vide)_ | UUID de la BU active dans le switcher. Vide = toutes les BU |
| `table.documents.page_size` | `int` | `25` | Taille de page dans la liste des documents |
| `table.documents.sort` | `json` | `{"field":"updated_at","direction":"desc"}` | Tri par défaut de la liste documents |
| `table.assets.{type_slug}.page_size` | `int` | `25` | Taille de page dans une liste d'assets par type |
| `table.tiers.page_size` | `int` | `25` | Taille de page dans la liste des tiers |
| `table.ads.page_size` | `int` | `25` | Taille de page dans la liste des AdS |
| `table.trips.page_size` | `int` | `25` | Taille de page dans la liste des voyages |
| `table.cargo.page_size` | `int` | `25` | Taille de page dans la liste du cargo |
| `table.dcs_tags.page_size` | `int` | `25` | Taille de page dans le TagRegistry |
| `filters.documents` | `json` | `{}` | Filtres sauvegardés sur la liste documents |
| `filters.assets.{type_slug}` | `json` | `{}` | Filtres sauvegardés sur une liste d'assets |
| `filters.ads` | `json` | `{}` | Filtres sauvegardés sur la liste des AdS |
| `home_page_dashboard_id` | `string` | _(vide)_ | Dashboard personnalisé de l'utilisateur pour la page d'accueil |
| `ai_panel.open` | `bool` | `false` | Panneau IA ouvert ou fermé par défaut |
| `ai.autocomplete_enabled` | `bool` | `true` | Auto-complétion IA activée dans l'éditeur pour cet utilisateur |
| `editor.autosave_interval_seconds` | `int` | `30` | Intervalle d'auto-save personnel (override du setting module) |
| `editor.default_export_format` | `string` | `pdf` | Format d'export préféré : `pdf` ou `docx` |
| `map.default_zoom` | `int` | `8` | Zoom par défaut de la carte assets |
| `dashboard.default_refresh_interval` | `int` | `0` | Rafraîchissement auto des dashboards (ms). 0 = manuel |
| `notifications.email_enabled` | `bool` | `true` | Recevoir les notifications par email |
| `notifications.inapp_enabled` | `bool` | `true` | Recevoir les notifications in-app |
| `pid.drawio_grid_size` | `int` | `10` | Taille de grille draw.io personnelle |
| `pid.auto_suggest_tags` | `bool` | `true` | Suggestions de tags DCS activées |
| `paxlog.ads_default_view` | `string` | `list` | Vue par défaut de la liste AdS : `list` / `kanban` |
| `planner.gantt_default_zoom` | `string` | `month` | Zoom par défaut du Gantt Planner : `week` / `month` / `quarter` |

---

# PARTIE 5 — Seuils d'alerte Infrastructure

> Configurés dans le code (`app/workers/health_monitor.py`).
> Modifiables uniquement par le super_admin via `.env` ou redéploiement.
> **Task queue** : APScheduler (pas ARQ).

| Métrique | Seuil Warning | Seuil Critical | Seuil Blocking | Action |
|---|---|---|---|---|
| `storage_percent` | 60% | 80% | 95% | Warning: email / Critical: email urgent + notif / Blocking: bloquer uploads |
| `db_size_gb` | 50 GB | 80 GB | — | Warning: email / Critical: email urgent |
| `db_connections_percent` | 70% | 90% | — | Warning: email / Critical: email urgent |
| `redis_memory_percent` | 70% | 85% | — | Warning: email / Critical: email urgent |
| `apscheduler_queue_depth` | 50 jobs | 200 jobs | — | Warning: email / Critical: email urgent |
| `backup_age_hours` | 26h (backup manqué) | 50h | — | Warning: email / Critical: email urgent |
| `tag_sequence_percent` | 90% (SEQ:N proche de 10^N) | — | — | Warning visible dans Settings nomenclature |
| `iot_stale_vehicles_percent` | 30% | 60% | — | Warning: notif LOG_BASE / Critical: alerte DO |

---

# PARTIE 6 — Fichier `.env.example` complet

```bash
# ═══════════════════════════════════════════════════════════════════
# OpsFlux — .env.example
# Copier en .env.dev / .env.staging / .env.prod
# NE JAMAIS COMMITTER LES FICHIERS .env RÉELS
# ═══════════════════════════════════════════════════════════════════
# Docker : 6 conteneurs (backend, frontend, web-portal, postgres, redis, traefik)
# Architecture : Tenant (schéma PG) > Entité (entity_id) > BU
# i18n : FR + EN
# ═══════════════════════════════════════════════════════════════════

# ── Général ──────────────────────────────────────────────────────
ENVIRONMENT=development                        # development | staging | production | test
DEBUG=False
SECRET_KEY=CHANGE_ME_generate_with_openssl_rand_hex_32
ALLOWED_HOSTS=*
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
LOG_LEVEL=INFO

# ── URLs (domaines : *.opsflux.io) ──────────────────────────────
APP_URL=http://localhost:5173                  # prod: https://app.opsflux.io
API_BASE_URL=http://localhost:8000             # prod: https://api.opsflux.io
WEB_URL=http://localhost:5174                  # prod: https://web.opsflux.io
FRONTEND_URL=http://localhost:5173             # alias APP_URL pour redirections backend

# ── Base de données (platform DB + schémas tenants) ─────────────
DATABASE_URL=postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev
DATABASE_URL_SYNC=postgresql://opsflux:password@localhost:5432/opsflux_dev
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=30

# ── Redis (cache + APScheduler + WS + révocation JWT) ───────────
REDIS_URL=redis://localhost:6379/0
REDIS_TTL_POSITION=86400                       # 24h — cache positions IoT
REDIS_TTL_SIMULATION=14400                     # 4h — sessions simulation planning
REDIS_TTL_OTP=600                              # 10min — tokens OTP portail externe
SESSION_REVOCATION_BACKEND=redis               # redis | database

# ── Auth & JWT ──────────────────────────────────────────────────
AUTH_ENABLED_METHODS=sso,email_password         # méthodes actives (virgule)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480                # 15 en prod
REFRESH_TOKEN_EXPIRE_DAYS=7
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCKOUT_DURATION_MIN=15
AUTH_PASSWORD_MIN_LENGTH=12
AUTH_PASSWORD_REQUIRE_SPECIAL=true

# ── SSO Multi-provider (SAML2 / OIDC / LDAP) ───────────────────
SSO_ENABLED=false
SSO_PROTOCOL=oidc                              # saml2 | oidc | ldap
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_CLAIM=extension_OpsFluxTenant     # claim custom Azure pour mapping tenant
SAML_IDP_METADATA_URL=
SAML_SP_ENTITY_ID=https://app.opsflux.io
SAML_SP_ACS_URL=https://app.opsflux.io/auth/saml/callback
SAML_ATTRIBUTE_MAPPING={"email":"emailaddress","first_name":"givenname","last_name":"surname","department":"department"}
SSO_SLO_ENABLED=true
LDAP_HOST=
LDAP_PORT=636
LDAP_BASE_DN=
LDAP_BIND_DN=
LDAP_BIND_PASSWORD=
LDAP_USE_SSL=true

# ── Bootstrap (désactiver après 1er démarrage) ──────────────────
BOOTSTRAP_ENABLED=false
BOOTSTRAP_SECRET=CHANGE_ME_RANDOM_LONG_SECRET

# ── Email SMTP ──────────────────────────────────────────────────
SMTP_HOST=mailhog
SMTP_PORT=1025                                 # 587 en prod (STARTTLS)
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_USE_TLS=False
SMTP_FROM_ADDRESS=noreply@opsflux.io
SMTP_FROM_NAME=OpsFlux
INVITATION_EXPIRY_HOURS=72

# ── SMS ─────────────────────────────────────────────────────────
SMS_PROVIDER=none                              # none | twilio | orange_cm | both
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=+237XXXXXXXXX
SMS_FALLBACK_TO_EMAIL=true

# ── Stockage fichiers (S3-compatible) ───────────────────────────
STORAGE_BACKEND=local                          # local | s3
STORAGE_LOCAL_PATH=./uploads
STORAGE_MAX_FILE_SIZE_MB=50
UPLOAD_ALLOWED_TYPES=application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,video/mp4
S3_ENDPOINT=                                   # ex: minio:9000, s3.amazonaws.com
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=opsflux-prod
S3_REGION=us-east-1
S3_USE_SSL=true
S3_PRESIGN_EXPIRY_SECONDS=3600

# ── Module PaxLog ───────────────────────────────────────────────
PAX_DEDUP_THRESHOLD=0.85
PAX_ADS_NOTICE_HOURS=24
PAX_OTP_LENGTH=6
PAX_EXT_LINK_EXPIRY_HOURS=72
PAX_EXT_LINK_RATE_LIMIT=10
PAX_ROTATION_BATCH_HOUR=6
PAX_MEDICAL_WARN_DAYS=30
PAX_CREDENTIAL_WARN_DAYS=30
PAX_REQUIRES_REVIEW_WARN_DAYS=14
PAX_REQUIRES_REVIEW_FORCE_DAYS=28
PAX_MAX_COMPANY_DEDUP_SEARCH=all
MEDICAL_POLICY_ENCRYPT=false                   # valider avec DRH avant prod

# ── Module AVM ──────────────────────────────────────────────────
AVM_DEFAULT_MISSION_TYPE=standard
AVM_EPI_MEASUREMENTS_FIELDS=["taille_vetement","pointure","tour_tete","tour_taille"]
AVM_GLOBAL_DOC_TYPES=["ordre_mission","loi","programme_officiel","contrat","autre"]
AVM_PAX_DOC_TYPES=["passport","visa","medical_fit","autre"]

# ── Module Planner ──────────────────────────────────────────────
PLANNER_GANTT_MAX_ASSETS=200
PLANNER_CONFLICT_NOTIFY_DO=true
PLANNER_CAPACITY_CACHE_TTL=300
PLANNER_MATVIEW_REFRESH_INTERVAL=5
PLANNER_DRILLING_MIN_PRIORITY=high

# ── Module Projets ──────────────────────────────────────────────
PROJECTS_TASK_REMINDER_DAYS=7,1
PROJECTS_GANTT_LIBRARY=svar_mit

# ── Module TravelWiz ────────────────────────────────────────────
TRIP_DELAY_REASSIGN_THRESHOLD_HOURS=4
CAPTAIN_PORTAL_CODE_LENGTH=6
CAPTAIN_PORTAL_CODE_EXPIRY_HOURS=48
CAPTAIN_PORTAL_RATE_LIMIT=10
MANIFEST_PDF_TEMPLATE_DIR=/app/templates/pdf
MANIFEST_REPORTS_DIR=/tmp/reports
KPI_CALCULATION_CRON=0 2 * * *
KPI_PRODUCTIVE_THRESHOLD=70
PAX_DEFAULT_WEIGHT_KG=85

# ── IoT & Tracking ─────────────────────────────────────────────
IOT_POSITION_STALE_MINUTES=15
IOT_STREAM_HEARTBEAT_SECONDS=30
IOT_STALE_CHECK_INTERVAL_MINUTES=5
IOT_PARTITION_BY=week                          # week | month
IOT_PRIORITY_STALE_THRESHOLD_MIN=5

# ── Météo ───────────────────────────────────────────────────────
WEATHER_PROVIDER=open_meteo                    # open_meteo | openweathermap | stormglass | none
WEATHER_API_KEY=
WEATHER_FETCH_INTERVAL_MINUTES=30
WEATHER_WARN_BEAUFORT=6

# ── Cargo ───────────────────────────────────────────────────────
CARGO_STALL_DAYS=5

# ── Ramassage terrestre ─────────────────────────────────────────
PICKUP_GEOFENCE_RADIUS_M=100
PICKUP_ETA_NOTIFY_MINUTES=5

# ── Intelligence Artificielle & MCP ─────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3
OLLAMA_EMBEDDING_MODEL=nomic-embed-text        # dimension: 768
EMBEDDING_DIMENSIONS=768                       # DOIT correspondre au modèle embedding
LITELLM_MASTER_KEY=sk-dev-change-me
ANTHROPIC_API_KEY=                             # optionnel — rapports narratifs + matching SAP
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=
SAP_MATCH_THRESHOLD=0.75
SAP_MATCH_TOP_K=3
ANOMALY_BATCH_HOUR=2

# ── Synchronisation Intranet ────────────────────────────────────
INTRANET_SYNC_MODE=csv                         # api | ldap | csv
INTRANET_API_BASE_URL=
INTRANET_API_KEY=
INTRANET_SYNC_CRON=0 */4 * * *
INTRANET_DEACTIVATION_CYCLES=2

# ── Cartographie ────────────────────────────────────────────────
MAP_PROVIDER=leaflet_osm                       # leaflet_osm | google_maps | mapbox
GOOGLE_MAPS_API_KEY=
MAPBOX_ACCESS_TOKEN=
MAP_DEFAULT_CENTER_LAT=3.848
MAP_DEFAULT_CENTER_LON=9.54
MAP_DEFAULT_ZOOM=8
GEOCODING_PROVIDER=nominatim

# ── Draw.io ─────────────────────────────────────────────────────
DRAWIO_URL=https://embed.diagrams.net          # CDN dev / https://drawio.app.opsflux.io prod

# ── Rapports & API ──────────────────────────────────────────────
REPORT_GENERATION_TIMEOUT_S=60
REPORT_MAX_EXPORT_ROWS=50000
API_DEFAULT_PAGE_SIZE=20
API_MAX_PAGE_SIZE=100

# ── Monitoring ──────────────────────────────────────────────────
SENTRY_DSN=
PROMETHEUS_ENABLED=False
PROMETHEUS_PORT=9090
GRAFANA_URL=

# ── Administration & Backup ─────────────────────────────────────
SUPER_ADMIN_EMAILS=admin@opsflux.io
BACKUP_RETENTION_DAYS=30
BACKUP_DIR=/opt/opsflux/backups

# ── Dokploy ─────────────────────────────────────────────────────
DOKPLOY_API_URL=
DOKPLOY_API_TOKEN=

# ── Frontend Vite — copier dans frontend/.env.local ─────────────
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_DRAWIO_URL=https://embed.diagrams.net
VITE_APP_ENV=development
VITE_SENTRY_DSN=
VITE_WEB_URL=http://localhost:5174
```

---

# PARTIE 7 — Points en attente de décision

| Variable | Raison du blocage | Décideur |
|---|---|---|
| `MEDICAL_POLICY_ENCRYPT` | Chiffrement données médicales — à valider avant mise en prod | DRH client |
| `INTRANET_SYNC_MODE` | Dépend de ce que l'intranet client expose : API REST, LDAP ou export CSV | DSI client |
| `SSO_PROTOCOL` | SAML2 (ADFS) ou OIDC (Azure AD / Entra ID) — selon infrastructure IAM client | DSI client |
| `AZURE_TENANT_CLAIM` | Nom du claim custom dans Azure AD pour le mapping tenant OpsFlux | IT client |
| `MAP_PROVIDER` | `leaflet_osm` (gratuit, open source) vs `google_maps` (payant, meilleure précision) | Equipe OpsFlux |
| `WEATHER_PROVIDER` | `open_meteo` (gratuit) vs `stormglass` (précision maritime supérieure) | Equipe OpsFlux |
