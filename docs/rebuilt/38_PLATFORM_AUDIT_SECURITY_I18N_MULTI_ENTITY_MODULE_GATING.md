# Audit Plateforme — Sécurité, Traduction, Multi-entité, Gating Modules

Date: 10 avril 2026

## Portée

Audit transversal du socle OpsFlux avec focus sur:
- sécurité applicative et exposition fonctionnelle
- qualité de traduction / cohérence métier
- isolation multi-entité
- gating par permissions, onglets, widgets et modules

## État au 10 avril 2026

### Fermé dans cette tranche

- lifecycle module entity-scoped avec activation/désactivation pilotable
- blocage backend des principaux routeurs module quand le module est désactivé
- blocage frontend:
  - sidebar
  - accès direct par URL
  - cross-module links
  - previews
  - tabs et widgets dashboard
- purge/sanitation des widgets d’un module désactivé dans les dashboards stockés
- vérification des dépendances de modules avant activation/désactivation
- création utilisateur avec rattachement entité réellement opérationnel
- revalidation du contexte entité côté frontend et purge des caches sensibles au switch d’entité
- scoping React Query par entité sur les hooks critiques:
  - dashboard
  - RBAC
  - modules
  - users
- durcissement multi-entité backend sur:
  - search globale
  - preview
  - users
  - admin users
  - groups
- garde permission explicite sur les templates email admin
- durcissement du SQL runner admin
- harmonisation d’une partie importante des libellés métier visibles:
  - `AdS = Avis de séjour`
  - `AVM = Avis de mission`
  - `Papyrus` en façade produit

### Résiduel réel

- il reste des wrappers legacy et des alias techniques, surtout pour compatibilité
- certaines surfaces core non métiers peuvent encore nécessiter une revue de scope fine
- des commentaires, docs techniques et noms de fichiers gardent encore des graphies legacy
- la traduction produit est beaucoup plus propre, mais pas encore totalement homogène écran par écran

## Constats clés

### 1. Gating module incomplet

Constat:
- Le runtime charge tous les modules au démarrage via [main.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/main.py).
- La navigation frontend était encore majoritairement hardcodée dans [Sidebar.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/components/layout/Sidebar.tsx).
- Les dashboards pouvaient continuer à exposer des tabs/widgets d’un module même si on voulait le retirer.

Impact:
- impossibilité de désactiver proprement un module par entité
- surface fonctionnelle encore visible alors que le module doit être coupé
- risque de confusion produit et de gating incomplet

Action lancée:
- ajout d’un socle de lifecycle module:
  - [module_lifecycle_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/core/module_lifecycle_service.py)
  - [modules.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/modules.py)
  - [ModulesTab.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/pages/settings/tabs/ModulesTab.tsx)
- filtrage du catalogue widgets et des tabs dashboard dans [dashboard.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/dashboard.py)
- masquage sidebar côté frontend

Résiduel:
- le blocage n’est pas encore un middleware unique global
- il reste une surveillance à maintenir pour tout nouveau routeur ajouté

### 2. Mismatch de slug module

Constat:
- plusieurs slugs visibles n’étaient pas alignés avec les manifests backend:
  - `asset-registry` vs `asset_registry`
  - `pid-pfd` vs `pid_pfd`
  - legacy `report_editor` / `report-editor` vs `papyrus`

Impact:
- filtrage incohérent
- widgets/tabs potentiellement mal résolus
- risque de permissions et de masquage partiellement contournés

Action menée:
- normalisation des slugs dans le lifecycle module
- correction sidebar sur les cas visibles

### 3. Affectation utilisateur à l’entité incohérente à la création

Constat:
- la création utilisateur dans [users.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/users.py) ne suivait pas la même logique que l’affectation manuelle à une entité
- si l’entité cible n’avait pas de groupe exploitable, l’utilisateur pouvait être créé avec `default_entity_id` mais sans vraie appartenance opérationnelle

Impact:
- utilisateur créé mais mal rattaché
- permissions et visibilité potentiellement incorrectes

Action menée:
- unification de la logique d’assignation via helper commun dans [users.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/users.py)

### 4. Gating dashboard/widget encore trop orienté frontend

Constat:
- avant correction, `ModuleDashboard` et le catalogue widgets ne tenaient pas compte de l’état réel des modules
- un widget pouvait rester demandé même si son module devait être désactivé

Impact:
- exposition visuelle persistante
- erreurs ou incohérences runtime

Action menée:
- filtrage catalogue, tabs et `widget-data` dans [dashboard.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/dashboard.py)

### 5. Multi-entité: dette transversale encore présente

Constat:
- une partie du code travaille proprement avec `entity_id`
- mais l’isolement repose encore beaucoup sur des conventions distribuées, pas sur une couche unique de garde
- présence de chemins utilisant `default_entity_id` comme pivot implicite dans plusieurs flux utilisateurs

Impact:
- risque de comportement ambigu si l’utilisateur appartient à plusieurs entités
- risque de régression silencieuse dès qu’un nouvel endpoint oublie le filtre d’entité

Corrections déjà menées:
- routes utilisateurs et sous-modèles utilisateur principaux
- dashboards personnalisés
- previews et search globale
- groupes et admin users

Résiduel:
- poursuivre la revue sur certains endpoints core transverses
- maintenir le réflexe de scoping explicite sur toute nouvelle route

### 6. Traduction et vocabulaire métier encore hétérogènes

Constat:
- coexistence de libellés FR/EN partiels
- restes de legacy métier:
  - `AdS` anciennement interprété comme `Autorisation de sortie`
  - `AVM` parfois affiché de manière générique
- présence de labels mixtes ou descriptions techniques exposées côté UI

Impact:
- confusion utilisateur
- baisse de qualité produit
- risque de mauvaise interprétation métier

Déjà corrigé partiellement:
- `AdS = Avis de séjour`
- `AVM = Avis de mission`
- plusieurs libellés PaxLog et PDF

Résiduel:
- audit écran par écran encore utile sur quelques zones secondaires
- docs techniques et commentaires encore hétérogènes

### 7. Sécurité produit: zones à revoir demain

Points de vigilance restants:
- certaines routes core non directement rattachées à un module peuvent encore mériter une revue de permission plus fine
- surface admin toujours large par nature, même si plusieurs garde-fous ont été ajoutés
- settings sensibles masqués côté lecture, mais les intégrations doivent rester revues au cas par cas

## Prochaines corrections utiles

1. Passer les écrans secondaires pour homogénéiser complètement les traductions métier.
2. Refaire un passage sécurité ciblé sur les routes core restantes non métier.
3. Vérifier la cohérence permission-gating sur:
   - tabs
   - widgets
   - navigation
   - actions inline
   - endpoints admin
4. Nettoyer progressivement les slugs legacy restants et les alias devenus inutiles.

## Livrables déjà démarrés

- lifecycle module:
  [module_lifecycle_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/core/module_lifecycle_service.py)
- API modules:
  [modules.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/modules.py)
- pilotage admin:
  [ModulesTab.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/pages/settings/tabs/ModulesTab.tsx)
- filtrage dashboard:
  [dashboard.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/core/dashboard.py)
- filtrage navigation:
  [Sidebar.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/components/layout/Sidebar.tsx)
