
# 🎯 PROMPT MAÎTRE OPSFLUX

**Version :** 3.0 - RESET COMPLET
**Date :** 08 Octobre 2025
**Cible :** Développement assisté par IA (Claude Code)
**Statut :** 🔄 RESET - Redémarrage à zéro avec nouvelle architecture

---

## 🔄 **CONTEXTE DU RESET**

### Décision stratégique
**Date :** 08 Octobre 2025
**Raison :** Reprise à zéro avec architecture clean et stack moderne cohérente

**Problèmes identifiés dans la version précédente :**
- ❌ Architecture frontend incohérente (mélange React-Admin, Fluent UI, OpenUI5)
- ❌ Code legacy accumulé avec incohérences
- ❌ Documentation fragmentée et contradictoire
- ❌ Stack technique non uniforme
- ❌ Dette technique importante

**Nouvelle approche :**
- ✅ **Architecture monolithique propre** (FastAPI + React, conteneurs séparés)
- ✅ **Stack moderne cohérente** (FastAPI + SQLModel + shadcn/ui + Radix + Tailwind)
- ✅ **Documentation unifiée** (CLAUDE.md, ROADMAP.md, DEV_LOG.md synchronisés)
- ✅ **Code production-ready** dès le départ
- ✅ **Tests systématiques** (pytest + vitest)

---

## 🔓 **AUTORISATIONS COMPLÈTES**

**L'IA a les AUTORISATIONS COMPLÈTES pour** :
- ✅ Aller sur internet (WebSearch, WebFetch) sans demander
- ✅ Faire du `ls`, `find`, `grep`, `cat`, etc. sans demander
- ✅ Faire des `git commit`, `git push`, `git status`, `git diff`, `git log` sans demander d'autorisation
- ✅ Modifier, créer, supprimer des fichiers sans demander
- ✅ Exécuter **toutes** les commandes Docker sans demander :
  - `docker ps`, `docker logs`, `docker inspect`
  - `docker-compose up`, `docker-compose down`, `docker-compose restart`
  - `docker-compose logs`, `docker-compose exec`
  - `docker exec`, `docker restart`, `docker stop`, `docker start`
- ✅ Lire tous les fichiers du projet sans exception
- ✅ Analyser les logs et résoudre les problèmes de manière autonome
- ✅ Prendre des décisions techniques autonomes pour résoudre les bugs
- ✅ Exécuter des tests (pytest, npm test) sans demander
- ✅ Installer des dépendances (pip install, npm install) sans demander
- ✅ Faire des migrations Alembic (revision, upgrade) sans demander
- ✅ **SUPPRIMER et RECRÉER** du code existant si nécessaire (avec prudence)

**L'IA doit être PROACTIVE et AUTONOME** : ne pas demander de permission sauf si la décision est **critique** (suppression base données, changement architecture majeure, etc.)

**IMPORTANT :**
- ✅ Stack actuelle : FastAPI + SQLModel (déjà en place)
- ✅ Développement incrémental sur base existante
- ✅ Migrations Alembic déjà configurées
- ✅ Frontend shadcn/ui déjà configuré

---

## ⛔ **INTERDICTIONS ABSOLUES**

L'IA **DOIT** respecter ces règles **SANS EXCEPTION** :

### 🚫 **Commits & Documentation**
- ❌ **NE JAMAIS** ajouter "🤖 Generated with Claude Code" dans les commits
- ❌ **NE JAMAIS** ajouter "Co-Authored-By: Claude <noreply@anthropic.com>"
- ❌ **NE JAMAIS** ajouter AUCUNE mention Claude/IA dans les fichiers de code (ex: "with Claude", "by Claude", "using Claude", etc.)
- ❌ **NE JAMAIS** ajouter de commentaires IA dans les fichiers (.py, .js, .jsx, .ts, .tsx, etc.)
- ✅ **TOUJOURS** faire des commits professionnels standard SANS AUCUNE mention IA

### 🚫 **Développement**
- ❌ **NE JAMAIS** perdre de fonctionnalités entre versions
- ❌ **NE JAMAIS** créer du code sans tester les **4 couches** (backend/frontend/mobile/web)
- ❌ **NE JAMAIS** committer sans vérifier la cohérence backend ↔ frontend ↔ mobile
- ❌ **NE JAMAIS** tourner en rond → Si bloqué, **DEMANDER** clarification à l'utilisateur
- ❌ **NE JAMAIS** créer de modèles inutiles (Customer, Supplier ne sont pas pertinents ici)
- ❌ **NE JAMAIS** utiliser React-Admin ou Fluent UI → Utiliser **shadcn/ui + Radix + Tailwind** uniquement
- ❌ **NE JAMAIS** créer de module métier à ce stade → Focus 100% sur **CORE services**
- ❌ **NE JAMAIS** prendre de raccourcis sur les fonctionnalités → Toujours complet et fonctionnel
- ❌ **NE JAMAIS** faire du code partiel/incomplet → Si trop long, utiliser l'outil Task (agent)

### 🚫 **Architecture**
- ❌ **NE JAMAIS** créer de container `web/` dédié → Le web est servi par `frontend/`
- ❌ **NE JAMAIS** hardcoder des valeurs → Tout doit être paramétrable via UI
- ❌ **NE JAMAIS** mettre de logique métier dans le frontend → Backend = source de vérité

---

## ✅ **OBLIGATIONS STRICTES**

### ✓ **Avant chaque commit**
1. ✅ Vérifier **backend** : API testée, migrations OK, pas de régression
2. ✅ Vérifier **frontend** : UI fonctionne, appels API corrects, responsive
3. ✅ Vérifier **mobile** : Compilation OK, fonctionnalités testées
4. ✅ Vérifier **cohérence** : Aucune fonctionnalité perdue vs version précédente
5. ✅ Mettre à jour **TOUS les .md concernés** : docs/projet/ (ROADMAP.md, DEV_LOG.md, CORE_SERVICES.md), docs/developer/ (TECHNICAL_DECISIONS.md, etc.), .claude/
6. ✅ Commit avec message **professionnel SANS AUCUNE mention IA**

### ✓ **Développement**
1. ✅ **TOUJOURS** fournir du code production-ready immédiatement exécutable
2. ✅ **TOUJOURS** guider étape par étape avec roadmap claire
3. ✅ **TOUJOURS** proposer les **3 prochaines actions** après chaque tâche
4. ✅ **TOUJOURS** interroger l'utilisateur en cas de doute ou ambiguïté
5. ✅ **TOUJOURS** maintenir la cohérence architecturale totale
6. ✅ **TOUJOURS** assurer la traçabilité complète via audit trail
7. ✅ **TOUJOURS** préparer les fonctionnalités pour intégration IA future
8. ✅ **TOUJOURS** structurer les données pour Business Intelligence
9. ✅ **TOUJOURS** mettre à jour TOUS les .md après chaque fonctionnalité terminée (docs/projet/ROADMAP.md, docs/projet/DEV_LOG.md, docs/developer/, .claude/)
10. ✅ **TOUJOURS** implémenter les fonctionnalités de manière COMPLÈTE et FONCTIONNELLE
11. ✅ **Si fonctionnalité trop longue** : Utiliser l'outil **Task (agent)** pour déléguer → PAS de raccourcis

---

## 🏗️ **ARCHITECTURE MONOLITHIQUE PROPRE (V3.0)**

**Principe :** Architecture monolithique moderne ultra-simplifiée pour <1000 utilisateurs

### **Structure projet finale**

```
OpsFlux/
├── Dockerfile              # Build multi-stage optimisé (React → Django)
├── docker-compose.yml      # 5 services: app, postgres, redis, celery_worker, celery_beat
├── .env                    # Configuration unique centralisée
│
├── backend/                # Django backend + API + Static files
│   ├── config/            # Settings Django (settings.py, urls.py, wsgi.py)
│   ├── core/              # Services CORE transversaux
│   │   ├── models/        # Modèles de base (AbstractBaseModel, etc.)
│   │   ├── services/      # Services CORE (NotificationService, etc.)
│   │   ├── middleware/    # Middlewares globaux
│   │   ├── permissions/   # Système RBAC
│   │   └── utils/         # Utilitaires
│   ├── apps/              # Applications Django (vide au démarrage)
│   │   └── users/         # App users (seule app métier initiale)
│   ├── staticfiles/       # Fichiers statiques compilés (Whitenoise)
│   │   └── react/         # Build React copié ici (production)
│   ├── media/             # Uploads utilisateurs
│   ├── templates/         # Templates Django (email, etc.)
│   ├── manage.py          # Django CLI
│   └── requirements.txt   # Dépendances Python
│
├── frontend/              # React + Vite + shadcn/ui
│   ├── public/            # Assets statiques
│   ├── src/
│   │   ├── components/    # Composants shadcn/ui + customs
│   │   │   └── ui/        # shadcn/ui components (copiés)
│   │   ├── features/      # Features modulaires (users, roles, etc.)
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # Utilities (axios, utils.ts)
│   │   ├── pages/         # Pages routes
│   │   ├── stores/        # Zustand stores
│   │   ├── App.tsx        # Root component
│   │   ├── main.tsx       # Entry point
│   │   └── index.css      # Global styles + Tailwind
│   ├── package.json       # Dépendances npm
│   ├── vite.config.ts     # Config Vite (proxy /api → Django)
│   ├── tailwind.config.js # Config Tailwind
│   ├── tsconfig.json      # TypeScript config
│   └── components.json    # shadcn/ui config
│
├── mobile/                # React Native (Phase future)
│   └── (vide pour l'instant)
│
├── scripts/               # Scripts DevOps
│   ├── init.sh            # Init projet (DB, migrations, superuser)
│   ├── build.sh           # Build React + Django
│   ├── dev.sh             # Mode développement
│   ├── test.sh            # Run all tests
│   └── deploy.sh          # Déploiement production
│
├── docs/                  # Documentation
│   ├── projet/            # Docs projet (ROADMAP, DEV_LOG, CORE_SERVICES)
│   └── developer/         # Docs techniques (ARCHITECTURE, API, etc.)
│
├── tests/                 # Tests E2E (Playwright/Cypress)
├── backups/               # Backups PostgreSQL automatiques
├── logs/                  # Logs applicatifs
│
├── CLAUDE.md              # Ce fichier - Instructions IA
├── README.md              # Documentation projet
├── .gitignore             # Git ignore
└── .env.example           # Template configuration
```

### **Services Docker**
1. **app** : Django + Gunicorn + React build (port 8000)
   - Sert l'API REST (`/api/*`)
   - Sert l'admin Django (`/admin/*`)
   - Sert l'application React (`/*` toutes autres routes)
2. **postgres** : PostgreSQL 16 (port 5432)
3. **redis** : Redis 7 cache/queue (port 6379)
4. **celery_worker** : Workers asynchrones (4 workers)
5. **celery_beat** : Scheduler tâches planifiées

### **Principe fondamental**
- **Backend Django** = API + Logique métier + Serving React (Whitenoise)
- **Frontend React** = Build copié dans `backend/staticfiles/react/`
- **Whitenoise** = Sert les fichiers statiques efficacement sans Nginx
- **Mobile** = React Native (développement futur)
- **1 seul container app** en production = Django sert tout (API + React SPA)

### **Modes de fonctionnement**

#### **Mode Développement**
```bash
# Terminal 1: Backend Django
cd backend
python manage.py runserver 0.0.0.0:8000

# Terminal 2: Frontend Vite (hot reload)
cd frontend
npm run dev  # http://localhost:3001 (proxy /api → :8000)
```

#### **Mode Production**
```bash
# Build & deploy
./scripts/build.sh   # Build React → copie vers backend
docker-compose up -d # Django sert API + React sur :8000
```

---

## 🎯 **DOMAINE MÉTIER**

### **OpsFlux n'est PAS un ERP classique**

OpsFlux est un **MOS (Management Operating System)** spécialisé dans la **gestion des flux logistiques et organisationnels des entreprises industrielles**, particulièrement **Oil & Gas**.

### **Cibles utilisateurs**
Le système est **adaptable** et utilisable par :
1. **Oil Operators** (Total, Shell, BP, Eni, etc.)
2. **Service Companies** (Schlumberger, Halliburton, Weatherford, etc.)
3. **Logistics Providers** (CHC, Bristow, Bourbon, etc.)
4. **Autres industries** (Mining, Construction, Maritime, etc.)

### **Zones géographiques**
- 🌍 **Focus Afrique** (Golfe de Guinée, Angola, Nigeria, Congo, etc.)
- 🌍 **Adaptable** : Mer du Nord, Brésil, Moyen-Orient, Asie-Pacifique

### **Modules métiers futurs (NE PAS créer maintenant)**
```
⏳ À développer APRÈS le CORE (10 modules) :
1. Offshore Booking System (réservation vols hélico, navires)
2. HSE Reports (incidents, near-miss, audits sécurité)
3. POB Management (Personnel On Board temps réel)
4. Logistics Tracking (hélicos, bateaux, containers, manifestes cargo)
5. Permit To Work System (PTW, permis travail)
6. Document Management (certifications, passeports, visas)
7. Asset Management (équipements, maintenance)
8. Procurement (achats, approvisionnements)
9. Planning Multi-départements (opérations, maintenance, drilling)
10. Crew Management (rotations personnel offshore 28j on/off)
```

### **Vocabulaire métier Oil & Gas**
```
- Rig/Platform : Plateforme pétrolière offshore
- Vessel : Navire logistique
- POB : Personnel On Board (personnel présent)
- HSE : Health, Safety, Environment
- QHSE : Quality, Health, Safety, Environment
- PTW : Permit To Work (permis de travail)
- BOSIET : Basic Offshore Safety Induction & Emergency Training
- HUET : Helicopter Underwater Escape Training
- Manifest : Liste cargo/personnel pour transport
- Mobilization : Mobilisation équipe/équipement vers site
- Demobilization : Démobilisation (retour base)
- Crew change : Rotation équipage
- Shutdown : Arrêt programmé plateforme
```

---

## 🔧 **STACK TECHNIQUE**

### **Backend**
- **Framework** : FastAPI 0.114+ (async, modern, rapide)
- **ORM** : SQLModel 0.0.21 (Pydantic + SQLAlchemy)
- **Base de données** : PostgreSQL 16 avec UUID + `external_id`
- **Migrations** : Alembic 1.12+
- **Cache** : Redis 7 (à intégrer)
- **Tasks async** : Celery + Beat (à intégrer)
- **Auth** : JWT (PyJWT 2.8+, bcrypt pour hash)
- **API Doc** : OpenAPI/Swagger auto-généré (FastAPI natif)
- **IA** : Multi-providers (à intégrer)

### **Frontend (Desktop + Web public) - V3.0**
- **Framework** : React 18.3 + TypeScript 5.3 + Vite 5.1
- **UI Components** : shadcn/ui (composants copiés) + Radix UI (headless primitives)
- **Styling** : Tailwind CSS 3.4 (utility-first)
- **Routing** : TanStack Router v1 (file-based, type-safe)
- **HTTP Client** : Axios 1.6
- **State Management** :
  - **Server State** : TanStack Query v5 (React Query - cache, mutations, invalidation)
  - **Client State** : Zustand v4 (notifications, theme, user preferences)
- **Forms** : React Hook Form 7.51 + Zod 3.22 (validation TypeScript-first)
- **Icons** : Lucide React 0.344 (modern, tree-shakeable)
- **Charts** : Recharts 2.12 (composant <Chart> shadcn/ui)
- **Date/Time** : date-fns 3.3
- **Build** : Vite 5.1 (HMR ultra-rapide, code splitting automatique)

**shadcn/ui :**
- Collection de composants réutilisables construits avec Radix UI et Tailwind
- Composants **copiés dans le projet** (pas de dépendance npm), entièrement personnalisables
- Accessible par défaut (WCAG 2.1 AA grâce à Radix)
- Documentation : https://ui.shadcn.com/
- CLI : `npx shadcn-ui@latest add <component>` pour installer composants

**Architecture frontend :**
- **Feature-based** : Dossiers par feature (users, roles, etc.)
- **Composants atomiques** : Réutilisation maximale
- **TypeScript strict** : Type-safety totale
- **CSS-in-JS JAMAIS** : Tailwind uniquement

### **Mobile (iOS/Android)**
- **Framework** : React Native + Expo
- **Navigation** : React Navigation
- **State** : Redux Toolkit ou Zustand
- **Offline** : Redux Persist + AsyncStorage
- **Push** : Expo Notifications (FCM/APNS)
- **Biométrie** : expo-local-authentication
- **Camera** : expo-camera (QR codes, photos)
- **Location** : expo-location (géolocalisation)

### **Infrastructure**
- **Conteneurisation** : Docker + Docker Compose
- **Orchestration** : Dokploy
- **Proxy** : Traefik (géré par Dokploy)
- **SSL** : Let's Encrypt (auto via Dokploy)
- **CI/CD** : GitHub → Dokploy auto-deploy

---

## 🎯 **PHASE ACTUELLE : RESET & FOUNDATION (V3.0)**

### **🔄 État actuel (08 Octobre 2025)**

**Statut :** RESET COMPLET - Reprise à zéro

**Actions à réaliser dans l'ordre :**

#### **ÉTAPE 1 : Clean-up (Suppression ancien code)**
- ❌ Supprimer ancien frontend (legacy React-Admin/OpenUI5)
- ❌ Supprimer migrations Django incohérentes
- ❌ Nettoyer database (DROP et recréer tables)
- ❌ Supprimer fichiers obsolètes

#### **ÉTAPE 2 : Foundation Backend (Django)**
- ❌ Recréer structure backend propre
- ❌ Configurer Django settings (production-ready)
- ❌ Créer AbstractBaseModel (UUID, external_id, audit, soft-delete)
- ❌ App `users` avec modèle User custom
- ❌ Authentication JWT (login, refresh, logout)
- ❌ Migrations initiales

#### **ÉTAPE 3 : Foundation Frontend (React + shadcn/ui)**
- ❌ Init Vite + React + TypeScript
- ❌ Installer shadcn/ui (CLI init)
- ❌ Configurer Tailwind CSS
- ❌ Structure dossiers (components/ui, features, pages, etc.)
- ❌ Installer composants shadcn/ui de base (button, card, input, etc.)
- ❌ Page Login
- ❌ Layout principal (Header, Sidebar, Main)

#### **ÉTAPE 4 : Connexion Backend ↔ Frontend**
- ❌ Axios client configuré
- ❌ TanStack Query setup
- ❌ Zustand stores (auth, theme, notifications)
- ❌ Login fonctionnel (JWT)
- ❌ Protected routes
- ❌ Dashboard de base

#### **ÉTAPE 5 : Premier service CORE (Users CRUD)**
- ❌ Backend : CRUD Users API
- ❌ Frontend : Liste users (DataTable shadcn/ui)
- ❌ Frontend : Formulaire Create/Edit user
- ❌ Frontend : Page détails user
- ❌ Tests backend (pytest)
- ❌ Tests frontend (Vitest)

### **Services CORE - Planification post-foundation**

Après les 5 étapes ci-dessus, développement des 25 services CORE selon priorité.
Voir **docs/projet/CORE_DEVELOPMENT_ROADMAP.md** pour roadmap détaillée.

#### 🔴 **Priorité 0 - Critiques** (6 services)
1. ❌ Authentication & Security (0% - À refaire proprement)
2. ❌ Users, Roles, Permissions & Groups (0% - À refaire)
3. ❌ Notification System (0% - À refaire)
4. ❌ Translation/i18n Service (0%)
5. ❌ Menu Manager (0% - À refaire)
6. ❌ Hook & Trigger System (0%)

#### 🟠 **Priorité 1 - Haute** (8 services)
7. ❌ File Manager (0% - À refaire)
8. ❌ Import/Export Service (0%)
9. ❌ Email Queue System (0%)
10. ❌ Cron/Scheduler Service (0%)
11. ❌ Audit Trail & Logs (0%)
12. ❌ API Manager (Tokens, Swagger) (0%)
13. ❌ Webhook Manager (0%)
14. ❌ Calendar/Event Service (0%)

#### 🟡 **Priorité 2 - Moyenne** (6 services)
15. ❌ License Manager (Modules) (0%)
16. ❌ Module Manager (Install/Update) (0%)
17. ❌ AI Service (Multi-provider) (0%)
18. ❌ Search Engine (Full-text) (0%)
19. ❌ Report Generator (0%)
20. ❌ Monitoring (Health, Metrics) (0%)

#### 🟢 **Priorité 3 - Basse** (5 services)
21. ❌ Config Manager (UI) (0%)
22. ❌ URL Shortener (0%)
23. ❌ Comment/Note System (0%)
24. ❌ Version Control (Documents) (0%)
25. ❌ Workflow Engine (0%)

**Note :** Variable Substitution intégré dans Email/Notification/Report services (pas un service distinct)

**TOTAL : 0/25 services (0%) - Fresh start**

---

## 🗄️ **MODÈLES DE BASE CORE**

### **Modèles existants**
```python
# core/models/base.py
- AbstractBaseModel       # Tous les modèles héritent (created_at, updated_at, deleted_at, external_id)
- AbstractNamedModel      # Avec name, code, description
- AbstractAddressModel    # Adresses géographiques
- AbstractPartyModel      # Entités (personnes, organisations)

# core/models/
- Company                 # Multi-sociétés
- BusinessUnit            # Départements, sites, bases
- Currency                # Devises
- CurrencyRate            # Taux de change historisés
- Category                # Catégories hiérarchiques
- Tag                     # Tags métier
- Sequence                # Compteurs/numérotations
- Attachment              # Pièces jointes
- Notification            # Système notifications
```

### **Champs obligatoires sur tous les modèles**
```python
class AbstractBaseModel(models.Model):
    # Identifiant unique
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

    # Identifiant externe (intégration systèmes tiers)
    external_id = models.CharField(max_length=255, unique=True, null=True, db_index=True)

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, related_name='+', null=True)
    updated_by = models.ForeignKey(User, related_name='+', null=True)

    # Soft delete
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(User, related_name='+', null=True)

    class Meta:
        abstract = True
```

---

## 🎨 **CONVENTIONS DE CODE**

### **Langues**
- **Code** : Commentaires en français, code en anglais
- **Variables/fonctions** : Anglais (camelCase frontend, snake_case backend)
- **Documentation** : Français
- **Commits** : Français, professionnels, **SANS mention IA**

### **Commits Git**
```
Format standard :
[Scope] Description courte

Description longue optionnelle

Fonctionnalités:
- Point 1
- Point 2

Fichiers modifiés:
- fichier1.py
- fichier2.jsx
```

**Exemples :**
```
✅ BON :
Backend: Ajout service de traduction centralisé

Implémentation du TranslationService avec support
multi-langues (FR, EN, ES, PT).

Fonctionnalités:
- Modèles TranslationKey et Translation
- API CRUD traductions
- Cache Redis
- Import/Export JSON

Fichiers modifiés:
- backend/core/services/translation_service.py
- backend/core/models/translation.py
```

```
❌ MAUVAIS :
Backend: Add translation service

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

### **Structure fichiers**
```python
# Backend
"""
Module docstring en français
Description fonctionnelle
"""

# Imports
from django.db import models

# Constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Class/Functions
class MyModel(AbstractBaseModel):
    """
    Docstring en français
    Explique le rôle du modèle
    """
    name = models.CharField(max_length=255, help_text="Nom du modèle")

    def calculate_total(self):
        """Calcule le total (description en français)"""
        return sum(self.items.values_list('amount', flat=True))
```

```jsx
// Frontend
/**
 * Composant MyComponent
 * Description en français
 */

import React from 'react';

const MyComponent = () => {
  // Logique composant
  return <div>...</div>;
};

export default MyComponent;
```

---

## 🔒 **SÉCURITÉ**

### **Authentication**
- JWT stateless (Access 15min, Refresh 7j)
- 2FA obligatoire (TOTP + SMS)
- Biométrie mobile (Face ID, Touch ID)
- Rate limiting : 5 tentatives login / 15min
- Session management (liste sessions actives)
- SSO (SAML, OAuth2, LDAP/AD) pour entreprises

### **Authorization**
- RBAC (Role-Based Access Control)
- Permissions granulaires : `<app>.<action>.<scope>`
- Permission inheritance (groupes hiérarchiques)
- Cache permissions (Redis)

### **Data Protection**
- HTTPS obligatoire (production)
- Soft delete (audit trail complet)
- RGPD compliant (droit à l'oubli = hard delete après 90j)
- Encryption at rest (PostgreSQL, fichiers sensibles)
- Audit logs (toutes actions utilisateurs)

### **API Security**
- CORS strict
- Rate limiting (1000 req/h par défaut)
- API Keys pour intégrations externes
- Webhook signatures (HMAC SHA256)

---

## 📱 **MOBILE - SPÉCIFICITÉS**

### **Offline-First**
Toute l'application mobile doit fonctionner **100% offline** avec synchronisation automatique.

```javascript
// Architecture recommandée
- Redux Persist (state persistant)
- Queue des actions (sync quand réseau revient)
- Détection connexion (NetInfo)
- Indicateur sync status (UI)
```

### **Fonctionnalités natives prioritaires**
1. **2FA** : Biométrie (Face ID, Touch ID) + TOTP
2. **Notifications** : Push natives (FCM/APNS) + badge counter
3. **Camera** : Scan QR codes (équipements, badges), photos incidents
4. **Géolocalisation** : Check-in/check-out automatique, tracking
5. **Storage sécurisé** : Keychain (iOS), KeyStore (Android)

### **Ergonomie terrain**
- Grande taille boutons (oil/gas gloves)
- Mode sombre par défaut (fatigue yeux)
- Gestes intuitifs (swipe, long-press)
- Voix (Voice commands pour rapports)
- Signature numérique (permits, rapports)

---

## 🤖 **INTÉGRATION IA**

### **Services IA prévus (Phase 2)**

#### 1. **Apprentissage comportement utilisateur**
```python
# Tracking actions
- Clics, navigation, temps sur pages
- Détection patterns
- Suggestions contextuelles (boutons, menus)
```

#### 2. **Text AI**
```python
- Génération texte (emails, rapports HSE)
- Résumé documents (manifestes, procedures)
- Traduction automatique
- Correction orthographe/grammaire
```

#### 3. **Computer Vision**
```python
- OCR documents (passeports, certifications)
- Détection objets photos (équipements, incidents)
- Classification images
- QR/Barcode scanning
```

#### 4. **Predictive Analytics**
```python
- Prédiction incidents (ML sur historique HSE)
- Anomaly detection (équipements, performances)
- Recommandations (optimisation planning)
```

#### 5. **Conversational AI**
```python
- Chatbot support (documentation, FAQ)
- Voice commands (mobile)
- Intent recognition
```

### **Providers IA**
```python
# Multi-provider wrapper
- OpenAI (GPT-4, DALL-E)
- Anthropic Claude (Sonnet, Opus)
- Mistral (Mixtral)
- Ollama (local, on-premise)
- Custom (API entreprise)
```

---

## 📊 **BUSINESS INTELLIGENCE**

### **Architecture Data**
```
- Data Warehouse structure (fact & dimension tables)
- ETL pipelines automatiques (Celery tasks)
- Real-time analytics (Redis caching)
```

### **Fonctionnalités BI**
```
- Dashboard builder drag&drop
- Rapports prédictifs (ML)
- KPIs automatisés
- Data quality monitoring
- Export Excel/PDF
```

---

## 🧪 **TESTS**

### **Stratégie**
- **Tests unitaires** : 80% couverture minimum
- **Tests intégration** : Tous les endpoints API
- **Tests E2E** : Parcours utilisateur critiques
- **Tests mobile** : iOS + Android simulators

### **Outils**
```python
# Backend
- pytest + pytest-django
- coverage
- factory_boy (fixtures)

# Frontend
- Jest + React Testing Library
- Cypress (E2E)

# Mobile
- Jest + React Native Testing Library
- Detox (E2E iOS/Android)
```

---

## 📚 **DOCUMENTATION**

### **Fichiers de référence**
```
CLAUDE.md                           # Ce fichier (instructions IA)
README.md                           # Overview projet
docs/projet/CORE_SERVICES.md        # Spécifications 25 services CORE
docs/projet/ROADMAP.md              # État projet, fonctionnalités, métriques
docs/projet/DEV_LOG.md              # Journal sessions développement
docs/projet/DEPLOYMENT_NOTES.md     # Notes de déploiement
docs/developer/TECHNICAL_DECISIONS.md # Décisions architecture
docs/developer/                     # Documentation technique systèmes
```

### **API Documentation**
- **OpenAPI/Swagger** : Auto-généré (drf-spectacular)
- **URL** : `http://localhost:8000/api/schema/swagger-ui/`
- **Endpoint schemas** : Docstrings détaillées

---

## 🎯 **WORKFLOW DÉVELOPPEMENT**

### **Avant de commencer une tâche**
1. Lire **docs/projet/ROADMAP.md** (état actuel)
2. Lire **docs/projet/DEV_LOG.md** (dernière session)
3. Lire **docs/projet/CORE_SERVICES.md** (service à développer)
4. Demander clarification si besoin

### **Pendant le développement**
1. Créer **backend** en premier (modèles, serializers, views, tests)
2. Créer **API endpoints** (documenter avec OpenAPI)
3. Créer **frontend** (consomme API, validation UX)
4. Créer **mobile** (si applicable)
5. Tester **cohérence** backend ↔ frontend ↔ mobile

### **Après chaque fonctionnalité**
1. Tests unitaires (backend + frontend)
2. Mise à jour **docs/projet/ROADMAP.md**
3. Mise à jour **docs/projet/DEV_LOG.md**
4. Commit professionnel **sans mention IA**
5. Proposer **3 prochaines actions**

---

## 🚀 **PROCHAINES ÉTAPES**

Planning réaliste basé sur l'analyse fonctionnelle complète :

### **Phase 1 : CORE Services Priorité 0-1 (8 semaines)**

**Semaine 1-2 : Authentication & Security**
- ❌ JWT Login/Logout/Refresh
- ❌ 2FA (TOTP + SMS)
- ❌ Session Management
- ❌ Password Policy & Reset
- ❌ Tests unitaires + intégration
- ❌ Documentation API (Swagger)

**Semaine 3-4 : Users, Roles, Permissions, Groups (RBAC)**
- ❌ Modèles (User, Role, Permission, Group)
- ❌ Service RoleService (assign, check, cache Redis)
- ❌ Décorateurs (@has_permission, @has_role)
- ❌ API CRUD complète
- ❌ Frontend UI (gestion utilisateurs)
- ❌ Tests + Documentation

**Semaine 5-6 : Notifications + Translation + Menu**
- ❌ NotificationService (multi-canal : in-app, email, SMS, push)
- ❌ Templates notifications + préférences utilisateur
- ❌ TranslationService (i18n FR/EN/ES/PT)
- ❌ MenuManager (navigation dynamique, permissions)
- ❌ Tests + Documentation

**Semaine 7-8 : Hooks, File Manager, Import/Export**
- ❌ HookService (triggers événements automatisés)
- ❌ FileManager (upload, storage, scan antivirus)
- ❌ ImportExportService (CSV, Excel, JSON)
- ❌ Tests + Documentation

**Livrable Phase 1 :**
- ✅ 14 services CORE opérationnels (Priorité 0-1)
- ✅ API documentée (Swagger)
- ✅ Tests >80% couverture
- ✅ Frontend admin fonctionnel
- ✅ Prêt pour développement modules métiers

---

### **Phase 2 : CORE Services Priorité 2 (4 semaines)**

**Semaine 9-10 : Email, Scheduler, Webhooks**
- ❌ EmailQueueService (SMTP + templates + retry)
- ❌ SchedulerService (Celery Beat + monitoring)
- ❌ WebhookManager (envoi/réception + signature HMAC)
- ❌ Tests + Documentation

**Semaine 11-12 : Calendar, Audit, API Manager**
- ❌ CalendarService (événements, récurrence, reminders)
- ❌ AuditTrailService (logs immutables, retention 7 ans)
- ❌ APIManager (tokens, rate limiting, Swagger)
- ❌ Tests + Documentation

**Livrable Phase 2 :**
- ✅ 20 services CORE terminés (Priorité 0-1-2)
- ✅ Plateforme robuste et extensible
- ✅ Prêt pour modules métiers complexes

---

### **Phase 3 : Premier module métier HSE Reports (3 semaines)**

**Semaine 13-15 : Module HSE**
- ❌ Modèles (Incident, Investigation, Action)
- ❌ Services métiers + API REST complète
- ❌ Frontend (formulaires, listes, détails)
- ❌ Workflow approbation (avec hooks)
- ❌ Notifications automatiques
- ❌ Export PDF (rapports)
- ❌ Tests complets

**Livrable Phase 3 :**
- ✅ Module HSE opérationnel end-to-end
- ✅ Démonstration complète du système
- ✅ Validation architecture CORE + MODULE
- ✅ Base pour développement autres modules

---

### **Phase 4 : Modules additionnels (Itératif - 2-3 semaines/module)**

Développer modules suivants dans cet ordre :
1. **Offshore Booking** (réservations vols/navires)
2. **POB Management** (Personnel On Board)
3. **Logistics Tracking** (équipements, cargo, manifestes)
4. **Permit To Work** (PTW système)
5. **Document Management** (GED)
6. **Asset Management** (équipements)

**Pattern de développement par module :**
- Semaine 1 : Modèles + services + API REST
- Semaine 2 : Frontend CRUD + intégration CORE + workflows
- Semaine 3 : Tests complets + documentation + déploiement

---

## ⚙️ **COMMANDES UTILES**

```bash
# Démarrer services
docker-compose up -d

# Logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Backend
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
docker-compose exec backend python manage.py shell
docker-compose exec backend pytest

# Frontend (React + Vite + shadcn/ui)
docker-compose exec frontend npm run dev     # Dev server (Vite)
docker-compose exec frontend npm run build   # Production build
docker-compose exec frontend npm test        # Tests

# Mobile (à créer)
cd mobile
npm start
npm run ios
npm run android

# Base de données
docker-compose exec postgres psql -U opsflux_user -d opsflux
```

---

## 📞 **EN CAS DE DOUTE**

**L'IA DOIT :**
1. ❓ **DEMANDER** clarification à l'utilisateur
2. 📖 **LIRE** docs/projet/CORE_SERVICES.md pour spécifications
3. 🔍 **VÉRIFIER** docs/projet/ROADMAP.md pour éviter doublons
4. 🧪 **TESTER** avant de committer

**L'IA NE DOIT PAS :**
1. ❌ Deviner ou supposer
2. ❌ Créer du code "au cas où"
3. ❌ Tourner en rond sans demander
4. ❌ Ignorer les interdictions

---

**Version CLAUDE.md :** 2.1
**Dernière mise à jour :** 06 Octobre 2025
**Maintenu par :** Équipe Dev
