# Cahier des Charges Fonctionnel — Asset Registry

> Ce document décrit le comportement attendu du module Asset Registry.
> Il constitue le référentiel géographique et physique partagé par tous les modules OpsFlux.

---

## Sommaire

1. [Rôle et positionnement](#1-rôle-et-positionnement)
2. [Hiérarchie des assets](#2-hiérarchie-des-assets)
3. [Données d'un asset](#3-données-dun-asset)
4. [Types d'assets et capacités](#4-types-dassets-et-capacités)
5. [Règles HSE par asset](#5-règles-hse-par-asset)
6. [Gestion du référentiel](#6-gestion-du-référentiel)
7. [Impact sur les autres modules](#7-impact-sur-les-autres-modules)

---

## 1. Rôle et positionnement

L'Asset Registry est le **référentiel géographique et physique partagé par tous les modules OpsFlux**. C'est la source de vérité qui répond à la question : "Quels sont nos sites, nos bases, nos plateformes, et quelle est leur capacité d'accueil ?"

Tous les autres modules font référence aux assets :
- PaxLog : "Cette AdS est pour aller sur quel site ?"
- Planner : "Cette activité se déroule sur quel asset, et cet asset a quelle capacité ?"
- TravelWiz : "Ce voyage va de quelle base vers quel site ?"
- Tiers : "Ce prestataire travaille sur quels assets ?"

Sans l'Asset Registry correctement configuré, aucun autre module ne peut fonctionner.

---

## 2. Hiérarchie des assets

### 2.1 Structure arborescente

Les assets sont organisés en arbre hiérarchique. Cette hiérarchie reflète l'organisation géographique réelle de Perenco Cameroun :

```
Perenco Cameroun (entité racine)
├── Champ Munja
│   ├── Plateforme ESF1
│   │   ├── Zone de production
│   │   └── Hébergement ESF1
│   ├── Plateforme ESF2
│   └── Plateforme RDRW
├── Champ Wouri
│   ├── Site WEST
│   └── Site EAST
├── Base logistique Wouri (port)
│   ├── Quai d'embarquement
│   └── Hangar cargo
└── Aéroport Douala
    └── Zone d'embarquement hélicoptère
```

La profondeur de l'arbre est illimitée. L'administrateur construit la hiérarchie selon la réalité opérationnelle.

### 2.2 Importance de la hiérarchie

La hiérarchie n'est pas seulement organisationnelle — elle a des effets concrets :

**Héritage des règles HSE** : Si une règle HSE est définie au niveau "Perenco Cameroun" (ex : formation H2S obligatoire pour tous), tous les sites en héritent automatiquement. Une règle définie sur "Munja" s'applique à toutes les plateformes de Munja.

**Droits par périmètre** : Un CDS peut avoir ses droits restreints à un sous-arbre (ex : "tous les assets de Munja").

**Agrégation de capacité** : La capacité d'un champ est la somme des capacités de ses plateformes.

---

## 3. Données d'un asset

### 3.1 Informations générales

Chaque asset dispose de :
- **Nom** et **code** (identifiant court unique, ex : "ESF1", "MUNJA", "BASE-W")
- **Type** : détermine son comportement dans les autres modules (voir §4)
- **Description** : texte libre décrivant le site
- **Localisation** : coordonnées GPS pour l'affichage sur la carte
- **Statut** : actif, inactif, archivé
- **Parent** : position dans la hiérarchie

### 3.2 Coordonnées GPS

Les coordonnées permettent d'afficher l'asset sur la carte interactive d'OpsFlux et de calculer des distances (pour les estimations de durée de voyage).

---

## 4. Types d'assets et capacités

### 4.1 Types disponibles

Le type d'un asset détermine son rôle logistique :

| Type | Description | Capacité PAX ? | Point d'embarquement ? |
|---|---|---|---|
| `platform` | Plateforme offshore / site industriel | ✓ | — |
| `base` | Base logistique (port, aéroport) | — | ✓ |
| `jetty` | Jetée d'embarquement | — | ✓ |
| `office` | Bureau / siège | ✓ | — |
| `room` | Salle ou zone dans un site | ✓ | — |
| `equipment` | Équipement (navire, hélico) | ✓ | — |
| `yard` | Aire de stockage | — | — |

Les assets de type `base` et `jetty` sont des **points logistiques** — on part de là pour aller sur site, mais on n'y réside pas (pas de quota PAX résidentiel).

### 4.2 Capacité PAX

Pour les assets qui accueillent des personnes (plateformes, offices), deux valeurs de capacité sont définies :

**Capacité totale** (`max_pax`) : le nombre maximum de personnes pouvant être présentes simultanément sur le site, toutes catégories confondues.

**Quota exploitation permanente** (`permanent_ops_quota`) : le nombre de personnes d'exploitation permanente qui occupent toujours des places. Ce quota est soustrait en premier de la capacité totale avant de calculer la disponibilité pour les projets et activités ponctuelles.

Exemple : Munja a une capacité de 80 personnes. Le quota d'exploitation permanente est de 12. La capacité disponible pour les projets est donc de 68 personnes.

### 4.3 Capacité par entreprise

Un asset peut avoir une limite de PAX par entreprise sous-traitante. Si DIXSTONE est limitée à 15 personnes sur ESF1, une AdS dépassant cette limite sera bloquée (ou déclenche une alerte selon la configuration).

---

## 5. Règles HSE par asset

### 5.1 Prérequis d'accès

Chaque asset peut définir des prérequis HSE pour y accéder. Ces prérequis sont des types de certifications que tout intervenant doit posséder et avoir valides avant d'être autorisé sur le site.

Exemple de configuration pour ESF1 :
- Formation H2S Awareness → obligatoire, valide < 2 ans
- BOSIET (Sécurité offshore) → obligatoire, valide < 4 ans
- Aptitude médicale → obligatoire, valide < 1 an
- Port du casque certifié → obligatoire (vérification au check-in)

### 5.2 Héritage des prérequis

Les prérequis d'un asset parent s'appliquent automatiquement à tous ses enfants. Un enfant peut avoir des prérequis supplémentaires.

Si "Perenco Cameroun" exige H2S pour tous, et que "Munja" exige en plus BOSIET, un intervenant sur ESF1 doit avoir les deux : H2S (hérité de Perenco Cameroun) + BOSIET (défini sur Munja, hérité par ESF1).

Un asset enfant ne peut pas annuler un prérequis défini par son parent.

### 5.3 Durée minimale de validité

Pour chaque type de certification, l'asset peut définir une durée minimale résiduelle. Par exemple : "Le BOSIET doit être valide pendant au moins 30 jours au-delà de la date de fin du séjour". Un intervenant dont le BOSIET expire pendant son séjour prévu sera bloqué même si la certification est encore valide au moment de la soumission.

### 5.4 Période de grâce

Certains types de certification peuvent bénéficier d'une période de grâce. Pendant cette période (ex : 30 jours après l'expiration), la certification est considérée comme valide avec un avertissement, mais pas bloquante. Cela permet de ne pas bloquer des intervenants dont le renouvellement est en cours.

---

## 6. Gestion du référentiel

### 6.1 Qui gère les assets ?

Seuls les utilisateurs avec le rôle **ASSET_ADMIN** (ou DO) peuvent créer, modifier, ou désactiver des assets.

### 6.2 Création et modification

La création d'un asset se fait depuis l'interface de gestion de la hiérarchie. L'administrateur :
1. Choisit le parent dans la hiérarchie
2. Renseigne les informations (nom, code, type, coordonnées)
3. Définit la capacité (si applicable)
4. Configure les prérequis HSE (ou hérite des parents sans rien faire)

La modification d'un asset existant est possible à tout moment. La modification de la capacité est historisée (pour traçabilité des changements de politique).

### 6.3 Désactivation d'un asset

Un asset ne peut pas être désactivé s'il existe des AdS actives ou des activités Planner en cours sur cet asset. L'administrateur doit d'abord résoudre ces situations.

Un asset désactivé n'apparaît plus dans les formulaires de création (on ne peut plus créer de nouvelle AdS pour cet asset), mais les historiques sont conservés.

### 6.4 Import CSV

Pour la mise en service initiale, les assets peuvent être importés en masse depuis un fichier CSV. Le format d'import permet de définir toute la hiérarchie d'un coup.

---

## 7. Impact sur les autres modules

### 7.1 PaxLog

Chaque AdS est associée à un asset de destination. OpsFlux vérifie automatiquement la compliance HSE de chaque PAX par rapport aux prérequis de l'asset de destination. Un PAX non conforme voit ses certifications manquantes listées clairement.

### 7.2 Planner

Chaque activité planifiée consomme de la capacité PAX sur un asset. Le Planner vérifie que la somme des quotas PAX de toutes les activités approuvées ne dépasse pas la capacité disponible de l'asset.

### 7.3 TravelWiz

Les assets de type `base` et `jetty` sont les points de départ et d'arrivée des voyages. Les assets de type `platform` sont les destinations.

### 7.4 Cartographie

Tous les assets géolocalisés apparaissent sur la carte interactive. La carte affiche leur statut en temps réel : nombre de PAX présents, capacité résiduelle, alertes actives.
