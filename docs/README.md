# 📚 Documentation OpsFlux

> **Version :** 4.0 - Architecture UI Complète
> **Dernière mise à jour :** 28 Octobre 2025

---

## 📂 Structure de la Documentation

```
docs/
├── instructions/       # Instructions pour développement assisté par IA
├── architecture/       # Documentation architecture système
├── deployment/         # Guides de déploiement et développement
└── archive/           # Anciens documents archivés
```

---

## 📖 Documentation par Catégorie

### 🤖 **Instructions Claude Code**
Fichiers d'instructions pour le développement assisté par IA (Claude Code).

- **[CLAUDE.md](instructions/CLAUDE.md)** - Instructions maître complètes
  - Autorisations et interdictions
  - Stack technique détaillée
  - Workflow de développement
  - 25 services CORE + 9 modules métier
  - Gestion Dokploy

- **[FRONTEND_RULES.md](instructions/FRONTEND_RULES.md)** - Spécifications App Shell
  - Architecture 5 zones (Header, Sidebar, Drawer, Zone Centrale, Footer)
  - Design System (Radix UI + Tailwind)
  - Principes UI/UX
  - Composants obligatoires

- **[FUNCTIONAL_RULES.md](instructions/FUNCTIONAL_RULES.md)** - Modules métier
  - 9 modules métier Oil & Gas
  - 25 services CORE système
  - Spécifications fonctionnelles détaillées

### 🏗️ **Architecture**
Documentation sur l'architecture système et les patterns utilisés.

- **[PERMISSIONS_SYSTEM.md](architecture/PERMISSIONS_SYSTEM.md)** - Système de permissions
- **[RBAC_ARCHITECTURE.md](architecture/RBAC_ARCHITECTURE.md)** - Architecture RBAC

### 🚀 **Déploiement**
Guides pour le déploiement et le développement local.

- **[DOCKER_OPERATIONS.md](deployment/DOCKER_OPERATIONS.md)** - Opérations Docker
- **[deployment.md](deployment/deployment.md)** - Guide de déploiement
- **[development.md](deployment/development.md)** - Guide de développement

### 📦 **Archive**
Documents historiques et analyses précédentes (conservés pour référence).

---

## 🎯 **Liens Rapides**

### Pour les Développeurs
- [Instructions Claude complètes](instructions/CLAUDE.md)
- [Guide développement local](deployment/development.md)
- [Architecture RBAC](architecture/RBAC_ARCHITECTURE.md)

### Pour le Déploiement
- [Opérations Docker](deployment/DOCKER_OPERATIONS.md)
- [Guide de déploiement](deployment/deployment.md)

### Pour la Conception
- [Spécifications Frontend](instructions/FRONTEND_RULES.md)
- [Spécifications Fonctionnelles](instructions/FUNCTIONAL_RULES.md)

---

## 🔧 **Stack Technique**

### Backend
- **Framework** : FastAPI 0.114+
- **ORM** : SQLModel 0.0.21
- **Database** : PostgreSQL 16
- **Cache** : Redis 7
- **Tasks** : Celery + Beat

### Frontend
- **Framework** : React 18.3 + TypeScript 5.3 + Vite 5.1
- **UI** : Radix UI (primitives headless) + Tailwind CSS 3.4+
- **Routing** : TanStack Router v1
- **State** : TanStack Query v5 + Zustand v4
- **Forms** : React Hook Form + Zod
- **Icons** : Lucide React

### Infrastructure
- **Containers** : Docker + Docker Compose
- **Orchestration** : Dokploy
- **Proxy** : Traefik
- **SSL** : Let's Encrypt

---

## 📝 **Conventions de Documentation**

### Format des Fichiers
- Tous les fichiers en **Markdown** (.md)
- Encodage **UTF-8**
- Line endings **LF** (Unix)

### Structure Recommandée
```markdown
# Titre Principal

> **Version :** X.X
> **Date :** JJ Mois AAAA

## Section 1
Contenu...

## Section 2
Contenu...
```

### Mise à Jour
- Toujours mettre à jour la date de modification
- Incrémenter la version si changement majeur
- Ajouter une note de changelog si pertinent

---

## 🆘 **Support**

Pour toute question ou problème :
- **Issues GitHub** : [OPSFLUX Issues](https://github.com/hmunyeku/OPSFLUX/issues)
- **Documentation Claude** : `.claude/instructions.md`

---

## 📄 **License**

Propriétaire - OpsFlux © 2024-2025
