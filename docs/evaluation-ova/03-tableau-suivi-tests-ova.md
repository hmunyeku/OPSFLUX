# Tableau de suivi des tests OVA

Ce tableau peut etre recopie dans OpsFlux, Excel, Google Sheets ou tout outil de suivi partage.

## Colonnes recommandees

| Champ | Description |
| --- | --- |
| ID | Identifiant unique du test. |
| Lot | Lot de test concerne. |
| Module | Module ou domaine fonctionnel. |
| Scenario | Action a realiser. |
| Priorite | Critique, haute, normale, basse. |
| Profil testeur | Role ou compte utilise. |
| Donnees requises | Donnees necessaires pour executer le test. |
| Resultat attendu | Comportement attendu. |
| Resultat observe | Comportement reel. |
| Statut | Non demarre, en cours, OK, KO, bloque, a re-tester. |
| Anomalie liee | Reference bug si applicable. |
| Responsable | Personne chargee du test ou de la correction. |
| Date cible | Date attendue de finalisation. |
| Commentaires | Precision utile. |

## Exemples de lignes initiales

| ID | Lot | Module | Scenario | Priorite | Profil testeur | Resultat attendu | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OVA-001 | 0 | Acces | Se connecter avec chaque compte de test. | Critique | Tous | Chaque compte accede au bon perimetre. | Non demarre |
| OVA-002 | 1 | Profil | Modifier langue, theme et preferences de notification. | Haute | Utilisateur standard | Les preferences sont conservees apres reconnexion. | Non demarre |
| OVA-003 | 2 | Droits | Verifier qu'un lecteur ne peut pas modifier les donnees. | Critique | Lecture seule | Les actions d'ecriture sont bloquees. | Non demarre |
| OVA-004 | 4 | Conformite | Creer un referentiel avec piece justificative et lancer validation. | Critique | Validateur | Le workflow de validation est trace. | Non demarre |
| OVA-005 | 6 | Tiers | Importer une liste d'entreprises et contacts. | Haute | Gestionnaire tiers | Les donnees sont importees sans doublons critiques. | Non demarre |
| OVA-006 | 7 | Projets | Creer un projet avec taches, planning et documents. | Haute | Chef de projet | Le projet est consultable et exploitable. | Non demarre |

