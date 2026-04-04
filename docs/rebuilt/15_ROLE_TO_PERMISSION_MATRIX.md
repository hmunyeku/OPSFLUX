# 15 Role To Permission Matrix

Date: 2026-04-03

## 1. Objet

Cette matrice relie les rôles forts métier aux permissions fines techniques.

Règle:

- le rôle fort structure l'expérience
- la permission fine autorise l'action réelle

## 2. Rôles forts cibles

- `demandeur`
- `valideur_conformite`
- `chef_projet`
- `superviseur_mouvement`
- `log_base`
- `ops_terrain`
- `admin_module`
- `platform_admin`

## 3. Matrice

### Demandeur

Permissions minimales:

- `paxlog.ads.read`
- `paxlog.ads.create`
- `paxlog.ads.update` sur ses dossiers
- `paxlog.avm.read`
- `paxlog.avm.create`
- `paxlog.avm.update` sur ses dossiers
- `conformite.check` si affichage d'indicateurs personnels

### Valideur conformité

Permissions minimales:

- `paxlog.ads.read`
- `paxlog.ads.update`
- `conformite.record.read`
- `conformite.record.update`
- `conformite.check`

### Chef projet

Permissions minimales:

- `project.read`
- `project.update`
- `planner.activity.read`
- `planner.activity.update`
- `planner.conflict.read`
- `paxlog.ads.read`

### Superviseur mouvement

Permissions minimales:

- `paxlog.ads.read`
- `paxlog.ads.update`
- `travelwiz.voyage.read`
- `travelwiz.manifest.read`
- `travelwiz.cargo.read`

### Log base

Permissions minimales:

- `travelwiz.voyage.read`
- `travelwiz.voyage.update`
- `travelwiz.manifest.read`
- `travelwiz.manifest.update`
- `travelwiz.cargo.read`
- `travelwiz.cargo.update`

### Ops terrain

Permissions minimales:

- permissions dédiées portail terrain en lecture et actions basiques seulement

### Admin module

Permissions minimales:

- toutes les permissions du module administré

### Platform admin

Permissions minimales:

- sécurité
- settings
- RBAC
- dashboards admin
- supervision transverse

## 4. Règle d'implémentation

Chaque rôle fort doit être matérialisé par un ou plusieurs groupes/rôles RBAC réels.
La matrice exacte devra être synchronisée avec les manifests des modules.
