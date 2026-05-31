# Synthese des actions projet a prevoir

Ce document consolide les travaux a prevoir autour de l'evaluation, de la mise en service, puis de la maintenance et de l'evolution de l'application.

## Scope OVA en trois niveaux

| Niveau | Objectif | Activites principales | Sortie attendue |
| --- | --- | --- | --- |
| 1. Test et recette | Valider la plateforme et mesurer la charge de travail. | Tests fonctionnels, RBAC, responsive, traduction, donnees, documentation, anomalies. | Rapport de recette, backlog priorise, decision de suite. |
| 2. Maintenance et exploitation | Stabiliser l'utilisation apres la phase de test. | Qualification incidents, suivi correctifs, non-regression, aide utilisateurs, mise a jour documentation. | Process de run, indicateurs support, base de connaissance. |
| 3. Evolution applicative | Faire evoluer OpsFlux avec les besoins metiers. | Ateliers besoin, specification, priorisation, recette evolutions, accompagnement changement. | Backlog evolution, fiches fonctionnelles, releases validees. |

## Deploiement et hebergement

| Action | Description | Responsable |
| --- | --- | --- |
| Choix environnement | Confirmer test, preproduction et production. | OpsFlux + OVA |
| Hebergement | Definir modalite d'hebergement, sauvegarde, supervision. | OpsFlux |
| SSO / comptes | Configurer authentification, roles et utilisateurs. | OpsFlux + OVA |
| Services connectes | Configurer emails, stockage, IA, RiseUp ou autres connecteurs. | OpsFlux + OVA |
| Securite | Valider cloisonnement, permissions, traces et donnees sensibles. | OpsFlux + OVA |

## Donnees et migration

| Action | Description | Responsable |
| --- | --- | --- |
| Collecte donnees | Recevoir fichiers sources et documents. | OVA |
| Nettoyage | Identifier doublons, champs manquants et incoherences. | OpsFlux + OVA |
| Import | Importer les donnees dans l'environnement de test. | OpsFlux |
| Validation | Confirmer que les donnees importees sont exploitables. | OVA |

## Formation et accompagnement

| Action | Description | Responsable |
| --- | --- | --- |
| Formation testeurs | Presenter navigation, modules et tableau de suivi. | OpsFlux |
| Formation administrateurs | Roles, permissions, configuration et supervision. | OpsFlux |
| Support evaluation | Accompagner les retours et arbitrages. | OpsFlux + OVA |
| Documentation | Mettre a jour aide dynamique et documentation utilisateur. | OpsFlux |

## Maintenance et exploitation

| Action | Description | Responsable |
| --- | --- | --- |
| Suivi anomalies | Prioriser, corriger et re-tester. | OpsFlux + OVA |
| Qualification incidents | Reproduire, documenter et classer les incidents remontes par les utilisateurs. | OVA + OpsFlux |
| Non-regression | Verifier que les correctifs ne cassent pas les parcours prioritaires. | OVA |
| Supervision | Surveiller disponibilite, erreurs et performances. | OpsFlux |
| Mises a jour | Organiser correctifs et evolutions. | OpsFlux + OVA |
| Base de connaissance | Enrichir les procedures, FAQ et guides d'aide a partir des incidents recurrentes. | OVA + OpsFlux |
| Revue periodique | Faire un point d'avancement et de qualite. | OpsFlux + OVA |

## Evolution applicative

| Action | Description | Responsable |
| --- | --- | --- |
| Collecte besoins | Centraliser les retours utilisateurs et besoins metiers. | OVA + OpsFlux |
| Qualification fonctionnelle | Transformer un besoin en fiche claire: contexte, objectif, regles, criteres d'acceptation. | OVA + OpsFlux |
| Priorisation | Classer les evolutions selon valeur metier, urgence, risque et charge estimee. | OVA + OpsFlux |
| Recette evolution | Tester les nouvelles fonctionnalites avant mise en service. | OVA |
| Accompagnement changement | Mettre a jour documentation, aide dynamique et supports de formation. | OVA + OpsFlux |

## Critere de sortie de l'evaluation

L'evaluation peut etre consideree comme concluante lorsque:

- les comptes et droits critiques sont valides;
- les parcours prioritaires sont testes;
- les anomalies bloquantes sont corrigees ou planifiees;
- les donnees pilotes sont importees et exploitables;
- la documentation permet aux utilisateurs de travailler sans assistance permanente;
- OVA dispose d'une vision claire de la charge, du planning et des actions restantes.
