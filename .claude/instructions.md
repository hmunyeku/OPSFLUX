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
