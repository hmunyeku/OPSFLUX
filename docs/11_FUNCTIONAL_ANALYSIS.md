# OpsFlux — 11_FUNCTIONAL_ANALYSIS.md
# Analyse Fonctionnelle Complète — Core + Tous les Modules

> Ce document décrit **ce que fait** chaque partie du système du point de vue de l'utilisateur.
> Il complète les specs techniques. Claude Code le lit avant de coder une fonctionnalité.
>
> Structure de chaque section :
> - Écrans / vues
> - Flux utilisateur (user flows)
> - Règles métier
> - Validations
> - Cas limites

---

## TABLE DES MATIÈRES

1. [Core Platform](#1-core-platform)
2. [Module ReportEditor](#2-module-reporteditor)
3. [Module PID/PFD + TagRegistry](#3-module-pidpfd--tagregistry)
4. [Module Dashboard](#4-module-dashboard)
5. [Module Asset Registry](#5-module-asset-registry)
6. [Module Tiers](#6-module-tiers)
7. [Module AI & MCP](#7-module-ai--mcp)

---

# 1. CORE PLATFORM

## 1.1 Authentification & Sessions

### Écrans
- `/login` — Page de connexion avec bouton "Se connecter avec Perenco SSO"
- Redirect SSO → callback → dashboard selon home page résolue
- `/logout` — Déconnexion + invalidation token

### Flux utilisateur
```
User arrive sur OpsFlux
  → Pas de session valide → redirect /login
  → Clic "Se connecter" → redirect vers IdP Perenco (OIDC)
  → IdP authentifie → callback avec code
  → Backend échange code → JWT (access + refresh)
  → JWT stocké en mémoire (accessToken) + refresh en httpOnly cookie
  → Redirect vers home page résolue pour ce user/rôle
```

### Règles métier
- Un utilisateur peut appartenir à plusieurs tenants (ex: contrat avec PCM + PCG)
- Le tenant actif est encodé dans le JWT (`entity_id` claim)
- Pour switcher de tenant : nouvel échange token avec `entity_id` différent
- Session expire après 8h → refresh token automatique (transparent)
- Refresh token expire après 7 jours → reconnexion requise
- Un `super_admin` peut impersonate n'importe quel tenant (audit trail obligatoire)

### Validations
- Email Perenco uniquement (domaine whitelist configurable par tenant)
- Compte désactivé (`is_active=false`) → 403 avec message "Compte désactivé"
- Tenant inactif → 403 avec message "Tenant inactif"

---

## 1.2 Multi-tenant & Business Units

### Écrans
- **Topbar > Tenant Switcher** : dropdown des tenants accessibles
- **Topbar > BU Switcher** : dropdown des BU accessibles (masqué si 1 seule BU)
- **Settings > Organisation > Business Units** : arborescence des BU du tenant

### Flux — Switch de tenant
```
User clique sur Tenant Switcher → voit liste de ses tenants
  → Clique sur un tenant → request refresh token avec nouveau entity_id
  → Redirect vers home page du nouveau tenant
  → Toutes les données rechargées avec le nouveau contexte
```

### Flux — BU Scope
```
User clique sur BU Switcher → voit ses BU accessibles
  → Sélectionne "BIPAGA" → préférence "bu_context" = "bipaga-uuid" sauvegardée
  → Toutes les listes filtrées automatiquement sur BIPAGA
  → Badge "BIPAGA" visible dans le BU Switcher
  → Conserver le scope même après déconnexion/reconnexion
```

### Règles métier
- `bu_id=null` dans le switcher → afficher TOUTES les données (si droits suffisants)
- Un `editor` ne peut voir que sa BU primaire + les BU où il a des droits `read`
- Un `tenant_admin` voit toutes les BU du tenant
- Les assets, documents, PIDs, dashboards héritent tous de ce scope

---

## 1.3 RBAC (Rôles & Permissions)

### Écrans
- **Settings > Rôles & Permissions** : tableau des rôles × permissions
- **Settings > Utilisateurs** : liste des users avec leur rôle + BU
- **Délégations actives** : liste des délégations en cours

### Rôles et ce qu'ils peuvent faire

| Rôle | Crée docs | Valide | Admin modules | Admin tenant |
|---|---|---|---|---|
| `reader` | Non | Non | Non | Non |
| `editor` | Oui | Non | Non | Non |
| `reviewer` | Non | Oui | Non | Non |
| `template_manager` | Non | Non | Templates | Non |
| `pid_manager` | Non | Non | PID/Tags/Lib | Non |
| `tenant_admin` | Oui | Oui | Tout | Oui |
| `super_admin` | Oui | Oui | Tout | Tous tenants |

### Flux — Délégation
```
User A partira en congés (admin ou reviewer)
  → Settings > Délégations > "Nouvelle délégation"
  → Choisit User B, dates de début/fin, périmètre (tous ou doc spécifique)
  → Pendant la période : User B voit les validations de A dans sa liste "À valider"
  → User B valide → action tracée "Délégué par A" dans le timeline
  → À l'expiration : délégation désactivée automatiquement (job APScheduler)
```

### Règles métier
- Un user peut avoir plusieurs délégations actives simultanément
- Une délégation peut être partielle : "déléguer uniquement pour le projet BIPAGA"
- La délégation est tracée dans `workflow_transitions.actor_id` + mention dans le commentaire
- Un `reader` ne peut pas déléguer (pas de droits à déléguer)

---

## 1.4 Notifications & Recommandations

### Écrans
- **Topbar > Cloche** : badge avec compteur non-lus
- **Popover Notifications** : deux onglets — "À faire" (recommandations) + "Activité" (notifications)
- **Panneau IA** : section briefing avec recommandations priorisées au démarrage

### Types de recommandations affichées dans "À faire"

| Type | Priorité | Déclencheur | Action proposée |
|---|---|---|---|
| Validation en attente | Critique si > 3j, Haute sinon | Workflow FSM | Bouton "Valider" |
| Deadline dans 48h | Haute | Job APScheduler check_workflow_deadlines | Bouton "Traiter" |
| Deadline dépassée | Critique | Job APScheduler | Bouton "Voir" |
| Document dû (habitude) | Haute | Analyse comportement | Bouton "Créer" |
| Anomalie de données | Variable | Connecteurs | Bouton "Voir" |
| Document mis à jour (watchlist) | Normale | EventBus document.updated | Bouton "Voir" |

### Règles métier
- Une recommandation "snooze" disparaît pour 1h, 4h ou "aujourd'hui" (choix user)
- "Dismiss" = disparaît définitivement
- Une recommandation critique ne peut pas être snooze (seulement dismiss ou traiter)
- Max 20 recommandations actives simultanées par user (les plus anciennes expirent)
- Les notifications "Activité" sont conservées 30 jours

---

## 1.5 Recherche Globale (⌘K)

### Écrans
- **Topbar > Barre de recherche** : trigger de la command palette
- **CommandDialog** : résultats en temps réel, groupés par type

### Flux
```
User appuie ⌘K (ou Ctrl+K)
  → CommandDialog s'ouvre avec focus sur l'input
  → User tape "BIPAGA"
  → Pendant la frappe : debounce 300ms → GET /api/v1/search?q=BIPAGA
  → Résultats groupés :
      Favoris (1) : Dashboard Production BIPAGA
      Documents (3) : RPT-PCM-BIPAGA-0042, RPT-PCM-BIPAGA-0041...
      Assets (2) : Plateforme BIPAGA, Puits BIPAGA-04
      Équipements (4) : V-101 (BIPAGA), P-101A (BIPAGA)...
  → User clique un résultat → navigate + fermer dialog
  → Esc → fermer sans naviguer
```

### Règles métier
- Résultats filtrés par BU active et permissions du user
- Favoris et pages récentes affichés AVANT de taper (historique)
- Résultats ordonnés par : favoris > récents > pertinence textuelle
- Min 2 caractères pour lancer la recherche
- Max 5 résultats par catégorie dans la command palette (voir plus → page dédiée)

---

## 1.6 Custom Fields (Extrafields)

### Écrans
- **Settings > Modules > {Module} > Champs personnalisés** : liste des champs + création
- **Dans chaque objet** : section "Informations" avec les champs du type

### Flux — Admin ajoute un champ
```
Admin va dans Settings > Modules > Asset Registry > Champs
  → Clic "+ Nouveau champ"
  → Choisit : objet "platform", clé "commissioning_date", type "date"
  → Définit : label FR "Date de mise en service", requis Oui
  → Groupe d'affichage : "Données techniques"
  → Sauvegarde → champ disponible immédiatement sur toutes les plateformes
  → Les plateformes existantes ont ce champ à null
```

### Règles métier
- La `field_key` est unique par (tenant, object_type) — pas modifiable après création
- Supprimer un champ → soft delete (les valeurs restent, le champ est masqué)
- Les champs `is_locked=true` ne sont pas modifiables par les editors (cartouche)
- Les formules sont recalculées en temps réel à l'affichage (pas stockées)
- Un champ `reference` pointe vers un autre objet OpsFlux (pas de référence circulaire)

---

# 2. MODULE REPORTEDITOR

## 2.1 Vue Liste Documents

### Écrans
- `/documents` — liste paginée de tous les documents accessibles
- Filtres disponibles : statut, type, projet, BU, rédacteur, période, étiquettes

### Ce que l'utilisateur voit selon son rôle

| Rôle | Documents visibles |
|---|---|
| `reader` | Uniquement les publiés (status=published) de sa BU |
| `editor` | Ses brouillons + tous les publiés de sa BU |
| `reviewer` | Tous les documents de sa BU + ceux à valider |
| `template_manager` | Tous les documents de sa BU |
| `tenant_admin` | Tous les documents du tenant |

### Interactions possibles sur la liste
- Cliquer une ligne → ouvre l'éditeur (si editor) ou la vue lecture (si reader)
- Cliquer une ligne → panneau dynamique s'ouvre à droite avec résumé
- Bouton "+ Nouveau document" → modal de création (choix projet + type)
- Bouton "Exporter" → CSV ou Excel de la liste filtrée (colonnes visibles)
- Cliquer l'en-tête de colonne → tri croissant/décroissant
- Drag-select plusieurs lignes → actions en masse (archiver, changer étiquette)

---

## 2.2 Création d'un Document

### Flux complet
```
User clique "+ Nouveau document"
  → Modal "Nouveau document" s'ouvre
  → Étape 1 — Projet :
      Sélectionner projet (SmartCombobox, BU active en tête)
      Optionnel : sélectionner nœud d'arborescence
  → Étape 2 — Type de document :
      Sélectionner type (liste filtrée par discipline si applicable)
      Afficher : "Numéro qui sera attribué : RPT-PCM-BIPAGA-0043"
      Afficher : template associé et workflow associé
  → Étape 3 — Titre & options :
      Saisir le titre (requis)
      Choisir la langue (FR par défaut)
      Parties libres de la nomenclature si {FREE} ou {PHASE} dans le pattern
  → Bouton "Créer" :
      POST /api/v1/documents → document créé avec status="draft", rev="0"
      Numéro de séquence verrouillé atomiquement
      Redirect vers /documents/{id} (éditeur ouvert)
```

### Règles métier
- Le numéro est **attribué à la création** et est **immuable** (même si le doc est archivé)
- Si deux users créent simultanément le même type/projet → séquences distinctes garanties (SELECT FOR UPDATE)
- Un doc créé mais jamais soumis peut être supprimé (soft delete) par son auteur
- Un doc soumis ne peut plus être supprimé (seulement archivé, par tenant_admin)

---

## 2.3 Éditeur BlockNote

### Écrans
- `/documents/{id}` — éditeur pleine page avec panneaux Core actifs

### Zones de l'éditeur
```
┌─────────────────────────────────────────────────────────┐
│  DOCUMENT TOOLBAR                                       │
│  N° RPT-PCM-BIPAGA-0043 | Rev 0 | ● Brouillon          │
│  [Sauvegarder ↓] [Soumettre →] [Exporter PDF] [...]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ CARTOUCHE (verrouillé, non-éditable)             │   │
│  │ Titre | N° | Rev | Date | Auteur | Classif.      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ SECTION "Données de production"                  │   │
│  │ [Date du rapport    ] [2025-03-14              ] │   │
│  │ [Plateforme         ] [BIPAGA              ▾   ] │   │
│  │ [Prod. huile (bbl/j)] [12 450              ] bbl│   │
│  │ [Pression séparateur] [42.3                ] bar│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Tendance 7 jours [📊 connecteur DCS BIPAGA]     │   │
│  │ [graphique Recharts avec données live]           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  COMMENTAIRES OPÉRATIONNELS                             │
│  [Contenu riche BlockNote — texte libre]                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Interactions clés dans l'éditeur
- **Cartouche** : non-cliquable, non-sélectionnable, toujours verrouillé
- **Section formulaire** : champs éditables selon les droits. Tab passe au champ suivant
- **Bloc dynamique** : bouton ↻ pour rafraîchir manuellement. "Snapshot" si mode export
- **Contenu riche** : éditeur BlockNote standard — headings, bullets, tables, images
- **Barre d'outils doc** : indicateur "Sauvegardé il y a 2s" ou "⚠ En attente de sync"
- **Collaborateurs en ligne** : avatars + curseurs colorés nommés si ≥2 users

### Comportement offline
```
Réseau coupé (offshore satellite)
  → Indicateur "🔴 Hors ligne" dans la barre doc
  → Édition continue normalement
  → Sauvegarde automatique toutes les 30s → IndexedDB uniquement
  → Message discret : "Sauvegardé localement (non synchronisé)"
  → Reconnexion :
      → Indicator "Synchronisation en cours..."
      → CRDT Yjs merge → server
      → "✅ Synchronisé" en vert
      → Si conflit détecté → bannière jaune "Conflit résolu — vérifiez les modifications"
```

### Règles métier éditeur
- Auto-save toutes les 30s (configurable 10-300s dans Settings)
- Un document `is_locked=true` est en lecture seule pour TOUT le monde (après approbation finale)
- Le bouton "Soumettre" est désactivé si des champs requis ne sont pas remplis
- Un template peut marquer des sections entières comme `locked:true` → non-modifiable
- L'éditeur ne peut pas être fermé avec des modifications non sauvegardées (prompt de confirmation)
- Les images sont uploadées immédiatement au drop → progress bar → URL remplacée

---

## 2.4 Circuit de Validation (Workflow)

### Flux nominal : 2 validateurs séquentiels
```
Rédacteur A finit son rapport
  → Clique "Soumettre pour validation"
  → Modal : commentaire optionnel → "Soumettre"
  → Status → "En révision"
  → Nœud 1 : Réviseur technique B notifié (email + in-app)

Réviseur B reçoit notification
  → Ouvre doc → lecture seule
  → Peut commenter dans le panel Commentaires
  → Clique "Approuver" + commentaire optionnel → ou "Rejeter" + motif obligatoire

Si Approuvé par B :
  → Nœud 2 : Approbateur C notifié (manager)
  → C approuve → Status → "Approuvé" → document verrouillé
  → Event "document.approved" → notification à A

Si Rejeté par B :
  → Status → "Brouillon" (retour à A selon rejection_target du workflow)
  → A notifié avec le motif
  → A peut corriger et re-soumettre (incrémente rev 0 → toujours rev 0 tant que brouillon)
```

### Flux parallèle : 3 approbateurs, seuil majority
```
Nœud parallèle avec [Responsable PROC, Responsable HSE, Responsable MAINT]
  → Les 3 sont notifiés simultanément
  → Chacun voit le doc dans sa liste "À valider"
  → Dès que 2/3 approuvent (seuil majority) → passe au nœud suivant
  → Le 3ème approbateur voit "Validation déjà complète"
  → Si 1 rejette → nœud marked "Rejeté partiel" → règle configurable :
      - bloquer (attend les 3 votes)
      - rejeter immédiatement (si 1 rejette → tout le nœud rejeté)
```

### Règles métier workflow
- Un approbateur ne peut pas s'auto-approuver son propre document (sauf tenant_admin)
- Le rédacteur peut annuler le workflow tant qu'il est au nœud 1 (pas encore validé)
- Chaque transition crée un enregistrement `workflow_transitions` IMMUABLE
- Le timeline du document affiche toutes les transitions avec date/acteur/commentaire
- Un workflow peut avoir max 10 nœuds (protection contre les configurations aberrantes)
- Une deadline dépassée ne bloque pas techniquement → crée seulement une recommandation critique

---

## 2.5 Révisions

### Règles de révision
```
Création doc → Rev "0" (provisoire, peut être modifié)
Premier workflow approuvé → Rev "A" (verrouillé, immuable)
Modification après → New revision "B" (brouillon)
Approuvé → Rev "B" verrouillé
...
```

### Flux — Créer une nouvelle révision
```
Document en status "Approuvé" ou "Publié"
  → Bouton "Nouvelle révision" dans la toolbar
  → Modal : "Créer révision B - Motif de la modification ?"
  → Confirmation → Doc status → "Brouillon" avec Rev "B"
  → Le contenu de Rev A est copié dans Rev B (éditable)
  → Rev A reste accessible en lecture dans l'historique
```

---

## 2.6 Export PDF / DOCX

### Comportement attendu
- **PDF** : rendu fidèle au template (police, couleurs, logo, cartouche officiel Perenco)
- A4 portrait par défaut, paginated, footer "Page X / Y"
- Blocs dynamiques exportés en **snapshot figé** (valeur au moment de l'export)
- Images inline exportées (pas de lien externe)
- **DOCX** : même structure, styles Word compatibles, éditable après export
- Export déclenché côté backend (Puppeteer), livré comme téléchargement

---

## 2.7 Gestion des Templates

### Écrans
- **Settings > Modules > Rédacteur > Templates** : liste des templates actifs
- **Template Builder** : éditeur visuel du template (sections + champs + styles)

### Ce qu'un Template Manager peut faire
- Créer un template à partir de zéro ou dupliquer un existant
- Définir des sections : cartouche, formulaire, bloc riche, bloc dynamique, tableau de saisie
- Pour chaque champ de formulaire : type, label, requis, verrouillé, valeur auto
- Configurer les styles : police, couleurs, marges, logo
- Versionner : sauvegarder une nouvelle version sans effacer l'ancienne
- Activer/désactiver un template (les docs existants gardent leur version)
- Associer un template à un type de document

### Règle importante
- Un template `locked:true` sur une section signifie que les éditeurs ne peuvent pas modifier cette section
- Les champs avec `auto_value` sont calculés automatiquement et non modifiables par l'éditeur
- Si le template change de version, les nouveaux documents utilisent la nouvelle version — les anciens gardent leur ancienne version

---

# 3. MODULE PID/PFD + TAGREGISTRY

## 3.1 Vue Liste des PID

### Écrans
- `/pid` — liste des documents PID du tenant/BU
- Filtres : projet, statut (IFC/AFC/As-Built), type (Process/Utility), format (A0/A1)

### Colonnes de la liste
- Numéro PID, Titre, Projet, Statut, Révision, Dernier modifié, Format

### Actions disponibles
- Clic → ouvrir l'éditeur draw.io
- Nouveau PID → modal création (numéro, titre, projet, type, format)
- Exporter → SVG, PDF A1, DXF

---

## 3.2 Éditeur PID (draw.io intégré)

### Zones de l'éditeur

```
┌─────────────────────────────────────────────────────────────────┐
│ PID TOOLBAR                                                     │
│ N° PID-PCM-BIPAGA-0101 | Rev 0 | ● IFC                         │
│ [Sauvegarder] [Révision] [Valider] [Export ▾] [Bibliothèque]   │
├───────────────────────────────────────┬─────────────────────────┤
│                                       │ PANNEAU PROPRIÉTÉS      │
│   draw.io (iframe) — Plan PID         │                         │
│                                       │ V-101                   │
│   [Affichage mxGraph complet]         │ Type : Séparateur       │
│                                       │ Design P : 45 barg      │
│   Objets posés = records DB           │ Design T : 120°C        │
│   Clic objet → panneau droite         │ Fluide : HC + eau       │
│                                       │                         │
│                                       │ Tags DCS associés :     │
│                                       │ PT-1011, TT-1012        │
│                                       │ LT-1013, PDT-1014       │
│                                       │                         │
│                                       │ Documents liés (2)      │
└───────────────────────────────────────┴─────────────────────────┘
```

### Flux — Poser un équipement
```
User ouvre la bibliothèque (icône Library dans toolbar)
  → Panel bibliothèque s'ouvre avec les catégories
  → Catégorie "Pompes" → sous-catégorie "Centrifuge"
  → Drag la pompe sur le canvas draw.io
  → draw.io la pose → XML mis à jour → message "save" envoyé au parent
  → Backend parse le XML → `parse_and_sync_pid()` → record "P-102A" créé en DB
  → Panneau droite : formulaire propriétés de P-102A s'ouvre
  → User remplit : description "Pompe injection eau", design_pressure "65 barg"
  → Sauvegarde → PATCH /api/v1/pid/equipment/{id} → DB mis à jour
  → draw.io refreshé avec les nouvelles propriétés affichées
```

### Flux — Renommer un tag sur le PID
```
User double-clique sur l'instrument "PT-1011" sur le dessin
  → Panel droite s'ouvre
  → User change le tag_name : "PT-1011" → "BIP-PT-101"
  → Validation en temps réel : "✅ Conforme à la règle {AREA}-{TYPE}-{SEQ:3}"
  → Sauvegarde → propagation :
      1. Tag mis à jour en DB
      2. Toutes les connexions mises à jour
      3. Tous les autres PID où ce tag apparaît → mis à jour dans le XML
      4. Event "tag.renamed" publié → modules abonnés notifiés
```

### Règles métier éditeur PID
- Tout objet posé sur le canvas DOIT avoir un tag (validation avant sauvegarde)
- Un tag dupliqué sur le même projet → erreur bloquante dans le panneau propriétés
- Les flags de continuation (→ Sheet 2) sont automatiquement détectés depuis le XML
- Un PID ne peut être validé (IFC → AFC) que si tous ses objets ont leurs propriétés obligatoires remplies
- Le XML complet est sauvegardé à chaque clic "Sauvegarder" dans draw.io — pas en auto-save (trop lourd)

---

## 3.3 TagRegistry

### Écrans
- `/pid/tags` — liste complète des tags DCS du projet
- Filtres : type (PT/TT/FT...), zone (BIP/EBM...), équipement, source (CSV/manuel/suggéré)

### Flux — Import depuis CSV Rockwell
```
Admin clique "Import CSV"
  → Upload du fichier CSV (colonnes : TAG_NAME, TAG_TYPE, AREA, DESCRIPTION...)
  → Parsing → aperçu des 5 premières lignes
  → Rapport de validation :
      "✅ 89 tags valides"
      "⚠ 3 tags en doublon (seront ignorés)"
      "❌ 2 tags non conformes à la règle de nommage"
        → "EBM_PT_001 : le séparateur doit être '-' pas '_'"
        → "BIP_TT_105 : tag existant avec numéro déjà utilisé"
  → User corrige ou ignore les erreurs
  → Import → stats : "89 créés, 3 ignorés, 2 erreurs"
```

### Flux — Créer un tag avec suggestions IA
```
User clique "+ Nouveau tag"
  → Formulaire :
      Type instrument : [PT — Pression ▾]
      Zone : [BIP — BIPAGA ▾]
      Équipement associé : [V-101 (Séparateur) ▾]
  → Bouton "Suggérer" :
      GET /api/v1/pid/dcs-tags/suggest?tag_type=PT&area=BIP&equipment_id=...
      → 3 suggestions affichées :
          "BIP-PT-101" (prochaine séquence, conforme)
          "BIP-PT-102" (alternative)
          "BIP-PT-V101" (suggestion IA avec contexte équipement)
  → User sélectionne "BIP-PT-101"
  → Validation : "✅ Conforme, disponible"
  → Rempli description, range, unité → Sauvegarder
```

### Règles métier TagRegistry
- Un tag est unique par (tenant, project_id, tag_name) — erreur si doublon
- Le mode strict interdit la création d'un tag non conforme à toute règle active
- Un tag peut exister sans être lié à un équipement (ex : tag d'ambiance, tag système)
- Renommer un tag en masse (batch rename) disponible pour les `pid_manager`
- Exporter la liste complète en CSV — format compatible import Rockwell

---

## 3.4 Traçage Multi-PID

### Flux
```
User dans la liste d'équipements ou dans la liste des lignes
  → Sélectionne la ligne "6"-HC-A1B-001"
  → Clique "Tracer cette ligne"
  → GET /api/v1/pid/trace/line?line_number=6-HC-001&project_id=...
  → Résultat affiché :
      ┌─────────────────────────────────────┐
      │ Traçage : 6"-HC-A1B-001             │
      │                                     │
      │ Apparaît sur 2 PID :                │
      │  → PID-BIPAGA-0101 (Sheet 1)       │
      │     Connecte : V-101 → P-101A      │
      │     Continuation : → Sheet 2       │
      │  → PID-BIPAGA-0102 (Sheet 2)       │
      │     Connecte : P-101A → E-101      │
      │     Continuation : ← Sheet 1      │
      │                                     │
      │ [Ouvrir PID-0101] [Ouvrir PID-0102]│
      └─────────────────────────────────────┘
  → Clic "Ouvrir PID-0101" → éditeur draw.io avec ligne mise en surbrillance
```

---

## 3.5 Library Builder

### Écrans
- **Settings > Modules > PID > Bibliothèque** : liste des objets process

### Flux — Créer un nouvel objet process
```
PID Manager clique "+ Nouvel objet"
  → Étape 1 : Upload SVG depuis AutoCAD ou dessin existant
  → Étape 2 : Configurer le style draw.io (classe CSS, dimensions)
  → Étape 3 : Définir les propriétés :
      Ajouter propriété "tag" (texte, requis)
      Ajouter propriété "design_pressure_barg" (nombre, unité barg)
      Ajouter propriété "capacity_m3h" (nombre)
  → Étape 4 : Placer les points de connexion sur le SVG :
      Point "inlet" à (x:0, y:50) direction W type process
      Point "outlet" à (x:100, y:50) direction E type process
      Point "drain" à (x:50, y:100) direction S type drain
  → Étape 5 : Tester dans un PID test (sandbox)
  → Publier → disponible dans la bibliothèque de tous les PIDs du tenant
```

### Règles métier
- Un objet de bibliothèque a une version — modifier ne casse pas les PIDs existants (ils gardent leur version)
- Le PID Manager peut désactiver un objet (masqué mais existants non affectés)
- Les objets prédéfinis Perenco (`is_predefined=true`) ne peuvent pas être supprimés

---

# 4. MODULE DASHBOARD

## 4.1 Navigation vers un Dashboard

### Sources d'accès
1. **Home page** : dashboard résolu pour le rôle/user au login
2. **Sidebar** : dashboard enregistré comme item de navigation d'un module
3. **Menu > Pilotage** : galerie de tous les dashboards accessibles
4. **Favoris** : si le dashboard a été bookmarké

### Résolution home page (dans l'ordre)
```
1. L'user a configuré un dashboard perso → le sien
2. Son rôle a un dashboard par défaut → celui du rôle (priorité au rôle le plus élevé)
3. Sa BU a un dashboard par défaut → celui de la BU
4. Le tenant a un dashboard global par défaut → celui-là
5. Aucun → page vide avec CTA "Créer votre premier dashboard"
```

---

## 4.2 Mode Visualisation (viewer)

### Ce que l'utilisateur voit
- Tous les widgets chargés avec leurs données
- Indicateur "Dernière mise à jour il y a X min" par widget
- Bouton ↻ par widget pour refresh manuel
- Bouton ⛶ pour passer un widget en plein écran
- Bouton ⬇ pour exporter les données du widget (CSV/Excel/PDF/image)
- Filtres globaux du dashboard (ex: filtre date qui s'applique à tous les widgets qui le supportent)

### Comportement des données
- Au chargement : tous les widgets chargent leurs données en parallèle (pas séquentiellement)
- Widget en erreur : affiche "Données indisponibles — ↻ Réessayer" (ne bloque pas les autres)
- Widget SQL lent : spinner visible, les autres widgets fonctionnent
- Auto-refresh : configurable 0 (manuel) / 30s / 1min / 5min / 15min

---

## 4.3 Mode Édition

### Flux — Créer un dashboard
```
User va dans Pilotage > "+ Nouveau dashboard"
  → Nom du dashboard
  → Il est vide (mode édition activé automatiquement)
  → Clic "+ Ajouter widget" → sélecteur de type :
      Chart | Table | KPI | SQL | Pivot | Carte | Texte
  → Sélectionne "KPI"
  → Modal config KPI :
      Titre : "Production du jour"
      Source : Connecteur "DCS BIPAGA" → champ "daily_oil_bbl"
      Comparaison : Période précédente, afficher %
      Alerte : Rouge si < 10 000 bbl
      Unité : bbl
      → Sauvegarder → widget apparaît sur le canvas
  → Drag widget → repositionner
  → Resize par coin → redimensionner
  → Répéter pour tous les widgets voulus
  → Clic "Terminer l'édition" → mode visualisation
```

### Règles métier mode édition
- Undo/Redo jusqu'à 50 états (Ctrl+Z / Ctrl+Y)
- Auto-save en mode édition : debounce 2s après tout changement de layout
- Supprimer un widget : clic 🗑 → confirmation → supprimé (pas de récupération)
- Dupliquer un widget : clic ⧉ → même config, nouvel UUID, positionné à côté
- En mode édition : les données sont chargées normalement (pas de données mockées)

---

## 4.4 Widget SQL

### Flux
```
User ajoute widget "SQL personnalisé" (requiert permission "dashboard.sql")
  → Éditeur SQL s'ouvre dans la config
  → User tape :
      SELECT
        date_trunc('day', created_at) as jour,
        COUNT(*) as nb_rapports
      FROM documents
      WHERE status = 'published'
        AND entity_id = :entity_id
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 30
  → Bouton "Tester" → exécution sécurisée → aperçu 5 lignes
  → Si valide : "✅ 30 lignes, 2 colonnes, 0.3s"
  → Si invalide :
      "❌ Mot-clé interdit : DELETE"
      "❌ Timeout dépassé (30s)"
  → Choisir l'affichage : Tableau | Graphique ligne | KPI
  → Sauvegarder
```

### Règles de sécurité SQL
- SELECT uniquement (validation stricte, pas de contournement)
- `entity_id = :entity_id` injecté obligatoirement si tables OpsFlux
- Timeout 30s (configurable par admin, max 60s)
- Résultat max 10 000 lignes
- Toute exécution loggée dans audit_log avec user_id + query (tronquée à 300 chars)
- Permission `dashboard.sql` requise (pas accordée par défaut aux editors)

---

## 4.5 Galerie de Dashboards

### Écrans
- `/dashboards` — grille de tous les dashboards accessibles

### Ce que l'utilisateur voit
- Ses dashboards + les dashboards `is_public=true` du tenant
- Preview miniature (screenshot ou placeholder)
- Badges : "Mes dashboards" / "Partagés" / "Public"
- Action "Cloner" → crée une copie personnelle modifiable

### Règles métier
- Cloner un dashboard public : copie complète avec nouveaux UUIDs — indépendant de l'original
- Partager un dashboard : générer un lien de partage (via Share Links Core)
- Supprimer : uniquement par l'owner ou un tenant_admin
- Publier (is_public) : uniquement par tenant_admin

---

# 5. MODULE ASSET REGISTRY

## 5.1 Vue Carte vs Vue Liste

### Toggle Carte / Liste
```
Toolbar de la liste assets → icônes [☰ Liste] [🗺 Carte]
  → Liste : tableau paginé avec colonnes auto-générées
  → Carte : Leaflet/OSM avec markers pour chaque asset géolocalisé
```

### Vue Carte — comportement
- Assets groupés par cluster si zoom insuffisant
- Clic sur cluster → zoom sur la zone
- Clic sur marker → popup avec nom, code, statut, type
- Popup → lien "Voir la fiche" → navigate vers le détail
- Filtres de la liste (statut, type...) appliqués aussi sur la carte

---

## 5.2 Fiche Asset

### Zones de la fiche
```
┌─────────────────────────────────────────────────────┐
│ EN-TÊTE                                             │
│ [Icône type] Plateforme BIPAGA                      │
│ Code : BIP | Statut : En production 🟢              │
│ [Modifier] [Archiver] [Voir sur carte]              │
├─────────────────────────────────────────────────────┤
│ TABS                                                │
│ Informations | Assets liés | Documents | Activité  │
├─────────────────────────────────────────────────────┤
│ TAB "Informations"                                  │
│ Données techniques :                                │
│   Type : Fixed jacket | Profondeur : 25m            │
│   Capacité huile : 15 000 bbl/j                     │
│   Date 1ère production : 2008-03-15                 │
│                                                     │
│ Custom Fields (si configurés par admin) :           │
│   Date inspection : 2024-11-20                      │
│   Certif. COSP : 2026-01-15                         │
└─────────────────────────────────────────────────────┘
```

### Tab "Assets liés"
- Assets enfants (ex: puits rattachés à cette plateforme)
- Assets parents (ex: champ pétrolier parent)
- Relations custom (ex: "Alimenté par" → navire ravitailleur)

### Tab "Documents"
- Documents OpsFlux liés à cet asset via `object_relations`
- Types : PID associé, Rapports de production, Fiches techniques, Certificats
- Lien rapide "Créer un rapport pour cet asset" → pré-remplit le champ Platform dans le formulaire

---

## 5.3 Import CSV — 3 étapes

### Étape 1 : Upload
- Drag & drop ou browse
- Formats acceptés : CSV (UTF-8 ou Latin-1), XLSX
- Taille max : 10MB (protection contre imports massifs)
- Preview des 3 premières lignes immédiatement après upload

### Étape 2 : Mapping
- Colonne CSV à gauche ↔ champ OpsFlux à droite
- Les champs requis sont marqués ⭐
- Suggestion automatique de mapping si les noms de colonnes correspondent (ex: "Code" → "code")
- Aperçu en temps réel des 3 premières lignes avec le mapping appliqué
- Bouton "Valider le mapping" → vérification avant import

### Étape 3 : Résultat
```
Import terminé :
  ✅ 48 assets créés
  🔄 12 assets mis à jour (code existant)
  ❌ 3 erreurs :
      Ligne 5 : "water_depth_m" = "profond" — valeur non numérique
      Ligne 12 : code vide — champ requis
      Ligne 33 : status = "actif" — valeur non reconnue (valeurs: active/inactive/...)
  [Télécharger le rapport d'erreurs CSV]
```

---

## 5.4 Schema Builder (Admin)

### Flux — Créer un type "Zone HSE"
```
Admin > Settings > Asset Registry > "+ Nouveau type"
  → Nom FR : "Zone HSE", Nom EN : "HSE Zone"
  → Icône : Shield, Couleur : #E84855
  → Type parent : (aucun) ou "Plateforme" (pour la hiérarchie)
  → Capacités : ✅ Attachments ✅ Géolocalisation ❌ Workflow
  → "+ Ajouter un champ" :
      Clé : "zone_code", Type : texte court, Requis ✅
      Clé : "risk_level", Type : select, Options : L1/L2/L3/L4, Requis ✅
      Clé : "responsible_id", Type : référence (Contact), Requis ❌
      Clé : "last_audit_date", Type : date, Requis ❌
  → Sauvegarder → type "Zone HSE" disponible immédiatement
  → CRUD auto généré : GET/POST/PUT /api/v1/assets/zone_hse/
  → Vue liste et formulaire générés automatiquement
```

---

# 6. MODULE TIERS

## 6.1 Vue Liste Tiers

### Filtres disponibles
- Type : Fournisseur / Partenaire / Client / Sous-traitant / Autre
- Statut : Actif / Inactif / Liste noire
- Secteur d'activité
- Pays

### Colonnes affichées
- Nom, Nom court, Type, Statut, Ville/Pays, Nb contacts, Dernière activité

### Masquage des tiers virtuels
- Les tiers `is_virtual=true` sont **masqués par défaut** dans la liste
- Toggle "Afficher les contacts standalone" → révèle les virtuels

---

## 6.2 Fiche Tiers

### Tabs
- **Contacts** : liste des contacts du tiers avec rôle/titre/email/téléphone
- **Adresses** : adresses du tiers (principale, facturation, site...)
- **Documents** : documents OpsFlux liés (contrats, certifications, PO...)
- **Informations** : détails société (RC, TVA, secteur, notes)

### Fusion tiers virtuel → tiers réel
```
Contact standalone "Jean Dupont" (tiers virtuel associé)
  → Un vrai tiers "Schlumberger" créé par import CSV
  → On réalise que Jean Dupont travaille chez Schlumberger
  → Sur la fiche du tiers virtuel : bouton "Fusionner avec un tiers"
  → Sélectionner "Schlumberger SA" dans le picker
  → Prévisualisation :
      "Jean Dupont sera rattaché à Schlumberger SA"
      "Les 2 pièces jointes du tiers virtuel seront transférées"
      "Les 1 document lié sera transféré"
  → Confirmer → fusion
  → Tiers virtuel marqué inactif (non supprimé — audit trail)
  → Jean Dupont visible dans les contacts de Schlumberger
```

### Règles métier
- Un tiers `blacklisted` : une bannière rouge s'affiche sur toute sa fiche + ses contacts
- Impossible de créer un document avec un tiers blacklisted comme partie prenante
- La fusion est irréversible (admin uniquement si erreur → re-fusionner dans l'autre sens)
- Un tiers peut avoir plusieurs contacts `is_primary_contact=true` (ex: commercial + technique)

---

## 6.3 Contacts

### Fiche Contact
- Informations personnelles + fonction + coordonnées
- Section "Certifications offshore" (si module PaxLog activé) : HUET, BOSIET, médical, expiry dates
- Section "Tiers" : quel tiers (avec lien)
- Documents liés : CV, certifications scannées

### Création contact rapide (depuis n'importe où)
```
Dans un document, champ "Interlocuteur" (type reference contact)
  → Pas de contact trouvé pour "Marie Leblanc"
  → Bouton "+ Créer ce contact"
  → Mini-formulaire inline : prénom, nom, email, téléphone, tiers (optionnel)
  → Si pas de tiers → tiers virtuel créé silencieusement
  → Contact disponible immédiatement dans le picker
```

---

# 7. MODULE AI & MCP

## 7.1 Intelligence Panel — Briefing journalier

### Ce que l'utilisateur voit à l'ouverture du panneau IA (matin)
```
Assistant OpsFlux
Bonjour Hervé. Vendredi 14 mars 2025.

🔴 URGENT (2)
┌─────────────────────────────────────┐
│ ⏰ PID-BIPAGA-0101 en attente depuis 4j│
│ Assigné par Y. Martin               │
│            [Valider maintenant]     │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ⏰ Rapport journalier hier non créé │
│ Vous en créez habituellement avant 8h│
│            [Créer]                  │
└─────────────────────────────────────┘

🟡 AUJOURD'HUI (1)
┌─────────────────────────────────────┐
│ 📋 Deadline PRC-BIPAGA-0089 demain  │
│ À valider avant le 15/03            │
│            [Voir le document]       │
└─────────────────────────────────────┘

💡 SUGGESTIONS
• Rapport hebdo BIPAGA : modèle RPT-0042 peut servir de base
• 3 brouillons inactifs > 7 jours dans BIPAGA

─────────────────────────────────────
[💬 Demander à OpsFlux...]
```

### Règles d'affichage
- Max 3 items "URGENT", max 5 "AUJOURD'HUI", max 3 "SUGGESTIONS"
- Dismiss d'un item → disparaît immédiatement (PATCH /recommendations/{id}/dismiss)
- "Plus tard" → snooze 4h
- Clic sur une action → navigation + fermer le briefing

---

## 7.2 Chat RAG

### Flux — Question sur le corpus
```
User tape : "Quelle était la pression du séparateur V-101 sur BIPAGA en janvier 2025 ?"

OpsFlux cherche dans les documents...

Réponse (3s plus tard) :
"D'après le rapport de production du 15 janvier 2025 [RPT-PCM-BIPAGA-0412],
la pression de fonctionnement du séparateur V-101 était de 42.3 bar.
Le 22 janvier [RPT-PCM-BIPAGA-0419], elle était de 41.8 bar suite à l'arrêt
de la pompe P-101A."

Sources :
📄 RPT-PCM-BIPAGA-0412 — 15/01/2025
📄 RPT-PCM-BIPAGA-0419 — 22/01/2025

[Voir les documents] [Poser une autre question]
```

### Comportements attendus
- Si aucune source trouvée : "Je n'ai pas trouvé cette information dans les documents OpsFlux. Vérifiez si le rapport correspondant a bien été publié."
- Si question hors sujet : "Je suis l'assistant documentaire OpsFlux. Je peux vous aider à trouver des informations dans vos rapports et procédures."
- Clic sur une source → navigate vers le document concerné

---

## 7.3 Commandes MCP (Actions)

### Exemples de commandes supportées
```
User : "Génère-moi le rapport journalier BIPAGA pour hier"
  → OpsFlux détecte intention "generate_from_template"
  → "Je vais créer un rapport journalier pour BIPAGA daté du 13/03/2025.
     Je vais utiliser le template 'Rapport Journalier Production'.
     Confirmer ?"
  → User confirme → rapport créé en brouillon
  → "✅ Rapport RPT-PCM-BIPAGA-0443 créé. Ouvrir ?"

User : "Montre-moi mes validations en attente"
  → tool "get_pending_validations"
  → Résultat affiché dans le chat :
      "Vous avez 3 documents à valider :
       • PID-BIPAGA-0101 (4j) — Urgent
       • RPT-PCM-BIPAGA-0441 (1j)
       • PRC-BIPAGA-0089 (0j)
       [Ouvrir la liste]"

User : "Délègue mes validations à Marie jusqu'à vendredi"
  → OpsFlux cherche "Marie" dans les contacts
  → "Je vais déléguer vos validations à Marie Leblanc (m.leblanc@perenco.com)
     jusqu'au vendredi 19 mars 2025.
     Confirmer ?"
  → Confirmation → délégation créée + Marie notifiée
```

### Règles de sécurité
- Actions critiques toujours avec confirmation explicite
- Le chat ne peut pas faire plus que l'utilisateur (RBAC identique)
- Actions IA tracées dans l'audit log avec mention "Action IA pour [user]"
- Max 50 appels MCP par minute par utilisateur

---

## 7.4 Auto-complétion dans l'éditeur

### Comportement
```
Rédacteur écrit dans une section texte libre :
"La pression de fonctionnement du séparateur V-101 est de "
                                                          ↑ curseur
  → 1 seconde de pause → requête LLM avec contexte
  → Suggestion inline apparaît en gris : "42.3 bar (valeur normale)"
  → Tab ou → pour accepter
  → Esc ou continuer à taper pour ignorer
```

### Règles
- Désactivable dans les préférences utilisateur
- Ne fonctionne que dans les blocs "rich_text" (pas dans les champs formulaire)
- Contexte envoyé au LLM : les 200 mots précédents + les form_data du document courant
- Délai de déclenchement : 1s d'inactivité (configurable)
- Désactivé si le document est verrouillé

---

## 7.5 Extraction Legacy

### Flux
```
User dans un document → bouton "Importer depuis legacy"
  → Modal :
      "Uploadez un rapport existant (PDF ou Word) pour pré-remplir ce document"
  → Upload d'un rapport Word 2018
  → Extraction :
      "J'ai trouvé ces données dans votre document :"
      ┌──────────────────────────────────────────┐
      │ Date du rapport    : 2018-07-14   ✅      │
      │ Plateforme         : BIPAGA       ✅      │
      │ Production huile   : 11 250 bbl/j ✅      │
      │ Pression séparateur: 41.5 bar     ✅      │
      │ Débit gaz          : non trouvé   ⚠      │
      │ Arrêts             : 2 entrées    ✅      │
      └──────────────────────────────────────────┘
      "Voulez-vous pré-remplir le formulaire avec ces données ?"
  → Confirmer → form_data pré-rempli
  → L'utilisateur vérifie et corrige si besoin
```
