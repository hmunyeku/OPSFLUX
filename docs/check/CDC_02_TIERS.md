# Cahier des Charges Fonctionnel — Module Tiers

> Ce document décrit la gestion des entreprises externes qui interviennent sur les sites Perenco.

---

## Sommaire

1. [Rôle du module](#1-rôle-du-module)
2. [La fiche Tiers](#2-la-fiche-tiers)
3. [Gestion des équipes externes](#3-gestion-des-équipes-externes)
4. [Portail d'accès externe](#4-portail-daccès-externe)
5. [Statuts et sanctions](#5-statuts-et-sanctions)
6. [Interactions avec les autres modules](#6-interactions-avec-les-autres-modules)

---

## 1. Rôle du module

Le module Tiers est le **référentiel des entreprises et partenaires externes** de Perenco. Il centralise les informations sur les sous-traitants, fournisseurs et prestataires qui font intervenir leur personnel sur les sites.

Un Tiers dans OpsFlux représente une entreprise externe — pas ses employés individuellement. Les employés d'un Tiers sont des profils PAX gérés dans le module PaxLog.

Le module Tiers sert de pont entre Perenco et les entreprises extérieures : il permet à un responsable DIXSTONE, par exemple, de gérer les profils HSE de ses techniciens directement depuis un portail sécurisé, sans avoir de compte OpsFlux à part entière.

---

## 2. La fiche Tiers

### 2.1 Informations générales

Chaque Tiers est décrit par :
- **Nom officiel** et **nom court**
- **Code Tiers** (identifiant unique, ex : "DIXSTONE", "SPIE-CM")
- **Type** : sous-traitant / fournisseur / prestataire de service / transporteur
- **Pays** et **adresse**
- **Numéro de registre commercial** et **numéro de TVA**
- **Statut** : actif, suspendu, blacklisté, archivé

### 2.2 Contacts

Chaque Tiers a une liste de contacts nominatifs avec leur rôle (DG, RH, responsable HSE, responsable chantier), leur email et leur téléphone. Ces contacts sont ceux qui reçoivent les notifications et les liens de portail.

### 2.3 Statistiques automatiques

La fiche Tiers affiche en temps réel des statistiques calculées automatiquement depuis les autres modules :
- **Nombre de PAX actifs** dans OpsFlux
- **Taux de compliance HSE moyen** de l'ensemble de l'équipe
- **Nombre d'AdS en cours** pour les intervenants de cette entreprise
- **Signalements actifs** en cours
- **Taux de no-show** sur les 12 derniers mois (intervenants absents malgré une AdS approuvée)
- **Nombre de colis en transit** pour cette entreprise

Ces statistiques permettent à Perenco d'évaluer rapidement la fiabilité et la conformité HSE d'un sous-traitant.

---

## 3. Gestion des équipes externes

### 3.1 Voir l'équipe d'un Tiers

Depuis la fiche Tiers, un utilisateur habilité peut :
- Voir tous les profils PAX enregistrés pour ce Tiers
- Voir le statut de compliance HSE de chaque intervenant (conforme, certifications expirées, certifications manquantes)
- Voir les signalements actifs sur les intervenants
- Voir l'historique des AdS (missions passées et en cours)

### 3.2 Score de compliance de l'équipe

Le score de compliance de l'équipe est le pourcentage d'intervenants actuellement conformes pour un site donné. Par exemple : "DIXSTONE — Conformité pour ESF1 : 11/14 intervenants conformes (78%)".

Ce score est calculé à la demande ou consulté en temps réel depuis la fiche Tiers.

---

## 4. Portail d'accès externe

### 4.1 Concept

Le portail externe est la **fonctionnalité principale du module Tiers**. Il permet à un responsable d'entreprise externe de gérer les profils HSE de son équipe en continu, sans avoir de compte OpsFlux permanent.

L'objectif est d'éliminer les échanges d'emails pour demander des mises à jour de certifications. Le responsable DIXSTONE peut lui-même uploader le renouvellement BOSIET de ses techniciens depuis un lien sécurisé.

### 4.2 Génération d'un lien d'accès

Un utilisateur Perenco habilité (CHSE, CDS, LOG_BASE) génère un lien d'accès depuis la fiche Tiers. La configuration du lien comprend :
- **Destinataire** : email ou téléphone du responsable externe
- **Durée de validité** : 7, 14, 30 jours, ou personnalisé
- **Site de référence** : tous les sites, ou un site spécifique (le portail affichera alors la compliance pour ce site)
- **Permissions activées** :
  - Voir la liste de l'équipe et les statuts
  - Mettre à jour les profils (nom, photo, date de naissance)
  - Uploader des certifications
  - Ajouter de nouveaux membres à l'équipe (optionnel)

Le lien généré est affiché avec un QR code. Un email/SMS est envoyé automatiquement au destinataire.

### 4.3 Ce que voit le responsable externe

Le responsable accède à un portail simplifié (pas l'interface OpsFlux complète) avec un code OTP envoyé par SMS ou email.

L'interface montre :
- La liste de son équipe avec leur statut global (conforme ✓, avertissement ⚠, bloqué ✗)
- Pour chaque personne : la liste de ses certifications requises pour le site, leur statut et leur date d'expiration
- Un bouton d'upload pour chaque certification à renouveler

Ce que le responsable externe **ne voit pas** :
- Les signalements internes Perenco
- Les données médicales détaillées
- Les AdS des autres entreprises
- Les commentaires internes des validateurs Perenco
- Les profils marqués comme "confidentiels"

### 4.4 Workflow après upload

Quand le responsable externe uploade un document de certification :
1. La certification passe en statut "en attente de validation Perenco"
2. Le CHSE ou HSE_SITE est notifié : "Nouvelle certification à valider pour [PAX] ([Tiers])"
3. Sur le portail externe, le responsable voit : "En attente de validation Perenco"
4. Si validée par le CHSE → la certification devient valide, la compliance du PAX est mise à jour
5. Si rejetée → le motif s'affiche sur le portail, le responsable peut uploader un nouveau document

Le délai de validation est configurable (défaut 48h). Passé ce délai, un rappel est envoyé au CHSE.

### 4.5 Historique des liens

Depuis la fiche Tiers, l'administrateur voit tous les liens générés :
- Liens actifs, expirés, révoqués
- Date de génération, générateur, destinataire
- Nombre d'utilisations, dernière utilisation
- Actions effectuées via ce lien (audit complet)

### 4.6 Révocation d'un lien

Un lien peut être révoqué à tout moment avec un motif. La session active du responsable externe est invalidée immédiatement — il ne peut plus accéder au portail même s'il a le lien.

---

## 5. Statuts et sanctions

### 5.1 Statut actif

État normal. Tous les services sont disponibles, les AdS des intervenants peuvent être soumises et approuvées.

### 5.2 Suspension

Un Tiers suspendu ne peut plus générer de nouvelles AdS. Les AdS déjà en cours restent actives mais sont signalées.

**Déclenchement automatique** : Un signalement de type `blacklist_temporaire` ou `blacklist_permanent` validé pour l'entreprise entière entraîne automatiquement la suspension.

**Déclenchement manuel** : Un DO ou DQHSE peut suspendre manuellement avec un motif documenté.

**Effet sur les AdS existantes** : Les AdS approuvées en cours ne sont pas annulées — elles sont signalées pour information. C'est le DO qui décide s'il faut rapatrier les intervenants.

### 5.3 Blacklist

Un Tiers blacklisté est exclu de tous les futurs services :
- Nouvelles AdS **bloquées automatiquement** (le système rejette sans demander validation)
- Les intervenants apparaissent avec le badge ⛔ dans tous les manifestes
- Le Tiers n'apparaît plus dans les listes de sélection des formulaires
- Les liens portail existants sont révoqués automatiquement

La levée d'une blacklist ne peut être effectuée que par le DO, avec motif documenté.

### 5.4 Expiration de contrat

Chaque Tiers peut avoir une date d'expiration de contrat. À J-30 et J-7, une alerte est envoyée au responsable administratif. Aucun blocage automatique n'est appliqué à l'expiration — c'est une information de gestion. Si le contrat n'est pas renouvelé, l'administrateur suspend manuellement le Tiers.

---

## 6. Interactions avec les autres modules

**PaxLog** : Les profils PAX sont toujours rattachés à un Tiers. Le statut du Tiers (suspendu, blacklisté) affecte directement la possibilité de créer des AdS pour ses intervenants.

**TravelWiz** : Les colis peuvent être associés à un Tiers expéditeur ou destinataire, facilitant le tri et la traçabilité.

**Projets** : Les Tiers peuvent être référencés dans les imputations budgétaires des projets (quel sous-traitant pour quelle tâche).

**Asset Registry** : Un Tiers peut être limité dans sa capacité de PAX sur certains assets (limite contractuelle).
