# Guide de prise en main testeur

Ce guide explique comment OVA peut executer les tests de maniere homogene.

## Avant de commencer

1. Verifier que le compte de test fonctionne.
2. Confirmer le role affecte au compte.
3. Noter l'environnement utilise.
4. Ouvrir le tableau de suivi des tests.
5. Executer les scenarios dans l'ordre de priorite.

## Pendant le test

- Utiliser uniquement les comptes fournis.
- Ne pas contourner une erreur: la documenter.
- Ajouter une capture d'ecran pour tout probleme visuel.
- Noter le role utilise lors du test.
- Verifier la documentation lorsque le parcours n'est pas clair.
- Signaler les textes non traduits ou ambigus.

## Comment qualifier un resultat

| Statut | Signification |
| --- | --- |
| OK | Le scenario fonctionne comme attendu. |
| KO | Le scenario echoue ou produit un resultat incorrect. |
| Bloque | Le test ne peut pas etre termine. |
| A re-tester | Une correction a ete faite et doit etre verifiee. |
| Hors perimetre | Le scenario ne concerne pas cette phase. |

## Elements a fournir pour une anomalie

- Module concerne.
- Compte et role utilises.
- Etapes exactes de reproduction.
- Resultat attendu.
- Resultat observe.
- Capture d'ecran ou video.
- Gravite estimee.
- Donnees utilisees.

