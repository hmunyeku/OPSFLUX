"""TravelWiz module manifest — transport logistics: vectors, voyages, PAX manifests,
cargo tracking, deck planning, captain portal."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="travelwiz",
    name="TravelWiz",
    version="1.0.0",
    permissions=[
        # Vectors
        "travelwiz.vector.read",
        "travelwiz.vector.create",
        "travelwiz.vector.update",
        "travelwiz.vector.delete",
        # Voyages
        "travelwiz.voyage.read",
        "travelwiz.voyage.create",
        "travelwiz.voyage.update",
        "travelwiz.voyage.delete",
        "travelwiz.voyage.validate",
        # Manifests
        "travelwiz.manifest.read",
        "travelwiz.manifest.create",
        "travelwiz.manifest.validate",
        # Cargo
        "travelwiz.cargo.read",
        "travelwiz.cargo.create",
        "travelwiz.cargo.update",
        "travelwiz.cargo.receive",
        # Boarding / check-in
        "travelwiz.boarding.manage",
        # Deck planning
        "travelwiz.deck.manage",
        # Emergency
        "travelwiz.emergency.declare",
        # Pickup / shuttle
        "travelwiz.pickup.manage",
    ],
    roles=[
        {
            "code": "LOG_BASE",
            "name": "Logistique Base",
            "description": "Full transport logistics management",
            "permissions": [
                "travelwiz.vector.read", "travelwiz.vector.create", "travelwiz.vector.update",
                "travelwiz.voyage.read", "travelwiz.voyage.create", "travelwiz.voyage.update",
                "travelwiz.voyage.validate",
                "travelwiz.manifest.read", "travelwiz.manifest.create", "travelwiz.manifest.validate",
                "travelwiz.cargo.read", "travelwiz.cargo.create", "travelwiz.cargo.update", "travelwiz.cargo.receive",
                "travelwiz.boarding.manage", "travelwiz.deck.manage",
                "travelwiz.emergency.declare", "travelwiz.pickup.manage",
            ],
        },
        {
            "code": "TRANSP_COORD",
            "name": "Coordinateur Transport",
            "description": "Voyage planning and coordination",
            "permissions": [
                "travelwiz.vector.read", "travelwiz.vector.create", "travelwiz.vector.update",
                "travelwiz.voyage.read", "travelwiz.voyage.create", "travelwiz.voyage.update",
                "travelwiz.voyage.validate",
                "travelwiz.manifest.read", "travelwiz.manifest.create", "travelwiz.manifest.validate",
                "travelwiz.boarding.manage", "travelwiz.deck.manage",
                "travelwiz.emergency.declare", "travelwiz.pickup.manage",
            ],
        },
        {
            "code": "CAPITAINE",
            "name": "Capitaine",
            "description": "Captain portal: boarding, log, emergencies",
            "permissions": [
                "travelwiz.voyage.read",
                "travelwiz.manifest.read",
                "travelwiz.boarding.manage",
                "travelwiz.emergency.declare",
            ],
        },
        {
            "code": "OMAA",
            "name": "OMAA (Agent sur site)",
            "description": "On-site cargo reception and boarding",
            "permissions": [
                "travelwiz.voyage.read",
                "travelwiz.manifest.read",
                "travelwiz.cargo.read", "travelwiz.cargo.create", "travelwiz.cargo.receive",
                "travelwiz.boarding.manage",
                "travelwiz.emergency.declare",
            ],
        },
    ],
    routes_prefix="/api/v1/travelwiz",
)
