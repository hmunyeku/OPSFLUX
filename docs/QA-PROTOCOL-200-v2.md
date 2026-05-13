# Protocole QA OpsFlux v2 — 200 étapes en conditions réelles

> Test exhaustif des modules **Tiers / Projets / Planner / PaxLog / PackLog / TravelWiz**.
> Chaque étape simule un **cas réel d'usage** avec données complètes (pas de placeholders).
> Chaque étape vérifie les **9 dimensions transverses** ci-dessous (sauf mention contraire).
>
> Format suivi : `✅ PASS` / `❌ FAIL: <description>` / `🔧 FIXED:<sha>` / `⏭️ SKIPPED:<raison>` dans `docs/QA-LOG.md`.

---

## Préconditions

- Compte admin : `admin@opsflux.io` / `RldgAHGJqlrq6TRjsZq3is`
- Frontend : https://app.opsflux.io
- Backend : https://api.opsflux.io
- Branche prod : `main` (auto-deploy via Dokploy)
- Browser MCP : `mcp__Claude_in_Chrome__*` (DOM-aware + console + network)

---

## 🔍 9 Dimensions transverses vérifiées à CHAQUE étape

| Code | Dimension | Critère |
|---|---|---|
| 🌐 **i18n** | Traductions FR/EN | Aucune clé brute (ex: `common.save`) visible. Switch FR↔EN cohérent. Tooltips traduits. Aria-labels traduits. |
| 📱 **resp** | Responsive | Pas de débordement à 360px (mobile), 768px (tablet), 1280px (desktop). Touch targets ≥ 44px sur mobile. |
| 🔐 **séc** | Sécurité | Pas de fuite XSS/SQL. Tokens jamais en URL. Permissions cohérentes. Headers sécurité présents. |
| 🔑 **perm** | Permissions | User non-admin → 403 propre ou écran dégradé. Pas d'IDOR. Audit trail créé. |
| 🧭 **ergo** | Ergonomie | < 3 clics pour action courante. Raccourcis clavier dispo. Feedback < 200ms après action. Empty states utiles. |
| 🖼️ **UI** | Cohérence graphique | Mêmes icônes, espacements, polices, couleurs entre pages. Boutons primary/secondary cohérents. |
| 📊 **data** | Data integrity | Save persiste après F5. Pas de race condition. Soft-delete respecté. ISO trail si applicable. |
| 🏃 **perf** | Performance | TTI < 2s. Pas de N+1. Pagination si > 50 items. Cache invalidé après mutation. |
| 💬 **cnsl** | Console / Network | Aucune erreur JS. Aucun 4xx/5xx inattendu. Pas de warning React (key, controlled, deprecated). |

---

## 🏷️ Tags problèmes (à utiliser dans QA-LOG)

- `[i18n-miss]` : clé manquante / texte non-traduit
- `[hardcode]` : texte FR/EN codé en dur sans `t()`
- `[ui-overflow]` : débordement visuel
- `[ui-stack]` : alignement / espacement cassé
- `[ui-inconsistent]` : style ≠ entre pages
- `[broken]` : fonctionnalité KO
- `[perm-leak]` : info exposée à user sans droits
- `[perm-block]` : 403 inattendu sur user qui devrait avoir le droit
- `[no-feedback]` : action sans toast / loading state
- `[xss-risk]` : entrée non escapée
- `[todo]` : commentaire `TODO` / `FIXME` / `HACK` dans code
- `[shortcut-miss]` : raccourci clavier attendu absent
- `[a11y]` : problème accessibilité (aria, tabindex, contrast)
- `[ergo-bad]` : trop de clics, parcours peu intuitif

---

# Phase 0 — Préconditions & smoke initial (10 étapes)

| # | Action | Vérif attendue | Notes |
|---|---|---|---|
| 0.1 | GET `/api/v1/auth/login/config` | 200 + champs `mfa_trust_device_enabled`, `mfa_trust_device_max_days` exposés | Public, pas d'auth |
| 0.2 | POST `/api/v1/auth/login` admin | 200 + `access_token` + `mfa_required:false` | Token JWT 400+ chars |
| 0.3 | GET `/api/v1/auth/me` avec token | 200 + email=admin@opsflux.io | Profil chargé |
| 0.4 | Navigate `https://app.opsflux.io/login` | Page login charge. Logo visible. Champs email/password présents. Pas d'erreur console. | 🌐 + 💬 |
| 0.5 | Login UI avec credentials admin | Redir `/dashboard` ou `/home`. Topbar visible. Sidebar visible. | 🧭 |
| 0.6 | Vérifier sidebar : tous modules visibles selon perms admin | Tiers, Projets, Planner, PaxLog, PackLog, TravelWiz, Conformité, Papyrus, Assets, Support, Settings | 🔑 |
| 0.7 | Switch lang FR → EN (settings ou topbar) | Toutes les sections de la page courante passent en EN | 🌐 |
| 0.8 | Tester resize window 360px → 768px → 1920px | Pas de scroll horizontal. Sidebar collapse sur mobile. | 📱 |
| 0.9 | Inspecter console : aucune erreur au chargement initial | 0 error, 0 warning React non-attendu | 💬 |
| 0.10 | Inspecter network : aucune 4xx au chargement initial | Toutes XHR 200/304 | 💬 |

---

# Phase 1 — Auth, permissions, MFA, délégations (15 étapes)

| # | Action | Vérif attendue | Tags |
|---|---|---|---|
| 1.1 | Login KO (mauvais MDP) | 401 + message FR/EN clair ("Email ou mot de passe incorrect."). Pas de stack trace. | 🔐 |
| 1.2 | Login KO (compte inexistant) | Message IDENTIQUE à 1.1 (anti-énumération) | 🔐 |
| 1.3 | Tentatives répétées (5 max) | Lockout après 5 essais. Message "Compte verrouillé" + countdown. | 🔐 |
| 1.4 | Refresh page authentifiée (F5) | Session persiste. Pas de redir login. | 🔑 |
| 1.5 | Logout via topbar | Token effacé. Redir login. Tentative `/dashboard` → redir login. | 🔐 |
| 1.6 | Activer MFA depuis Settings > Sécurité | QR code affiché. Secret stockable. Codes backup générés et affichés UNE fois. | 🔐 |
| 1.7 | Login avec MFA → cocher "Se souvenir 30 jours" | Cookie `opsflux_mfa_trust` posé. HTTPOnly + Secure + SameSite=Lax. | 🔐 |
| 1.8 | Relogin sans saisir OTP (cookie présent) | Skip MFA challenge. Connecté directement. Audit log `mfa_skipped_trust_device` créé. | 🔐 + 📊 |
| 1.9 | Settings > Sécurité > Appareils de confiance | Liste affiche le device courant avec badge "En cours". Browser + OS + IP visibles. | 🖼️ |
| 1.10 | Révoquer un device individuel | Disparaît de la liste. Au prochain login, MFA challenge obligatoire. | 📊 |
| 1.11 | Créer délégation à un autre user (scope=all, 7 jours) | 201. PDF certificat ISO généré dans Attachments (catégorie `iso_traceability`). Email reçu (vérif logs si SMTP off). | 📊 |
| 1.12 | Vérifier contenu PDF certificat | Header "ISO TRAÇABILITÉ". Délégant + délégataire + période + permissions + QR code. | 🖼️ |
| 1.13 | Révoquer délégation (DELETE) | 204. Délégation soft-deleted (active=false). NOUVEAU PDF "REVOKED" généré. Ancien PDF "ACTIVE" toujours accessible. | 📊 |
| 1.14 | Admin > Sécurité & Auth > activer "Exiger MFA pour tous" | Toast confirmation. Setting `mfa_required_for_all=true` en BDD. | 📊 |
| 1.15 | Login avec user n'ayant pas MFA + setting actif | Overlay bloquant "Configurez votre MFA". Pas d'accès à l'app tant que MFA pas setup. | 🔐 |

---

# Phase 2 — Tiers (35 étapes)

## 2A. CRUD basique (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 2.1 | Naviguer `/tiers` | Liste affichée. Compteur total. Recherche présente. Filtres présents. Sortable. | 🧭 + 🖼️ |
| 2.2 | Créer nouveau tier "PERENCO CAMEROUN" (type=customer) | Code auto-généré (préfixe TIR-). Tier apparaît dans liste. Toast "créé". | 📊 |
| 2.3 | Compléter TOUS les champs : nom, code, alias, trade_name, type, registration_number, tax_id, vat_number, capital, currency, industry, founded_date, phone, fax, email, website | Tous champs sauvegardés. F5 → tous présents. | 📊 |
| 2.4 | Ajouter logo (upload fichier) | Aperçu visible. Stocké en static. Persistant après F5. | 📱 |
| 2.5 | Éditer en inline (double-clic sur cellule) | Champ devient éditable. Save sur blur. Toast confirmation. | 🧭 |
| 2.6 | Archiver tier | Disparaît de la liste par défaut. Visible si filtre "Archivés". | 📊 |
| 2.7 | Réactiver tier archivé | Réapparaît. | 📊 |
| 2.8 | Tester suppression réelle (admin) | Soft-delete uniquement. `deleted_at` set en BDD. Pas dans liste. | 🔐 |
| 2.9 | Lister 100+ tiers : pagination | 20/page par défaut. Navigation pages. Search filter live. | 🏃 |
| 2.10 | Export CSV / XLSX | Fichier téléchargé. Tous les champs colonnes. Encodage UTF-8 propre. | 📊 |

## 2B. Adresses polymorphiques (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 2.11 | Sur fiche tier > Adresses > Ajouter | Form complet : ligne 1, ligne 2, ville, code postal, pays, type (siège/livraison/facturation) | 🖼️ |
| 2.12 | Ajouter 3 adresses différentes (siège, livraison, facturation) | Liste affiche les 3 avec badge type. | 🖼️ |
| 2.13 | Définir adresse "Siège" comme primaire | Badge "primaire" visible. Autres non-primaires. | 📊 |
| 2.14 | Modifier adresse existante | Update inline OU panel d'édition. Save persistant. | 🧭 |
| 2.15 | Supprimer adresse | Confirmation demandée. Supprimée de la liste. | 📊 |

## 2C. Téléphones + emails (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 2.16 | Ajouter téléphone (+33 1 23 45 67 89) avec type=mobile, verified=false | Liste à jour. Format validé. | 📊 |
| 2.17 | Ajouter 3 téléphones (mobile, fixe, fax) | Multi-instance OK. Badge type. | 🖼️ |
| 2.18 | Définir téléphone primaire | Badge "primaire" visible. | 📊 |
| 2.19 | Ajouter email contact@perenco.cm avec type=billing | Validation format email. | 🔐 |
| 2.20 | Vérifier un email (send verification → click link) | Statut passe à "vérifié". Cocher badge. | 🔐 |

## 2D. Identifiants légaux (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 2.21 | Ajouter RCCM (Cameroun) | Format validé selon pays. Pattern RCCM/CM XXXX. | 📊 |
| 2.22 | Ajouter SIRET (France) | Validation 14 chiffres + clé Luhn. | 🔐 |
| 2.23 | Ajouter TVA intracom (FR) | Format FR XX XXXXXXXXX. | 🔐 |
| 2.24 | Ajouter NIU (Cameroun) | Pattern NIU CM. | 🔐 |
| 2.25 | Erreur format → message d'erreur clair | Toast/inline avec exemple format attendu. | 🌐 |

## 2E. Contacts (TierContact) (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 2.26 | Sur fiche tier > Contacts > Créer contact "Jean MBARGA" | Champs nom, prénom, fonction, email, téléphone. | 🖼️ |
| 2.27 | Lier contact à un job_position | Sélecteur job position avec compliance auto-loadée. | 📊 |
| 2.28 | Transférer contact vers autre tier | Wizard transfert : tier source / destination / motif / nouveau job position. | 🧭 |
| 2.29 | Après transfert, vérifier compliance records | Anciennes certifs marquées `active=false`. Nouvelles requises selon nouveau job position. | 📊 |
| 2.30 | Historique de transferts contact | Timeline chronologique des entreprises traversées. | 📊 |

## 2F. Recherche, filtres, tri (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 2.31 | Search "PERENCO" → résultats live | Filtre full-text sur nom + alias + code. Debounce 300ms. | 🏃 |
| 2.32 | Filtre par type (customer/supplier/...) | Liste filtrée immédiatement. Compteur mis à jour. | 🧭 |
| 2.33 | Filtre multi-critères : pays + type | AND logique. | 📊 |
| 2.34 | Tri par nom ascendant / descendant | Click header alterne ASC/DESC. Icône visible. | 🧭 |
| 2.35 | Filtres persistent après F5 | localStorage ou URL params. | 📊 |

---

# Phase 3 — Projets (35 étapes)

## 3A. CRUD projet (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 3.1 | Naviguer `/projets` | Liste avec colonnes : nom, code, statut, météo, progression, dates, asset, chef projet. | 🖼️ |
| 3.2 | Créer projet "Maintenance vannes Bonny 2026" | Champs requis : nom, code (auto), priorité, asset_id, dates. | 📊 |
| 3.3 | Compléter TOUS les champs : nom, code, alias, description, priorité, météo, tendance, dates, asset, chef projet, membres, budget, progress_weight_method | 100% complétude post-save. | 📊 |
| 3.4 | Uploader pièces jointes (PDF cahier des charges) | Upload OK. Listé dans panel Documents. Download fonctionne. | 📱 |
| 3.5 | Ajouter notes markdown | Editor markdown avec preview. Save. | 🖼️ |
| 3.6 | Ajouter tags | Tag picker avec création à la volée. Persistant. | 🧭 |
| 3.7 | Changer statut (draft → active → done) | Workflow respecté. Toast confirmation. Audit log créé. | 📊 |
| 3.8 | Météo projet (ensoleillé/nuageux/pluie/orage) | Sélecteur visuel avec icônes. Couleur correspondante. | 🖼️ |
| 3.9 | Vue Kanban / Liste / Gantt | 3 vues disponibles. Switch sans reload. Préf persistée. | 🧭 |
| 3.10 | Filtrer par chef projet | Liste filtrée. Compteur mis à jour. | 📊 |

## 3B. Tâches (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 3.11 | Créer tâche "Inspection vannes étage 1" | Champs : titre, description, statut, priorité, assigné, dates, estim_hours, weight. | 🖼️ |
| 3.12 | Créer sous-tâche (parent_id) | Indentation visible. Hiérarchie respectée. | 🖼️ |
| 3.13 | Créer 3 niveaux de hiérarchie | Tree-view fonctionnel. Expand/collapse. | 🧭 |
| 3.14 | Créer un jalon (is_milestone=true) | Date unique. Icône jalon. Pas de sous-tâche autorisée. | 📊 |
| 3.15 | Marquer tâche done | Progress passe à 100%. Date completion auto. Cascade vers parent. | 📊 |
| 3.16 | Drag-and-drop pour réordonner | Order persistant. Save automatique. | 🧭 |
| 3.17 | Dépendances entre tâches (FS/SS/FF/SF) | Visible dans Gantt. Validation pas de cycle. | 📊 |
| 3.18 | Assigner plusieurs assignees | Multi-select. Tous notifiés (notif in-app). | 📊 |
| 3.19 | Time tracking (entrer heures réelles) | actual_hours updated. Variance vs estim_hours visible. | 📊 |
| 3.20 | Suppression tâche en cascade | Sous-tâches aussi supprimées (avec confirmation). | 📊 |

## 3C. Livrables et actions (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 3.21 | Ajouter livrable à tâche | Type, statut, fichier. Listé sous tâche. | 🖼️ |
| 3.22 | Marquer livrable approuvé | Workflow approbation. Audit log. | 📊 |
| 3.23 | Ajouter action correctrice | Description, assigné, date. | 🖼️ |
| 3.24 | Fermer action | Statut closed. Date close auto. | 📊 |
| 3.25 | Historique des actions sur tâche | Activity feed chronologique. | 📊 |

## 3D. Équipes projet (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 3.26 | Attacher équipe (UserGroup) au projet | Liste équipes dispo. Sélecteur. Role optionnel. | 🧭 |
| 3.27 | Voir membres équipe attachée | Click sur équipe → drawer avec membres. | 🖼️ |
| 3.28 | Détacher équipe | Confirmation. Persistance. | 📊 |
| 3.29 | Créer équipe inline depuis projet | Bouton "Nouvelle équipe". Form modal. | 🧭 |
| 3.30 | Permissions hérités via équipe | Membre équipe peut voir le projet automatiquement. | 🔑 |

## 3E. Vue Mini Gantt + comments (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 3.31 | Mini Gantt embedded dans fiche projet | Vue compacte avec barres + dependencies. | 🖼️ |
| 3.32 | Click sur barre Gantt → détail tâche | Navigation rapide vers fiche tâche. | 🧭 |
| 3.33 | Zoom Gantt (semaine/mois/trimestre) | Niveaux de zoom fonctionnels. Préf persistée. | 🧭 |
| 3.34 | Ajouter commentaire projet (markdown) | Editor inline. @mention users. | 🖼️ |
| 3.35 | Activity Feed projet | Toutes modifs trackées : title, status, assignment, progress. | 📊 |

---

# Phase 4 — Planner (30 étapes)

## 4A. CRUD activités (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 4.1 | Naviguer `/planner` | Vue calendrier / Gantt par défaut. Filtres asset, type, période. | 🖼️ |
| 4.2 | Créer activité "Workover SAJ-12 puits #34" (type=workover) | Champs : titre, type, asset, dates, pax_quota, priorité. | 📊 |
| 4.3 | Compléter TOUS champs : capacity_requirements, predecessor_id, planner_metadata | Sauvegarde OK. | 📊 |
| 4.4 | Vue Gantt | Barres affichées. Survol → tooltip. | 🖼️ |
| 4.5 | Drag pour déplacer activité dans le temps | Dates updated. Confirmation modal si conflit. | 🧭 |
| 4.6 | Resize pour changer durée | start_date / end_date updated. | 🧭 |
| 4.7 | Valider activité (soumis → validé) | Workflow respecté. Audit log. Email notif (selon config). | 📊 |
| 4.8 | Annuler activité (validée → cancelled) | Statut updated. Conflits libérés. | 📊 |
| 4.9 | Filtrer par type activité | Vue filtrée. Compteur mis à jour. | 🧭 |
| 4.10 | Filtrer par asset (multi-select) | Combinaison OR. | 🧭 |

## 4B. Conflits de capacité (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 4.11 | Créer 2 activités même asset, mêmes dates, pax_quota dépassant la capacité | Conflit détecté automatiquement. Badge rouge. | 📊 |
| 4.12 | Voir détail conflit | Liste activités en conflit + recommandations. | 🖼️ |
| 4.13 | Résoudre conflit (déplacer 1 activité) | Conflit disparaît. Audit log "conflict_resolved". | 📊 |
| 4.14 | Activité prioritaire force la résolution | Activité moins prioritaire suggérée pour déplacement. | 🧭 |
| 4.15 | Audit log conflits | Tous les conflits historisés. Filtre par période. | 📊 |

## 4C. Scénarios + révisions (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 4.16 | Créer scénario "Plan Q2 2026" | Snapshot des activités. Nom + description. | 📊 |
| 4.17 | Comparer scénario vs actuel | Diff visuel (ajouts/modifs/suppressions). | 🖼️ |
| 4.18 | Appliquer scénario (revert vers snapshot) | Confirmation. Audit log. Activités rétablies. | 📊 |
| 4.19 | Demander révision activité validée | Form motif. Notif au validateur initial. | 🧭 |
| 4.20 | Répondre à révision (accepter/refuser) | Statut updated. Email notif demandeur. | 📊 |

## 4D. Liens avec Projets (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 4.21 | Lier activité Planner à une tâche projet | Sélecteur tâches. Sync bidirectionnel. | 📊 |
| 4.22 | Modifier pob_quota dans Projets → suggère révision Planner | Notif arbitre Planner. | 📊 |
| 4.23 | Délier activité de projet | Suppression du lien. Projet inchangé. | 📊 |
| 4.24 | Activités liées affichées sur fiche projet | Section "Activités planner". | 🖼️ |
| 4.25 | Drill-down activité → projet → tâche | Navigation fluide cross-modules. | 🧭 |

## 4E. Capacité & heatmap (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 4.26 | Vue Heatmap charge PAX | Couleurs selon taux occupation. Tooltip avec détails. | 🖼️ |
| 4.27 | Filtrer heatmap par asset | Update immédiat. | 🧭 |
| 4.28 | Détail journalier (drill-down) | Liste activités du jour. Total POB. | 📊 |
| 4.29 | Capacité dynamique selon vector dispo | Calcul auto si TravelWiz module enabled. | 📊 |
| 4.30 | Export Gantt en PDF | Téléchargement OK. Format A3/A4 paysage. | 📊 |

---

# Phase 5 — PaxLog (35 étapes)

## 5A. Profils PAX (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 5.1 | Naviguer `/paxlog` | Vue par défaut : profils ou ADS. Recherche, filtres. | 🖼️ |
| 5.2 | Créer profil PAX "Jean MBARGA" (pax_source=contact) | Lien vers TierContact. | 📊 |
| 5.3 | Compléter TOUS champs : badge_number, nationality, birth_date, blood_type, emergency_contact | Sauvegarde OK. | 📊 |
| 5.4 | Uploader photo profil | Aperçu visible. Avatars liste mis à jour. | 📱 |
| 5.5 | Ajouter credentials (passport, visa, ID, driving license) | Multi-types. Validation format selon pays. | 🔐 |
| 5.6 | Vérifier expiration credential | Badge warning si < 30j. Critique si expiré. | 🖼️ |
| 5.7 | Renouveler credential (créer nouveau, archiver ancien) | Historique conservé. | 📊 |
| 5.8 | Lier profil PAX → compliance records | Matrix auto-générée. | 📊 |
| 5.9 | Filtrer profils par badge_number | Search live. | 🏃 |
| 5.10 | Export liste PAX | CSV/XLSX avec toutes les colonnes. | 📊 |

## 5B. ADS (Avis de séjour) workflow (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 5.11 | Créer ADS "Mission Bonny 5-12 mai" | Demandeur, période, site destination, transport, motif. | 📊 |
| 5.12 | Ajouter PAX à l'ADS (sélecteur multiple) | Liste défilante. Multi-select. Filtre par tier. | 🧭 |
| 5.13 | Tier non-allowed → blocage | Message clair. Bouton "Demander dérogation". | 🔐 |
| 5.14 | Compliance check par PAX | Indicateur vert/rouge par certif requise. | 📊 |
| 5.15 | Soumettre ADS | Statut → submitted. Email validateur (CDS). | 📊 |
| 5.16 | Valider ADS (côté CDS) | Statut → approved. Email demandeur. PDF ticket généré. | 📊 |
| 5.17 | Refuser ADS avec motif | Statut → rejected. Email demandeur avec motif. | 📊 |
| 5.18 | Annuler ADS approuvée | Confirmation. Statut → cancelled. PAX libérés. | 📊 |
| 5.19 | Imprimer ticket ADS (PDF) | Format A5 paysage avec QR code embarquement. | 🖼️ |
| 5.20 | Scanner QR code ADS (mobile) | Boarding scan. Statut PAX → boarded. | 📱 |

## 5C. AVM (Avis de Mission) (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 5.21 | Créer AVM | Mission programme. Différent d'ADS. | 🖼️ |
| 5.22 | Lier AVM → ADS générées | Lien parent-child visible. | 📊 |
| 5.23 | Workflow validation AVM | submitted → approved → complete. | 📊 |
| 5.24 | PDF AVM ticket | Format propre, infos complètes. | 🖼️ |
| 5.25 | Notifications AVM aux stakeholders | Multi-canal selon préférences (in-app/email/SMS). | 📊 |

## 5D. Compliance & incidents (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 5.26 | Définir matrice compliance (rule × job_position) | Editor visuel. Validation pas de doublons. | 🖼️ |
| 5.27 | PAX non-compliant → blocage ADS | Bouton "Soumettre" désactivé + tooltip explicatif. | 🔐 |
| 5.28 | Créer incident PAX (accident, blessure) | Form complet : type, gravité, site, date, témoins. | 📊 |
| 5.29 | Workflow résolution incident | open → investigating → resolved. Documents joints. | 📊 |
| 5.30 | Stats compliance KPIs (dashboard) | Taux conformité par tier, par site. | 📊 |

## 5E. Import en masse + dérogations (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 5.31 | Import CSV de 50 PAX | Wizard : upload → mapping → preview → import. | 📊 |
| 5.32 | Erreurs ligne par ligne | Rapport détaillé avec ligne / erreur. | 🖼️ |
| 5.33 | Sync depuis Azure AD / Keycloak | Provider sélectionnable. Preview avant import. | 📊 |
| 5.34 | Demander dérogation compliance | Form motif + dates. Approbateur désigné. | 🧭 |
| 5.35 | Approuver/refuser dérogation | Audit log. Validity period set. Émail demandeur. | 📊 |

---

# Phase 6 — PackLog (20 étapes)

## 6A. Cargo requests (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 6.1 | Naviguer `/packlog` | Liste cargo requests + items. | 🖼️ |
| 6.2 | Créer cargo request "Équipements forage Bonny" | TOUS champs : title, description, sender_tier, receiver_name, destination_asset, imputation, requester, urgency. | 📊 |
| 6.3 | Readiness checklist auto-calculée | 100% si tous champs requis. Sinon bouton soumettre disabled. | 🖼️ |
| 6.4 | Ajouter colis (cargo item) | Type, dimensions, poids, designation. | 📊 |
| 6.5 | Ajouter 5 colis variés | Total calculé : poids, nombre packages, surface. | 📊 |
| 6.6 | Marquer colis dangerous goods (DG) | Champ class IMO. Documentation obligatoire (SDS). | 🔐 |
| 6.7 | Soumettre request | Validation. Statut → submitted. | 📊 |
| 6.8 | Loading options (voyages dispos) | Liste auto-générée. Matching destination + capacité. | 📊 |
| 6.9 | Appliquer loading option | Cargo affecté à manifest voyage. Statut → loaded. | 📊 |
| 6.10 | Scanner cargo (QR code) | Boarding scan. Statut updated. | 📱 |

## 6B. Dock & déchargement (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 6.11 | Vue manifest cargo voyage | Liste tous colis avec scan status. | 🖼️ |
| 6.12 | Scan déchargement (côté destinataire) | Statut → delivered. Photo preuve. | 📱 |
| 6.13 | Reconnaissance discrepancy (manquant/cassé) | Report incident automatique. | 📊 |
| 6.14 | Vue parcours cargo (timeline scan) | Liste chronologique : origine → chargement → voyage → déchargement. | 🖼️ |
| 6.15 | Closure cargo request | Statut → completed. KPIs mis à jour. | 📊 |

## 6C. Catalogue + import (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 6.16 | Article catalog (référencer types colis fréquents) | CRUD. Auto-fill cargo item. | 📊 |
| 6.17 | Import CSV de 100 cargo items | Wizard. Preview. Erreurs détaillées. | 📊 |
| 6.18 | Print label cargo (avec QR) | PDF étiquette format thermique. | 🖼️ |
| 6.19 | Vue analytics : volumes par sender_tier | Charts + tableau. Filtre période. | 📊 |
| 6.20 | Export historique cargo | CSV/XLSX. Tous champs. | 📊 |

---

# Phase 7 — TravelWiz (25 étapes)

## 7A. Voyages CRUD (10)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 7.1 | Naviguer `/travelwiz` | Liste voyages. Calendrier. Carte temps réel. | 🖼️ |
| 7.2 | Créer voyage "Crew change Bonny → Douala" | Vector, base départ, destination, date/heure. | 📊 |
| 7.3 | Compléter TOUS champs : passengers expected, cargo, captain, weather check | Sauvegarde OK. | 📊 |
| 7.4 | Voyage type=helicopter | Sélecteur vector filtré sur hélicos. | 🧭 |
| 7.5 | Voyage type=boat | Sélecteur bateaux + zones deck. | 🧭 |
| 7.6 | Voyage avec multi-stops (3 destinations) | Wizard ajout stops. Ordre drag-drop. | 🧭 |
| 7.7 | Workflow voyage : scheduled → in_progress → completed | Statuts respectés. Audit log. | 📊 |
| 7.8 | Annuler voyage | Confirmation. Cargo + PAX libérés. | 📊 |
| 7.9 | Voyage rotation (multi-jours) | Stays multi-sites. | 📊 |
| 7.10 | Map flotte temps réel | Vecteurs positionnés. Click → détail. | 🖼️ |

## 7B. Vectors (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 7.11 | Créer vector "BELL-407 5T-XYZ" | Type, capacité, base homing. | 📊 |
| 7.12 | Définir deck plan vector | Editor visuel zones + sièges. | 🖼️ |
| 7.13 | Certifications vector | Multi-certifs : DGAC, ICAO, etc. Expirations. | 📊 |
| 7.14 | Maintenance vector (planifier) | Indispo période. Conflits voyage. | 📊 |
| 7.15 | Vector hors service | Voyages déplacés ou cancelled. | 📊 |

## 7C. Manifests (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 7.16 | Créer manifest voyage | Auto-fill PAX + cargo. | 📊 |
| 7.17 | Ajouter passenger manuel (manifest_passenger) | Search profile. Affecter siège. | 🧭 |
| 7.18 | Valider manifest (côté pilote/capitaine) | Statut → validated. Verrouillé. | 📊 |
| 7.19 | Imprimer manifest PDF | Format A4 portrait. Tous champs. | 🖼️ |
| 7.20 | Manifest export tracking | KPIs : taux remplissage, surclassement. | 📊 |

## 7D. Pickup rounds + captain logs (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 7.21 | Créer pickup round (ramassage hôtels → base) | Liste arrêts. Ordre optimisable. | 🧭 |
| 7.22 | Assigner PAX à arrêts | Multi-arrêts par PAX. Notification SMS. | 📊 |
| 7.23 | Captain log voyage | Form : heures décollage/atterrissage, météo, incidents. | 📊 |
| 7.24 | Trip KPIs (mensuel/trimestriel) | Charts : nb voyages, taux remplissage, retards. | 🖼️ |
| 7.25 | Weather data overlay voyage | Affichage conditions au moment du voyage. | 📊 |

---

# Phase 8 — Cross-modules + Polish (15 étapes)

## 8A. Liens croisés (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 8.1 | Sur fiche projet → bouton "Créer activité Planner" | Pré-fill avec asset + dates projet. | 🧭 |
| 8.2 | Sur fiche tier → bouton "Créer ADS" | Pré-fill sender_tier. | 🧭 |
| 8.3 | Sur fiche ADS → voir activité Planner liée | Lien cross-module visible. | 🖼️ |
| 8.4 | Click sur user dans audit log → fiche user | Navigation directe. | 🧭 |
| 8.5 | Search global (Ctrl+K) trouve à travers modules | Résultats groupés par type. | 🧭 |

## 8B. Raccourcis clavier (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 8.6 | `Ctrl+K` ouvre command palette | Modal recherche universel. | 🧭 |
| 8.7 | `Ctrl+/` ouvre liste raccourcis | Liste exhaustive. | 🧭 |
| 8.8 | `Esc` ferme modal courante | Toujours fonctionnel. | 🧭 |
| 8.9 | `Ctrl+S` save formulaire | Évite click bouton. Toast confirmation. | 🧭 |
| 8.10 | `Tab` navigue dans formulaires | Ordre logique. Pas de saut visuel. | 🧭 |

## 8C. Notifications + audit (5)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 8.11 | Cloche notifications (topbar) | Compteur badge. Click → liste. Lire/marquer comme lu. | 🖼️ |
| 8.12 | Filtrer notifs par module | OK. | 🧭 |
| 8.13 | Page `/notifications` (journal) | Pagination. Recherche. Filtre période. | 📊 |
| 8.14 | Page Activité (Settings > Activité) | Liste mes activités persos. | 🖼️ |
| 8.15 | Audit log admin (Settings > Audit) | Filtres : user, resource_type, période. Export. | 📊 |

---

# Phase 9 — Cohérence UI globale (15 étapes)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 9.1 | Comparer boutons primary sur 10 pages | Couleur, taille, padding identiques. | 🖼️ |
| 9.2 | Comparer DataTables sur 5 pages | Mêmes filtres, tri, pagination, export. | 🖼️ |
| 9.3 | Comparer dynamic panels (right drawer) | Header, footer, scroll comportement identique. | 🖼️ |
| 9.4 | Empty states (liste vide) | Icône + message + CTA cohérents. | 🖼️ |
| 9.5 | Loading states (skeleton vs spinner) | Choisi de façon cohérente selon contexte. | 🖼️ |
| 9.6 | Toast notifications (success/error/warning) | Position, durée, couleur cohérentes. | 🖼️ |
| 9.7 | Modals confirmation suppression | Texte cohérent. Bouton "Supprimer" rouge. | 🖼️ |
| 9.8 | Date pickers | Même composant partout. Localisé. | 🖼️ |
| 9.9 | Avatar users | Même style. Couleur déterministe par nom. | 🖼️ |
| 9.10 | Tags / chips / badges | Variants visuels cohérents. | 🖼️ |
| 9.11 | Forms champs requis | Astérisque rouge. Message erreur sous le champ. | 🖼️ |
| 9.12 | Tooltips | Délai apparition uniforme. Position smart. | 🖼️ |
| 9.13 | Sidebar collapse animation | Smooth. État persisté. Sur toutes les pages. | 🧭 |
| 9.14 | Mode sombre (dark mode) | Tous écrans rendus correctement. Pas de contraste cassé. | 🖼️ |
| 9.15 | Logo Perenco / OpsFlux partout cohérent | Position topbar. Login page. Email templates. PDF. | 🖼️ |

---

# Phase 10 — i18n & RGPD & sécurité (10 étapes)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 10.1 | Switch FR → EN sur 10 pages aléatoires | Aucun texte FR resté. Aucune clé brute. | 🌐 |
| 10.2 | Switch EN → FR retour | Idem inverse. | 🌐 |
| 10.3 | Settings > RGPD : voir DPO info | Champs configurables. Validation email. | 📊 |
| 10.4 | Export RGPD de mon compte | Fichier ZIP avec mes données. Format JSON. | 📊 |
| 10.5 | Demande suppression RGPD | Workflow validation admin. Anonymisation effective. | 🔐 |
| 10.6 | Bannière cookies (login non-auth) | Affichée. Refus respecté. | 🔐 |
| 10.7 | Login events (Settings > Sécurité) | Mon historique connexions. Filtre IP, période. | 📊 |
| 10.8 | Suspicious login → notif | Email + in-app. Lien "C'était bien moi" / "Bloquer". | 🔐 |
| 10.9 | Rules sécurité (geo_block, ip_whitelist) | CRUD. Application immédiate. | 🔐 |
| 10.10 | Login depuis IP geo-blockée | 403 ou redirect approprié. | 🔐 |

---

# Phase 11 — Performance & resilience (10 étapes)

| # | Action | Vérif | Tags |
|---|---|---|---|
| 11.1 | Liste 1000+ tiers : pagination + tri | < 500ms par changement page. | 🏃 |
| 11.2 | Liste 500+ projets : filtres combinés | Réponse < 1s. | 🏃 |
| 11.3 | Gantt 200+ tâches | Render < 2s. Scroll fluide. | 🏃 |
| 11.4 | Map flotte 50+ vectors | Pas de freeze. Tile loading optimisé. | 🏃 |
| 11.5 | Console.log audit (page complète) | 0 error, 0 warning React strict | 💬 |
| 11.6 | Network audit (page complète) | Pas de N+1. Toutes 200/304. | 🏃 |
| 11.7 | Offline mode (couper réseau) | PWA service worker prend le relais. Mode dégradé propre. | 🏃 |
| 11.8 | Reconnexion réseau | Sync auto reprise. Pas de perte donnée locale. | 📊 |
| 11.9 | Mobile (touch + slow 3G simulation) | Pages utilisables. Skeleton loaders. | 📱 |
| 11.10 | Memory usage (Devtools) | Pas de leak après 30min navigation. < 200MB. | 🏃 |

---

## 📊 Distribution finale

| Phase | Étapes | Cumul |
|---|---|---|
| Phase 0 — Préconditions | 10 | 10 |
| Phase 1 — Auth/MFA/Délégations | 15 | 25 |
| Phase 2 — Tiers | 35 | 60 |
| Phase 3 — Projets | 35 | 95 |
| Phase 4 — Planner | 30 | 125 |
| Phase 5 — PaxLog | 35 | 160 |
| Phase 6 — PackLog | 20 | 180 |
| Phase 7 — TravelWiz | 25 | 205 |
| Phase 8 — Cross-modules | 15 | 220 |
| Phase 9 — Cohérence UI | 15 | 235 |
| Phase 10 — i18n/RGPD/Séc | 10 | 245 |
| Phase 11 — Perf | 10 | **255** |

*255 étapes au total (sur-dimensionné pour couvrir tous les cas). Les phases 8-11 sont des passes transverses.*

---

## 🎯 Format pour reporting QA-LOG.md

Pour chaque étape, ligne de status :

```
- 2.3 ✅ PASS — tous champs sauvegardés post-F5
- 2.4 ❌ FAIL [hardcode] — placeholder "Logo de l'entreprise" pas dans t()
- 2.5 🔧 FIXED:abc1234 — bouton "Modifier" → "Save" en EN désormais
- 2.6 ⏭️ SKIPPED — feature dépend de PR #42 pas encore mergée
```

À la fin de chaque session, append bilan dans QA-LOG.md format session N.

---

## 🧪 Outils côté Claude

- `mcp__Claude_in_Chrome__navigate` : aller à une URL
- `mcp__Claude_in_Chrome__read_page` : a11y tree de la page
- `mcp__Claude_in_Chrome__find` : trouver élément (langage naturel)
- `mcp__Claude_in_Chrome__computer` : click, type, screenshot, scroll
- `mcp__Claude_in_Chrome__form_input` : remplir champs (ref-id)
- `mcp__Claude_in_Chrome__read_console_messages` : audit JS errors
- `mcp__Claude_in_Chrome__read_network_requests` : audit XHR
- `mcp__Claude_in_Chrome__resize_window` : tester responsive
- `mcp__Claude_in_Chrome__get_page_text` : extraire texte pour i18n check
- `mcp__Claude_in_Chrome__javascript_tool` : eval JS (DOM check, localStorage, etc.)
- `curl` + token JWT : tests API backend en parallèle
