"""
Mobile form definitions — enrichment configs for auto-generated forms.

Each form is defined by:
  1. The Pydantic schema class (source of truth for types + validation)
  2. Enrichments (labels FR, UI hints, lookups, steps, conditional logic)

The form_engine.generate_form_definition() combines both automatically.
To add a new form: just add a new entry here — no mobile app update needed.
"""

from __future__ import annotations

from app.schemas.packlog import CargoRequestCreate
from app.schemas.paxlog import AdsCreate, MissionNoticeCreate
from app.services.mobile.form_engine import (
    build_portal_config,
    generate_form_definition,
)


# ══════════════════════════════════════════════════════════════════════════════
# FORM DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════


def get_ads_create_form() -> dict:
    """Avis de Séjour creation form."""
    return generate_form_definition(
        AdsCreate,
        form_id="ads_create",
        title="Nouvel Avis de Séjour",
        description="Créer une demande d'accès site pour du personnel.",
        submit_endpoint="/api/v1/paxlog/ads",
        submit_method="post",
        icon="user-check",
        module="paxlog",
        permission="paxlog.ads.create",
        steps=[
            {
                "id": "general",
                "title": "Informations générales",
                "description": "Type de visite et site d'accueil",
                "fields": [
                    "type", "site_entry_asset_id", "visit_category",
                    "visit_purpose", "project_id",
                ],
            },
            {
                "id": "dates",
                "title": "Dates et transport",
                "description": "Période de séjour et modalités de transport",
                "fields": [
                    "start_date", "end_date", "is_round_trip_no_overnight",
                    "outbound_transport_mode", "outbound_departure_base_id",
                    "outbound_notes",
                    "return_transport_mode", "return_departure_base_id",
                    "return_notes",
                ],
            },
            {
                "id": "pax",
                "title": "Personnel",
                "description": "Liste des personnes concernées",
                "fields": [
                    "pax_entries", "allowed_company_ids",
                ],
            },
            {
                "id": "documents",
                "title": "Pièces jointes",
                "description": "Ajoutez les documents justificatifs (passeports, autorisations, plan d'intervention, etc.)",
                "fields": ["photos", "signature"],
            },
        ],
        hidden_fields=["requester_id", "planner_activity_id"],
        virtual_fields={
            "photos": {
                "type": "photo",
                "label": "Documents & photos",
                "help_text": "Scans de passeports, autorisations, plans, etc.",
                "attachment_owner_type": "ads",
            },
            "signature": {
                "type": "signature",
                "label": "Signature du demandeur",
                "attachment_owner_type": "ads",
            },
        },
        enrichments={
            "type": {
                "label": "Type d'ADS",
                "options": [
                    {"value": "individual", "label": "Individuel"},
                    {"value": "team", "label": "Équipe"},
                ],
                "ui_width": "half",
            },
            "site_entry_asset_id": {
                "label": "Site d'accueil",
                "type": "lookup",
                "lookup_source": {
                    "entity": "assets",
                    "endpoint": "/api/v1/assets",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                },
                "placeholder": "Rechercher un site...",
            },
            "visit_category": {
                "label": "Catégorie de visite",
                "options": [
                    {"value": "project_work", "label": "Travaux projet"},
                    {"value": "maintenance", "label": "Maintenance"},
                    {"value": "inspection", "label": "Inspection"},
                    {"value": "visit", "label": "Visite"},
                    {"value": "permanent_ops", "label": "Opérations permanentes"},
                    {"value": "other", "label": "Autre"},
                ],
            },
            "visit_purpose": {
                "label": "Objet de la visite",
                "type": "textarea",
                "placeholder": "Décrivez le motif de la visite...",
            },
            "project_id": {
                "label": "Projet associé",
                "type": "lookup",
                "lookup_source": {
                    "entity": "projects",
                    "endpoint": "/api/v1/projets",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                },
                "placeholder": "Rechercher un projet...",
            },
            "start_date": {
                "label": "Date de début",
                "ui_width": "half",
            },
            "end_date": {
                "label": "Date de fin",
                "ui_width": "half",
            },
            "is_round_trip_no_overnight": {
                "label": "Aller-retour sans nuitée",
                "help_text": "Cochez si la visite se fait dans la journée sans hébergement.",
            },
            "outbound_transport_mode": {
                "label": "Transport aller",
                "type": "select",
                "options": [
                    {"value": "helicopter", "label": "Hélicoptère"},
                    {"value": "boat", "label": "Bateau"},
                    {"value": "road", "label": "Route"},
                    {"value": "other", "label": "Autre"},
                ],
                "ui_width": "half",
            },
            "outbound_departure_base_id": {
                "label": "Base de départ (aller)",
                "type": "lookup",
                "lookup_source": {
                    "entity": "assets",
                    "endpoint": "/api/v1/assets",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                    "filter": {"installation_type": "LOGISTICS_BASE"},
                },
                "ui_width": "half",
                "visible_when": {
                    "field": "outbound_transport_mode",
                    "op": "is_not_empty",
                },
            },
            "outbound_notes": {
                "label": "Notes transport aller",
                "visible_when": {
                    "field": "outbound_transport_mode",
                    "op": "is_not_empty",
                },
            },
            "return_transport_mode": {
                "label": "Transport retour",
                "type": "select",
                "options": [
                    {"value": "helicopter", "label": "Hélicoptère"},
                    {"value": "boat", "label": "Bateau"},
                    {"value": "road", "label": "Route"},
                    {"value": "other", "label": "Autre"},
                ],
                "ui_width": "half",
            },
            "return_departure_base_id": {
                "label": "Base de départ (retour)",
                "type": "lookup",
                "lookup_source": {
                    "entity": "assets",
                    "endpoint": "/api/v1/assets",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                    "filter": {"installation_type": "LOGISTICS_BASE"},
                },
                "ui_width": "half",
                "visible_when": {
                    "field": "return_transport_mode",
                    "op": "is_not_empty",
                },
            },
            "return_notes": {
                "label": "Notes transport retour",
                "visible_when": {
                    "field": "return_transport_mode",
                    "op": "is_not_empty",
                },
            },
            "pax_entries": {
                "label": "Personnel à embarquer",
                "type": "repeater",
                "item_enrichments": {
                    "user_id": {
                        "label": "Utilisateur OpsFlux",
                        "type": "lookup",
                        "lookup_source": {
                            "entity": "users",
                            "endpoint": "/api/v1/users",
                            "display": "display_name",
                            "value": "id",
                            "search_param": "search",
                        },
                    },
                    "contact_id": {
                        "label": "Contact tiers",
                        "type": "lookup",
                        "lookup_source": {
                            "entity": "tier_contacts",
                            "endpoint": "/api/v1/tiers/contacts",
                            "display": "display_name",
                            "value": "id",
                            "search_param": "search",
                        },
                    },
                },
            },
            "allowed_company_ids": {
                "label": "Sociétés autorisées",
                "type": "multi_lookup",
                "lookup_source": {
                    "entity": "tiers",
                    "endpoint": "/api/v1/tiers",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                    "filter": {"tier_type": "company"},
                },
            },
        },
    )


def get_cargo_request_create_form() -> dict:
    """Cargo / expedition request creation form."""
    return generate_form_definition(
        CargoRequestCreate,
        form_id="cargo_request_create",
        title="Demande d'expédition",
        description="Créer une nouvelle demande d'envoi de colis ou matériel.",
        submit_endpoint="/api/v1/packlog/cargo-requests",
        submit_method="post",
        icon="package",
        module="packlog",
        permission="packlog.cargo.create",
        steps=[
            {
                "id": "general",
                "title": "Description",
                "description": "Décrivez l'expédition demandée",
                "fields": ["title", "description", "project_id", "imputation_reference_id"],
            },
            {
                "id": "parties",
                "title": "Expéditeur et destinataire",
                "description": "Qui envoie et qui reçoit",
                "fields": [
                    "sender_tier_id", "sender_contact_tier_contact_id",
                    "requester_user_id", "requester_name",
                    "receiver_name", "destination_asset_id",
                ],
            },
            {
                "id": "cargos",
                "title": "Colis à expédier",
                "description": "Ajoutez les colis concernés par cette demande",
                "fields": ["cargos"],
            },
            {
                "id": "documents",
                "title": "Photos & documents",
                "description": "Photos des colis, bons de livraison, autorisations de transport",
                "fields": ["photos"],
            },
        ],
        virtual_fields={
            "photos": {
                "type": "photo",
                "label": "Photos des colis (avant expédition)",
                "help_text": "Preuve de l'état des colis avant envoi — utile en cas de litige.",
                "attachment_owner_type": "cargo_request",
            },
        },
        enrichments={
            "title": {
                "label": "Titre de la demande",
                "placeholder": "Ex: Envoi de pièces de rechange pompe P-301",
            },
            "description": {
                "label": "Description détaillée",
                "type": "textarea",
                "placeholder": "Détails de l'expédition, urgence, contraintes...",
            },
            "project_id": {
                "label": "Projet",
                "type": "lookup",
                "lookup_source": {
                    "entity": "projects",
                    "endpoint": "/api/v1/projets",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                },
            },
            "imputation_reference_id": {
                "label": "Référence d'imputation",
                "type": "lookup",
                "lookup_source": {
                    "entity": "imputation_references",
                    "endpoint": "/api/v1/imputations/references",
                    "display": "code",
                    "value": "id",
                    "search_param": "search",
                },
            },
            "sender_tier_id": {
                "label": "Société expéditrice",
                "type": "lookup",
                "lookup_source": {
                    "entity": "tiers",
                    "endpoint": "/api/v1/tiers",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                },
                "ui_width": "half",
            },
            "sender_contact_tier_contact_id": {
                "label": "Contact expéditeur",
                "type": "lookup",
                "lookup_source": {
                    "entity": "tier_contacts",
                    "endpoint": "/api/v1/tiers/contacts",
                    "display": "display_name",
                    "value": "id",
                    "search_param": "search",
                },
                "ui_width": "half",
                "visible_when": {
                    "field": "sender_tier_id",
                    "op": "is_not_empty",
                },
            },
            "requester_user_id": {
                "label": "Demandeur (utilisateur)",
                "type": "lookup",
                "lookup_source": {
                    "entity": "users",
                    "endpoint": "/api/v1/users",
                    "display": "display_name",
                    "value": "id",
                    "search_param": "search",
                },
                "ui_width": "half",
            },
            "requester_name": {
                "label": "Nom du demandeur (externe)",
                "placeholder": "Si le demandeur n'est pas un utilisateur",
                "ui_width": "half",
                "visible_when": {
                    "field": "requester_user_id",
                    "op": "is_empty",
                },
            },
            "receiver_name": {
                "label": "Nom du destinataire",
                "placeholder": "Personne ou service destinataire",
                "ui_width": "half",
            },
            "destination_asset_id": {
                "label": "Site de destination",
                "type": "lookup",
                "lookup_source": {
                    "entity": "assets",
                    "endpoint": "/api/v1/assets",
                    "display": "name",
                    "value": "id",
                    "search_param": "search",
                },
                "ui_width": "half",
            },
            "cargos": {
                "label": "Colis",
                "type": "repeater",
                "help_text": "Listez les colis à expédier. Poids en kg, dimensions en cm.",
                "item_enrichments": {
                    "description": {
                        "label": "Description du colis",
                        "placeholder": "Ex: Carton de filtres P-301",
                    },
                    "cargo_type": {
                        "label": "Type",
                        "options": [
                            {"value": "unit",       "label": "Unité"},
                            {"value": "bulk",       "label": "Vrac"},
                            {"value": "consumable", "label": "Consommable"},
                            {"value": "packaging",  "label": "Emballage"},
                            {"value": "waste",      "label": "Déchet"},
                            {"value": "hazmat",     "label": "Matière dangereuse"},
                        ],
                    },
                    "weight_kg": {
                        "label": "Poids (kg)",
                        "placeholder": "0.0",
                    },
                    "designation": {
                        "label": "Désignation SAP (optionnel)",
                    },
                    "package_count": {
                        "label": "Nombre de colis",
                    },
                    "width_cm": {
                        "label": "Largeur (cm)",
                    },
                    "length_cm": {
                        "label": "Longueur (cm)",
                    },
                    "height_cm": {
                        "label": "Hauteur (cm)",
                    },
                    "stackable": {
                        "label": "Gerbable",
                    },
                    "sap_article_code": {
                        "label": "Code article SAP",
                    },
                    "hazmat_validated": {
                        "label": "Matière dangereuse validée",
                    },
                },
            },
        },
    )


def get_mission_notice_create_form() -> dict:
    """Mission notice creation form."""
    return generate_form_definition(
        MissionNoticeCreate,
        form_id="mission_notice_create",
        title="Demande de mission",
        description="Créer un nouvel avis de mission pour du personnel.",
        submit_endpoint="/api/v1/paxlog/mission-notices",
        submit_method="post",
        icon="briefcase",
        module="paxlog",
        permission="paxlog.avm.create",
        steps=[
            {
                "id": "general",
                "title": "Informations mission",
                "description": "Décrivez la mission",
                "fields": [
                    "title", "description", "mission_type",
                    "planned_start_date", "planned_end_date", "pax_quota",
                ],
            },
            {
                "id": "requirements",
                "title": "Exigences",
                "description": "Badge, EPI, visa et indemnités",
                "fields": [
                    "requires_badge", "requires_epi", "requires_visa",
                    "eligible_displacement_allowance",
                    "epi_measurements",
                ],
            },
            {
                "id": "documents",
                "title": "Documents requis",
                "description": "Pièces jointes attendues",
                "fields": [
                    "global_attachments_config",
                    "per_pax_attachments_config",
                ],
            },
            {
                "id": "attachments",
                "title": "Pièces jointes",
                "description": "Ajoutez les documents scannés ou photos",
                "fields": ["photos"],
            },
        ],
        hidden_fields=["programs"],
        virtual_fields={
            "photos": {
                "type": "photo",
                "label": "Documents & photos",
                "help_text": "Plan de prévention, SIMOPS, attestations, etc.",
                "attachment_owner_type": "mission_notice",
            },
        },
        enrichments={
            "title": {
                "label": "Titre de la mission",
                "placeholder": "Ex: Inspection annuelle vannes platform Alpha",
            },
            "description": {
                "label": "Description",
                "type": "textarea",
                "placeholder": "Détails de la mission, objectifs, contraintes...",
            },
            "mission_type": {
                "label": "Type de mission",
                "options": [
                    {"value": "standard", "label": "Standard"},
                    {"value": "vip", "label": "VIP"},
                    {"value": "regulatory", "label": "Réglementaire"},
                    {"value": "emergency", "label": "Urgence"},
                ],
            },
            "planned_start_date": {
                "label": "Date de début prévue",
                "ui_width": "half",
            },
            "planned_end_date": {
                "label": "Date de fin prévue",
                "ui_width": "half",
            },
            "pax_quota": {
                "label": "Nombre de personnes",
                "help_text": "Nombre maximum de participants à la mission",
                "ui_width": "half",
            },
            "requires_badge": {
                "label": "Badge requis",
                "ui_width": "half",
            },
            "requires_epi": {
                "label": "EPI requis",
                "help_text": "Équipement de Protection Individuelle",
                "ui_width": "half",
            },
            "requires_visa": {
                "label": "Visa requis",
                "ui_width": "half",
            },
            "eligible_displacement_allowance": {
                "label": "Indemnité de déplacement",
                "ui_width": "half",
            },
            "epi_measurements": {
                "label": "Mensurations EPI",
                "type": "group",
                "visible_when": {
                    "field": "requires_epi",
                    "op": "eq",
                    "value": True,
                },
            },
            "global_attachments_config": {
                "label": "Documents globaux requis",
                "type": "tags",
                "help_text": "Types de documents à joindre à la mission",
                "placeholder": "Ex: Plan de prévention, SIMOPS...",
            },
            "per_pax_attachments_config": {
                "label": "Documents par participant",
                "type": "tags",
                "help_text": "Documents que chaque participant doit fournir",
                "placeholder": "Ex: Certificat médical, Habilitation...",
            },
        },
    )


# ══════════════════════════════════════════════════════════════════════════════
# PORTAL DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════


def get_portal_definitions() -> list[dict]:
    """Return all portal configs for the mobile app — role-based landing pages."""
    return [
        build_portal_config(
            portal_id="logistics",
            title="Portail Logisticien",
            description="Gestion des colis, expéditions et réceptions",
            icon="truck",
            permissions=["packlog.cargo.read"],
            actions=[
                {"id": "scan_cargo", "type": "scan", "title": "Scanner un colis", "icon": "scan", "screen": "ScanCargo"},
                {"id": "create_cargo_request", "type": "form", "title": "Nouvelle expédition", "icon": "package-plus", "form_id": "cargo_request_create"},
                {"id": "cargo_list", "type": "list", "title": "Liste des colis", "icon": "list", "screen": "CargoList"},
                {"id": "pending_reception", "type": "list", "title": "Réceptions en attente", "icon": "inbox", "screen": "CargoList", "params": {"status": "in_transit"}},
            ],
            quick_scans=[
                {"type": "barcode", "label": "Scan colis", "target": "ScanCargo"},
            ],
            dashboard_cards=[
                {"type": "stat", "title": "Colis en transit", "endpoint": "/api/v1/packlog/cargo", "params": {"status": "in_transit"}, "display": "total"},
                {"type": "stat", "title": "En attente réception", "endpoint": "/api/v1/packlog/cargo", "params": {"status": "delivered_final"}, "display": "total"},
            ],
        ),
        build_portal_config(
            portal_id="captain",
            title="Portail Capitaine",
            description="Gestion des voyages, manifestes et embarquement",
            icon="anchor",
            permissions=["travelwiz.boarding.manage"],
            actions=[
                {"id": "scan_ads", "type": "scan", "title": "Scanner QR ADS", "icon": "qr-code", "screen": "ScanAds"},
                {"id": "captain_auth", "type": "screen", "title": "Accès code voyage", "icon": "key", "screen": "CaptainAuth"},
                {"id": "ads_list", "type": "list", "title": "ADS en cours", "icon": "users", "screen": "AdsList"},
            ],
            quick_scans=[
                {"type": "qr", "label": "Scan ADS boarding", "target": "ScanAds"},
            ],
            dashboard_cards=[
                {"type": "stat", "title": "ADS actifs", "endpoint": "/api/v1/paxlog/ads", "params": {"status": "approved"}, "display": "total"},
            ],
        ),
        build_portal_config(
            portal_id="site_manager",
            title="Portail Responsable Site",
            description="Validation ADS, conformité, suivi POB",
            icon="building-2",
            permissions=["paxlog.ads.approve"],
            actions=[
                {"id": "scan_ads", "type": "scan", "title": "Scanner QR ADS", "icon": "qr-code", "screen": "ScanAds"},
                {"id": "ads_validation", "type": "list", "title": "ADS à valider", "icon": "check-circle", "screen": "AdsList", "params": {"status": "pending_validation"}},
                {"id": "create_ads", "type": "form", "title": "Créer un ADS", "icon": "user-plus", "form_id": "ads_create"},
                {"id": "ads_list", "type": "list", "title": "Tous les ADS", "icon": "list", "screen": "AdsList"},
            ],
            quick_scans=[
                {"type": "qr", "label": "Scan ADS", "target": "ScanAds"},
            ],
        ),
        build_portal_config(
            portal_id="driver",
            title="Portail Chauffeur",
            description="Ramassage pax, itinéraire et suivi en temps réel",
            icon="car",
            permissions=["travelwiz.boarding.manage"],
            actions=[
                {"id": "driver_pickup", "type": "screen", "title": "Mode Ramassage", "icon": "navigation", "screen": "DriverPickup"},
                {"id": "captain_auth", "type": "screen", "title": "Accès code rotation", "icon": "key", "screen": "CaptainAuth"},
                {"id": "live_tracking", "type": "screen", "title": "Suivi GPS", "icon": "map-pin", "screen": "LiveTracking"},
            ],
            quick_scans=[
                {"type": "qr", "label": "Scan passager", "target": "ScanAds"},
            ],
        ),
        build_portal_config(
            portal_id="requester",
            title="Portail Demandeur",
            description="Créer et suivre vos demandes",
            icon="file-edit",
            role_slugs=["user"],
            actions=[
                {"id": "create_ads", "type": "form", "title": "Nouvel ADS", "icon": "user-plus", "form_id": "ads_create"},
                {"id": "create_cargo_request", "type": "form", "title": "Demande d'expédition", "icon": "package-plus", "form_id": "cargo_request_create"},
                {"id": "create_mission", "type": "form", "title": "Demande de mission", "icon": "briefcase", "form_id": "mission_notice_create"},
                {"id": "my_ads", "type": "list", "title": "Mes ADS", "icon": "list", "screen": "AdsList", "params": {"scope": "mine"}},
                {"id": "scan_cargo", "type": "scan", "title": "Suivre un colis", "icon": "scan", "screen": "ScanCargo"},
            ],
        ),
    ]


# ══════════════════════════════════════════════════════════════════════════════
# REGISTRY — all forms in one place
# ══════════════════════════════════════════════════════════════════════════════


def get_all_form_definitions() -> list[dict]:
    """Return all mobile form definitions."""
    return [
        get_ads_create_form(),
        get_cargo_request_create_form(),
        get_mission_notice_create_form(),
    ]
