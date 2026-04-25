# Cahier des Charges Fonctionnel — Module IA & MCP

> Ce document décrit les fonctionnalités d'intelligence artificielle intégrées dans OpsFlux :
> assistance à la saisie, génération de rapports, détection d'anomalies, et outils d'analyse.

---

## Sommaire

1. [Philosophie et positionnement](#1-philosophie-et-positionnement)
2. [L'assistant IA (panneau de chat)](#2-lassistant-ia-panneau-de-chat)
3. [Matching SAP automatique (cargo)](#3-matching-sap-automatique-cargo)
4. [Génération de rapports narratifs](#4-génération-de-rapports-narratifs)
5. [Détection automatique d'anomalies](#5-détection-automatique-danomalies)
6. [MCP — Outils d'analyse avancée](#6-mcp--outils-danalyse-avancée)
7. [Base de connaissances (RAG)](#7-base-de-connaissances-rag)
8. [Configuration et gouvernance](#8-configuration-et-gouvernance)

---

## 1. Philosophie et positionnement

L'IA dans OpsFlux est une **aide à la décision**, pas un décideur automatique. Chaque fonctionnalité IA produit une suggestion, une analyse ou un brouillon — c'est l'utilisateur qui décide de l'utiliser, la modifier, ou l'ignorer.

**Principes :**
- Toute action IA est tracée dans l'audit log
- L'IA ne prend jamais de décision bloquante (validation, approbation) — seulement des suggestions
- Les suggestions IA sont toujours clairement identifiées comme telles dans l'interface
- L'utilisateur peut désactiver les suggestions IA dans ses préférences

---

## 2. L'assistant IA (panneau de chat)

### 2.1 Concept

Un panneau de chat contextuel est disponible dans toute l'interface OpsFlux. L'utilisateur peut poser des questions en langage naturel sur les données de l'application.

L'assistant comprend le contexte : si l'utilisateur est sur la fiche d'un projet, il peut lui poser des questions sur ce projet spécifiquement ("Quelles sont les tâches en retard ?" "Quel est le taux d'avancement réel vs planifié ?").

### 2.2 Ce que l'assistant peut faire

**Interroger les données** : "Combien de PAX sont actuellement sur ESF1 ?" — l'assistant interroge la base de données et répond avec les chiffres réels.

**Résumer des informations** : "Résume-moi l'état de l'AdS ADS-2026-04521" — l'assistant produit un résumé clair sans que l'utilisateur ne doive lire toutes les lignes.

**Aider à la rédaction** : "Rédige un email pour informer les parties prenantes du retard de livraison du projet GCM" — l'assistant produit un brouillon que l'utilisateur peut modifier.

**Analyser des tendances** : "Y a-t-il des patterns dans les no-shows des derniers 3 mois ?" — l'assistant analyse les données et identifie des patterns.

**Répondre sur les procédures** : "Quelle est la procédure pour créer un AVM ?" — l'assistant utilise la base de connaissances OpsFlux pour répondre.

### 2.3 Briefing journalier

Chaque matin, l'assistant IA prépare un briefing personnalisé selon le rôle de l'utilisateur :

- **Pour un CDS** : PAX sur son site, AdS en attente de validation, activités Planner du jour, alertes de certification expirées
- **Pour un LOG_BASE** : voyages du jour, manifestes à valider, cargo en attente, alertes météo
- **Pour un CHEF_PROJET** : tâches en retard, AdS liées à son projet, jalons de la semaine

Ce briefing est affiché dès l'ouverture du panneau IA et peut être désactivé dans les préférences.

---

## 3. Matching SAP automatique (cargo)

### 3.1 Problème résolu

Quand un colis est enregistré dans TravelWiz, l'agent doit souvent retrouver la référence SAP correspondante (code article). Sans aide, cette recherche dans un catalogue de milliers d'articles est fastidieuse et source d'erreurs.

### 3.2 Fonctionnement

Quand l'agent saisit une description de colis (ex : "Pompe centrifuge EBARA DN100"), l'IA analyse le texte et propose automatiquement les 3 articles SAP les plus probables avec leur score de confiance :

```
Suggestions SAP :
  92%  ▓▓▓▓▓▓▓▓▓  10-PUMP-0042  Pompe centrifuge DN100 - EBARA
  78%  ▓▓▓▓▓▓▓▓   10-PUMP-0041  Pompe centrifuge DN80 - EBARA
  65%  ▓▓▓▓▓▓▓    10-PUMP-0055  Pompe centrifuge DN100 - FLOWSERVE
```

L'agent sélectionne la bonne référence ou ignore les suggestions s'il connaît lui-même la référence.

### 3.3 Amélioration continue

Chaque fois qu'un agent confirme ou corrige une suggestion, le modèle mémorise l'association correcte. Les suggestions s'améliorent au fil du temps.

---

## 4. Génération de rapports narratifs

### 4.1 Concept

Pour certains types de rapports, l'IA peut générer automatiquement un texte narratif à partir des données structurées. L'utilisateur obtient un brouillon complet qu'il n'a plus qu'à vérifier et valider.

### 4.2 Types de rapports supportés

**Rapport HSE mensuel :** À partir des signalements, incidents, taux de compliance, et statistiques des certifications du mois, l'IA génère un rapport narratif structuré avec analyse des tendances et recommandations.

**Rapport de fin de voyage :** À partir du journal de bord, des manifestes et des KPIs, l'IA génère un compte-rendu de voyage.

**Rapport d'état de projet :** À partir de l'avancement des tâches, des ressources mobilisées et des écarts par rapport à la baseline, l'IA génère un rapport d'avancement.

**Résumé d'AdS pour validation :** Pour les validateurs qui traitent de nombreuses demandes, l'IA génère un résumé de chaque AdS en quelques lignes pour faciliter la lecture.

### 4.3 Processus de génération

1. L'utilisateur ouvre le rapport souhaité et clique "Générer avec l'IA"
2. L'IA reçoit les données structurées du rapport
3. En quelques secondes, le brouillon apparaît dans l'éditeur de documents OpsFlux
4. L'utilisateur révise, complète, et valide
5. Le rapport final est signé électroniquement si nécessaire

---

## 5. Détection automatique d'anomalies

### 5.1 Concept

Chaque nuit, l'IA analyse les données OpsFlux et détecte des situations anormales qui méritent attention. Ces anomalies sont présentées aux utilisateurs concernés le lendemain matin.

### 5.2 Types d'anomalies détectées

**Certifications à risque :**
- PAX avec une AdS approuvée dont une certification expire pendant le séjour
- Taux de compliance d'une entreprise qui chute brutalement

**Anomalies logistiques :**
- Colis immobile depuis trop longtemps (différent d'un simple retard prévu)
- Pattern de no-shows répétitifs pour un même PAX ou une même entreprise
- Manifestes avec taux de remplissage aberrant (1 PAX sur un vol de 15 places)

**Anomalies de données :**
- Profils PAX potentiellement en doublon non détectés par l'algorithme standard
- Poids déclarés dans les AdS statistiquement improbables

**Opportunités d'optimisation :**
- Deux voyages avec peu de passagers qui pourraient être consolidés
- Des colis en attente qui pourraient être groupés sur un prochain voyage

### 5.3 Présentation des anomalies

Les anomalies sont présentées comme des alertes dans le tableau de bord et dans le briefing journalier IA. Chaque anomalie propose des actions directes : "Voir le PAX", "Valider la certification", "Fusionner les voyages".

---

## 6. MCP — Outils d'analyse avancée

### 6.1 Concept MCP

MCP (Model Context Protocol) est une interface qui permet à l'assistant IA d'appeler des outils spécialisés pour répondre à des questions complexes nécessitant des calculs ou des analyses sur les données.

L'utilisateur n'a pas besoin de savoir que l'IA utilise des outils — c'est transparent. Il pose sa question, l'IA effectue les analyses nécessaires et produit la réponse.

### 6.2 Exemples d'analyses disponibles

**Analyse de la charge PAX :** "Quel site sera le plus proche de sa capacité maximale dans les 2 prochaines semaines ?" → L'IA interroge Planner et PaxLog, croise les données, et produit un classement.

**Analyse des tendances HSE :** "La compliance HSE de DIXSTONE s'est-elle améliorée depuis 6 mois ?" → L'IA calcule l'évolution du taux de compliance dans le temps et la présente avec un graphique.

**Prévision de besoins transport :** "Combien de vols supplémentaires faudra-t-il pour la semaine prochaine ?" → L'IA analyse les AdS approuvées, les manifestes en cours, et les capacités disponibles.

**Analyse de rentabilité cargo :** "Quel est le taux d'utilisation moyen de chaque vecteur par type de cargaison ?" → L'IA croise les données de TravelWiz sur une période.

### 6.3 Limites et sécurité

- L'IA ne peut accéder qu'aux données que l'utilisateur a le droit de voir (les droits RBAC s'appliquent aussi aux requêtes IA)
- Un quota d'appels par minute est configuré pour éviter les abus
- Toutes les requêtes IA sont journalisées

---

## 7. Base de connaissances (RAG)

### 7.1 Concept

OpsFlux intègre une base de connaissances enrichie par les documents de l'organisation. L'IA peut s'appuyer sur ces documents pour répondre à des questions sur les procédures, les réglementations, les manuels techniques.

### 7.2 Documents indexés

Les types de documents qui peuvent être indexés :
- Procédures HSE et manuels de sécurité
- Réglementations locales (offshore, travail, transport)
- Manuels d'opération des équipements
- Plans d'urgence et procédures d'évacuation
- Chartes et politiques internes

### 7.3 Gestion des documents

Un administrateur gère les documents indexés : ajout, mise à jour, suppression. Quand un document est mis à jour, sa version précédente est archivée mais plus utilisée pour les réponses IA.

Les réponses basées sur la base de connaissances citent toujours la source utilisée.

---

## 8. Configuration et gouvernance

### 8.1 Providers IA

OpsFlux supporte plusieurs fournisseurs de modèles IA, configurables par tenant :
- **Ollama (local)** : modèle LLM hébergé sur l'infrastructure Perenco — aucune donnée ne sort du réseau
- **Anthropic Claude** : modèle cloud pour les analyses complexes et la génération de rapports
- **OpenAI GPT** : alternative cloud

La configuration détermine quelles fonctions utilisent quel provider (génération de texte, embeddings pour la base de connaissances, suggestions...).

### 8.2 Politique de données

Quand un provider cloud est utilisé, les données envoyées au modèle sont configurées selon la politique de confidentialité de Perenco. Les données médicales et les informations personnelles sensibles ne sont jamais envoyées à des services cloud.

### 8.3 Désactivation

L'administrateur peut désactiver le panneau IA globalement pour tous les utilisateurs, ou laisser chaque utilisateur choisir dans ses préférences.
