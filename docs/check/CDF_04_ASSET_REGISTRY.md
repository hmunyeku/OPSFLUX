# OpsFlux — Cahier des Charges Fonctionnel
# Module REGISTRE DES ASSETS

---

## 1. Vision générale

Le Registre des Assets est l'inventaire de tous les biens physiques
et immatériels de l'organisation : champs pétroliers, plateformes,
puits, équipements logistiques, zones, etc.

Chaque asset est une fiche structurée avec ses propriétés techniques,
son état, sa localisation géographique et ses liens avec les autres
données OpsFlux (documents, équipements process, tags DCS).

Le registre est conçu pour évoluer : les administrateurs peuvent créer
de nouveaux types d'assets sans intervention technique, avec les champs
qui leur correspondent.

---

## 2. Types d'assets

### 2.1 Types prédéfinis Perenco

OpsFlux est livré avec 4 types d'assets préconfigurés :

**Champ pétrolier (Oil Field)**
Le niveau le plus haut de la hiérarchie. Représente une concession
ou un périmètre géographique d'exploitation.
Informations clés : nom officiel, code, coordonnées géographiques du centroïde,
surface en km², date de découverte, date de 1ère production,
réserves estimées, type d'hydrocarbures (huile, gaz, condensat...).

**Plateforme (Platform)**
Une installation fixe ou flottante d'exploitation.
Informations clés : code, champ parent, type (Fixed Jacket, FPSO, FSO, Wellhead Platform...),
profondeur d'eau, capacité de traitement (huile, gaz, eau), date de mise en service,
certifications, coordonnées GPS.

**Puits (Well)**
Un forage individuel d'exploration ou de production.
Informations clés : nom API, plateforme parente, type (producteur, injecteur, observateur...),
fluide produit, formation géologique, statut (actif, fermé, suspendu, abandonné),
profondeur totale, date de forage, date de première production.

**Asset logistique (Logistics Asset)**
Véhicules, équipements de manutention, navires de support, etc.
Informations clés : catégorie, immatriculation, fabricant, modèle,
date de mise en service, date de fin de vie prévue, localisation habituelle,
statut de maintenance.

### 2.2 Création de types personnalisés

L'administrateur peut créer de nouveaux types d'assets depuis
Settings > Modules > Asset Registry > Types d'assets :

- Nom du type (multilingue)
- Icône et couleur d'identification
- Type parent dans la hiérarchie (optionnel)
- Capacités activées (géolocalisation, pièces jointes, workflow, relations...)
- Champs à afficher (issus des champs personnalisés)

Dès qu'un type est créé, son CRUD (liste, création, consultation, modification)
est automatiquement disponible dans l'interface sans développement.

---

## 3. Hiérarchie des assets

### 3.1 Structure arborescente

Les assets peuvent s'organiser en hiérarchie parent-enfant :
- Champ pétrolier → Plateforme
- Plateforme → Puits
- Plateforme → Asset logistique

Cette hiérarchie est libre : un asset peut être rattaché à un parent
de n'importe quel type compatible.

### 3.2 Navigation dans la hiérarchie

Depuis la fiche d'un asset, un onglet "Assets liés" affiche :
- Ses parents directs
- Ses enfants directs
- Des relations personnalisées (ex: "Alimenté par", "Contrôlé par")

---

## 4. Liste des assets

### 4.1 Vue liste

La liste des assets est un tableau paginé avec les colonnes
les plus importantes pour ce type d'asset.
Les colonnes peuvent être personnalisées par l'utilisateur
(choisir lesquelles afficher, réordonner).

### 4.2 Vue carte

Basculer en vue carte affiche tous les assets géolocalisés
sur une carte interactive Cameroun/Gabon.

**Comportement de la carte :**
- Les assets proches sont regroupés en clusters jusqu'à un certain zoom
- Cliquer un cluster → zoom automatique sur la zone
- Cliquer un marker → popup avec nom, code, statut
- Bouton "Voir la fiche" dans la popup → navigate vers la fiche

**Cohérence filtres :** Les filtres actifs sur la liste s'appliquent
aussi sur la carte (ex: filtrer sur "Statut = Actif" → seuls les assets
actifs apparaissent sur la carte).

### 4.3 Filtres disponibles

La liste des assets supporte des filtres cumulables :
- Recherche textuelle (nom, code)
- Statut (actif, inactif, en maintenance...)
- Type d'asset
- Parent (tous les assets d'une plateforme donnée)
- Champs personnalisés (si configurés comme filtrables par l'admin)

---

## 5. Fiche d'un asset

### 5.1 En-tête

L'en-tête affiche les informations principales :
icône du type, nom de l'asset, code, statut, actions disponibles.

### 5.2 Onglet Informations

Affiche toutes les propriétés de l'asset, organisées en sections :
- **Informations générales** : champs standards du type (définis à la création du type)
- **Informations complémentaires** : champs personnalisés ajoutés par l'admin

Chaque champ est éditable directement par double-clic
si l'utilisateur a les droits de modification.

### 5.3 Onglet Assets liés

Parents, enfants et relations personnalisées de cet asset.
Bouton "Lier un asset" pour créer une nouvelle relation.

### 5.4 Onglet Documents

Tous les documents OpsFlux liés à cet asset
(rapports, procédures, spécifications, certifications...).
Bouton "Lier un document" pour associer un document existant.
Bouton "Créer un rapport pour cet asset" pour créer un nouveau document
avec le champ asset pré-rempli.

### 5.5 Onglet Activité

Historique chronologique de toutes les modifications de cet asset :
qui a modifié quoi et quand.

---

## 6. Statuts d'un asset

Les statuts disponibles dépendent du type d'asset mais incluent généralement :

| Statut | Description |
|---|---|
| **Actif** | En service normal |
| **En maintenance** | Arrêt temporaire pour maintenance |
| **En construction** | Pas encore mis en service |
| **Suspendu** | Arrêt prolongé sans démontage |
| **Décommissionné** | Hors service définitivement |
| **Archivé** | Retiré du registre actif |

L'admin peut configurer des statuts personnalisés pour chaque type d'asset.

---

## 7. Import CSV

### 7.1 Cas d'usage

L'import CSV est utilisé pour :
- Initialiser le registre depuis un fichier existant (migration)
- Mettre à jour en masse des propriétés (ex: dates de maintenance)
- Synchroniser avec un système externe (ERP, CMMS...)

### 7.2 Processus en 3 étapes

**Étape 1 — Upload du fichier :**
Glisser-déposer ou sélectionner un fichier CSV ou Excel.
Le séparateur (virgule, point-virgule, tabulation) est détecté automatiquement.
Un aperçu des 3 premières lignes s'affiche immédiatement.

**Étape 2 — Mapping des colonnes :**
Pour chaque colonne du fichier, indiquer à quel champ OpsFlux elle correspond.
Le système propose un mapping automatique si les noms de colonnes se ressemblent.
Un aperçu de 3 lignes transformées permet de vérifier le mapping.

Les champs obligatoires doivent être mappés pour continuer.
Les colonnes non mappées sont ignorées.

**Étape 3 — Validation et résultat :**
OpsFlux analyse toutes les lignes et génère un rapport de validation :
- Nombre de lignes valides (seront créées ou mises à jour)
- Nombre d'erreurs (avec détail par ligne)
- Aperçu des conflits (assets déjà existants)

L'utilisateur choisit le comportement pour les assets déjà existants :
- **Créer uniquement** : ignorer les assets existants
- **Créer ou mettre à jour** : mettre à jour si le code existe déjà
- **Mettre à jour uniquement** : ignorer les nouvelles lignes, mettre à jour les existantes

Confirmation → import → rapport final téléchargeable avec le résultat ligne par ligne.

### 7.3 Rapport d'erreurs

Le rapport d'erreurs est téléchargeable en CSV.
Il contient les lignes en erreur avec la description de l'erreur
pour correction et ré-import.

---

## 8. Géolocalisation

### 8.1 Saisie des coordonnées

Les coordonnées GPS (latitude/longitude) peuvent être saisies :
- En degrés décimaux (2.345678, 9.876543)
- En degrés-minutes-secondes (2°20'44"N, 9°52'36"E)
- En cliquant sur une carte dans l'interface

### 8.2 Précision

La précision des coordonnées est affichée visuellement sur la carte
(cercle de précision). Pour les grandes installations (plateforme, champ),
le point représente le centroïde de l'installation.

### 8.3 Validation

OpsFlux vérifie que les coordonnées sont dans une zone géographique plausible
(Cameroun, Gabon, Nigeria pour Perenco). Un avertissement s'affiche
si les coordonnées semblent hors zone mais l'enregistrement est possible.

---

## 9. Champs personnalisés spécifiques aux assets

En plus des champs standard définis par le type d'asset,
chaque asset peut avoir des champs personnalisés définis par l'admin.

Ces champs apparaissent dans la section "Informations complémentaires"
de la fiche, après les champs standards, sans distinction visuelle marquée.

L'admin peut marquer certains champs comme "Obligatoires à la création"
→ ils apparaissent dans le formulaire Quick Entry avec le badge REQ.

---

## 10. Règles métier importantes

### 10.1 Code unique

Le code d'un asset est unique par type dans un tenant.
Deux plateformes ne peuvent pas avoir le même code.
Deux types différents peuvent partager le même code sans conflit.

### 10.2 Héritage de BU

Un asset hérite de la BU de son parent si aucune BU n'est explicitement assignée.
Exemple : un puits créé sur la plateforme BIPAGA hérite automatiquement de la BU BIPAGA.

### 10.3 Suppression vs archivage

Un asset ne peut jamais être supprimé physiquement si :
- Des documents lui sont liés
- Des équipements process lui sont liés
- Des tags DCS lui sont liés
- Il a des assets enfants

Dans ces cas, seul l'archivage est possible.
La suppression physique d'un asset sans liens est possible uniquement
pour les assets créés par erreur (admin uniquement).

### 10.4 Traçabilité des modifications

Chaque modification d'un champ d'asset est tracée : valeur avant, valeur après,
utilisateur, date. Cette traçabilité est accessible dans l'onglet "Activité"
et dans l'audit log global.

