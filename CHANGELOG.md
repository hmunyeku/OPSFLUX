# Changelog

## 2025-10-20 - Final Cache Invalidation Fix

### Fixed
- **Complete Browser Cache Invalidation**: Forcé la régénération de tous les fichiers JavaScript
  - Modifié `frontend/src/app/layout.tsx` (root layout) pour forcer nouveau BUILD_ID
  - Modifié `frontend/src/app/(dashboard)/layout.tsx` pour nouveau hash de dashboard layout
  - Nouveau BUILD_ID: `_uhRRiOnEs99x_gPAZaCx`
  - Nouveau hash dashboard layout: `layout-f03b4ae7ea682af7.js`
  - ✅ **Vérifié**: Aucune URL HTTP dans AUCUN fichier JavaScript sur le serveur
  - ✅ **Vérifié**: Le serveur sert uniquement du code propre avec URLs HTTPS

### Technical Details
- Les commentaires JavaScript sont supprimés pendant la compilation, donc ajouter un commentaire ne change pas le hash
- Seul un changement dans le code exécutable force Next.js à générer un nouveau hash
- Les deux layouts modifiés forcent le navigateur à télécharger de nouveaux fichiers
- Le problème était **UNIQUEMENT** le cache navigateur - le serveur était déjà propre

### Instructions pour les Utilisateurs
**IMPORTANT**: Pour voir la correction, les utilisateurs DOIVENT faire un Hard Refresh dans leur navigateur:
- **Windows/Linux**: `Ctrl + Shift + R` ou `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`
- **Ou**: Ouvrir DevTools (F12) → Onglet Network → Cocher "Disable cache" → Refresh

Sans hard refresh, le navigateur continuera d'utiliser les anciens fichiers JavaScript en cache.

## 2025-10-20 - Fix Docker Build with .dockerignore (Critical Fix)

### Fixed
- **Docker Build Copying Corrupted Build Artifacts**: CRITICAL fix - le container servait Dokploy au lieu d'OpsFlux
  - **Cause racine**: Le Dockerfile `COPY . .` copiait le dossier local `.next/` corrompu dans l'image Docker
  - **Symptôme**: Le container servait la page de login Dokploy au lieu de l'application OpsFlux
  - **Solution**: Ajout de `frontend/.dockerignore` pour exclure `.next/`, `node_modules/`, etc.
  - Le rebuild sans cache avec `.dockerignore` résout définitivement le problème
  - ✅ **Vérifié**: `https://app.opsflux.io` sert maintenant correctement OpsFlux

- **Mixed Content Errors**: Résolu les erreurs "Mixed Content" où le navigateur bloquait les requêtes HTTP vers `http://api.opsflux.io` depuis la page HTTPS
  - Cause: Ancienne image Docker contenant des URLs HTTP codées en dur dans le JavaScript buildé
  - Solution: Rebuild complet du frontend sans cache pour régénérer le JavaScript avec les URLs HTTPS correctes
  - Les URLs sont maintenant toutes en HTTPS (`https://api.opsflux.io`)

- **Client-Side Rendering**: Forcé le rendu côté client pour le dashboard
  - Ajout de `"use client"` dans `frontend/src/app/(dashboard)/layout.tsx`
  - Permet l'accès à `localStorage` pour les tokens d'authentification
  - Résout les erreurs 401 Unauthorized sur tous les endpoints API

### Added
- **frontend/.dockerignore**: Fichier critique pour prévenir la copie d'artifacts de build
  - Exclut `.next/` (build Next.js)
  - Exclut `node_modules/` (dépendances)
  - Exclut les fichiers d'environnement, IDE, OS, etc.
  - Docker ne respecte PAS `.gitignore` - `.dockerignore` est obligatoire

### Changed
- Frontend en mode production
  - Temps de démarrage: 125-138ms (vs 2+ secondes en dev)
  - Plus de compilation à chaque requête
  - Pages pré-renderisées en mode statique (○)

### Technical Details
- **Docker COPY behavior**: `COPY . .` copie TOUT dans le contexte, `.gitignore` n'est PAS respecté
- **Multi-stage builds**: Un `COPY . .` après `RUN npm run build` peut écraser le build frais
- Next.js remplace `process.env.NEXT_PUBLIC_*` au moment du BUILD, pas au runtime
- Le `NEXT_PUBLIC_API_URL` doit être passé comme build arg dans le Dockerfile (déjà configuré)
- Les variables d'environnement NEXT_PUBLIC_* sont inlinées dans le JavaScript buildé
- Une ancienne image Docker peut contenir des URLs obsolètes même si le code source est correct

### How to Rebuild Frontend
```bash
# Arrêter et supprimer le container frontend
docker compose stop frontend
docker compose rm -f frontend

# Supprimer l'ancienne image
docker rmi opsflux-frontend:latest

# Rebuilder sans cache
docker compose build --no-cache frontend

# Redémarrer
docker compose up -d frontend
```

### Browser Cache
Après un rebuild, les utilisateurs doivent faire un hard refresh pour télécharger le nouveau JavaScript:
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`
- Ou: DevTools (F12) → Network → Cocher "Disable cache" → Refresh
