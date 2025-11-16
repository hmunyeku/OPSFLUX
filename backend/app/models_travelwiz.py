"""
TravelWiz - Back Cargo System Models
Models pour le système de gestion de chargement bateau et retours site
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Column, Field, JSON, Relationship, SQLModel
from app.models import AbstractBaseModel


# ============================================================================
# ENUMS
# ============================================================================

class PackagingTypeEnum(str, Enum):
    """Types d'emballages supportés"""
    CONTENEUR = "Conteneur"
    PORTE_FUTS = "Porte-futs"
    SKID = "Skid"
    RACK_GAZ = "Rack gaz"
    TOOL_BOX = "Tool box"
    PANIER = "Panier"
    CAISSON = "Caisson"
    PORTE_CUVES = "Porte-cuves"
    BAC_DECHET = "Bac déchet"


class DestinationTypeEnum(str, Enum):
    """Destinations possibles"""
    MASSONGO = "Massongo"
    LA_LOBE = "La Lobe"
    WOURI = "Wouri"
    RDR = "RDR"
    HILI = "Hili"
    ADN_130 = "ADN 130"


class VesselTypeEnum(str, Enum):
    """Navires disponibles"""
    BOURBON_LIBERTY = "Bourbon Liberty 234"
    SKOUL_GWEN = "Skoul Gwen"
    COASTAL_FIGHTER = "Coastal Fighter"
    SURFER = "SURFER"
    VEDETE = "VEDETE"
    WOURI = "Wouri"


class SourceTypeEnum(str, Enum):
    """Sources de marchandises"""
    MAGASIN = "Magasin"
    YARD = "Yard"
    PRESTATAIRE = "Prestataire externe"


class ManifestStatusEnum(str, Enum):
    """Statuts du manifeste (workflow)"""
    BROUILLON = "Brouillon"
    EN_ATTENTE_VALIDATION = "En attente validation"
    VALIDE = "Validé"
    SIGNE_CAPITAINE = "Signé capitaine"
    CHARGE = "Chargé"
    EN_TRANSIT = "En transit"
    ARRIVE = "Arrivé"
    DECHARGE = "Déchargé"
    DISPATCHE = "Dispatché"
    LIVRE = "Livré"
    ANNULE = "Annulé"


class BackCargoTypeEnum(str, Enum):
    """Types de retours site (back cargo)"""
    DECHETS_DIS = "Déchets DIS"
    DECHETS_DIB = "Déchets DIB"
    DECHETS_DMET = "Déchets DMET"
    MATERIEL_SOUS_TRAITANT = "Matériel sous-traitant"
    REINTEGRATION_STOCK = "Réintégration stock"
    A_REBUTER = "À rebuter"
    A_FERRAILLER = "À ferrailler"
    STOCKAGE_YARD = "Stockage Yard"


class ValidationStatusEnum(str, Enum):
    """Statuts de validation"""
    EN_ATTENTE = "En attente"
    VALIDE = "Validé"
    REFUSE = "Refusé"


class DiscrepancyTypeEnum(str, Enum):
    """Types d'anomalies"""
    COLIS_MANQUANT = "Colis manquant"
    COLIS_ENDOMMAGE = "Colis endommagé"
    COLIS_NON_MANIFESTE = "Colis non manifesté"
    ECART_POIDS = "Écart de poids"
    MARQUAGE_INCORRECT = "Marquage incorrect"
    DOCUMENT_MANQUANT = "Document manquant"
    ELINGAGE_DEFECTUEUX = "Élingage défectueux"


class VesselArrivalStatusEnum(str, Enum):
    """Statuts d'arrivée navire"""
    ATTENDU = "Attendu"
    EN_APPROCHE = "En approche"
    AMARRE = "Amarré"
    EN_COURS_INSPECTION = "En cours inspection"
    INSPECTE = "Inspecté"
    DECHARGE = "Déchargé"
    DISPATCHE = "Dispatché"
    PARTI = "Parti"


class YardDispatchStatusEnum(str, Enum):
    """Statuts de dispatch Yard"""
    EN_ATTENTE_RECEPTION = "En attente réception"
    RECEPTIONNE = "Réceptionné"
    VERIFIE = "Vérifié"
    NOTIFIE = "Notifié"
    EN_ATTENTE_RETRAIT = "En attente retrait"
    RETIRE = "Retiré"
    DISPATCHE = "Dispatché"
    EN_ANOMALIE = "En anomalie"


class SeverityEnum(str, Enum):
    """Gravité d'une anomalie"""
    BASSE = "Basse"
    MOYENNE = "Moyenne"
    HAUTE = "Haute"
    CRITIQUE = "Critique"


class DestinationAreaEnum(str, Enum):
    """Zones de destination"""
    MAGASIN = "Magasin"
    ZONE_DECHETS = "Zone déchets"
    ZONE_FERRAILLE = "Zone ferraille"
    YARD = "Yard"
    SOUS_TRAITANT = "Sous-traitant"


# ============================================================================
# MODELS
# ============================================================================

class CargoItem(AbstractBaseModel, table=True):
    """Article de cargo (colis)"""
    __tablename__ = "travelwiz_cargo_items"

    item_number: str = Field(max_length=50)
    packaging: PackagingTypeEnum
    packaging_number: Optional[str] = Field(default=None, max_length=50)
    quantity: int
    designation: str = Field(max_length=500)
    weight: float  # kg
    observations: Optional[str] = Field(default=None, max_length=1000)
    cargo_win_number: Optional[str] = Field(default=None, max_length=50)
    cargo_nature: Optional[str] = Field(default=None, max_length=200)
    sap_code: Optional[str] = Field(default=None, max_length=50)
    sender: Optional[str] = Field(default=None, max_length=200)
    recipient: Optional[str] = Field(default=None, max_length=200)
    cargo_owner: Optional[str] = Field(default=None, max_length=200)
    slip_number: Optional[str] = Field(default=None, max_length=50)
    cost_imputation: Optional[str] = Field(default=None, max_length=200)
    picture_urls: Optional[list] = Field(default=None, sa_column=Column(JSON))
    qr_code: Optional[str] = Field(default=None, max_length=500)
    label_printed: bool = Field(default=False)
    scanned_at: Optional[datetime] = None

    # Relations
    loading_manifest_id: Optional[UUID] = Field(default=None, foreign_key="travelwiz_loading_manifests.id")
    back_cargo_manifest_id: Optional[UUID] = Field(default=None, foreign_key="travelwiz_back_cargo_manifests.id")


class StepValidation(SQLModel):
    """Validation d'une étape (embedded)"""
    status: ValidationStatusEnum
    validator: Optional[str] = None
    validator_role: Optional[str] = None
    date: Optional[datetime] = None
    signature: Optional[str] = None  # base64 ou URL
    comments: Optional[str] = None
    location: Optional[str] = None


class LoadingManifest(AbstractBaseModel, table=True):
    """Manifeste de chargement bateau"""
    __tablename__ = "travelwiz_loading_manifests"

    manifest_number: str = Field(unique=True, index=True, max_length=50)
    status: ManifestStatusEnum = Field(default=ManifestStatusEnum.BROUILLON)

    # Informations de prise en charge
    pickup_location: str = Field(max_length=200)
    availability_date: datetime
    requested_delivery_date: datetime

    # Transport
    vessel: VesselTypeEnum
    destination: DestinationTypeEnum
    destination_code: str = Field(max_length=50)

    # Destinataire
    service: str = Field(max_length=200)
    recipient_name: str = Field(max_length=200)
    recipient_contact: Optional[str] = Field(default=None, max_length=200)

    # Source
    source: SourceTypeEnum
    external_provider: Optional[str] = Field(default=None, max_length=200)

    # Totaux
    total_weight: float = 0.0
    total_packages: int = 0

    # Émetteur
    emitter_service: str = Field(max_length=200)
    emitter_name: str = Field(max_length=200)
    emitter_contact: Optional[str] = Field(default=None, max_length=200)
    emitter_date: datetime
    emitter_signature: Optional[str] = Field(default=None, max_length=500)

    # Validations (JSON)
    loading_validation: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    vessel_validation: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    unloading_validation: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    # Tracking
    loading_date: Optional[datetime] = None
    departure_date: Optional[datetime] = None
    arrival_date: Optional[datetime] = None
    unloading_date: Optional[datetime] = None

    # Diffusion
    distribution_list: Optional[list] = Field(default=None, sa_column=Column(JSON))

    # Notes
    notes: Optional[str] = Field(default=None, max_length=2000)


class BackCargoManifest(AbstractBaseModel, table=True):
    """Manifeste de retour site (back cargo)"""
    __tablename__ = "travelwiz_back_cargo_manifests"

    back_cargo_number: str = Field(unique=True, index=True, max_length=50)
    type: BackCargoTypeEnum
    status: ManifestStatusEnum = Field(default=ManifestStatusEnum.BROUILLON)

    # Origine
    origin_site: DestinationTypeEnum
    origin_rig: Optional[str] = Field(default=None, max_length=100)

    # Transport
    vessel: VesselTypeEnum
    arrival_date: datetime

    # Totaux
    total_weight: float = 0.0
    total_packages: int = 0

    # Validations et signatures
    company_man: Optional[str] = Field(default=None, max_length=200)
    company_man_signature: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    omaa_delegate: Optional[str] = Field(default=None, max_length=200)
    omaa_delegate_signature: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    captain_signature: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    subcontractor_name: Optional[str] = Field(default=None, max_length=200)
    subcontractor_signature: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    yard_officer_signature: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    # Conformité
    compliance_rules: dict = Field(default={}, sa_column=Column(JSON))
    has_inventory: bool = Field(default=False)
    has_exit_pass: bool = Field(default=False)
    marked_bins: bool = Field(default=False)
    has_scrap_mention: bool = Field(default=False)
    has_yard_storage_mention: bool = Field(default=False)

    # Destination/Traitement
    destination_service: Optional[str] = Field(default=None, max_length=200)
    destination_area: Optional[DestinationAreaEnum] = None
    storage_reason: Optional[str] = Field(default=None, max_length=1000)

    # Anomalies
    discrepancies: Optional[list] = Field(default=None, sa_column=Column(JSON))
    discrepancy_photos: Optional[list] = Field(default=None, sa_column=Column(JSON))
    pending_approval: bool = Field(default=False)
    approval_reason: Optional[str] = Field(default=None, max_length=1000)

    # Réception Yard
    yard_reception_date: Optional[datetime] = None
    yard_reception_by: Optional[str] = Field(default=None, max_length=200)
    yard_location: Optional[str] = Field(default=None, max_length=200)

    # Notes
    notes: Optional[str] = Field(default=None, max_length=2000)


class UnloadingDiscrepancy(AbstractBaseModel, table=True):
    """Anomalie détectée lors du déchargement"""
    __tablename__ = "travelwiz_unloading_discrepancies"

    type: DiscrepancyTypeEnum
    manifest_id: Optional[str] = Field(default=None, max_length=50)
    package_number: Optional[str] = Field(default=None, max_length=50)
    description: str = Field(max_length=2000)
    expected_value: Optional[str] = Field(default=None, max_length=200)
    actual_value: Optional[str] = Field(default=None, max_length=200)
    severity: SeverityEnum
    photos: Optional[list] = Field(default=None, sa_column=Column(JSON))
    detected_by: str = Field(max_length=200)
    detected_at: datetime
    resolved: bool = Field(default=False)
    resolution_note: Optional[str] = Field(default=None, max_length=2000)
    resolution_date: Optional[datetime] = None

    # Relation
    vessel_arrival_id: UUID = Field(foreign_key="travelwiz_vessel_arrivals.id")
    vessel_arrival: "VesselArrival" = Relationship(back_populates="discrepancies")


class VesselArrival(AbstractBaseModel, table=True):
    """Arrivée de navire"""
    __tablename__ = "travelwiz_vessel_arrivals"

    vessel: VesselTypeEnum
    status: VesselArrivalStatusEnum = Field(default=VesselArrivalStatusEnum.ATTENDU)

    # Planning
    eta: datetime  # Estimated Time of Arrival
    ata: Optional[datetime] = None  # Actual Time of Arrival
    etd: Optional[datetime] = None  # Estimated Time of Departure
    atd: Optional[datetime] = None  # Actual Time of Departure

    # Manifestes attendus/reçus
    expected_manifests: int = 0
    received_manifests: int = 0
    expected_packages: int = 0
    received_packages: int = 0
    expected_weight: float = 0.0
    received_weight: float = 0.0

    # Contrôle à bord
    physical_check_completed: bool = Field(default=False)
    slips_recovered: bool = Field(default=False)
    weights_verified: bool = Field(default=False)
    riggings_verified: bool = Field(default=False)
    manifest_compared: bool = Field(default=False)

    # Inspection
    inspector_name: Optional[str] = Field(default=None, max_length=200)
    inspection_date: Optional[datetime] = None
    inspection_notes: Optional[str] = Field(default=None, max_length=2000)

    # Résumé déchargement
    unloading_completed: bool = Field(default=False)
    unloading_notes: Optional[str] = Field(default=None, max_length=2000)

    # Rapport
    report_generated: bool = Field(default=False)
    report_url: Optional[str] = Field(default=None, max_length=500)
    report_sent: bool = Field(default=False)
    report_recipients: Optional[list] = Field(default=None, sa_column=Column(JSON))

    # Relations
    discrepancies: list["UnloadingDiscrepancy"] = Relationship(back_populates="vessel_arrival")


class YardDispatch(AbstractBaseModel, table=True):
    """Dispatch au Yard"""
    __tablename__ = "travelwiz_yard_dispatches"

    status: YardDispatchStatusEnum = Field(default=YardDispatchStatusEnum.EN_ATTENTE_RECEPTION)

    # Référence au back cargo
    back_cargo_id: UUID = Field(foreign_key="travelwiz_back_cargo_manifests.id")

    # Réception
    reception_date: Optional[datetime] = None
    yard_officer: Optional[str] = Field(default=None, max_length=200)

    # Vérification
    verification_completed: bool = Field(default=False)
    verification_notes: Optional[str] = Field(default=None, max_length=2000)
    verification_anomalies: Optional[list] = Field(default=None, sa_column=Column(JSON))
    is_compliant: bool = Field(default=True)

    # Notification
    notification_sent: bool = Field(default=False)
    notification_method: Optional[str] = Field(default=None, max_length=50)  # Email/SMS/Les deux
    notification_message: Optional[str] = Field(default=None, max_length=2000)
    notification_date: Optional[datetime] = None

    # Laissez-passer (pour sous-traitants)
    exit_pass_number: Optional[str] = Field(default=None, max_length=50)
    exit_pass_generated: bool = Field(default=False)
    exit_pass_url: Optional[str] = Field(default=None, max_length=500)
    blue_copy_sent: bool = Field(default=False)

    # Dispatch final
    dispatch_location: Optional[str] = Field(default=None, max_length=200)
    dispatch_zone: Optional[str] = Field(default=None, max_length=200)
    dispatch_date: Optional[datetime] = None
    dispatch_notes: Optional[str] = Field(default=None, max_length=2000)

    # Retrait
    withdrawn: bool = Field(default=False)
    withdrawn_date: Optional[datetime] = None
    withdrawn_by: Optional[str] = Field(default=None, max_length=200)
    withdrawn_signature: Optional[str] = Field(default=None, max_length=500)
