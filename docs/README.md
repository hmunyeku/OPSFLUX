# OpsFlux Documentation

Date: 2026-04-03

## Convention de statut documentaire

Depuis avril 2026, chaque dossier de cette documentation a une **sémantique de statut** explicite :

| Dossier | Statut implicite | Interprétation |
|---|---|---|
| `rebuilt/` | `target` sauf mention contraire | Architecture **cible** — décrit le produit projeté, pas nécessairement ce qui tourne |
| `rebuilt/modules/` | `partial` | Module en cours d'implémentation — détails comportementaux à vérifier dans le code |
| `check/` | `audit` | Rapports d'audit, tickets de backlog, analyses ponctuelles |
| `adr/` | `accepted` | Architecture Decision Records — décisions actées |
| racine + autres dossiers | `legacy` | Archive historique, **pas de source de vérité** |

**Règle de lecture** : si un doc ne porte pas d'en-tête `Status: implemented`, considérer son contenu comme **cible** et vérifier l'état réel dans le code (particulièrement pour les docs Core, PaxLog, workflow). Pour les features avec un statut d'implémentation documenté, consulter en priorité :

- [`check/15_DOC_CODE_ALIGNMENT_BACKLOG.md`](check/15_DOC_CODE_ALIGNMENT_BACKLOG.md) — backlog code/doc avec statuts `CLOSED`/`OPEN`
- [`rebuilt/39_TECH_DEBT_AUDIT_2026_04_10.md`](rebuilt/39_TECH_DEBT_AUDIT_2026_04_10.md) — audit de dette technique

## Référence officielle

La documentation de référence du projet est désormais:

- [rebuilt/README.md](rebuilt/README.md)

## Statut de l'ancienne documentation

Les fichiers historiques présents directement dans `docs/`, `docs/modules/` et `docs/check/` doivent désormais être considérés comme:

- `legacy`
- matière source historique
- éventuellement utiles pour retrouver une nuance métier ancienne

Ils ne doivent plus être considérés comme la source de vérité unique du projet.

## Règle d'utilisation

Pour toute évolution produit, sécurité, workflow, UX ou implémentation:

1. commencer par `rebuilt/`
2. utiliser l'ancienne documentation seulement comme archive ou source secondaire
3. ne pas réintroduire dans la nouvelle base des hypothèses non revérifiées

## Règle de maintenance

Toute nouvelle clarification doit être ajoutée dans:

- `rebuilt/`

et non plus uniquement dans l'ancienne arborescence.
