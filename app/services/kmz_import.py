"""
KMZ → Asset Registry importer.

Commits parsed KMZ records to the database under a caller-selected
OilField. Implements ADR 003 decisions:

- Upsert sites (one per unique attributes.FIELD value seen on platforms).
- Upsert installations (one per platform, keyed by ArcGIS globalid or
  normalised ALTERNATIV code).
- Create/upsert wells as RegistryEquipment rows with equipment_class='WELL',
  attached to the installation whose code matches the well name prefix
  (e.g. 'ABM-03' → platform 'ABM'), falling back to the spatially nearest
  platform within 500 m.
- Create/upsert pipelines whose from/to tags resolve to two installations
  (parsed from '{SIZE}IN_{FLUID}_{FROM}_{TO}' names).

The whole run is tracked in an ar_import_runs row so it can be rolled back.
Returns a structured report with counts + warnings.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import (
    Installation,
    OilField,
    OilSite,
    RegistryEquipment,
    RegistryPipeline,
)
from app.models.asset_registry_import import ImportRun
from app.services.kmz_parser import parse_kmz


# ── Helpers ────────────────────────────────────────────────────────────


def _norm_code(raw: str | None) -> str:
    """Normalise a code for matching: uppercase, strip non-alphanumerics."""
    if not raw:
        return ""
    return re.sub(r"[^A-Z0-9]", "", raw.upper())


def _point_wkt(coord: tuple[float, float]) -> str:
    lon, lat = coord
    return f"SRID=4326;POINT({lon} {lat})"


def _linestring_wkt(coords: list[tuple[float, float]]) -> str:
    parts = " ".join(f"{lon} {lat}" for lon, lat in coords)
    return f"SRID=4326;LINESTRING({parts})"


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


@dataclass
class ImportReport:
    """Structured report returned from the import."""

    field: dict[str, Any] = field(default_factory=dict)
    sites: dict[str, int] = field(default_factory=lambda: {"created": 0, "matched": 0, "errors": 0})
    installations: dict[str, int] = field(default_factory=lambda: {"created": 0, "matched": 0, "errors": 0})
    wells: dict[str, int] = field(default_factory=lambda: {"created": 0, "matched": 0, "errors": 0})
    pipelines: dict[str, int] = field(default_factory=lambda: {"created": 0, "matched": 0, "skipped": 0, "errors": 0})
    warnings: list[dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "sites": self.sites,
            "installations": self.installations,
            "wells": self.wells,
            "pipelines": self.pipelines,
            "warnings": self.warnings,
        }


# ── Import service ─────────────────────────────────────────────────────


async def import_kmz(
    db: AsyncSession,
    *,
    entity_id: UUID,
    field_id: UUID,
    user_id: UUID | None,
    kmz_bytes: bytes,
    filename: str | None = None,
) -> ImportReport:
    """
    Parse the KMZ and commit its content under the given OilField.

    A single transaction: db.commit() is called by the caller after this
    returns so that a failure rolls the whole run back automatically.
    An ImportRun record is always persisted (even on partial success) so
    the user can audit or rollback the run.
    """
    parsed = parse_kmz(kmz_bytes)
    report = ImportReport()

    # ── Verify the target field exists and belongs to the entity ──
    field_obj = (await db.execute(
        select(OilField).where(OilField.id == field_id, OilField.entity_id == entity_id)
    )).scalar_one_or_none()
    if not field_obj:
        raise ValueError(f"Field {field_id} not found for this entity")
    report.field = {"id": str(field_obj.id), "code": field_obj.code, "name": field_obj.name}

    created_site_ids: list[str] = []
    created_installation_ids: list[str] = []
    created_equipment_ids: list[str] = []
    created_pipeline_ids: list[str] = []

    # ── Preload existing sites / installations for upsert-on-conflict ──
    existing_sites = (
        await db.execute(select(OilSite).where(OilSite.entity_id == entity_id, OilSite.field_id == field_id))
    ).scalars().all()
    sites_by_code: dict[str, OilSite] = {_norm_code(s.code): s for s in existing_sites}
    sites_by_name: dict[str, OilSite] = {s.name.strip().upper(): s for s in existing_sites}

    existing_installations = (
        await db.execute(select(Installation).where(Installation.entity_id == entity_id))
    ).scalars().all()
    installations_by_code: dict[str, Installation] = {_norm_code(i.code): i for i in existing_installations}
    installations_by_external: dict[str, Installation] = {
        i.external_id: i for i in existing_installations if i.external_id
    }

    existing_equipment = (
        await db.execute(
            select(RegistryEquipment).where(
                RegistryEquipment.entity_id == entity_id, RegistryEquipment.equipment_class == "WELL"
            )
        )
    ).scalars().all()
    equipment_by_external: dict[str, RegistryEquipment] = {
        e.external_id: e for e in existing_equipment if e.external_id
    }
    equipment_by_tag: dict[str, RegistryEquipment] = {_norm_code(e.tag_number): e for e in existing_equipment}

    existing_pipelines = (
        await db.execute(select(RegistryPipeline).where(RegistryPipeline.entity_id == entity_id))
    ).scalars().all()
    pipelines_by_external: dict[str, RegistryPipeline] = {
        p.external_id: p for p in existing_pipelines if p.external_id
    }

    # ══════ PLATFORMS → Sites + Installations ══════
    # First pass: collect the unique FIELD attribute values from platforms,
    # upsert a Site for each under the selected OilField.
    site_names: dict[str, list[dict]] = {}  # normalised name → [platform records]
    for platform in parsed["platforms"]:
        attrs = platform.get("attributes", {})
        raw_field = (attrs.get("FIELD") or attrs.get("SITE") or "DEFAULT").strip()
        key = raw_field.upper()
        site_names.setdefault(key, []).append(platform)

    site_by_key: dict[str, OilSite] = {}
    for site_key, members in site_names.items():
        pretty_name = members[0].get("attributes", {}).get("FIELD", site_key).strip() or site_key
        code = _norm_code(pretty_name) or "DEFAULT_SITE"
        code = code[:30]
        existing = sites_by_code.get(code) or sites_by_name.get(site_key)
        if existing:
            site_by_key[site_key] = existing
            report.sites["matched"] += 1
            continue
        # Country + centroid from the platform samples.
        country = (members[0].get("attributes", {}).get("COUNTRY") or "XXX").strip()[:3] or "XXX"
        site = OilSite(
            entity_id=entity_id,
            field_id=field_id,
            code=code,
            name=pretty_name[:200],
            site_type="OFFSHORE_CLUSTER",
            environment="OFFSHORE",
            country=country.upper(),
        )
        db.add(site)
        await db.flush()
        site_by_key[site_key] = site
        created_site_ids.append(str(site.id))
        report.sites["created"] += 1

    # Second pass: upsert installations under their matching sites.
    for platform in parsed["platforms"]:
        attrs = platform.get("attributes", {})
        name = platform.get("name") or attrs.get("PLATFORM_N") or "Unnamed platform"
        alt = attrs.get("ALTERNATIV") or ""
        code = _norm_code(alt) or _norm_code(name)
        code = code[:30] or "UNKNOWN"
        external_id = (attrs.get("globalid") or attrs.get("GLOBALID") or "").strip("{} ")
        raw_field = (attrs.get("FIELD") or attrs.get("SITE") or "DEFAULT").strip().upper()
        target_site = site_by_key.get(raw_field) or next(iter(site_by_key.values()), None)
        if not target_site:
            report.installations["errors"] += 1
            report.warnings.append({"kind": "platform_no_site", "name": name, "reason": "No site could be created"})
            continue
        coords = platform.get("coordinates") or []
        if not coords:
            report.installations["errors"] += 1
            report.warnings.append({"kind": "platform_no_coord", "name": name, "reason": "No geometry"})
            continue
        lon, lat = coords[0]
        existing = (
            (external_id and installations_by_external.get(external_id))
            or installations_by_code.get(code)
        )
        if existing:
            # Update geometry + external_id only; preserve operational fields.
            existing.latitude = lat
            existing.longitude = lon
            existing.geom_point = WKTElement(f"POINT({lon} {lat})", srid=4326)
            if external_id and not existing.external_id:
                existing.external_id = external_id
            report.installations["matched"] += 1
            continue
        inst = Installation(
            entity_id=entity_id,
            site_id=target_site.id,
            code=code,
            name=name[:200],
            installation_type=(attrs.get("TYPE_PLATF") or "PLATFORM")[:60],
            environment="OFFSHORE",
            latitude=lat,
            longitude=lon,
            geom_point=WKTElement(f"POINT({lon} {lat})", srid=4326),
            status="OPERATIONAL",
            external_id=external_id or None,
        )
        db.add(inst)
        await db.flush()
        installations_by_code[_norm_code(code)] = inst
        if external_id:
            installations_by_external[external_id] = inst
        created_installation_ids.append(str(inst.id))
        report.installations["created"] += 1

    # ══════ WELLS → RegistryEquipment(class='WELL') ══════
    # Sorted list of platform points for fast haversine fallback.
    platform_points: list[tuple[Installation, float, float]] = []
    for inst in installations_by_code.values():
        if inst.latitude is not None and inst.longitude is not None:
            platform_points.append((inst, float(inst.longitude), float(inst.latitude)))

    for well in parsed["wells"]:
        attrs = well.get("attributes", {})
        name = well.get("name") or attrs.get("Name") or "Unnamed well"
        external_id = (attrs.get("globalid") or "").strip("{} ")
        coords = well.get("coordinates") or []
        if not coords:
            report.wells["errors"] += 1
            report.warnings.append({"kind": "well_no_coord", "name": name, "reason": "No geometry"})
            continue
        lon, lat = coords[0]
        # Attach-to-installation resolution
        prefix = name.split("-")[0] if "-" in name else name
        target = installations_by_code.get(_norm_code(prefix))
        if not target and platform_points:
            nearest = min(platform_points, key=lambda p: _haversine_km((p[1], p[2]), (lon, lat)))
            if _haversine_km((nearest[1], nearest[2]), (lon, lat)) <= 0.5:
                target = nearest[0]
        existing = (
            (external_id and equipment_by_external.get(external_id))
            or equipment_by_tag.get(_norm_code(name))
        )
        if existing:
            existing.latitude = lat
            existing.longitude = lon
            existing.geom_point = WKTElement(f"POINT({lon} {lat})", srid=4326)
            if external_id and not existing.external_id:
                existing.external_id = external_id
            report.wells["matched"] += 1
            continue
        if not target:
            report.warnings.append({"kind": "well_unmatched", "name": name, "reason": "No platform within 500m and no name-prefix match"})
            # We still create it with null installation_id so the user sees it.
        tag = _norm_code(name)[:50] or "WELL"
        equip = RegistryEquipment(
            entity_id=entity_id,
            installation_id=target.id if target else None,
            tag_number=tag,
            name=name[:200],
            equipment_class="WELL",
            status="OPERATIONAL",
            latitude=lat,
            longitude=lon,
            geom_point=WKTElement(f"POINT({lon} {lat})", srid=4326),
            external_id=external_id or None,
        )
        db.add(equip)
        await db.flush()
        equipment_by_tag[_norm_code(tag)] = equip
        if external_id:
            equipment_by_external[external_id] = equip
        created_equipment_ids.append(str(equip.id))
        report.wells["created"] += 1

    # ══════ PIPELINES → RegistryPipeline ══════
    for pipe in parsed["pipelines"]:
        attrs = pipe.get("attributes", {})
        name = pipe.get("name") or attrs.get("line_name") or "Unnamed pipeline"
        parsed_name = pipe.get("parsed_name") or {}
        external_id = (attrs.get("globalid") or "").strip("{} ")
        coords = pipe.get("coordinates") or []
        if not coords:
            report.pipelines["errors"] += 1
            report.warnings.append({"kind": "pipeline_no_coord", "name": name, "reason": "No geometry"})
            continue
        from_tag = _norm_code(parsed_name.get("from_tag") or "")
        to_tag = _norm_code(parsed_name.get("to_tag") or "")
        from_inst = installations_by_code.get(from_tag)
        to_inst = installations_by_code.get(to_tag)
        if not from_inst or not to_inst:
            report.pipelines["skipped"] += 1
            report.warnings.append({
                "kind": "pipeline_unresolved",
                "name": name,
                "reason": f"Missing endpoint(s): from={from_tag or '?'} to={to_tag or '?'}",
            })
            continue
        existing = (external_id and pipelines_by_external.get(external_id))
        diameter = parsed_name.get("diameter_in")
        fluid = (parsed_name.get("fluid") or attrs.get("process_fluid") or "UNKNOWN").upper()
        pid = f"{from_tag}-{to_tag}-{int(diameter) if diameter else 0}IN"[:50]
        if existing:
            existing.geom_route = WKTElement(_linestring_wkt(coords).split(";", 1)[1], srid=4326)
            if external_id and not existing.external_id:
                existing.external_id = external_id
            report.pipelines["matched"] += 1
            continue
        pipeline = RegistryPipeline(
            entity_id=entity_id,
            pipeline_id=pid,
            name=name[:200],
            service=fluid[:50],
            status="OPERATIONAL",
            from_installation_id=from_inst.id,
            to_installation_id=to_inst.id,
            nominal_diameter_in=diameter or 0,
            design_pressure_barg=0,  # required but unknown from KMZ
            design_temp_max_c=0,  # required but unknown from KMZ
            geom_route=WKTElement(_linestring_wkt(coords).split(";", 1)[1], srid=4326),
            external_id=external_id or None,
        )
        db.add(pipeline)
        await db.flush()
        if external_id:
            pipelines_by_external[external_id] = pipeline
        created_pipeline_ids.append(str(pipeline.id))
        report.pipelines["created"] += 1

    # ══════ Persist the run ledger ══════
    run = ImportRun(
        id=uuid4(),
        entity_id=entity_id,
        field_id=field_id,
        created_by=user_id,
        source_filename=filename,
        document_name=parsed["source"].get("document_name"),
        status="completed",
        report=report.to_dict(),
        created_site_ids=created_site_ids,
        created_installation_ids=created_installation_ids,
        created_equipment_ids=created_equipment_ids,
        created_pipeline_ids=created_pipeline_ids,
    )
    db.add(run)
    await db.flush()
    report.field["import_run_id"] = str(run.id)

    return report
