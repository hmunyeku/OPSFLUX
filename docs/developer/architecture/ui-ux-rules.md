# 04 UI UX Rules

## 1. Constat actuel

Le frontend a déjà une base solide:

- tokens globaux dans `index.css`
- classes `gl-*`
- logique chrome app cohérente
- composants partagés

Mais il existe encore plusieurs incohérences:

- mélange entre tokens globaux et couleurs Tailwind codées en dur
- mélange entre classes `gl-*` et styles locaux improvisés
- palette trop variable selon les pages
- ombres et arrondis parfois incohérents
- usage dispersé de `dark:` au lieu de tokens sémantiques

Exemples observés dans le code actuel:

- `components/ui/Banner.tsx`: palettes locales multiples par variante
- `pages/workflow/WorkflowPage.tsx`: couleurs codées en dur par type
- `pages/conformite/ConformitePage.tsx`: badges et couleurs locales nombreuses
- `pages/conformite/ComplianceDashboard.tsx`: KPI colorées hors système commun
- `pages/asset-registry/AssetHierarchyTree.tsx`: mélange badges globaux et couleurs directes

## 2. Direction globale imposée

Le design system de référence doit rester:

- sobre
- dense
- opérationnel
- lisible en contexte industriel

Style retenu:

- base proche GitLab Pajamas / B2B opérationnel
- surfaces claires
- hiérarchie discrète
- couleur principalement informative, jamais décorative

## 3. Règles obligatoires

### 3.1 Couleurs

- utiliser d'abord les variables CSS et classes `gl-*`
- interdire les couleurs Tailwind codées en dur dans les écrans métier hors cas exceptionnel
- interdire une nouvelle palette locale par module

Palette sémantique commune:

- primaire: action principale
- success: succès / conforme / validé
- warning: attention / en attente / risque
- destructive: rejet / échec / incident
- neutral: état passif / archivé / brouillon

### 3.2 Statuts

Chaque statut métier doit avoir:

- un libellé métier stable
- une couleur stable dans tous les modules
- un badge stable dans tous les modules

Exemple:

- `draft` -> neutre
- `pending_*` -> warning
- `approved` / `validated` / `completed` -> success
- `rejected` / `cancelled` -> destructive
- `requires_review` -> info neutre renforcée

### 3.3 Typographie

- conserver la base `Inter`
- éviter les variations gratuites
- réserver la monospace aux codes, références, tags et données techniques

### 3.4 Espacement

- base 8 px
- éviter les densités différentes selon les modules
- tables, formulaires et panneaux doivent partager la même logique verticale

### 3.5 Conteneurs

- un seul modèle standard pour carte, panneau, section et toolbar
- pas d'ombre forte sur les écrans métier
- bordure d'abord, ombre ensuite si nécessaire

### 3.6 Formulaires

- labels toujours au-dessus
- aide et erreurs directement sous le champ
- actions de formulaire toujours au même endroit dans un module donné

### 3.7 Tables

- toolbar standardisée
- filtres lisibles
- colonnes statut et références toujours visibles
- actions groupées et prévisibles

### 3.8 Responsive

- mobile: consultation et actions courtes
- desktop: exploitation complète
- ne jamais cacher un statut critique uniquement sur mobile

## 4. Règles d'amélioration à inscrire pour tous les modules

1. Bannir toute nouvelle couleur brute de type `bg-red-500`, `text-blue-700`, `dark:bg-*` dans les pages métier si un token existe.
2. Remplacer progressivement les badges et bannières locaux par un set partagé.
3. Unifier les cartes KPI: même padding, même hiérarchie, même sémantique couleur.
4. Créer un référentiel unique de badges de statut.
5. Créer un composant commun pour les barres d'actions de liste.
6. Créer un composant commun pour les panneaux de détail.
7. Limiter les ombres aux overlays, menus, popovers et modales.
8. Éviter la logique couleur par module; préférer la logique couleur par signification.

## 5. Contrôle qualité UI

Avant de valider un écran:

1. suit-il les tokens globaux
2. suit-il les badges de statut communs
3. suit-il les composants partagés
4. reste-t-il lisible sans couleur
5. reste-t-il utilisable sur 1366 px et sur mobile

## 6. Priorité UI immédiate

Appliquer d'abord ces règles à:

- PaxLog
- TravelWiz
- Conformité
- Planner

Parce que ce sont les modules les plus interdépendants et les plus sensibles au statut.

## 7. Règle spécifique Dashboard

Comme le Dashboard est un module à part entière et un socle transverse:

1. un widget n'est jamais purement décoratif
2. chaque widget doit déclarer sa source module et ses permissions
3. les dashboards de module doivent respecter les mêmes composants et tokens que les écrans métier
4. un insight critique doit pouvoir être compris sans ouvrir le module source
5. un insight ne doit jamais exposer une donnée que l'utilisateur ne peut pas lire dans le module source
