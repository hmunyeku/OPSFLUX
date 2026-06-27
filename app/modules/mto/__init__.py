"""MTO module manifest — rapprochement MTO <-> catalogue/stock SAP.

Importe une liste de besoins (MTO), la consolide (regroupement par item + somme
par unite), la rapproche du catalogue/stock SAP (code -> memoire -> fuzzy ->
attributs + filetage), puis permet la validation humaine avec apprentissage.

Moteur de calcul : app/modules/mto/engine/ (normalize, parsing, units, matching,
consolidate, dedup) — pur Python, repris du projet MTOGuru, teste en isolation.
"""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="mto",
    name="MTOGuru",
    version="1.0.0",
    permissions=[
        "mto.catalogue.read",
        "mto.catalogue.import",
        "mto.stock.read",
        "mto.stock.import",
        "mto.requirement.read",
        "mto.requirement.import",
        "mto.requirement.create",
        "mto.requirement.update",
        "mto.requirement.delete",
        "mto.matching.read",
        "mto.matching.run",
        "mto.matching.validate",
        "mto.matching.correct",
        "mto.alias.manage",
        "mto.export",
        "mto.admin",
    ],
    routes_prefix="/api/v1/mto",
)
