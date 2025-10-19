# Docker Compose Configurations

Ce dossier contient les configurations Docker Compose alternatives et spécifiques.

## Fichiers

### `docker-compose.dokploy.yml`
Configuration spécifique pour le déploiement avec Dokploy.

### `docker-compose.override.yml`
Fichier d'override pour les configurations locales de développement.
Ce fichier permet de surcharger certaines configurations du `docker-compose.yml` principal sans le modifier.

### `docker-compose.traefik.yml`
Configuration Traefik pour le reverse proxy et la gestion SSL/TLS.

## Utilisation

Le fichier principal `docker-compose.yml` se trouve à la racine du projet.

Pour utiliser un fichier de configuration spécifique :

```bash
# Avec Dokploy
docker-compose -f docker-compose.yml -f docker/docker-compose.dokploy.yml up

# Avec override local
docker-compose -f docker-compose.yml -f docker/docker-compose.override.yml up

# Avec Traefik
docker-compose -f docker-compose.yml -f docker/docker-compose.traefik.yml up
```

## Note

Le fichier `docker-compose.yml` principal reste à la racine du projet pour faciliter les commandes Docker Compose standard.
