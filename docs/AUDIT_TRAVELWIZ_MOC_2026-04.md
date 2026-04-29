# Audit travelwiz + moc — 2026-04-29

Audit autonome dans la même méthodologie que `AUDIT_PAXLOG_PACKLOG_2026-04.md` :
greps ciblés sur les anti-patterns connus + lecture en profondeur des
endpoints à risque. Pas de tests fonctionnels live.

## Surface auditée

**Backend** (~12 200 lignes)

| Fichier | Lignes |
|---|---|
| `app/api/routes/modules/travelwiz.py` | 4 494 |
| `app/api/routes/modules/moc.py` | 2 092 |
| `app/services/modules/travelwiz_service.py` | 2 455 |
| `app/services/modules/moc_service.py` | 824 |
| `app/services/modules/moc_sync.py` | 103 |
| `app/models/{travelwiz,moc}.py` | 1 231 |
| `app/schemas/{travelwiz,moc}.py` | 1 028 |

**Frontend** (~8 200 lignes)

| Dossier | Lignes |
|---|---|
| `apps/main/src/pages/travelwiz/**` | ~5 000 |
| `apps/main/src/pages/moc/**` | ~3 300 |
| `apps/main/src/hooks/useTravelWiz.ts` | 649 |
| `apps/main/src/hooks/useMOC.ts` | 319 |

## Points vérifiés ✅

### Backend

- **Tenant isolation sur DELETE/PATCH/PUT** (échantillon)
  - `travelwiz.py:1029` `archive_vector` → `_get_vector_or_404(db, vector_id, entity_id)` ✅
  - `travelwiz.py:1108` `delete_vector_zone` → idem + check `vector_id` ✅
  - `travelwiz.py:2298` `remove_passenger` → `_get_voyage_or_404(db, voyage_id, entity_id)` puis check `manifest_id` ✅
  - `moc.py:733` `delete_moc_type` → `_get_type_or_404(db, type_id, entity_id)` ✅
  - `moc.py:2063` `delete_site_assignment` → filtre `entity_id` explicite + audit log ✅
- **RBAC** : `dependencies=[require_permission(...)]` ou `_: None = require_permission(...)` partout sur les endpoints contrôlés
- **Audit log** : `record_audit(...)` systématique sur les MOC mutations (DELETE inclus)
- **Aucun TODO/FIXME/HACK** ouvert

### Frontend

- **Mutations React Query saines** :
  - `useMOC.ts` : `useCreateMOC`, `useUpdateMOC`, `useDeleteMOC`, `useTransitionMOC`, `useUpsertValidation`, `useExecutionAccord` → toutes ont `invalidateQueries` scoped (detail + list + stats)
  - `useTravelWiz.ts` : 35 mutations (vectors, zones, certifications, rotations, voyages, stops, manifests, cargo) → toutes ont `invalidateQueries` correct
- **i18n MOC** : 5/5 fichiers `.tsx` ont `useTranslation`, aucun string FR hardcodé détecté → **module entièrement clean**
- **i18n travelwiz** : tous les fichiers ont `useTranslation` ; quelques labels hardcodés résiduels corrigés cette session

## Corrections appliquées ✏️

### Commit `ee99fd03` — Locale hardcoding travelwiz

8 fichiers, formatters utilitaires `toLocaleString('fr-FR')` →
`toLocaleString(numLocale())` qui lit `i18n.language` dynamiquement.

| Fichier | Occurrences |
|---|---|
| `shared.ts` | `formatDateShort`, `formatDateTime` |
| `CaptainPortalPage.tsx` | `formatDateTime` |
| `panels/VoyageDetailPanel.tsx` | 7× |
| `panels/VectorDetailPanel.tsx` | 2× |
| `panels/CargoRequestPanels.tsx` | 8× |
| `tabs/{Manifestes,Cargo,Voyages}Tab.tsx` | 3× combinés |

### Commit `2df60977` — i18n stragglers travelwiz

| Fichier | Strings traduites |
|---|---|
| `tabs/DashboardTab.tsx` | 4 KPI labels (`voyages_today`, `cargo_transit`, `pax_transit`, `no_shows_month`) |
| `panels/VoyageDetailPanel.tsx` | 14 labels (Section Info : rotation, bases, dates ; Section KPIs : total_pax/cargo, no_shows, on_time, events, hazmat) + empty state |

Toutes routées via `t('key', 'fallback')` — i18next utilise le
fallback FR au runtime, donc l'UI reste impeccable côté FR pendant
que le backfill EN peut être fait à part.

## Zones à risque non couvertes

Mêmes limites que pour paxlog/packlog (audit statique, pas de tests
live, lecture exhaustive impossible dans le budget de contexte) :

1. **Lecture exhaustive** de `travelwiz.py` (4 494 lignes) et
   `travelwiz_service.py` (2 455 lignes) — endpoints DELETE/PATCH/PUT
   échantillonnés OK, mais GET/POST et logique métier profonde
   (manifest assignment, cargo loading options, voyage status
   transitions, weather sync, pickup reminders) non passés en revue.
2. **Jobs de fond** non audités :
   - `app/tasks/jobs/travelwiz_operational_watch.py`
   - `app/tasks/jobs/travelwiz_pickup_reminders.py`
   - `app/tasks/jobs/travelwiz_weather_sync.py`
   - `app/tasks/jobs/moc_temporary_expiry.py`
3. **Reste de hardcoded labels** dans `VoyageCreatePanel`,
   `VectorCreatePanel`, `CronScheduleBuilder`, `CargoRequestPanels`
   (~10 labels au total, non critiques mais à backfiller).
4. **`MOCDetailPanel` (1 192 lignes)** non passé en revue ligne par
   ligne — i18n présent mais logique métier (workflows, transitions,
   validations) non auditée.
5. **Tests fonctionnels live** : pas exécutés (Vite/Docker pas
   démarré). `tsc --noEmit` clean sur tous les commits.
6. **Backfill complet `locales/en/common.json`** pour les nouvelles
   clés `travelwiz.dashboard.kpi.*`, `travelwiz.voyage.*` — pas fait
   (fonctionne en FR via fallback inline).

## Recommandations

### P0 — Sécurité (à valider sous 48 h)
- [ ] Vérifier les transitions de voyage (`PATCH /voyages/{id}/status`)
      — flow critique côté ops
- [ ] Vérifier les workflows MOC (`MOCDetailPanel.tsx` 1 192 lignes
      + service `moc_service.py` 824 lignes) — sécurité des
      validations cross-rôle
- [ ] Tests multi-tenant croisés (voir AUDIT_PAXLOG_PACKLOG_2026-04.md
      pour la méthode)

### P1 — Tests
- [ ] Smoke Playwright sur :
  - TravelWiz : create vector → create rotation → create voyage →
    add manifest → assign cargo → boarding pax → status transitions
  - MOC : create MOC → fill validations → transitions → execution
    accord → audit trail
- [ ] Vérifier les jobs de fond (operational_watch, pickup_reminders,
      weather_sync, moc_temporary_expiry) en environnement de staging

### P2 — i18n
- [ ] Backfill `locales/en/common.json` pour les ~25 nouvelles clés
      `travelwiz.*` ajoutées cette session
- [ ] Finaliser i18n sur `VoyageCreatePanel`, `VectorCreatePanel`,
      `CronScheduleBuilder` (~10 labels résiduels)

### P3 — Refacto
- [ ] `travelwiz.py` 4 494 lignes → exploser en sous-modules
      (vectors, rotations, voyages, manifests, cargo-requests)
- [ ] `MOCDetailPanel.tsx` 1 192 lignes → décomposer par tab

## État final

| Module | Tenant isolation | RBAC | Mutations | i18n | Locale |
|---|---|---|---|---|---|
| **travelwiz** | ✅ échantillon OK | ✅ | ✅ 35 mutations OK | ⚠️ 95% (10 labels résiduels) | ✅ corrigé |
| **moc** | ✅ échantillon OK | ✅ | ✅ 6 mutations OK | ✅ 100% | ✅ déjà clean |

Aucun bug bloquant détecté pendant l'audit. Filet TypeScript reste
vert sur tous les commits.
