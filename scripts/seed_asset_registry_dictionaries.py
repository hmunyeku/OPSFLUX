"""Seed dictionary entries for Asset Registry module.

Run with: docker exec backend python -m scripts.seed_asset_registry_dictionaries
Or locally: python -m scripts.seed_asset_registry_dictionaries
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import async_session_maker
from app.models.common import DictionaryEntry


CATEGORIES = {
    "environment_type": [
        ("ONSHORE", "Onshore", 1),
        ("OFFSHORE", "Offshore", 2),
        ("SWAMP", "Marécage", 3),
        ("SHALLOW_WATER", "Eaux peu profondes", 4),
        ("DEEPWATER", "Eaux profondes", 5),
        ("SUBSEA", "Sous-marin", 6),
    ],
    "operational_status": [
        ("OPERATIONAL", "Opérationnel", 1),
        ("STANDBY", "En attente", 2),
        ("UNDER_CONSTRUCTION", "En construction", 3),
        ("SUSPENDED", "Suspendu", 4),
        ("DECOMMISSIONED", "Décommissionné", 5),
        ("ABANDONED", "Abandonné", 6),
    ],
    "site_type": [
        ("OFFSHORE_PLATFORM_COMPLEX", "Complexe plateforme offshore", 1),
        ("ONSHORE_TERMINAL", "Terminal onshore", 2),
        ("ONSHORE_FIELD_AREA", "Zone de champ onshore", 3),
        ("EXPORT_TERMINAL", "Terminal d'export", 4),
        ("LOGISTICS_BASE", "Base logistique", 5),
        ("SUBSEA_FIELD", "Champ sous-marin", 6),
    ],
    "installation_type": [
        ("FIXED_JACKET_PLATFORM", "Plateforme jacket fixe", 1),
        ("FIXED_CONCRETE_PLATFORM", "Plateforme béton fixe", 2),
        ("SEMI_SUBMERSIBLE", "Semi-submersible", 3),
        ("FPSO", "FPSO", 4),
        ("FSO", "FSO", 5),
        ("SPAR", "SPAR", 6),
        ("TLP", "TLP", 7),
        ("JACK_UP", "Jack-up", 8),
        ("WELLHEAD_BUOY", "Bouée tête de puits", 9),
        ("SUBSEA_TEMPLATE", "Template sous-marin", 10),
        ("FLARE_TOWER_OFFSHORE", "Tour de torche offshore", 11),
        ("RISER_PLATFORM", "Plateforme riser", 12),
        ("ONSHORE_WELL_PAD", "Pad de puits onshore", 20),
        ("ONSHORE_GATHERING_STATION", "Station de collecte", 21),
        ("ONSHORE_CPF", "CPF onshore", 22),
        ("ONSHORE_TERMINAL", "Terminal onshore", 23),
        ("ONSHORE_PUMPING_STATION", "Station de pompage", 24),
        ("ONSHORE_COMPRESSION_STATION", "Station de compression", 25),
        ("ONSHORE_METERING_STATION", "Station de comptage", 26),
        ("ONSHORE_PIG_STATION", "Station de raclage", 27),
        ("ONSHORE_STORAGE_TANK_FARM", "Parc de stockage", 28),
        ("ONSHORE_FLARE_SYSTEM", "Système de torche onshore", 29),
        ("ONSHORE_WATER_TREATMENT", "Traitement des eaux", 30),
        ("ONSHORE_POWER_PLANT", "Centrale électrique", 31),
        ("LOGISTICS_BASE", "Base logistique", 40),
        ("CAMP", "Camp", 41),
        ("HELIPAD", "Hélipad", 42),
        ("JETTY_PIER", "Jetée / Quai", 43),
    ],
    "equipment_class": [
        # Levage
        ("CRANE", "Grue", 1),
        ("HOIST", "Palan", 2),
        ("DAVIT", "Bossoir", 3),
        ("LIFTING_ACCESSORY", "Accessoire de levage", 4),
        # Séparation / Vessels
        ("SEPARATOR", "Séparateur", 10),
        ("PRESSURE_VESSEL", "Récipient sous pression", 11),
        ("PROCESS_COLUMN", "Colonne process", 12),
        ("STORAGE_TANK", "Bac de stockage", 13),
        ("FILTER", "Filtre", 14),
        # Machines rotatives
        ("PUMP", "Pompe", 20),
        ("GAS_COMPRESSOR", "Compresseur gaz", 21),
        ("AIR_COMPRESSOR", "Compresseur air", 22),
        ("GAS_TURBINE", "Turbine à gaz", 23),
        ("DIESEL_GENERATOR", "Groupe électrogène diesel", 24),
        ("STEAM_TURBINE", "Turbine à vapeur", 25),
        ("FAN_BLOWER", "Ventilateur / Soufflante", 26),
        ("TURBOEXPANDER", "Turboexpandeur", 27),
        # Thermique
        ("HEAT_EXCHANGER", "Échangeur de chaleur", 30),
        ("FIRED_HEATER", "Four / Réchauffeur", 31),
        # Safety
        ("PSV", "Soupape de sécurité (PSV)", 40),
        ("RUPTURE_DISK", "Disque de rupture", 41),
        ("ESD_SYSTEM", "Système ESD", 42),
        ("FIRE_GAS_SYSTEM", "Système Feu & Gaz", 43),
        ("FIRE_WATER_SYSTEM", "Système eau incendie", 44),
        ("FLARE_SYSTEM", "Système de torche", 45),
        # Instrumentation
        ("INSTRUMENT", "Instrument", 50),
        ("METERING_SKID", "Skid de comptage fiscal", 51),
        # Process spéciaux
        ("CHEMICAL_INJECTION", "Injection chimique", 60),
        ("GAS_DEHYDRATION", "Déshydratation gaz", 61),
        ("WATER_TREATMENT", "Traitement des eaux produites", 62),
        ("NITROGEN_UNIT", "Unité d'azote", 63),
        ("HPU", "Groupe hydraulique (HPU)", 64),
        # Utilities
        ("HVAC", "CVC (HVAC)", 70),
        ("UPS", "Onduleur (UPS)", 71),
        ("TELECOM", "Télécommunications", 72),
        # Électrique
        ("TRANSFORMER", "Transformateur", 80),
        ("SWITCHGEAR", "Tableau de distribution", 81),
        ("MCC", "Centre de commande moteur (MCC)", 82),
        # Tuyauterie / Piping
        ("PIPING_LINE", "Ligne de tuyauterie", 90),
        ("MANIFOLD", "Manifold / Collecteur", 91),
        ("PIG_STATION", "Station de raclage", 92),
        # Puits
        ("WELLHEAD", "Tête de puits", 100),
        ("DOWNHOLE_COMPLETION", "Complétion fond de puits", 101),
        # Subsea
        ("SUBSEA_XT", "Arbre de Noël sous-marin", 110),
        ("SUBSEA_UMBILICAL", "Ombilical sous-marin", 111),
        ("SUBSEA_PLEM_PLET", "PLEM / PLET", 112),
        ("RISER", "Riser", 113),
        ("SUBSEA_CONTROL_SYSTEM", "Contrôle sous-marin", 114),
        # Marine
        ("MARINE_LOADING_ARM", "Bras de chargement", 120),
        ("MOORING_SYSTEM", "Système d'amarrage", 121),
        ("SURVIVAL_CRAFT", "Embarcation de sauvetage", 122),
        # Civil / Structure
        ("BUILDING", "Bâtiment", 130),
        ("STRUCTURAL_ELEMENT", "Élément structural", 131),
        # Utilities eau
        ("POTABLE_WATER_SYSTEM", "Eau potable", 140),
        ("SEWAGE_SYSTEM", "Eaux usées", 141),
        ("COOLING_WATER_SYSTEM", "Eau de refroidissement", 142),
        ("DRAINAGE_SYSTEM", "Drainage", 143),
        # CP
        ("CATHODIC_PROTECTION", "Protection cathodique", 150),
        # Divers
        ("VEHICLE", "Véhicule", 160),
        ("PORTABLE_EQUIPMENT", "Équipement portable", 161),
    ],
    "pipeline_service": [
        ("EXPORT_OIL", "Export huile", 1),
        ("EXPORT_GAS", "Export gaz", 2),
        ("INJECTION_WATER", "Injection eau", 3),
        ("INJECTION_GAS", "Injection gaz", 4),
        ("GAS_LIFT", "Gas lift", 5),
        ("INFIELD_FLOWLINE", "Flowline intra-champ", 6),
        ("INFIELD_TRUNKLINE", "Trunkline intra-champ", 7),
        ("INTERFIELD_TRUNK", "Trunk inter-champs", 8),
        ("FUEL_GAS", "Fuel gas", 9),
        ("PRODUCED_WATER", "Eau produite", 10),
        ("CHEMICAL_LINE", "Ligne chimique", 11),
        ("UTILITY_LINE", "Ligne utilités", 12),
        ("SUBSEA_UMBILICAL", "Ombilical sous-marin", 13),
        ("RISER", "Riser", 14),
    ],
    "crane_type": [
        ("LATTICE_PEDESTAL", "Treillis sur piédestal", 1),
        ("LATTICE_CRAWLER", "Treillis sur chenilles", 2),
        ("LATTICE_TRUCK", "Treillis sur camion", 3),
        ("TELESCOPIC_TRUCK", "Télescopique sur camion", 10),
        ("TELESCOPIC_ROUGH_TERRAIN", "Télescopique tout-terrain", 11),
        ("TELESCOPIC_PEDESTAL", "Télescopique sur piédestal", 12),
        ("KNUCKLE_BOOM_PEDESTAL", "Articulé sur piédestal", 20),
        ("KNUCKLE_BOOM_MARINE", "Articulé marine", 21),
        ("OVERHEAD_BRIDGE", "Pont roulant", 30),
        ("GANTRY", "Portique", 31),
        ("MONORAIL", "Monorail", 32),
        ("TOWER_FIXED", "Tour fixe", 40),
        ("DAVIT", "Bossoir", 50),
        ("A_FRAME", "Cadre en A", 51),
        ("FLOATING_CRANE", "Grue flottante", 60),
        ("DERRICK", "Derrick", 61),
    ],
    "criticality": [
        ("A", "A — Critique", 1),
        ("B", "B — Important", 2),
        ("C", "C — Standard", 3),
    ],
}


async def seed():
    async with async_session_maker() as db:
        created = 0
        skipped = 0
        for category, entries in CATEGORIES.items():
            for code, label, sort_order in entries:
                existing = await db.execute(
                    select(DictionaryEntry).where(
                        DictionaryEntry.category == category,
                        DictionaryEntry.code == code,
                    )
                )
                if existing.scalar_one_or_none():
                    skipped += 1
                    continue
                entry = DictionaryEntry(
                    category=category,
                    code=code,
                    label=label,
                    sort_order=sort_order,
                    active=True,
                    translations={"en": label},  # FR is default label
                )
                db.add(entry)
                created += 1
        await db.commit()
        print(f"Seed complete: {created} created, {skipped} skipped (already exist)")
        print(f"Categories: {', '.join(CATEGORIES.keys())}")


if __name__ == "__main__":
    asyncio.run(seed())
