# Système TravelWiz - Chargement Bateau & Back Cargo

## 📋 Vue d'ensemble

Système complet de digitalisation du processus de chargement bateau et retours site (back cargo), remplaçant l'ancien processus papier par une solution traçable et efficace.

## ✅ Architecture du Système

### 1. Processus Principaux

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSUS BACK CARGO                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. CHARGEMENT BATEAU                                            │
│     ├── Création manifeste (3 sources: Magasin/Yard/Externe)    │
│     ├── Sélection emballages (8 types)                          │
│     ├── Étiquetage avec code couleur par destination            │
│     ├── Validation multi-niveaux                                │
│     └── Diffusion document                                       │
│                                                                   │
│  2. RETOURS SITE (5 types)                                       │
│     ├── Déchets (DIS, DIB, DMET)                                │
│     ├── Matériel sous-traitant                                  │
│     ├── Réintégration stock                                     │
│     ├── Rebut/Ferraille                                         │
│     └── Stockage Yard                                            │
│                                                                   │
│  3. ARRIVÉE & DÉCHARGEMENT                                       │
│     ├── Planning d'arrivée navires                              │
│     ├── Contrôle physique à bord                                │
│     ├── Vérification conformité manifeste                       │
│     ├── Détection anomalies                                     │
│     └── Rapport de déchargement                                  │
│                                                                   │
│  4. DISPATCH AU YARD                                             │
│     ├── Réception zone back cargo                               │
│     ├── Vérification bordereaux ↔ colis                         │
│     ├── Notification destinataires                              │
│     ├── Gestion laissez-passer                                  │
│     └── Signature réception                                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Flux de Données

**CHARGEMENT →**
```
Demandeur → Manifeste → Validation Émetteur → Validation Capitaine →
Chargement → En Transit → Arrivée → Contrôle → Déchargement → Dispatch
```

**RETOUR SITE →**
```
Site → Bordereau Retour → Validation Company Man → Validation OMAA →
Signature Capitaine → Transit → Arrivée → Contrôle → Dispatch selon Type
```

## 🎯 Fonctionnalités Implémentées

### Phase 1: Types et Architecture ✅

**Fichier: `/lib/travelwiz-back-cargo-types.ts`**

Types principaux:
- `PackagingType` - 8 types d'emballages
- `DestinationType` - 6 destinations
- `VesselType` - 6 navires
- `BackCargoType` - 5 types de retours
- `ManifestWorkflow` - États du workflow
- `UnloadingDiscrepancy` - Types d'anomalies

Interfaces complètes:
- `LoadingManifest` - Manifeste de chargement complet
- `BackCargoManifest` - Retour site avec règles métier
- `VesselArrival` - Arrivée et contrôle bateau
- `UnloadingReport` - Rapport de déchargement
- `YardDispatch` - Dispatch au Yard
- `PackageLabel` - Étiquette colis
- `ComplianceRule` - Règles de conformité par type

### Phase 2: Formulaires et Workflows 📝

#### 2.1 Création Manifeste de Chargement

**Composant: `/components/travelwiz/manifests/create-manifest-drawer.tsx`**

Sections du formulaire:
1. **Informations générales**
   - Lieu de prise en charge (dropdown)
   - Date de mise à disposition (date picker)
   - Date de livraison souhaitée (date picker)
   - Navire souhaité (dropdown)
   - Destination (dropdown avec code couleur)

2. **Service et destinataire**
   - Service destinataire (input)
   - Nom de la personne concernée (input)
   - Source (Magasin/Yard/Prestataire externe)

3. **Liste du matériel** (Dynamic list)
   - N° article / Description
   - Type d'emballage (dropdown)
   - Quantité (number)
   - Poids (kg)
   - Observations (textarea)
   - Bouton [+ Ajouter article]

4. **Informations administratives**
   - Service émetteur
   - Nom du demandeur
   - Date de création (auto)

**Validations automatiques:**
- Poids total calculé
- Nombre total de colis
- Vérification champs obligatoires
- Génération N° manifeste unique

#### 2.2 Gestion Retours Site (5 Types)

**Composant: `/components/travelwiz/back-cargo/create-back-cargo-drawer.tsx`**

**Type 1: Déchets (DIS/DIB/DMET)**
```typescript
Règles obligatoires:
✓ Tous les bacs marqués (site/rig de provenance)
✓ Bordereau d'expédition joint
✓ Zone de stockage dédiée assignée
✓ Type de déchet précisé (DIS/DIB/DMET)
```

**Type 2: Matériel Sous-traitant**
```typescript
Règles obligatoires:
✓ Inventaire détaillé (obligatoire)
✓ Signature site + signature responsable sous-traitant
✓ Laissez-passer de retrait (initié par chargé d'affaires PERENCO)
✓ Nom du sous-traitant
✓ Copie bleue laissez-passer → Magasin
✓ Bordereau signé par Yard Officer
```

**Type 3: Réintégration Stock**
```typescript
Règles obligatoires:
✓ Inventaire avec codes articles SAP
✓ Désignation précise
✓ Quantités exactes
✓ Formulaire de réintégration signé
✓ Destination: Magasin
```

**Type 4: Rebut/Ferraille**
```typescript
Règles obligatoires:
✓ Mention "à rebuter et/ou à ferrailler" sur bordereau
✓ Si mention manquante:
  - Prise de photos (upload)
  - Envoi aux services concernés
  - Attente instruction avant dispatch
✓ Acheminement direct zone ferraille
```

**Type 5: Stockage Yard (non SAP)**
```typescript
Règles obligatoires:
✓ Mention "stockage Yard" sur bordereau
✓ Justification obligatoire (textarea)
✓ Raison de stockage documentée
```

#### 2.3 Arrivée Bateau et Déchargement

**Composant: `/components/travelwiz/vessel-arrivals/arrival-control.tsx`**

**Étapes du contrôle:**

1. **Montée à bord**
   - Agent: Freight & Handling OU Yard
   - Récupération bordereaux papier
   - Accès liste manifestes attendus

2. **Contrôle physique** (Checklist interactive)
   - [ ] Récupération bordereaux
   - [ ] Contrôle colis sur pont
   - [ ] Vérification poids déclarés
   - [ ] Vérification élingages
   - [ ] Comparaison manifeste électronique

3. **Détection anomalies** (avec photos)
   - Colis manquants (scan QR code manifeste)
   - Colis endommagés (photos + description)
   - Colis non manifestés (ajout manuel)
   - Écarts de poids (saisie)

4. **Rapport de déchargement**
   ```
   Informations incluses:
   - Nombre de colis reçus
   - Poids total
   - Numéros des paniers/conteneurs
   - Liste des anomalies
   - Photos des dommages
   - Signature inspecteur
   - Date et heure
   ```

5. **Diffusion automatique**
   - Hiérarchie
   - Yard
   - Sites concernés
   - Destinataires

#### 2.4 Dispatch au Yard

**Composant: `/components/travelwiz/yard-dispatch/dispatch-management.tsx`**

**Zone: Back Cargo Yard**

1. **Réception**
   - Scan QR code colis
   - Vérification bordereaux ↔ colis physiques
   - Détection écarts
   - Statut: "Réceptionné au Yard"

2. **Notification automatique**
   - Email/SMS au destinataire
   - Détails: N° bordereau, quantité, poids, observations
   - Lien pour confirmer retrait

3. **Gestion par type de retour**

   **Déchets:**
   - Auto-assignation zone déchets dédiée
   - Notification service HSE
   - Pas de signature requise

   **Sous-traitant:**
   - Génération laissez-passer
   - Copie bleue → Magasin (auto)
   - Signature Yard Officer + Sous-traitant
   - Scan laissez-passer à la sortie

   **Réintégration:**
   - Notification Magasin
   - Vérification inventaire SAP
   - Signature Magasinier
   - Mise à jour stock SAP (integration)

   **Rebut/Ferraille:**
   - Si mention OK: → Zone ferraille (auto)
   - Si mention manquante: En attente validation
   - Photos obligatoires
   - Notification services concernés

   **Stockage Yard:**
   - Assignation emplacement Yard
   - Enregistrement raison stockage
   - Pas de délai de retrait

4. **Signature électronique**
   - Destinataire signe sur tablette/mobile
   - Capture signature + date/heure
   - Document PDF généré automatiquement
   - Archivage dans GED

## 📊 Tableau de Bord

### Composant: `/components/travelwiz/dashboard/back-cargo-dashboard.tsx`

**KPIs Affichés:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Manifestes en Attente    │  Bateaux Attendus (7j)              │
│         12                │         5                            │
└─────────────────────────────────────────────────────────────────┘
│  Retours à Traiter        │  Anomalies Actives                  │
│         8                 │         3                            │
└─────────────────────────────────────────────────────────────────┘
```

**Graphiques:**
- Timeline arrivées navires (7 jours)
- Retours par type (donut chart)
- Anomalies par type (bar chart)
- Taux de conformité (gauge)

**Listes d'actions:**
- Manifestes à valider
- Retours en attente dispatch
- Anomalies non résolues
- Laissez-passer en attente

## 🔔 Notifications et Alertes

### Notifications automatiques:

1. **Création manifeste** → Capitaine + Logistique
2. **Validation manifeste** → Demandeur + Capitaine
3. **Arrivée bateau** → Planning Logistique (24h avant)
4. **Anomalie détectée** → Hiérarchie + Sites + Destinataires
5. **Réception Yard** → Destinataire
6. **Laissez-passer créé** → Sous-traitant + Magasin
7. **Retard dispatch** → Yard Officer (si >48h)

### Alertes:

```typescript
Criticité HAUTE:
- Colis manquants
- Colis endommagés
- Mention "à ferrailler" manquante
- Laissez-passer non signé >72h

Criticité MOYENNE:
- Écarts de poids >10%
- Colis non manifestés
- Retard dispatch >48h

Criticité BASSE:
- Bordereau incomplet (infos manquantes)
- Photos manquantes
```

## 🎨 Design Principles

### 1. Mobile-First
- Agents sur le terrain (tablettes)
- Scan QR codes
- Prise de photos
- Signature électronique

### 2. Progressive Disclosure

**Niveau 1 - Dashboard:**
- Vue d'ensemble KPIs
- Manifestes du jour
- Actions requises

**Niveau 2 - Liste détaillée:**
- Filtres avancés
- Tri personnalisé
- Export Excel/PDF

**Niveau 3 - Détails:**
- Historique complet
- Documents attachés
- Logs d'activité

### 3. Workflow Visuel

Chaque manifeste/retour affiche son état actuel:
```
Brouillon → En attente validation → Validé → Chargé →
En transit → Arrivé → Contrôlé → Dispatché → Retiré
```

Avec indicateurs visuels:
- 🟡 En attente
- 🔵 En cours
- 🟢 Complété
- 🔴 Anomalie

## 📦 Structure des Fichiers

```
frontend/
├── lib/
│   ├── travelwiz-back-cargo-types.ts       # Types complets
│   └── travelwiz-back-cargo-data.ts        # Données mock + utilitaires
│
├── components/travelwiz/
│   ├── dashboard/
│   │   └── back-cargo-dashboard.tsx        # Dashboard principal
│   │
│   ├── manifests/
│   │   ├── create-manifest-drawer.tsx      # Création manifeste
│   │   ├── manifest-card.tsx               # Carte manifeste
│   │   ├── manifest-detail-dialog.tsx      # Détails manifeste
│   │   └── manifest-validation-flow.tsx    # Workflow validation
│   │
│   ├── back-cargo/
│   │   ├── create-back-cargo-drawer.tsx    # Création retour
│   │   ├── back-cargo-card.tsx             # Carte retour
│   │   ├── compliance-checker.tsx          # Vérif conformité
│   │   └── type-specific-forms/
│   │       ├── waste-form.tsx              # Formulaire déchets
│   │       ├── subcontractor-form.tsx      # Formulaire sous-traitant
│   │       ├── reintegration-form.tsx      # Formulaire réintégration
│   │       ├── scrap-form.tsx              # Formulaire rebut
│   │       └── yard-storage-form.tsx       # Formulaire stockage
│   │
│   ├── vessel-arrivals/
│   │   ├── arrival-control.tsx             # Contrôle arrivée
│   │   ├── physical-check-form.tsx         # Formulaire contrôle
│   │   ├── discrepancy-reporter.tsx        # Rapport anomalies
│   │   └── unloading-report.tsx            # Rapport déchargement
│   │
│   ├── yard-dispatch/
│   │   ├── dispatch-management.tsx         # Gestion dispatch
│   │   ├── verification-form.tsx           # Vérification colis
│   │   ├── exit-pass-generator.tsx         # Génération laissez-passer
│   │   └── signature-capture.tsx           # Capture signature
│   │
│   └── shared/
│       ├── package-label-generator.tsx     # Génération étiquettes
│       ├── qr-code-scanner.tsx             # Scanner QR
│       ├── photo-uploader.tsx              # Upload photos
│       └── pdf-generator.tsx               # Génération PDF
│
└── app/travelwiz/
    ├── dashboard/page.tsx                  # Page dashboard
    ├── manifests/
    │   ├── page.tsx                        # Liste manifestes
    │   └── [id]/page.tsx                   # Détail manifeste
    ├── back-cargo/
    │   ├── page.tsx                        # Liste retours
    │   └── [id]/page.tsx                   # Détail retour
    ├── vessel-arrivals/
    │   ├── page.tsx                        # Liste arrivées
    │   └── [id]/control/page.tsx           # Contrôle arrivée
    └── yard-dispatch/
        ├── page.tsx                        # Zone dispatch
        └── [id]/page.tsx                   # Détail dispatch
```

## 🚀 Roadmap d'Implémentation

### ✅ Phase 1: Architecture & Types (FAIT)
- Analyse cahier des charges
- Définition types TypeScript
- Structure de données

### 🔄 Phase 2: Formulaires de Base (EN COURS)
- Création manifeste chargement
- Création retour site
- Validation workflow

### 📋 Phase 3: Contrôle et Déchargement
- Interface contrôle arrivée
- Rapport de déchargement
- Gestion anomalies

### 📋 Phase 4: Dispatch Yard
- Zone de dispatch
- Génération laissez-passer
- Signature électronique

### 📋 Phase 5: Intégrations
- Scan QR codes
- Upload photos
- Génération PDF
- Envoi notifications

### 📋 Phase 6: API Backend
- Endpoints REST
- Validation serveur
- Stockage documents
- Envoi emails

## 💡 Améliorations Futures

1. **IA & Machine Learning**
   - Prédiction anomalies basée sur historique
   - Suggestions d'optimisation de chargement
   - Détection automatique d'objets sur photos

2. **IoT Integration**
   - Capteurs de poids sur navires
   - GPS tracking des colis
   - Alertes temps réel

3. **Analytics Avancés**
   - Tableaux de bord personnalisés
   - Rapports automatisés
   - Prévisions de charge

4. **Mobile App**
   - App native iOS/Android
   - Mode offline
   - Sync automatique

---

**Système conçu pour être:**
- ✅ Sans papier (100% digital)
- ✅ Traçable (historique complet)
- ✅ Conforme (règles métier intégrées)
- ✅ Mobile (terrain + bureau)
- ✅ Évolutif (architecture modulaire)
