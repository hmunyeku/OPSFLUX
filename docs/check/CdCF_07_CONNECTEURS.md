# OpsFlux — Cahier des Charges Fonctionnel
# MODULE CONNECTEURS DE DONNÉES
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit les fonctionnalités du module Connecteurs de données. Il couvre la configuration, la gestion et l'utilisation des connexions entre OpsFlux et les systèmes externes de données.

---

## 1. VISION GÉNÉRALE

### 1.1 Finalité

Le module Connecteurs permet à OpsFlux d'importer et d'afficher des données provenant de systèmes externes : DCS (Distributed Control System), bases de données de production, fichiers Excel, API métier. Ces données alimentent les widgets des tableaux de bord et les sections "données connectées" des documents.

### 1.2 Principe

Un connecteur est une configuration qui décrit comment OpsFlux doit se connecter à une source externe, récupérer des données et les mettre à disposition dans l'application. Une fois configuré, un connecteur peut être utilisé par n'importe quel widget de tableau de bord ou section de document autorisé.

---

## 2. TYPES DE CONNECTEURS

### 2.1 Fichier Excel / CSV

Le plus simple des connecteurs. Un fichier Excel ou CSV est uploadé manuellement ou déposé automatiquement dans un dossier partagé. OpsFlux lit ce fichier et met les données à disposition.

**Usage typique** : export mensuel d'une base Access, fichier de production exporté d'un système legacy, export manuel du DCS.

**Configuration** :
- Mode d'upload (manuel via l'interface ou automatique via un dossier partagé)
- Sélection de l'onglet (si Excel multi-onglets)
- Ligne d'en-tête (numéro de la ligne contenant les noms de colonnes)
- Encodage du fichier (UTF-8, Latin-1...)
- Séparateur (pour les CSV : virgule, point-virgule, tabulation)

### 2.2 API REST

Se connecte à une API web externe (JSON ou XML). OpsFlux appelle l'API à intervalle régulier et stocke les données reçues.

**Usage typique** : API de production d'un partenaire opérateur, API météo marine pour les conditions offshore, API d'un logiciel tiers.

**Configuration** :
- URL de l'API
- Méthode (GET, POST)
- En-têtes HTTP (Content-Type, Accept...)
- Authentification (sans auth, clé API dans l'en-tête, clé API dans l'URL, identifiants basic, token OAuth2)
- Corps de la requête (si POST)
- Chemin JSON pour extraire les données (JSONPath)
- Fréquence de rafraîchissement

### 2.3 Export CSV DCS (Rockwell)

Variante spécialisée du connecteur fichier. Optimisé pour les exports du système DCS Allen-Bradley Rockwell utilisé par Perenco. Gère automatiquement le format spécifique des exports Rockwell.

**Usage typique** : données temps réel des instruments de la plateforme (pressions, températures, débits).

**Configuration** :
- Répertoire de dépôt du fichier CSV (chemin réseau)
- Fréquence de lecture
- Mapping des colonnes vers les tags OpsFlux correspondants

### 2.4 Base de données

Connexion directe à une base de données externe pour y exécuter des requêtes SQL.

**Usage typique** : base de données SQL Server ou Oracle du système de gestion de production, historien de données de process (OSIsoft PI).

**Configuration** :
- Type de base (SQL Server, PostgreSQL, MySQL, Oracle)
- Serveur, port, base de données
- Identifiants de connexion
- Requête SQL d'extraction des données
- Fréquence de rafraîchissement

---

## 3. PIPELINE DE TRANSFORMATION

### 3.1 Principe

Avant d'être stockées, les données brutes d'un connecteur peuvent être transformées par un pipeline. Ce pipeline est une séquence d'opérations que l'administrateur configure visuellement.

### 3.2 Opérations disponibles

**Renommage** : renommer une colonne pour l'aligner avec la nomenclature OpsFlux (ex : "FIELD_DATE" → "date")

**Filtrage** : ne garder que les lignes correspondant à un critère (ex : ne garder que les lignes où le statut = "ACTIF")

**Calcul** : créer une nouvelle colonne calculée à partir d'autres colonnes (ex : "production_nette = production_brute * (1 - water_cut / 100)")

**Formatage** : convertir le format d'une donnée (ex : convertir une date de "DD-MM-YYYY" en "YYYY-MM-DD", arrondir un nombre à 2 décimales)

**Agrégation** : regrouper les lignes selon une dimension et calculer des agrégats (ex : somme des productions par puits, moyenne par jour)

### 3.3 Interface de configuration

Le pipeline est configuré visuellement, étape par étape. Après chaque étape ajoutée, un aperçu des 5 premières lignes de données après transformation est affiché, permettant de vérifier immédiatement le résultat.

---

## 4. PLANIFICATION ET SYNCHRONISATION

### 4.1 Fréquences disponibles

Un connecteur peut être configuré pour se synchroniser :
- **Manuellement** : uniquement à la demande de l'utilisateur
- **Toutes les N minutes** : de 5 minutes à 60 minutes
- **Toutes les N heures** : de 1h à 12h
- **Une fois par jour** : à une heure définie
- **Une fois par semaine** : jour et heure définis

### 4.2 Synchronisation manuelle

L'administrateur peut déclencher une synchronisation immédiate depuis la page de gestion du connecteur.

### 4.3 Statut de synchronisation

Pour chaque connecteur, OpsFlux affiche :
- Le statut de la dernière synchronisation (succès, en cours, échoué)
- La date et l'heure de la dernière synchronisation
- Le nombre de lignes lues lors de la dernière synchronisation
- Les erreurs éventuelles

En cas d'échec, l'administrateur est notifié par email.

---

## 5. TEST ET VALIDATION

### 5.1 Test de connexion

Lors de la configuration d'un connecteur, un bouton "Tester la connexion" vérifie que les paramètres de connexion sont corrects et que la source répond.

### 5.2 Aperçu des données

Avant de finaliser la configuration, l'administrateur peut visualiser un échantillon des données brutes (5 premières lignes) telles qu'elles seront importées.

### 5.3 Validation du pipeline

Après configuration du pipeline de transformation, l'aperçu montre les données après transformation, permettant de valider le résultat final.

---

## 6. SÉCURITÉ DES CONNECTEURS

### 6.1 Chiffrement des credentials

Les identifiants de connexion (mots de passe, tokens, clés API) sont chiffrés en base. Ils ne sont jamais affichés en clair dans l'interface après saisie initiale.

### 6.2 Isolation

Les connecteurs d'un tenant ne peuvent pas accéder aux données d'un autre tenant.

### 6.3 Accès restreint

La création et la modification des connecteurs sont réservées aux administrateurs du tenant.

---

## 7. UTILISATION DES CONNECTEURS

### 7.1 Dans les widgets de tableau de bord

Lors de la configuration d'un widget, l'utilisateur sélectionne le connecteur source parmi ceux disponibles, puis choisit les colonnes à afficher.

### 7.2 Dans les documents

Les sections "données connectées" des templates de documents référencent un connecteur. Le rédacteur voit les données mises à jour automatiquement sans avoir à les saisir.

---

## 8. CAS D'UTILISATION COMPLETS

### Cas 1 : Connecteur DCS BIPAGA

1. L'équipe automatisme génère chaque heure un CSV de 200 tags DCS sur un serveur partagé
2. L'administrateur configure un connecteur "DCS BIPAGA" de type "Export CSV DCS"
3. Il configure le chemin réseau du fichier et un rafraîchissement toutes les heures
4. Il configure le pipeline : renommage des colonnes, filtrage (garder seulement les tags actifs), calcul d'un champ "pression_relative"
5. Le test de connexion réussit → aperçu des données affiché
6. Le connecteur est activé
7. Les tableaux de bord peuvent maintenant afficher les données DCS en temps quasi-réel

### Cas 2 : Connecteur API partenaire

1. Un co-opérateur Perenco expose ses données de production sur une API REST
2. L'administrateur configure un connecteur API : URL, clé API dans l'en-tête, JSONPath pour extraire les données
3. Il configure le rafraîchissement quotidien à 6h00
4. Les rapports de production consolidés peuvent désormais inclure les données du partenaire automatiquement

