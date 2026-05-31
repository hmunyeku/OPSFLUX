# Note de cadrage - Evaluation OpsFlux avec OVA

## Contexte

Suite aux echanges avec OVA, une phase d'evaluation est organisee afin de mesurer la charge de travail, tester les parcours prioritaires, verifier la documentation utilisateur et preparer les donnees necessaires aux modules metiers.

Les premiers lots ne representent pas la finalite du projet. Ils constituent un passage oblige pour securiser l'exploitation de la plateforme: profils utilisateurs, preferences, comptes, droits, assets, conformite et support. Les modules Tiers et Projets seront ensuite abordes comme premiere couche operationnelle avant les modules metiers.

Le scope envisage avec OVA se structure en trois niveaux progressifs:

1. Test et recette: executer les parcours, remonter les anomalies, verifier la documentation et valider les donnees pilotes.
2. Maintenance et exploitation: contribuer au suivi des anomalies, a la qualification des incidents, a la verification des correctifs et a l'accompagnement des utilisateurs.
3. Evolution applicative: participer a la priorisation, a la specification et a la validation des evolutions fonctionnelles a plus long terme.

## Objectifs de l'evaluation

- Evaluer la charge de travail associee aux activites a realiser sur OpsFlux.
- Tester les modules prioritaires avec des profils utilisateurs representatifs.
- Identifier les anomalies bloquantes, majeures et mineures.
- Verifier la clarte de la documentation utilisateur et de l'aide dynamique.
- Alimenter la plateforme avec les donnees fournies par OVA.
- Produire un retour structure permettant de decider des prochaines etapes.

## Perimetre prioritaire

| Priorite | Domaine | But |
| --- | --- | --- |
| 1 | Profils et preferences utilisateurs | Valider l'experience de base et les reglages personnels. |
| 2 | Comptes, roles et droits | Verifier les permissions, la separation des responsabilites et les acces. |
| 3 | Assets | Tester l'inventaire, la recherche, les fiches et la qualite des donnees. |
| 4 | Conformite | Tester referentiels, audits, validations, preuves, expirations et notifications. |
| 5 | Support | Tester la creation, le suivi et le traitement des demandes. |
| 6 | Tiers | Tester entreprises, contacts, conformite tiers, documents et imports. |
| 7 | Projets | Tester projets, taches, planning, budget, changements et documents. |

## Role attendu d'OVA

Pendant la premiere phase, OVA intervient comme utilisateur pilote:

- executer les scenarios de test fournis;
- signaler les anomalies avec captures et etapes de reproduction;
- verifier si la documentation permet de realiser les actions sans assistance excessive;
- fournir ou valider les jeux de donnees a importer;
- confirmer les ecarts entre le besoin operationnel et le comportement observe.

A plus long terme, le role pourra evoluer vers une contribution de maintenance applicative et d'amelioration continue, selon les resultats de la recette, la disponibilite des equipes et le niveau d'autonomie constate.

## Niveaux de collaboration OVA

| Niveau | Horizon | Role OVA | Livrables attendus |
| --- | --- | --- | --- |
| 1. Test et recette | 2 mois | Tester les parcours, documenter les anomalies, verifier l'aide et les donnees. | Tableau de suivi complete, anomalies qualifiees, retours documentation, donnees validees. |
| 2. Maintenance et exploitation | Apres recette | Participer au support applicatif, qualifier les incidents, verifier les correctifs, suivre les demandes recurrentes. | Registre incidents, retours de non-regression, indicateurs de support, base de connaissance enrichie. |
| 3. Evolution applicative | Moyen / long terme | Contribuer aux ateliers d'evolution, formaliser les besoins, prioriser et valider les nouvelles fonctionnalites. | Backlog priorise, fiches besoin, criteres d'acceptation, validation metier des evolutions. |

## Livrables attendus

- Tableau de suivi des tests complete.
- Liste priorisee des anomalies.
- Liste des demandes d'amelioration.
- Retour sur la documentation utilisateur.
- Catalogue des donnees fournies et manquantes.
- Synthese de charge et de planning pour les prochaines phases.
