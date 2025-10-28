# Spécifications Complètes : App Shell Professionnel React

Crée un app shell (coquille d'application) ultra-complet et professionnel pour une application web interne d'entreprise, optimisé pour la productivité et l'expérience utilisateur.

## 🎯 ARCHITECTURE GLOBALE

L'application est composée de 5 zones principales :
1. **Header Bar** (barre supérieure fixe)
2. **Sidebar** (barre latérale gauche collapsible)
3. **Drawer Contextuel** (panneau de formulaires glissant)
4. **Zone Centrale** (contenu principal)
5. **Footer Bar** (barre inférieure fixe)

---

## 📊 HEADER BAR (Barre Supérieure)

### Structure Générale
- **Hauteur fixe** : ~56-64px
- **Border bottom** subtile
- **Background** : Blanc (light) / Gris foncé (dark)
- **Z-index élevé** pour rester au-dessus

### Partie Gauche
- **Logo/Branding** : Logo cliquable de l'application
- **Bouton Menu Mobile** : Toggle sidebar sur mobile/tablet (≤1024px)
- **Bouton Maison** : Icône Home pour retour rapide à l'accueil
- **Breadcrumb Navigation** : Fil d'Ariane dynamique affichant le chemin de navigation (ex: Accueil > Logistique > Expéditions > Détails)
  - Chaque élément cliquable
  - Séparateurs avec chevrons
  - Adaptatif (truncate sur mobile)
  - Texte en gris, dernier élément en gras

### Partie Centre
- **Barre de Recherche Contextuelle** :
  - **COMPORTEMENT INTELLIGENT** : La recherche devient contextuelle selon la page active
  - Quand l'utilisateur est sur une page avec des données (liste, tableau, grid), la recherche filtre automatiquement les éléments de cette page en temps réel
  - Placeholder dynamique : "Rechercher dans [Nom du Module]..." ou "Rechercher globalement..." si page sans données
  - Icône loupe + raccourci clavier visible (Ctrl+K)
  - **Recherche Globale** : Sur pages sans données ou via modal (Ctrl+K)
  - **Recherche Locale/Filtre** : Sur pages avec données, filtre instantanément les résultats affichés
  - Debouncing 300ms pour performance
  - Clear button (X) pour effacer rapidement
  - Résultats en temps réel avec compteur : "24 résultats"
  - Pas de barre de recherche séparée dans les datatables/grids - tout passe par cette barre unique

### Indicateur de Chargement Asynchrone
- **Spinner** : Petit spinner circulaire à droite de la search bar pendant les opérations asynchrones courtes
- **Progress Bar** : Barre de progression fine (2-3px) sous tout le header pour opérations longues
  - Couleur primaire de l'app
  - Animation fluide (indeterminate ou determinate selon contexte)
  - Disparaît avec fade out à la fin
  - Plusieurs opérations = queue avec transitions

### Partie Droite
- **Bouton Options du Module Actif** :
  - Apparaît dynamiquement selon le menu sélectionné
  - Affiche les sous-menus/actions fréquentes du module actif
  - Dropdown avec icônes
  - Badge de compteur si nécessaire
  - Exemple : Sur "Expéditions" → Options : "Créer", "Exporter", "Statistiques"

- **Bouton Favoris/Marque-pages** (icône étoile) :
  - **Simple clic** : Ajoute la page actuelle aux favoris (toast de confirmation + animation)
  - **Double clic** : Ouvre modal avec tous les favoris enregistrés
    - Liste organisée par catégorie
    - Recherche dans les favoris
    - Suppression rapide (icône trash au hover)
    - Réorganisation par drag & drop
    - Édition du nom du favori

- **Bouton Assistant AI** (icône chat/robot) :
  - Ouvre un panneau latéral droit ou modal avec chatbot
  - Assistant de navigation contextuel
  - Aide à trouver des fonctionnalités
  - Suggestions intelligentes basées sur l'activité
  - Peut filtrer, créer, modifier via commandes

- **Bouton Notifications** :
  - Icône cloche avec badge de compteur rouge
  - Dropdown/Popover avec liste des notifications
  - Marquage lu/non-lu
  - Filtres par type (Urgent, Info, Système)
  - Actions rapides depuis les notifications
  - Timestamp relatif (il y a 2 min)

- **Bouton Paramètres Rapides** :
  - Icône engrenage
  - Dropdown avec actions rapides :
    - Toggle Dark/Light Mode
    - Langue (flags + labels)
    - Densité de l'interface (Confortable/Compacte/Dense)
    - Préférences d'affichage

- **Profil Utilisateur** :
  - Avatar rond (ou initiales sur fond coloré) + nom + rôle (si espace)
  - Dropdown menu au clic :
    - Mon Profil (avec avatar + email + rôle)
    - Paramètres personnels
    - Préférences
    - Documentation
    - Support & Aide
    - Separator
    - Déconnexion (en rouge)

---

## 🎨 SIDEBAR (Barre Latérale Gauche)

### Structure Générale
- **Largeur** : 
  - Étendu : ~240-280px
  - Réduit : ~60px (icônes uniquement)
- **Collapsible** : Toggle smooth avec animation
- **Bouton Toggle** : En haut, icône hamburger ou chevrons
- **Scroll indépendant** : ScrollArea si contenu déborde
- **Background** : Légèrement différent du body

### Architecture des Menus (Ordre Précis)

#### 1. GROUPE : PILOTAGE (en haut)
```
🎯 PILOTAGE
  ├─ 👋 Bienvenue (Tableau de bord d'accueil par défaut)
  ├─ 🖼️ Galerie (Gestionnaire de tableaux de bord personnalisés)
  └─ ➕ Nouveau (Créer un nouveau tableau de bord custom)
```

#### 2. MENUS DYNAMIQUES DES MODULES
Importés automatiquement selon les modules activés dans l'application.
Exemples :
```
📦 Logistique
  ├─ 🚢 Expéditions (badge: 12)
  ├─ 📋 Commandes
  ├─ 🏭 Entrepôts
  └─ 📊 Rapports

💼 Gestion
  ├─ 👥 Équipe
  ├─ 📄 Documents
  └─ 💰 Finance

🔧 Maintenance
  ├─ 📅 Planning
  ├─ ✅ Interventions
  └─ 🛠️ Équipements
```

---

**SEPARATOR VISUEL** (ligne horizontale)

---

#### 3. GROUPE : PARAMÈTRES (section système)
```
⚙️ Paramètres (menu simple ou avec sous-menus)
```

#### 4. GROUPE : DÉVELOPPEURS
```
💻 Développeurs
  ├─ 📊 Vue d'ensemble (Stats API, usage, etc.)
  ├─ 🔑 Clés API (Gestion des tokens)
  ├─ 🪝 Hooks et Triggers (Webhooks, automation)
  ├─ 📡 Événements (Event log)
  └─ 📜 Logs (Système, erreurs, audit)
```

#### 5. GROUPE : UTILISATEURS
```
👥 Utilisateurs
  ├─ 👤 Comptes (Liste et gestion des users)
  ├─ 👨‍👩‍👧 Groupes (Organisation en équipes)
  └─ 🔐 Rôles et Permissions (RBAC)
```

### Comportement des Menus

**Format Standard :**
- Icône (toujours visible) + Label (si sidebar étendu)
- Badge de notification à droite (si applicable)
- Chevron/Arrow pour indiquer sous-menus (rotation 90° si ouvert)
- État actif : Background coloré + bordure gauche épaisse + texte en gras

**Sous-menus :**
- Indentation visuelle claire (padding-left supplémentaire)
- Animation smooth (slide down + fade in)
- Icônes plus petites ou bullet points
- Multi-niveaux supportés (max 3 niveaux)
- Collapsible indépendamment

**Fonctionnalités Supplémentaires :**
- **Recherche de menu** : Input sticky en haut pour filtrer (apparaît au scroll ou toujours visible)
- **Favoris épinglés** : Section en haut avec étoile, accès rapide
- **Raccourcis clavier** : Affichage discret des shortcuts (Alt+1, Alt+2, etc.)
- **Drag & drop** : Réorganiser les favoris
- **Tooltip** : Au hover sur version réduite, affiche le label complet

---

## 📝 DRAWER CONTEXTUEL (Panneau Formulaires)

### Caractéristiques
- **Position** : Glisse depuis la gauche, par-dessus le contenu principal
- **Largeur** : 400-600px (responsive, 80-90% sur mobile)
- **Overlay** : Fond semi-transparent (backdrop blur léger)
- **Animation** : Slide in/out fluide (200-300ms)
- **Z-index** : Au-dessus de tout sauf modals

### Déclenchement
- Actions rapides depuis sidebar (bouton "Nouveau")
- Boutons "Créer/Ajouter" dans les pages
- Actions contextuelles (édition rapide, duplication)
- Raccourcis clavier (Ctrl+E pour nouveau)

### Structure Interne
- **Header** : 
  - Titre + icône
  - Description courte
  - Bouton fermer (X) + shortcut (Esc)
- **Body** : 
  - Formulaire avec ScrollArea indépendant
  - Tous types de champs (Radix UI components)
  - Validation en temps réel avec messages inline
  - Indicateurs de champs requis (*)
  - Auto-save optionnel avec indicateur
  - Skeleton lors du chargement de données
- **Footer** : 
  - Toujours visible (sticky)
  - Boutons d'action alignés à droite
  - Annuler (secondary) + Enregistrer (primary) + Enregistrer & Nouveau

### Types de Drawers Pré-configurés
- Création d'entités (formulaires complets)
- Édition rapide (formulaires pré-remplis)
- Panneau de filtres avancés
- Prévisualisation de documents/images
- Historique d'activité
- Commentaires et annotations

---

## 📺 ZONE CENTRALE (Contenu Principal)

### Structure Générale
- **Container responsive** : Max-width adapté (1400-1600px) centré, padding latéral
- **Scroll indépendant** : Ne défile ni header ni footer
- **Background** : Légèrement différent du layout principal (texture subtile possible)

### Page Header (Zone du Haut)
- **Titre de la page** : H1, gras, taille importante (24-32px)
- **Description/Sous-titre** : Texte gris, plus petit, explique la page
- **Actions Principales** : 
  - Boutons CTA (Créer, Exporter, etc.)
  - Alignés à droite du titre
  - Max 2-3 boutons visibles + "Plus" dropdown si nécessaire

- **Toolbar Secondaire** (sous le titre) :
  - **Toggle Vue Grid/Liste** : Icons switcher (Grid / List)
  - **Bouton Filtres** : Ouvre panel de filtres avancés (avec compteur de filtres actifs)
  - **Actions Groupées** : Apparaissent quand éléments sélectionnés (Supprimer, Exporter, etc.)
  - **Bouton Actualiser** : Reload data
  - **Autres actions** : Export, Import, Settings de vue

- **Barre de Filtres Actifs** (Pills) :
  - Juste sous le toolbar
  - Affiche les filtres appliqués sous forme de pills/tags
  - Chaque pill : Label + valeur + bouton X pour retirer
  - Bouton "Effacer tout" si plusieurs filtres
  - Compteur de résultats en temps réel : "245 résultats"

### Contenu Principal (Cards ou Tableau)

**PRINCIPE DE DENSITÉ :** Maximiser l'espace sans surcharger visuellement
- Cards **ultra-compactes** : Padding minimal (12-16px), infos essentielles uniquement
- Espacement réduit mais lisible (gaps de 12-16px)
- Responsive grid : Adapte nombre de colonnes selon largeur disponible
- Pas d'espace perdu, chaque pixel compte
- Typographie optimisée (tailles réduites mais lisibles : 12-14px pour contenu, 16px pour titres)

### Vue Grid (Grille de Cards)

**Layout Responsive :**
- Desktop XL (≥1400px) : 4-5 colonnes
- Desktop (1024-1399px) : 3-4 colonnes
- Tablet (768-1023px) : 2-3 colonnes
- Mobile (<768px) : 1-2 colonnes

**Cards Compactes :**
- Hauteur fixe ou min-height pour uniformité
- Padding réduit : 12-16px
- Header card : 
  - Icône/Avatar (24-32px) + Titre (1 ligne, ellipsis) + Actions (menu 3 points)
  - Tout sur une ligne, compact
- Body :
  - 2-4 infos clés maximum avec icônes inline
  - Labels courts ou icônes seules
  - Badges/Tags en une ligne (max 3 visibles + "+2")
  - Police 12-13px, line-height serré
- Footer (optionnel) :
  - Metadata (date, auteur) en gris clair, très petit (11px)
  - Actions secondaires si nécessaire

**Interactions :**
- Hover : Légère élévation (shadow), border highlight
- Checkbox de sélection : Apparaît au hover, en haut à gauche
- Actions rapides : Menu 3 points en haut à droite
- Clic sur card : Navigation ou ouverture drawer détails

**Skeleton Loading :**
- Grille de skeleton cards pendant chargement
- Animation pulse subtile
- Même layout que cards réelles

### Vue Liste (Tableau Dense)

**Tableau Optimisé :**
- Header sticky au scroll
- Colonnes fixes pour identifiants (freeze left)
- Densité : Ligne height réduit (36-40px), padding vertical 8-10px
- Police 13-14px pour lisibilité
- Zebra striping (alternance couleurs lignes) optionnel
- Hover row : Background highlight

**Colonnes :**
- Checkbox sélection (largeur fixe 40px)
- Colonnes principales visibles par défaut
- Colonnes secondaires masquables (settings icon dans header)
- Tri par colonne : Icônes ASC/DESC au clic sur header
- Redimensionnables (drag border entre headers)
- Icons + texte pour actions (compacte)

**Actions Inline :**
- Menu 3 points ou icônes d'actions directes
- Actions désactivées si pas de permissions (grayed out + tooltip)

**Skeleton Loading :**
- Lignes de skeleton avec animation
- Respecte structure des colonnes

**Pagination / Infinite Scroll :**
- Pagination en bas : Compact, avec input "aller à page"
- Ou infinite scroll avec indicator de chargement
- Affichage : "1-50 sur 1,247"

### États Spéciaux

**Empty State (Aucune Donnée) :**
- Illustration centrée (SVG léger)
- Message clair et encourageant
- CTA principal : "Créer le premier [élément]"
- Tips ou suggestions d'aide

**Error State :**
- Message d'erreur clair
- Bouton "Réessayer"
- Contact support si problème persiste

**Loading State (Chargement Initial) :**
- Toujours des **Skeletons** jamais de spinners seuls
- Skeleton respecte le layout final
- Animation pulse subtile, pas agressive
- Pas de décalage de layout (CLS = 0)

---

## 📋 SYSTÈME DE VUES MULTIPLES & FILTRES INTELLIGENTS

### Toggle Vue Grid/Liste
- Boutons icônes dans toolbar : Grid icon / List icon
- État actif visible (background coloré)
- Transition fluide entre vues (fade)
- Mémorisation préférence par module/user
- Shortcut : Ctrl+G

### Filtres Dynamiques et Intelligents

**Principe Clé :** Tout élément cliquable peut devenir un filtre

**Barre de Filtres Actifs :**
- Sous le toolbar, au-dessus du contenu
- Pills avec label + valeur + icône X
- Exemple : `[Statut: En Transit X]` `[Tag: Urgent X]` `[Fournisseur: Maersk X]`
- Bouton "Effacer tout" à droite
- Compteur résultats : "**245** résultats" (nombre en gras)

**Filtrage par Clic Contextuel :**

1. **Clic sur Tag** : Filtre tous éléments avec ce tag
   - Visual : Tag surligné, pill ajouté
   - Liste mise à jour instantanément

2. **Clic sur Statut/Badge** : Filtre par statut
   - Exemple : Clic sur badge "En Transit" → filtre appliqué

3. **Clic sur Catégorie/Groupe** : Filtre par catégorie

4. **Clic sur Utilisateur/Assigné** : Filtre par responsable

5. **Clic sur Priorité** : Filtre par niveau

6. **Clic sur Localisation** : Filtre géographique

7. **Clic sur Date/Période** : Filtre temporel

8. **Clic sur Valeur Numérique** : Ouvre range picker

**Comportement :**
- Filtres cumulatifs (logique ET)
- Animation de filtrage (fade out non-matches)
- Compteur mis à jour en temps réel
- URL update avec query params (partage possible)
- Scroll auto vers le haut après filtrage

**Panel de Filtres Avancés :**
- Bouton "Filtres" ouvre drawer/panel depuis droite
- Tous les filtres disponibles organisés par catégorie
- Champs de recherche, range sliders, date pickers, selects multiples
- Compteurs par option (ex: "En Transit (45)")
- Bouton "Appliquer" + "Réinitialiser"
- Sauvegarde de filtres favoris (avec nom)

**Filtres Pré-configurés (Quick Filters) :**
- Pills cliquables au-dessus du contenu
- Exemples : "Mes éléments", "Urgent", "En retard", "Cette semaine"
- 1 clic = filtre appliqué

**Indicateurs Visuels :**
- Éléments filtrables ont cursor pointer
- Tooltip au hover : "Filtrer par [élément]"
- Highlight au hover sur éléments filtrables
- Badge avec compteur à côté des options filtrables

**Performance :**
- Debouncing 300ms sur recherche textuelle
- Filtrage côté client pour <1000 items
- Filtrage côté serveur pour >1000 items
- Optimistic UI : Feedback immédiat même si requête en cours

---

## 📏 FOOTER BAR (Barre Inférieure)

### Structure
- **Hauteur** : ~32-40px (compact)
- **Sticky bottom** : Toujours visible
- **Background** : Légèrement différent du body
- **Police** : 11-12px, discret

### Partie Gauche
- **Indicateur Statut Système** :
  - Point coloré animé (pulse) + Label
  - Vert : "Opérationnel"
  - Orange : "Maintenance programmée"
  - Rouge : "Incident en cours"
- **Dernière Synchro** : "Synchronisé il y a 2 min" + icône refresh au clic
- **Connexion** : Indicateur online/offline avec icône wifi

### Partie Centre
- **Version** : "v2.4.1"
- **Environnement** : Badge coloré (Prod, Staging, Dev, Local)

### Partie Droite
- **Bouton Aide** : Icône ? ouvre centre d'aide
- **Bouton Feedback** : Icône commentaire
- **Toggle Fullscreen** : Icône expand/compress
- **Lien Légal** : "© 2024 OpsFlux • Confidentialité"

---

## 🎨 DESIGN SYSTEM & STACK TECHNIQUE

### Bibliothèque de Composants

**Radix UI Primitives (Headless Components)**
- Base pour tous les composants interactifs
- Style 100% personnalisé, propre au logiciel
- Pas d'utilisation de shadcn/ui ou autres wrappers pré-stylés

**Composants Radix à Utiliser :**
- Navigation : NavigationMenu
- Overlays : Dialog, AlertDialog, Popover, DropdownMenu, HoverCard
- Layout : Accordion, Collapsible, Tabs, ScrollArea, Separator
- Forms : Checkbox, RadioGroup, Switch, Select, Slider, Toggle
- Feedback : Toast, Progress, Avatar, Badge (custom)
- Tooltip : Hover explanations

**Icônes :** Lucide React (cohérent, léger, 1000+ icônes)

### Styling

**Approche :**
- **Tailwind CSS** (recommandé pour productivité) OU **CSS Modules** (si préféré)
- Variables CSS pour thématisation (couleurs, espacements, fonts)
- Design tokens centralisés dans config
- Utility classes pour espacements, typographie
- Components classes pour composants complexes

**Variables CSS Globales :**
```css
:root {
  /* Colors */
  --color-primary: #0066FF;
  --color-secondary: #6B7280;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;
  
  /* Backgrounds */
  --bg-base: #FFFFFF;
  --bg-subtle: #F9FAFB;
  --bg-muted: #F3F4F6;
  
  /* Text */
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --text-tertiary: #9CA3AF;
  
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  
  /* Typography */
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
  --font-size-3xl: 32px;
  
  /* Borders */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}

[data-theme="dark"] {
  --bg-base: #111827;
  --bg-subtle: #1F2937;
  --bg-muted: #374151;
  --text-primary: #F9FAFB;
  --text-secondary: #D1D5DB;
  --text-tertiary: #9CA3AF;
  /* ... */
}
```

### Typographie
- **Police Principale** : Inter, SF Pro, System UI (professionnelle et lisible)
- **Échelle de Tailles** : 11, 13, 14, 16, 20, 24, 32, 48px
- **Poids** : 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Line-height** : 1.2-1.5 selon taille (compact mais lisible)
- **Letter-spacing** : Neutre ou légèrement négatif pour titres

### Palette de Couleurs

**Couleurs de Marque :**
- Primaire : Bleu professionnel (#0066FF ou custom)
- Secondaire : Gris sophistiqué (#6B7280)

**Couleurs Sémantiques :**
- Success : Vert (#10B981)
- Warning : Orange (#F59E0B)
- Error : Rouge (#EF4444)
- Info : Bleu clair (#3B82F6)

**Nuances de Gris** (pour textes, backgrounds, borders) :
- 9 niveaux de 50 (très clair) à 900 (très foncé)

**Mode Sombre :**
- Inversion intelligente des couleurs
- Contrastes adaptés (WCAG AA)
- Couleurs primaires légèrement désaturées

### Espacements

Système basé sur **4px** :
- 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px

**Usage :**
- Padding interne composants : 8-16px
- Margins entre sections : 24-32px
- Gaps dans grids : 12-16px

### Bordures et Rayons
- **Radius** : 4px (small), 8px (medium), 12px (large), 9999px (full/pill)
- **Border Width** : 1px standard, 2px pour focus states

### Ombres
- **None** : Flat elements
- **Small** : Subtle lift (cards au repos)
- **Medium** : Dropdown menus, popovers
- **Large** : Modals, drawers

---

## 🎭 COMPORTEMENTS & INTERACTIONS

### Responsive Breakpoints
- **Mobile** : <640px (1 colonne, UI simplifiée)
- **Tablet** : 640-1023px (2 colonnes, sidebar overlay)
- **Desktop** : 1024-1399px (3-4 colonnes, sidebar persistante)
- **Desktop XL** : ≥1400px (4-5 colonnes, max density)

### Mobile Adaptations
- Sidebar → Full-screen drawer avec overlay
- Header → Boutons réduits, logo centré
- Breadcrumb → Masqué ou tronqué
- Search → Modal plein écran
- Cards → 1 colonne, padding augmenté pour touch
- Drawer → Bottom sheet (slide up)
- Footer → Simplifié (version seulement)
- Tables → Horizontal scroll ou cards responsive

### Dark Mode
- Toggle dans header (icône sun/moon)
- Transition fluide (200ms)
- Sauvegarde dans localStorage
- Respect `prefers-color-scheme`
- Toutes couleurs/composants adaptés
- Mode par défaut : Suivre système

### Loading States

**Priorité absolue : Skeletons partout**
- Jamais de spinner seul (sauf dans header pour async)
- Skeleton = structure grise pulsante du contenu final
- Respecte layout exact (pas de décalage)
- Animation pulse subtile (2s loop)

**Types de Skeletons :**
- Skeleton Card : Rectangles pour images, lignes pour texte
- Skeleton Table : Lignes et colonnes en gris
- Skeleton Text : Lignes de largeurs variables
- Skeleton Avatar : Cercle pulsant

**Exceptions (Spinner autorisés) :**
- Header bar : Petit spinner pour operations async courtes
- Progress bar sous header : Opérations longues avec progression
- Boutons : Mini spinner pendant action (ex: "Enregistrement...")

### Animations & Transitions

**Durées :**
- Ultra-rapide : 100ms (hovers)
- Rapide : 150ms (toggles)
- Standard : 200-250ms (drawers, modals)
- Lent : 300ms (grandes transitions)

**Easing :**
- ease-in-out (par défaut)
- ease-out (entrées)
- ease-in (sorties)
- spring (micro-interactions)

**Respect `prefers-reduced-motion` :**
- Désactive animations non essentielles
- Réduit durées
- Transitions instantanées si nécessaire

### Focus Management
- Outline visible et contraste (2px, couleur primaire)
- Focus trap dans modals/drawers
- Focus return après fermeture
- Skip links pour navigation clavier
- Tabindex logique

### États Interactifs
- **Hover** : Background change, scale légère (1.02), shadow
- **Active** : Scale down (0.98), background plus foncé
- **Focus** : Outline 2px, ring si Radix
- **Disabled** : Opacity 0.5, cursor not-allowed, grayed out

---

## ⌨️ RACCOURCIS CLAVIER GLOBAUX

**Navigation :**
- `Ctrl/Cmd + K` : Recherche globale / Filtre contextuel
- `Ctrl/Cmd + H` : Retour accueil
- `Ctrl/Cmd + B` : Toggle sidebar
- `Alt + 1-9` : Aller au menu N

**Actions :**
- `Ctrl/Cmd + E` : Nouvelle entité (selon contexte)
- `Ctrl/Cmd + S` : Sauvegarder (dans formulaires)
- `Ctrl/Cmd + F` : Filtres avancés
- `Ctrl/Cmd + G` : Toggle Grid/Liste
- `Ctrl/Cmd + R` : Actualiser données

**Vues :**
- `Ctrl/Cmd + D` : Toggle dark mode
- `Ctrl/Cmd + ,` : Paramètres
- `Ctrl/Cmd + /` : Afficher tous les raccourcis (modal aide)

**Généraux :**
- `Esc` : Fermer modal/drawer/dropdown actif
- `Tab` : Navigation entre champs
- `Shift + Tab` : Navigation inverse
- `Enter` : Valider/Soumettre
- `Space` : Toggle checkboxes/switches

**Modal d'Aide Raccourcis :**
- Triggered par `Ctrl/Cmd + /`
- Liste tous les shortcuts organisés par catégorie
- Recherche de shortcut
- Liens vers documentation

---

## ♿ ACCESSIBILITÉ (A11Y)

### Standards
- **WCAG 2.1 AA minimum** (AAA si possible)
- Contrastes suffisants (4.5:1 texte, 3:1 UI)
- Navigation clavier complète
- ARIA labels/roles (Radix les fournit)
- Screen readers compatible

### Bonnes Pratiques
- Semantic HTML (h1-h6 hiérarchisé, nav, main, footer)
- Alt text pour images
- Labels pour tous les champs
- Error messages liés aux champs (aria-describedby)
- Live regions pour notifications (aria-live)
- Focus visible toujours
- Skip links ("Aller au contenu principal")

---

## 🚀 PERFORMANCE & OPTIMISATIONS

### Code Splitting
- Lazy load modules/routes (React.lazy)
- Dynamic imports pour composants lourds
- Preload critical routes

### Virtualisation
- Listes longues (>100 items) : react-window ou TanStack Virtual
- Render only visible items
- Smooth scrolling

### Memoization
- React.memo pour composants purs
- useMemo pour calculs coûteux
- useCallback pour handlers passés en props

### Debouncing & Throttling
- Recherches : Debounce 300ms
- Scroll events : Throttle 100ms
- Resize events : Throttle 200ms

### Images
- Lazy loading (native ou lib)
- Formats modernes (WebP, AVIF) avec fallback
- Tailles optimisées (srcset, sizes)

### Caching
- React Query ou SWR pour data fetching
- Cache API responses
- Stale-while-revalidate

### Metrics
- Core Web Vitals monitoring (LCP, FID, CLS)
- Error tracking (Sentry ou équivalent)
- Performance monitoring (Lighthouse CI)

---

## 🔧 FONCTIONNALITÉS AVANCÉES

### Sauvegarde d'État Utilisateur
- Préférences interface (sidebar, densité, vue, theme)
- Filtres favoris
- Colonnes affichées/masquées + ordre
- Taille colonnes tableau
- État menus (expanded/collapsed)
- Synchronisation multi-appareils (si compte)

### Système de Permissions (RBAC)
- Menus conditionnels selon rôle
- Actions désactivées si permissions insuffisantes
- Tooltips explicatifs ("Accès Admin requis")
- Filtrage auto des données (only what user can see)

### Multi-langue (i18n)
- Sélecteur langue dans header (flags + noms)
- Traductions UI + contenu
- Détection auto navigateur
- Formats localisés (dates, nombres, devises)
- RTL support (Arabic, Hebrew) si nécessaire

### Historique & Undo/Redo
- Navigation avant/arrière (browser-like)
- Undo/Redo actions destructives
- Toast avec bouton "Annuler" (5s)
- Timeline d'activité utilisateur

### Tours Guidés
- First-time user onboarding
- Feature announcements (tooltips)
- Interactive tutorials
- Progress tracking

### Export & Partage
- Export vues filtrées (CSV, Excel, PDF)
- Partage vues via URL (query params)
- Génération rapports automatiques
- Snapshots dashboards

### Analytics
- User actions tracking
- Heatmaps (optionnel)
- Feature usage statistics
- Performance monitoring

---

## 🎯 PRINCIPES DIRECTEURS

### Professionnel
- Design sobre, épuré, moderne
- Pas de fioritures inutiles
- Cohérence totale (patterns, vocabulaire)
- Typographie lisible, hiérarchie claire

### Intuitif
- Conventions respectées (patterns reconnus)
- Labels clairs, sans jargon
- Feedback immédiat sur actions
- Logique de navigation évidente

### Productif
- Minimiser les clics
- Raccourcis pour actions fréquentes
- Bulk actions pour gains de temps
- Auto-save, smart defaults
- Pas de "modal hell" (éviter trop de modals empilés)

### Dense mais Lisible
- Maximiser infos visibles sans surcharge
- Cards compactes mais aérées
- Typographie petite mais lisible (min 11px)
- Espacements réduits mais respirent
- Pas de scroll horizontal inutile

### Performant
- Chargements instantanés (<200ms perçus)
- Skeletons pendant chargements
- Feedback visuel immédiat (optimistic UI)
- Pas de lags, pas de jank

---

**RÉSUMÉ : Ce shell doit être production-ready, évolutif, maintenable, accessible, performant et offrir une expérience utilisateur de niveau entreprise, avec un design system unique basé sur Radix UI, une densité d'information maximale sans surcharge, et un système de filtrage intelligent et contextuel.**
