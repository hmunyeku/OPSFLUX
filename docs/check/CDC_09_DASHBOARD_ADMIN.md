# Cahier des Charges Fonctionnel — Dashboard & Administration

> Ce document décrit le tableau de bord personnalisable et les fonctionnalités d'administration d'OpsFlux.

---

## Sommaire

1. [Tableaux de bord](#1-tableaux-de-bord)
2. [Widgets disponibles](#2-widgets-disponibles)
3. [Dashboards par rôle](#3-dashboards-par-rôle)
4. [Administration système](#4-administration-système)

---

## 1. Tableaux de bord

### 1.1 Concept

Le tableau de bord est une page personnalisable que chaque utilisateur configure selon ses besoins. Il est composé de "widgets" — des blocs d'information que l'utilisateur choisit, positionne et dimensionne.

Un administrateur peut créer des tableaux de bord partagés et les définir comme tableau de bord par défaut pour les nouveaux utilisateurs ou pour un rôle spécifique.

### 1.2 Personnalisation

Chaque utilisateur peut :
- Créer plusieurs tableaux de bord (ex : un pour le quotidien, un pour le reporting mensuel)
- Ajouter, retirer, déplacer et redimensionner les widgets par glisser-déposer
- Définir quel tableau de bord s'affiche en page d'accueil
- Configurer le rafraîchissement automatique (toutes les 30s, 1min, 5min, ou manuel)

---

## 2. Widgets disponibles

### 2.1 KPIs chiffrés

Affichage d'une valeur clé avec tendance :
- PAX actuellement sur site (par site ou global)
- AdS en attente de validation
- Certifications expirées cette semaine
- Voyages du jour
- Colis en transit

### 2.2 Listes opérationnelles

Listes filtrables et actionnables directement depuis le dashboard :
- Mes AdS en cours
- AdS en attente de ma validation
- Activités Planner pour mon périmètre
- Alertes en cours

### 2.3 Cartes

Vue cartographique avec :
- Positions des vecteurs en temps réel
- Carte de chaleur de la charge PAX par site
- Statut des assets (actifs, en alerte)

### 2.4 Graphiques

- Évolution de la charge PAX par site (courbe temporelle)
- Taux de compliance HSE par entreprise
- KPIs cargo (volumétrie hebdomadaire)
- Avancement des projets actifs

### 2.5 Widget SQL personnalisé

Pour les utilisateurs avancés, un widget permet d'écrire une requête SQL personnalisée sur les données OpsFlux et d'afficher le résultat sous forme de tableau ou de graphique. Ce widget nécessite une permission spécifique.

---

## 3. Dashboards par rôle

Les tableaux de bord pré-configurés par défaut selon le rôle :

**DO (Directeur Opérations) :**
- Synthèse de tous les sites : charge PAX, alertes actives
- Conflits Planner en attente d'arbitrage
- Signalements HSE récents
- KPIs globaux (compliance, no-shows, productivité logistique)

**CDS (Chef de Site) :**
- PAX présents sur son site en ce moment
- AdS en attente de sa validation
- Activités Planner sur son site ce mois
- Alertes certifications expirées pour son site

**LOG_BASE (Logistique Base) :**
- Voyages du jour avec statut en temps réel
- Manifestes PAX à valider
- Cargo en transit pour sa base
- Météo pour les vecteurs actifs

**CHEF_PROJET :**
- Avancement de ses projets
- Tâches en retard
- AdS liées à ses projets en cours de validation
- Prochains jalons

**CHSE (Compliance HSE) :**
- Certifications expirées ou en attente de validation
- Autodéclarations de profil en attente de validation
- Taux de compliance par entreprise
- Signalements ouverts

**DEMANDEUR :**
- Mes AdS en cours et leur statut
- Mes prochains départs prévus
- Mes projets (si j'en ai)

---

## 4. Administration système

### 4.1 Gestion des utilisateurs et groupes

L'administrateur gère depuis un écran centralisé :
- La liste de tous les utilisateurs avec leur statut
- La création de groupes et l'affectation des rôles
- Les périmètres géographiques (asset_scope) de chaque groupe
- La révocation de sessions actives si nécessaire

### 4.2 Configuration des modules

Depuis l'interface d'administration, sans développement :
- Configuration des paramètres métier de chaque module (durées d'expiration, seuils d'alerte, comportements par défaut)
- Activation / désactivation des fonctionnalités
- Configuration des emails (templates, expéditeur, logo)
- Configuration de l'IA (providers, modèles)

### 4.3 Santé du système

Un tableau de bord d'état système affiche :
- Statut des services (base de données, cache, stockage fichiers, IA)
- Utilisation des ressources (espace disque, connexions base de données)
- Âge du dernier backup automatique
- Logs d'erreurs récents

Des alertes automatiques sont envoyées aux super-administrateurs quand des seuils critiques sont atteints (disque > 80%, backup manqué...).

### 4.4 Audit et conformité

Vue globale du journal d'audit accessible au DO et SYS_ADMIN :
- Toutes les actions sur tous les objets
- Filtrable par module, utilisateur, type d'action, période
- Exportable en CSV pour les audits externes
- Conservation automatique 7 ans, immuable
