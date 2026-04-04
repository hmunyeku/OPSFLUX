# 10 Org And Asset Model Audit

Date: 2026-04-03

## 1. Réponse courte

Non, pas encore complètement.

Le sujet est plus clair côté hiérarchie physique des actifs que côté gouvernance organisationnelle.

En pratique:

- `entité` existe et est bien ancrée dans le modèle
- `business unit` existe mais reste encore insuffisamment explicitée comme scope fonctionnel
- la hiérarchie `champ -> site -> installation -> équipement -> pipeline` est globalement claire
- la doctrine complète de relation entre organisation, actifs, permissions, dashboards et modules n'est pas encore assez formalisée

## 2. Ce qui est clair

## 2.1 Entité

L'entité est une vraie brique structurante du Core:

- contexte actif
- scoping des données
- settings
- notifications
- workflows
- dashboards

Le modèle `Entity` existe bien avec:

- parent / children
- business units
- cost centers

Conclusion:

- l'entité est bien pensée comme périmètre d'exploitation principal
- mais la doctrine d'usage produit n'est pas encore complètement écrite

## 2.2 Business Unit

Le modèle `BusinessUnit` existe clairement dans `common.py`.
On voit aussi l'usage de `bu_id` dans:

- Dashboard
- Report Editor
- PID/PFD

Donc la BU n'est pas théorique.

Mais ce qui n'est pas encore assez explicite:

- quand la BU est seulement un axe de filtrage
- quand elle devient un vrai scope d'autorisation
- si un utilisateur appartient à une seule BU active ou à plusieurs
- si la BU pilote les dashboards par défaut
- si la BU pilote les workflows ou seulement les vues

Conclusion:

- la BU existe dans le data model
- sa doctrine métier transverse n'est pas encore assez claire

## 2.3 Hiérarchie d'actifs

Le module Asset Registry est le plus clair des trois sujets.

La hiérarchie est visible dans le code et l'UI:

- champs
- sites
- installations
- équipements
- pipelines

Elle est aussi utilisée dans les autres modules:

- PaxLog pointe vers des `ar_installations` pour les sites d'entrée / séjour
- Planner travaille sur `asset_id` liés aux installations
- TravelWiz utilise des actifs comme destinations, arrêts et points météo
- PID/PFD rattache équipements et lignes aux actifs

Conclusion:

- la hiérarchie physique est réelle et cohérente
- elle est déjà une source de vérité transverse

## 3. Ce qui n'est pas encore assez clair

## 3.1 Entité vs BU vs actif

C'est le plus gros angle mort documentaire.

Aujourd'hui, il manque une doctrine simple répondant à ces questions:

- une entité exploite-t-elle plusieurs champs ?
- une BU est-elle transverse à plusieurs actifs ou rattachée à un sous-périmètre ?
- un actif appartient-il toujours à une seule entité ?
- peut-on avoir des dashboards, permissions ou workflows à scope actif ?
- quel est le lien officiel entre BU et actif ?

Tant que cela n'est pas écrit, plusieurs implémentations peuvent dériver.

## 3.2 Niveau de référence officiel

Il faut définir ce qui est la vraie clé de référence selon le domaine:

- organisation: `entity_id`
- exploitation terrain: `asset_id`
- production documentaire / reporting: `bu_id` éventuellement

Aujourd'hui cela existe implicitement, mais pas encore comme doctrine explicite.

## 3.3 Pipelines

Le pipeline existe bien dans l'Asset Registry, avec:

- identifiant pipeline
- installation source
- installation destination

Mais il reste encore à clarifier fonctionnellement:

- est-ce un actif physique de premier rang ou un sous-objet réseau ?
- quelles fonctionnalités l'utilisent réellement au-delà du référentiel ?
- quel est son rôle dans Planner, incidents, inspections, conformité, documentation ?

Conclusion:

- le pipeline est modélisé
- son rôle transverse n'est pas encore assez explicité

## 4. Qualité du modèle actif

## 4.1 Points solides

- hiérarchie visible et exploitable en UI
- asset pickers utilisés dans plusieurs modules
- relations installation / équipement / pipeline bien présentes
- dashboards et cartes déjà envisagés

## 4.2 Points à améliorer

- mieux distinguer `site` et `installation` dans la documentation métier
- expliciter la différence entre actif de destination et site opérationnel
- définir le statut métier de chaque niveau de hiérarchie
- définir quels modules ont le droit de créer / modifier quel niveau

## 5. Questions qui doivent devenir des règles

## 5.1 Entité

Il faut écrire clairement:

- une entité représente quoi dans votre organisation réelle
- une entité peut avoir des BU, cost centers, utilisateurs, actifs
- tout objet métier appartient à une entité sauf cas explicitement global

## 5.2 Business Unit

Il faut écrire clairement:

- BU = axe de responsabilité, axe financier, axe reporting, ou axe opérationnel
- impact sur permissions
- impact sur dashboards
- impact sur workflows
- impact sur documents

## 5.3 Actifs

Il faut écrire clairement:

- `champ` = regroupement physique haut niveau
- `site` = zone opérationnelle
- `installation` = lieu technique exploitable par les modules métier
- `équipement` = composant technique
- `pipeline` = relation physique / réseau entre installations

Et surtout:

- quel niveau doit être utilisé comme référence dans chaque module

## 6. Règle cible recommandée

La doctrine la plus propre pour OpsFlux serait:

- `entity` = périmètre juridique / exploitation / sécurité / configuration
- `business_unit` = périmètre de pilotage, responsabilité ou reporting interne
- `asset` = périmètre physique d'exécution

Et donc:

- les permissions sont d'abord résolues à l'échelle entité
- les vues et dashboards peuvent être affinés par BU
- les opérations terrain se font toujours sur un actif

## 7. Application par module

### PaxLog

- scope principal: entité
- contexte opérationnel: installation / site
- filtres additionnels possibles: BU / projet

### Planner

- scope principal: entité
- référence opérationnelle: installation
- arbitrage transversal: projet + actif

### TravelWiz

- scope principal: entité
- exécution opérationnelle: installation / destination asset / stops

### Dashboard

- scope d'accès: entité + rôle + éventuellement BU
- scope de données: dépend des widgets

### Report Editor / PID/PFD

- scope principal: entité
- classification complémentaire: BU
- rattachement technique éventuel: actif

## 8. Verdict final

La hiérarchie d'actifs est déjà plutôt claire.
La couche `entité / BU / scope` ne l'est pas encore assez.

En pratique:

- `asset registry` est déjà proche d'une source de vérité crédible
- `entity` est une brique Core réelle
- `business unit` reste encore sous-définie fonctionnellement

Le prochain document à produire pour éliminer cette ambiguïté est:

- une cartographie officielle `Entity / BU / Asset / Project / Role`
- avec règles de rattachement, visibilité, filtrage et ownership
