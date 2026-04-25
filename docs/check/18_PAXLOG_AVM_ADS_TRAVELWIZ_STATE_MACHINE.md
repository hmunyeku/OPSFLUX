# AVM / AdS / TravelWiz State Machine

Date: 2026-04-03

## Objet

Cette note fixe une lecture unifiée des changements d'état entre:

- l'**AVM** comme dossier de mission
- l'**AdS** comme autorisation d'accès / de séjour
- **TravelWiz** comme exécution des mouvements aller / retour

Elle sert de vue d'ensemble métier.

Références principales:

- [docs/modules/v1/PAXLOG.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/PAXLOG.md)
- [docs/modules/v1/FUNC_TRAVELWIZ.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/FUNC_TRAVELWIZ.md)
- [docs/modules/v1/TRAVELWIZ.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/TRAVELWIZ.md)
- [app/models/paxlog.py](C:/Users/ajha0/Desktop/OPSFLUX/app/models/paxlog.py)

## 1. Vue d'ensemble

```text
AVM ouverte
  -> programme défini
  -> PAX affectés
  -> prérequis cochés
  -> lancement AVM
     -> tâches préparatoires créées
     -> AdS générées par ligne si site requis
        -> chaque AdS suit son workflow propre
           -> approved
              -> TravelWiz prépare l'aller
                 -> manifeste aller clôturé / boarded
                    -> AdS in_progress
                       -> séjour sur site
                       -> prolongation / arbitrage / replanification possibles
                       -> TravelWiz prépare le retour
                          -> manifeste retour clôturé / boarded
                             -> AdS completed
  -> toutes les AdS terminées
     -> AVM completed
```

## 2. Machine d'états AVM

```text
draft
  -> launch
in_preparation
  -> au moins une AdS terrain réellement engagée
active
  -> toutes tâches prépa OK + toutes AdS requises approuvées
ready
  -> toutes AdS clôturées après retour effectif
completed

Transitions latérales:
draft -> cancelled
in_preparation -> cancelled
active -> modification pilotée / réorchestration
```

Lecture pratique:

- `draft`: mission en construction
- `in_preparation`: mission lancée, prérequis et AdS en cours
- `active`: mission effectivement démarrée sur le terrain
- `ready`: tout est prêt ou validé côté départ / préparation
- `completed`: plus aucun séjour ouvert lié à cette mission

## 3. Machine d'états AdS

```text
draft
  -> submit / revue initiateur éventuelle
pending_initiator_review
  -> validation initiateur
pending_project_review
  -> validation projet si applicable
pending_compliance
  -> contrôles documents / habilitations / quotas / accès
pending_validation
  -> validation finale opérationnelle
approved
  -> manifeste aller exécuté / boarded
in_progress
  -> séjour réellement en cours
completed

Branches alternatives:
pending_* -> rejected
approved -> requires_review
in_progress -> requires_review
* -> cancelled
```

Règles utiles:

- une AdS issue d'AVM ne repasse pas par la logique `0-B` projet si la doc métier s'applique telle quelle
- `approved` ne veut pas encore dire "personne sur site"
- `in_progress` commence au moment du mouvement aller réellement exécuté
- `completed` suppose la fin de présence et le retour effectif

## 4. Machine d'états TravelWiz

```text
AdS approved
  -> recherche ou création d'un voyage
  -> affectation sur manifeste aller
manifeste aller open
  -> check-in / embarquement / clôture
  -> if boarded: AdS in_progress
  -> if no_show: AdS à revoir

AdS in_progress
  -> préparation retour
  -> affectation manifeste retour
manifeste retour open
  -> check-in / embarquement / clôture
  -> if boarded: fin de séjour
  -> if no_show retour: PAX toujours sur site, AdS non clôturée
```

## 5. Cas de changement en cours de mission

### 5.1 Prolongation de séjour

```text
AdS in_progress
  -> demande de prolongation
  -> recheck compliance
  -> recheck capacité site
  -> si retour déjà planifié: retrait du manifeste retour obsolète
  -> nouvelle date de fin
  -> nouveau retour à planifier
```

### 5.2 Réarbitrage Planner

```text
activité Planner modifiée
  -> impact analysis
  -> AdS liées -> requires_review
  -> manifestes liés -> requires_review
  -> décision:
     maintien
     réduction
     report
     prolongation
     retour anticipé
```

### 5.3 AdS rejetée dans une AVM

```text
AVM active / in_preparation
  -> une AdS générée est rejetée
  -> AVM reste vivante
  -> ligne programme en anomalie
  -> recréation ou correction de l'AdS
```

## 6. Cas complet type

```text
1. Création AVM
2. Lancement AVM
3. Création automatique AdS pour ligne site
4. AdS approved
5. TravelWiz met le PAX sur manifeste aller
6. Aller exécuté
7. AdS in_progress
8. Planner décale la fin d'activité
9. AdS prolongée et retour replanifié
10. Retour exécuté
11. AdS completed
12. Toutes les AdS AVM closes
13. AVM completed
```

## 7. Point de vigilance

Cette machine d'états reflète bien la logique métier documentée.
Dans le code actuel, la structure et plusieurs endpoints sont bien présents,
mais certains raffinements de transitions restent surtout portés par la doc.

La bonne lecture est donc:

- **structurellement confirmé** côté code
- **métier finement spécifié** côté documentation
