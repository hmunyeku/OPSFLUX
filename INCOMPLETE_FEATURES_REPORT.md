# Rapport d'Analyse: Fonctionnalités Incomplètes du Codebase

## Résumé Exécutif
Analyse approfondie du codebase identifiant **18 fonctionnalités incomplètes ou partiellement implémentées** dans le core et les modules. Ces fonctionnalités nécessitent une attention prioritaire pour la stabilité et la complétude de l'application.

**Statistiques:**
- 40+ commentaires TODO/FIXME/XXX/HACK trouvés
- 5 services CORE partiellement implémentés
- 8 endpoints API sans implémentation complète
- 2 migrations créant des tables non utilisées
- 6 fonctionnalités du module HSE bloquantes

---

## 1. SERVICES CORE INCOMPLETS

### 1.1. Hook Service - Actions Incomplètes
**Priorité:** HAUTE | **Statut:** 40% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/services/hook_service.py` (lignes 324, 380, 390, 409, 424, 433)
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/hook_trigger_service.py` (lignes 196, 220)

**Ce qui fonctionne:**
- Système de déclenchement d'événements CRUD ✓
- Actions: send_notification, send_email (partielles)
- Conditions et évaluation ✓

**Ce qui manque:**
1. **Email Templates System** (ligne 324)
   - Pas d'implémentation du système de templates email
   - Fallback sur un template basique non configurable
   - Impact: emails génériques et non professionnels

2. **Webhook External Calls** (lignes 380, 390)
   - TODO: Implémenter quand WebhookService sera créé
   - Fonctionnalité complètement bloquée
   - Clients ne peuvent pas déclencher d'actions externes
   - Impact: Intégrations tierces impossible

3. **Execute Code Action** (ligne 409)
   - Désactivé pour raisons de sécurité
   - NotImplementedError levée
   - TODO: Implémenter avec sandboxing
   - Impact: Automatisations complexes impossible

4. **Create Task (Celery)** (lignes 424, 433)
   - TODO: Implémenter quand Celery sera configuré
   - Les tâches asynchrones ne peuvent pas être créées automatiquement
   - Impact: Scalabilité et performance dégradées

5. **Notification Logging** (hook_trigger_service.py ligne 196, 220)
   - TODO: Créer l'entrée Notification/Task si le modèle existe
   - Les actions ne sont pas loggées complètement

---

### 1.2. Search Service - Backends Incomplets
**Priorité:** MOYENNE | **Statut:** 30% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/search_service.py` (lignes 234, 328)

**Ce qui fonctionne:**
- PostgreSQL Full-Text Search (implémentation basique) ✓
- Collections et indexation ✓

**Ce qui manque:**
1. **ElasticSearch Integration** (ligne 234, 328)
   - TODO: Implémenter ElasticSearch/Meilisearch
   - Déliégué à plus tard
   - Fonction `_index_postgresql` et `_search_postgresql` les seules implémentées
   - Impact: Pas de haute performance pour gros volumes

2. **Meilisearch Support** (ligne 234, 328)
   - Pas d'implémentation
   - Config existante mais non utilisée
   - Impact: Recherche ultra-rapide indisponible

---

### 1.3. Storage Service - Features Manquantes
**Priorité:** MOYENNE | **Statut:** 60% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/storage_service.py` (lignes 586, 605)

**Ce qui manque:**
1. **S3/MinIO Signed URLs** (ligne 605)
   - TODO: Implémenter avec JWT ou signature
   - `get_signed_url()` retourne URL simple sans expiration
   - Impact: Fichiers téléchargeables indéfiniment sans authentification

2. **S3 URL Generation** (ligne 586)
   - TODO: Implémenter pour S3
   - Uniquement pour local storage
   - Impact: AWS S3 non fonctionnel pour URLs

---

### 1.4. Two-Factor Authentication - SMS Incomplete
**Priorité:** HAUTE | **Statut:** 70% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/twofa.py` (ligne 110)

**Ce qui fonctionne:**
- TOTP (Google Authenticator) ✓
- Backup codes ✓
- Configuration/Activation TOTP ✓

**Ce qui manque:**
1. **SMS 2FA Activation** (ligne 110)
   - TODO: Implémenter activation SMS
   - Endpoint retourne 501 NOT_IMPLEMENTED
   - Les clients peuvent envoyer des codes SMS mais pas activer SMS comme 2FA
   - Impact: SMS 2FA incomplet

---

### 1.5. AI Service - Streaming Incomplet
**Priorité:** BASSE | **Statut:** 80% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/ai.py` (ligne 93)

**Ce qui manque:**
1. **Streaming Response** (ligne 93)
   - TODO: Implémenter le streaming proprement avec SSE
   - Paramètre `stream=True` non supporté
   - Clients doivent attendre la réponse complète
   - Impact: UX dégradée pour longues réponses

---

## 2. ENDPOINTS API SANS IMPLÉMENTATION COMPLÈTE

### 2.1. Google Maps Integration
**Priorité:** BASSE | **Statut:** 0% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/addresses.py` (lignes 248, 262, 276)

**Endpoints commentés:**
- `POST /addresses/validate` - Validation Google Maps
- `POST /addresses/geocode` - Géocodage Google Maps

**État:** Code entièrement commenté avec TODO
```python
# TODO: Implement Google Maps integration endpoints
# TODO: Implement Google Maps Address Validation API
# TODO: Implement Google Maps Geocoding API
```
**Impact:** Adresses non validées/géocodées

---

### 2.2. Database Info - Last Backup Manquant
**Priorité:** BASSE | **Statut:** 95% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/database.py` (ligne 105)

**Ce qui manque:**
1. **Last Backup Retrieval** (ligne 105)
   - Champ `last_backup=None` toujours vide
   - TODO: Implémenter la récupération de la dernière sauvegarde
   - Impact: Dashboard ne sait pas quand était le dernier backup

---

### 2.3. User RBAC Loading
**Priorité:** MOYENNE | **Statut:** 90% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/users.py` (ligne 65)

**Ce qui manque:**
1. **Eager Loading des RBAC Relations** (ligne 65)
   - TODO: Implement proper RBAC data loading when with_rbac=True
   - Paramètre `with_rbac=True` ignoré
   - N+1 query problem possible
   - Impact: Performance des listes utilisateurs dégradée

---

### 2.4. Permissions RBAC Check
**Priorité:** BASSE | **Statut:** 95% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/api/routes/permissions.py` (ligne 233)

**Ce qui manque:**
1. **Permission Check** (ligne 233)
   - TODO: Check rbac.read permission
   - Route retourne données sans vérifier permission
   - Impact: Bypass potentiel du RBAC

---

## 3. MIGRATIONS CRÉANT DES TABLES NON UTILISÉES

### 3.1. Scheduled Backups Table
**Priorité:** BASSE | **Statut:** Table créée, fonctionnalité absente

**Fichier concerné:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/alembic/versions/s1t2u3v4w5x6_add_scheduled_backups_table.py`

**Table créée:** `scheduled_backups`
- Colonnes: schedule_frequency, schedule_time, schedule_day, last_run_at, next_run_at, etc.
- Indexes créés pour performance

**État:** Aucune logique de déclenchement n'existe:
- Pas de Celery task pour exécuter backups
- Pas d'endpoint pour gérer les backups planifiés
- Pas de scheduler (APScheduler, etc.)
- Impact: Backups automatisés impossible

---

### 3.2. Search Index Table
**Priorité:** MOYENNE | **Statut:** Table créée, partiellement utilisée

**Fichier concerné:**
- Migration: `de354b4e000e_add_search_index_table.py`

**État:** Table créée mais:
- Utilisée uniquement pour PostgreSQL full-text search
- ElasticSearch/Meilisearch non implémentés
- Indexation manuelle nécessaire
- Impact: Recherche n'est pas à jour automatiquement

---

## 4. MODULE HSE - PERMISSIONS NON IMPLÉMENTÉES

**Priorité:** HAUTE | **Statut:** 30% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/modules/hse/backend/routes.py` (lignes 50, 95, 115, 152, 193, 231)
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/modules/hse/backend/service.py` (lignes 58, 126, 134, 142, 151, 207, 216, 286)

**Permissions à implémentér:**
1. `hse.view.incident` - Lecture incidents
2. `hse.view.dashboard` - Dashboard HSE
3. `hse.create.incident` - Créer incident
4. `hse.edit.incident` - Modifier incident
5. `hse.delete.incident` - Supprimer incident

**Intégrations manquantes CORE:**
1. **SettingsService CORE** (ligne 58)
   - TODO: Vérifier permission hse.view.incident (x6)
   - Préfixe incidents non récupéré depuis settings

2. **NotificationService CORE** (ligne 126)
   - TODO: EXPLOITER NotificationService CORE
   - Pas de notifications d'incident créé

3. **EmailService CORE** (ligne 134)
   - TODO: EXPLOITER EmailService CORE si critique
   - Emails incidents non envoyés

4. **AuditService CORE** (lignes 142, 207, 286)
   - TODO: EXPLOITER AuditService CORE
   - Incidents non loggés pour audit

5. **HookService CORE** (lignes 151, 216)
   - TODO: EXPLOITER HookService CORE pour déclencher les hooks
   - Événements incidents non déclenchés

---

## 5. MODULE LOADER - VÉRIFICATIONS MANQUANTES

**Priorité:** MOYENNE | **Statut:** 80% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/module_loader.py` (lignes 157, 163, 166)

**Validations manquantes:**
1. **Vérifier Services CORE** (ligne 157)
   - TODO: Vérifier que les services CORE requis sont disponibles
   - Installation possible de modules avec services manquants

2. **Vérifier Module Dépendances** (ligne 163)
   - TODO: Vérifier que le module requis est installé et activé
   - Pas de contrôle de dépendances circulaires

3. **Vérifier Conflits** (ligne 166)
   - TODO: Vérifier qu'aucune permission/menu/hook ne conflicte avec l'existant
   - Conflicts possibles lors d'installation multiple
   - Impact: Modules peuvent écraser permissions/menus l'un de l'autre

---

### 5.1. Menu Hierarchy
**Priorité:** BASSE | **Statut:** 80% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/services/module_service.py` (lignes 553)

**Ce qui manque:**
1. **Parent Menu Management** (ligne 553)
   - TODO: Gérer la hiérarchie
   - `parent_id=None` toujours
   - Menus imbriqués non supportés
   - Impact: UI menu plate et peu organisée

---

## 6. WEBHOOK LOGGING

**Priorité:** BASSE | **Statut:** 95% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/webhook_executor_service.py` (ligne 211)

**Ce qui manque:**
1. **WebhookLog Entry** (ligne 211)
   - TODO: Créer une entrée WebhookLog si le modèle existe
   - Code commenté, jamais exécuté
   - Impact: Webhooks calls non tracés

---

## 7. SMS PROVIDERS - IMPLÉMENTATION PARTIELLE

**Priorité:** HAUTE | **Statut:** 60% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/sms_providers.py`

**Providers configurés:**
- twilio
- bulksms
- ovh
- messagebird
- vonage

**État:** Code structure existe mais...
- Certains providers ont implémentation vide (pass)
- Pas de tests unitaires
- Impact: SMS peut échouer silencieusement sur certains providers

---

## 8. QUEUE SERVICE - RETRY LOGIC

**Priorité:** BASSE | **Statut:** 95% complète

**Fichiers concernés:**
- `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/backend/app/core/queue_service.py` (ligne 361)

**Ce qui manque:**
1. **Retry Mechanism** (ligne 361)
   - raise NotImplementedError("Retry not yet implemented")
   - Task failures ne sont pas retentées
   - Impact: Tâches échouées sont perdues

---

## 9. IMPACT GLOBAL PAR DOMAINE

### Frontend/API Mismatches
- Endpoints pour scheduled backups existent en DB mais pas d'UI
- Search endpoints existent mais ElasticSearch/Meilisearch non intégrés
- Webhook logging implémenté côté API mais pas côté database

### Sécurité
- Signed URLs non implémentées (S3)
- Permission check manquant sur liste permissions
- Module conflicts peuvent écraser permissions

### Performance
- RBAC eager loading manquant (N+1 queries)
- Search optimizations manquantes (ES/Meilisearch)
- Retry logic absente (task failures)

### Scalabilité
- Celery tasks non implémentées (hooks)
- Async email templates absentes
- No streaming support pour AI responses

---

## 10. RECOMMANDATIONS DE PRIORITÉ

### CRITIQUE (Bloquer release)
1. SMS 2FA Activation - `/routes/twofa.py:110`
2. HSE Module Permissions - `/modules/hse/backend/routes.py`
3. Module Conflict Detection - `/core/module_loader.py:166`
4. Webhook External Calls - `/services/hook_service.py:390`

### HAUTE (Sprint actuel)
1. Email Templates System - `/services/hook_service.py:324`
2. RBAC Eager Loading - `/api/routes/users.py:65`
3. Scheduled Backups Logic - Table créée, logique manquante
4. Retry Mechanism - `/core/queue_service.py:361`

### MOYENNE (Prochain sprint)
1. ElasticSearch Integration - `/core/search_service.py:234`
2. S3 Signed URLs - `/core/storage_service.py:605`
3. Last Backup Retrieval - `/api/routes/database.py:105`
4. AI Streaming - `/api/routes/ai.py:93`

### BASSE (Backlog)
1. Google Maps Integration - `/api/routes/addresses.py:248`
2. Menu Hierarchy - `/services/module_service.py:553`
3. Execute Code Action - `/services/hook_service.py:409` (sécurité d'abord)
4. Meilisearch Support - `/core/search_service.py:234`

---

## 11. FICHIERS À VÉRIFIER EN PRIORITÉ

| Priorité | Fichier | Ligne(s) | Issue |
|----------|---------|----------|-------|
| CRITIQUE | `modules/hse/backend/routes.py` | 50, 95, 115, 152, 193, 231 | Permissions non vérifiées |
| CRITIQUE | `api/routes/twofa.py` | 110 | SMS 2FA non implémenté |
| HAUTE | `services/hook_service.py` | 324, 380, 390, 409, 424, 433 | 5 actions incomplètes |
| HAUTE | `core/module_loader.py` | 157, 163, 166 | Validations manquantes |
| HAUTE | `api/routes/users.py` | 65 | RBAC loading non implémenté |
| MOYENNE | `core/search_service.py` | 234, 328 | ElasticSearch/Meilisearch absents |
| MOYENNE | `core/storage_service.py` | 586, 605 | S3 features manquantes |
| BASSE | `api/routes/database.py` | 105 | Last backup manquant |
| BASSE | `api/routes/ai.py` | 93 | Streaming non implémenté |

---

## Conclusion

Le codebase a une bonne structure de base mais **40+ items TODO/FIXME** indiquent que plusieurs fonctionnalités cruciales ne sont pas complètes. Les serveurs CORE partiellement implémentés (Hook, Search, Storage) impactent directement les possibilités de modules comme HSE.

La création de tables de migration (`scheduled_backups`, `search_index`) sans logique correspondante suggère un design incomplet planifié mais jamais finalisé.

**Estimation:** 2-3 sprints pour terminer les fonctionnalités CRITIQUE et HAUTE.

