# Dashboard

## Rôle

Assembler et visualiser les informations utiles par rôle.

Le Dashboard est un **module à part entière**.
Il a son propre cycle de vie, ses permissions, ses objets et sa gouvernance.

## Fonctions

- widgets
- tableaux de bord
- vues personnalisées
- synthèses temps réel
- dashboards globaux
- dashboards par module
- onglets obligatoires
- onglets personnels
- insights filtrés par rôle et permission

## Dépendances

- tous les modules fournissent des données au dashboard
- Core fournit préférences, permissions et settings

## Principe d'architecture validé

Le Dashboard doit fonctionner sur deux niveaux:

1. **Dashboard global**
   - vue transverse de l'utilisateur
   - priorités, activité, alertes, synthèses multi-modules

2. **Dashboard de module**
   - chaque module peut embarquer sa propre instance de dashboard
   - exemples: PaxLog insights, Planner insights, TravelWiz insights
   - ces dashboards sont portés par le même socle technique, pas par des implémentations ad hoc

## Permissions et rôles

Le modèle retenu est:

- permissions fines pour widgets, tabs, dashboards, administration
- rôles forts pour l'usage métier courant

Autrement dit:

- un `DO`, un `LOG_BASE`, un `CHEF_PROJET` ou un `CDS` n'administre pas le dashboard via du code spécifique
- il reçoit un agrégat cohérent de permissions dashboard via son rôle fort

## Maturité

- `partial`

## Priorités

- fiabiliser les data providers
- normaliser les cartes KPI
- corriger le contrat frontend/backend
- rendre explicite le filtrage des dashboards de module par rôle fort et permission fine
