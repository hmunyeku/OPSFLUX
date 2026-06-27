"""Service MTO — import catalogue/stock/MTO, consolidation, rapprochement, validation.

Branche le moteur de calcul (app/modules/mto/engine/, pur Python + pandas) sur la
persistance SQLAlchemy async. Tout est scope par entity_id (multi-tenant).

Le moteur fait l'intelligence (normalisation FR<->EN, parsing d'attributs, conversion
d'unites, matching par filetage/diametre, consolidation par item) ; ce service ne fait
que charger les fichiers, persister les lignes et relire la base pour reconsolider.
"""

from __future__ import annotations

from uuid import UUID

import pandas as pd
from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mto import (
    MtoConsolidatedGroup,
    MtoImportBatch,
    MtoRequirement,
    MtoValidationRecord,
    SapCatalogItem,
    SapInventory,
    SapItemAlias,
)
from app.modules.mto.engine.catalogue import finalize_catalogue, load_catalogue
from app.modules.mto.engine.consolidate import consolidate
from app.modules.mto.engine.io_loaders import (
    finalize_mto,
    finalize_stock,
    list_mto_sheets,
    load_mto_mapped,
    load_sap,
    read_sheet_columns,
    suggest_mapping,
)
from app.modules.mto.engine.matching import build_sap_index


def _s(value) -> str | None:
    """Nettoie une cellule pandas -> str | None (gere NaN)."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none", "nat"):
        return None
    return text


def _num(value) -> float:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return 0.0
    return x if x == x else 0.0  # NaN -> 0


_CAT_FIELDS = ("designation_long", "unite_base", "groupe", "hier_pdt_desc",
               "fabricant", "ref_fabricant", "subst_ca", "famille", "diametre")


# --------------------------------------------------------------------------- #
# Imports (etat complet, idempotent par entite)
# --------------------------------------------------------------------------- #
async def import_catalogue(db: AsyncSession, entity_id: UUID, path: str) -> int:
    """Importe le catalogue SAP (remplace l'existant de l'entite)."""
    df = finalize_catalogue(load_catalogue(path))
    objs = []
    for r in df.to_dict("records"):
        code = _s(r.get("article"))
        if not code:
            continue
        item = {"entity_id": entity_id, "code": code,
                "designation": (_s(r.get("designation")) or "")[:500]}
        for f in _CAT_FIELDS:
            item[f] = _s(r.get(f))
        objs.append(item)
    await db.execute(delete(SapCatalogItem).where(SapCatalogItem.entity_id == entity_id))
    for i in range(0, len(objs), 2000):
        await db.execute(insert(SapCatalogItem), objs[i:i + 2000])
    await db.commit()
    return len(objs)


async def import_stock(db: AsyncSession, entity_id: UUID, path: str, label: str = "") -> int:
    """Importe le stock SAP (export mensuel = etat complet ; remplace l'existant)."""
    df = finalize_stock(load_sap(path))
    objs = []
    for r in df.to_dict("records"):
        code = _s(r.get("code") or r.get("article"))
        if not code:
            continue
        objs.append({
            "entity_id": entity_id, "code": code, "label": label or "",
            "dispo": _num(r.get("stock_ul_hors_mort") or r.get("dispo")),
            "cde": _num(r.get("stock_cde") or r.get("cde")),
            "transit": _num(r.get("stock_transit") or r.get("transit")),
            "cq": _num(r.get("stock_cq") or r.get("cq")),
            "bloque": _num(r.get("stock_bloque") or r.get("bloque")),
            "magasin": _s(r.get("magasin")),
            "emplacement": _s(r.get("emplacement") or r.get("emplacements")),
        })
    await db.execute(delete(SapInventory).where(SapInventory.entity_id == entity_id))
    for i in range(0, len(objs), 2000):
        await db.execute(insert(SapInventory), objs[i:i + 2000])
    await db.commit()
    return len(objs)


async def import_mto(db: AsyncSession, entity_id: UUID, *, path: str,
                     project_id: UUID | None = None, filename: str = "",
                     label: str = "", created_by: UUID | None = None) -> MtoImportBatch:
    """Importe une liste MTO (.xlsx) -> 1 batch + N requirements (mapping auto-suggere)."""
    sheet = list_mto_sheets(path)[0]
    columns = read_sheet_columns(path, sheet)
    mapping = {k: v for k, v in suggest_mapping("mto", columns).items() if v}
    df = finalize_mto(load_mto_mapped(path, sheet, mapping))

    batch = MtoImportBatch(entity_id=entity_id, project_id=project_id,
                           filename=filename or None, label=label or None,
                           status="imported", created_by=created_by)
    db.add(batch)
    await db.flush()  # batch.id

    reqs = []
    for r in df.to_dict("records"):
        reqs.append({
            "entity_id": entity_id, "batch_id": batch.id,
            "row": int(_num(r.get("_row"))) or None,
            "line_num": _s(r.get("line_num")), "mark": _s(r.get("mark")),
            "tag": _s(r.get("tag")), "description": (_s(r.get("description")) or ""),
            "diameter": _s(r.get("diameter")), "spec": _s(r.get("spec")),
            "code_article": _s(r.get("code_article")),
            "total_qty": _num(r.get("total_qty")), "length": _num(r.get("length")),
        })
    for i in range(0, len(reqs), 2000):
        await db.execute(insert(MtoRequirement), reqs[i:i + 2000])
    await db.commit()
    await db.refresh(batch)
    return batch


# --------------------------------------------------------------------------- #
# Index SAP depuis la base (catalogue + stock agrege)
# --------------------------------------------------------------------------- #
async def _build_index(db: AsyncSession, entity_id: UUID):
    cat = (await db.execute(
        select(SapCatalogItem).where(SapCatalogItem.entity_id == entity_id)
    )).scalars().all()
    rows = [{
        "article": c.code, "designation": c.designation or "",
        "designation_long": c.designation_long or "", "unite_base": c.unite_base or "",
        "groupe": c.groupe or "", "hier_pdt_desc": c.hier_pdt_desc or "",
        "fabricant": c.fabricant or "", "ref_fabricant": c.ref_fabricant or "",
    } for c in cat]
    df = pd.DataFrame(rows, columns=["article", "designation", "designation_long",
                                     "unite_base", "groupe", "hier_pdt_desc",
                                     "fabricant", "ref_fabricant"])

    agg = (await db.execute(
        select(SapInventory.code,
               func.sum(SapInventory.dispo), func.sum(SapInventory.cde),
               func.sum(SapInventory.transit), func.sum(SapInventory.cq),
               func.sum(SapInventory.bloque))
        .where(SapInventory.entity_id == entity_id)
        .group_by(SapInventory.code)
    )).all()
    stock = {code: (d or 0, c or 0, t or 0, q or 0, b or 0) for code, d, c, t, q, b in agg}

    empl: dict[str, list[str]] = {}
    locs = (await db.execute(
        select(SapInventory.code, SapInventory.magasin, SapInventory.emplacement)
        .where(SapInventory.entity_id == entity_id)
    )).all()
    for code, mag, emp in locs:
        loc = "/".join(x for x in (mag, emp) if x)
        if loc:
            empl.setdefault(code, [])
            if loc not in empl[code]:
                empl[code].append(loc)

    if not df.empty:
        df["stock_ul_hors_mort"] = df["article"].map(lambda c: stock.get(c, (0,) * 5)[0])
        df["stock_cde"] = df["article"].map(lambda c: stock.get(c, (0,) * 5)[1])
        df["stock_transit"] = df["article"].map(lambda c: stock.get(c, (0,) * 5)[2])
        df["stock_cq"] = df["article"].map(lambda c: stock.get(c, (0,) * 5)[3])
        df["stock_bloque"] = df["article"].map(lambda c: stock.get(c, (0,) * 5)[4])
        df["emplacements"] = df["article"].map(lambda c: ", ".join(empl.get(c, [])))
    return build_sap_index(df)


async def _build_mem_db(db: AsyncSession, entity_id: UUID):
    """SQLite temporaire peuple depuis MtoValidationRecord + SapItemAlias pour le moteur."""
    import tempfile

    from app.modules.mto.engine import memory, normalize

    path = tempfile.mktemp(suffix=".sqlite")
    memory.init_db(path)
    for m in (await db.execute(
        select(MtoValidationRecord).where(MtoValidationRecord.entity_id == entity_id)
    )).scalars().all():
        memory.save_match(path, m.mto_key, m.article_code, m.source or "user")
    aliases = dict((a.source_term, a.target_term) for a in (await db.execute(
        select(SapItemAlias).where(SapItemAlias.entity_id == entity_id)
    )).scalars().all())
    normalize.set_learned_synonyms(aliases)
    return path


# --------------------------------------------------------------------------- #
# Consolidation + rapprochement
# --------------------------------------------------------------------------- #
async def consolidate_batch(db: AsyncSession, entity_id: UUID, batch_id: UUID) -> dict:
    """Consolide un batch MTO (groupes sommes par unite) + rapproche -> MtoConsolidatedGroup."""
    import os

    index = await _build_index(db, entity_id)
    mem_path = await _build_mem_db(db, entity_id)

    reqs = (await db.execute(
        select(MtoRequirement).where(MtoRequirement.batch_id == batch_id)
    )).scalars().all()
    rows = [{
        "description": r.description or "", "diameter": r.diameter or "",
        "code_article": r.code_article or "", "total_qty": r.total_qty, "length": r.length,
        "_row": r.row, "line_num": r.line_num or "", "mark": r.mark or "", "tag": r.tag or "",
    } for r in reqs]

    try:
        groups = consolidate(rows, index, mem_db=mem_path)
    finally:
        if os.path.exists(mem_path):
            os.remove(mem_path)

    await db.execute(delete(MtoConsolidatedGroup).where(MtoConsolidatedGroup.batch_id == batch_id))
    objs = []
    for g in groups:
        code = g.get("article") or ""
        objs.append({
            "entity_id": entity_id, "batch_id": batch_id,
            "mto_key": (g.get("mto_key") or "")[:500],
            "article_code": code[:50] or None,
            "designation_sap": (g.get("designation_sap") or "")[:500] or None,
            "source": (g.get("source") or "")[:20] or None,
            "score": _num(g.get("min_score")),
            "confidence": (g.get("confiance") or "")[:20] or None,
            "found": bool(g.get("found")),
            "famille": (g.get("famille") or "")[:30] or None,
            "diameter": (str(g.get("diameter") or ""))[:50] or None,
            "sum_qty": _num(g.get("sum_qty")), "sum_length": _num(g.get("sum_length")),
            "besoin": _num(g.get("besoin")), "unite": (str(g.get("unite") or ""))[:20] or None,
            "unit_check": bool(g.get("unit_check")),
            "unit_detail": (str(g.get("unit_detail") or ""))[:200] or None,
            "dispo": _num(g.get("dispo")), "cde": _num(g.get("cde")),
            "transit": _num(g.get("transit")), "cq": _num(g.get("cq")), "bloque": _num(g.get("bloque")),
            "emplacements": (str(g.get("emplacements") or ""))[:200] or None,
            "statut": (g.get("statut") or "")[:20] or None,
            "nb_lignes": int(g.get("nb_lignes") or 0), "children": g.get("children") or [],
            "verification_status": "pending",
        })
    for i in range(0, len(objs), 1000):
        await db.execute(insert(MtoConsolidatedGroup), objs[i:i + 1000])
    await db.execute(
        MtoImportBatch.__table__.update()
        .where(MtoImportBatch.id == batch_id).values(status="consolidated")
    )
    await db.commit()
    return {"batch_id": str(batch_id), "lines": len(rows), "groups": len(objs),
            "found": sum(1 for o in objs if o["found"])}


# --------------------------------------------------------------------------- #
# Validation & apprentissage
# --------------------------------------------------------------------------- #
async def _remember(db: AsyncSession, group: MtoConsolidatedGroup, user_id: UUID | None) -> None:
    if not (group.mto_key and group.article_code):
        return
    existing = (await db.execute(
        select(MtoValidationRecord).where(
            MtoValidationRecord.entity_id == group.entity_id,
            MtoValidationRecord.mto_key == group.mto_key,
        )
    )).scalar_one_or_none()
    if existing:
        existing.article_code = group.article_code
        existing.source = "user"
        existing.validated_by = user_id
    else:
        db.add(MtoValidationRecord(
            entity_id=group.entity_id, mto_key=group.mto_key,
            article_code=group.article_code, source="user", validated_by=user_id))


async def validate_group(db: AsyncSession, group: MtoConsolidatedGroup,
                         user_id: UUID | None) -> MtoConsolidatedGroup:
    """Fige le rapprochement (verified) + memorise (mto_key -> article)."""
    group.verification_status = "verified"
    group.verified_by = user_id
    group.confidence = "Validé"
    await _remember(db, group, user_id)
    await db.commit()
    await db.refresh(group)
    return group


async def correct_group(db: AsyncSession, group: MtoConsolidatedGroup,
                        article_code: str, user_id: UUID | None) -> MtoConsolidatedGroup:
    """Impose un autre article, recalcule le stock + memorise."""
    article = (await db.execute(
        select(SapCatalogItem).where(
            SapCatalogItem.entity_id == group.entity_id,
            SapCatalogItem.code == article_code,
        )
    )).scalar_one_or_none()
    if article is None:
        raise ValueError("Article introuvable dans le catalogue")

    agg = (await db.execute(
        select(func.sum(SapInventory.dispo)).where(
            SapInventory.entity_id == group.entity_id, SapInventory.code == article_code)
    )).scalar() or 0
    group.sap_item_id = article.id
    group.article_code = article_code
    group.designation_sap = (article.designation or "")[:500]
    group.found = True
    group.dispo = float(agg)
    group.statut = ("en stock" if agg > 0 and agg >= group.besoin
                    else ("partiel" if agg > 0 else "à commander"))
    group.verification_status = "verified"
    group.verified_by = user_id
    group.confidence = "Validé"
    await _remember(db, group, user_id)
    await db.commit()
    await db.refresh(group)
    return group
