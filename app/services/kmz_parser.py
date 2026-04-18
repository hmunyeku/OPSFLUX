"""
KMZ parser for asset registry imports.

Parses KMZ (zipped KML) files containing offshore O&G infrastructure maps
and extracts structured records for installations, wells, pipelines and cables.

The parser is defensive: it tolerates unknown folder structures, missing
attributes and mixed geometry types. It does NOT write to the database — it
returns structured dicts that an import service can then commit.

Typical KMZ schema (from MASTER_MAP_CAMEROON-RDR):
  - doc.kml
  - Layer0_Symbol_*.png (icons)
  - Folder id="FeatureLayer0"  Bathy depth points        (skipped)
  - Folder id="FeatureLayer1"  Bathy isobaths (lines)    (skipped — map overlay only)
  - Folder id="FeatureLayer2"  Pipelines (LineString)    → pipelines[]
  - Folder id="FeatureLayer3"  Cables (LineString)       → cables[]
  - Folder id="FeatureLayer4"  Structure details         (skipped — CAD decor)
  - Folder id="FeatureLayer5"  Wells (Point)             → wells[]
  - Folder id="FeatureLayer6"  Platforms (Point)         → platforms[]

Each placemark's <description> block is an HTML table of attributes; the
parser extracts the key/value pairs into a dict alongside the geometry.
"""
from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from lxml import etree  # type: ignore[import-untyped]


KML_NS = "{http://www.opengis.net/kml/2.2}"

# Folder-name substrings used to classify layers — robust against exact naming.
_CLASSIFY_RULES: list[tuple[str, str]] = [
    ("pipeline", "pipelines"),
    ("cable", "cables"),
    ("well", "wells"),
    ("platform", "platforms"),
    ("platforme", "platforms"),
    ("plateform", "platforms"),
    ("structure", "structures"),
    ("bathy", "bathymetry"),
]


def _classify(folder_name: str) -> str:
    name = (folder_name or "").lower()
    for substr, category in _CLASSIFY_RULES:
        if substr in name:
            return category
    return "other"


def _extract_kml_bytes(kmz_bytes: bytes) -> bytes:
    """Return the raw KML bytes from a KMZ archive. Tolerates any KML filename."""
    with zipfile.ZipFile(io.BytesIO(kmz_bytes)) as zf:
        # Prefer doc.kml, then body.kml, then any *.kml.
        names = zf.namelist()
        for candidate in ("doc.kml", "body.kml"):
            if candidate in names:
                return zf.read(candidate)
        for name in names:
            if name.lower().endswith(".kml"):
                return zf.read(name)
    raise ValueError("No .kml file found in KMZ archive")


_ATTR_ROW_RE = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>([^<]+)</td>\s*<td[^>]*>([^<]*)</td>\s*</tr>",
    re.IGNORECASE | re.DOTALL,
)


def _parse_description_attrs(description: str | None) -> dict[str, str]:
    """
    Description elements in ArcGIS-exported KML contain an HTML table with
    attribute rows in the form:

        <tr><td>KEY</td><td>VALUE</td></tr>

    Extract those into a flat dict. Values are stripped; empty values become "".
    """
    if not description:
        return {}
    result: dict[str, str] = {}
    for key, value in _ATTR_ROW_RE.findall(description):
        key = key.strip()
        if not key or "style" in key.lower():
            continue
        result[key] = value.strip()
    return result


def _parse_coordinates(coord_text: str | None) -> list[tuple[float, float]]:
    """
    Parse a KML <coordinates> text block into (lon, lat) tuples.
    Altitude is ignored. Returns [] for empty/unparseable input.
    """
    if not coord_text:
        return []
    pts: list[tuple[float, float]] = []
    for raw in coord_text.strip().split():
        parts = raw.split(",")
        if len(parts) < 2:
            continue
        try:
            lon = float(parts[0])
            lat = float(parts[1])
        except ValueError:
            continue
        pts.append((lon, lat))
    return pts


def _find_geometry(placemark: etree._Element) -> tuple[str, list[tuple[float, float]]] | None:
    """
    Inspect a <Placemark> and return its geometry as ("Point"/"LineString"/"Polygon",
    coordinates). Returns None if no supported geometry is present.
    """
    # Point
    pt = placemark.find(f"{KML_NS}Point/{KML_NS}coordinates")
    if pt is not None:
        coords = _parse_coordinates(pt.text)
        if coords:
            return ("Point", [coords[0]])

    # LineString
    ls = placemark.find(f"{KML_NS}LineString/{KML_NS}coordinates")
    if ls is not None:
        coords = _parse_coordinates(ls.text)
        if coords:
            return ("LineString", coords)

    # MultiGeometry — pick first LineString/Point
    mg = placemark.find(f"{KML_NS}MultiGeometry")
    if mg is not None:
        for child in mg:
            tag = child.tag.split("}")[-1]
            if tag in ("LineString", "Point"):
                coord_el = child.find(f"{KML_NS}coordinates")
                if coord_el is not None:
                    coords = _parse_coordinates(coord_el.text)
                    if coords:
                        return (tag, coords if tag == "LineString" else [coords[0]])

    # Polygon — outer boundary only
    poly = placemark.find(
        f"{KML_NS}Polygon/{KML_NS}outerBoundaryIs/{KML_NS}LinearRing/{KML_NS}coordinates"
    )
    if poly is not None:
        coords = _parse_coordinates(poly.text)
        if coords:
            return ("Polygon", coords)

    return None


# ── Pipeline name parsing ──────────────────────────────────────────────

_PIPELINE_NAME_RE = re.compile(
    r"^(?P<size>\d+(?:\.\d+)?)IN[_ -](?P<fluid>[A-Z]+)[_ -](?P<from>[A-Z0-9-]+)[_ -](?P<to>[A-Z0-9-]+)",
    re.IGNORECASE,
)


def parse_pipeline_name(name: str) -> dict[str, str | float | None]:
    """
    Extract diameter / fluid / from / to from canonical pipeline names
    like "12IN_OIL_DIF-1_ASP-1" or "10IN_MULTIPHASE_AKF-1_ACF-2".
    Returns all-None dict on failure.
    """
    if not name:
        return {"diameter_in": None, "fluid": None, "from_tag": None, "to_tag": None}
    m = _PIPELINE_NAME_RE.match(name.strip())
    if not m:
        return {"diameter_in": None, "fluid": None, "from_tag": None, "to_tag": None}
    try:
        diameter = float(m.group("size"))
    except ValueError:
        diameter = None
    return {
        "diameter_in": diameter,
        "fluid": m.group("fluid").upper(),
        "from_tag": m.group("from").upper(),
        "to_tag": m.group("to").upper(),
    }


# ── Main parser ────────────────────────────────────────────────────────

def parse_kmz(kmz_bytes: bytes) -> dict[str, Any]:
    """
    Parse a KMZ file and classify placemarks into asset categories.

    Returns a dict with the shape:
        {
          "source": {
            "document_name": str,
            "folder_count": int,
            "placemark_count": int,
          },
          "platforms":   [{"name", "attributes", "coordinates", "kml_id"}],
          "wells":       [...],
          "pipelines":   [...],
          "cables":      [...],
          "structures":  [...],
          "bathymetry":  [...] (summary only — count, bbox),
          "other":       [...]
        }
    """
    kml_bytes = _extract_kml_bytes(kmz_bytes)
    # Strip BOM if any, then parse with recover mode so minor XML quirks
    # (common in exports from ArcGIS) don't abort the whole parse.
    parser = etree.XMLParser(recover=True, huge_tree=True)
    try:
        root = etree.fromstring(kml_bytes, parser=parser)
    except etree.XMLSyntaxError as exc:
        raise ValueError(f"Invalid KML: {exc}") from exc

    if root is None:
        raise ValueError("Empty KML document")

    doc = root.find(f"{KML_NS}Document")
    doc_name_el = doc.find(f"{KML_NS}name") if doc is not None else None
    document_name = (doc_name_el.text or "").strip() if doc_name_el is not None else ""

    buckets: dict[str, list[dict[str, Any]]] = {
        "platforms": [],
        "wells": [],
        "pipelines": [],
        "cables": [],
        "structures": [],
        "bathymetry": [],
        "other": [],
    }

    folder_count = 0
    placemark_count = 0

    # Iterate through every Folder at any depth.
    for folder in root.iter(f"{KML_NS}Folder"):
        folder_count += 1
        folder_name_el = folder.find(f"{KML_NS}name")
        folder_name = (folder_name_el.text or "").strip() if folder_name_el is not None else ""
        category = _classify(folder_name)

        for placemark in folder.findall(f"{KML_NS}Placemark"):
            placemark_count += 1

            name_el = placemark.find(f"{KML_NS}name")
            name = (name_el.text or "").strip() if name_el is not None else ""

            desc_el = placemark.find(f"{KML_NS}description")
            description = desc_el.text if desc_el is not None else None
            attrs = _parse_description_attrs(description)

            geom = _find_geometry(placemark)
            if geom is None and category not in ("bathymetry", "other"):
                continue  # No usable geometry, skip for non-bathy layers

            kml_id = placemark.get("id") or ""

            record: dict[str, Any] = {
                "kml_id": kml_id,
                "name": name,
                "attributes": attrs,
                "folder": folder_name,
            }
            if geom is not None:
                record["geometry_type"] = geom[0]
                record["coordinates"] = geom[1]

            # Category-specific enrichment for pipelines.
            if category == "pipelines":
                parsed = parse_pipeline_name(name)
                record["parsed_name"] = parsed

            buckets[category].append(record)

    # Compact bathymetry output: keep only counts + a few samples, not all 11k points.
    bathy_full = buckets["bathymetry"]
    buckets["bathymetry"] = [
        {"count": len(bathy_full), "samples": bathy_full[:10]}
    ] if bathy_full else []

    return {
        "source": {
            "document_name": document_name,
            "folder_count": folder_count,
            "placemark_count": placemark_count,
        },
        "platforms": buckets["platforms"],
        "wells": buckets["wells"],
        "pipelines": buckets["pipelines"],
        "cables": buckets["cables"],
        "structures": buckets["structures"],
        "bathymetry": buckets["bathymetry"],
        "other": buckets["other"],
    }


def parse_kmz_preview(kmz_bytes: bytes) -> dict[str, Any]:
    """
    Return a lightweight preview suitable for an API response: counts, first
    N records per category, and detected attribute keys. Avoids returning the
    full 10k-line payload to the frontend.
    """
    full = parse_kmz(kmz_bytes)
    preview: dict[str, Any] = {"source": full["source"], "categories": {}}

    for category in ("platforms", "wells", "pipelines", "cables", "structures"):
        records = full[category]
        # Collect the union of attribute keys to expose the schema.
        attr_keys: set[str] = set()
        for rec in records:
            attr_keys.update(rec.get("attributes", {}).keys())
        preview["categories"][category] = {
            "count": len(records),
            "attribute_keys": sorted(attr_keys),
            "samples": records[:5],
        }

    preview["categories"]["bathymetry"] = {
        "count": full["bathymetry"][0]["count"] if full["bathymetry"] else 0,
        "note": "Bathymetry points are summarised — not imported as assets",
    }

    return preview
