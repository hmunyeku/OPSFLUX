# Planning de test par lots

Ce planning est indicatif. Il sert a cadrer les priorites et a suivre l'avancement par lot.

| Lot | Module / domaine | Objectifs | Actions OVA | Sortie attendue |
| --- | --- | --- | --- | --- |
| 0 | Acces et environnement | Verifier les comptes, les acces et le contexte de test. | Connexion, changement de mot de passe, navigation, verification langue/theme. | Acces confirmes ou liste des blocages. |
| 1 | Profil et preferences | Valider les reglages personnels. | Modifier profil, preferences, notifications, langue, theme. | Parcours utilisateur de base valide. |
| 2 | Comptes et droits | Tester les roles et permissions. | Comparer actions disponibles selon profil: admin, manager, validateur, lecteur. | Matrice droits validee ou ecarts documentes. |
| 3 | Assets | Tester inventaire et consultation. | Creer, rechercher, filtrer, modifier, joindre documents, verifier fiches. | Donnees assets exploitables et anomalies relevees. |
| 4 | Conformite | Tester referentiels, audits et validations. | Creer referentiel, enregistrer preuve, lancer validation, tester expiration, audit tiers. | Cycle conformite valide ou bugs priorises. |
| 5 | Support | Tester gestion des demandes. | Creer ticket, affecter, commenter, cloturer, verifier notifications. | Flux support exploitable. |
| 6 | Tiers | Tester entreprises, contacts et documents. | Importer tiers, completer fiches, verifier conformite, documents, notes. | Referentiel tiers propre et utilisable. |
| 7 | Projets | Tester pilotage projet. | Creer projet, taches, planning, budget, changements, documents. | Parcours projet qualifie pour modules metiers. |

## Cadence recommandee sur 2 mois

La recette est cadree sur 8 semaines a compter de T0, T0 etant la date de mise a disposition des acces, comptes de test et donnees initiales.

| Semaine | Phase | Lots principaux | Contenu | Sortie attendue |
| --- | --- | --- | --- | --- |
| S1 | Preparation et acces | Lot 0 | Comptes, acces, environnement, presentation du tableau de suivi, collecte donnees prioritaires. | Tous les testeurs peuvent se connecter et savent remonter un test. |
| S2 | Socle utilisateur | Lots 1 et 2 | Profil, preferences, comptes, roles, permissions, controle multi-entite. | Socle utilisateurs et droits qualifie. |
| S3 | Assets et support | Lots 3 et 5 | Assets, documents, recherche, tickets support, commentaires, notifications. | Parcours assets et support utilisables. |
| S4 | Conformite - referentiels | Lot 4 | Referentiels, centres habilites, preuves, expirations, RiseUp, regles personne/entreprise. | Referentiels et regles conformite valides. |
| S5 | Conformite - audits | Lot 4 | Modeles d'audit, audits tiers, scoring, preuves, PDF, validation, notifications. | Cycle audit fournisseur qualifie. |
| S6 | Tiers | Lot 6 | Entreprises, contacts, imports, profil de poste, documents, conformite tiers, responsive. | Referentiel tiers exploitable. |
| S7 | Projets | Lot 7 | Projets, taches, planning, budget, changements, planner, documents, responsive. | Parcours projet pilote qualifie. |
| S8 | Consolidation et re-test | Tous | Re-test correctifs, arbitrages, dette restante, documentation, preparation decision go/no-go. | Rapport de recette et backlog priorise. |

## Regles de pilotage

- Chaque semaine doit produire une liste d'anomalies classees par gravite.
- Les anomalies bloquantes et majeures sont re-testees avant de passer au lot suivant.
- Les tests de permissions, multi-entite, traduction et responsive sont realises sur chaque lot, pas seulement a la fin.
- Les donnees manquantes sont tracees dans le catalogue des donnees.
- La decision de sortie se base sur le tableau Excel de suivi, pas sur une validation orale globale.
