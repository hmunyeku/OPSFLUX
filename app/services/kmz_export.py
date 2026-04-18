"""
KMZ export for asset registry.

Generates a KMZ (zipped KML) file describing the entity's installations,
equipment (wells) and pipelines, suitable for import into Google Earth,
ArcGIS, QGIS or any other GIS that consumes OGC KML 2.2.

The output mirrors the source KMZ structure used by the Cameroon RDR map:
one Folder per asset category, one Placemark per asset, with geometry
(Point for installations/wells, LineString for pipelines) and an HTML
table of attributes inside <description>.
"""
from __future__ import annotations

import io
import zipfile
from typing import Any, Iterable
from uuid import UUID
from xml.sax.saxutils import escape as xml_escape

from geoalchemy2.shape import to_shape  # type: ignore[import-untyped]
from shapely.geometry import LineString, Point  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import (
    Installation,
    OilField,
    OilSite,
    RegistryEquipment,
    RegistryPipeline,
)


# ── KML style snippets — one icon color per asset category ────────────

_KML_STYLES = """
  <Style id="stylePlatform">
    <IconStyle>
      <color>ffe68a1e</color>
      <scale>1.1</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon>
    </IconStyle>
    <LabelStyle><scale>0.9</scale></LabelStyle>
  </Style>
  <Style id="styleWell">
    <IconStyle>
      <color>ff00e6ff</color>
      <scale>0.9</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon>
    </IconStyle>
    <LabelStyle><scale>0.7</scale></LabelStyle>
  </Style>
  <Style id="stylePipelineOil">
    <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
  </Style>
  <Style id="stylePipelineGas">
    <LineStyle><color>ff00ffff</color><width>2</width></LineStyle>
  </Style>
  <Style id="stylePipelineMultiphase">
    <LineStyle><color>ffff00ff</color><width>2</width></LineStyle>
  </Style>
  <Style id="stylePipelineOther">
    <LineStyle><color>ff888888</color><width>2</width></LineStyle>
  </Style>
"""


def _style_for_pipeline(service: str | None) -> str:
    s = (service or "").upper()
    if "OIL" in s:
        return "#stylePipelineOil"
    if "GAS" in s:
        return "#stylePipelineGas"
    if "MULTI" in s:
        return "#stylePipelineMultiphase"
    return "#stylePipelineOther"


def _attr_table(attrs: Iterable[tuple[str, Any]]) -> str:
    """Render a simple HTML table for KML <description>, skipping None values."""
    rows: list[str] = []
    for key, value in attrs:
        if value is None or value == "":
            continue
        rows.append(
            f"<tr><td><b>{xml_escape(str(key))}</b></td>"
            f"<td>{xml_escape(str(value))}</td></tr>"
        )
    if not rows:
        return ""
    return (
        "<table style='font-family:Arial;font-size:12px;'>"
        + "".join(rows)
        + "</table>"
    )


def _point_coord(geom_point: Any) -> tuple[float, float] | None:
    if geom_point is None:
        return None
    try:
        shape = to_shape(geom_point)
        if isinstance(shape, Point):
            return (shape.x, shape.y)
    except Exception:  # noqa: BLE001
        return None
    return None


def _linestring_coords(geom_route: Any) -> list[tuple[float, float]]:
    if geom_route is None:
        return []
    try:
        shape = to_shape(geom_route)
        if isinstance(shape, LineString):
            return [(x, y) for x, y, *_ in shape.coords]
    except Exception:  # noqa: BLE001
        return []
    return []


def _render_placemark(
    *,
    name: str,
    style_url: str,
    geometry_kml: str,
    description_html: str | None = None,
) -> str:
    desc = f"<description><![CDATA[{description_html}]]></description>" if description_html else ""
    return (
        f"    <Placemark>\n"
        f"      <name>{xml_escape(name)}</name>\n"
        f"      <styleUrl>{style_url}</styleUrl>\n"
        f"      {desc}\n"
        f"      {geometry_kml}\n"
        f"    </Placemark>\n"
    )


async def _collect_assets(db: AsyncSession, entity_id: UUID) -> dict[str, list]:
    installations = (
        await db.execute(
            select(Installation).where(Installation.entity_id == entity_id, Installation.archived == False)  # noqa: E712
        )
    ).scalars().all()
    wells = (
        await db.execute(
            select(RegistryEquipment).where(
                RegistryEquipment.entity_id == entity_id,
                RegistryEquipment.archived == False,  # noqa: E712
                RegistryEquipment.equipment_class == "WELL",
            )
        )
    ).scalars().all()
    pipelines = (
        await db.execute(
            select(RegistryPipeline).where(
                RegistryPipeline.entity_id == entity_id,
                RegistryPipeline.archived == False,  # noqa: E712
            )
        )
    ).scalars().all()
    fields = (
        await db.execute(
            select(OilField).where(OilField.entity_id == entity_id, OilField.archived == False)  # noqa: E712
        )
    ).scalars().all()
    sites = (
        await db.execute(
            select(OilSite).where(OilSite.entity_id == entity_id, OilSite.archived == False)  # noqa: E712
        )
    ).scalars().all()
    return {
        "fields": list(fields),
        "sites": list(sites),
        "installations": list(installations),
        "wells": list(wells),
        "pipelines": list(pipelines),
    }


async def build_kmz(db: AsyncSession, entity_id: UUID, title: str = "OpsFlux — Asset Registry") -> bytes:
    """
    Build a KMZ archive bytes-in-memory from the entity's registry.
    Returns zipped KML (ready to send as application/vnd.google-earth.kmz).
    """
    buckets = await _collect_assets(db, entity_id)

    platforms_kml: list[str] = []
    for inst in buckets["installations"]:
        coord = _point_coord(inst.geom_point)
        if coord is None and inst.latitude and inst.longitude:
            coord = (float(inst.longitude), float(inst.latitude))
        if coord is None:
            continue
        lon, lat = coord
        geom = f"<Point><coordinates>{lon},{lat},0</coordinates></Point>"
        desc = _attr_table([
            ("Code", inst.code),
            ("Type", inst.installation_type),
            ("Environment", inst.environment),
            ("Water depth (m)", inst.water_depth_m),
            ("Status", inst.status),
        ])
        platforms_kml.append(_render_placemark(
            name=inst.name,
            style_url="#stylePlatform",
            geometry_kml=geom,
            description_html=desc,
        ))

    wells_kml: list[str] = []
    for well in buckets["wells"]:
        coord = _point_coord(well.geom_point)
        if coord is None and well.latitude and well.longitude:
            coord = (float(well.longitude), float(well.latitude))
        if coord is None:
            continue
        lon, lat = coord
        geom = f"<Point><coordinates>{lon},{lat},0</coordinates></Point>"
        desc = _attr_table([
            ("Tag", well.tag_number),
            ("Class", well.equipment_class),
            ("Status", well.status),
            ("Manufacturer", getattr(well, "manufacturer", None)),
        ])
        wells_kml.append(_render_placemark(
            name=well.name or well.tag_number,
            style_url="#styleWell",
            geometry_kml=geom,
            description_html=desc,
        ))

    pipelines_kml: list[str] = []
    for pipe in buckets["pipelines"]:
        coords = _linestring_coords(pipe.geom_route)
        if not coords:
            continue
        coord_str = " ".join(f"{lon},{lat},0" for lon, lat in coords)
        geom = f"<LineString><coordinates>{coord_str}</coordinates></LineString>"
        desc = _attr_table([
            ("Pipeline ID", pipe.pipeline_id),
            ("Service", pipe.service),
            ("Diameter (in)", pipe.nominal_diameter_in),
            ("Length (km)", pipe.total_length_km),
            ("Status", pipe.status),
        ])
        pipelines_kml.append(_render_placemark(
            name=pipe.name,
            style_url=_style_for_pipeline(pipe.service),
            geometry_kml=geom,
            description_html=desc,
        ))

    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2">\n'
        f'<Document>\n  <name>{xml_escape(title)}</name>\n'
        + _KML_STYLES
        + '  <Folder>\n    <name>Platforms &amp; Installations</name>\n'
        + "".join(platforms_kml)
        + "  </Folder>\n"
        + '  <Folder>\n    <name>Wells</name>\n'
        + "".join(wells_kml)
        + "  </Folder>\n"
        + '  <Folder>\n    <name>Pipelines</name>\n'
        + "".join(pipelines_kml)
        + "  </Folder>\n"
        + "</Document>\n</kml>\n"
    )

    # Zip into a KMZ.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", doc)
    return buf.getvalue()
