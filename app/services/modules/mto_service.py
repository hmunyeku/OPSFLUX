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
    MtoConsumption,
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
from app.schemas.mto import BatchStatsRead


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
                     label: str = "", role: str = "design",
                     created_by: UUID | None = None) -> MtoImportBatch:
    """Importe une liste MTO (.xlsx) -> 1 batch + N requirements (mapping auto-suggere)."""
    sheet = list_mto_sheets(path)[0]
    columns = read_sheet_columns(path, sheet)
    mapping = {k: v for k, v in suggest_mapping("mto", columns).items() if v}
    df = finalize_mto(load_mto_mapped(path, sheet, mapping))

    batch = MtoImportBatch(entity_id=entity_id, project_id=project_id,
                           filename=filename or None, label=label or None,
                           role=role or "design", status="imported", created_by=created_by)
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
# Stats batches (couverture par projet) — agrege, sans N+1
# --------------------------------------------------------------------------- #
async def get_batch_stats(db: AsyncSession, entity_id: UUID,
                          project_id: UUID | None = None) -> list[BatchStatsRead]:
    """Liste les batches MTO de l'entite avec leur couverture (lignes/groupes/trouves).

    Tout est scope par entity_id. 4 requetes agregees au total (pas de N+1) :
    batches, lignes/batch, groupes/(batch,statut), trouves/batch.
    """
    from app.models.common import Project

    query = (
        select(MtoImportBatch, Project.name)
        .outerjoin(Project, Project.id == MtoImportBatch.project_id)
        .where(MtoImportBatch.entity_id == entity_id)
        .order_by(MtoImportBatch.created_at.desc())
    )
    if project_id:
        query = query.where(MtoImportBatch.project_id == project_id)
    rows = (await db.execute(query)).all()
    if not rows:
        return []

    ids = [batch.id for batch, _ in rows]

    lignes = dict((await db.execute(
        select(MtoRequirement.batch_id, func.count())
        .where(MtoRequirement.entity_id == entity_id, MtoRequirement.batch_id.in_(ids))
        .group_by(MtoRequirement.batch_id)
    )).all())

    couverture: dict[UUID, dict[str, int]] = {}
    groupes: dict[UUID, int] = {}
    for batch_id, statut, count in (await db.execute(
        select(MtoConsolidatedGroup.batch_id, MtoConsolidatedGroup.statut, func.count())
        .where(MtoConsolidatedGroup.entity_id == entity_id,
               MtoConsolidatedGroup.batch_id.in_(ids))
        .group_by(MtoConsolidatedGroup.batch_id, MtoConsolidatedGroup.statut)
    )).all():
        couverture.setdefault(batch_id, {})[statut or "?"] = count
        groupes[batch_id] = groupes.get(batch_id, 0) + count

    trouves = dict((await db.execute(
        select(MtoConsolidatedGroup.batch_id, func.count())
        .where(MtoConsolidatedGroup.entity_id == entity_id,
               MtoConsolidatedGroup.batch_id.in_(ids),
               MtoConsolidatedGroup.found.is_(True))
        .group_by(MtoConsolidatedGroup.batch_id)
    )).all())

    out: list[BatchStatsRead] = []
    for batch, project_name in rows:
        r = BatchStatsRead.model_validate(batch)
        r.project_name = project_name
        r.nb_lignes = lignes.get(batch.id, 0)
        r.nb_groupes = groupes.get(batch.id, 0)
        r.nb_trouves = trouves.get(batch.id, 0)
        r.couverture = couverture.get(batch.id, {})
        out.append(r)
    return out


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
# Croisement de 2 MTO (P1) — design vs revise
# --------------------------------------------------------------------------- #
def _diff_designation(g: MtoConsolidatedGroup) -> str:
    """Libelle d'affichage d'un groupe : designation_sap sinon 1re description child."""
    if g.designation_sap:
        return g.designation_sap
    for child in (g.children or []):
        desc = (child or {}).get("description")
        if desc:
            return str(desc)
    return ""


async def compute_mto_diff(db: AsyncSession, entity_id: UUID,
                           design_batch_id: UUID, revise_batch_id: UUID) -> dict:
    """Croise les groupes consolides de 2 batches MTO (design vs revise) par mto_key.

    Tout est scope par entity_id. Compare le besoin de chaque item :
    - cle presente des 2 cotes : besoin egal -> unchanged, sinon changed
    - cle design seule -> removed ; cle revise seule -> added
    Retourne {design_batch_id, revise_batch_id, summary, items}.
    """
    async def _load(batch_id: UUID) -> dict[str, MtoConsolidatedGroup]:
        rows = (await db.execute(
            select(MtoConsolidatedGroup).where(
                MtoConsolidatedGroup.entity_id == entity_id,
                MtoConsolidatedGroup.batch_id == batch_id,
            )
        )).scalars().all()
        return {g.mto_key: g for g in rows}

    design = await _load(design_batch_id)
    revise = await _load(revise_batch_id)

    summary = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
    items: list[dict] = []
    for key in sorted(set(design) | set(revise)):
        dg = design.get(key)
        rg = revise.get(key)
        besoin_design = _num(dg.besoin) if dg is not None else 0.0
        besoin_revise = _num(rg.besoin) if rg is not None else 0.0
        if dg is not None and rg is not None:
            change_type = "unchanged" if besoin_design == besoin_revise else "changed"
        elif dg is not None:
            change_type = "removed"
        else:
            change_type = "added"
        summary[change_type] += 1

        ref = rg if rg is not None else dg  # cote present pour les attributs d'affichage
        items.append({
            "mto_key": key,
            "designation": _diff_designation(ref),
            "diameter": ref.diameter,
            "unite": ref.unite,
            "besoin_design": besoin_design,
            "besoin_revise": besoin_revise,
            "delta": besoin_revise - besoin_design,
            "change_type": change_type,
        })

    return {
        "design_batch_id": design_batch_id,
        "revise_batch_id": revise_batch_id,
        "summary": summary,
        "items": items,
    }


# --------------------------------------------------------------------------- #
# Export Excel metier (reutilise le moteur app/modules/mto/engine/export.py)
# --------------------------------------------------------------------------- #
async def export_batch_xlsx(db: AsyncSession, entity_id: UUID, batch_id: UUID) -> bytes:
    """Classeur Excel (Synthese / A sortir du stock / A commander) d'un batch consolide.

    Recharge les MtoConsolidatedGroup persistes (entity-scope, comme list_groups), les
    remappe vers le dict attendu par engine.export.build_export_frames/export_bytes, puis
    delegue la mise en forme au moteur. On ne reconsolide pas : on relit la base.

    Note : pressure/schedule/material ne sont pas persistes par consolidate_batch (ils ne
    vivent qu'en memoire pendant la consolidation), donc les colonnes Classe/Sch/Matiere
    sortent vides. ref_fabricant/fabricant sont re-resolus depuis le catalogue par
    article_code (sap_row reconstruit) pour alimenter la feuille "A commander".
    """
    from app.modules.mto.engine.export import export_bytes

    groups = (await db.execute(
        select(MtoConsolidatedGroup)
        .where(MtoConsolidatedGroup.entity_id == entity_id,
               MtoConsolidatedGroup.batch_id == batch_id)
        .order_by(MtoConsolidatedGroup.besoin.desc())
    )).scalars().all()

    # ref/fabricant ne sont pas stockes sur le groupe -> 1 lookup catalogue par code present
    codes = {g.article_code for g in groups if g.article_code}
    cat: dict[str, SapCatalogItem] = {}
    if codes:
        cat = {c.code: c for c in (await db.execute(
            select(SapCatalogItem).where(
                SapCatalogItem.entity_id == entity_id, SapCatalogItem.code.in_(codes))
        )).scalars().all()}

    payload = []
    for g in groups:
        item = cat.get(g.article_code or "")
        payload.append({
            "article": g.article_code or "",
            "designation_sap": g.designation_sap or "",
            "sap_row": {
                "ref_fabricant": (item.ref_fabricant if item else "") or "",
                "fabricant": (item.fabricant if item else "") or "",
            },
            "children": g.children or [],
            "besoin": g.besoin, "unite": g.unite,
            "dispo": g.dispo, "cde": g.cde, "transit": g.transit,
            "emplacements": g.emplacements or "",
            "diameter": g.diameter or "",
            "pressure": None, "schedule": None, "material": None,  # non persistes a la conso
            "confiance": g.confidence, "statut": g.statut, "found": g.found,
        })
    return export_bytes(payload)


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


# --------------------------------------------------------------------------- #
# Reconciliation P4 — commande/fourni vs consomme -> reliquat a retourner
# --------------------------------------------------------------------------- #
_CONSO_CODE_KEYS = ("code", "article", "réf", "ref", "matériel", "material")
_CONSO_QTE_KEYS = ("qte", "quantité", "quantite", "consomm", "consumed", "used", "qty")
_CONSO_DESIGN_KEYS = ("désignation", "designation", "description", "libellé", "libelle")


def _detect_column(columns, keywords) -> str | None:
    """1re colonne dont le nom (insensible a la casse) contient un des mots-cles."""
    for col in columns:
        name = str(col).strip().lower()
        if any(kw in name for kw in keywords):
            return col
    return None


async def import_consumption(db: AsyncSession, entity_id: UUID, path: str,
                             project_id: UUID, batch_id: UUID | None = None,
                             created_by: UUID | None = None) -> int:
    """Importe un fichier de consommation reelle (.xlsx) -> N MtoConsumption.

    Detecte les colonnes code/qte/designation par mots-cles (insensible a la casse).
    Une ligne par article ; ignore les lignes sans code ou sans quantite. Bulk insert.
    Retourne le nombre de lignes inserees.
    """
    df = pd.read_excel(path)
    code_col = _detect_column(df.columns, _CONSO_CODE_KEYS)
    qte_col = _detect_column(df.columns, _CONSO_QTE_KEYS)
    design_col = _detect_column(df.columns, _CONSO_DESIGN_KEYS)
    if code_col is None or qte_col is None:
        return 0

    objs = []
    for r in df.to_dict("records"):
        code = _s(r.get(code_col))
        if not code:
            continue
        qte = _num(r.get(qte_col))
        if qte == 0:
            continue
        objs.append({
            "entity_id": entity_id, "project_id": project_id, "batch_id": batch_id,
            "code_article": code[:50],
            "designation": (_s(r.get(design_col)) if design_col else None),
            "qte": qte, "created_by": created_by,
        })
    for i in range(0, len(objs), 2000):
        await db.execute(insert(MtoConsumption), objs[i:i + 2000])
    await db.commit()
    return len(objs)


async def reconcile_batch(db: AsyncSession, entity_id: UUID, batch_id: UUID) -> dict:
    """Rapproche besoin/commande consolide vs consommation reelle d'un batch.

    Agrege les groupes consolides PAR article_code (besoin=Σbesoin, a_commander=Σmax(besoin-dispo,0))
    et la consommation PAR code_article (consomme=Σqte). Union des codes -> a_retourner =
    max(besoin - consomme, 0) (reliquat a retourner a PERENCO). Tout est scope par entity_id.
    """
    batch = (await db.execute(
        select(MtoImportBatch).where(
            MtoImportBatch.id == batch_id, MtoImportBatch.entity_id == entity_id)
    )).scalar_one_or_none()
    project_id = batch.project_id if batch is not None else None

    # 1. besoin / a_commander agreges par article_code (depuis les groupes consolides)
    groups = (await db.execute(
        select(MtoConsolidatedGroup).where(
            MtoConsolidatedGroup.entity_id == entity_id,
            MtoConsolidatedGroup.batch_id == batch_id,
        )
    )).scalars().all()
    besoins: dict[str, dict] = {}
    for g in groups:
        code = (g.article_code or "").strip()
        if not code:
            continue
        agg = besoins.setdefault(
            code, {"besoin": 0.0, "a_commander": 0.0, "designation": None})
        agg["besoin"] += _num(g.besoin)
        agg["a_commander"] += max(_num(g.besoin) - _num(g.dispo), 0.0)
        if not agg["designation"] and g.designation_sap:
            agg["designation"] = g.designation_sap

    # 2. consomme agrege par code_article (batch direct OU conso libre du meme projet)
    conso_filter = MtoConsumption.batch_id == batch_id
    if project_id is not None:
        conso_filter = conso_filter | (
            MtoConsumption.batch_id.is_(None) & (MtoConsumption.project_id == project_id))
    consos = (await db.execute(
        select(MtoConsumption).where(
            MtoConsumption.entity_id == entity_id, conso_filter)
    )).scalars().all()
    consommes: dict[str, dict] = {}
    for c in consos:
        code = (c.code_article or "").strip()
        if not code:
            continue
        agg = consommes.setdefault(code, {"consomme": 0.0, "designation": None})
        agg["consomme"] += _num(c.qte)
        if not agg["designation"] and c.designation:
            agg["designation"] = c.designation

    # 3. union des codes -> items + reliquat
    items: list[dict] = []
    total_a_retourner = total_consomme = total_besoin = 0.0
    for code in sorted(set(besoins) | set(consommes)):
        b = besoins.get(code, {})
        cons = consommes.get(code, {})
        besoin = float(b.get("besoin", 0.0))
        a_commander = float(b.get("a_commander", 0.0))
        consomme = float(cons.get("consomme", 0.0))
        a_retourner = max(besoin - consomme, 0.0)
        items.append({
            "code_article": code,
            "designation": b.get("designation") or cons.get("designation"),
            "besoin": besoin,
            "a_commander": a_commander,
            "consomme": consomme,
            "a_retourner": a_retourner,
        })
        total_besoin += besoin
        total_consomme += consomme
        total_a_retourner += a_retourner

    return {
        "batch_id": batch_id,
        "summary": {
            "lines": len(items),
            "total_a_retourner": total_a_retourner,
            "total_consomme": total_consomme,
            "total_besoin": total_besoin,
        },
        "items": items,
    }


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
