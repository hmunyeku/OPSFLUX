"""Curated supplier audit templates derived from real field audit reports."""

from copy import deepcopy


CHOICE_COMPLIANCE = {
    "choices": [
        {"value": "conforme", "label": "Conforme", "score": 100},
        {"value": "a_completer", "label": "A completer", "score": 50},
        {"value": "non_conforme", "label": "Non conforme", "score": 0},
        {"value": "na", "label": "Non applicable", "score": None},
    ]
}

CHOICE_YES_NO_NA = {
    "choices": [
        {"value": "oui", "label": "Oui", "score": 100},
        {"value": "partiel", "label": "Partiel", "score": 50},
        {"value": "non", "label": "Non", "score": 0},
        {"value": "na", "label": "NA", "score": None},
    ]
}

SCORE_0_3 = {
    "min": 0,
    "max": 3,
    "labels": {
        "0": "Absent / non maitrise",
        "1": "Faible",
        "2": "Satisfaisant",
        "3": "Maitrise",
    },
}


def _question(
    code: str,
    text: str,
    *,
    response_type: str = "choice",
    weight: float = 1,
    required: bool = True,
    attachment_required: bool = False,
    options_json: dict | None = None,
) -> dict:
    return {
        "code": code,
        "text": text,
        "response_type": response_type,
        "weight": weight,
        "required": required,
        "attachment_required": attachment_required,
        "options_json": options_json,
    }


AUDIT_TEMPLATE_PRESETS: list[dict] = [
    {
        "code": "CIS-AUDIT-ADMIN",
        "name": "Audit administratif fournisseur",
        "audit_type": "Administratif",
        "target_scope": "company",
        "description": (
            "Grille inspiree du rapport administratif CIS 2026. Controle les pieces legales, "
            "fiscales, sociales, assurances, dispositifs medicaux et urgence. "
            "Seuils conseilles: 90+ privilegie, 75-89 qualifie, 60-74 sous surveillance, <60 bloque."
        ),
        "passing_score": 80,
        "validity_days": 365,
        "themes": [
            {
                "title": "Existence legale et gouvernance",
                "description": "Pieces constitutives et pouvoir de representation.",
                "weight": 1.2,
                "questions": [
                    _question("ADM-01", "Statuts de la societe disponibles et a jour", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-02", "Autorisation ou agrement d'exercice applicable disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-03", "Organigramme et effectif communiques", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-04", "Declaration notariee de souscription ou document equivalent disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-05", "Identite du dirigeant et pouvoir de signature verifies", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                ],
            },
            {
                "title": "Situation fiscale et sociale",
                "description": "Conformite des immatriculations et quitus.",
                "weight": 1.3,
                "questions": [
                    _question("ADM-06", "Registre commerce, NIU ou immatriculation fiscale valides", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-07", "Attestation de conformite fiscale valide", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-08", "Quitus CNPS ou equivalent social valide", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-09", "Rapport commissaire aux comptes ou etats financiers disponibles", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-10", "Domiciliation bancaire ou RIB fournisseur verifie", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-11", "Certificat de non faillite ou document equivalent disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                ],
            },
            {
                "title": "Assurances, sites et urgence",
                "description": "Capacite operationnelle, assurance et dispositifs de secours.",
                "weight": 1.1,
                "questions": [
                    _question("ADM-12", "Assurance responsabilite civile professionnelle valide", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-13", "Plan de localisation ou preuve d'adresse du site disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-14", "Titre de propriete, bail ou quittance de loyer disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-15", "Convention ou partenariat medical disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-16", "Procedure ou contrat EVASAN disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-17", "Contrat ambulance ou solution de transport medical disponible", attachment_required=True, options_json=CHOICE_COMPLIANCE),
                    _question("ADM-18", "Commentaires et reserves administratives documentes", response_type="text", weight=0.5, required=False),
                ],
            },
        ],
    },
    {
        "code": "CIS-AUDIT-HSE",
        "name": "Audit HSE entreprises contractees",
        "audit_type": "HSE",
        "target_scope": "company",
        "description": (
            "Grille inspiree de l'audit HSE CIS 2026, alignee ISO 14001:2015 et ISO 45001:2018. "
            "Seuils conseilles: >=90 excellent, >=75 tres bon, >=65 bon, >=50 moyen, <50 non qualifie."
        ),
        "passing_score": 75,
        "validity_days": 365,
        "themes": [
            {
                "title": "Politique et objectifs HSE",
                "weight": 1.2,
                "questions": [
                    _question("HSE-01", "Politique HSE formalisee, signee et diffusee", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-02", "Objectifs HSE annuels definis et suivis", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-03", "Indicateurs HSE communiques au management", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-04", "Revue de direction HSE realisee", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "Analyse des risques et permis de travail",
                "weight": 1.4,
                "questions": [
                    _question("HSE-05", "Analyse de risques documentee pour les activites auditees", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-06", "Maitrise des permis de travail et consignations", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-07", "Sensibilisation aux risques majeurs et PTW realisee", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-08", "Plan de prevention ou PPSPS disponible si applicable", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "Formation et habilitations",
                "weight": 1.3,
                "questions": [
                    _question("HSE-09", "Plan de formation HSE disponible", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-10", "Habilitations sites client / PERENCO suivies", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-11", "Formations metier critiques documentees", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-12", "Accueil securite des nouveaux arrivants trace", options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "Environnement et dechets",
                "weight": 1.1,
                "questions": [
                    _question("HSE-13", "Tri, stockage et elimination des dechets maitrises", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-14", "Gestion des produits dangereux et FDS disponible", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-15", "Mesures de prevention pollution documentees", options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "Incidents, audits et actions",
                "weight": 1.3,
                "questions": [
                    _question("HSE-16", "Registre incidents, presqu'accidents et actions disponible", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-17", "Analyse des incidents et retour d'experience formalises", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-18", "Audits ou inspections HSE internes realises", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-19", "Plan d'actions HSE suivi jusqu'a cloture", options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "Urgence et assistance medicale",
                "weight": 1.2,
                "questions": [
                    _question("HSE-20", "Plan d'urgence disponible et teste", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-21", "Moyens de premiers secours disponibles", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-22", "Organisation d'assistance medicale definie", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-23", "Contacts d'urgence affiches et accessibles", options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "EPI et equipements de securite",
                "weight": 1.2,
                "questions": [
                    _question("HSE-24", "EPI adaptes aux risques et disponibles", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-25", "Controle periodique des EPI critiques realise", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-26", "Equipements incendie disponibles et controles", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                ],
            },
            {
                "title": "Transport, levage et energies",
                "weight": 1.4,
                "questions": [
                    _question("HSE-27", "Transport terrestre maitrise: vehicules, conducteurs, controles", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-28", "Plan de levage et habilitations associees disponibles", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-29", "Maitrise des energies: consignation, electricite, pression", options_json=CHOICE_YES_NO_NA),
                    _question("HSE-30", "Controle des outillages et machines realise", attachment_required=True, options_json=CHOICE_YES_NO_NA),
                    _question("HSE-31", "Organisation HSE sur site claire et connue", options_json=CHOICE_YES_NO_NA),
                ],
            },
        ],
    },
    {
        "code": "CIS-AUDIT-METIER",
        "name": "Audit technique prestataire projets",
        "audit_type": "Metier",
        "target_scope": "company",
        "description": (
            "Grille inspiree de l'audit technique CIS 2026 pour prestataires projets. "
            "Notation 0 a 3 avec coefficients. Seuils conseilles: <20 elimine, <40 petits travaux, "
            "<60 moyens travaux, >=60 grands travaux."
        ),
        "passing_score": 60,
        "validity_days": 365,
        "themes": [
            {
                "title": "Experience et references",
                "weight": 1.2,
                "questions": [
                    _question("MET-01", "References projets comparables documentees", response_type="score", weight=3, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-02", "Experience du secteur industriel / oil & gas demontree", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-03", "Retours clients ou attestations de bonne execution disponibles", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                ],
            },
            {
                "title": "Organisation et pilotage",
                "weight": 1.2,
                "questions": [
                    _question("MET-04", "Organisation projet et responsabilites definies", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-05", "Planification et suivi d'avancement maitrises", response_type="score", weight=3, options_json=SCORE_0_3),
                    _question("MET-06", "Gestion documentaire et tracabilite des livrables maitrisee", response_type="score", weight=2, options_json=SCORE_0_3),
                    _question("MET-07", "Capacite de reporting et coordination chantier", response_type="score", weight=2, options_json=SCORE_0_3),
                ],
            },
            {
                "title": "Procedures, QMOS et controles",
                "weight": 1.4,
                "questions": [
                    _question("MET-08", "Procedures metier applicables formalisees", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-09", "QMOS / qualifications soudeurs ou equivalents disponibles", response_type="score", weight=3, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-10", "Plan de controle qualite et ITP disponible", response_type="score", weight=3, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-11", "Gestion des non-conformites et actions correctives maitrisee", response_type="score", weight=2, options_json=SCORE_0_3),
                ],
            },
            {
                "title": "Normes et conformite technique",
                "weight": 1.1,
                "questions": [
                    _question("MET-12", "Normes et codes applicables identifies", response_type="score", weight=2, options_json=SCORE_0_3),
                    _question("MET-13", "Personnel cle sensibilise aux exigences normatives", response_type="score", weight=2, options_json=SCORE_0_3),
                    _question("MET-14", "Dossiers de fin d'affaire et certificats geres", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                ],
            },
            {
                "title": "Installations et atelier",
                "weight": 1.1,
                "questions": [
                    _question("MET-15", "Atelier ou base operationnelle adaptes aux travaux", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-16", "Zones de stockage et preservation materiel maitrisees", response_type="score", weight=2, options_json=SCORE_0_3),
                    _question("MET-17", "Moyens de manutention disponibles et controles", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                ],
            },
            {
                "title": "Matériels et équipements",
                "weight": 1.3,
                "questions": [
                    _question("MET-18", "Liste des equipements critiques disponible", response_type="score", weight=2, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-19", "Etalonnage et maintenance des equipements suivis", response_type="score", weight=3, attachment_required=True, options_json=SCORE_0_3),
                    _question("MET-20", "Disponibilite des consommables et pieces critiques maitrisee", response_type="score", weight=2, options_json=SCORE_0_3),
                ],
            },
        ],
    },
]


def list_audit_template_presets() -> list[dict]:
    return deepcopy(AUDIT_TEMPLATE_PRESETS)


def get_audit_template_preset(code: str) -> dict | None:
    normalized = code.strip().upper()
    for preset in AUDIT_TEMPLATE_PRESETS:
        if preset["code"] == normalized:
            return deepcopy(preset)
    return None
