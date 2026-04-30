# 31 Reference Test Dataset

Date: 2026-04-03

## 1. Objet

Définir un dataset de référence commun pour les tests manuels, automatisés et agentiques.

## 2. Organisation minimale

- 1 entité active
- 2 BU
- 2 groupes
- 1 cost center par BU
- 1 imputation OPEX active
- 1 imputation CAPEX active
- 1 modèle OTP réutilisable

## 3. Utilisateurs minimaux

- 1 `demandeur`
- 1 `valideur_conformite`
- 1 `chef_projet`
- 1 `superviseur_mouvement`
- 1 `log_base`
- 1 `admin_module`

## 4. Référentiel terrain

- 1 champ
- 2 sites
- 3 installations
- 2 équipements
- 1 pipeline

## 5. Tiers / PAX

- 1 société tierce
- 2 contacts tiers
- 1 profil PAX interne
- 1 profil PAX externe

## 6. Projet et planning

- 1 projet actif
- 1 activité planner sur un site
- 1 conflit de capacité simulé

## 7. PaxLog

- 1 AdS brouillon
- 1 AdS en attente conformité
- 1 AdS approuvée
- 1 AVM en préparation

## 8. TravelWiz

- 1 voyage planifié
- 1 manifeste PAX
- 1 cargo item

## 9. Documents

- 1 document draft
- 1 document in_review

## 10. Usage

Ce dataset doit servir de base unique pour:

- tests de permissions
- tests de vues conditionnelles
- tests de workflow
- tests d'imputation
