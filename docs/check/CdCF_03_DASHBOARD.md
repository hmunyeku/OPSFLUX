# OpsFlux — Cahier des Charges Fonctionnel
# MODULE TABLEAU DE BORD (DASHBOARD)
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit l'ensemble des fonctionnalités du module Tableau de bord d'OpsFlux. Il couvre la création, la personnalisation, le partage et la consultation de tableaux de bord composés de widgets de données opérationnelles.

---

## 1. VISION GÉNÉRALE

### 1.1 Finalité

Le module Tableau de bord permet aux équipes Perenco de créer des vues synthétiques de leurs données opérationnelles. Un tableau de bord regroupe en une seule page plusieurs indicateurs, graphiques et tableaux issus de sources diverses.

### 1.2 Principes fondamentaux

**Composabilité** — Un tableau de bord est une composition libre de widgets. Chaque widget est une unité indépendante affichant une donnée ou une visualisation.

**Personnalisation** — Chaque utilisateur peut créer son propre tableau de bord. Des tableaux de bord partagés peuvent être définis pour une BU ou le tenant entier.

**Données en temps quasi-réel** — Les widgets se rafraîchissent automatiquement à intervalles configurables pour refléter l'état actuel des données.

**Page d'accueil** — Un tableau de bord peut être configuré comme page d'accueil pour un utilisateur, un rôle, une BU ou le tenant entier.

---

## 2. TABLEAUX DE BORD

### 2.1 Types de tableaux de bord

**Personnel** — Créé par un utilisateur pour son usage propre. Visible uniquement par son créateur.

**Partagé** — Créé par un utilisateur et rendu accessible à d'autres utilisateurs ou groupes. Consultable mais non modifiable par les autres (sauf si explicitement autorisé).

**BU** — Tableau de bord officiel d'une Business Unit. Géré par l'administrateur, visible par tous les membres de la BU.

**Tenant** — Tableau de bord officiel du tenant. Visible par tous les utilisateurs.

### 2.2 Création d'un tableau de bord

L'utilisateur crée un nouveau tableau de bord depuis la galerie des tableaux de bord. Il lui donne un nom, choisit sa visibilité (personnel ou partagé) et accède à l'éditeur.

### 2.3 Galerie des tableaux de bord

La galerie présente sous forme de grille tous les tableaux de bord accessibles à l'utilisateur :
- Ses tableaux de bord personnels
- Les tableaux partagés avec lui
- Les tableaux de bord officiels de sa BU et du tenant

Depuis la galerie, l'utilisateur peut consulter, dupliquer ou supprimer (si autorisé) un tableau de bord.

### 2.4 Duplication

Tout tableau de bord peut être dupliqué. La copie est indépendante de l'original et peut être modifiée librement.

---

## 3. WIDGETS — TYPES ET FONCTIONNALITÉS

### 3.1 KPI (Indicateur clé)

Affiche une valeur unique avec son libellé et une unité. Peut afficher en complément :
- La variation par rapport à une période précédente (en valeur ou en %)
- Une flèche de tendance (hausse / baisse / stable)
- Un indicateur de couleur selon un seuil configurable (vert / orange / rouge)

**Exemples** : Production du jour en bbl, Uptime de l'installation en %, Nombre de documents en attente de validation

### 3.2 Graphique en courbes

Affiche l'évolution d'une ou plusieurs séries de données dans le temps. Configuration :
- Les séries de données à afficher
- L'axe X (plage de dates, granularité)
- Les axes Y (échelle, unité)
- La couleur de chaque série

**Exemples** : Production huile sur 30 jours, Comparaison production semaine vs semaine précédente

### 3.3 Graphique en barres / histogramme

Affiche des données comparatives. Peut être horizontal ou vertical. Supporte les barres groupées et les barres empilées.

**Exemples** : Production par puits, Répartition des types d'incidents par catégorie

### 3.4 Tableau de données

Affiche un tableau avec colonnes et lignes. Les colonnes sont configurables. Le tableau supporte :
- Le tri par colonne (clic sur l'en-tête)
- La pagination si le nombre de lignes est important
- Le téléchargement des données en CSV ou Excel

**Exemples** : Liste des dernières anomalies, Tableau de production journalière des 7 derniers jours

### 3.5 Graphique camembert / donut

Affiche la répartition proportionnelle d'une grandeur. Utile pour visualiser des pourcentages.

**Exemples** : Répartition des types de documents, Part de chaque puits dans la production totale

### 3.6 Jauge

Affiche une valeur sur une échelle semi-circulaire avec des zones colorées (vert / orange / rouge). Adapté aux indicateurs de performance avec seuils.

**Exemples** : Taux d'utilisation d'un compresseur, Pourcentage de documents validés dans les délais

### 3.7 Carte géographique

Affiche les assets sur une carte interactive. Les markers peuvent être colorés selon des critères (statut, type, niveau de production).

**Exemples** : Carte des puits actifs avec leur production, Carte des plateformes avec leur statut

### 3.8 Liste des documents récents

Affiche les derniers documents créés ou modifiés selon des critères configurables (type, statut, projet). Chaque ligne est cliquable et navigue vers le document.

### 3.9 Widget de validation en attente

Affiche le nombre de validations en attente pour l'utilisateur courant et les documents concernés. Bouton d'action directe vers chaque document.

### 3.10 Texte libre / Titre

Permet d'ajouter du texte explicatif, des titres de sections, des remarques contextuelles dans le tableau de bord.

### 3.11 Widget SQL personnalisé

Permet à un utilisateur expérimenté (avec permission spéciale) de saisir une requête SQL de lecture pour construire un widget sur-mesure. La requête ne peut être qu'en lecture (SELECT). Le résultat peut être affiché sous forme de tableau, graphique ou KPI.

**Règles de sécurité** : La requête est analysée avant exécution. Tout mot-clé de modification de données (INSERT, UPDATE, DELETE, DROP...) est interdit. Un timeout de 30 secondes (configurable) s'applique.

---

## 4. SOURCES DE DONNÉES

### 4.1 Connecteurs de données

Les widgets tirent leurs données de connecteurs configurés par l'administrateur. Un connecteur est une source de données externe connectée à OpsFlux.

Types de connecteurs disponibles :
- **Fichier Excel/CSV** : upload manuel ou automatique d'un fichier de données
- **API REST** : appel régulier d'une API externe avec authentification
- **Export DCS CSV** : fichier CSV exporté par le système DCS Rockwell
- **Base de données** : connexion directe à une base de données externe

### 4.2 Données OpsFlux

Les widgets peuvent également afficher des données natives d'OpsFlux :
- Statistiques de documents (nombre créés, en attente, publiés...)
- Données du registre d'assets
- Données des équipements process
- Indicateurs de performance des workflows
- Données des connecteurs configurés

### 4.3 Rafraîchissement des données

Les données de chaque widget se rafraîchissent automatiquement selon l'intervalle global du tableau de bord (configurable : 30 secondes, 1 minute, 5 minutes, 15 minutes) ou l'intervalle spécifique du widget.

L'utilisateur peut forcer le rafraîchissement d'un widget individuel ou de tout le tableau de bord via un bouton.

Un indicateur indique la date et l'heure du dernier rafraîchissement.

En cas d'indisponibilité d'une source, le widget affiche un message "Données indisponibles" sans bloquer les autres widgets.

---

## 5. MODE ÉDITION

### 5.1 Accès au mode édition

L'utilisateur bascule en mode édition depuis le tableau de bord (bouton "Modifier" ou raccourci clavier). En mode édition, les widgets ne se rafraîchissent plus automatiquement.

### 5.2 Ajout d'un widget

L'utilisateur clique "+ Ajouter un widget", choisit le type dans le catalogue, configure le widget dans un panneau latéral et valide. Le widget apparaît sur le tableau de bord.

### 5.3 Repositionnement par glisser-déposer

En mode édition, chaque widget peut être déplacé librement par glisser-déposer. La grille s'adapte automatiquement.

### 5.4 Redimensionnement

Les coins et les bords de chaque widget sont manipulables pour redimensionner le widget. La grille contraint les dimensions à des valeurs cohérentes.

### 5.5 Configuration d'un widget

Double-cliquer sur un widget en mode édition ouvre son panneau de configuration. L'utilisateur peut modifier :
- Le titre
- La source de données et les champs affichés
- Les options de visualisation (couleurs, seuils, format...)
- L'intervalle de rafraîchissement spécifique au widget

### 5.6 Suppression d'un widget

Un clic sur l'icône de suppression du widget demande confirmation avant suppression. L'action est annulable (Ctrl+Z).

### 5.7 Duplication d'un widget

Un widget peut être dupliqué en un clic. La copie est positionnée à côté de l'original avec la même configuration.

### 5.8 Annuler / Rétablir

En mode édition, les actions de déplacement, redimensionnement et modification sont annulables (jusqu'à 50 étapes).

### 5.9 Sortie du mode édition

L'utilisateur quitte le mode édition en cliquant "Terminer". Les modifications sont sauvegardées automatiquement.

---

## 6. CONSULTATION

### 6.1 Mode plein écran d'un widget

Un widget individuel peut être affiché en plein écran pour une meilleure lisibilité lors des réunions ou des présentations.

### 6.2 Export d'un widget

Chaque widget propose un menu d'export :
- Données brutes en CSV ou Excel
- Capture d'image du widget (PNG)
- Pour les tableaux : export formaté

### 6.3 Export du tableau de bord

Le tableau de bord complet peut être exporté en PDF (une page par tableau de bord, disposition identique à l'écran).

---

## 7. FILTRES GLOBAUX

### 7.1 Principe

Des filtres globaux peuvent être configurés sur un tableau de bord. Quand l'utilisateur sélectionne une valeur dans un filtre global, tous les widgets compatibles (ceux dont la source de données contient la dimension filtrée) se mettent à jour.

### 7.2 Types de filtres globaux

- Filtre date / période : sélectionner une plage de dates
- Filtre installation / zone : sélectionner une BU, un projet ou une zone géographique
- Filtre statut : filtrer sur un statut particulier

### 7.3 Configuration

En mode édition, l'administrateur du tableau de bord choisit quels filtres globaux exposer et quels widgets y sont sensibles.

---

## 8. TABLEAUX DE BORD PAR DÉFAUT

### 8.1 Résolution de la page d'accueil

Quand un utilisateur se connecte, OpsFlux détermine quel tableau de bord afficher en page d'accueil selon l'ordre de priorité suivant :
1. Le tableau de bord que l'utilisateur a explicitement défini comme sa page d'accueil
2. Le tableau de bord par défaut de son rôle principal
3. Le tableau de bord par défaut de sa BU principale
4. Le tableau de bord par défaut du tenant
5. Si aucun tableau de bord n'est configuré : page d'accueil générique

### 8.2 Configuration par l'administrateur

L'administrateur peut désigner un tableau de bord comme :
- Tableau de bord par défaut du tenant (vu par tous les utilisateurs sans tableau personnalisé)
- Tableau de bord par défaut d'une BU spécifique
- Tableau de bord recommandé pour un rôle donné

---

## 9. CAS D'UTILISATION COMPLETS

### Cas 1 : Tableau de bord de pilotage de production

Le responsable de production BIPAGA crée son tableau de bord quotidien :
1. Il crée un nouveau tableau de bord "Production BIPAGA - Quotidien"
2. Il ajoute 4 widgets KPI : production huile, production gaz, injection eau, uptime
3. Il ajoute un graphique en courbes : production huile sur 30 jours vs objectif
4. Il ajoute un histogramme : production par puits sur les 7 derniers jours
5. Il ajoute un tableau : rapport journalier des 5 derniers jours (lien direct)
6. Il ajoute un widget "Validations en attente" pour ne pas oublier ses tâches
7. Il configure le rafraîchissement automatique à 5 minutes
8. Il définit ce tableau de bord comme sa page d'accueil
9. Il le partage avec son équipe (lecture seule)

### Cas 2 : Tableau de bord HSE

Le responsable HSE crée un tableau de bord de suivi de sécurité :
1. Widget KPI : nombre de jours sans incident (LTI)
2. Widget KPI : nombre d'observations sécurité du mois
3. Histogramme : incidents par type sur 12 mois glissants
4. Tableau : liste des actions correctives en cours (via SQL personnalisé)
5. Widget liste : derniers rapports HSE publiés
6. Il configure des seuils d'alerte (rouge si incidents > 0, orange si LTI < 30j)

### Cas 3 : Affichage en salle de contrôle

L'administrateur configure un tableau de bord "Wall" pour affichage permanent en salle de contrôle :
1. Tableau de bord en plein écran, rafraîchissement automatique toutes les 30 secondes
2. Grandes jauges de production temps réel
3. Carte des installations avec statut en temps réel
4. Liste des alarmes actives (via connecteur DCS)
5. Ce tableau de bord est défini comme par défaut de la BU BIPAGA → visible par tous à l'accueil

