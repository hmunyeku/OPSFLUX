# Docker Operations - Règles Critiques

## ⚠️ RÈGLE ABSOLUE : Utiliser TOUJOURS l'API Dokploy

**JAMAIS exécuter des commandes Docker Compose directes sans le flag `-p` !**

### Pourquoi cette règle est CRITIQUE

Lorsqu'on exécute `docker compose build` ou `docker compose up` **SANS** le flag `-p` (project name), Docker Compose utilise le nom du répertoire courant comme nom de projet.

**Conséquence catastrophique** :
- Si exécuté depuis `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/`, Docker crée des containers nommés `code-*`
- Cela crée un **stack parallèle incomplet** qui entre en conflit avec le stack correct `perenco-opsflux-gwxapr-*`
- Les conteneurs peuvent servir du contenu corrompu ou obsolète
- Le routage Traefik peut pointer vers les mauvais containers

### Nom de projet CORRECT

```
perenco-opsflux-gwxapr
```

## ✅ Commandes CORRECTES

### Build
```bash
docker compose -p perenco-opsflux-gwxapr build SERVICE
docker compose -p perenco-opsflux-gwxapr build --no-cache SERVICE
```

### Deploy/Restart
```bash
docker compose -p perenco-opsflux-gwxapr up -d SERVICE
docker compose -p perenco-opsflux-gwxapr restart SERVICE
```

### Stop/Remove
```bash
docker compose -p perenco-opsflux-gwxapr down
docker compose -p perenco-opsflux-gwxapr stop SERVICE
```

### Logs
```bash
docker compose -p perenco-opsflux-gwxapr logs SERVICE
docker compose -p perenco-opsflux-gwxapr logs -f SERVICE
```

## 🚀 MÉTHODE PRÉFÉRÉE : API Dokploy

Au lieu d'utiliser les commandes Docker directes, **utiliser l'API Dokploy** :

### Configuration
```bash
# L'API key est dans .env
API_DOKPLOY=xxxxxx
```

### URL de l'API
```
http://72.60.188.156:3000/api
```

### Avantages
- ✅ Pas de risque d'erreur de nom de projet
- ✅ Gestion centralisée via Dokploy
- ✅ Logs et monitoring intégrés
- ✅ Déploiements cohérents et traçables

## 🔍 Vérification après opération

Après **CHAQUE** opération Docker, vérifier qu'aucun container indésirable n'existe :

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

**Containers attendus** (préfixe `perenco-opsflux-gwxapr-`) :
- `perenco-opsflux-gwxapr-frontend-1`
- `perenco-opsflux-gwxapr-backend-1`
- `perenco-opsflux-gwxapr-celery-worker-1`
- `perenco-opsflux-gwxapr-redis-1`
- `perenco-opsflux-gwxapr-adminer-1`

**Containers INTERDITS** (préfixe `code-`) :
- ❌ `code-frontend-1`
- ❌ `code-backend-1`
- ❌ Tout container avec préfixe `code-`

## 🔥 Nettoyage en cas de contamination

Si des containers `code-*` ont été créés par erreur :

```bash
# 1. Arrêter et supprimer les containers indésirables
docker compose -p code down

# 2. Supprimer les images orphelines
docker images | grep code | awk '{print $3}' | xargs -r docker rmi -f

# 3. Vérifier qu'ils sont bien supprimés
docker ps -a | grep code

# 4. Relancer le stack correct
docker compose -p perenco-opsflux-gwxapr up -d
```

## 📝 Historique des incidents

### 2025-10-20 - Création accidentelle du stack "code"
**Symptôme** : Erreurs Mixed Content et 401 Unauthorized persistantes malgré les corrections

**Cause racine** : Exécution de `docker compose build frontend` sans flag `-p`, créant un stack parallèle `code-*`

**Résolution** :
1. Arrêt des deux stacks (`code` et `perenco-opsflux-gwxapr`)
2. Rebuild avec le bon nom de projet : `docker compose -p perenco-opsflux-gwxapr build --no-cache frontend`
3. Redémarrage : `docker compose -p perenco-opsflux-gwxapr up -d`

**Leçon apprise** : Toujours utiliser l'API Dokploy ou le flag `-p` explicite

## 🎯 Checklist pour Claude AI

Avant chaque opération Docker :
- [ ] Ai-je l'API key Dokploy ? → Utiliser l'API
- [ ] Sinon, ai-je ajouté `-p perenco-opsflux-gwxapr` ?
- [ ] Après l'opération, ai-je vérifié `docker ps` ?
- [ ] Y a-t-il des containers `code-*` ? → Nettoyer immédiatement

## 📚 Références

- [Docker Compose Project Names](https://docs.docker.com/compose/reference/#use--p-to-specify-a-project-name)
- [Dokploy API Documentation](http://72.60.188.156:3000/api/docs)
- Configuration Claude : `.claude/settings.local.json` → section `dockerOperations`
