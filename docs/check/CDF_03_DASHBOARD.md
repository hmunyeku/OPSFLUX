# OpsFlux — Cahier des Charges Fonctionnel
# Module DASHBOARD — Tableaux de bord

---

## 1. Vision générale

Le Dashboard permet de créer des tableaux de bord personnalisés
qui agrègent des données de sources variées : connecteurs externes
(DCS, bases de données, fichiers), données OpsFlux (documents, assets)
et requêtes personnalisées.

Un dashboard est une composition libre de widgets disposés sur une grille.
Chaque widget affiche une information différente : une valeur clé,
un graphe, un tableau, un indicateur de statut.

---

## 2. Navigation vers les dashboards

### 2.1 Sources d'accès

Un dashboard peut être atteint depuis :
- La page d'accueil (dashboard configuré comme page d'entrée)
- La sidebar (si ajouté aux favoris ou à la navigation)
- Le menu "Pilotage" (galerie de tous les dashboards accessibles)

### 2.2 Résolution de la page d'accueil

À la connexion, OpsFlux cherche le dashboard d'accueil dans cet ordre :
1. Dashboard personnel configuré par l'utilisateur
2. Dashboard par défaut pour son rôle
3. Dashboard par défaut de sa BU
4. Dashboard par défaut du tenant
5. Page d'accueil générique si aucun dashboard configuré

---

## 3. Galerie des dashboards

### 3.1 Vue d'ensemble

La galerie affiche tous les dashboards auxquels l'utilisateur a accès :
- Ses propres dashboards
- Les dashboards partagés dans sa BU
- Les dashboards publics du tenant

Chaque dashboard est représenté par une miniature, son titre et son type (personnel, partagé, public).

### 3.2 Actions disponibles

- Ouvrir un dashboard (lecture)
- Créer un nouveau dashboard
- Cloner un dashboard public (crée une copie personnelle modifiable)
- Partager un dashboard (génère un lien)
- Définir comme page d'accueil

### 3.3 Droits

Tout utilisateur peut créer des dashboards personnels.
Pour publier un dashboard (le rendre visible à tous), le rôle admin est requis.

---

## 4. Mode visualisation (lecture)

### 4.1 Chargement

À l'ouverture d'un dashboard, tous les widgets chargent leurs données
en parallèle. Chaque widget affiche un indicateur de chargement
indépendant. Un widget lent ne bloque pas les autres.

### 4.2 Indicateurs de fraîcheur

Chaque widget affiche l'horodatage de ses dernières données.
Un rafraîchissement manuel est possible via le bouton ↻ sur chaque widget.

### 4.3 Auto-rafraîchissement

Un dashboard peut être configuré en auto-rafraîchissement :
manuel, 30 secondes, 1 minute, 5 minutes, 15 minutes.
La préférence est mémorisée par utilisateur.

### 4.4 Actions sur un widget

- **↻ Rafraîchir :** Recharge les données du widget
- **⛶ Plein écran :** Affiche le widget en plein écran (pour les TV de contrôle)
- **⬇ Exporter :** Télécharger les données (CSV, Excel, PDF, image)

### 4.5 Filtres globaux

Un dashboard peut avoir des filtres globaux qui s'appliquent
simultanément à tous les widgets compatibles.
Exemple : un filtre "Période" qui change la plage de dates de tous les graphes.

### 4.6 Comportement en cas d'erreur widget

Si un widget ne peut pas charger ses données (connecteur indisponible,
requête invalide...), il affiche "Données indisponibles" avec un bouton "Réessayer".
Les autres widgets continuent de fonctionner normalement.

---

## 5. Mode édition

### 5.1 Déclenchement

Bouton "Modifier le dashboard" ou raccourci E (depuis le mode lecture).
Requiert le droit de modification sur ce dashboard.

### 5.2 Canvas éditable

En mode édition, les widgets peuvent être :
- **Déplacés** par glissé-déposé
- **Redimensionnés** par les poignées de coin
- **Supprimés** via l'icône ✕
- **Dupliqués** via l'icône ⧉
- **Configurés** en double-cliquant dessus

La grille snape automatiquement les widgets sur une grille régulière
pour un alignement propre.

### 5.3 Annuler / Rétablir

Les modifications en mode édition supportent l'annulation (⌘Z) et le rétablissement (⌘Y).
Jusqu'à 50 niveaux d'annulation.

### 5.4 Sauvegarde

Le dashboard se sauvegarde automatiquement pendant l'édition.
Le bouton "Terminer l'édition" repasse en mode lecture.

---

## 6. Types de widgets

### 6.1 KPI (Valeur clé)

Affiche une valeur numérique unique avec :
- Titre
- Valeur principale (nombre avec unité)
- Comparaison optionnelle (variation vs période précédente ou vs objectif)
  affichée en pourcentage avec flèche haut/bas et couleur
- Indicateur d'alerte (seuil configurable → rouge si dépassé)

**Usage typique :** Production du jour, disponibilité équipement, nombre de documents en attente.

### 6.2 Graphe Ligne / Aire

Affiche une ou plusieurs séries temporelles.
Axes configurables, légende, zoom.
Supporte plusieurs séries superposées.

**Usage typique :** Évolution de la production sur 30 jours.

### 6.3 Graphe Barres

Barres verticales ou horizontales, simples ou groupées.
**Usage typique :** Comparaison de la production par plateforme.

### 6.4 Graphe Secteurs (Camembert)

Répartition en pourcentages.
**Usage typique :** Répartition des types d'arrêts.

### 6.5 Tableau de données

Affiche les données sous forme de tableau avec :
- Colonnes configurables (choisir quelles colonnes afficher et dans quel ordre)
- Tri par colonne au clic
- Pagination intégrée
- Mise en forme conditionnelle (coloriser une cellule selon sa valeur)
- Export CSV/Excel en un clic

**Usage typique :** Liste des arrêts de production du mois, liste des équipements hors service.

### 6.6 Tableau croisé dynamique (Pivot)

Aggrège les données selon deux dimensions avec total automatique.
**Usage typique :** Production par mois × par plateforme.

### 6.7 Jauge

Demi-cercle avec aiguille indiquant une valeur dans une plage min/max.
Zones colorées configurables (vert, orange, rouge).
**Usage typique :** Taux d'utilisation d'un équipement.

### 6.8 Carte géographique

Affiche des points sur une carte Cameroun/Gabon.
Chaque point représente un asset (plateforme, puits...) avec une couleur
selon une valeur métrique (production, statut).
**Usage typique :** Carte de production par plateforme.

### 6.9 Texte/Titre

Bloc de texte libre pour structurer visuellement le dashboard.
Supporte les titres, paragraphes, mise en forme.
**Usage typique :** Titre de section, notes d'interprétation.

### 6.10 Image

Affiche une image statique (logo, plan, photo).

### 6.11 SQL personnalisé

Permet d'écrire une requête SQL personnalisée sur la base OpsFlux.
Résultat affiché au choix en tableau, graphe ou valeur KPI.
Requiert une permission spéciale (non accordée par défaut).

---

## 7. Configuration d'un widget

### 7.1 Source de données

Chaque widget est lié à une source :
- Un **connecteur** configuré (DCS, base de données, fichier Excel...)
- Une **requête SQL** sur les données OpsFlux
- Des **données OpsFlux natives** (nombre de documents par statut, assets par type...)

### 7.2 Mapping des colonnes

Après sélection de la source, l'utilisateur configure le mapping :
- Quelle colonne correspond à l'axe X (temps ou catégorie)
- Quelles colonnes correspondent aux valeurs Y
- Quels filtres appliquer aux données

### 7.3 Apparence

- Titre du widget
- Couleurs des séries
- Affichage ou masquage des axes, légende, grille
- Format des nombres (décimales, unité, préfixe)
- Seuils de couleur pour les alertes

### 7.4 Filtres propres au widget

Un widget peut avoir ses propres filtres en plus des filtres globaux du dashboard.
Exemple : un widget "Production BIPAGA" toujours filtré sur BIPAGA,
même si le filtre global est sur "EBOME".

---

## 8. Connecteurs de données

### 8.1 Principe

Un connecteur est une connexion configurée vers une source de données externe.
Il est créé par un admin dans Settings > Connecteurs
puis utilisé par n'importe quel widget.

### 8.2 Types de connecteurs

**Upload fichier (Excel / CSV) :**
Fichier uploadé manuellement. Les données sont disponibles
jusqu'au prochain upload. Utilisé pour les données peu fréquentes
(mensuel, hebdomadaire).

**API REST externe :**
Connexion à un API qui renvoie du JSON ou XML.
Configurable : URL, méthode (GET/POST), headers d'authentification,
path JSON pour extraire les données.
Rafraîchissement automatique configurable (horaire, quotidien...).

**Export CSV automatique DCS :**
Le DCS Rockwell génère régulièrement des fichiers CSV dans un dossier partagé.
OpsFlux scrute ce dossier à intervalle défini et importe les nouveaux fichiers.

**Base de données externe :**
Connexion directe à une base de données (PostgreSQL, SQL Server, Oracle).
Requête SQL configurable par le connecteur.

### 8.3 Pipeline de transformation

Après la récupération des données brutes, l'admin peut configurer
une série de transformations dans l'ordre de son choix :

| Transformation | Description |
|---|---|
| **Renommer** | Changer le nom d'une colonne |
| **Filtrer** | Garder uniquement les lignes correspondant à une condition |
| **Calculer** | Créer une nouvelle colonne calculée depuis d'autres colonnes |
| **Formater** | Changer le format d'une colonne (date, nombre...) |
| **Agréger** | Regrouper les données par une dimension et calculer une somme, moyenne... |

**Prévisualisation en temps réel :** Après chaque transformation,
un aperçu des 5 premières lignes permet de vérifier le résultat.

### 8.4 Test de connexion

Avant de valider la configuration, un bouton "Tester" vérifie
que la connexion fonctionne et affiche les premières données reçues.

---

## 9. Import / Export de dashboards

### 9.1 Export

Un dashboard peut être exporté en fichier JSON.
Ce fichier contient la définition complète du dashboard (widgets, layout, configuration)
mais pas les données.

### 9.2 Import

Un fichier JSON exporté peut être importé pour créer un nouveau dashboard.
Les connecteurs référencés doivent exister dans le tenant de destination
(ou être remappés lors de l'import).

**Usage typique :** Partager un dashboard entre tenants (ex: modèle de rapport de production).

---

## 10. Dashboards en télévision (mode affichage)

### 10.1 Principe

Un dashboard peut être affiché en continu sur un écran TV dans une salle de contrôle.
Le mode plein écran désactive la navigation OpsFlux et n'affiche que le dashboard.
Le rafraîchissement automatique garde les données à jour.

### 10.2 Lien partagé pour TV

Un lien permanent peut être généré pour un dashboard (sans authentification requise
pour les dashboards marqués "public" par l'admin). Ce lien est ensuite configuré
dans le navigateur de la TV.

---

## 11. Droits et partage

### 11.1 Propriété

Chaque dashboard a un propriétaire (celui qui l'a créé).
Seul le propriétaire ou un admin peut le modifier ou le supprimer.

### 11.2 Partage dans la BU

Le propriétaire peut partager son dashboard en lecture avec les membres de sa BU.

### 11.3 Publication tenant

Un admin peut marquer un dashboard comme "public" :
il devient accessible à tous les utilisateurs du tenant en lecture.

### 11.4 Clonage

N'importe quel utilisateur peut cloner un dashboard public.
Le clone est indépendant de l'original — les modifications de l'un
n'affectent pas l'autre.

---

## 12. Règles métier importantes

### 12.1 Un widget = une visualisation

Un widget doit afficher une seule type d'information.
Combiner un graphe et un tableau dans le même widget n'est pas autorisé.

### 12.2 Droits SQL

La possibilité d'écrire des requêtes SQL personnalisées est une permission
spéciale accordée individuellement par l'admin. Elle n'est pas incluse
dans les rôles standards (y compris éditeur) car elle permet théoriquement
d'accéder à n'importe quelle donnée du tenant.

### 12.3 Isolation des données

Les données d'un widget sont toujours filtrées sur le tenant courant.
Il n'est pas possible d'accéder aux données d'un autre tenant via un dashboard,
même en écrivant une requête SQL.

### 12.4 Données fictives interdites

Les widgets n'ont pas de mode "données de démo". En mode édition,
les vraies données s'affichent (ou un message "Aucune donnée" si vide).

