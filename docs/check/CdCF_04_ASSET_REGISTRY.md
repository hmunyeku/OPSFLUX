# OpsFlux — Cahier des Charges Fonctionnel
# MODULE REGISTRE D'ASSETS (ASSET REGISTRY)
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit les fonctionnalités du module Registre d'Assets. Il couvre la gestion du patrimoine physique de Perenco : champs pétroliers, plateformes, puits et équipements logistiques.

---

## 1. VISION GÉNÉRALE

### 1.1 Finalité

Le Registre d'Assets est l'inventaire officiel des actifs physiques de Perenco. Il constitue la source de vérité sur les installations, leur état et leurs caractéristiques techniques. Tous les autres modules (documents, PID, tableaux de bord) peuvent référencer ces assets.

### 1.2 Hiérarchie des assets

Les assets de Perenco s'organisent naturellement en hiérarchie :
```
Champ pétrolier (ex : BIPAGA Field)
  └── Plateforme (ex : Plateforme BIPAGA)
        └── Puits (ex : BIPAGA-04)
        └── Équipement logistique (ex : Navire ravitailleur)
```

Un asset peut avoir des assets enfants (un champ pétrolier contient plusieurs plateformes).

---

## 2. TYPES D'ASSETS PERENCO

### 2.1 Champ pétrolier (oil_field)

Un champ pétrolier est une zone géographique contenant une ou plusieurs installations de production.

**Données principales** :
- Nom et code du champ
- Pays et région
- Statut (actif, en développement, en abandonnement)
- Date de découverte
- Date de première production
- Type de gisement (offshore, onshore)
- Profondeur des réservoirs
- Type de fluide produit (huile, gaz, condensat)
- Partenaires opérateurs et leurs participations
- Autorité de tutelle

**Données de production** :
- Production cumulée (huile, gaz)
- Réserves prouvées restantes
- Taux de déclin annuel

### 2.2 Plateforme (platform)

Une plateforme est une installation industrielle fixe ou flottante sur laquelle sont concentrés les équipements de traitement.

**Données principales** :
- Nom et code de la plateforme
- Type (jacket fixe, FPSO, FSO, installation terrestre)
- Champ auquel elle appartient
- Coordonnées GPS (latitude, longitude)
- Statut (en production, en maintenance, à l'arrêt, démantelée)
- Date de mise en service
- Date de déclassement prévue

**Données techniques** :
- Profondeur d'eau (pour les installations offshore)
- Capacité de traitement (huile, gaz, eau)
- Nombre de puits connectés
- Personnel maximum en hébergement
- Autorité d'inspection compétente
- Dernier certificat de conformité (COSP)
- Date d'expiration du certificat

**Contacts** :
- Responsable de plateforme
- Responsable HSE
- Contact urgence

### 2.3 Puits (well)

Un puits est une installation de forage connectée à une plateforme ou indépendante.

**Données principales** :
- Identifiant du puits (ex : BIPAGA-04)
- Type (producteur, injecteur eau, injecteur gaz, observateur)
- Plateforme parente
- Statut (produisant, injecté, suspendu, abandonné)
- Date de forage
- Date de complétion
- Profondeur totale forée (MD) et vraie (TVD)

**Données géologiques et production** :
- Formation cible
- Coordonnées de surface (latitude, longitude)
- Coordonnées de fond de puits
- Débit journalier actuel (huile, gaz, eau)
- Watercut actuel (%)
- GOR actuel (gaz-huile)
- Pression de tête de puits (WHP)
- Pression de fond statique

**Données de complétion** :
- Type de complétion (simple, double, multilateral)
- Diamètre du tubing
- Perforations (profondeur, intervalle)
- Mode de production (naturel, gas-lift, pompe électrique submersible)

### 2.4 Équipement logistique (logistics_asset)

Équipements de support aux opérations : navires, véhicules, équipements de levage, etc.

**Données principales** :
- Nom et code de l'équipement
- Type (navire ravitailleur, barge de pose, hélicoptère, grue, véhicule)
- Statut (disponible, mobilisé, en maintenance, désarmé)
- Prestataire propriétaire / opérateur
- Contrat associé (numéro et dates)
- Date de dernière inspection
- Date de prochaine inspection
- Certification (type, validité, autorité)

---

## 3. GESTION DES ASSETS

### 3.1 Création d'un asset

**Via le formulaire** : L'utilisateur crée un asset via le formulaire Quick Entry (champs obligatoires uniquement) puis complète la fiche. Un asset peut être créé à tout niveau de la hiérarchie.

**Via l'import CSV** : L'administrateur peut importer un lot d'assets depuis un fichier CSV ou Excel. Un assistant de mapping des colonnes facilite la correspondance entre les colonnes du fichier et les champs OpsFlux.

### 3.2 Modification d'un asset

Les données d'un asset sont modifiables directement dans sa fiche, champ par champ (double-clic sur le champ). Chaque modification est sauvegardée immédiatement et tracée dans l'historique.

### 3.3 Archivage et déclassement

Un asset ne se supprime pas, il s'archive. Un asset archivé disparaît des listes standard mais reste consultable via la recherche ou le filtre "Archivés". Toutes ses données et son historique sont conservés.

---

## 4. FICHE D'UN ASSET

### 4.1 Structure de la fiche

La fiche d'un asset est organisée en onglets :

**Informations** — Tous les champs de données du type d'asset, incluant les champs personnalisés définis par l'administrateur. Les champs standard et personnalisés sont présentés ensemble, organisés en sections thématiques.

**Assets liés** — Les assets parent et enfants dans la hiérarchie. Les relations custom (ex : "alimenté par", "relié à").

**Documents** — Les documents OpsFlux liés à cet asset : fiches techniques, rapports d'inspection, procédures, PID associés.

**Activité** — L'historique complet des modifications sur la fiche.

### 4.2 Informations affichées en en-tête

L'en-tête de la fiche affiche toujours :
- L'icône du type d'asset
- Le nom et le code de l'asset
- Le statut avec sa couleur (vert = actif, orange = maintenance, rouge = arrêt, gris = archivé)
- Le fil d'Ariane hiérarchique (ex : BIPAGA Field > Plateforme BIPAGA)

---

## 5. VUES DE LISTE

### 5.1 Vue tableau

La vue standard présente les assets sous forme de tableau paginé. Les colonnes affichées sont configurées selon le type d'asset.

Les filtres disponibles dépendent du type d'asset :
- Statut
- Type de gisement / type de plateforme / type de puits
- Champ parent / plateforme parente
- BU
- Pays ou région
- Recherche textuelle (nom, code)

### 5.2 Vue carte

Pour les types d'assets disposant de coordonnées géographiques (champs, plateformes, puits), une vue carte est disponible. Les assets sont représentés par des markers sur la carte.

- Le clic sur un marker ouvre un résumé de l'asset
- Le survol affiche le nom et le statut
- Les markers sont colorés selon le statut de l'asset
- Les assets peuvent être filtrés depuis la vue carte avec les mêmes filtres que la vue tableau
- Les clusters regroupent les markers proches à faible zoom

### 5.3 Bascule vue / liste

L'utilisateur bascule entre la vue tableau et la vue carte avec les boutons dans la barre d'outils. Sa préférence est mémorisée par type d'asset.

---

## 6. IMPORT EN MASSE

### 6.1 Processus d'import

L'import se déroule en 3 étapes guidées :

**Étape 1 — Upload du fichier**
L'utilisateur dépose ou sélectionne un fichier CSV ou Excel. Un aperçu des 5 premières lignes est affiché pour vérifier le bon chargement.

**Étape 2 — Mapping des colonnes**
OpsFlux propose automatiquement une correspondance entre les colonnes du fichier et les champs OpsFlux, en se basant sur les noms de colonnes. L'utilisateur valide ou corrige chaque correspondance. Un aperçu en temps réel montre comment les données seront interprétées.

**Étape 3 — Résultats de l'import**
À la fin de l'import, OpsFlux affiche un rapport détaillé :
- Nombre d'assets créés
- Nombre d'assets mis à jour (si le code existe déjà)
- Nombre d'erreurs avec description (champ obligatoire manquant, valeur invalide, etc.)

Un fichier CSV des erreurs est téléchargeable pour correction et ré-import.

### 6.2 Comportement par défaut

Par défaut, si un asset avec le même code existe déjà, il est mis à jour (mode "créer ou mettre à jour"). Ce comportement est configurable par l'administrateur (créer seulement, mettre à jour seulement, ou créer/mettre à jour).

---

## 7. TYPES D'ASSETS PERSONNALISÉS

### 7.1 Création de nouveaux types

L'administrateur peut créer de nouveaux types d'assets adaptés aux besoins spécifiques de son organisation (ex : "Zone HSE", "Point d'amarrage", "Station de mesure").

Pour chaque nouveau type, il définit :
- Le nom (dans toutes les langues)
- L'icône et la couleur
- Le type parent dans la hiérarchie (ou aucun)
- Les capacités activées (géolocalisation, pièces jointes, workflow, champs personnalisés...)
- Les champs spécifiques à ce type

Un nouveau type est immédiatement disponible dans les listes et formulaires.

### 7.2 Modification des types existants

Les types d'assets prédéfinis de Perenco (champ, plateforme, puits, logistique) peuvent être enrichis de champs personnalisés mais leur structure de base ne peut pas être modifiée.

---

## 8. RELATIONS AVEC LES AUTRES MODULES

### 8.1 Assets et documents

Un asset peut être lié à des documents (rapports d'inspection, fiches techniques, contrats...). Ce lien est visible à la fois depuis la fiche de l'asset (onglet "Documents") et depuis la fiche du document.

Lors de la création d'un document pour un asset spécifique, l'asset est pré-sélectionné dans les champs référence du formulaire.

### 8.2 Assets et PID

Un équipement dans un PID peut être lié à un asset du registre. Cette liaison est bidirectionnelle : depuis la fiche de l'équipement dans le PID, on peut accéder à la fiche de l'asset, et inversement.

### 8.3 Assets et tableaux de bord

Les widgets de carte des tableaux de bord utilisent les données géolocalisées des assets. Les KPI et graphiques peuvent afficher des indicateurs issus des champs d'assets.

### 8.4 Assets et IA

L'assistant IA peut répondre à des questions sur les assets ("Quelles sont les plateformes actives en BIPAGA ?", "Quelle est la profondeur du puits BIPAGA-04 ?"). Ces données sont indexées et interrogeables en langage naturel.

---

## 9. CAS D'UTILISATION COMPLETS

### Cas 1 : Mise à jour du registre après inspection

1. Après une inspection annuelle de la Plateforme BIPAGA, le certificat COSP est renouvelé
2. L'ingénieur HSE ouvre la fiche "Plateforme BIPAGA" dans le registre
3. Il double-clique sur le champ "Date dernière inspection" → saisit la nouvelle date
4. Il double-clique sur "Date expiration COSP" → saisit la nouvelle date de validité
5. Il joint le PDF du nouveau certificat dans l'onglet "Documents"
6. Les modifications sont enregistrées et tracées dans l'historique
7. Un tableau de bord de suivi des certifications se met automatiquement à jour

### Cas 2 : Import du registre initial

1. Au lancement d'OpsFlux, Perenco dispose d'un fichier Excel listant ses 87 puits
2. L'administrateur va dans Asset Registry > Puits > Import CSV
3. Il uploade le fichier → aperçu affiché
4. Mapping automatique : la colonne "WELL_ID" est mappée sur "Code", "WELL_NAME" sur "Nom"...
5. 3 colonnes n'ont pas de correspondance → l'administrateur crée 3 champs personnalisés
6. Validation : 82 puits valides, 5 erreurs (coordonnées GPS invalides pour 5 puits)
7. Import des 82 puits → fiche de chaque puits accessible immédiatement
8. Les 5 puits en erreur seront corrigés et importés séparément

### Cas 3 : Consultation depuis le mobile

1. Un opérateur offshore reçoit une alerte sur un équipement
2. Il ouvre OpsFlux depuis son téléphone, recherche "V-201"
3. La fiche de l'équipement s'affiche avec les données de design (pression, température, matériau)
4. Il voit le dernier rapport de maintenance lié dans l'onglet Documents
5. Il ouvre le PID lié → le PID-0158 s'affiche avec l'équipement V-201 localisé

