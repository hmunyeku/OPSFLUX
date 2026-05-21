# Projets

## Résumé en 30 secondes

Le module **Projets** pilote un projet industriel de bout en bout :
fiche d'identification, WBS, tâches, jalons, planning, Planner,
changements, budget, documents, équipe et situations projet.

Le module n'est pas un simple tableau de tâches. Une donnée projet doit
rester exploitable par les autres briques OpsFlux :

- **Planner** pour convertir une tâche planifiable en activité de charge.
- **Imputations** pour rattacher coûts, budget et pertes à un référentiel
  analytique.
- **Tiers** pour relier entreprises, sous-traitants et contacts.
- **Documents** pour conserver les pièces jointes et preuves.
- **Workflows** pour tracer les validations quand elles sont requises.

Les accès sont filtrés par permissions RBAC et par périmètre entité.

---

## Concepts clés

| Terme | Description |
|---|---|
| **Projet** | Objet principal : nom, code, type, dates, responsable, statut, budget, entité et contexte opérationnel. |
| **WBS** | Structure de découpage du projet. Les tâches parentes consolident les dates, durées et avancements de leurs enfants. |
| **Tâche** | Ligne de travail planifiable. Elle doit porter des dates, une durée, un statut, un avancement et idéalement un responsable. |
| **Sous-tâche** | Tâche enfant utilisée pour détailler un lot WBS ou une activité complexe. |
| **Jalon** | Tâche de type jalon : une seule date, aucune durée. Il peut avoir des dépendances comme une tâche classique. |
| **POB fixe / variable** | Mode de préparation de la charge pour Planner. Le POB variable répartit la charge sur des jours relatifs J1, J2, etc. |
| **Changement** | Trace décisionnelle avec cause, impacts planning/budget, périmètre touché, validations, commentaires et pièces jointes. |
| **Révision planning** | Snapshot d'un état de planning pouvant être prévisualisé puis appliqué avec contrôle d'impact. |

---

## Cycle de vie recommandé

1. **Créer le projet** avec code, type, dates cibles, budget et
   responsable.
2. **Structurer la WBS** si le projet possède plusieurs lots ou phases.
3. **Créer les tâches et jalons** avec les dates, durées, statuts,
   responsables et dépendances.
4. **Envoyer les tâches utiles au Planner** pour suivre la charge réelle.
5. **Capturer la situation projet** avec résumé, détail, météo, tendance
   et avancement.
6. **Tracer les changements** avant de modifier budget ou planning quand
   la décision a un impact.
7. **Ajouter les pièces jointes** attendues : preuves, notes techniques,
   validation, changement de scope, livrables.
8. **Réviser le planning** uniquement après lecture de l'aperçu d'impact.
9. **Clôturer** lorsque tâches, documents, changements et validations sont
   cohérents.

---

## Tâches, jalons et hiérarchie WBS

Une tâche professionnelle ne doit pas rester une ligne vide. Pour être
exploitable, elle doit contenir :

- un titre clair ;
- une date de début et une date de fin, ou une date unique pour un jalon ;
- une durée ;
- un statut ;
- un avancement ;
- un responsable ou une équipe lorsque connu ;
- des dépendances si elle conditionne une autre activité.

Les tâches parentes sont des agrégats. Lorsqu'une tâche contient des
sous-tâches, ses dates, sa durée et son avancement doivent être lus comme
une consolidation des enfants. Cela évite les incohérences entre le
tableau, le Gantt et les indicateurs.

Un jalon n'est pas une note libre : c'est une tâche typée **jalon**. Il a
une date unique, peut être lié à un prédécesseur ou successeur, et sert à
matérialiser un point de décision ou de livraison.

---

## Planner

L'onglet Planner sert à relier les tâches projet à la planification
opérationnelle. Le principe est volontairement sélectif : toutes les
tâches projet ne doivent pas forcément devenir des activités Planner.

Avant l'envoi, contrôler :

- que la tâche a des dates utilisables ;
- que le mode POB est cohérent ;
- que la priorité est correcte ;
- que la charge concerne la bonne période ;
- que la tâche n'a pas déjà une activité liée.

Après envoi, l'activité liée permet de suivre la charge et de consolider
les écarts avec la feuille de temps.

---

## Situation projet

Une situation projet doit distinguer :

- **Situation résumée** : titre court de la capture.
- **Situation détaillée** : contexte complet, difficultés, décisions,
  risques et actions.

La météo, la tendance et le pourcentage ne suffisent pas seuls. Ils
doivent être accompagnés d'un texte qui explique pourquoi le projet est
stable, en amélioration ou en dégradation.

L'historique conserve les captures successives pour ne pas écraser les
traces précédentes.

---

## Changements projet

Le gestionnaire de changement sert à tracer une décision ou un input qui
modifie le projet. Il peut concerner :

- tout le projet ;
- une ou plusieurs tâches ;
- une ou plusieurs rubriques WBS ;
- le budget ;
- le planning ;
- le scope ;
- les livrables ou documents attendus.

Un impact n'est pas toujours positif en charge ou en coût : un changement
peut réduire le budget, raccourcir le planning ou supprimer une activité.
Les champs d'impact doivent donc être signés et interprétés dans les deux
sens.

Lorsqu'une validation est requise, elle doit être demandée avant
application du changement. Les pièces jointes associées restent dans le
gestionnaire de fichiers polymorphe.

---

## Budget, pertes et feuille de temps

Le suivi budgétaire doit répondre à trois questions :

- quel budget ou rubrique WBS est concerné ;
- quelle part est planifiée, engagée ou consommée ;
- quel écart provient d'un changement, d'une perte de temps ou d'une
  dérive d'exécution.

La feuille de temps suit les heures réalisées. La matrice d'affectation
décrit qui est prévu sur quoi et à quel niveau de charge. Les deux vues
sont complémentaires : l'une mesure le réalisé, l'autre explique la
capacité planifiée.

---

## Documents et pièces jointes

Les pièces jointes projet doivent être classées par type afin de faciliter
la validation et les audits. Les types typiques sont :

- cahier des charges ;
- note technique ;
- planning ;
- budget ;
- changement de scope ;
- preuve de validation ;
- livrable ;
- compte rendu ;
- plan ou fichier technique.

Selon la configuration projet, certains types peuvent être obligatoires.
Dans ce cas, l'onglet Documents doit permettre de voir ce qui est attendu,
ce qui est présent et ce qui reste manquant.

La prévisualisation doit être utilisée comme contrôle rapide, mais elle ne
remplace pas le fichier source. Pour un PDF ou une image, la lecture doit
être immédiate. Pour Office, Visio, DWF/Navisworks ou plans techniques,
OpsFlux doit conserver le fichier original et, lorsque nécessaire, une
version exportée lisible par le navigateur ou par un viewer spécialisé.

Règle pratique : si une pièce justifie une validation, un changement ou un
livrable client, elle doit être attachée au bon contexte métier et typée de
façon explicite. Éviter les fichiers non classés en vrac.

---

## Révisions et simulations planning

Une révision planning capture un état de référence. Avant application,
OpsFlux affiche l'impact : tâches ajoutées, modifiées, supprimées ou
restaurées. L'application d'une révision doit être faite avec prudence,
car elle restaure les snapshots capturés.

Une simulation sert à préparer un scénario. Elle ne doit pas être
confondue avec le planning officiel tant qu'elle n'est pas validée et
appliquée.

Bonnes pratiques :

- créer une révision avant une modification structurante ;
- documenter le changement qui motive la révision ;
- prévisualiser les impacts ;
- faire valider si le planning ou le budget contractuel change ;
- conserver les pièces justificatives.

---

## Contrôles avant livraison client

Avant de livrer un projet, vérifier :

- les tâches sans date ou sans durée ;
- les jalons sans date ;
- les tâches parentes incohérentes avec leurs enfants ;
- les activités Planner manquantes ou dupliquées ;
- les changements non validés ;
- les impacts budget/planning non affectés à un périmètre ;
- les documents obligatoires manquants ;
- les membres sans rôle clair ;
- les pertes de temps non justifiées ;
- les vues mobile qui introduisent un scroll horizontal inutile.
