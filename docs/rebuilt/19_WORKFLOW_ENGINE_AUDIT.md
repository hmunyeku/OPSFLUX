# 19 Workflow Engine Audit

Date: 2026-04-03

## 1. Réponse courte

Non, le module `Workflow` n'est pas encore assez clarifié.

Le moteur existe réellement et il est plus sérieux que la doc actuelle ne le laisse penser.
Mais la documentation reconstruite est encore trop légère sur un point critique:

- ce qui relève du moteur générique FSM
- ce qui relève des workflows métier de chaque module
- ce qui contourne encore le moteur via des fallbacks ou transitions locales

## 2. Ce qui existe réellement

## 2.1 Moteur générique

Le moteur FSM existe dans:

- `app/services/core/fsm_service.py`

Il gère déjà:

- création / récupération d'instance
- validation des transitions
- verrouillage concurrent
- rôles requis par transition
- permissions requises par transition
- commentaire obligatoire
- historique immuable des transitions
- émission d'événements après transition

Donc le sujet n'est pas théorique.

## 2.2 API de design / administration

L'API `workflow.py` permet déjà:

- gérer les définitions
- publier
- cloner / versionner
- instancier
- exécuter des transitions
- lire l'historique

Il y a donc un vrai module administrable, pas juste une bibliothèque interne.

## 2.3 Usages réels par modules

Des usages concrets existent déjà au moins dans:

- `Report Editor`
- `PID/PFD`
- partiellement ailleurs selon les objets

On voit aussi des liens de modèle dans:

- `paxlog.py`
- `report_editor.py`

## 3. Le vrai problème

Le problème n'est pas l'absence de moteur.
Le problème est l'absence de doctrine assez explicite sur son périmètre réel.

## 3.1 Trois niveaux mélangés

Aujourd'hui, le mot "workflow" peut vouloir dire:

1. un parcours métier transverse
2. une machine d'états FSM
3. une logique locale de changement de statut

Ces trois niveaux ne sont pas assez séparés dans la doc.

## 3.2 Fallbacks dangereux

Le point le plus sensible est celui déjà repéré plus tôt:

- certains services essayent une transition FSM
- puis retombent sur une mise à jour directe de statut si le workflow n'existe pas

C'est pratique pour avancer.
Mais c'est dangereux si l'équipe croit être protégée par un workflow strict alors qu'en réalité un fallback hors FSM continue d'exister.

## 3.3 Couverture inégale

Tous les modules n'ont pas le même niveau de workflow réel.

Exemple:

- `Report Editor` et `PID/PFD` montrent une intégration FSM explicite
- `PaxLog`, `Planner`, `TravelWiz` ont beaucoup de logique d'états métier, mais pas encore tous au même niveau d'adossement explicite au moteur générique

## 4. Ce qui doit être clarifié

## 4.1 Ce qu'est un workflow générique

Le module `Workflow` doit être défini comme:

- moteur de machine d'états
- définition de transitions
- guards
- permissions / rôles requis
- historique
- événements associés

Il ne doit pas être confondu avec:

- l'UX d'un processus
- les pages de validation
- les side effects métier d'un module

## 4.2 Ce qu'un module doit fournir

Un module métier doit fournir:

- la liste de ses états métier
- les transitions autorisées
- les side effects métier
- les événements émis
- la correspondance éventuelle entre `status` objet et `current_state` workflow

## 4.3 Ce qui doit être interdit

Si un objet est déclaré "workflow-driven", alors:

- son statut ne doit pas être changé directement hors moteur

Sinon, il faut documenter explicitement:

- qu'il s'agit encore d'un mode hybride

## 5. Doctrine cible

## 5.1 Trois couches à écrire clairement

### Couche 1: workflow métier

Exemple:

- AdS terrain
- avis de mission
- document officiel
- ticket support

Cette couche décrit le processus métier.

### Couche 2: FSM technique

Exemple:

- `draft -> in_review -> approved -> published`

Cette couche décrit les transitions d'état.

### Couche 3: side effects

Exemple:

- notification
- génération PDF
- émission événement
- verrouillage de version
- création manifeste

Cette couche décrit ce qui se passe quand la transition est réussie.

## 5.2 Règle d'or

Une transition de workflow ne doit pas embarquer silencieusement de logique métier cachée.

Il faut documenter à chaque transition:

- qui peut la faire
- dans quelles conditions
- quel état change
- quels side effects se déclenchent

## 6. Impact par module

## 6.1 PaxLog

Le workflow AdS / AVM doit être explicité comme l'un des workflows les plus critiques du produit.

Il faut documenter:

- états
- transitions
- acteurs
- corrections / re-soumissions
- impacts Planner / TravelWiz

## 6.2 Report Editor

C'est probablement aujourd'hui l'un des modules les plus proches d'une vraie intégration workflow explicite.

Il peut servir de référence de bonne structure, à condition de supprimer les fallbacks non maîtrisés.

## 6.3 PID/PFD

Le module semble déjà utiliser explicitement le moteur FSM.

Il doit être documenté comme exemple technique de workflow piloté par définition.

## 6.4 Support

Le workflow Support doit être clarifié, sinon il restera un objet ambigu entre ticket, incident et simple message.

## 7. Ce qu'il faut ajouter à la documentation

Pour chaque objet piloté par workflow, il faut au minimum une fiche contenant:

- état initial
- états possibles
- transitions autorisées
- rôles autorisés
- permission requise
- commentaire requis ou non
- side effects
- événements émis
- fallback éventuel s'il existe encore

## 8. Verdict final

Le moteur Workflow n'est pas faible.
La documentation, elle, est encore trop faible par rapport au moteur.

Le vrai risque n'est donc pas "pas de workflow".
Le vrai risque est:

- croire que tout est gouverné par workflow alors que ce n'est pas encore homogène
- ne pas distinguer clairement processus métier, FSM technique et side effects

## 9. Étapes suivantes

1. réécrire la doc module `WORKFLOW`
2. produire une matrice `objet métier -> workflow-driven ou hybride`
3. produire une fiche de workflow par objet critique:
   - `AdS`
   - `AVM`
   - `Document`
   - `PID`
   - `Support Ticket`
4. identifier et supprimer progressivement les fallbacks hors FSM quand un workflow est censé être opposable
