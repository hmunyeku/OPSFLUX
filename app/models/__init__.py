from app.models.dashboard import (  # noqa: F401
    Dashboard,
    DashboardAccessLog,
    DashboardPermission,
    DashboardTab,
    HomePageSetting,
    UserDashboardTab,
    WidgetCache,
)
from app.models.papyrus_document import (  # noqa: F401
    DocType,
    Document,
    Revision,
    Template,
    TemplateField,
    DocumentSequence,
    ArborescenceNode,
    DistributionList,
    DocumentSignature,
    DocumentAccessGrant,
    ShareLink,
)
from app.models.papyrus import (  # noqa: F401
    PapyrusVersion,
    PapyrusWorkflowEvent,
    PapyrusForm,
    PapyrusExternalLink,
    PapyrusExternalSubmission,
    PapyrusDispatchRun,
)
from app.models.pid_pfd import (  # noqa: F401
    PIDDocument,
    PIDRevision,
    Equipment,
    ProcessLine,
    PIDConnection,
    DCSTag,
    TagNamingRule,
    ProcessLibItem,
    PIDLock,
)
from app.models.travelwiz import (  # noqa: F401
    CaptainLog,
    ManifestPassenger,
    PickupRound,
    PickupStop,
    TransportRotation,
    TransportVector,
    TransportVectorZone,
    TripCodeAccess,
    TripKPI,
    VectorPosition,
    VehicleCertification,
    Voyage,
    VoyageEvent,
    VoyageEventType,
    VoyageManifest,
    VoyageStop,
    WeatherData,
)
from app.models.packlog import (  # noqa: F401
    ArticleCatalog,
    CargoAttachmentEvidence,
    CargoItem,
    CargoRequest,
    DeckLayout,
    DeckLayoutItem,
    PackageElement,
)
from app.models.moc import (  # noqa: F401
    MOC,
    MOCStatusHistory,
    MOCValidation,
)
from app.models.paxlog import (  # noqa: F401
    Ads,
    AdsEvent,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    ExternalAccessLink,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
    MissionStakeholder,
    PaxCompanyGroup,
    PaxCredential,
    PaxGroup,
    PaxIncident,
    PaxProfileType,
    PaxRotationCycle,
    ProfileHabilitationMatrix,
    ProfileType,
    StayProgram,
)
from app.models.planner import (  # noqa: F401
    PlannerActivity,
    PlannerConflict,
    PlannerConflictActivity,
    PlannerActivityDependency,
    PlannerConflictAudit,
    PlannerScenario,
    PlannerScenarioActivity,
)
from app.models.common import CostImputation, ImportMapping  # noqa: F401
from app.models.asset_registry_import import ImportRun  # noqa: F401

