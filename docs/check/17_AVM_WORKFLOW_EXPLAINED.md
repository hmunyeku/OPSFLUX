# Workflow AVM

Date: 2026-04-03

## Objet

Cette note enregistre le workflow de l'**AVM** dans OpsFlux.

Important: dans le projet, la notion implémentée et documentée est **AVM**
(`Avis de Mission`), pas `ADM`. Je m'aligne donc sur la terminologie réelle du
code et des docs.

Références:

- [app/models/paxlog.py](app/models/paxlog.py)
- [app/api/routes/modules/paxlog.py](app/api/routes/modules/paxlog.py)
- [docs/modules/v1/PAXLOG.md](docs/modules/v1/PAXLOG.md)

## 1. Ce qu'est une AVM

L'AVM est le **dossier de mission complet**.
Elle ne remplace pas l'AdS: elle la **pilote**.

L'AVM regroupe:

- le programme de mission
- les intervenants par ligne de programme
- les documents mission
- les tâches préparatoires
- les parties prenantes
- les AdS générées pour les lignes nécessitant un accès site

Dans le modèle:

- `MissionNotice` = dossier AVM
- `MissionProgram` = ligne de programme
- `MissionProgramPax` = personnes affectées à une ligne
- `MissionPreparationTask` = travaux préparatoires
- `generated_ads_id` = AdS générée pour la ligne

## 2. Cycle nominal

### 2.1 Ouverture

1. l'initiateur crée l'AVM en `draft`
2. il renseigne titre, description, dates, type de mission
3. il construit les lignes du programme
4. il ajoute les PAX par ligne
5. il coche les indicateurs de préparation: visa, badge, EPI, indemnités
6. il désigne au besoin des parties prenantes

### 2.2 Lancement

Au lancement de l'AVM:

1. des tâches préparatoires sont créées automatiquement selon les indicateurs
2. les documents par PAX sont préparés si configurés
3. une AdS est générée pour chaque ligne de programme qui a un site
4. l'AVM passe en `in_preparation`
5. les notifications de mission sont émises

Le principe central est donc:

`AVM -> lignes de programme -> AdS générées -> chaque AdS suit son propre workflow`

### 2.3 Validation des AdS issues d'AVM

Chaque AdS générée:

1. démarre en `draft`
2. garde un lien vers l'AVM source
3. suit son propre workflow de validation

Règle métier importante documentée:

- l'étape `0-B` de validation chef de projet est exclue pour une AdS issue d'AVM
- l'AVM est considérée comme portant déjà la validation projet globale

### 2.4 Passage aux états supérieurs

Les états AVM documentés sont:

1. `draft`
2. `in_preparation`
3. `active`
4. `ready`
5. `completed`
6. `cancelled`

Lecture métier:

- `draft`: dossier en préparation
- `in_preparation`: mission lancée, tâches et AdS en cours
- `active`: au moins une AdS liée a réellement démarré côté terrain
- `ready`: toutes les tâches prépa sont OK et toutes les AdS nécessaires sont approuvées
- `completed`: toutes les AdS liées sont clôturées, mission terminée
- `cancelled`: mission abandonnée avec motif

## 3. Exemple de fil métier complet

1. un chef de projet crée une AVM pour une mission terrain multi-jours
2. il crée plusieurs lignes:
3. arrivée sur site
4. inspection
5. réunion
6. retour
7. il affecte des PAX internes et/ou des contacts externes selon les lignes
8. il lance l'AVM
9. le système crée les tâches visa/badge/EPI si requis
10. le système crée les AdS nécessaires pour les lignes avec accès site
11. les AdS sont validées une à une
12. quand les départs se font, la mission devient réellement `active`
13. quand tout le prérequis est bouclé et que tout est validé, l'AVM est `ready`
14. quand toutes les AdS liées sont terminées après retour effectif, l'AVM est `completed`

## 4. Si une AdS générée est rejetée

La doc métier est claire sur ce point:

1. l'AVM ne s'annule pas automatiquement
2. la tâche préparatoire `ads_creation` reste considérée comme accomplie
3. l'initiateur doit gérer la relance depuis l'onglet AdS
4. la ligne concernée propose une action de type "Recréer l'AdS"

Donc l'AVM reste le conteneur de pilotage, même si une AdS fille échoue.

## 5. Si les dates changent en cours de mission

Le code expose un endpoint de modification d'AVM active:

- `POST /avm/{avm_id}/modify`

La documentation métier prévoit deux niveaux de modification:

### 5.1 Avant présence terrain réelle

Si l'AVM est encore `draft` ou `in_preparation`:

1. les lignes programme peuvent être ajustées
2. les dates peuvent bouger
3. les PAX peuvent être changés
4. les AdS générées peuvent être régénérées ou révisées selon leur état

### 5.2 Avec PAX déjà sur site

Si certaines AdS liées sont déjà `in_progress`:

1. on ne raisonne plus comme une simple édition administrative
2. il faut mesurer l'impact ligne par ligne
3. prolongation, raccourcissement, remplacement ou retour anticipé doivent être traités explicitement
4. les parties prenantes doivent être notifiées

Autrement dit, l'AVM reste modifiable, mais la modification devient une opération de réorchestration, pas un simple update.

## 6. Articulation avec Planner et TravelWiz

### 6.1 Planner

Quand l'AVM est liée à des projets ou tâches:

1. les lignes peuvent être imputées à des projets distincts
2. certaines tâches préparatoires peuvent être liées à des tâches WBS
3. un réarbitrage Planner peut imposer une revue des AdS et du programme mission

### 6.2 TravelWiz

L'AVM ne gère pas directement les manifestes.
Elle agit indirectement via les AdS qu'elle génère.

Chaîne réelle:

`AVM -> AdS approuvées -> TravelWiz organise les mouvements -> retour effectif -> clôture des AdS -> clôture AVM`

## 7. Fin de mission

Une AVM n'est pas terminée au simple motif que le travail est théoriquement fini.
La logique métier documentée est plus stricte:

1. les AdS liées doivent être clôturées
2. les retours effectifs doivent être confirmés
3. seulement alors l'AVM peut être `completed`

## 8. Résumé simple

L'AVM est la couche de pilotage amont de la mission.
L'AdS est la couche d'autorisation d'accès terrain.
TravelWiz est la couche d'exécution des mouvements.

En une ligne:

`AVM ouverte -> programme + PAX + prérequis -> lancement -> tâches automatiques + AdS générées -> validations AdS -> départs terrain -> modifications éventuelles en mission -> retours effectifs -> clôture des AdS -> AVM completed`

## 9. Niveau de confiance

Cette note est solide sur:

- la structure de données AVM
- les endpoints exposés
- le rôle de `generated_ads_id`
- les statuts et la logique AVM -> AdS décrits dans la doc

Comme pour d'autres sujets PaxLog, certains comportements avancés sont mieux
décrits dans les docs métier que totalement matérialisés dans le code visible.
