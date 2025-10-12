# Instructions Claude pour OPSFLUX

## Gestion Docker via API Dokploy

**IMPORTANT** : Pour toutes les opérations Docker (déploiement, logs, statut), utiliser l'API Dokploy au lieu des commandes docker directes.

### Configuration API Dokploy

Les informations de connexion sont dans le fichier `.env` :

```bash
API_DOKPLOY=gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH
API_DOKPLOY_URL=http://72.60.188.156:3000/api
```

### Identifiants du projet

- **Compose ID** : `Qpqupqv463w7wf09fwVxS`
- **Project Name** : `perenco-opsflux-gwxapr`

### Commandes API courantes

#### 1. Redéployer l'application

```bash
curl -s -X POST "http://72.60.188.156:3000/api/trpc/compose.redeploy?batch=1" \
  -H "x-api-key: gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"composeId":"Qpqupqv463w7wf09fwVxS"}}}'
```

#### 2. Obtenir les informations du compose

```bash
curl -s -X GET "http://72.60.188.156:3000/api/trpc/compose.one?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22composeId%22%3A%22Qpqupqv463w7wf09fwVxS%22%7D%7D%7D" \
  -H "x-api-key: gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH"
```

#### 3. Lister tous les projets

```bash
curl -s -X GET "http://72.60.188.156:3000/api/trpc/project.all?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D" \
  -H "x-api-key: gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH"
```

#### 4. Lister toutes les applications

```bash
curl -s "http://72.60.188.156:3000/api/trpc/application.all?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D" \
  -H "x-api-key: gsIKFgoRtFXpREBKlIQxFOnzffNFWCmVnhmyQKLCeXQfSfzjVboTXOtcRmlyOvaH"
```

### Workflow de déploiement recommandé

Après un push Git, Dokploy auto-déploie via webhook. Pour vérifier :

1. **Attendre le déploiement auto** (20-30 secondes après push)
2. **Vérifier les containers** :
   ```bash
   docker ps --filter "name=perenco-opsflux-gwxapr"
   ```
3. **Vérifier l'image** :
   ```bash
   docker inspect perenco-opsflux-gwxapr-frontend-1 --format '{{.Image}}'
   ```
4. **Vérifier HTTP** :
   ```bash
   curl -s -I https://app.opsflux.io | head -5
   ```

### Logs

Les logs Dokploy sont dans :
- `/etc/dokploy/logs/perenco-opsflux-gwxapr/`
- Fichier format : `perenco-opsflux-gwxapr-YYYY-MM-DD:HH:MM:SS.log`

### Commandes Docker autorisées

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

## Auto-déploiement

Le projet est configuré avec webhook GitHub → Dokploy :
- Push sur `master` → build + deploy automatique
- Logs disponibles via Dokploy UI ou fichiers logs
- Pas besoin de déclencher manuellement le déploiement

## Domaines

- **Frontend** : https://app.opsflux.io
- **Backend** : https://api.opsflux.io
- **Adminer** : https://adminer.opsflux.io

## Stack technique

- **Backend** : FastAPI + PostgreSQL
- **Frontend** : React 18 + TypeScript + Vite + shadcn/ui + TanStack Router
- **Deployment** : Dokploy (Docker Compose + Traefik)
- **Database** : PostgreSQL 17

## Mode autonome - Directives de décision

**MODE ACTIVÉ** : Claude est configuré en mode autonome complet pour travailler sans interruption.

### Principes de décision prioritaires (par ordre)

1. **ROBUSTESSE** : Prioriser les solutions stables et testées
   - Ajouter la gestion d'erreurs complète
   - Valider toutes les entrées utilisateur
   - Implémenter des fallbacks et retry logic
   - Tester les cas limites

2. **PROFESSIONNALISME** : Code de qualité production
   - Code propre et bien structuré
   - Respect des conventions et standards
   - Documentation inline pour la complexité
   - Logs appropriés pour le debugging

3. **ERGONOMIE** : Expérience utilisateur optimale
   - Interface intuitive et responsive
   - Feedback visuel immédiat
   - Messages d'erreur clairs et actionnables
   - Loading states et animations fluides

4. **VISIBILITÉ D'UTILISATION** : Clarté des actions
   - Indicateurs de statut visibles
   - Historique et traçabilité
   - Notifications pertinentes
   - Tableaux de bord informatifs

5. **INTUITIVITÉ** : Facilité d'utilisation
   - Workflow naturel
   - Minimiser les étapes
   - Labels et instructions clairs
   - Patterns UI familiers

6. **SÉCURITÉ** : Protection des données
   - Authentification robuste
   - Autorisation granulaire
   - Sanitization des entrées
   - Protection CSRF/XSS

7. **MAINTENABILITÉ** : Code évolutif
   - Architecture modulaire
   - Séparation des responsabilités
   - Types stricts (TypeScript/Pydantic)
   - Tests unitaires si pertinent

### Règles d'autonomie

**À FAIRE SANS DEMANDER** :
- Choisir les meilleures pratiques et patterns
- Ajouter la validation et gestion d'erreurs
- Implémenter les fonctionnalités complètes (pas de stubs)
- Créer/modifier les fichiers nécessaires
- Installer les dépendances manquantes
- Fixer les bugs rencontrés
- Optimiser les performances
- Améliorer l'UX/UI
- Ajouter les tests si nécessaire
- Documenter le code complexe
- Commit et push après chaque fonctionnalité stable

**TECHNOLOGIES ET COMMANDES AUTORISÉES** :
- Toutes commandes Bash, Python, Node.js, npm, pip
- curl, wget pour les requêtes HTTP
- git pour la gestion de version
- docker (lecture seule : ps, logs, inspect)
- Édition de tous fichiers du projet
- Création de nouveaux fichiers/modules
- Installation de packages (npm, pip)

**CHOIX TECHNOLOGIQUES PAR DÉFAUT** :
- **Frontend** : React 18 + TypeScript + shadcn/ui + TanStack Query + TanStack Router
- **Backend** : FastAPI + Pydantic V2 + SQLModel
- **Styling** : Tailwind CSS + shadcn/ui components
- **State** : TanStack Query pour server state, useState/useReducer pour local
- **Forms** : React Hook Form + Zod
- **Icons** : lucide-react
- **Dates** : date-fns
- **HTTP** : fetch API avec error handling

**EN CAS DE DOUTE** :
- Choisir la solution la plus robuste et professionnelle
- Privilégier la cohérence avec l'existant
- Documenter les choix importants en commentaire
- Ajouter des TODO pour les améliorations futures
