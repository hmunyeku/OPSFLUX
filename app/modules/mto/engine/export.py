import io
import pandas as pd


def _attrs(g):
    p = g.get("pressure")
    return {
        "Ø": g.get("diameter") or "",
        "Classe": (f"{int(float(p))} lb" if p else ""),
        "Sch": g.get("schedule") or "",
        "Matière": g.get("material") or "",
    }


def build_export_frames(groups):
    """Decompose les groupes consolides en (a_sortir, a_commander, synthese).

    - a_sortir   : articles disponibles (dispo UL > 0) -> a prelever = min(besoin, dispo)
    - a_commander: il manque (besoin > dispo) -> a commander = besoin - dispo, avec
                   reference fabricant + code article si trouve (sinon 'Non identifie')
    """
    sortir, commander, synth = [], [], []
    for g in groups:
        sr = g.get("sap_row") or {}
        children = g.get("children") or []
        desc_mto = children[0]["description"] if children else ""
        lignes = " ; ".join(c.get("line_num", "") for c in children if c.get("line_num"))
        tags = " ; ".join(sorted({c.get("tag", "") for c in children if c.get("tag")}))
        besoin = g.get("besoin", 0) or 0
        dispo = g.get("dispo", 0) or 0
        a = _attrs(g)

        synth.append({
            "Code article": g.get("article") or "", "Désignation SAP": g.get("designation_sap") or "",
            "Désignation MTO": desc_mto, **a, "Besoin": besoin, "Unité": g.get("unite"),
            "Dispo UL": dispo, "Commande": g.get("cde", 0), "Transit": g.get("transit", 0),
            "Confiance": g.get("confiance"), "Statut": g.get("statut"), "Lignes MTO": lignes,
        })
        if dispo > 0:
            sortir.append({
                "Code article": g.get("article") or "", "Désignation SAP": g.get("designation_sap") or "",
                **a, "À prélever": min(besoin, dispo), "Unité": g.get("unite"), "Dispo UL": dispo,
                "Magasin / emplacement": g.get("emplacements") or "",
                "Tag": tags, "Lignes MTO": lignes, "Confiance": g.get("confiance"),
            })
        manque = besoin - dispo
        if manque > 0:
            commander.append({
                "Code article": g.get("article") or "", "Désignation": g.get("designation_sap") or desc_mto,
                "Réf. fabricant": sr.get("ref_fabricant") or "", "Fabricant": sr.get("fabricant") or "",
                **a, "À commander": manque, "Unité": g.get("unite"),
                "Déjà commandé": g.get("cde", 0), "Transit": g.get("transit", 0),
                "Confiance": g.get("confiance") if g.get("found") else "Non identifié",
            })
    return pd.DataFrame(sortir), pd.DataFrame(commander), pd.DataFrame(synth)


def export_bytes(groups):
    """Classeur Excel en memoire : Synthese + A sortir du stock + A commander."""
    a_sortir, a_commander, synth = build_export_frames(groups)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        synth.to_excel(writer, sheet_name="Synthèse", index=False)
        a_sortir.to_excel(writer, sheet_name="À sortir du stock", index=False)
        a_commander.to_excel(writer, sheet_name="À commander", index=False)
    return buf.getvalue()
