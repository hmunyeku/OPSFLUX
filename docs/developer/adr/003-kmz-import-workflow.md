# ADR 003 — KMZ import workflow for Asset Registry

- **Status** — Proposed
- **Date** — 2026-04-18
- **Context commit** — `f6c2a565` (preview + export shipped, import deferred)

## Context

OPSFLUX users need to synchronise the Asset Registry with existing offshore
GIS datasets. The reference data today lives in ArcGIS-exported KMZ files
such as `MASTER_MAP_CAMEROON-RDR-NORTH` (bathymetry + platforms + pipelines).

Parser, preview endpoint, export endpoint and a **Maps & KMZ** frontend tab
are live in production as of commit `f6c2a565`. What is **not** yet wired is
the actual database commit: parsing currently ends in a preview-only card
with a "Coming soon" banner.

The blocker is not technical — it's that committing thousands of assets
requires deciding how to map the KMZ's loose attribute schema onto the
OPSFLUX hierarchy (`OilField → OilSite → Installation → RegistryEquipment`
and `RegistryPipeline` across installations).

## Observed KMZ schema (MASTER_MAP_CAMEROON-RDR, 11 304 placemarks)

| KMZ Folder                                   | Category       | Count | Geometry   | Key attributes |
|-----------------------------------------------|----------------|-------|------------|-----------------|
| `Cameroon-RDR-North_data bathy_EPSG2215`     | bathymetry     | 1 833 | Point      | depth label (name) |
| `Cameroon-RDR-North_bathy_EPSG2215`          | bathymetry     |     — | LineString | — (isobaths)    |
| `Cameroon_RDR_North_Pipeline`                | pipelines      |   177 | LineString | `LAYER`, `line_name`, `process_fluid` (OIL/GAS/MULTIPHASE), `SHAPE__Length` |
| `Cameroon_RDR_North_Cable`                   | cables         |    85 | LineString | `LAYER`, `line_name`, `SHAPE__Length` |
| `Cameroon_RDR_North_Structures`              | structures     | 8 250 | Polyline   | CAD/Autocad detail (Handle, Color, Linetype…) |
| `Cameroon__RDR_North_Well`                   | wells          |   895 | Point      | `Id`, `Name`, `Type`=Well, `X_coord`, `Y_coord` |
| `Cameroon__RDR_North_Platformes`             | platforms      |    64 | Point      | `PLATFORM_N`, `ALTERNATIV`, `ALTERNAT_1`, `TYPE_PLATF`, `X`, `Y`, `GEODETIC_C`, `COUNTRY`, `SITE`, `FIELD` |

## Decision matrix (to ratify)

### 1. Top-level OilField anchor

| Option | Rationale |
|---|---|
| **A — one Field per KMZ import** named after `Document/name` (e.g. "MASTER_MAP_CAMEROON-RDR") | Simplest; avoids collision with existing fields |
| **B — one Field per distinct `SITE` attribute** (e.g. "EAST RIO DEL REY") | Matches operator nomenclature; scales if multiple KMZs of the same area are imported |
| **C — require the user to pick / create an existing Field from the UI before commit** | Explicit, zero ambiguity, adds one modal step |

**Recommendation** — **C**. Keeps the automated import honest: a human picks
the Field, the import script only attaches to it. Eliminates the "what do
I do when the user re-imports the same KMZ next year" question.

### 2. OilSite hierarchy

KMZ rows expose **two** locality attributes:

- `SITE` — large geographic region ("EAST RIO DEL REY") — matches OilField.name
- `FIELD` — cluster within the region ("Asoma Centre") — matches OilSite.name

Despite the naming inversion, the KMZ's `FIELD` is the right level for
`OilSite`. The import should:
1. For every unique value of `attributes.FIELD` across platforms, upsert
   an `OilSite` with `name = FIELD`, `field_id = selected_field.id`,
   `site_type = 'OFFSHORE_CLUSTER'` (new dictionary entry?), and centroid
   geometry = barycentre of the platforms in that cluster.

### 3. Installation upsert key

Platform attributes relevant to identity:
- `PLATFORM_N` — display name ("ACF 1")
- `ALTERNATIV` — canonical code ("ACF1")
- `ALTERNAT_1` — secondary alt code (often empty)
- `globalid` — stable ArcGIS UUID

**Recommendation** — upsert by `(entity_id, code)` where `code = ALTERNATIV`
after normalisation (strip spaces/hyphens, uppercase). Store `globalid`
in `external_id` for round-tripping. On conflict: update geometry + type
only, preserve operational fields (status, water_depth, etc.).

### 4. Well → Installation attachment

KMZ wells have no explicit platform foreign key. Two heuristics:

1. **Name prefix** — `ABM-01` lives on platform `ABM`. Split on first dash.
2. **Spatial proximity** — nearest platform within 500 m (haversine).

Fallback chain: try name prefix first; if no match, fall back to spatial;
if both fail, leave `installation_id` null and flag the well for manual
attachment in the import report.

### 5. Pipeline from/to resolution

Pipeline names follow `{SIZE}IN_{FLUID}_{FROM}_{TO}` (12IN_OIL_DIF-1_ASP-1).
The parser already extracts these. Resolution:

1. Normalise `from_tag` / `to_tag` same as installation code (strip -).
2. Look up `Installation.code` among the upserted platforms.
3. If both sides resolve → create pipeline with correct FKs.
4. If one side doesn't resolve → record a warning in the import report
   and skip the pipeline (don't create a ghost pipeline with a null FK).

### 6. Import report format

Every call to `POST /kmz/import` returns:

```json
{
  "field": { "id": "...", "created": false, "name": "East Rio Del Rey" },
  "sites": { "created": 4, "matched": 1, "errors": 0 },
  "installations": { "created": 62, "matched": 2, "errors": 0 },
  "wells": { "created": 712, "matched": 180, "errors": 3 },
  "pipelines": { "created": 170, "skipped": 7, "errors": 0 },
  "warnings": [
    { "kind": "well_unmatched", "name": "XYZ-99", "reason": "No platform within 500m" },
    { "kind": "pipeline_unresolved", "name": "8IN_GAS_ZZ_YY", "reason": "Unknown to_tag: YY" }
  ]
}
```

The frontend should display this as a coloured report so the user knows
exactly what landed, what didn't and why.

### 7. Transaction boundary

**Single transaction per category**, not per-record. Fail-fast on geometry
parse errors, keep going on missing-FK errors (they go into the warnings
list). This prevents a bad pipeline from aborting a 700-well import.

### 8. Idempotency

Re-importing the same KMZ should be a no-op (all upserts). The `globalid`
attribute from ArcGIS is the canonical key for that.

## Consequences

If accepted:
- A new field `external_id` (or `external_gids` JSONB) on Installation,
  RegistryEquipment and RegistryPipeline (Alembic migration required).
- A new `OilSite.site_type` dictionary value `OFFSHORE_CLUSTER`.
- An `/kmz/import` POST endpoint wrapping the whole workflow, producing
  the report shape above.
- Frontend: the pending-import banner on `MapsTab` becomes a two-step
  flow — preview → pick Field modal → commit → report modal.
- Rollback path: a `/kmz/import/:id/rollback` endpoint that soft-deletes
  everything created by a given import run (tracked via a new
  `ar_import_runs` table joining to created entity IDs).

## Implementation plan (3 PRs)

1. **PR 1 — schema + upsert** : Alembic migration adds `external_id` on
   Installation/RegistryEquipment/RegistryPipeline; service `kmz_import.py`
   exposes pure Python upsert functions (no HTTP); unit tests.
2. **PR 2 — endpoint + report** : `POST /kmz/import` wraps the service,
   returns the report shape, transactional. Frontend: pick-field modal +
   commit button + report UI.
3. **PR 3 — rollback + idempotency** : `ar_import_runs` table, rollback
   endpoint, re-import idempotency via globalid.

Estimated effort: 2–3 days of one engineer.

## Decision

**Pending** — requires product sign-off on points 1, 2 and 4 above before
coding starts.
