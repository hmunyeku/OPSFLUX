# PaxLog

!!! warning "Page en cours de rédaction"

    La doc utilisateur complète de PaxLog arrive dans la prochaine
    itération. Cette page sera le **modèle** que les 13 autres modules
    suivront ensuite.

    En attendant, la spec architecturale est complète :

    [:octicons-arrow-right-24: Spec PaxLog](../rebuilt/modules/PAXLOG.md)

    Et les workflows métier détaillés :

    - [Workflow ADS](../rebuilt/20_WORKFLOW_ADS.md)
    - [Workflow AVM](../rebuilt/21_WORKFLOW_AVM.md)
    - [State machine PaxLog/AVM/ADS/TravelWiz](../check/18_PAXLOG_AVM_ADS_TRAVELWIZ_STATE_MACHINE.md)
    - [ADS contact workflow expliqué](../check/16_ADS_CONTACT_WORKFLOW_EXPLAINED.md)
    - [AVM workflow expliqué](../check/17_AVM_WORKFLOW_EXPLAINED.md)

    Et les audits récents pour comprendre l'état réel :

    - [Audit fonctionnel 2026-04-29](../AUDIT_PAXLOG_PACKLOG_TRAVELWIZ_FONCTIONNEL_2026-04-29.md)
    - [Audit PaxLog/PackLog 2026-04](../AUDIT_PAXLOG_PACKLOG_2026-04.md)
    - [Recette fonctionnelle](../rebuilt/33_PAXLOG_FUNCTIONAL_RECIPE.md)
    - [Audit couverture](../rebuilt/34_PAXLOG_COVERAGE_AUDIT.md)

## Résumé en 30 secondes

PaxLog gère les **mouvements de personnel** vers et depuis les sites
opérationnels (offshore, sites pétroliers, chantiers isolés). Il
combine :

- **ADS** (Autorisation De Site) — workflow d'approbation pour qu'une
  personne puisse aller sur un site donné
- **AVM** (Avis de Mouvement) — déclaration logistique d'un transport
  passager (qui, quand, comment, validation manager)
- **Embarquement / Débarquement** — événements physiques au point de
  passage (héliport, quai, check-point), tracés et corrélés à l'AVM
- **Conformité** — vérification que la personne a les habilitations,
  formations, visites médicales et visas requis pour le site/poste

Le flux nominal : `Demande → ADS → AVM → Embarquement → Sur site →
Débarquement → Retour`. Chaque étape déclenche des notifications, des
checks de conformité, et alimente le module Conformité pour les
audits réglementaires.

---

*Doc complète à venir.*
