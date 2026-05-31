# Matrice comptes, roles et permissions

Ce document sert a preparer les comptes de test et a verifier que chaque role dispose uniquement des droits necessaires.

## Comptes de test proposes

| Compte | Role cible | Usage attendu |
| --- | --- | --- |
| admin.ova | Administrateur | Configuration, utilisateurs, roles, services connectes. |
| manager.ova | Manager operationnel | Supervision, validation metier, consultation transverse. |
| conformite.ova | Responsable conformite | Referentiels, audits, preuves, validations conformite. |
| support.ova | Agent support | Creation, affectation et traitement des tickets. |
| assets.ova | Gestionnaire assets | Gestion de l'inventaire et des documents assets. |
| projet.ova | Chef de projet | Projets, taches, planning, budget, changements. |
| lecteur.ova | Lecture seule | Consultation sans modification. |
| externe.ova | Utilisateur externe | Acces limite aux objets autorises. |

## Permissions a verifier

| Domaine | Lecture | Creation | Modification | Suppression | Validation | Export |
| --- | --- | --- | --- | --- | --- | --- |
| Profils utilisateurs | Tous | Admin | Utilisateur/Admin selon perimetre | Admin | N/A | Admin |
| Comptes et roles | Admin | Admin | Admin | Admin | N/A | Admin |
| Assets | Selon role | Gestionnaire assets | Gestionnaire assets | Admin/Gestionnaire autorise | N/A | Selon role |
| Conformite | Selon role | Responsable conformite | Responsable conformite | Admin | Validateur autorise | Selon role |
| Support | Selon role | Tous autorises | Agent support | Admin | N/A | Agent/Admin |
| Tiers | Selon role | Gestionnaire tiers | Gestionnaire tiers | Admin | Responsable conformite | Selon role |
| Projets | Selon role | Chef de projet | Chef de projet | Admin | Validateur autorise | Selon role |

## Points de controle

- Un utilisateur lecture seule ne doit jamais pouvoir modifier ou supprimer.
- Les validations doivent etre reservees aux profils explicitement autorises.
- Les donnees multi-entites doivent rester cloisonnees.
- Les utilisateurs externes ne doivent voir que leur perimetre.
- Les actions sensibles doivent etre tracees.

