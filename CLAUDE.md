Tu as raison, j'ai trop simplifié. Voici le document complet qui reprend **TOUTES** les instructions importantes du CLAUDE.md original + les spécifications complètes de l'app shell :

---

# 🎯 PROMPT MAÎTRE OPSFLUX - APP SHELL & UI

**Version :** 4.0 - ARCHITECTURE UI COMPLÈTE
**Date :** 28 Octobre 2025
**Cible :** Développement assisté par IA (Claude Code)
**Statut :** 🎨 Architecture UI + Core Services

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
   - `.claude/CLAUDE.md` (si instructions IA modifiées)

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

## 🏗️ **ARCHITECTURE MONOLITHIQUE (V4.0)**

### **Principe fondamental**
Architecture monolithique moderne propre pour <1000 utilisateurs simultanés.

**Conteneurs Docker (5 services) :**
1. **backend** : FastAPI + Uvicorn (port 8000) - API REST
2. **frontend** : React + Vite dev server (port 3001) - UI web
3. **postgres** : PostgreSQL 16 (port 5432) - Base de données
4. **redis** : Redis 7 (port 6379) - Cache + Queue
5. **celery_worker** : Workers asynchrones (4 workers)

**En développement :**
- Backend et Frontend tournent **séparément** dans leurs conteneurs
- Frontend proxy les requêtes `/api/*` vers backend (Vite proxy)
- Hot reload sur les deux (FastAPI uvicorn reload + Vite HMR)

**En production :**
- Frontend build copié dans `backend/staticfiles/react/`
- Backend (Gunicorn) sert API (`/api/*`) + React build (`/*`)
- Whitenoise sert fichiers statiques efficacement
- 1 seul point d'entrée (port 8000)

### **Structure projet complète**

```
OpsFlux/
├── backend/                    # FastAPI backend
│   ├── alembic/               # Migrations DB
│   │   ├── versions/          # Fichiers migration
│   │   └── env.py             # Config Alembic
│   ├── app/
│   │   ├── core/              # Services CORE (25 services)
│   │   │   ├── models/        # Modèles SQLModel base
│   │   │   │   ├── base.py    # AbstractBaseModel, AbstractNamedModel
│   │   │   │   ├── user.py    # User, Role, Permission, Group
│   │   │   │   ├── company.py # Company, BusinessUnit
│   │   │   │   └── ...
│   │   │   ├── services/      # Services métier CORE
│   │   │   │   ├── auth_service.py
│   │   │   │   ├── role_service.py
│   │   │   │   ├── notification_service.py
│   │   │   │   ├── translation_service.py
│   │   │   │   └── ...
│   │   │   ├── schemas/       # Schémas Pydantic
│   │   │   ├── api/           # Endpoints API CORE
│   │   │   ├── dependencies/  # Dependencies FastAPI (auth, permissions)
│   │   │   └── utils/         # Utilitaires
│   │   ├── modules/           # Modules métier (vide pour l'instant)
│   │   │   └── (à créer plus tard)
│   │   ├── config.py          # Configuration (Settings Pydantic)
│   │   └── main.py            # App FastAPI principale
│   ├── tests/                 # Tests pytest
│   ├── staticfiles/           # Fichiers statiques (production)
│   │   └── react/             # Build React copié ici
│   ├── media/                 # Uploads utilisateurs
│   ├── requirements.txt       # Dépendances Python
│   ├── alembic.ini            # Config Alembic
│   └── Dockerfile             # Build backend
│
├── frontend/                  # React + Vite + Radix UI + Tailwind
│   ├── public/                # Assets statiques
│   ├── src/
│   │   ├── components/        # Composants réutilisables
│   │   │   ├── primitives/    # Wrappers Radix UI (Button, Dialog, etc.)
│   │   │   ├── layout/        # Header, Sidebar, Footer, Drawer
│   │   │   ├── ui/            # Composants UI custom (Card, DataTable, etc.)
│   │   │   └── shared/        # Composants partagés (SearchBar, FilterBar, etc.)
│   │   ├── features/          # Features modulaires (par domaine)
│   │   │   ├── auth/          # Login, 2FA, Session
│   │   │   ├── users/         # CRUD Users
│   │   │   ├── roles/         # CRUD Roles & Permissions
│   │   │   └── ...
│   │   ├── hooks/             # Custom hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   ├── useContextualSearch.ts
│   │   │   └── ...
│   │   ├── lib/               # Utilities
│   │   │   ├── api.ts         # Axios client
│   │   │   ├── utils.ts       # Fonctions utilitaires
│   │   │   └── constants.ts   # Constantes
│   │   ├── stores/            # Zustand stores
│   │   │   ├── authStore.ts   # Auth state
│   │   │   ├── themeStore.ts  # Theme dark/light
│   │   │   └── notificationStore.ts
│   │   ├── styles/            # Styles globaux
│   │   │   ├── globals.css    # Reset + Tailwind + Variables CSS
│   │   │   └── themes.css     # Variables dark/light mode
│   │   ├── routes/            # TanStack Router routes
│   │   │   ├── __root.tsx     # Root layout
│   │   │   ├── index.tsx      # Home
│   │   │   ├── dashboard.tsx  # Dashboard
│   │   │   └── ...
│   │   ├── App.tsx            # Root component
│   │   └── main.tsx           # Entry point
│   ├── package.json           # Dépendances npm
│   ├── vite.config.ts         # Config Vite (proxy /api)
│   ├── tailwind.config.js     # Config Tailwind custom
│   ├── tsconfig.json          # TypeScript config
│   ├── postcss.config.js      # PostCSS (Tailwind)
│   └── Dockerfile             # Build frontend (dev)
│
├── mobile/                    # React Native (Phase future)
│   └── (à créer plus tard)
│
├── docs/                      # Documentation
│   ├── projet/                # Docs projet
│   │   ├── ROADMAP.md         # État projet, métriques
│   │   ├── DEV_LOG.md         # Journal sessions dev
│   │   ├── CORE_SERVICES.md   # Specs 25 services CORE
│   │   ├── MODULES_SPECS.md   # Specs 9 modules métier
│   │   └── DEPLOYMENT_NOTES.md
│   └── developer/             # Docs techniques
│       ├── ARCHITECTURE.md
│       ├── API_DOCUMENTATION.md
│       ├── TECHNICAL_DECISIONS.md
│       └── UI_DESIGN_SYSTEM.md
│
├── scripts/                   # Scripts DevOps
│   ├── init.sh                # Init projet
│   ├── dev.sh                 # Start dev mode
│   ├── build.sh               # Build production
│   ├── test.sh                # Run all tests
│   └── deploy.sh              # Deploy production
│
├── .claude/                   # Instructions IA
│   └── CLAUDE.md              # Ce fichier
│
├── docker-compose.yml         # Orchestration conteneurs
├── .env                       # Config environnement
├── .env.example               # Template .env
├── .gitignore                 # Git ignore
└── README.md                  # Documentation projet
```

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
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-dropdown-menu`
  - `@radix-ui/react-popover`
  - `@radix-ui/react-select`
  - `@radix-ui/react-tabs`
  - `@radix-ui/react-accordion`
  - `@radix-ui/react-checkbox`
  - `@radix-ui/react-radio-group`
  - `@radix-ui/react-switch`
  - `@radix-ui/react-slider`
  - `@radix-ui/react-progress`
  - `@radix-ui/react-tooltip`
  - `@radix-ui/react-avatar`
  - `@radix-ui/react-scroll-area`
  - `@radix-ui/react-separator`
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

### **Mobile (iOS/Android) - Phase future**
- **Framework** : React Native + Expo
- **Navigation** : React Navigation
- **State** : Zustand (cohérence avec web)
- **Offline** : Redux Persist + AsyncStorage
- **Push** : Expo Notifications (FCM/APNS)
- **Biométrie** : expo-local-authentication
- **Camera** : expo-camera
- **Location** : expo-location

### **Infrastructure**
- **Conteneurisation** : Docker + Docker Compose
- **Orchestration** : Dokploy (self-hosted)
- **Proxy** : Traefik (géré par Dokploy)
- **SSL** : Let's Encrypt (auto via Dokploy)
- **CI/CD** : GitHub Actions → Dokploy auto-deploy

---

## 🎨 **APP SHELL - SPÉCIFICATIONS COMPLÈTES**

### **Architecture des 5 zones**

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

┌──────────────┐  (overlay si ouvert, slide depuis gauche)
│   DRAWER     │
│  (formulaire)│
│              │
│  Header      │
│  ─────────── │
│  Body scroll │
│              │
│              │
│  ─────────── │
│  Footer fixe │
└──────────────┘
```

### **1. HEADER BAR - Implémentation obligatoire**

**Hauteur** : 64px fixe
**Position** : Fixed top, z-index 50
**Background** : Blanc (light) / Gris foncé (dark)

```tsx
// Structure EXACTE obligatoire
<Header className="h-16 border-b fixed top-0 w-full z-50 bg-white dark:bg-gray-900">
  <div className="container mx-auto px-4 h-full flex items-center justify-between">
    
    {/* PARTIE GAUCHE */}
    <div className="flex items-center gap-4">
      {/* Logo cliquable */}
      <Logo onClick={() => navigate('/')} className="h-8 cursor-pointer" />
      
      {/* Bouton menu mobile (≤1024px uniquement) */}
      <MobileMenuButton 
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden"
      />
      
      {/* Bouton Home */}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => navigate('/')}
        title="Accueil (Ctrl+H)"
      >
        <Home className="h-5 w-5" />
      </Button>
      
      {/* Breadcrumb dynamique */}
      <Breadcrumb path={currentPath} maxItems={3} />
    </div>

    {/* PARTIE CENTRE - Search contextuelle */}
    <div className="flex-1 max-w-xl mx-4">
      <ContextualSearch 
        placeholder={
          isDataPage 
            ? `Rechercher dans ${currentModule}...` 
            : "Rechercher globalement..."
        }
        value={searchQuery}
        onChange={handleSearchChange}
        onSearch={isDataPage ? filterLocalData : openGlobalSearchModal}
        shortcut="Ctrl+K"
        loading={isSearching}
        resultsCount={isDataPage ? filteredCount : null}
      />
    </div>

    {/* PARTIE DROITE - Actions */}
    <div className="flex items-center gap-2">
      
      {/* Bouton Options du module actif (conditionnel) */}
      {currentModule && (
        <ModuleOptionsButton 
          module={currentModule}
          options={currentModuleOptions}
        />
      )}
      
      {/* Bouton Favoris (étoile) */}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={handleFavClick}
        onDoubleClick={handleFavDoubleClick}
        className={isFavorite ? 'text-yellow-500' : ''}
        title="Simple clic: Ajouter aux favoris | Double clic: Gérer favoris"
      >
        <Star className="h-5 w-5" fill={isFavorite ? 'currentColor' : 'none'} />
      </Button>
      
      {/* Bouton AI Assistant */}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => setAIChatOpen(true)}
        title="Assistant IA"
      >
        <Bot className="h-5 w-5" />
      </Button>
      
      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <NotificationsList />
        </PopoverContent>
      </Popover>
      
      {/* Quick Settings */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={toggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
            <span className="ml-2">
              {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openLanguageSettings}>
            <Globe className="mr-2 h-4 w-4" />
            Langue: {currentLang}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openDensitySettings}>
            <Layout className="mr-2 h-4 w-4" />
            Densité: {density}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Profil utilisateur */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2">
            <Avatar>
              <AvatarImage src={user.avatar} />
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <div className="hidden lg:block text-left">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-gray-500">{user.role}</div>
            </div>
            <ChevronDown className="h-4 w-4 hidden lg:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="mr-2 h-4 w-4" />
            Profil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Paramètres
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/help')}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Aide & Support
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
  
  {/* Progress bar pour opérations longues (sous le header) */}
  {isLoading && (
    <Progress 
      value={loadingProgress} 
      className="absolute bottom-0 left-0 right-0 h-1 rounded-none" 
    />
  )}
</Header>
```

**Comportements obligatoires détaillés :**

1. **Search Bar Contextuelle** :
   ```tsx
   // Sur pages avec données (listes, tableaux)
   const handleSearch = debounce((query: string) => {
     const filtered = items.filter(item => 
       item.name.toLowerCase().includes(query.toLowerCase()) ||
       item.description?.toLowerCase().includes(query.toLowerCase()) ||
       item.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
     );
     setFilteredItems(filtered);
     setResultsCount(filtered.length);
   }, 300);
   
   // Sur pages sans données (dashboard, settings, etc.)
   const openGlobalSearch = () => {
     setGlobalSearchModalOpen(true);
     // Focus automatique dans le modal
   };
   ```

2. **Bouton Favoris** :
   ```tsx
   const handleFavClick = () => {
     const currentPage = {
       url: window.location.pathname,
       title: pageTitle,
       module: currentModule,
       timestamp: Date.now()
     };
     addFavorite(currentPage);
     toast.success('Page ajoutée aux favoris');
   };
   
   const handleFavDoubleClick = () => {
     openModal(<FavoritesManager favorites={allFavorites} />);
   };
   
   // Utiliser un timer pour distinguer simple/double clic
   let clickTimer: NodeJS.Timeout | null = null;
   const onClick = () => {
     if (clickTimer) {
       // Double clic détecté
       clearTimeout(clickTimer);
       clickTimer = null;
       handleFavDoubleClick();
     } else {
       // Attendre pour voir si double clic
       clickTimer = setTimeout(() => {
         handleFavClick();
         clickTimer = null;
       }, 250);
     }
   };
   ```

3. **Indicateurs chargement** :
   ```tsx
   // Mini spinner (16px) dans search bar pendant recherche
   {isSearching && (
     <Loader2 className="absolute right-8 h-4 w-4 animate-spin text-gray-400" />
   )}
   
   // Progress bar (2px) sous header pour opérations longues
   {isLoading && (
     <Progress 
       value={loadingProgress} 
       className="absolute bottom-0 left-0 right-0 h-1" 
     />
   )}
   ```

4. **Bouton Options Module** :
   ```tsx
   // Exemple pour module "Expéditions"
   const expeditionsOptions = [
     { label: 'Créer expédition', icon: Plus, onClick: () => openDrawer('create-expedition') },
     { label: 'Exporter', icon: Download, onClick: () => exportData() },
     { label: 'Statistiques', icon: BarChart, onClick: () => navigate('/expeditions/stats') }
   ];
   
   <DropdownMenu>
     <DropdownMenuTrigger asChild>
       <Button variant="outline" size="sm">
         Options Expéditions
         <ChevronDown className="ml-2 h-4 w-4" />
       </Button>
     </DropdownMenuTrigger>
     <DropdownMenuContent>
       {expeditionsOptions.map(option => (
         <DropdownMenuItem key={option.label} onClick={option.onClick}>
           <option.icon className="mr-2 h-4 w-4" />
           {option.label}
         </DropdownMenuItem>
       ))}
     </DropdownMenuContent>
   </DropdownMenu>
   ```

---

### **2. SIDEBAR - Implémentation obligatoire**

**Largeur** : 240-280px (étendu) / 60px (réduit)
**Position** : Fixed left, z-index 40
**Scroll** : Indépendant (ScrollArea)

```tsx
// Structure EXACTE obligatoire
<Sidebar className={cn(
  "fixed left-0 top-16 bottom-10 border-r bg-white dark:bg-gray-900 transition-all duration-300",
  sidebarOpen ? "w-64" : "w-16"
)}>
  {/* Toggle button */}
  <div className="p-4 flex items-center justify-between border-b">
    {sidebarOpen && <span className="font-semibold">Navigation</span>}
    <Button 
      variant="ghost" 
      size="icon"
      onClick={() => setSidebarOpen(!sidebarOpen)}
    >
      {sidebarOpen ? <ChevronLeft /> : <Menu />}
    </Button>
  </div>

  <ScrollArea className="flex-1">
    <nav className="p-3 space-y-1">
      
      {/* GROUPE 1 : PILOTAGE (CORE) */}
      <MenuGroup 
        title="PILOTAGE" 
        open={sidebarOpen}
        className="mb-4"
      >
        <MenuItem 
          icon={Home}
          label="Bienvenue"
          to="/dashboard"
          active={currentPath === '/dashboard'}
          collapsed={!sidebarOpen}
        />
        <MenuItem 
          icon={LayoutGrid}
          label="Galerie"
          to="/dashboards"
          active={currentPath === '/dashboards'}
          collapsed={!sidebarOpen}
        />
        <MenuItem 
          icon={Plus}
          label="Nouveau"
          to="/dashboards/new"
          active={currentPath === '/dashboards/new'}
          collapsed={!sidebarOpen}
        />
      </MenuGroup>

      <Separator className="my-4" />

      {/* GROUPE 2 : MODULES (dynamiques) */}
      {modules.map(module => (
        <CollapsibleMenuGroup 
          key={module.id}
          title={module.name}
          icon={module.icon}
          open={sidebarOpen}
          defaultOpen={module.active}
        >
          {module.subMenus.map(subMenu => (
            <MenuItem 
              key={subMenu.id}
              icon={subMenu.icon}
              label={subMenu.label}
              to={subMenu.path}
              active={currentPath === subMenu.path}
              collapsed={!sidebarOpen}
              badge={subMenu.badge}
              badgeVariant={subMenu.badgeVariant}
            />
          ))}
        </CollapsibleMenuGroup>
      ))}

      <Separator className="my-4" />

      {/* GROUPE 3 : SYSTÈME (en bas) */}
      <MenuGroup 
        title="SYSTÈME"
        open={sidebarOpen}
        className="mt-auto"
      >
        <MenuItem 
          icon={Settings}
          label="Paramètres"
          to="/settings"
          active={currentPath === '/settings'}
          collapsed={!sidebarOpen}
        />
        
        <CollapsibleMenuItem
          icon={Code}
          label="Développeurs"
          collapsed={!sidebarOpen}
          defaultOpen={false}
        >
          <SubMenuItem label="Vue d'ensemble" to="/dev" />
          <SubMenuItem label="Clés API" to="/dev/api-keys" />
          <SubMenuItem label="Hooks et Triggers" to="/dev/hooks" />
          <SubMenuItem label="Événements" to="/dev/events" />
          <SubMenuItem label="Logs" to="/dev/logs" />
        </CollapsibleMenuItem>

        <CollapsibleMenuItem
          icon={Users}
          label="Utilisateurs"
          collapsed={!sidebarOpen}
          defaultOpen={false}
        >
          <SubMenuItem label="Comptes" to="/users" />
          <SubMenuItem label="Groupes" to="/users/groups" />
          <SubMenuItem label="Rôles et Permissions" to="/users/roles" />
        </CollapsibleMenuItem>
      </MenuGroup>
    </nav>
  </ScrollArea>
</Sidebar>
```

**Composants sidebar obligatoires :**

```tsx
// MenuItem.tsx
interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  to: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
  badgeVariant?: 'default' | 'destructive' | 'warning';
  shortcut?: string;
}

const MenuItem: React.FC<MenuItemProps> = ({
  icon: Icon,
  label,
  to,
  active,
  collapsed,
  badge,
  badgeVariant,
  shortcut
}) => {
  const navigate = useNavigate();
  
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          onClick={() => navigate(to)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative",
            active 
              ? "bg-primary text-primary-foreground font-medium border-l-4 border-primary-600" 
              : "hover:bg-gray-100 dark:hover:bg-gray-800",
            collapsed && "justify-center"
          )}
        >
          <Icon className={cn("h-5 w-5 flex-shrink-0", collapsed && "h-6 w-6")} />
          
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-sm">{label}</span>
              
              {badge !== undefined && badge > 0 && (
                <Badge 
                  variant={badgeVariant || 'default'}
                  className="h-5 px-2"
                >
                  {badge > 99 ? '99+' : badge}
                </Badge>
              )}
              
              {shortcut && (
                <kbd className="hidden xl:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                  {shortcut}
                </kbd>
              )}
            </>
          )}
          
          {collapsed && badge !== undefined && badge > 0 && (
            <Badge 
              variant={badgeVariant || 'default'}
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {badge > 9 ? '9+' : badge}
            </Badge>
          )}
        </button>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">
          <p>{label}</p>
          {shortcut && <p className="text-xs text-muted-foreground">{shortcut}</p>}
        </TooltipContent>
      )}
    </Tooltip>
  );
};

// CollapsibleMenuItem.tsx
interface CollapsibleMenuItemProps {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  collapsed?: boolean;
  defaultOpen?: boolean;
}

const CollapsibleMenuItem: React.FC<CollapsibleMenuItemProps> = ({
  icon: Icon,
  label,
  children,
  collapsed,
  defaultOpen = false
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center justify-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Icon className="h-6 w-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <Icon className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1 text-left text-sm">{label}</span>
          <ChevronRight 
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "transform rotate-90"
            )} 
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

// SubMenuItem.tsx
interface SubMenuItemProps {
  label: string;
  to: string;
  active?: boolean;
}

const SubMenuItem: React.FC<SubMenuItemProps> = ({ label, to, active }) => {
  const navigate = useNavigate();
  
  return (
    <button
      onClick={() => navigate(to)}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors",
        active 
          ? "bg-primary/10 text-primary font-medium" 
          : "hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
    >
      <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      <span>{label}</span>
    </button>
  );
};
```

**Comportements obligatoires sidebar :**

1. **État collapsé mémorisé** :
   ```tsx
   // Sauvegarder dans localStorage
   useEffect(() => {
     localStorage.setItem('sidebar-open', JSON.stringify(sidebarOpen));
   }, [sidebarOpen]);
   
   // Charger au montage
   useEffect(() => {
     const saved = localStorage.getItem('sidebar-open');
     if (saved) setSidebarOpen(JSON.parse(saved));
   }, []);
   ```

2. **Sous-menus avec animation** :
   ```tsx
   // Utiliser Radix Collapsible avec transition CSS
   <Collapsible 
     open={isOpen} 
     onOpenChange={setIsOpen}
     className="overflow-hidden transition-all duration-200"
   >
     <CollapsibleContent>
       {/* Contenu avec slide down + fade in */}
     </CollapsibleContent>
   </Collapsible>
   ```

3. **Tooltip sidebar réduit** :
   ```tsx
   // Toujours afficher tooltip si sidebar collapsed
   {collapsed && (
     <TooltipContent side="right" sideOffset={10}>
       <p>{label}</p>
       {shortcut && <p className="text-xs">{shortcut}</p>}
     </TooltipContent>
   )}
   ```

---

### **3. DRAWER CONTEXTUEL - Implémentation obligatoire**

**Position** : Fixed left (slide depuis gauche)
**Largeur** : 500px (desktop), 90% (mobile)
**Overlay** : Semi-transparent backdrop blur

```tsx
// Utiliser Radix Dialog en mode Sheet
<Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
  <DialogPortal>
    {/* Overlay */}
    <DialogOverlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
    
    {/* Drawer Content */}
    <DialogContent 
      className={cn(
        "fixed left-0 top-0 h-full w-[500px] max-w-[90vw]",
        "bg-white dark:bg-gray-900 shadow-2xl",
        "flex flex-col",
        "z-50",
        "data-[state=open]:animate-slide-in-from-left",
        "data-[state=closed]:animate-slide-out-to-left"
      )}
    >
      {/* Header fixe */}
      <div className="border-b p-4 flex-shrink-0">
        <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm text-gray-500 mt-1">
          {description}
        </DialogDescription>
        <DialogClose className="absolute top-4 right-4">
          <X className="h-5 w-5" />
        </DialogClose>
      </div>

      {/* Body scrollable */}
      <ScrollArea className="flex-1 p-4">
        {/* Contenu formulaire */}
        {renderFormContent()}
      </ScrollArea>

      {/* Footer fixe */}
      <div className="border-t p-4 flex-shrink-0 flex items-center justify-end gap-2">
        <Button 
          variant="outline" 
          onClick={() => setDrawerOpen(false)}
        >
          Annuler
        </Button>
        <Button 
          onClick={handleSave}
          disabled={!isValid || isSaving}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
        {showSaveAndNew && (
          <Button 
            variant="secondary"
            onClick={handleSaveAndNew}
            disabled={!isValid || isSaving}
          >
            Enregistrer & Nouveau
          </Button>
        )}
      </div>
    </DialogContent>
  </DialogPortal>
</Dialog>
```

**Formulaires drawer (React Hook Form + Zod) :**

```tsx
// Exemple: Drawer création expédition
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const expeditionSchema = z.object({
  destination: z.string().min(1, 'Destination requise'),
  carrier: z.string().min(1, 'Transporteur requis'),
  departure_date: z.date(),
  arrival_date: z.date(),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  estimated_value: z.number().min(0),
  notes: z.string().optional()
});

type ExpeditionFormData = z.infer<typeof expeditionSchema>;

const CreateExpeditionDrawer = ({ open, onOpenChange }) => {
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<ExpeditionFormData>({
    resolver: zodResolver(expeditionSchema),
    mode: 'onChange'
  });
  
  const mutation = useMutation({
    mutationFn: (data: ExpeditionFormData) => api.post('/expeditions', data),
    onSuccess: () => {
      toast.success('Expédition créée');
      queryClient.invalidateQueries(['expeditions']);
      onOpenChange(false);
    }
  });
  
  const onSubmit = (data: ExpeditionFormData) => {
    mutation.mutate(data);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="...">
        <DialogHeader>
          <DialogTitle>Nouvelle Expédition</DialogTitle>
          <DialogDescription>
            Créez une nouvelle expédition logistique
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)}>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {/* Destination */}
              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input 
                  id="destination"
                  {...register('destination')}
                  placeholder="Port de destination"
                />
                {errors.destination && (
                  <p className="text-sm text-red-500">{errors.destination.message}</p>
                )}
              </div>
              
              {/* Transporteur */}
              <div className="space-y-2">
                <Label htmlFor="carrier">Transporteur *</Label>
                <Select {...register('carrier')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maersk">Maersk Line</SelectItem>
                    <SelectItem value="cma">CMA CGM</SelectItem>
                    <SelectItem value="msc">MSC</SelectItem>
                  </SelectContent>
                </Select>
                {errors.carrier && (
                  <p className="text-sm text-red-500">{errors.carrier.message}</p>
                )}
              </div>
              
              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="departure_date">Date Départ *</Label>
                  <Input 
                    id="departure_date"
                    type="date"
                    {...register('departure_date', { valueAsDate: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrival_date">Date Arrivée *</Label>
                  <Input 
                    id="arrival_date"
                    type="date"
                    {...register('arrival_date', { valueAsDate: true })}
                  />
                </div>
              </div>
              
              {/* Priorité */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priorité *</Label>
                <Select {...register('priority')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="critical">Critique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Valeur estimée */}
              <div className="space-y-2">
                <Label htmlFor="estimated_value">Valeur Estimée (€) *</Label>
                <Input 
                  id="estimated_value"
                  type="number"
                  {...register('estimated_value', { valueAsNumber: true })}
                  placeholder="0.00"
                />
              </div>
              
              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes"
                  {...register('notes')}
                  placeholder="Informations additionnelles..."
                  rows={4}
                />
              </div>
            </div>
          </ScrollArea>
          
          <div className="border-t p-4 flex justify-end gap-2">
            <Button 
              type="button"
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button 
              type="submit"
              disabled={!isValid || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer l'Expédition
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
```

---

### **4. ZONE CENTRALE - Implémentation obligatoire**

**Structure obligatoire pour pages avec listes :**

```tsx
// Page avec liste/tableau (exemple: /users)
const UsersPage = () => {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filteredItems, setFilteredItems] = useState(items);
  
  // Query TanStack Query
  const { data: users, isLoading } = useQuery({
    queryKey: ['users', filters],
    queryFn: () => fetchUsers(filters)
  });
  
  return (
    <div className="container mx-auto p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Utilisateurs</h1>
            <p className="text-gray-500 mt-1">
              Gestion des comptes utilisateurs
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Créer
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
          </div>
        </div>
        
        {/* Toolbar secondaire */}
        <div className="flex items-center gap-4 mt-4">
          {/* Toggle Grid/Liste */}
          <ToggleGroup 
            type="single" 
            value={view} 
            onValueChange={(v) => v && setView(v as 'grid' | 'list')}
          >
            <ToggleGroupItem value="grid" aria-label="Vue grille">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Vue liste">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          
          {/* Bouton Filtres */}
          <Button 
            variant="outline"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filtres
            {filters.length > 0 && (
              <Badge className="ml-2">{filters.length}</Badge>
            )}
          </Button>
          
          {/* Bouton Actualiser */}
          <Button 
            variant="ghost"
            onClick={() => queryClient.invalidateQueries(['users'])}
            disabled={isLoading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Actualiser
          </Button>
        </div>
      </div>
      
      {/* Barre filtres actifs */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {filters.map(filter => (
            <Badge 
              key={filter.id}
              variant="secondary"
              className="px-3 py-1.5 gap-2"
            >
              <span className="text-xs font-medium">
                {filter.label}: {filter.value}
              </span>
              <button
                onClick={() => removeFilter(filter.id)}
                className="hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={clearAllFilters}
          >
            Effacer tout
          </Button>
          <span className="text-sm text-gray-500 ml-auto">
            <strong className="font-semibold">{filteredItems.length}</strong> résultats
          </span>
        </div>
      )}
      
      {/* Contenu : Grid OU Liste */}
      {isLoading ? (
        view === 'grid' ? <GridSkeleton /> : <TableSkeleton />
      ) : (
        view === 'grid' ? (
          <UsersGrid users={filteredItems} />
        ) : (
          <UsersTable users={filteredItems} />
        )
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Affichage {startIndex}-{endIndex} sur {totalItems}
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                />
              </PaginationItem>
              {paginationItems.map((page, i) => (
                <PaginationItem key={i}>
                  {page === '...' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      onClick={() => setPage(page)}
                      isActive={page === currentPage}
                    >
                      {page}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};
```

---

### **5. CARDS COMPACTES - Règles strictes**

**DENSITÉ MAXIMALE obligatoire :**

```css
/* Espacements cards */
.card {
  padding: 12px;                /* Interne */
  gap: 12-16px;                 /* Entre cards */
  min-height: 140px;            /* Hauteur min */
  max-height: 180px;            /* Hauteur max */
}

.card-title {
  font-size: 14-15px;           /* Titre */
  font-weight: 600;
  line-height: 1.3;
}

.card-body {
  font-size: 12-13px;           /* Texte */
  line-height: 1.4;
}

.card-meta {
  font-size: 11px;              /* Metadata */
  color: rgb(156 163 175);      /* gray-400 */
}

/* Grid responsive */
.grid-cards {
  display: grid;
  gap: 16px;
}

@media (min-width: 1400px) {
  .grid-cards { grid-template-columns: repeat(5, 1fr); }
}

@media (min-width: 1024px) and (max-width: 1399px) {
  .grid-cards { grid-template-columns: repeat(4, 1fr); }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .grid-cards { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 767px) {
  .grid-cards { grid-template-columns: repeat(1, 1fr); }
}
```

**Exemple card compacte :**

```tsx
interface UserCardProps {
  user: User;
  onClick?: () => void;
  onFilterByRole?: (role: string) => void;
  onFilterByGroup?: (group: string) => void;
}

const UserCard: React.FC<UserCardProps> = ({ 
  user, 
  onClick,
  onFilterByRole,
  onFilterByGroup 
}) => {
  return (
    <div 
      onClick={onClick}
      className="p-3 border rounded-lg hover:shadow-lg transition-all cursor-pointer bg-white dark:bg-gray-900"
    >
      {/* Header (1 ligne, compact) */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xs">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {user.name}
            </h3>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/users/${user.id}`)}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEditDrawer(user)}>
              <Edit className="mr-2 h-4 w-4" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => handleDelete(user.id)}
              className="text-red-600"
            >
              <Trash className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body (2-4 infos clés max) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Mail className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{user.email}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Briefcase className="h-3 w-3 flex-shrink-0" />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onFilterByRole?.(user.role);
            }}
            className="truncate hover:text-primary hover:underline"
          >
            {user.role}
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Users className="h-3 w-3 flex-shrink-0" />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onFilterByGroup?.(user.group);
            }}
            className="truncate hover:text-primary hover:underline"
          >
            {user.group}
          </button>
        </div>
        
        {/* Tags/Badges (max 3 visibles) */}
        <div className="flex items-center gap-1 flex-wrap">
          {user.tags?.slice(0, 3).map(tag => (
            <Badge 
              key={tag}
              variant="secondary"
              className="h-5 px-1.5 text-xs cursor-pointer hover:bg-primary hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onFilterByTag?.(tag);
              }}
            >
              {tag}
            </Badge>
          ))}
          {user.tags.length > 3 && (
            <Badge variant="outline" className="h-5 px-1.5 text-xs">
              +{user.tags.length - 3}
            </Badge>
          )}
        </div>
      </div>

      {/* Footer (metadata) */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <div className={cn(
            "h-2 w-2 rounded-full",
            user.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
          )} />
          <span>{user.status === 'active' ? 'Actif' : 'Inactif'}</span>
        </div>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(user.lastLogin, { locale: fr })}
        </span>
      </div>
    </div>
  );
};
```

---

### **6. TABLEAU DENSE - Règles strictes**

```tsx
interface UsersTableProps {
  users: User[];
  onSort?: (field: string) => void;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

const UsersTable: React.FC<UsersTableProps> = ({ 
  users, 
  onSort, 
  sortField, 
  sortDirection 
}) => {
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  
  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => 
      prev.includes(id) 
        ? prev.filter(rowId => rowId !== id)
        : [...prev, id]
    );
  };
  
  const toggleAllRows = () => {
    if (selectedRows.length === users.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(users.map(u => u.id));
    }
  };
  
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Bulk actions (si sélection) */}
      {selectedRows.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedRows.length} élément(s) sélectionné(s)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Envoyer email
            </Button>
            <Button size="sm" variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
            <Button size="sm" variant="destructive">
              <Trash className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          </div>
        </div>
      )}
      
      <Table>
        <TableHeader className="sticky top-0 bg-white dark:bg-gray-900 z-10">
          <TableRow className="h-10">
            {/* Checkbox sélection tout */}
            <TableHead className="w-12">
              <Checkbox 
                checked={selectedRows.length === users.length && users.length > 0}
                onCheckedChange={toggleAllRows}
              />
            </TableHead>
            
            {/* Colonnes triables */}
            <TableHead>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onSort?.('name')}
                className="h-8 font-semibold"
              >
                Nom
                {sortField === 'name' && (
                  sortDirection === 'asc' 
                    ? <ArrowUp className="ml-2 h-3 w-3" />
                    : <ArrowDown className="ml-2 h-3 w-3" />
                )}
              </Button>
            </TableHead>
            
            <TableHead>Email</TableHead>
            
            <TableHead>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onSort?.('role')}
                className="h-8 font-semibold"
              >
                Rôle
                {sortField === 'role' && (
                  sortDirection === 'asc' 
                    ? <ArrowUp className="ml-2 h-3 w-3" />
                    : <ArrowDown className="ml-2 h-3 w-3" />
                )}
              </Button>
            </TableHead>
            
            <TableHead>Groupe</TableHead>
            
            <TableHead>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onSort?.('status')}
                className="h-8 font-semibold"
              >
                Statut
                {sortField === 'status' && (
                  sortDirection === 'asc' 
                    ? <ArrowUp className="ml-2 h-3 w-3" />
                    : <ArrowDown className="ml-2 h-3 w-3" />
                )}
              </Button>
            </TableHead>
            
            <TableHead>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onSort?.('lastLogin')}
                className="h-8 font-semibold"
              >
                Dernière connexion
                {sortField === 'lastLogin' && (
                  sortDirection === 'asc' 
                    ? <ArrowUp className="ml-2 h-3 w-3" />
                    : <ArrowDown className="ml-2 h-3 w-3" />
                )}
              </Button>
            </TableHead>
            
            <TableHead className="w-12">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.map(user => (
            <TableRow 
              key={user.id}
              className="h-10 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <TableCell>
                <Checkbox 
                  checked={selectedRows.includes(user.id)}
                  onCheckedChange={() => toggleRowSelection(user.id)}
                />
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback className="text-xs">
                      {user.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">{user.name}</span>
                </div>
              </TableCell>
              
              <TableCell className="text-sm text-gray-600">
                {user.email}
              </TableCell>
              
              <TableCell>
                <Badge 
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary hover:text-white"
                  onClick={() => onFilterByRole?.(user.role)}
                >
                  {user.role}
                </Badge>
              </TableCell>
              
              <TableCell>
                <button
                  onClick={() => onFilterByGroup?.(user.group)}
                  className="text-sm text-gray-600 hover:text-primary hover:underline"
                >
                  {user.group}
                </button>
              </TableCell>
              
              <TableCell>
                <Badge 
                  variant={user.status === 'active' ? 'default' : 'secondary'}
                  className={cn(
                    "cursor-pointer",
                    user.status === 'active' 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'hover:bg-gray-400'
                  )}
                  onClick={() => onFilterByStatus?.(user.status)}
                >
                  <div className="flex items-center gap-1">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      user.status === 'active' ? 'bg-white' : 'bg-gray-600'
                    )} />
                    <span>{user.status === 'active' ? 'Actif' : 'Inactif'}</span>
                  </div>
                </Badge>
              </TableCell>
              
              <TableCell className="text-sm text-gray-500">
                {formatDistanceToNow(user.lastLogin, { locale: fr })}
              </TableCell>
              
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/users/${user.id}`)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Voir détails
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEditDrawer(user)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600"
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
```

**RÈGLES DENSITÉ TABLEAU** :

```css
/* Hauteurs */
tr { height: 40px; }              /* Ligne standard */
td, th { padding: 8px 12px; }     /* Cellule */

/* Typographie */
th { 
  font-size: 13px; 
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

td { 
  font-size: 13px; 
  line-height: 1.4;
}

/* Colonnes */
.checkbox-col { width: 48px; }
.actions-col { width: 48px; }
.avatar-col { width: 180px; }
/* Autres: flexible avec min-width 120px */
```

---

### **7. FOOTER BAR - Implémentation obligatoire**

```tsx
<Footer className="h-10 border-t fixed bottom-0 w-full bg-white dark:bg-gray-900 text-xs z-40">
  <div className="container mx-auto px-4 h-full flex items-center justify-between">
    
    {/* GAUCHE - Status */}
    <div className="flex items-center gap-6">
      {/* Statut système */}
      <div className="flex items-center gap-2">
        <div className={cn(
          "h-2 w-2 rounded-full animate-pulse",
          systemStatus === 'operational' ? 'bg-green-500' : 
          systemStatus === 'maintenance' ? 'bg-orange-500' : 
          'bg-red-500'
        )} />
        <span className="text-gray-600 dark:text-gray-400">
          {systemStatus === 'operational' ? 'Opérationnel' : 
           systemStatus === 'maintenance' ? 'Maintenance' : 
           'Incident'}
        </span>
      </div>
      
      <Separator orientation="vertical" className="h-4" />
      
      {/* Dernière synchro */}
      <button 
        onClick={handleManualSync}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary transition-colors"
      >
        <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
        <span>Synchro: {formatDistanceToNow(lastSyncTime, { locale: fr })}</span>
      </button>
      
      <Separator orientation="vertical" className="h-4" />
      
      {/* Connexion */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="h-3 w-3 text-green-500" />
            <span className="text-gray-600 dark:text-gray-400">En ligne</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-red-500" />
            <span className="text-gray-600 dark:text-gray-400">Hors ligne</span>
          </>
        )}
      </div>
    </div>

    {/* CENTRE - Version & Env */}
    <div className="flex items-center gap-4">
      <span className="text-gray-500">v{APP_VERSION}</span>
      <Badge 
        variant={
          environment === 'production' ? 'default' :
          environment === 'staging' ? 'secondary' :
          'destructive'
        }
        className="text-xs"
      >
        {environment}
      </Badge>
    </div>

    {/* DROITE - Actions */}
    <div className="flex items-center gap-2">
      <Button 
        variant="ghost" 
        size="icon"
        className="h-7 w-7"
        onClick={() => window.open('/docs', '_blank')}
        title="Documentation"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
      
      <Button 
        variant="ghost" 
        size="icon"
        className="h-7 w-7"
        onClick={() => setFeedbackOpen(true)}
        title="Envoyer un feedback"
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
      
      <Button 
        variant="ghost" 
        size="icon"
        className="h-7 w-7"
        onClick={toggleFullscreen}
        title={isFullscreen ? "Quitter plein écran" : "Plein écran"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
      
      <Separator orientation="vertical" className="h-4 mx-2" />
      
      <span className="text-gray-400">© 2024 OpsFlux</span>
    </div>
  </div>
</Footer>
```

---

### **8. SKELETON LOADING STATES - OBLIGATOIRES**

**RÈGLE ABSOLUE : Jamais de spinner seul (sauf 3 exceptions)**

```tsx
// ❌ INTERDIT
{isLoading && (
  <div className="flex justify-center p-8">
    <Loader2 className="h-8 w-8 animate-spin" />
  </div>
)}

// ✅ OBLIGATOIRE - Skeleton Grid
{isLoading && (
  <div className="grid grid-cols-4 gap-4">
    {Array(8).fill(0).map((_, i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
)}

// ✅ OBLIGATOIRE - Skeleton Table
{isLoading && (
  <div className="border rounded-lg">
    <TableSkeleton rows={10} columns={7} />
  </div>
)}
```

**Composants Skeleton obligatoires :**

```tsx
// CardSkeleton.tsx
export const CardSkeleton = () => (
  <div className="p-3 border rounded-lg animate-pulse">
    <div className="flex items-center gap-2 mb-2">
      <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div className="flex-1 space-y-1">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
    <div className="flex gap-1 mt-2">
      <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded-full" />
    </div>
  </div>
);

// TableSkeleton.tsx
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ 
  rows = 10, 
  columns = 5 
}) => (
  <Table>
    <TableHeader>
      <TableRow>
        {Array(columns).fill(0).map((_, i) => (
          <TableHead key={i}>
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {Array(rows).fill(0).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array(columns).fill(0).map((_, colIndex) => (
            <TableCell key={colIndex}>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

// TextSkeleton.tsx
export const TextSkeleton: React.FC<{ lines?: number; width?: string[] }> = ({ 
  lines = 3,
  width = ['100%', '90%', '75%']
}) => (
  <div className="space-y-2">
    {Array(lines).fill(0).map((_, i) => (
      <div 
        key={i}
        className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
        style={{ width: width[i] || width[width.length - 1] }}
      />
    ))}
  </div>
);
```

**3 EXCEPTIONS où spinners sont autorisés :**

```tsx
// 1. Header - Mini spinner pendant async courtes
{isSearching && (
  <Loader2 className="absolute right-8 h-4 w-4 animate-spin text-gray-400" />
)}

// 2. Header - Progress bar pour opérations longues
{isLoading && (
  <Progress value={loadingProgress} className="absolute bottom-0 left-0 right-0 h-1" />
)}

// 3. Boutons - Mini spinner pendant action
<Button disabled={isSaving}>
  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Enregistrer
</Button>
```

---

### **9. FILTRAGE INTELLIGENT - Comportements obligatoires**

**Principe clé : Tout élément cliquable peut devenir un filtre**

```tsx
// Hook personnalisé pour filtrage
const useSmartFilters = (items: any[]) => {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filteredItems, setFilteredItems] = useState(items);
  
  const addFilter = (type: string, value: any, label: string) => {
    const newFilter: Filter = {
      id: `${type}-${value}`,
      type,
      value,
      label
    };
    
    setFilters(prev => {
      // Si filtre existe déjà, ne rien faire
      if (prev.some(f => f.id === newFilter.id)) return prev;
      return [...prev, newFilter];
    });
  };
  
  const removeFilter = (id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id));
  };
  
  const clearAllFilters = () => {
    setFilters([]);
  };
  
  // Appliquer filtres (logique ET)
  useEffect(() => {
    let result = items;
    
    filters.forEach(filter => {
      switch (filter.type) {
        case 'status':
          result = result.filter(item => item.status === filter.value);
          break;
        case 'role':
          result = result.filter(item => item.role === filter.value);
          break;
        case 'group':
          result = result.filter(item => item.group === filter.value);
          break;
        case 'tag':
          result = result.filter(item => item.tags?.includes(filter.value));
          break;
        case 'priority':
          result = result.filter(item => item.priority === filter.value);
          break;
        // Ajouter autres types selon besoin
      }
    });
    
    setFilteredItems(result);
  }, [filters, items]);
  
  return {
    filters,
    filteredItems,
    addFilter,
    removeFilter,
    clearAllFilters,
    resultsCount: filteredItems.length
  };
};

// Utilisation dans composants
const UsersPage = () => {
  const { data: users } = useQuery(['users']);
  const { filters, filteredItems, addFilter, removeFilter, clearAllFilters, resultsCount } = useSmartFilters(users);
  
  return (
    <div>
      {/* Filtres actifs */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {filters.map(filter => (
            <Badge 
              key={filter.id}
              variant="secondary"
              className="px-3 py-1.5 gap-2 cursor-pointer hover:bg-gray-300"
            >
              <span className="text-xs font-medium">{filter.label}</span>
              <button onClick={() => removeFilter(filter.id)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Effacer tout
          </Button>
          <span className="text-sm text-gray-500 ml-auto">
            <strong>{resultsCount}</strong> résultats
          </span>
        </div>
      )}
      
      {/* Grid avec filtrage au clic */}
      <div className="grid grid-cols-4 gap-4">
        {filteredItems.map(user => (
          <UserCard 
            key={user.id}
            user={user}
            onFilterByRole={(role) => addFilter('role', role, `Rôle: ${role}`)}
            onFilterByGroup={(group) => addFilter('group', group, `Groupe: ${group}`)}
            onFilterByStatus={(status) => addFilter('status', status, `Statut: ${status}`)}
            onFilterByTag={(tag) => addFilter('tag', tag, `Tag: ${tag}`)}
          />
        ))}
      </div>
    </div>
  );
};
```

**Indicateurs visuels obligatoires :**

```tsx
// Badge/Tag cliquable pour filtrage
<Badge 
  className="cursor-pointer hover:bg-primary hover:text-white hover:scale-105 transition-all"
  onClick={() => onFilterByTag(tag)}
  title="Cliquer pour filtrer par ce tag"
>
  {tag}
</Badge>

// Statut cliquable
<button
  onClick={() => onFilterByStatus(status)}
  className="text-sm hover:text-primary hover:underline transition-colors"
  title="Cliquer pour filtrer par ce statut"
>
  {status}
</button>

// Compteur sur options filtrables (dans panel filtres)
<DropdownMenuItem onClick={() => addFilter('status', 'active', 'Statut: Actif')}>
  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
  <span>Actif</span>
  <Badge className="ml-auto" variant="secondary">45</Badge>
</DropdownMenuItem>
```

---

### **10. DESIGN SYSTEM CUSTOM - Variables CSS obligatoires**

**Fichier `src/styles/globals.css` :**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Variables CSS - Design System OpsFlux */
@layer base {
  :root {
    /* Primary (Bleu professionnel OpsFlux) */
    --primary-50: #eff6ff;
    --primary-100: #dbeafe;
    --primary-200: #bfdbfe;
    --primary-300: #93c5fd;
    --primary-400: #60a5fa;
    --primary-500: #3b82f6;
    --primary-600: #2563eb;
    --primary-700: #1d4ed8;
    --primary-800: #1e40af;
    --primary-900: #1e3a8a;
    
    /* Gray (Interface) */
    --gray-50: #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-300: #d1d5db;
    --gray-400: #9ca3af;
    --gray-500: #6b7280;
    --gray-600: #4b5563;
    --gray-700: #374151;
    --gray-800: #1f2937;
    --gray-900: #111827;
    
    /* Semantic Colors */
    --success-50: #f0fdf4;
    --success-500: #10b981;
    --success-600: #059669;
    --success-700: #047857;
    
    --warning-50: #fffbeb;
    --warning-500: #f59e0b;
    --warning-600: #d97706;
    --warning-700: #b45309;
    
    --error-50: #fef2f2;
    --error-500: #ef4444;
    --error-600: #dc2626;
    --error-700: #b91c1c;
    
    --info-50: #eff6ff;
    --info-500: #3b82f6;
    --info-600: #2563eb;
    --info-700: #1d4ed8;
    
    /* Backgrounds */
    --bg-base: #ffffff;
    --bg-subtle: #f9fafb;
    --bg-muted: #f3f4f6;
    --bg-overlay: rgba(0, 0, 0, 0.5);
    
    /* Text */
    --text-primary: #111827;
    --text-secondary: #6b7280;
    --text-tertiary: #9ca3af;
    --text-inverse: #ffffff;
    
    /* Borders */
    --border-default: #e5e7eb;
    --border-muted: #f3f4f6;
    --border-strong: #d1d5db;
    
    /* Spacing (système 4px) */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-8: 32px;
    --space-10: 40px;
    --space-12: 48px;
    --space-16: 64px;
    --space-20: 80px;
    
    /* Typography */
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    
    --text-xs: 11px;
    --text-sm: 13px;
    --text-base: 14px;
    --text-lg: 16px;
    --text-xl: 20px;
    --text-2xl: 24px;
    --text-3xl: 32px;
    --text-4xl: 40px;
    
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    
    --line-height-tight: 1.2;
    --line-height-normal: 1.4;
    --line-height-relaxed: 1.6;
    
    /* Border Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-full: 9999px;
    
    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    
    /* Transitions */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
    
    /* Z-index layers */
    --z-base: 0;
    --z-dropdown: 10;
    --z-sticky: 20;
    --z-fixed: 30;
    --z-modal-backdrop: 40;
    --z-modal: 50;
    --z-popover: 60;
    --z-tooltip: 70;
  }
  
  /* Dark Mode */
  [data-theme="dark"] {
    --bg-base: #111827;
    --bg-subtle: #1f2937;
    --bg-muted: #374151;
    --bg-overlay: rgba(0, 0, 0, 0.7);
    
    --text-primary: #f9fafb;
    --text-secondary: #d1d5db;
    --text-tertiary: #9ca3af;
    --text-inverse: #111827;
    
    --border-default: #374151;
    --border-muted: #1f2937;
    --border-strong: #4b5563;
  }
}

/* Base Styles */
@layer base {
  * {
    @apply border-border;
  }
  
  body {
    @apply bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--line-height-normal);
  }
  
  h1, h2, h3, h4, h5, h6 {
    @apply font-semibold text-gray-900 dark:text-gray-100;
    line-height: var(--line-height-tight);
  }
  
  h1 { font-size: var(--text-3xl); }
  h2 { font-size: var(--text-2xl); }
  h3 { font-size: var(--text-xl); }
  h4 { font-size: var(--text-lg); }
  h5 { font-size: var(--text-base); }
  h6 { font-size: var(--text-sm); }
}

/* Utilities */
@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
  
  .animate-slide-in-from-left {
    animation: slideInFromLeft var(--transition-normal);
  }
  
  .animate-slide-out-to-left {
    animation: slideOutToLeft var(--transition-normal);
  }
}

@keyframes slideInFromLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutToLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}
```

**Configuration Tailwind (`tailwind.config.js`) :**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
        },
        gray: {
          50: 'var(--gray-50)',
          100: 'var(--gray-100)',
          200: 'var(--gray-200)',
          300: 'var(--gray-300)',
          400: 'var(--gray-400)',
          500: 'var(--gray-500)',
          600: 'var(--gray-600)',
          700: 'var(--gray-700)',
          800: 'var(--gray-800)',
          900: 'var(--gray-900)',
        },
        success: {
          50: 'var(--success-50)',
          500: 'var(--success-500)',
          600: 'var(--success-600)',
          700: 'var(--success-700)',
        },
        warning: {
          50: 'var(--warning-50)',
          500: 'var(--warning-500)',
          600: 'var(--warning-600)',
          700: 'var(--warning-700)',
        },
        error: {
          50: 'var(--error-50)',
          500: 'var(--error-500)',
          600: 'var(--error-600)',
          700: 'var(--error-700)',
        },
        info: {
          50: 'var(--info-50)',
          500: 'var(--info-500)',
          600: 'var(--info-600)',
          700: 'var(--info-700)',
        },
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
        20: 'var(--space-20)',
      },
      fontSize: {
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        '3xl': 'var(--text-3xl)',
        '4xl': 'var(--text-4xl)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      transitionDuration: {
        fast: 'var(--transition-fast)',
        DEFAULT: 'var(--transition-normal)',
        slow: 'var(--transition-slow)',
      },
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1400px',
      },
    },
  },
  plugins: [],
};
```

---

### **11. RESPONSIVE - Breakpoints et adaptations**

**Breakpoints obligatoires :**

```tsx
// tailwind.config.js
screens: {
  'sm': '640px',   // Mobile large
  'md': '768px',   // Tablet
  'lg': '1024px',  // Desktop
  'xl': '1400px',  // Desktop XL
}
```

**Adaptations par taille OBLIGATOIRES :**

```tsx
// Mobile (<640px)
<div className={cn(
  // Sidebar → Full-screen drawer avec overlay
  "lg:w-64 lg:relative", // Desktop: sidebar normale
  "fixed inset-0 z-50",  // Mobile: drawer plein écran
  !sidebarOpen && "hidden" // Mobile: caché par défaut
)}>

// Header → Simplifié
<Header className="h-16">
  <MobileMenuButton className="lg:hidden" />
  <Logo />
  <Breadcrumb className="hidden md:block" /> {/* Masqué sur mobile */}
  <Search className="hidden md:block" /> {/* Masqué, ou modal sur mobile */}
  {/* Boutons essentiels uniquement */}
</Header>

// Cards → 1 colonne, padding augmenté
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">

// Tableau → Horizontal scroll OU transformation en cards
<div className="overflow-x-auto md:overflow-x-visible">
  <Table className="min-w-[800px] md:min-w-0">

// Drawer → Bottom sheet sur mobile
<DialogContent className={cn(
  "lg:w-[500px] lg:left-0 lg:top-0 lg:h-full",
  "w-full bottom-0 left-0 right-0 h-[80vh] rounded-t-xl" // Mobile: bottom sheet
)}>
```

---

### **12. RACCOURCIS CLAVIER - Implémentation obligatoire**

```tsx
// hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  category: string;
}

export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { openSearch, toggleSidebar, toggleTheme, toggleView, openFilters } = useAppActions();
  
  const shortcuts: Shortcut[] = [
    // Navigation
    { key: 'k', ctrl: true, action: openSearch, description: 'Recherche globale', category: 'Navigation' },
    { key: 'h', ctrl: true, action: () => navigate('/'), description: 'Accueil', category: 'Navigation' },
    { key: 'b', ctrl: true, action: toggleSidebar, description: 'Toggle sidebar', category: 'Navigation' },
    { key: '1', alt: true, action: () => navigate('/dashboard'), description: 'Tableau de bord', category: 'Navigation' },
    { key: '2', alt: true, action: () => navigate('/users'), description: 'Utilisateurs', category: 'Navigation' },
    
    // Actions
    { key: 'e', ctrl: true, action: openCreateDrawer, description: 'Nouvelle entité', category: 'Actions' },
    { key: 's', ctrl: true, action: saveForm, description: 'Sauvegarder', category: 'Actions' },
    { key: 'f', ctrl: true, action: openFilters, description: 'Filtres avancés', category: 'Actions' },
    { key: 'g', ctrl: true, action: toggleView, description: 'Toggle Grid/Liste', category: 'Actions' },
    { key: 'r', ctrl: true, action: refreshData, description: 'Actualiser', category: 'Actions' },
    
    // Interface
    { key: 'd', ctrl: true, action: toggleTheme, description: 'Toggle dark mode', category: 'Interface' },
    { key: ',', ctrl: true, action: () => navigate('/settings'), description: 'Paramètres', category: 'Interface' },
    { key: '/', ctrl: true, action: openShortcutsModal, description: 'Aide raccourcis', category: 'Interface' },
    
    // Fermeture
    { key: 'Escape', action: closeModalOrDrawer, description: 'Fermer modal/drawer', category: 'Général' },
  ];
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const matchingShortcut = shortcuts.find(shortcut => {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;
        
        return keyMatch && ctrlMatch && shiftMatch && altMatch;
      });
      
      if (matchingShortcut) {
        e.preventDefault();
        matchingShortcut.action();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
  
  return { shortcuts };
};

// Modal aide raccourcis (Ctrl+/)
const ShortcutsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { shortcuts } = useKeyboardShortcuts();
  
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = [];
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Raccourcis Clavier</DialogTitle>
          <DialogDescription>
            Accélérez votre navigation avec ces raccourcis
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {shortcuts.map((shortcut, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.ctrl && (
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                            Ctrl
                          </kbd>
                        )}
                        {shortcut.shift && (
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                            Shift
                          </kbd>
                        )}
                        {shortcut.alt && (
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                            Alt
                          </kbd>
                        )}
                        <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded uppercase">
                          {shortcut.key}
                        </kbd>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
```

---

## 🎯 **MODULES MÉTIER - ORDRE DE DÉVELOPPEMENT**

**L'IA DOIT** développer les 9 modules métier **APRÈS** avoir terminé les 25 services CORE, dans **CET ORDRE PRÉCIS** :

### **Phase 1 : Modules Fondamentaux (Après CORE 100%)**

1. **Tiers** (Third-Party Management)
   - Gestion entreprises, contacts, utilisateurs externes
   - CRUD complet avec relations
   - 2-3 semaines

2. **Projects** (Project Management)
   - Projets, tâches, jalons, équipes
   - Gantt, Kanban, Suivi budget
   - 3-4 semaines

3. **Organizer** (Planning & Scheduling)
   - Ordonnancement multi-projets
   - Planning POB sur site
   - Gestion ressources
   - 3-4 semaines

### **Phase 2 : Modules Opérationnels**

4. **POBVue** (Personnel On Board)
   - Demandes séjour personnel
   - Workflow validation multi-niveaux
   - Planning rotations
   - 2-3 semaines

5. **TravelWiz** (Transport & Logistics)
   - Bookings (bateau, hélico, véhicule)
   - Manifestes
   - Tracking temps réel
   - Suivi consommations
   - 3-4 semaines

6. **MOCVue** (Management of Change)
   - Demandes changement
   - Workflow validation
   - Analyse d'impact
   - REX post-implémentation
   - 2-3 semaines

### **Phase 3 : Modules Spécialisés**

7. **CleanVue** (5S & Asset Management)
   - Audits 5S
   - Scrapping
   - Retours site
   - Traçabilité
   - 2 semaines

8. **PowerTrace** (Electrical Forecasting)
   - Monitoring consommation
   - Prévisions puissance
   - Scénarios what-if
   - Dimensionnement
   - 2-3 semaines

9. **Rédacteur** (Dynamic Document Builder) - **LE PLUS COMPLEXE**
   - Éditeur visuel type EditorJS
   - Blocs dynamiques (data from modules)
   - Formulaires descriptifs custom
   - Templates réutilisables
   - Export multi-formats
   - 4-5 semaines

**TOTAL estimation : 24-32 semaines pour les 9 modules**

---

## 📋 **CHECKLIST VALIDATION FINALE**

Avant **CHAQUE** commit, l'IA **DOIT** vérifier **TOUS** ces points :

### **✅ App Shell**
- [ ] Header : 5 sections (logo, home, breadcrumb, search, actions)
- [ ] Sidebar : 3 groupes (Pilotage, Modules, Système) dans l'ordre
- [ ] Drawer : Header + Body scrollable + Footer fixe
- [ ] Footer : 3 sections (status, version, actions)
- [ ] Responsive : Breakpoints 640/768/1024/1400 respectés
- [ ] Dark mode : Fonctionne sur tous composants

### **✅ Fonctionnalités**
- [ ] Search contextuelle : Filtre local OU modal selon page
- [ ] Favoris : Simple clic ajoute, double clic modal
- [ ] Toggle Grid/Liste : Fonctionne + mémorisé
- [ ] Filtrage intelligent : Clic sur tag/statut/etc filtre
- [ ] Pills filtres : Affichage + suppression + compteur
- [ ] Skeleton loading : Partout (pas de spinners sauf 3 exceptions)

### **✅ Design**
- [ ] Densité : Cards compactes (padding 12px, gap 12-16px)
- [ ] Typographie : 11-13px body, 14-16px titres
- [ ] Couleurs : Variables CSS uniquement (pas de hardcode)
- [ ] Icônes : Lucide React uniquement
- [ ] Animations : Durées cohérentes (150-300ms)
- [ ] Radix UI : Utilisé pour tous composants interactifs
- [ ] Tailwind : Utilisé pour tout le styling (pas de CSS-in-JS)

### **✅ Performance**
- [ ] Debounce : Search 300ms, filtres 300ms
- [ ] Virtualisation : Si liste >100 items (tanstack-virtual)
- [ ] Lazy loading : Images et composants lourds
- [ ] Memoization : React.memo sur composants purs
- [ ] Code splitting : Routes lazy loaded
- [ ] TanStack Query : Caching configuré correctement

### **✅ Accessibilité**
- [ ] Navigation clavier : Tab, Shift+Tab, Arrow keys
- [ ] ARIA : Labels, roles, live regions (Radix les fournit)
- [ ] Focus : Visible et contrasté (outline 2px)
- [ ] Contraste : WCAG AA minimum (4.5:1 texte)
- [ ] Screen readers : Testé avec NVDA ou VoiceOver
- [ ] Raccourcis : Tous implémentés et fonctionnels

### **✅ Backend**
- [ ] API : Endpoints testés (manuel ou pytest)
- [ ] Migrations : Alembic appliquées sans erreurs
- [ ] Validation : Schémas Pydantic corrects
- [ ] Permissions : RBAC vérifié
- [ ] Tests : >80% couverture
- [ ] Logs : Pas d'erreurs en console backend

### **✅ Frontend**
- [ ] Build : `npm run build` sans erreurs
- [ ] Dev : `npm run dev` sans erreurs
- [ ] Console : Aucune erreur/warning
- [ ] Network : Appels API corrects (200/201/204)
- [ ] Types : TypeScript strict sans `any`
- [ ] Tests : Composants critiques testés (Vitest)

### **✅ Intégration**
- [ ] Backend ↔ Frontend : Types synchronisés
- [ ] Pas de régression : Fonctionnalités existantes OK
- [ ] Hooks système : Déclenchés correctement
- [ ] Notifications : Envoyées et affichées
- [ ] Audit trail : Actions tracées

### **✅ Documentation**
- [ ] `docs/projet/ROADMAP.md` : Progression mise à jour
- [ ] `docs/projet/DEV_LOG.md` : Session actuelle documentée
- [ ] `docs/projet/CORE_SERVICES.md` : Service documenté (si CORE)
- [ ] `docs/developer/TECHNICAL_DECISIONS.md` : Décisions notées
- [ ] Commit message : Professionnel, français, **SANS mention IA**

---

## 🔄 **WORKFLOW DÉVELOPPEMENT**

### **Avant de commencer une tâche**

L'IA **DOIT** :

1. **Lire la documentation** :
   ```bash
   cat docs/projet/ROADMAP.md      # État actuel projet
   cat docs/projet/DEV_LOG.md      # Dernière session
   cat docs/projet/CORE_SERVICES.md # Service à développer
   ```

2. **Vérifier l'existant** :
   ```bash
   ls -la backend/app/core/models/
   ls -la backend/app/core/services/
   ls -la frontend/src/features/
   git log --oneline -20  # Derniers commits
   ```

3. **Clarifier si besoin** :
   - Si ambiguïté dans specs → **DEMANDER** à l'utilisateur
   - Si plusieurs approches possibles → **PROPOSER** options
   - Si blocage technique → **EXPLIQUER** problème + alternatives

4. **Annoncer le plan** :
   ```
   Je vais développer [Fonctionnalité X] selon les specs.
   
   Plan d'implémentation :
   
   Backend :
   - Modèles : User, Role, Permission, Group
   - Services : RoleService (assign, check, cache)
   - API : 12 endpoints CRUD + assign/revoke
   - Tests : 15 tests unitaires
   
   Frontend :
   - Pages : Liste users, Détails, Create/Edit
   - Composants : UsersTable, UserCard, RoleAssigner
   - Formulaires : Validation Zod
   
   Intégrations :
   - Hooks : user.created, role.assigned
   - Notifications : Email + in-app
   - Audit : Toutes actions tracées
   
   Durée estimée : 2-3 jours
   
   Confirmes-tu cette approche ?
   ```

### **Pendant le développement**

**Ordre STRICT obligatoire :**

1. **Backend d'abord** :
   ```bash
   # 1. Créer modèles SQLModel
   backend/app/core/models/user.py
   
   # 2. Créer migration Alembic
   cd backend
   alembic revision --autogenerate -m "Add users models"
   alembic upgrade head
   
   # 3. Créer schémas Pydantic
   backend/app/core/schemas/user.py
   
   # 4. Créer services métier
   backend/app/core/services/user_service.py
   
   # 5. Créer endpoints API
   backend/app/core/api/users.py
   
   # 6. Tests unitaires
   backend/tests/core/test_user_service.py
   backend/tests/core/api/test_users.py
   
   # 7. Tester manuellement
   # Démarrer backend et tester avec curl/Postman
   ```

2. **Frontend ensuite** :
   ```bash
   # 1. Créer types TypeScript (depuis schémas Pydantic)
   frontend/src/types/user.ts
   
   # 2. Créer API client
   frontend/src/lib/api/users.ts
   
   # 3. Créer composants primitives si besoin
   frontend/src/components/primitives/Button.tsx
   
   # 4. Créer composants UI réutilisables
   frontend/src/components/ui/UserCard.tsx
   frontend/src/components/ui/UsersTable.tsx
   
   # 5. Créer feature complète
   frontend/src/features/users/UsersPage.tsx
   frontend/src/features/users/UserDetailsPage.tsx
   frontend/src/features/users/CreateUserDrawer.tsx
   
   # 6. Créer route
   frontend/src/routes/users.tsx
   
   # 7. Tests composants
   frontend/src/features/users/__tests__/UsersPage.test.tsx
   
   # 8. Tester manuellement
   npm run dev  # Vérifier UI, interactions, responsive
   ```

3. **Intégrations** :
   ```bash
   # Hooks système
   backend/app/core/services/hook_service.py
   # → Trigger hooks (user.created, user.updated, etc.)
   
   # Notifications
   backend/app/core/services/notification_service.py
   # → Envoyer notifications in-app + email
   
   # Audit trail
   backend/app/core/services/audit_service.py
   # → Logger toutes actions
   ```

4. **Documentation** :
   ```bash
   # Mettre à jour TOUS les docs concernés
   docs/projet/ROADMAP.md
   docs/projet/DEV_LOG.md
   docs/projet/CORE_SERVICES.md
   docs/developer/API_DOCUMENTATION.md
   ```

5. **Commit** :
   ```bash
   git add .
   git commit -m "Core: Ajout service de gestion des utilisateurs

   Implémentation complète du service Users avec RBAC.
   
   Fonctionnalités:
   - Modèles User, Role, Permission, Group
   - Service UserService avec cache Redis
   - API REST complète (CRUD + assign roles)
   - Frontend: Liste, détails, création, modification
   - Tests unitaires backend + frontend
   - Audit trail complet
   
   Fichiers modifiés:
   - backend/app/core/models/user.py
   - backend/app/core/services/user_service.py
   - backend/app/core/api/users.py
   - frontend/src/features/users/
   - docs/projet/ROADMAP.md
   "
   ```

### **Après chaque fonctionnalité**

L'IA **DOIT** :

1. **Résumer le travail** :
   ```
   ✅ Service Users terminé
   
   Livrables :
   - Backend : 4 modèles, 1 service, 12 endpoints API
   - Frontend : 3 pages, 5 composants, 1 drawer formulaire
   - Tests : 15 tests backend, 8 tests frontend (100% couverture)
   - Documentation : ROADMAP.md, DEV_LOG.md, API docs mis à jour
   
   Fonctionnalités implémentées :
   ✅ CRUD complet utilisateurs
   ✅ Assignation rôles et permissions
   ✅ Validation email unique
   ✅ Gestion groupes hiérarchiques
   ✅ Audit trail complet
   ✅ Notifications (création, modification, suppression)
   ✅ Export/Import CSV
   ✅ Filtrage intelligent
   ✅ Recherche contextuelle
   
   Temps réel : 2 jours (estimé : 2-3 jours)
   ```

2. **Proposer 3 prochaines actions** :
   ```
   Prochaines étapes recommandées :
   
   1. 🔐 Service Authentication (Priorité 0 - Critique)
      - JWT Login/Logout/Refresh
      - 2FA (TOTP + SMS)
      - Session Management
      - Durée estimée : 3-4 jours
      
   2. 🔔 Service Notifications (Priorité 0 - Critique)
      - Multi-canal (in-app, email, SMS, push)
      - Templates + variables
      - Préférences utilisateur
      - Durée estimée : 2-3 jours
      
   3. 🌐 Service Translation/i18n (Priorité 0 - Critique)
      - Support FR/EN/ES/PT
      - Interface admin traductions
      - Formats localisés (dates, nombres)
      - Durée estimée : 2 jours
   
   Quelle action souhaites-tu prioriser ?
   ```

3. **Attendre confirmation** avant de continuer

---

## 🎯 **DOMAINE MÉTIER OIL & GAS**

### **OpsFlux n'est PAS un ERP classique**

**OpsFlux** est un **MOS (Management Operating System)** spécialisé dans :
- Gestion des flux logistiques
- Gestion organisationnelle
- Opérations industrielles complexes
- Coordination multi-sites (offshore, onshore)

**Secteur principal** : Oil & Gas (production, exploration, services)

**Cibles utilisateurs** :
1. **Oil Operators** : Total, Shell, BP, Eni, Chevron, ConocoPhillips
2. **Service Companies** : Schlumberger, Halliburton, Weatherford, Baker Hughes
3. **Logistics Providers** : CHC Helicopter, Bristow Group, Bourbon Offshore
4. **EPCs** : Technip, Saipem, Subsea 7
5. **Autres industries** : Mining, Construction, Maritime, Utilities

### **Zones géographiques**

**Focus principal** :
- 🌍 **Afrique de l'Ouest** : Cameroun, Gabon, Congo, Angola, Nigeria
- 🌍 **Golfe de Guinée** : Offshore deepwater operations

**Adaptable** :
- 🌍 Mer du Nord (UK, Norway)
- 🌍 Brésil (Pre-salt)
- 🌍 Moyen-Orient (Saudi, UAE, Qatar)
- 🌍 Asie-Pacifique (Malaysia, Indonesia, Australia)

### **Vocabulaire métier critique**

L'IA **DOIT** connaître ce vocabulaire :

```
**Installations**
- Rig/Platform : Plateforme pétrolière offshore
- FPSO : Floating Production Storage and Offloading
- FSO : Floating Storage and Offloading
- Wellhead Platform : Plateforme tête de puits
- Subsea : Équipements sous-marins
- Onshore Facility : Installation terrestre
- Terminal : Terminal pétrolier/gazier

**Personnel**
- POB : Personnel On Board (personnel présent)
- Offshore Worker : Travailleur offshore
- Crew : Équipage
- Rotation : 28/28, 14/14 (jours travaillés/repos)
- Mobilization : Mobilisation vers site
- Demobilization : Retour base
- Crew Change : Rotation équipage
- Medevac : Medical Evacuation (évacuation médicale)

**Logistique**
- Supply Vessel : Navire logistique
- Helicopter : Hélicoptère
- Manifest : Liste cargo/personnel
- Cargo : Fret, marchandises
- Deck Cargo : Cargo pont (containers, équipements)
- Liquid Cargo : Cargo liquide (fuel, eau, boue)
- Backload : Retour de cargo depuis plateforme
- Freight : Fret

**HSE (Health, Safety, Environment)**
- QHSE : Quality, Health, Safety, Environment
- PTW : Permit To Work (permis de travail)
- JSEA : Job Safety and Environmental Analysis
- Toolbox Talk : Briefing sécurité
- Near Miss : Quasi-accident
- Incident : Incident sécurité/environnemental
- LTI : Lost Time Injury (accident avec arrêt)
- TRIR : Total Recordable Incident Rate

**Formations/Certifications**
- BOSIET : Basic Offshore Safety Induction & Emergency Training
- HUET : Helicopter Underwater Escape Training
- H2S : Hydrogen Sulfide Training
- Confined Space : Formation espaces confinés
- Working at Heights : Travail en hauteur
- Medical Certificate : Certificat médical offshore

**Opérations**
- Drilling : Forage
- Production : Production pétrole/gaz
- Workover : Intervention sur puits
- Maintenance : Maintenance (préventive, corrective)
- Shutdown : Arrêt programmé installation
- Turnaround : Grand arrêt programmé (TAR)
- Start-up : Démarrage
- Commissioning : Mise en service
- Decommissioning : Démantèlement

**Documents**
- POB Report : Rapport personnel à bord
- Daily Report : Rapport journalier
- Incident Report : Rapport d'incident
- Inspection Report : Rapport d'inspection
- Certificate : Certificat (équipement, personnel)
- Procedure : Procédure opérationnelle
- Work Order : Ordre de travail
- Purchase Order : Bon de commande
```

### **Modules métiers (rappel - À développer APRÈS CORE)**

**NE PAS créer maintenant**, mais connaître pour architecture :

1. **Tiers** : Entreprises, contacts, utilisateurs externes
2. **Projects** : Projets, tâches, planning
3. **Organizer** : Ordonnancement, POB planning, ressources
4. **POBVue** : Demandes séjour personnel, workflow validation
5. **TravelWiz** : Bookings transport, manifestes, tracking
6. **MOCVue** : Management of Change, workflow approbation
7. **Rédacteur** : Document builder dynamique (type Notion)
8. **CleanVue** : 5S, scrapping, retour site
9. **PowerTrace** : Prévisions électriques, monitoring

---

## 📝 **CONVENTIONS DE CODE**

### **Langues**

**Code** :
- Variables, fonctions, classes : **Anglais**
- Commentaires inline : **Français** (brefs)
- Docstrings : **Français** (détaillés)

**Documentation** :
- Fichiers .md : **Français**
- API docs (Swagger) : **Anglais** (standard international)
- User guides : **Français** (audience principale)

**Commits** :
- Messages : **Français**
- Format professionnel
- **JAMAIS** de mention IA

**Exemples** :

```python
# ✅ BON
class UserService:
    """
    Service de gestion des utilisateurs.
    
    Gère les opérations CRUD, assignation de rôles,
    et cache Redis pour les permissions.
    """
    
    def assign_role(self, user_id: UUID, role_id: UUID) -> User:
        """
        Assigne un rôle à un utilisateur.
        
        Args:
            user_id: UUID de l'utilisateur
            role_id: UUID du rôle
            
        Returns:
            User: Utilisateur avec rôle assigné
            
        Raises:
            NotFoundError: Si user ou role introuvable
            PermissionError: Si pas les droits
        """
        # Vérifier permissions
        if not self.can_assign_role(current_user):
            raise PermissionError("Droits insuffisants")
        
        # Assigner rôle
        user = self.user_repo.get(user_id)
        user.roles.append(role)
        
        # Invalider cache
        self.cache.delete(f"user:{user_id}:permissions")
        
        return user
```

```typescript
// ✅ BON
/**
 * Hook pour gestion des filtres intelligents
 * 
 * Permet de filtrer des données avec cumul de filtres (logique ET)
 * et mise à jour automatique des résultats.
 */
export const useSmartFilters = <T>(items: T[]) => {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filteredItems, setFilteredItems] = useState(items);
  
  // Ajouter un filtre
  const addFilter = (type: string, value: any, label: string) => {
    // Éviter doublons
    if (filters.some(f => f.id === `${type}-${value}`)) return;
    
    setFilters(prev => [...prev, { id: `${type}-${value}`, type, value, label }]);
  };
  
  // Appliquer filtres (logique ET)
  useEffect(() => {
    let result = items;
    filters.forEach(filter => {
      result = result.filter(item => matchesFilter(item, filter));
    });
    setFilteredItems(result);
  }, [filters, items]);
  
  return { filters, filteredItems, addFilter, removeFilter, clearAllFilters };
};
```

### **Nommage**

**Backend (Python)** :
```python
# snake_case pour tout
class UserService:           # Classes: PascalCase
    def get_user_by_id():   # Fonctions: snake_case
        user_name = ""      # Variables: snake_case
        
# Constants: UPPER_SNAKE_CASE
MAX_FILE_SIZE = 10_000_000
API_VERSION = "v1"
```

**Frontend (TypeScript)** :
```typescript
// camelCase pour variables/fonctions
// PascalCase pour composants/types
const UserCard: React.FC<UserCardProps> = ({ user }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleClick = () => {
    // ...
  };
  
  return <div>...</div>;
};

// Types/Interfaces: PascalCase
interface UserCardProps {
  user: User;
  onClick?: () => void;
}

// Enums: PascalCase
enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended'
}

// Constants: UPPER_SNAKE_CASE
const MAX_RESULTS = 100;
const API_BASE_URL = '/api/v1';
```

### **Structure fichiers**

**Backend** :
```python
"""
Module: user_service.py
Description: Service de gestion des utilisateurs avec RBAC et cache Redis
Auteur: Équipe Dev OpsFlux
Date: 2024-10-28
"""

# Imports standard library
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

# Imports third-party
from sqlmodel import Session, select
from redis import Redis

# Imports locaux
from app.core.models.user import User, Role
from app.core.schemas.user import UserCreate, UserUpdate
from app.core.exceptions import NotFoundError, PermissionError
from app.core.utils.cache import cache_key

# Logger
logger = logging.getLogger(__name__)

# Constants
CACHE_TTL = 3600  # 1 heure


class UserService:
    """Service métier pour gestion utilisateurs"""
    
    def __init__(self, db: Session, redis: Redis):
        self.db = db
        self.redis = redis
    
    # Méthodes publiques
    def get_all(self) -> List[User]:
        """Récupère tous les utilisateurs actifs"""
        pass
    
    # Méthodes privées
    def _check_permissions(self, user: User) -> bool:
        """Vérifie permissions utilisateur (privé)"""
        pass
```

**Frontend** :
```typescript
/**
 * Component: UserCard
 * Description: Carte compacte affichant un utilisateur avec actions rapides
 * Props: user, onClick, onFilterByRole, onFilterByGroup
 */

import React, { useState } from 'react';
import { User, Mail, Briefcase } from 'lucide-react';

// Components
import { Avatar, AvatarImage, AvatarFallback } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { DropdownMenu } from '@/components/primitives/DropdownMenu';

// Types
import type { User } from '@/types/user';

// Utils
import { cn } from '@/lib/utils';

interface UserCardProps {
  user: User;
  onClick?: () => void;
  onFilterByRole?: (role: string) => void;
  onFilterByGroup?: (group: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({
  user,
  onClick,
  onFilterByRole,
  onFilterByGroup
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      className={cn(
        "p-3 border rounded-lg transition-all cursor-pointer",
        isHovered && "shadow-lg"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Contenu card */}
    </div>
  );
};
```

---

## ⚙️ **COMMANDES UTILES**

### **Docker**

```bash
# Démarrer tous les services
docker-compose up -d

# Voir logs
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Arrêter tout
docker-compose down

# Rebuild et redémarrer
docker-compose up -d --build

# Accéder à un container
docker-compose exec backend bash
docker-compose exec frontend sh
docker-compose exec postgres psql -U opsflux_user -d opsflux

# Voir containers actifs
docker-compose ps

# Voir ressources utilisées
docker stats
```

### **Backend (FastAPI + Alembic)**

```bash
# Accéder au container backend
docker-compose exec backend bash

# Créer migration
alembic revision --autogenerate -m "Add users table"

# Appliquer migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1

# Voir historique migrations
alembic history

# Shell Python (FastAPI)
python -c "from app.main import app; import IPython; IPython.embed()"

# Tests
pytest
pytest -v
pytest --cov=app tests/
pytest tests/core/test_user_service.py

# Linting
ruff check .
black --check .

# Format code
black .
```

### **Frontend (React + Vite)**

```bash
# Accéder au container frontend
docker-compose exec frontend sh

# Dev server (hot reload)
npm run dev

# Build production
npm run build

# Preview build
npm run preview

# Tests
npm test
npm run test:watch
npm run test:coverage

# Linting
npm run lint

# Type checking
npm run type-check

# Format code
npm run format
```

### **Base de données**

```bash
# Accéder à PostgreSQL
docker-compose exec postgres psql -U opsflux_user -d opsflux

# Dans psql:
\dt              # Liste tables
\d users         # Describe table
\l               # Liste databases
\du              # Liste users
\q               # Quitter

# Backup DB
docker-compose exec postgres pg_dump -U opsflux_user opsflux > backup.sql

# Restore DB
docker-compose exec -T postgres psql -U opsflux_user opsflux < backup.sql

# Voir taille DB
docker-compose exec postgres psql -U opsflux_user -d opsflux -c "SELECT pg_size_pretty(pg_database_size('opsflux'));"
```

### **Redis**

```bash
# Accéder à Redis CLI
docker-compose exec redis redis-cli

# Dans redis-cli:
KEYS *           # Liste toutes les clés
GET key          # Récupérer valeur
DEL key          # Supprimer clé
FLUSHALL         # Vider tout le cache (DANGER!)
INFO             # Infos serveur
QUIT             # Quitter
```

### **Git**

```bash
# Statut
git status
git log --oneline -10

# Commit
git add .
git commit -m "Core: Ajout service users avec RBAC"

# Push
git push origin main

# Branches
git branch
git checkout -b feature/notifications
git checkout main

# Voir diff
git diff
git diff --staged

# Annuler modifications
git restore fichier.py
git restore --staged fichier.py
```

---

## 🚀 **PROCHAINES ÉTAPES - ROADMAP DÉTAILLÉE**

### **PHASE ACTUELLE : CORE SERVICES (0/25 - 0%)**

**Objectif** : Développer les 25 services CORE avant tout module métier

#### **🔴 Priorité 0 - CRITIQUES (6 services) - 8 semaines**

**Semaine 1-2 : Authentication & Security**
```
Objectif : Système d'authentification complet et sécurisé

Backend :
- [ ] Modèles : User (étendu avec password_hash, 2fa_secret, etc.)
- [ ] JWT : Access token (15min) + Refresh token (7j)
- [ ] 2FA : TOTP (via pyotp) + SMS (via Twilio/similaire)
- [ ] Password : bcrypt hash, politique complexité, reset via email
- [ ] Sessions : Gestion multi-device, force logout
- [ ] Rate limiting : 5 tentatives login / 15min
- [ ] API : /auth/login, /auth/logout, /auth/refresh, /auth/2fa/enable, /auth/2fa/verify
- [ ] Tests : 20+ tests (login success/fail, 2FA, tokens, etc.)

Frontend :
- [ ] Pages : Login, 2FA Setup, 2FA Verify, Reset Password
- [ ] Forms : Validation Zod (email, password strength)
- [ ] Store : authStore (Zustand) avec persist
- [ ] Protected routes : HOC requireAuth
- [ ] Token refresh : Axios interceptor auto-refresh
- [ ] Tests : 10+ tests composants

Livrables :
✅ Auth JWT complet fonctionnel
✅ 2FA TOTP opérationnel
✅ Frontend avec login/logout/2FA
✅ Tests >80% couverture
```

**Semaine 3-4 : Users, Roles, Permissions & Groups (RBAC)**
```
Objectif : Système RBAC complet pour gestion droits granulaires

Backend :
- [ ] Modèles : User, Role, Permission, Group
- [ ] Relations : Many-to-Many (User-Role, Role-Permission, User-Group)
- [ ] RoleService : assign_role, revoke_role, check_permission (avec cache Redis)
- [ ] Permissions : Format "module.action.scope" (ex: users.create.all)
- [ ] Décorateurs : @require_permission, @require_role
- [ ] Inheritance : Permissions héritées des groupes
- [ ] API : CRUD complet + assign/revoke
- [ ] Tests : 25+ tests (RBAC logic, cache, inheritance)

Frontend :
- [ ] Pages : Users list/details, Roles list/details, Permissions matrix
- [ ] Composants : RoleAssigner, PermissionChecker, GroupTree
- [ ] UI : DataTable avec filtrage + Grid cards
- [ ] Drawer : Create/Edit user/role/permission
- [ ] Tests : 15+ tests

Livrables :
✅ RBAC système complet
✅ Matrice permissions fonctionnelle
✅ Cache Redis pour perfs
✅ Frontend admin RBAC
```

**Semaine 5 : Notification System**
```
Objectif : Système notifications multi-canal centralisé

Backend :
- [ ] Modèles : Notification, NotificationTemplate, UserNotificationPreference
- [ ] NotificationService : send(user, type, data, channels)
- [ ] Canaux : in-app, email, SMS, push (future)
- [ ] Templates : Variables substitution {{user.name}}, {{action}}, etc.
- [ ] Préférences : Opt-in/opt-out par type, fréquence (immediate, digest)
- [ ] Queue : Celery pour envoi async
- [ ] API : /notifications (list, mark_read, delete)
- [ ] Tests : 15+ tests

Frontend :
- [ ] Composant : NotificationBell (header) avec badge compteur
- [ ] Panel : NotificationsList avec filtres (read/unread, type)
- [ ] Dropdown : Preview 5 dernières dans header
- [ ] Real-time : WebSocket ou polling (TanStack Query)
- [ ] Tests : 8+ tests

Livrables :
✅ Notifications in-app fonctionnelles
✅ Emails envoyés via queue
✅ Templates personnalisables
✅ Préférences utilisateur
```

**Semaine 6 : Translation/i18n Service**
```
Objectif : Support multi-langues complet (FR/EN/ES/PT)

Backend :
- [ ] Modèles : TranslationKey, Translation (key + lang + value)
- [ ] TranslationService : get(key, lang, fallback), set, import/export
- [ ] Cache : Redis pour traductions fréquentes
- [ ] Formats : Dates (date-fns), nombres, devises localisés
- [ ] API : CRUD traductions, import/export JSON/CSV
- [ ] Tests : 12+ tests

Frontend :
- [ ] Hook : useTranslation(key, params)
- [ ] Context : LanguageProvider avec state global
- [ ] Composant : LanguageSelector (dropdown dans header)
- [ ] Détection : Navigator.language auto-detect
- [ ] Storage : localStorage pour mémoriser choix
- [ ] Tests : 6+ tests

Livrables :
✅ Multi-langue FR/EN/ES/PT opérationnel
✅ Interface admin traductions
✅ Formats localisés (dates, nombres)
✅ Import/Export traductions
```

**Semaine 7 : Menu Manager**
```
Objectif : Navigation dynamique avec permissions

Backend :
- [ ] Modèles : Menu, MenuItem (hiérarchique, recursive)
- [ ] MenuService : get_menu_tree(user), check_access
- [ ] Permissions : Chaque menu a permissions requises
- [ ] Icons : Stockage icône Lucide name
- [ ] API : /menus/tree (retourne menu selon user permissions)
- [ ] Tests : 10+ tests

Frontend :
- [ ] Composant : Sidebar avec MenuGroup, MenuItem, CollapsibleMenuItem
- [ ] Navigation : Intégration TanStack Router
- [ ] Dynamic : Menus chargés depuis API selon permissions
- [ ] État : Collapse/expand mémorisé par user
- [ ] Tests : 8+ tests

Livrables :
✅ Sidebar dynamique opérationnelle
✅ Menus conditionnels selon permissions
✅ 3 groupes : Pilotage, Modules, Système
✅ État mémorisé
```

**Semaine 8 : Hook & Trigger System**
```
Objectif : Event bus pour automatisation inter-modules

Backend :
- [ ] Modèles : Hook, Trigger, TriggerAction
- [ ] HookService : register_hook, emit_event, subscribe
- [ ] Event bus : Publish/Subscribe pattern
- [ ] Actions : Send notification, Send email, Call webhook, Run script
- [ ] Conditions : If/then logic (field changed, value equals, etc.)
- [ ] Queue : Celery pour exécution async
- [ ] Logs : HookExecutionLog pour audit
- [ ] API : CRUD hooks/triggers
- [ ] Tests : 15+ tests

Frontend :
- [ ] Pages : Hooks list, Trigger builder
- [ ] Composant : TriggerBuilder (visual if/then)
- [ ] Tests : 6+ tests

Livrables :
✅ Event bus centralisé
✅ Hooks enregistrables par modules
✅ Triggers configurables (UI)
✅ Actions automatisées
```

---

#### **🟠 Priorité 1 - HAUTE (8 services) - 10 semaines**

**Semaines 9-10 : File Manager + Import/Export**
```
File Manager :
- [ ] Upload multi-fichiers, drag&drop
- [ ] Storage : Local (dev) + S3 (prod)
- [ ] Thumbnails : Images auto-générés
- [ ] Quotas : Par user/module
- [ ] Antivirus : ClamAV scan
- [ ] API : upload, download, delete, list

Import/Export :
- [ ] Formats : CSV, Excel, JSON
- [ ] Templates : Par entité
- [ ] Validation : Avant import
- [ ] Preview : Avant confirmation
- [ ] Queue : Celery pour gros fichiers
```

**Semaines 11-12 : Email Queue + Scheduler**
```
Email Queue :
- [ ] Templates : HTML responsive
- [ ] Variables : Substitution dynamique
- [ ] Queue : Celery avec retry
- [ ] Tracking : Sent, delivered, opened, bounced
- [ ] Throttling : Rate limiting

Scheduler (Cron) :
- [ ] Celery Beat integration
- [ ] UI : Cron expression builder
- [ ] Jobs : Liste tâches planifiées
- [ ] Monitoring : Succès/échecs
- [ ] Logs : Historique exécutions
```

**Semaines 13-14 : Audit Trail + API Manager**
```
Audit Trail :
- [ ] Logs immutables (append-only)
- [ ] Toutes actions utilisateur tracées
- [ ] Retention : 7 ans (compliance)
- [ ] Recherche : Full-text + filtres
- [ ] Export : Pour audit externe

API Manager :
- [ ] API Keys : Génération, révocation
- [ ] Rate limiting : Par key
- [ ] Swagger : Auto-généré FastAPI
- [ ] Versioning : /api/v1, /api/v2
- [ ] Docs : Interactive (Swagger UI)
```

**Semaines 15-16 : Webhooks + Calendar**
```
Webhooks :
- [ ] Envoi : POST vers URLs externes
- [ ] Signature : HMAC SHA256
- [ ] Retry : 3 tentatives exponentiel backoff
- [ ] Logs : Requests/responses
- [ ] UI : Configuration webhooks

Calendar/Events :
- [ ] Événements : Create, update, delete
- [ ] Récurrence : Daily, weekly, monthly
- [ ] Reminders : Notifications avant événement
- [ ] iCal : Export/import .ics
- [ ] UI : Calendrier mensuel/hebdo/jour
```

---

#### **🟡 Priorité 2 - MOYENNE (6 services) - 8 semaines**

**Semaines 17-18 : License + Module Manager**
```
License Manager :
- [ ] Licences : Par module
- [ ] Activation : Clé + serveur validation
- [ ] Expiration : Date fin, renouvellement
- [ ] Limitations : Users, features, volume
- [ ] UI : Gestion licences admin

Module Manager :
- [ ] Installation : ZIP upload
- [ ] Validation : Manifest.json check
- [ ] Compilation : Frontend + backend
- [ ] Activation/Désactivation : Sans redémarrage
- [ ] Updates : Version management
- [ ] Dépendances : Check avant install
```

**Semaines 19-20 : AI Service + Search Engine**
```
AI Service :
- [ ] Multi-provider : OpenAI, Anthropic, Mistral, Ollama
- [ ] Text : Génération, résumé, traduction
- [ ] Vision : OCR, classification images
- [ ] Embeddings : Semantic search
- [ ] Queue : Async processing
- [ ] UI : Playground pour tests

Search Engine :
- [ ] Full-text : PostgreSQL tsvector
- [ ] Indexation : Auto sur modèles
- [ ] Recherche : Multi-champs, fuzzy
- [ ] Facets : Filtres dynamiques
- [ ] Ranking : Pertinence scores
- [ ] UI : Search modal (Ctrl+K)
```

**Semaines 21-22 : Report Generator + Monitoring**
```
Report Generator :
- [ ] Templates : HTML/PDF
- [ ] Data : Depuis modules + queries custom
- [ ] Variables : Substitution dynamique
- [ ] Charts : Recharts intégré
- [ ] Export : PDF, Excel, CSV
- [ ] Scheduling : Génération auto

Monitoring :
- [ ] Health checks : /health endpoint
- [ ] Metrics : Prometheus format
- [ ] Logs : Centralisés (Loki/ELK)
- [ ] Alerts : Email/Slack si down
- [ ] Dashboard : Grafana integration
```

---

#### **🟢 Priorité 3 - BASSE (5 services) - 6 semaines**

**Semaines 23-24 : Config Manager + URL Shortener**
```
Config Manager :
- [ ] UI : Gestion settings key/value
- [ ] Types : String, number, bool, JSON, encrypted
- [ ] Validation : Rules par setting
- [ ] Historique : Modifications auditées
- [ ] Import/Export : Config complète

URL Shortener :
- [ ] Short links : /s/abc123
- [ ] Custom slugs : Personnalisables
- [ ] Tracking : Clicks, geo, devices
- [ ] QR codes : Auto-générés
- [ ] Expiration : Optionnelle
```

**Semaines 25-26 : Comment System + Version Control**
```
Comment/Note System :
- [ ] Commentaires : Sur n'importe quel objet
- [ ] Threads : Réponses imbriquées
- [ ] Mentions : @user notifications
- [ ] Attachments : Fichiers joints
- [ ] UI : Inline comments

Version Control (Documents) :
- [ ] Versions : Auto-sauvegarde modifications
- [ ] Diff : Comparaison versions
- [ ] Rollback : Restaurer version précédente
- [ ] Branches : Draft vs published
- [ ] UI : Timeline versions
```

**Semaines 27-28 : Workflow Engine**
```
Workflow Engine :
- [ ] States : Définition états entité
- [ ] Transitions : Règles passage état
- [ ] Approvals : Multi-niveaux
- [ ] Conditions : If/then logic
- [ ] Notifications : Auto sur changement état
- [ ] UI : Workflow builder visuel
- [ ] Logs : Historique transitions
```

---

### **RÉCAPITULATIF CORE SERVICES**

**Total : 25 services en 28 semaines (~7 mois)**

**Progression actuelle : 0/25 (0%)**

Une fois les 25 services CORE terminés → Développement modules métier.

---

## 💬 **COMMUNICATION AVEC L'UTILISATEUR**

### **Avant de commencer**

```
Je vais développer [Service X] selon CORE_SERVICES.md.

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

### **Pendant le développement**

- Signaler si ambiguïté dans specs
- Proposer alternatives si problème technique
- Montrer progression régulière

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

## 📞 **EN CAS DE PROBLÈME**

**L'IA DOIT :**

1. ❓ **NE PAS deviner** → DEMANDER clarification
2. 📖 **LIRE** docs/projet/CORE_SERVICES.md pour specs
3. 🔍 **VÉRIFIER** docs/projet/ROADMAP.md pour éviter doublons
4. 🧪 **TESTER** avant de committer
5. 🤔 **RÉFLÉCHIR** : Est-ce que cette approche est la meilleure ?

**L'IA NE DOIT PAS :**

1. ❌ Supposer ou assumer
2. ❌ Créer du code "au cas où" non demandé
3. ❌ Tourner en rond >15min sans demander
4. ❌ Ignorer les interdictions absolues
5. ❌ Commit du code cassé/incomplet

**Si bloqué :**
```
Je suis bloqué sur [problème X].

Contexte :
[Explication situation]

Options envisagées :
1. [Option A] - Avantages: ... / Inconvénients: ...
2. [Option B] - Avantages: ... / Inconvénients: ...

Quelle approche préfères-tu ? Ou as-tu une autre suggestion ?
```

---

## 🎓 **RESSOURCES & DOCUMENTATION**

### **Documentation officielle**

**Backend :**
- FastAPI : https://fastapi.tiangolo.com/
- SQLModel : https://sqlmodel.tiangolo.com/
- Alembic : https://alembic.sqlalchemy.org/
- Pydantic : https://docs.pydantic.dev/

**Frontend :**
- React : https://react.dev/
- Radix UI : https://www.radix-ui.com/primitives/docs/overview/introduction
- Tailwind CSS : https://tailwindcss.com/docs
- TanStack Query : https://tanstack.com/query/latest
- TanStack Router : https://tanstack.com/router/latest
- Zustand : https://zustand-demo.pmnd.rs/
- React Hook Form : https://react-hook-form.com/
- Zod : https://zod.dev/

**Outils :**
- Docker : https://docs.docker.com/
- PostgreSQL : https://www.postgresql.org/docs/
- Redis : https://redis.io/docs/

### **Design System références**

- Radix UI Themes : https://www.radix-ui.com/themes/docs/overview/getting-started
- Tailwind UI : https://tailwindui.com/ (inspiration, pas à copier)
- Linear App : https://linear.app (référence UX excellente)
- Notion : https://www.notion.so (référence pour Rédacteur module)

---

**FIN DU DOCUMENT CLAUDE.md**

---

**Version :** 4.0 - Architecture UI Complète  
**Dernière mise à jour :** 28 Octobre 2025  
**Maintenu par :** Équipe Dev OpsFlux  

Ce document est la **source de vérité absolue** pour le développement assisté par IA. Toute modification doit être documentée et versionnée.
