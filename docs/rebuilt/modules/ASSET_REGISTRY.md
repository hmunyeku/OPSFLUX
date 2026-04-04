# Asset Registry

## Rôle

Source de vérité sur la structure physique:

- champs
- sites
- installations
- équipements

## Fonctions

- hiérarchie des actifs
- fiches de détail
- capacités et contexte physique
- support de sélection d'actif pour les autres modules

## Dépendances

- Core pour auth, permissions, settings, audit
- Planner pour capacité / conflits
- PaxLog pour sites d'entrée
- TravelWiz pour destinations et départs
- PID/PFD pour rattachement technique

## Maturité

- `implemented` sur le socle de navigation et de gestion d'actifs
- `partial` sur certains raffinements de sous-modèles

## Risques / priorités

- garantir la cohérence des asset pickers partout
- éviter des référentiels physiques divergents dans les modules
