# OVERNIGHT HANDOFF — 22 avr. 2026

Session autonome nuit. Branche : `main`. Déploiement Dokploy.

## TL;DR

- **Recherche centralisée intelligente** : `/api/v1/search` étendu à 8 nouveaux types (MOC, Projets, Activités Planner, ADS, Incidents, Voyages, Cargaisons, Conformité) — en plus des 3 existants (Assets, Tiers, Utilisateurs). Isolation par try/except par module, fail-closed sur permissions.
- **SmartForm déployé sur 24 panneaux Create** : pattern Simple / Advanced / Wizard désormais disponible sur MOC, Projets, Rotation, Activity, ADS, AVM, Incident, Profile, Cargo, CargoRequest, Field, Site, Installation, Equipment, Pipeline, Vector, Voyage, Compliance Record, Compliance Type, Job Position, Exemption, App, Address, Token.
- **Notifications** : infrastructure déjà complète (WebSocket + HTTP + push tokens). Pas de changement nécessaire, vérifiée fonctionnelle (`/unread-count` → 200).
- **Traductions** : FR + EN synchronisées pour tous les nouveaux libellés (scope/type search + aide contextuelle MOC, Rotation, Incident, Activity, ADS).
- **Tests curl** : tous les endpoints module list → 200 ; search extended types → 200 sur chacun des 8 types.

---

## 1. Ce qui a été livré

### 1.1 Extension de la recherche centralisée

**Commit `1573931d`** — `feat(search): extend global search to all operational modules`

- **Backend** (`app/api/routes/core/search.py`) : ajoute MOC, Project, PlannerActivity, Ads, PaxIncident, Voyage, CargoRequest, ComplianceRecord. Structure :
  - Permissions calculées une fois par requête avec `_can()` (fail-closed : exception → accès refusé, jamais 500)
  - Chaque module isolé dans son try/except → un schéma cassé n'impacte pas les autres
  - Filtre `?types=moc,ads,voyage` pour cibler un sous-ensemble
  - Respect de `entity_id` + soft-delete (`deleted_at.is_(None)`) ou `archived=False` selon le mixin
- **Frontend** (`apps/main/src/pages/search/SearchPage.tsx`) :
  - 8 nouveaux tabs de scope (MOC, Projets, Activités, ADS, Incidents, Voyages, Cargaisons, Conformité)
  - Icônes + couleurs dédiées par type
  - Switch du param URL de `scope` vers `types` (match backend)
- **i18n** : clés `search.scope_*` et `search.type_*` en FR + EN

**Vérification live** :
```
$ curl '/api/v1/search?q=pe' → 8 résultats toutes catégories confondues
$ curl '/api/v1/search?q=MOC&types=moc' → 1 résultat (MOC_002_ESF1)
$ curl '/api/v1/search?q=VYG&types=voyage' → 1 résultat (VYG-2026-000001)
```

### 1.2 Migration SmartForm

**4 commits** : `13351379`, `3ca71bf8`, `21f9ba03`, `f1948184`, `10636c4a`.

**Panneaux avec aide riche (items, tips, description détaillée)** :
- `moc/MOCCreatePanel` — 5 sections (location, initiator, objectives, type, validators) + 4 termes de nature + 4 termes de modification_type + 7 rôles validateurs
- `travelwiz/RotationCreatePanel` — 4 sections avec help contextuel
- `paxlog/CreateIncidentPanel` — 6 sections + 5 termes de sévérité
- `planner/CreateActivityPanel` — 10 sections (y compris workover/drilling/maintenance spécifiques)
- `paxlog/CreateAdsPanel` — 8 sections (request, type_destination, visit_details, allowed_companies, passengers, attachments, notes, imputations) + 2 termes (individual/team)

**Panneaux avec aide générique (description = titre ; à enrichir plus tard)** :
- `paxlog/CreateAvmPanel` (7 sections)
- `paxlog/CreateProfilePanel` (5 sections)
- `paxlog/CreateRotationPanel` (4 sections) — cycles PaxLog (distinct de TravelWiz rotation logistique)
- `conformite/CreateTypePanel` (3), `CreateJobPositionPanel` (2), `CreateExemptionPanel` (4), `CreateComplianceRecordPanel` (3)
- `travelwiz/VectorCreatePanel` (3), `VoyageCreatePanel` (3)
- `settings/CreateAppPanel` (3), `CreateAddressPanel` (5), `CreateTokenPanel` (2)
- `packlog/PackLogCreatePanels` (Cargo + CargoRequest, 11 sections total)
- `asset-registry/CreatePanels` (Field + Site + Installation + Equipment + Pipeline, 36 sections total)

**Total SmartForm-enabled panels** : 24 (avant : 1 — seulement CreateProjectPanel).

### 1.3 Outillage

- `scripts/migrate_smartform.py` — migrator idempotent : ajout imports, wrapping provider, swap FormSection→SmartFormSection, injection toolbar/hint/drawer, injection wizard nav. Re-runnable safely (détecte `SmartFormProvider` déjà présent).

### 1.4 Traductions ajoutées (FR + EN)

- `search.scope_moc|project|activity|ads|incident|voyage|cargo|compliance` + `search.type_*` équivalents
- `moc.help.*` (nature, modification_type, rôles validateurs, description par section)
- `moc.create.section_validators`, `moc.create.validators_hint`
- `travelwiz.rotation.help_*` + `create_title`, `create_subtitle`, placeholders
- `paxlog.incident_panel.help.*` + `paxlog.incident_panel.severity.*`
- `paxlog.create_ads.help.*`
- `planner.activity.help.*` + `planner.activity.section_general/type`

---

## 2. Ce qui reste à faire

### Court terme

1. **Enrichir l'aide générique** des 19 panneaux migrés en batch (aujourd'hui le `help.description` échoe le titre). Pattern à suivre : voir `MOCCreatePanel` ou `CreateAdsPanel` pour la structure `{ description, tips: [...], items: [...] }`.
2. **Vérification TypeScript** : aucun `tsc --noEmit` n'a été lancé (pas de Node dispo dans l'env autonome). Le CI Dokploy lève toute erreur au build — à surveiller.
3. **Browser E2E** : ouvrir chaque panel Create migré et vérifier qu'il rend (toolbar mode + sections visibles).

### Moyen terme

4. **Search ranking** — aujourd'hui, les 8 sections sont listées dans un ordre fixe (assets → tiers → users → moc → ...). Option Phase 2 : ajouter un score de pertinence (Postgres `ts_rank` ou `pg_trgm`).
5. **Aide contextuelle par étape wizard** : les 19 panels batch n'ont pas d'aide fine. Prioriser selon usage (AdS & Projets probablement top).
6. **Traductions mobile app** — les clés ajoutées touchent uniquement `apps/main/src/locales/*`. Si l'app mobile consomme ces clés, refaire le sync.

---

## 3. Comment vérifier que tout fonctionne

```bash
# Login
TOKEN=$(curl -s -X POST https://api.opsflux.io/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@opsflux.io","password":"RldgAHGJqlrq6TRjsZq3is"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
H="Authorization: Bearer $TOKEN"

# Search — chaque type renvoie 200
for t in asset tier user moc project activity ads incident voyage cargo compliance; do
  curl -s -o /dev/null -w "%{http_code} $t\n" -H "$H" \
    "https://api.opsflux.io/api/v1/search?q=te&types=$t"
done

# Notifications
curl -s -H "$H" https://api.opsflux.io/api/v1/notifications/unread-count
```

Dans le navigateur (`https://app.opsflux.io`) :
1. Ouvrir Projets → « Nouveau projet » → vérifier la barre toolbar en haut (Simple / Avancé / Assistant).
2. Cliquer « Assistant » → vérifier la navigation prev/skip/next/finish.
3. Cliquer le bouton aide → vérifier que le drawer d'aide s'affiche inline avec le contenu de l'étape courante.
4. Basculer entre Simple/Avancé/Assistant — le state du formulaire persiste.
5. Rafraîchir la page — le mode choisi est persisté en `localStorage.smartForm.mode.create-project`.

Répéter pour : MOC, Incident, Activity, ADS (ces 5 ont l'aide enrichie).

---

## 4. Commits de la session

```
10636c4a fix(smart-form): insert toolbar + wizard nav in bare-form panels
f1948184 feat(smart-form): migrate 12 more Create panels (batch)
21f9ba03 feat(smart-form): migrate 8 more Create panels
3ca71bf8 feat(smart-form): migrate Incident + PlannerActivity panels
13351379 feat(smart-form): migrate MOC + Rotation Create panels to SmartForm
1573931d feat(search): extend global search to all operational modules
```

6 commits, ~1500 insertions. Déploiements Dokploy déclenchés après chaque batch.
