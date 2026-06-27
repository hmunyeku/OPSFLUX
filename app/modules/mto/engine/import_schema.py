"""Champs attendus par type d'import (stock / catalogue / MTO).

Sert au wizard d'import (liste des champs a mapper, requis vs optionnel) et a
l'auto-mapping (pre-remplissage). Les cles canoniques sont celles que consomment
les etapes suivantes (build_sap_index, consolidate...).
"""

# (cle_canonique, libelle affiche, requis)
STOCK_FIELDS = [
    ("article", "Code article", True),
    ("stock_ul_hors_mort", "Stock disponible (UL)", True),
    ("designation", "Désignation", False),
    ("unite", "Unité", False),
    ("stock_cq", "Contrôle qualité", False),
    ("stock_transit", "En transit", False),
    ("stock_bloque", "Bloqué", False),
    ("mag", "Magasin", False),
    ("emplacement", "Emplacement", False),
    ("fabricant", "Fabricant", False),
    ("ref_fabricant", "Réf. fabricant", False),
]

CATALOGUE_FIELDS = [
    ("article", "Code article", True),
    ("designation", "Désignation", True),
    ("unite_base", "Unité de base", False),
    ("designation_long", "Texte de commande", False),
    ("groupe", "Groupe marchandises", False),
    ("fabricant", "Fabricant", False),
    ("ref_fabricant", "Réf. fabricant (NPF)", False),
]

MTO_FIELDS = [
    ("description", "Description", True),
    ("total_qty", "Quantité", True),
    ("diameter", "Diamètre", False),
    ("spec", "Spécification / classe", False),
    ("code_article", "Code article", False),
    ("line_num", "N° de ligne (iso)", False),
    ("mark", "Repère", False),
    ("tag", "Tag / équipement", False),
    ("length", "Longueur", False),
]

SCHEMAS = {"stock": STOCK_FIELDS, "catalogue": CATALOGUE_FIELDS, "mto": MTO_FIELDS}


def fields(kind):
    """Liste [(cle, libelle, requis)] des champs du type d'import donne."""
    return SCHEMAS[kind]


def required_fields(kind):
    """Cles canoniques des champs obligatoires (bloquent l'import si non mappes)."""
    return [k for k, _label, req in SCHEMAS[kind] if req]


def field_labels(kind):
    """{cle: libelle} pour l'affichage."""
    return {k: label for k, label, _req in SCHEMAS[kind]}
