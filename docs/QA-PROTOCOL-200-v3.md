# Protocole QA OpsFlux **v3** — 200 étapes opérationnelles, conditions réelles

> Évolution de v2 (`QA-PROTOCOL-200-v2.md`, 255 étapes méta). v3 est **exécutable** :
> chaque étape porte URL/payload/attendu concrets, **tous les champs sont remplis** sans
> exception, et le moteur d'exécution est le **Chrome MCP** (`mcp__Claude_in_Chrome__*`)
> qui retourne du DOM-aware compact (~1-3 k tokens / page) au lieu de screenshots.
>
> Couverture : Tiers, Projets, Planner, PaxLog, PackLog, TravelWiz + 4 phases transverses.
>
> Statut par étape (à reporter dans `QA-LOG.md`) :
> `✅ PASS` · `❌ FAIL: <tag> <description>` · `🔧 FIXED:<sha>` · `⏭️ SKIP:<raison>`

---

## Préconditions

| Item | Valeur |
|---|---|
| Frontend | https://app.opsflux.io |
| Backend | https://api.opsflux.io |
| Admin | `admin@opsflux.io` / `RldgAHGJqlrq6TRjsZq3is` |
| Branche | `main` (auto-deploy Dokploy via webhook GitHub) |
| Compose ID Dokploy | `g4-VkoUKMCuO9i4Y3OgbG` |
| Browser | **Chrome MCP** (`mcp__Claude_in_Chrome__*`) — évite computer-use coûteux |
| Test user 2 | À créer en étape 1.4 (`qa.viewer@opsflux.io`, role `viewer`, permissions read-only) |
| Test user 3 | À créer en étape 1.5 (`qa.manager@opsflux.io`, role `manager` PaxLog uniquement) |
| Données graines | Une `Entity = "Cameroun"`, une `Entity = "Atlas Operations"`, 25 tiers existants |

## 9 dimensions vérifiées à CHAQUE étape (rappel v2)

`🌐 i18n` `📱 resp` `🔐 séc` `🔑 perm` `🧭 ergo` `🖼️ UI` `📊 data` `🏃 perf` `💬 cnsl`

## 14 tags bug (rappel v2 + nouveaux v3)

`[i18n-miss]` `[hardcode]` `[ui-overflow]` `[ui-stack]` `[ui-inconsistent]` `[broken]`
`[perm-leak]` `[perm-block]` `[no-feedback]` `[xss-risk]` `[todo]` `[shortcut-miss]`
`[a11y]` `[ergo-bad]`
+ v3 : `[dead-code]` `[unused-route]` `[orphan-i18n-key]` `[broken-ws]` `[404-route]` `[stale-doc]`

---

# Phase 0 — Recon code statique (étapes 1-10)

> Avant d'ouvrir le browser, on grep le repo pour les **dette technique évidente**.

| # | Action | Attendu (clean) | Bug si |
|---|---|---|---|
| 1 | `Grep` "TODO\|FIXME\|HACK\|XXX" dans `app/`, `apps/main/src/` | < 30 hits totaux | Liste à attaquer en `[todo]` |
| 2 | `Grep` `console\.(log\|warn\|error)` dans `apps/main/src/` (hors `vendor/`, hors `*.test.*`) | < 10 hits | `[dead-code]` à nettoyer |
| 3 | `Grep` `any\b` dans `apps/main/src/**/*.ts(x)` | < 50 hits | Typage faible |
| 4 | `Grep` `dangerouslySetInnerHTML` | 0 sauf rendu Markdown identifié | `[xss-risk]` |
| 5 | `Grep` `localStorage\.\|sessionStorage\.` pour mots-clés `token\|password\|secret` | 0 | `[xss-risk]` storage non-httpOnly |
| 6 | `Glob` `apps/main/src/**/*.tsx` puis grep clés i18n `t\("([^"]+)"` → comparer à `apps/main/src/locales/fr/*.json` | toutes clés présentes | `[i18n-miss]` |
| 7 | Lister routes définies (`createBrowserRouter`) vs routes pointées par sidebar (`sidebar-config.ts`) | 0 différence | `[404-route]` ou `[unused-route]` |
| 8 | `Grep` `pass\|password` dans `app/api/**/*.py` pour vérifier qu'aucun mot de passe n'est loggué | 0 hit suspect | `[xss-risk]` log fuite |
| 9 | Vérifier que tous les modèles SQLAlchemy ayant `archived` héritent bien de `SoftDeleteMixin` | 100% | `[broken]` soft-delete cassé |
| 10 | Lister migrations alembic `alembic history --verbose` → 0 branche orpheline, head unique | 1 head | `[broken]` chain cassée |

---

# Phase 1 — Auth, permissions, MFA, délégations (étapes 11-25)

| # | Action | Attendu | Tags bug à surveiller |
|---|---|---|---|
| 11 | `GET /api/v1/auth/login/config` (sans token) | 200 + `mfa_trust_device_enabled`, `mfa_trust_device_max_days` | `[perm-leak]` si secrets présents |
| 12 | `POST /api/v1/auth/login` payload `{email:"admin@opsflux.io", password:"...", remember_device:true, remember_days:30}` | 200, set-cookie `mfa_trust=...` HttpOnly Secure SameSite | `[xss-risk]` cookies sans flags |
| 13 | `GET /api/v1/auth/me` | 200, contient `permissions`, `roles`, `default_entity_id` | `[perm-leak]` champ password_hash exposé |
| 14 | Création user `qa.viewer@opsflux.io` via UI `/admin/users/new` (tous champs : email, first_name, last_name, civility=Mr, language=fr, timezone=Africa/Douala, role=viewer, default_entity=Cameroun, password gen) | 201 + email d'invite envoyé | `[i18n-miss]` `[no-feedback]` |
| 15 | Idem pour `qa.manager@opsflux.io` (role=`paxlog_manager`) | 201 | `[perm-block]` si rôle absent du picker |
| 16 | Login avec `qa.viewer` → vérifier sidebar : modules en lecture seule, boutons "Créer" cachés | UI dégradée correctement | `[perm-leak]` boutons visibles |
| 17 | Login `qa.viewer` → tenter `POST /api/v1/tiers` (devrait être 403) | 403 propre, pas 500, body `{detail: "..."}` traduit | `[perm-block]` ou trace stack exposée |
| 18 | Login `qa.viewer` → tenter `GET /api/v1/users/<id>/permissions` d'un autre user | 403 | `[perm-leak]` IDOR |
| 19 | Délégation : admin crée délégation à `qa.viewer` portée=`permissions=["paxlog:create"]`, dates `2026-05-15 → 2026-06-15`, message="Test QA v3" | 201 + email reçu + PDF ISO généré (attachment) | `[broken]` ISO PDF si manquant |
| 20 | Délégation reçue : `qa.viewer` se reconnecte → vérifie en bas profil "Délégations actives" → 1 entrée | UI affiche scope + dates + bouton "Voir certificat" | `[i18n-miss]` `[hardcode]` |
| 21 | `qa.viewer` peut désormais `POST /api/v1/tiers` (via délégation) ? Doit dépendre du scope (ici scope=paxlog donc non) | 403 (scope ≠ tiers) | `[perm-leak]` si autorisé à tort |
| 22 | Révocation délégation par admin → soft-delete (active=false) + 2e PDF "REVOKED" + email à délégataire | OK + attachment conservé pour ISO | `[broken]` si hard-delete |
| 23 | MFA : admin active MFA TOTP sur son compte (UI `/me/security`) → scan QR → confirme code 6 chiffres | 200 + 10 codes de récup affichés une seule fois | `[broken]` `[i18n-miss]` |
| 24 | Logout admin → relogin → demande code TOTP. Saisir code valide | 200 + cookie `mfa_trust` créé (vu remember_device=true) | `[broken]` |
| 25 | Logout + relogin dans les 30j → MFA SKIPPED (cookie trust valide) | login direct, pas de demande code | `[broken]` cookie trust ignoré |

---

# Phase 2 — Tiers (étapes 26-55, 30 étapes)

> Module Tiers = entreprises + contacts + identifiants légaux + adresses + tags + notes + imputations.
> Champs créés exhaustivement. Voir `app/models/common.py:684 Tier` pour la liste complète.

## Création Entité Tier (1 entité = 50+ champs à remplir)

**Étape 26 — Création Tier "complet" via UI `/tiers/new`**

Tous les champs (sans aucune exception) :
```
code             : QA-DEMO-001
name             : Société de Test QA SARL
alias            : QATestCorp
trade_name       : QATest Trading
logo_url         : https://placehold.co/200x80?text=QATest (ou upload local)
type             : client
website          : https://qatest.example.com
phone (legacy)   : +237 691 23 45 67
fax              : +237 233 50 11 22
email (legacy)   : contact@qatest.example.com
legal_form       : SARL
registration_n   : RC-DLA-2025-B-0042
tax_id           : NIU-M021900008765K
vat_number       : TVA-CM-998877
capital          : 50000000
currency         : XAF
fiscal_year_start: 1
industry         : Oil & Gas Services
founded_date     : 2018-03-15
payment_terms    : 30 jours fin de mois
incoterm         : DDP
incoterm_city    : Douala
description      : Entreprise test multi-lignes\n\nAvec un saut.
address_line1    : 1234 Boulevard de la Liberté
address_line2    : Immeuble Atlantique, 4ème étage
city             : Douala
state            : Littoral
zip_code         : 4105
country          : Cameroun
timezone         : Africa/Douala
language         : fr
active           : true
metadata_        : {"sap_code":"V-100542","kyc_status":"verified"}
social_networks  : {"linkedin":"https://linkedin.com/company/qatest","twitter":"@qatest"}
opening_hours    : {"mon":"08:00-17:00","tue":"08:00-17:00","wed":"08:00-17:00","thu":"08:00-17:00","fri":"08:00-13:00","sat":null,"sun":null}
notes            : Note libre interne (rich-text markdown)
is_blocked       : false
scope            : local
```

| # | Action | Attendu | Tags |
|---|---|---|---|
| 27 | Submit du formulaire | 201, redirect `/tiers/<id>`, toast "Entreprise créée" en FR | `[i18n-miss]` `[no-feedback]` `[hardcode]` |
| 28 | Recharger la page → tous les champs persistent | OK F5 | `[broken]` `[data]` |
| 29 | Switch FR ↔ EN (sélecteur header) → labels et messages traduits | 0 clé brute | `[i18n-miss]` |
| 30 | Vérifier polymorphic Address : ouvrir onglet "Adresses" → ajouter 2 adresses (siège + facturation) avec tous les champs | 2 adresses listées, primary toggle OK | `[broken]` `[hardcode]` (cf bug #38 fixé) |
| 31 | Onglet "Téléphones" → ajouter 3 phones (mobile, fixe, fax) avec libellé + pays + extension | 3 phones, primary unique | `[broken]` `[i18n-miss]` |
| 32 | Onglet "Emails" → ajouter 2 emails (commercial + facturation) | 2 emails, primary unique | `[broken]` |
| 33 | Onglet "Identifiants légaux" → ajouter SIRET, RCCM, NIU, TVA (4 entrées avec country + valid_from + valid_to + verified_by) | 4 IDs persistés | `[broken]` `[i18n-miss]` |
| 34 | Onglet "Tags" → ajouter 5 tags (`vip`, `kyc-ok`, `priorité-haute`, `2025`, `oil-services`) avec couleurs | 5 tags affichés sous nom | `[broken]` |
| 35 | Onglet "Notes" → créer 3 notes (publique + privée + tâche), avec markdown enrichi | 3 notes, filtrage par type OK | `[broken]` `[i18n-miss]` |
| 36 | Onglet "Imputations" → lier le Tier à un cost_center "OPS-2026" + un imputation_reference | OK | `[broken]` |
| 37 | Onglet "Compliance" → ajouter 3 records (assurance RC pro, attestation fiscale, attestation CNPS) avec `expiry_date`, `attachment_id`, `status=valid` | 3 records, badges expiry vert/orange/rouge | `[broken]` `[ui-stack]` |
| 38 | Onglet "Pièces jointes" → upload 3 fichiers (PDF + image + xlsx) ≤ 10 Mo | 3 attachments, vignettes | `[broken]` `[no-feedback]` |
| 39 | Onglet "External refs" → ajouter ref SAP `V-100542` + ref Salesforce `001AB000001ZxYzQAU` | 2 refs OK | `[broken]` |
| 40 | Création **Contact** dans ce Tier (`/tiers/<id>/contacts/new`) : tous champs (civility, first_name, last_name, position, department, job_position_id, is_primary, active, language, timezone, …) | 201 contact | `[broken]` `[i18n-miss]` |
| 41 | Sur le contact créé, ajouter 2 phones, 2 emails, 1 adresse (polymorphic owner_type=`tier_contact`) | OK | `[broken]` `[ui-inconsistent]` (vs Tier) |
| 42 | Promouvoir contact → PaxProfile (bouton `Promouvoir en PAX`) | Redirect /paxlog/profiles/<new_id>, lien réciproque | `[broken]` `[ergo-bad]` |
| 43 | Liste tiers `/tiers` : 26 entreprises (25 graines + nouveau), tri par nom desc | Tri OK, count OK | `[broken]` `[ui-stack]` |
| 44 | Recherche dans la barre `/tiers` : taper "QATest" → résultat unique | < 1s | `[perf]` `[broken]` |
| 45 | Filtres avancés : type=client + active=true + country=Cameroun → comptage filtré | OK | `[broken]` |
| 46 | Export CSV de la liste filtrée → fichier téléchargé avec entête + bonnes colonnes (16 cols min) | OK | `[broken]` `[hardcode]` headers |
| 47 | Export PDF rapport entité → 1 page, logo entité, tous champs principaux | OK ou 501 si pas implémenté | `[broken]` `[404-route]` |
| 48 | Bloquer le Tier (`is_blocked=true`) avec raison + date | UI grise tout le tier, badge "BLOQUÉ" rouge | `[broken]` `[i18n-miss]` |
| 49 | Tenter créer un Project lié à ce Tier bloqué | 422 ou warning bloquant | `[broken]` `[perm-leak]` si autorisé |
| 50 | Débloquer le Tier | OK, badge disparaît | `[broken]` |
| 51 | Soft-delete (archiver) le Tier | Disparait des listes par défaut, visible avec filtre `archivés=true`, `archived=true + deleted_at NOT NULL` en BDD | `[broken]` `[data]` |
| 52 | Restaurer le Tier archivé | OK | `[broken]` |
| 53 | Hard-delete (admin only) → 204 et BDD vide pour cet ID | OK + 0 row | `[broken]` `[perm-leak]` |
| 54 | Tenter SQL injection dans champ search : `' OR 1=1--` puis `<script>alert(1)</script>` | Aucune injection, pas d'XSS, pas d'erreur 500 | `[xss-risk]` |
| 55 | Vérifier console DevTools sur le parcours complet : 0 erreur JS, 0 warning React clé/controlled | clean | `[broken]` |

---

# Phase 3 — Projets (étapes 56-85, 30 étapes)

## Création Projet "complet" `/projets/new`

**Étape 56 — Champs Project (cf modèle `app/models/project.py`)** :
```
code             : PRJ-QA-V3-001
name             : Refonte stockage GPL Bonaberi
client_tier_id   : QA-DEMO-001 (créé phase 2)
project_manager  : qa.manager@opsflux.io
sponsor          : admin@opsflux.io
status           : in_progress
priority         : high
weather          : sunny
budget           : 12500000.00
currency         : XAF
start_date       : 2026-06-01
end_date         : 2026-12-15
actual_start     : 2026-06-03
actual_end       : null
progress_pct     : 12.5
description      : Description riche markdown\n\n## Phase 1\n- ...
location_field   : Field-Bonaberi
location_site    : Site-BBR-01
location_install : INST-GPL-A
tags             : ["gpl","stockage","bonaberi"]
custom_fields    : {"poste_budget":"CAPEX-2026-Q3","wbs":"100.42.7"}
```

| # | Action | Attendu | Tags |
|---|---|---|---|
| 57 | Submit form complet | 201, redirect `/projets/<id>`, toast "Projet créé" | `[broken]` `[i18n-miss]` |
| 58 | Onglet "Tâches" → créer 5 tâches : 1 milestone (`is_milestone=true`), 4 normales, avec dépendances FS | OK + diagramme Gantt mis à jour | `[broken]` (cf bug #37 fixé) |
| 59 | Tâches : assigner à `qa.manager`, due_date, estimated_hours, real_hours, status (todo/in_progress/done) | OK | `[broken]` `[ui-inconsistent]` |
| 60 | Vue Gantt → drag d'une tâche change ses dates | OK + sauvegarde immédiate | `[broken]` `[no-feedback]` |
| 61 | Vue Kanban → drag tâche entre colonnes change `status` | OK + audit trail | `[broken]` |
| 62 | Onglet "Risques" → ajouter 3 risques (impact, probabilité, owner, mitigation) | OK | `[broken]` `[404-route]` si module pas implémenté |
| 63 | Onglet "Documents" → upload PDF cahier des charges + 2 plans DWG | OK ≤ 25 Mo | `[broken]` |
| 64 | Onglet "Météo" → date picker + visualisation prévisions site lié | OK ou indique "non lié" | `[broken]` `[404-route]` |
| 65 | Onglet "Activités liées" → vérifier que les activités Planner liées (créées Phase 4) apparaissent | OK | `[broken]` ou vide attendu |
| 66 | Onglet "Imputations" → lier project à 2 cost_centers avec % de répartition (60/40) | OK + somme = 100% | `[broken]` `[broken]` validation |
| 67 | Onglet "MOC" → créer un MOC lié au project (tous champs MOC : type, motif, impact_safety, impact_env, impact_prod, signataires) | OK | `[broken]` `[404-route]` si MOC pas branché ici |
| 68 | Onglet "Activity feed" → créer un événement manuel "Réunion de cadrage", lister les events | OK ordre desc | `[broken]` |
| 69 | Calcul **CPM** (chemin critique) → `GET /api/v1/projects/<id>/cpm` | 200 avec liste tâches critiques + dates au plus tôt/tard | `[broken]` `[404-route]` |
| 70 | Liste `/projets?tab=projets` → pagination, tri Code, recherche, filtre statut+priorité+manager | OK | `[broken]` `[perf]` |
| 71 | Sync Gouti (4 entrées attendues) → bouton "Synchroniser" → toast et nouvelles tâches importées | OK ou explicite si pas configuré | `[broken]` `[no-feedback]` |
| 72 | Dashboard `/projets` (TdB) → 5 widgets : KPIs (5 cards), table Projets actifs, donut Météo, table Échéances 14j, top 5 projets | tous remplis (post fix widget) | `[broken]` widget 0 |
| 73 | Click sur une row de la table "Projets actifs" → navigation vers le projet | OK | `[broken]` `[ergo-bad]` |
| 74 | Modifier le projet : tous champs editables, optimistic UI | OK + rollback si erreur | `[broken]` |
| 75 | Permissions : `qa.viewer` peut voir mais pas modifier (boutons cachés) | OK | `[perm-leak]` |
| 76 | Permissions : `qa.manager` (PaxLog only) ne voit pas le module Projets dans sidebar | OK 403 sur direct URL | `[perm-leak]` |
| 77 | Tenter changer le code projet (souvent immutable) → 422 si bloqué | OK | `[broken]` si autorisé |
| 78 | Archiver projet → onglets/edit grisés, banner "ARCHIVÉ" | OK | `[broken]` `[i18n-miss]` |
| 79 | Restaurer projet | OK | `[broken]` |
| 80 | Hard-delete (admin) → 204, cascade vérifiée (tâches, MOC, attachments) | 0 row orpheline | `[broken]` `[data]` |
| 81 | Création projet via **template** (clone) → `POST /api/v1/projects/from-template/<tpl_id>` avec name + start_date | 201, structure dupliquée (tâches, jalons, risques modèles) | `[broken]` `[404-route]` |
| 82 | Liste `/admin/project-templates` → 1 template min, CRUD complet | OK | `[broken]` |
| 83 | Champ `progress_pct` : tester valeur > 100 ou < 0 | 422 validation côté API et frontend | `[broken]` `[xss-risk]` |
| 84 | Vue rapport PDF projet → 2 pages, logo entité, KPIs, liste tâches | OK ou 501 explicite | `[broken]` |
| 85 | DevTools console clean sur tout le parcours Projets | 0 erreur | `[broken]` |

---

# Phase 4 — Planner (étapes 86-110, 25 étapes)

## Création Activité Planner

**Étape 86 — Champs Activity (`app/models/planner.py:Activity`)** :
```
code             : ACT-QA-V3-001
title            : Maintenance pompe alimentation Slug Catcher
type             : maintenance  (ou : meeting / inspection / training / permanent_ops / mob_demob)
status           : planned       (planned / in_progress / done / cancelled / postponed)
priority         : high
start_at         : 2026-06-10T08:00:00Z
end_at           : 2026-06-10T16:00:00Z
all_day          : false
location_field   : Field-Bonaberi
location_site    : Site-BBR-01
location_install : INST-COMP-A
project_id       : PRJ-QA-V3-001 (créé phase 3)
moc_id           : null (ou créer)
owner_id         : qa.manager@opsflux.io
participants     : [admin, qa.viewer]
pax_count        : 5
shift            : day
recurrence_rule  : FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12
description      : Description rich-markdown
risk_level       : medium
permit_required  : true
permit_number    : PTW-2026-04-0042
tags             : ["maintenance", "pompe", "critique"]
custom_fields    : {"sap_wo":"WO-100542","ph_check":true}
```

| # | Action | Attendu | Tags |
|---|---|---|---|
| 87 | Submit | 201, calendar updated, recurrence génère 12 occurrences | `[broken]` `[i18n-miss]` |
| 88 | Vue **Calendrier** mensuelle → activité visible aux 12 dates | OK + couleur par type | `[broken]` `[ui-inconsistent]` |
| 89 | Vue **Calendrier** semaine → drag activité → change start_at/end_at | OK + propagation aux occurrences | `[broken]` `[no-feedback]` |
| 90 | Vue **Liste** filtrée par type+status+priority+owner | tri OK, < 1s | `[perf]` `[broken]` |
| 91 | Vue **Heatmap** charge par site (5×7 jours) | densité visible | `[broken]` `[ui-stack]` |
| 92 | Création conflit (2 activités même PAX overlap) → `POST /api/v1/planner/check-conflicts` | retourne conflits | `[broken]` |
| 93 | Onglet "Conflits" → résoudre conflit (status `resolved` avec commentaire) | OK + timeline trace | `[broken]` `[i18n-miss]` |
| 94 | Activité avec `permit_required=true` → bloque transition `in_progress` si pas de permis valide attaché | OK warning UI | `[broken]` `[no-feedback]` |
| 95 | Modifier le permit_number → audit trail | OK | `[broken]` |
| 96 | Cancel activité → `status=cancelled` + raison obligatoire | UI dégradée | `[broken]` `[i18n-miss]` |
| 97 | Bulk action : sélectionner 5 activités → "Reporter de 2 jours" | OK + 5 audits | `[broken]` `[ergo-bad]` si pas de bulk |
| 98 | Permissions : `qa.viewer` voit mais pas créer | OK | `[perm-leak]` |
| 99 | Dashboard `/planner` widgets : Vue d'ensemble (compteur), Conflits (post fix), Types (donut), Statuts (bar), PAX par site, Heatmap | post fix #42 + #53 = OK | `[broken]` |
| 100 | Export iCal `.ics` → fichier valide importable Google Calendar | OK | `[broken]` `[404-route]` |
| 101 | Notifications : créer activité dans 24h → alerte aux participants J-1 | mail + in-app notif | `[broken]` |
| 102 | Onglet "PAX" sur activité → voir + gérer la liste, capacité max | OK | `[broken]` `[i18n-miss]` |
| 103 | Onglet "Documents" → upload PV de réunion post-activité | OK | `[broken]` |
| 104 | Soft-delete activité avec récurrence → option "uniquement cette occurrence" / "toutes les futures" / "toutes" | OK choix UI | `[broken]` `[ergo-bad]` |
| 105 | Hard-delete (admin) | OK | `[broken]` |
| 106 | Filtre par installation : sélectionner INST-COMP-A → tableau filtré | OK | `[broken]` `[perf]` |
| 107 | Tester injection XSS dans `title` : `<img src=x onerror=alert(1)>` | escape OK | `[xss-risk]` |
| 108 | Console DevTools clean sur Planner | 0 erreur | `[broken]` |
| 109 | Activité **permanent_ops** → vérifier libellé "Opérations permanentes" en FR (cf bug #42) | OK | `[i18n-miss]` régression |
| 110 | Vérifier widget "Conflits" KPI affiche le bon nombre (cf bug #53 fixé) | OK | `[broken]` régression |

---

# Phase 5 — PaxLog (étapes 111-145, 35 étapes)

## Création PaxProfile complet

**Étape 111 — Champs PaxProfile (`app/models/paxlog.py:PaxProfile`)** :
```
first_name       : Jean
last_name        : Mballa
civility         : Mr
date_of_birth    : 1985-04-12
nationality      : CMR
gender           : M
badge_number     : BDG-2026-04200
employee_number  : EMP-005421
position         : Operator I&E
department       : Maintenance
employer_tier_id : QA-DEMO-001 (créé phase 2)
linked_user_id   : null (ou qa.manager)
linked_contact_id: contact créé étape 40
emergency_contact: {"name":"Marie Mballa","phone":"+237 691 99 88 77","relation":"épouse"}
medical_status   : fit
last_medical_at  : 2026-04-10
next_medical_at  : 2027-04-10
trainings        : (créés en étapes suivantes)
documents        : (idem)
photo_url        : (upload jpg ID photo)
active           : true
metadata_        : {"site_assigned":"BBR-01"}
notes            : Note interne
```

| # | Action | Attendu | Tags |
|---|---|---|---|
| 112 | Submit profile | 201 | `[broken]` `[i18n-miss]` |
| 113 | Onglet "Credentials" → ajouter 5 certifications (BOSIET, FOET, H2S, HUET, médical), avec `credential_type_id`, `issue_date`, `expiry_date`, `status`, `attachment` | 5 lignes, badges expiry colorés | `[broken]` `[ui-stack]` |
| 114 | Vérifier widget "Conformité PAX" affiche % avec `%` (cf bug #41 fixé) | post fix | `[i18n-miss]` régression |
| 115 | Onglet "Mouvements" → `POST /api/v1/pax/<id>/movements` IN avec `from_location`, `to_location`, `transport_vector`, `voyage_id`, `at` | 201 | `[broken]` |
| 116 | Onglet "Mouvements" → OUT correspondant | 201 + balance OK | `[broken]` |
| 117 | KPI "PAX sur site" → mis à jour en temps réel (post IN) | OK | `[broken]` `[perf]` |
| 118 | Onglet "Trainings" → créer training "First Aid" planning + completion | OK | `[broken]` |
| 119 | Onglet "Incidents" → ouvrir incident type=`near_miss` severity=`low` (24 champs incident) | 201 + counter "Incidents actifs" +1 (cf bug #49) | `[broken]` régression |
| 120 | Résoudre incident → `resolved_at` set, counter -1 | post fix #49 OK | `[broken]` |
| 121 | Onglet "Compliance Records" → grouper par catégorie (post fix #50) | OK donut | `[broken]` régression |
| 122 | Génération badge PDF (1 page recto, photo, code QR, expiry, …) | OK ou 501 explicite | `[broken]` `[404-route]` |
| 123 | Manifest sortie/entrée par voyage → `GET /api/v1/voyages/<id>/manifest` | OK | `[broken]` |
| 124 | Liste profiles `/paxlog` : 100+ entrées, filtres par employer, status, certification expirante | OK | `[broken]` `[perf]` |
| 125 | Bulk import CSV (fichier 50 lignes) → preview → confirm | OK + 50 rows | `[broken]` `[no-feedback]` |
| 126 | Bulk export CSV de la liste filtrée | OK 16 cols | `[broken]` |
| 127 | Conflit dates : ajouter mouvement IN qui chevauche autre mouvement actif | 422 explicite | `[broken]` `[no-feedback]` |
| 128 | Permissions : `qa.viewer` voit liste, pas créer/edit | OK | `[perm-leak]` |
| 129 | Permissions : `qa.manager` (PaxLog manager) peut tout, mais pas accéder Tiers | OK 403 sur Tiers | `[perm-leak]` |
| 130 | Dashboard `/paxlog` widgets : 8 onglets fonctionnels, post fixes #41/#49/#50 | OK | `[broken]` |
| 131 | Recherche full-text dans paxlog (nom + badge + employer) | < 1s | `[perf]` `[broken]` |
| 132 | Mark profile médical expiré → badge rouge + bloque mouvements futurs | OK | `[broken]` `[no-feedback]` |
| 133 | Soft-delete profile actif → confirme avec raison | OK | `[broken]` `[ergo-bad]` |
| 134 | Restaurer | OK | `[broken]` |
| 135 | Hard-delete (admin) | OK + cascade credentials/movements | `[broken]` `[data]` |
| 136 | Tenter XSS dans `notes` rich-text | escape | `[xss-risk]` |
| 137 | Vérifier que `badge_number` est unique (tenter doublon) | 422 message clair | `[broken]` `[i18n-miss]` |
| 138 | Vue calendrier des mouvements (IN/OUT par jour) | OK | `[broken]` `[404-route]` |
| 139 | Notifications : alerte J-30 expiry credential → email + in-app | OK | `[broken]` |
| 140 | Modifier date d'expiry credential → recalcul couleur instantané | OK | `[broken]` |
| 141 | Onglet "ADS" (autorisations de sortie) → liste 2+ ADS, statut, dates | OK (cf dashboard étape 130 mentionne 2 ADS attente) | `[broken]` `[404-route]` |
| 142 | Création ADS : tous champs (PAX, dates, motif, manager, statut) | 201 | `[broken]` `[i18n-miss]` |
| 143 | Workflow ADS : pending → approved → printed → returned | 4 transitions audit | `[broken]` |
| 144 | Console DevTools PaxLog clean | 0 erreur | `[broken]` |
| 145 | Vérifier endpoint `/api/v1/dashboards/widget-data` pour `paxlog_compliance_rate` retourne nombre + unité `%` | post fix OK | `[broken]` régression |

---

# Phase 6 — PackLog (étapes 146-165, 20 étapes)

## Création Cargo Request + Manifest + Items

**Étape 146 — `POST /api/v1/packlog/requests` (CargoRequest)** :
```
code             : DEM-QA-V3-001
type             : standard
priority         : high
requester_user_id: qa.manager@opsflux.io
origin_asset_id  : Site-BBR-01
destination_asset: INST-OFFSHORE-RIG-1
required_at      : 2026-07-01
status           : pending
description      : Pièces compresseur K-101
items_summary    : "3 colis, 145 kg total, 1 m3"
sap_wo           : WO-100542
budget_code      : OPEX-Q3-2026
contact_phone    : +237 691 23 45 67
contact_email    : contact@qatest.example.com
metadata_        : {"hazmat":false,"refrigerated":false}
```

| # | Action | Attendu | Tags |
|---|---|---|---|
| 147 | Submit request | 201 | `[broken]` `[i18n-miss]` |
| 148 | Créer **Voyage** (`voyages`) lié à un vector (créé en phase 7) avec ETD/ETA | 201 | `[broken]` |
| 149 | Créer **VoyageManifest** rattaché au voyage | 201 | `[broken]` |
| 150 | Créer **CargoItems** (3 items) liés au manifest avec `tracking_code`, `description`, `weight_kg`, `volume_m3`, `workflow_status=created`, `dimensions` | 201 ×3 | `[broken]` `[i18n-miss]` |
| 151 | Vérifier widget `packlog_overview` (post fix #44) : 1 demande + 3 colis | OK chiffres | `[broken]` régression |
| 152 | Vérifier widget `packlog_tracking` (post fix #52) : tableau 3 items avec `tracking_code`, `workflow_status`, `voyage_code` | OK colonnes | `[broken]` régression |
| 153 | Workflow CargoItem : `created → packed → in_transit → delivered → returned` (5 transitions) | OK + audit + dates | `[broken]` `[i18n-miss]` |
| 154 | Champ `tracking_code` : génération automatique format `CGO-YYYY-XXXX` | unique | `[broken]` |
| 155 | Catalogue SAP : import 1 catégorie d'articles (CSV) | OK liste | `[broken]` `[404-route]` |
| 156 | Recherche dans catalogue par code SAP / désignation | < 1s | `[perf]` `[broken]` |
| 157 | Liste demandes filtrée par statut + dates + origin/destination | OK | `[broken]` |
| 158 | Bouton "Imprimer étiquette" colis → PDF avec QR + tracking_code + destination | OK ou 501 | `[broken]` `[404-route]` |
| 159 | Onglet "Alertes" : vérifier les 5 alertes mentionnées sur dashboard étape 130 | OK | `[broken]` |
| 160 | Permissions : `qa.viewer` lecture, `qa.manager` (PaxLog only) → 403 sur PackLog | OK | `[perm-leak]` |
| 161 | Bulk update statut sur 3 colis | OK | `[broken]` `[ergo-bad]` |
| 162 | Bug #43 cosmétique : destination affichée en `---` au lieu de `—` | post check, fix | `[ui-inconsistent]` |
| 163 | Soft-delete request → archive (cascade items optionnel) | OK | `[broken]` `[data]` |
| 164 | Hard-delete (admin) | OK + cascade | `[broken]` |
| 165 | Console DevTools PackLog clean | 0 erreur | `[broken]` |

---

# Phase 7 — TravelWiz (étapes 166-185, 20 étapes)

## Création TransportVector + Voyage

**Étape 166 — `POST /api/v1/travelwiz/vectors` (TransportVector)** :
```
code             : VEC-QA-V3-001
name             : MV Atlantique Express
type             : vessel  (vessel / helicopter / truck / bus)
operator_tier_id : QA-DEMO-001
capacity_pax     : 12
capacity_cargo_kg: 5000
mmsi             : 123456789  (vessel)
imo              : IMO9876543 (vessel)
callsign         : TR-ATX-1
home_port        : Douala
flag_country     : CMR
year_built       : 2018
gross_tonnage    : 250
length_m         : 32.5
beam_m           : 8.4
draft_m          : 2.1
fuel_type        : diesel
active           : true
metadata_        : {"insurance_expires":"2027-03-15"}
```

| # | Action | Attendu | Tags |
|---|---|---|---|
| 167 | Submit vector | 201 | `[broken]` `[i18n-miss]` |
| 168 | Onglet "Positions" : `POST /vector/positions` (lat, lng, speed_knots, heading, recorded_at) | 201, marker apparaît carte flotte (post fix #47) | `[broken]` régression |
| 169 | Vue carte `fleet_map` : 1 marker avec status visible (post fix #47) | OK | `[broken]` régression |
| 170 | Création **Voyage** (`voyages`) : code, vector_id, departure_port, arrival_port, ETD, ETA, status=`scheduled` | 201 | `[broken]` |
| 171 | Manifest PAX : ajouter 5 PAX au voyage (PAX créés phase 5) | OK | `[broken]` |
| 172 | Manifest cargo : ajouter VoyageManifest + 3 items (déjà fait phase 6) → réutiliser | OK | `[broken]` |
| 173 | Workflow voyage : scheduled → boarding → at_sea → arrived → completed | 5 transitions audit | `[broken]` `[i18n-miss]` |
| 174 | Génération bulletin de voyage PDF (PAX list + cargo manifest) | OK ou 501 | `[broken]` `[404-route]` |
| 175 | Vue calendrier voyages | OK | `[broken]` |
| 176 | Carte météo `weather_sites` (post fix #45) | sites + bulletin OpenWeather | `[broken]` régression |
| 177 | Carte assets `assets_map` (post fix #48) | 3 layers (champs/sites/installations) avec markers | `[broken]` régression |
| 178 | Onglet "Alertes" : alertes opérationnelles (météo, retards, conflits) | OK | `[broken]` |
| 179 | Onglet "Voyages du jour" → liste vide ou items du jour | OK | `[broken]` |
| 180 | Onglet "Cargo en attente" : 2 cargos mentionnés dashboard | OK | `[broken]` |
| 181 | Onglet "KPIs flotte" 3/3 vecteurs : disponibilité, utilisation, pannes | OK | `[broken]` `[i18n-miss]` |
| 182 | Permissions cross : `qa.viewer` lecture vecteurs/voyages, pas créer | OK | `[perm-leak]` |
| 183 | Tester import voyage CSV bulk | OK ou explicite | `[broken]` `[no-feedback]` |
| 184 | Soft-delete voyage avec PAX + cargo manifests → confirme cascade | OK + records préservés (soft) | `[broken]` `[data]` |
| 185 | Console DevTools TravelWiz clean | 0 erreur | `[broken]` |

---

# Phase 8 — Cross-modules + cohérence UI globale (étapes 186-195, 10 étapes)

| # | Action | Attendu | Tags |
|---|---|---|---|
| 186 | Sidebar : 11 modules + 8 admin = 19 entries cliquables, icônes uniques, libellés FR/EN cohérents | OK | `[ui-inconsistent]` `[i18n-miss]` |
| 187 | Topbar : workspace switcher 4 entries, search global, création rapide menu, mode sombre toggle, notifs, assistant | OK | `[ui-inconsistent]` |
| 188 | Mode sombre : activer → tester chaque module 30s → 0 contraste cassé, 0 texte invisible | OK | `[ui-stack]` `[a11y]` |
| 189 | Switch FR↔EN sur 6 modules → 0 clé brute, 0 mot non-traduit | OK | `[i18n-miss]` `[hardcode]` |
| 190 | Scroll horizontal jamais (overflow-x:hidden hors carte) | OK | `[ui-overflow]` |
| 191 | DataTables : pattern uniforme (search bar position, pagination, export, filters) entre Tiers/Projets/Planner/PaxLog/PackLog/TravelWiz | OK | `[ui-inconsistent]` |
| 192 | Toasts confirmations : style + position + durée + dismiss identiques partout | OK | `[ui-inconsistent]` |
| 193 | Loading states : skeleton vs spinner cohérent par contexte | OK | `[ui-inconsistent]` `[no-feedback]` |
| 194 | Empty states : illustration + message + CTA cohérents (pas juste "Aucune donnée") | OK | `[ergo-bad]` `[i18n-miss]` |
| 195 | Breadcrumbs : présents et corrects sur chaque page (Module > Liste > Item > Onglet) | OK | `[ergo-bad]` |

---

# Phase 9 — Responsive + raccourcis clavier (étapes 196-200, 5 étapes)

| # | Action | Attendu | Tags |
|---|---|---|---|
| 196 | Responsive 360px (iPhone SE) : sidebar collapse, tableaux scroll horizontal, formulaires colonne unique, touch targets ≥44px | OK | `[resp]` `[ui-overflow]` `[a11y]` |
| 197 | Responsive 768px (iPad) : sidebar reste visible, tableaux 2 cols, dashboards 2-col grid | OK | `[resp]` `[ui-stack]` |
| 198 | Responsive 1280px (laptop) : layout cible | OK | `[resp]` |
| 199 | Raccourcis clavier : `?` ouvre cheatsheet, `/` focus search global, `gt` go to Tiers, `gp` projects, `cmd+k` palette commandes, `Esc` ferme modale, `Ctrl+S` save form, `Tab` cycle inputs | au moins 6/8 OK | `[shortcut-miss]` `[a11y]` |
| 200 | Lighthouse audit en mode incognito sur `/`, `/tiers`, `/projets`, `/planner`, `/paxlog`, `/packlog`, `/travelwiz` : Performance ≥ 80, Accessibility ≥ 90, Best Practices ≥ 90, SEO N/A (app interne) | au moins 5/7 pages OK | `[perf]` `[a11y]` |

---

# Annexe — Méthode d'exécution recommandée

## Pour Bastien (manuel)
1. Ouvrir `QA-LOG.md` → ajouter section `## Session 18 — Exécution v3`
2. Pour chaque étape : noter `✅ PASS` ou `❌ FAIL: [tag] description`
3. Bugs FAIL : créer ticket dans le tracker, capturer screenshot, lien vers étape

## Pour moi (autonome via Chrome MCP)
- Phase 0 : `Grep` direct, pas de browser
- Phases 1-9 : `mcp__Claude_in_Chrome__navigate` + `find` + `form_input` + `read_page` (DOM compact)
- Bug détecté → tag + description compacte dans QA-LOG, fix immédiat si trivial, sinon documenter
- Commit batch toutes les 25-30 étapes

## Coût token estimé Chrome MCP
- 200 étapes × ~3 k tokens (DOM read + actions) = **600 k tokens** total
- À comparer : computer-use screenshots à 30 k/page = 6 M tokens (10× plus)

## Données de test à ne pas perdre

Codes uniques utilisés (pour cleanup ou re-test) :
```
Tier        : QA-DEMO-001
Contact     : (généré, lien Tier QA-DEMO-001)
Project     : PRJ-QA-V3-001
Activity    : ACT-QA-V3-001
Pax         : badge BDG-2026-04200
CargoReq    : DEM-QA-V3-001
Vector      : VEC-QA-V3-001
Voyage      : (généré au step 170)
Users       : qa.viewer@opsflux.io, qa.manager@opsflux.io
Délégation  : créée step 19, révoquée step 22
MOC         : créée step 67
```

## Total étapes par phase

| Phase | Module | Étapes | Sous-total |
|---|---|---|---|
| 0 | Recon code | 10 | 10 |
| 1 | Auth + permissions + MFA | 15 | 25 |
| 2 | Tiers | 30 | 55 |
| 3 | Projets | 30 | 85 |
| 4 | Planner | 25 | 110 |
| 5 | PaxLog | 35 | 145 |
| 6 | PackLog | 20 | 165 |
| 7 | TravelWiz | 20 | 185 |
| 8 | Cross + cohérence UI | 10 | 195 |
| 9 | Responsive + raccourcis | 5 | **200** |
