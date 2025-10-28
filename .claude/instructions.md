# Instructions Claude pour OPSFLUX

> **Version :** 4.0 - ARCHITECTURE UI COMPLÈTE
> **Date :** 28 Octobre 2025
> **Source :** Fusion CLAUDE.md + FRONTEND_RULES.md + FUNCTIONAL_RULES.md + instructions Dokploy

---

## 🔄 **CONTEXTE DU PROJET**

### Architecture et Stack
**Architecture :** Monolithique moderne propre (FastAPI + React séparés en conteneurs)

**Problèmes à éviter (leçons version précédente) :**
- ❌ Architecture frontend incohérente (mélange React-Admin, Fluent UI, OpenUI5, shadcn/ui)
- ❌ Composants pré-stylés qui limitent la personnalisation
- ❌ Design system fragmenté et incohérent
- ❌ Manque de densité d'information (trop d'espace perdu)
- ❌ Search bars multiples (dans header + dans chaque datatable)
- ❌ Spinners partout au lieu de skeletons

**Nouvelle approche V4.0 :**
- ✅ **Radix UI pur** (primitives headless) + **Design System custom OpsFlux**
- ✅ **NO shadcn/ui** (trop opiniated, on veut 100% de contrôle sur le style)
- ✅ **Tailwind CSS** uniquement pour styling (utility-first, cohérent)
- ✅ **Densité maximale** sans surcharge (infos visibles, espaces optimisés)
- ✅ **Search contextuelle unique** dans header (pas dans datatables)
- ✅ **Skeletons partout** pour loading states (UX premium)
- ✅ **Filtrage intelligent** (clic sur n'importe quel élément filtrable)

---

## 🔓 **AUTORISATIONS COMPLÈTES**

**L'IA a les AUTORISATIONS COMPLÈTES pour** :

### **Commandes système & Git**
- ✅ `ls`, `find`, `grep`, `cat`, `tree`, `pwd`, etc. **SANS demander**
- ✅ `git status`, `git diff`, `git log`, `git branch` **SANS demander**
- ✅ `git add`, `git commit`, `git push` **SANS demander**
- ✅ `git checkout`, `git merge` (branches non-main) **SANS demander**
- ✅ `git checkout main`, `git merge` (vers main) → **DEMANDER confirmation**

### **Docker & Conteneurs**
- ✅ `docker ps`, `docker logs`, `docker inspect` **SANS demander**
- ✅ `docker-compose up`, `docker-compose down`, `docker-compose restart` **SANS demander**
- ✅ `docker-compose logs`, `docker-compose exec` **SANS demander**
- ✅ `docker exec`, `docker restart`, `docker stop`, `docker start` **SANS demander**
- ✅ `docker system prune` → **DEMANDER confirmation** (suppression données)

### **Fichiers & Code**
- ✅ Lire **TOUS** les fichiers du projet **SANS exception**
- ✅ Créer, modifier, supprimer des fichiers **SANS demander**
- ✅ Refactoriser du code existant **SANS demander** (si amélioration claire)
- ✅ **SUPPRIMER et RECRÉER** du code existant **SI NÉCESSAIRE** (avec prudence)
- ✅ Créer de nouvelles fonctionnalités complètes **SANS demander**

### **Backend (FastAPI + SQLModel)**
- ✅ Créer/modifier modèles SQLModel **SANS demander**
- ✅ Créer migrations Alembic **SANS demander** (`alembic revision`, `alembic upgrade`)
- ✅ Modifier schémas Pydantic **SANS demander**
- ✅ Créer/modifier endpoints API **SANS demander**
- ✅ Installer dépendances Python **SANS demander** (`pip install`, modifier `requirements.txt`)
- ✅ Exécuter tests pytest **SANS demander**
- ✅ Downgrade migration → **DEMANDER confirmation** (`alembic downgrade`)

### **Frontend (React + Radix UI + Tailwind)**
- ✅ Créer/modifier composants React **SANS demander**
- ✅ Créer/modifier pages **SANS demander**
- ✅ Installer dépendances npm **SANS demander** (`npm install`, modifier `package.json`)
- ✅ Configurer Tailwind **SANS demander** (ajout classes, plugins)
- ✅ Créer composants Radix UI wrappers **SANS demander**
- ✅ Modifier routing (TanStack Router) **SANS demander**
- ✅ Exécuter tests Vitest **SANS demander**

### **Web Search & Documentation**
- ✅ Aller sur internet (WebSearch, WebFetch) **SANS demander**
- ✅ Chercher documentation technique (Radix UI, Tailwind, FastAPI, etc.)
- ✅ Vérifier best practices récentes
- ✅ Comparer solutions techniques

### **Décisions techniques**
- ✅ Prendre des décisions techniques **AUTONOMES** pour résoudre bugs
- ✅ Choisir la meilleure approche technique (algorithme, pattern, lib)
- ✅ Optimiser performances (memoization, virtualisation, caching)
- ✅ Améliorer UX (animations, transitions, feedback visuel)

**L'IA doit être PROACTIVE et AUTONOME** : ne pas demander de permission sauf si la décision est **CRITIQUE** :
- Suppression base de données complète
- Changement architecture majeur (ex: passer de FastAPI à Django)
- Suppression module métier complet
- Modification système d'authentification (JWT, sessions)
- Merge vers branche `main` en production

---

## ⛔ **INTERDICTIONS ABSOLUES**

L'IA **DOIT** respecter ces règles **SANS EXCEPTION** :

### 🚫 **Commits & Git**
- ❌ **NE JAMAIS** ajouter "🤖 Generated with Claude Code" dans les commits
- ❌ **NE JAMAIS** ajouter "Co-Authored-By: Claude <noreply@anthropic.com>"
- ❌ **NE JAMAIS** ajouter de mention Claude/IA dans commits ou code
- ❌ **NE JAMAIS** ajouter de commentaires IA dans les fichiers (ex: "with Claude", "by Claude")
- ✅ **TOUJOURS** faire des commits professionnels standard **SANS AUCUNE mention IA**

**Format commit obligatoire :**
```
[Scope] Description courte en français

Description détaillée si nécessaire

Fonctionnalités:
- Point 1
- Point 2

Fichiers modifiés:
- backend/file1.py
- frontend/src/file2.tsx
```

### 🚫 **Stack UI - STRICTEMENT INTERDIT**
- ❌ **NE JAMAIS** utiliser shadcn/ui (trop opiniated, manque de flexibilité)
- ❌ **NE JAMAIS** utiliser Material-UI / MUI
- ❌ **NE JAMAIS** utiliser Ant Design
- ❌ **NE JAMAIS** utiliser Chakra UI
- ❌ **NE JAMAIS** utiliser Bootstrap
- ❌ **NE JAMAIS** utiliser React-Admin
- ❌ **NE JAMAIS** utiliser Fluent UI
- ❌ **NE JAMAIS** utiliser OpenUI5
- ❌ **NE JAMAIS** utiliser une autre lib de composants pré-stylés

**✅ STACK UI AUTORISÉE UNIQUEMENT :**
```
- React 18.3+ avec TypeScript
- Radix UI (primitives headless uniquement)
- Tailwind CSS 3.4+ (styling)
- Lucide React (icônes)
- Recharts (graphiques via composant custom)
```

### 🚫 **Architecture & Design**
- ❌ **NE JAMAIS** créer de search bar dans les datatables → **Search header contextuelle uniquement**
- ❌ **NE JAMAIS** utiliser des spinners pour loading → **Skeletons obligatoires** (sauf 3 exceptions autorisées)
- ❌ **NE JAMAIS** faire des cards spacieuses → **Maximum densité sans surcharge**
- ❌ **NE JAMAIS** hardcoder des couleurs → **Variables CSS uniquement**
- ❌ **NE JAMAIS** créer de container `web/` séparé → Web servi par `frontend/`
- ❌ **NE JAMAIS** mettre logique métier dans frontend → **Backend = source de vérité**
- ❌ **NE JAMAIS** utiliser CSS-in-JS (styled-components, emotion) → **Tailwind uniquement**

### 🚫 **Développement**
- ❌ **NE JAMAIS** perdre de fonctionnalités entre versions (régression)
- ❌ **NE JAMAIS** créer du code sans tester les 3 couches (backend/frontend/intégration)
- ❌ **NE JAMAIS** committer sans vérifier cohérence backend ↔ frontend
- ❌ **NE JAMAIS** tourner en rond → Si bloqué >15min, **DEMANDER** clarification
- ❌ **NE JAMAIS** créer de modèles inutiles (Customer, Supplier non pertinents ici)
- ❌ **NE JAMAIS** créer de module métier sans avoir terminé CORE complet
- ❌ **NE JAMAIS** prendre de raccourcis → **Toujours code complet et fonctionnel**
- ❌ **NE JAMAIS** faire du code partiel/incomplet → Si trop long, utiliser Task (agent)
- ❌ **NE JAMAIS** committer du code qui ne compile pas
- ❌ **NE JAMAIS** committer des tests qui échouent

### 🚫 **Modules Métier (À NE PAS créer maintenant)**
- ❌ **NE JAMAIS** créer les 9 modules métiers avant d'avoir terminé les 25 services CORE
- ❌ Modules interdits pour l'instant : Tiers, Projects, Organizer, Rédacteur, POBVue, TravelWiz, MOCVue, CleanVue, PowerTrace
- ✅ **Focus 100%** sur services CORE d'abord (Authentication, Users, Roles, Permissions, Notifications, etc.)

---

## ✅ **OBLIGATIONS STRICTES**

### ✓ **Avant chaque commit**
L'IA **DOIT** vérifier **TOUS** ces points :

1. ✅ **Backend vérifié** :
   - API testée (manuel ou pytest)
   - Migrations Alembic appliquées (`alembic upgrade head`)
   - Aucune régression (fonctionnalités existantes OK)
   - Code linting OK (ruff, black)

2. ✅ **Frontend vérifié** :
   - UI fonctionne (npm run dev sans erreurs)
   - Appels API corrects (Network tab inspectée)
   - Responsive (testé 3 tailles : mobile 375px, tablet 768px, desktop 1440px)
   - Pas d'erreurs console
   - Build production OK (`npm run build`)

3. ✅ **Cohérence totale** :
   - Aucune fonctionnalité perdue vs version précédente
   - Backend et frontend synchronisés (mêmes endpoints, mêmes schémas)
   - Types TypeScript correspondent aux schémas Pydantic

4. ✅ **Documentation mise à jour** :
   - `docs/projet/ROADMAP.md` (progression fonctionnalités)
   - `docs/projet/DEV_LOG.md` (journal session actuelle)
   - `docs/projet/CORE_SERVICES.md` (si service CORE modifié)
   - `docs/developer/TECHNICAL_DECISIONS.md` (si décision architecture)

5. ✅ **Commit professionnel** :
   - Message en français, clair, structuré
   - **AUCUNE mention IA** (Claude, AI, Generated, etc.)
   - Fichiers modifiés listés
   - Fonctionnalités ajoutées détaillées

### ✓ **Développement**

1. ✅ **TOUJOURS** fournir du code **production-ready** immédiatement exécutable
2. ✅ **TOUJOURS** guider étape par étape avec roadmap claire
3. ✅ **TOUJOURS** proposer les **3 prochaines actions** après chaque tâche
4. ✅ **TOUJOURS** interroger l'utilisateur en cas de doute ou ambiguïté
5. ✅ **TOUJOURS** maintenir cohérence architecturale totale
6. ✅ **TOUJOURS** assurer traçabilité complète via audit trail
7. ✅ **TOUJOURS** préparer fonctionnalités pour intégration IA future
8. ✅ **TOUJOURS** structurer données pour Business Intelligence
9. ✅ **TOUJOURS** mettre à jour **TOUS** les .md après chaque fonctionnalité terminée
10. ✅ **TOUJOURS** implémenter fonctionnalités de manière **COMPLÈTE et FONCTIONNELLE**
11. ✅ **Si fonctionnalité trop longue** : Utiliser outil **Task (agent)** → **PAS de raccourcis**
12. ✅ **TOUJOURS** créer des skeletons pour loading states (jamais juste des spinners)
13. ✅ **TOUJOURS** respecter les breakpoints responsive (640/768/1024/1400)
14. ✅ **TOUJOURS** utiliser variables CSS (jamais de couleurs hardcodées)
15. ✅ **TOUJOURS** débouncer les recherches et filtres (300ms minimum)

---

## 🔧 **STACK TECHNIQUE**

### **Backend**
- **Framework** : FastAPI 0.114+ (async, moderne, rapide)
- **ORM** : SQLModel 0.0.21 (Pydantic + SQLAlchemy)
- **Base de données** : PostgreSQL 16
- **Migrations** : Alembic 1.13+
- **Cache** : Redis 7
- **Tasks async** : Celery + Beat
- **Auth** : JWT (PyJWT 2.9+, bcrypt, python-multipart)
- **Validation** : Pydantic 2.5+
- **API Doc** : OpenAPI/Swagger auto-généré (FastAPI natif)
- **CORS** : fastapi-cors
- **Testing** : pytest 7.4+, pytest-asyncio, httpx

### **Frontend (Desktop + Web) - V4.0**
- **Framework** : React 18.3 + TypeScript 5.3 + Vite 5.1
- **UI Primitives** : **Radix UI** uniquement (headless, accessible, composable)
- **Styling** : Tailwind CSS 3.4+ (utility-first, pas de CSS-in-JS)
- **Routing** : TanStack Router v1 (file-based, type-safe)
- **HTTP Client** : Axios 1.6
- **State Management** :
  - **Server State** : TanStack Query v5 (cache, mutations, invalidation)
  - **Client State** : Zustand v4 (auth, theme, notifications, preferences)
- **Forms** : React Hook Form 7.51 + Zod 3.22 (validation TypeScript-first)
- **Icons** : Lucide React 0.344 (modern, tree-shakeable, 1000+ icônes)
- **Charts** : Recharts 2.12 (composants custom wrappers)
- **Date/Time** : date-fns 3.3 (léger, fonctionnel)
- **Build** : Vite 5.1 (HMR ultra-rapide, code splitting auto)
- **Testing** : Vitest 1.2+ (compatible Vite), React Testing Library

**Architecture frontend :**
- **Feature-based** : Dossiers par domain/feature (auth, users, roles, etc.)
- **Composants atomiques** : Réutilisation maximale, composition
- **TypeScript strict** : Type-safety totale, zero `any`
- **Tailwind uniquement** : Pas de CSS-in-JS, pas de CSS Modules
- **Design System custom** : Variables CSS pour thématisation complète

### **Infrastructure**
- **Conteneurisation** : Docker + Docker Compose
- **Orchestration** : Dokploy (self-hosted)
- **Proxy** : Traefik (géré par Dokploy)
- **SSL** : Let's Encrypt (auto via Dokploy)
- **CI/CD** : GitHub Actions → Dokploy auto-deploy

---

## 🎨 **APP SHELL - 5 ZONES OBLIGATOIRES**

### **Architecture visuelle**

```
┌─────────────────────────────────────────────────────────────────┐
│                    HEADER BAR (fixe 64px)                       │
│ Logo │ Home │ Breadcrumb │ Search │ Options │ Fav │ AI │ Notif │
├──────┬──────────────────────────────────────────────────────────┤
│      │                                                          │
│  S   │                  ZONE CENTRALE                           │
│  I   │               (contenu principal)                        │
│  D   │                                                          │
│  E   │  ┌─────────────────────────────────────────────┐        │
│  B   │  │ Page Header (titre + actions + toggle)      │        │
│  A   │  ├─────────────────────────────────────────────┤        │
│  R   │  │ Filtres actifs (pills + compteur résultats) │        │
│      │  ├─────────────────────────────────────────────┤        │
│  240 │  │ Contenu (Grid Cards OU Tableau Dense)       │        │
│  px  │  │                                              │        │
│  ou  │  │ Skeleton loading states (pas de spinners)   │        │
│  60  │  │                                              │        │
│  px  │  │ Pagination / Infinite scroll                 │        │
│      │  └─────────────────────────────────────────────┘        │
│      │                                                          │
├──────┴──────────────────────────────────────────────────────────┤
│                    FOOTER BAR (fixe 40px)                       │
│  Status │ Sync │ Version │ Env │ Help │ Feedback │ Legal        │
└─────────────────────────────────────────────────────────────────┘
```

### **1. HEADER BAR**
- **Hauteur** : 64px fixe, position fixed top
- **Partie Gauche** : Logo, Bouton Menu Mobile, Bouton Home, Breadcrumb
- **Partie Centre** : Search bar contextuelle (filtre local OU global selon page)
- **Partie Droite** : Options module, Favoris, AI Assistant, Notifications, Quick Settings, Profil

### **2. SIDEBAR**
- **Largeur** : 240px (étendu) / 60px (réduit)
- **3 Groupes obligatoires** :
  1. PILOTAGE (Bienvenue, Galerie, Nouveau)
  2. MODULES DYNAMIQUES (importés selon modules activés)
  3. SYSTÈME (Paramètres, Développeurs, Utilisateurs)

### **3. DRAWER CONTEXTUEL**
- **Position** : Slide depuis gauche
- **Largeur** : 500px (desktop), 90% (mobile)
- **Structure** : Header fixe + Body scrollable + Footer fixe

### **4. ZONE CENTRALE**
- **Grid Cards** : Ultra-compactes (padding 12-16px, gaps 12-16px)
- **Tableau Dense** : Lignes 40px, colonnes triables, responsive
- **Filtres intelligents** : Clic sur n'importe quel élément filtrable
- **Skeletons obligatoires** : Jamais de spinners seuls

### **5. FOOTER BAR**
- **Hauteur** : 40px fixe, sticky bottom
- **Gauche** : Status système, Dernière synchro, Connexion
- **Centre** : Version, Environnement
- **Droite** : Aide, Feedback, Fullscreen, Legal

---

## 🎯 **PRINCIPES DESIGN OBLIGATOIRES**

### **Densité Maximale**
- Cards : padding 12-16px, gaps 12-16px
- Typographie : 11-13px body, 14-16px titres
- Hauteur cards : 140-180px max
- Espacements : système 4px (4, 8, 12, 16, 24, 32, 48, 64)

### **Loading States**
- ❌ **INTERDIT** : Spinners seuls
- ✅ **OBLIGATOIRE** : Skeletons (structure grise pulsante)
- **3 exceptions autorisées** :
  1. Header : Mini spinner pendant recherche async
  2. Header : Progress bar pour opérations longues
  3. Boutons : Mini spinner pendant action

### **Filtrage Intelligent**
- Tout élément cliquable peut filtrer (tags, statuts, rôles, etc.)
- Pills avec label + valeur + X pour retirer
- Compteur résultats en temps réel
- Debounce 300ms pour recherches

### **Variables CSS Obligatoires**
```css
:root {
  /* Colors */
  --primary-500: #3b82f6;
  --gray-50 to --gray-900: ...;
  --success/warning/error/info: ...;

  /* Spacing */
  --space-1 to --space-20: 4px to 80px;

  /* Typography */
  --text-xs to --text-4xl: 11px to 40px;
  --font-sans/mono: ...;

  /* Radius, Shadows, Transitions */
  ...
}
```

### **Responsive Breakpoints**
- Mobile : <640px
- Tablet : 640-1023px
- Desktop : 1024-1399px
- Desktop XL : ≥1400px

---

## 📦 **MODULES MÉTIER (À NE PAS développer maintenant)**

**9 modules métier** à développer **APRÈS** avoir terminé les 25 services CORE :

1. **Tiers** : Gestion entreprises, contacts, utilisateurs externes
2. **Projects** : Gestion projets, tâches, jalons, équipes
3. **Organizer** : Planning multi-projets, POB, ressources
4. **Rédacteur** : Document builder dynamique (type Notion)
5. **POBVue** : Demandes séjour personnel, workflow validation
6. **TravelWiz** : Bookings transport, manifestes, tracking
7. **MOCVue** : Management of Change, workflow approbation
8. **CleanVue** : 5S, scrapping, retours site
9. **PowerTrace** : Prévisions électriques, monitoring

---

## ⚙️ **CORE SERVICES (25 services - Focus actuel)**

**Priorité 0 - CRITIQUES (6 services)** :
1. Authentication & Security (JWT, 2FA, Sessions)
2. Users, Roles, Permissions & Groups (RBAC)
3. Notification System (in-app, email, SMS, push)
4. Translation/i18n (FR/EN/ES/PT)
5. Menu Manager (dynamique avec permissions)
6. Hook & Trigger System (event bus, automation)

**Priorité 1 - HAUTE (8 services)** :
7. File Manager + Import/Export
8. Email Queue + Scheduler
9. Audit Trail + API Manager
10. Webhooks + Calendar/Events

**Priorité 2 - MOYENNE (6 services)** :
11. License + Module Manager
12. AI Service + Search Engine
13. Report Generator + Monitoring

**Priorité 3 - BASSE (5 services)** :
14. Config Manager + URL Shortener
15. Comment System + Version Control
16. Workflow Engine

---

## 🚀 **WORKFLOW DÉVELOPPEMENT**

### **Ordre STRICT obligatoire**

1. **Backend d'abord** :
   - Modèles SQLModel
   - Migration Alembic
   - Schémas Pydantic
   - Services métier
   - Endpoints API
   - Tests unitaires

2. **Frontend ensuite** :
   - Types TypeScript (depuis schémas Pydantic)
   - API client
   - Composants primitives (Radix wrappers)
   - Composants UI réutilisables
   - Feature complète
   - Routes
   - Tests composants

3. **Intégrations** :
   - Hooks système
   - Notifications
   - Audit trail

4. **Documentation** :
   - ROADMAP.md
   - DEV_LOG.md
   - CORE_SERVICES.md
   - TECHNICAL_DECISIONS.md

5. **Commit** :
   - Format professionnel
   - **SANS mention IA**
   - En français

---

## 🔧 **GESTION DOCKER VIA API DOKPLOY**

### **Configuration API Dokploy**

Les informations de connexion sont dans le fichier `.env` :

```bash
API_DOKPLOY=gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH
API_DOKPLOY_URL=http://72.60.188.156:3000/api
```

### **Identifiants du projet**

- **Compose ID** : `Qpqupqv463w7wf09fwVxS`
- **Project Name** : `perenco-opsflux-gwxapr`

### **Commandes API courantes**

#### 1. Redéployer l'application

```bash
curl -s -X POST "http://72.60.188.156:3000/api/trpc/compose.redeploy?batch=1" \
  -H "x-api-key: gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"composeId":"Qpqupqv463w7wf09fwVxS"}}}'
```

### **Workflow de déploiement recommandé**

Après un push Git, Dokploy auto-déploie via webhook. Pour vérifier :

1. **Attendre le déploiement auto** (20-30 secondes après push)
2. **Vérifier les containers** : `docker ps --filter "name=perenco-opsflux-gwxapr"`
3. **Vérifier HTTP** : `curl -s -I https://app.opsflux.io | head -5`

### **Commandes Docker autorisées**

Les commandes Docker en lecture seule sont OK :
- `docker ps`
- `docker inspect`
- `docker logs`
- `docker images`

**NE PAS utiliser** :
- `docker restart` (utiliser API redeploy)
- `docker stop/start`
- `docker-compose up/down`
- `docker build/push`

---

## 🌐 **DOMAINES**

- **Frontend** : https://app.opsflux.io
- **Backend** : https://api.opsflux.io
- **Adminer** : https://adminer.opsflux.io

---

## 📝 **COMMUNICATION AVEC L'UTILISATEUR**

### **Avant de commencer une tâche**

```
Je vais développer [Service X] selon les spécifications.

Plan d'implémentation :

Backend :
- Modèles : [liste]
- Services : [liste]
- API : [X endpoints]
- Tests : [X tests]

Frontend :
- Pages : [liste]
- Composants : [liste]
- Intégrations : [liste]

Durée estimée : [X jours/semaines]

Confirmes-tu cette approche ?
```

### **Après chaque fonctionnalité**

```
✅ [Service X] terminé

Livrables :
- Backend : [liste fichiers/fonctionnalités]
- Frontend : [liste fichiers/fonctionnalités]
- Tests : [couverture %]
- Docs : [fichiers mis à jour]

Prochaines étapes proposées :
1. [Action 1] (priorité, durée)
2. [Action 2] (priorité, durée)
3. [Action 3] (priorité, durée)

Quelle action souhaites-tu prioriser ?
```

---

## ⚠️ **EN CAS DE PROBLÈME**

**L'IA DOIT :**
1. ❓ **NE PAS deviner** → DEMANDER clarification
2. 📖 **LIRE** docs pour specs
3. 🔍 **VÉRIFIER** ROADMAP.md pour éviter doublons
4. 🧪 **TESTER** avant de committer
5. 🤔 **RÉFLÉCHIR** : Est-ce la meilleure approche ?

**L'IA NE DOIT PAS :**
1. ❌ Supposer ou assumer
2. ❌ Créer du code "au cas où" non demandé
3. ❌ Tourner en rond >15min sans demander
4. ❌ Ignorer les interdictions absolues
5. ❌ Commit du code cassé/incomplet

---

**FIN DES INSTRUCTIONS**

> Ce fichier contient la source de vérité absolue pour le développement OpsFlux.
> Toute modification doit être documentée et versionnée.
