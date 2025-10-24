# Module Third Parties - Backend

## Enregistrement des widgets

Pour que les widgets de ce module soient disponibles dans les dashboards, vous devez les enregistrer dans la base de données.

### Méthode 1 : Utilisation du script d'enregistrement

```bash
# Depuis le conteneur backend
docker exec -it opsflux-backend python backend/scripts/register_module_widgets.py third-parties
```

Le script va automatiquement chercher le fichier `widgets.json` dans `modules/third-parties/backend/` et enregistrer tous les widgets dans la table `widget`.

### Méthode 2 : Fichier JSON personnalisé

Si vous avez un fichier JSON ailleurs :

```bash
docker exec -it opsflux-backend python backend/scripts/register_module_widgets.py third-parties /path/to/widgets.json
```

### Format du fichier `widgets.json`

Chaque widget doit avoir la structure suivante :

```json
{
  "widget_type": "third_parties_stats_overview",
  "name": "Aperçu Statistiques Tiers",
  "description": "Statistiques globales des entreprises et contacts",
  "module_name": "third-parties",
  "category": "stats",
  "icon": "chart-bar",
  "required_permission": "third_parties:read",
  "is_active": true,
  "default_config": {
    "showCompanies": true,
    "showContacts": true
  },
  "default_size": {
    "w": 6,
    "h": 2,
    "minW": 4,
    "minH": 2,
    "maxW": 12,
    "maxH": 3
  }
}
```

### Champs importants

- **widget_type** : Identifiant unique du widget (format: `module_type_name`)
- **name** : Nom d'affichage du widget
- **module_name** : Code du module (doit correspondre au nom du dossier)
- **required_permission** : Permission requise pour utiliser le widget (optionnel)
- **category** : Catégorie du widget (`stats`, `charts`, `lists`, `analytics`, etc.)

### Permissions

Les widgets de ce module nécessitent la permission `third_parties:read`. Seuls les utilisateurs ayant cette permission pourront :
- Voir ces widgets dans le catalogue
- Les ajouter à leurs dashboards
- Les configurer

### Mise à jour des widgets

Le script détecte automatiquement si un widget existe déjà (basé sur `widget_type`) et le met à jour au lieu de créer un doublon.

Pour mettre à jour tous les widgets après une modification du `widgets.json` :

```bash
docker exec -it opsflux-backend python backend/scripts/register_module_widgets.py third-parties
```

## Développement

### Ajouter un nouveau widget

1. Créer le composant React dans `frontend/widgets/`
2. L'ajouter au registry dans `frontend/widgets/registry.ts`
3. Ajouter la définition dans `backend/widgets.json`
4. Exécuter le script d'enregistrement

### Supprimer un widget

1. Retirer le composant et sa définition du registry frontend
2. Mettre `is_active: false` dans le `widgets.json`
3. Exécuter le script d'enregistrement

Le widget ne sera plus visible dans le catalogue mais les instances existantes dans les dashboards continueront de fonctionner.

## Vérification

Pour vérifier que les widgets sont bien enregistrés :

```bash
# Connexion au conteneur
docker exec -it opsflux-backend bash

# Ouvrir psql
psql -U opsflux -d opsflux

# Lister les widgets du module
SELECT widget_type, name, is_active, required_permission
FROM widget
WHERE module_name = 'third-parties';
```
