# Audit Dette Technique — 10 avril 2026

## Portée

Audit ciblé de dette technique résiduelle dans:
- RGPD / exports / purge
- emails et jobs système
- Papyrus / legacy `report_editor`
- lifecycle module / compatibilité
- multi-entité et branding runtime

## Findings

### 1. Critique — contrôle d'accès RGPD basé sur les 8 premiers caractères de l'UUID

Références:
- [gdpr.py](/app/api/routes/core/gdpr.py#L300)
- [gdpr.py](/app/api/routes/core/gdpr.py#L353)
- [gdpr.py](/app/api/routes/core/gdpr.py#L377)
- [gdpr.py](/app/api/routes/core/gdpr.py#L402)

Constat:
- le nom de fichier des exports RGPD est construit avec `user_id_str[:8]`
- les vérifications de lecture/suppression reposent aussi sur ce préfixe de 8 caractères

Risque:
- collision théorique entre utilisateurs
- contrôle d'accès fragile basé sur une identité tronquée au lieu d'un identifiant complet ou d'un mapping persistant

Correction recommandée:
- stocker un manifest DB ou signer un identifiant d'export
- utiliser l'UUID complet ou un export_id opaque

### 2. Élevée — purge RGPD non scindée par entité

Références:
- [gdpr_purge.py](/app/tasks/jobs/gdpr_purge.py#L37)
- [GdprTab.tsx](/apps/main/src/pages/settings/tabs/GdprTab.tsx#L134)

Constat:
- le job charge `SELECT key, value FROM settings WHERE key LIKE 'gdpr.retention_%'`
- il n’y a pas de scoping explicite par `scope` / `scope_id`

Risque:
- en multi-entité, une valeur de rétention peut en écraser une autre
- comportement non déterministe si plusieurs entités configurent des politiques différentes

Correction recommandée:
- définir clairement si la politique RGPD est `tenant`, `entity` ou `global`
- charger les settings selon ce scope
- si entity-scoped, purger par entité et non globalement

### 3. Élevée — la file email utilise le `default_entity_id` au lieu de l'entité de la notification

Références:
- [email_queue.py](/app/tasks/jobs/email_queue.py#L61)
- [email_queue.py](/app/tasks/jobs/email_queue.py#L79)

Constat:
- le job récupère `default_entity_id` depuis `users`
- le rendu du template utilise `entity_id=user_row.default_entity_id`
- la notification contient pourtant déjà `entity_id`

Risque:
- branding / template / variables de mauvaise entité
- régression multi-entité sur les notifications email génériques

Correction recommandée:
- utiliser d'abord `notifications.entity_id`
- ne fallback sur `default_entity_id` qu'en dernier recours, explicitement

### 4. Moyenne — le digest notifications ne profite pas des templates entity-scoped

Référence:
- [notification_digest.py](/app/tasks/jobs/notification_digest.py#L87)

Constat:
- `render_and_send_email(..., entity_id=None, ...)`

Impact:
- le digest utilise seulement les defaults codés
- impossible d’avoir une personnalisation d’entité cohérente

Correction recommandée:
- résoudre l’entité de contexte du user
- ou définir explicitement que ce mail est tenant/global et le traiter comme tel

### 5. Moyenne — dette legacy Papyrus encore très présente dans le runtime

Références:
- [report_editor.py](/app/api/routes/modules/report_editor.py#L1)
- [App.tsx](/apps/main/src/App.tsx#L105)
- [dashboard.py](/app/api/routes/core/dashboard.py#L93)
- [PapyrusCorePage.tsx](/apps/main/src/pages/papyrus/PapyrusCorePage.tsx#L1578)
- [PapyrusCorePage.tsx](/apps/main/src/pages/papyrus/PapyrusCorePage.tsx#L2500)
- [DocumentEditorCore.tsx](/apps/main/src/components/papyrus/DocumentEditorCore.tsx#L97)
- [papyrus_versioning_service.py](/app/services/modules/papyrus_versioning_service.py#L313)

Constat:
- alias `report_editor` / `report-editor`
- wrappers runtime
- `legacy_payload` dans le contrat documentaire

Impact:
- dette de compatibilité durable
- coût cognitif élevé
- risque de doublons de comportement et de régressions de mapping

Correction recommandée:
- planifier une suppression progressive des wrappers
- éliminer `legacy_payload` dès que la migration de contenu est finie

### 6. Moyenne — TODO métier RGPD encore ouvert sur les notifications de violation

Référence:
- [gdpr.py](/app/api/routes/core/gdpr.py#L576)

Constat:
- le rapport de violation est journalisé mais la notification DPO / personnes affectées n’est pas implémentée

Impact:
- le module RGPD reste incomplet côté incident response

Correction recommandée:
- brancher un vrai flux centralisé mail + in-app
- cadrer la politique de notification selon sévérité et périmètre

### 7. Faible à moyenne — dette de robustesse par heuristiques/fallbacks silencieux

Références:
- [gdpr.py](/app/api/routes/core/gdpr.py#L191)
- [papyrus_dispatch_service.py](/app/services/modules/papyrus_dispatch_service.py#L534)
- [notifications.py](/app/core/notifications.py)

Constat:
- plusieurs flux gardent des comportements heuristiques:
  - résolution de pièces jointes RGPD “best effort”
  - fallbacks SMTP Docker
  - templating Papyrus avec fallback de rendu en cas d’erreur

Impact:
- utile opérationnellement
- mais augmente la difficulté de diagnostic et masque certains contrats implicites

Correction recommandée:
- mieux distinguer:
  - fallback d’infrastructure assumé
  - fallback fonctionnel à éliminer

## Résiduel non audité complètement

- endpoints core secondaires non parcourus un par un
- dette frontend hors runtime principal
- documentation historique `docs/check/*`
- migrations Alembic anciennes non relues intégralement

## Priorité recommandée

1. Sécuriser l'identité des exports RGPD
2. Corriger le scoping multi-entité du purge job RGPD
3. Corriger l'entité de rendu du `email_queue`
4. Réduire la dette legacy Papyrus runtime
5. Fermer le TODO notification DPO / breach reporting
