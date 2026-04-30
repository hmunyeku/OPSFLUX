# 02 PDCA Execution Model

## 1. Objet

Ce document donne la méthode de pilotage d'OpsFlux en mode:

- Plan
- Do
- Check
- Act

Le but est d'éviter la dérive actuelle où coexistent code partiel, docs cibles
et comportements non alignés.

## 2. Plan

Chaque sujet doit commencer par une fiche simple:

- objectif métier
- modules touchés
- source de vérité visée
- états impactés
- permissions impactées
- événements émis / consommés
- niveau de maturité initial: implemented / partial / target
- risques

Sortie attendue:

- un mini backlog priorisé
- un scénario nominal
- les cas d'échec

## 3. Do

En exécution, on applique cet ordre:

1. sécuriser le socle si le sujet touche auth, tenant, settings, permissions
2. implémenter le chemin nominal complet
3. brancher l'audit et les événements
4. brancher l'UI minimale
5. écrire ou corriger la doc en même temps

Règle:

- pas de livraison d'un workflow sans son scénario de test de bout en bout

## 4. Check

Le check se fait à quatre niveaux:

### 4.1 Check code

- routes cohérentes
- permissions présentes
- contrôles de scope présents
- transitions d'état valides

### 4.2 Check produit

- scénario nominal exécutable
- cas d'erreur lisibles
- statut visible
- acteurs notifiés

### 4.3 Check doc

- module à jour
- workflow multi-module à jour
- hypothèses et limites explicites

### 4.4 Check UI

- respecte les règles globales
- pas de pattern local isolé
- responsive correct
- statuts compréhensibles

## 5. Act

Après vérification:

- corriger ce qui bloque réellement l'usage
- réduire les écarts docs/code
- transformer les constats en backlog court
- reclassifier le niveau de maturité

## 6. Rituel hebdomadaire recommandé

### Lundi

- choisir 1 flux critique
- écrire ou mettre à jour la fiche Plan

### Mardi à jeudi

- implémenter le nominal
- fermer les trous de permission / état / audit

### Vendredi

- exécuter le scénario bout en bout
- mettre à jour doc module + workflow

### Week-end ou release cut

- ne garder que ce qui est réellement opérable
- tout le reste passe explicitement en `partial` ou `target`

## 7. Application immédiate à PaxLog

Pour ce week-end, le PDCA doit être focalisé sur:

- profils PAX
- AdS
- compliance minimale
- articulation TravelWiz
- AVM si et seulement si le nominal AdS est déjà solide
