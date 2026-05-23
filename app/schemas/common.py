"""Common Pydantic schemas — request/response models."""

from datetime import date as _date_t, datetime
from datetime import date  # backwards compat for non-shadowing usages
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

T = TypeVar("T")


# ─── Base schemas ────────────────────────────────────────────────────────────

class OpsFluxSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    detail: str


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


# ─── Auth schemas ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    captcha_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MFARequiredResponse(BaseModel):
    """Returned when the user has MFA enabled — frontend must prompt for TOTP code."""
    mfa_required: bool = True
    mfa_token: str


class MFALoginRequest(BaseModel):
    """Second step of login: verify MFA code to get real tokens.

    remember_days : si > 0, crée un appareil de confiance MFA pour ne
    pas avoir à saisir l'OTP pendant N jours. Clamp côté backend par
    le setting admin auth.mfa_trust_device_max_days.
    """
    mfa_token: str
    code: str
    remember_days: int = 0


class LoginResponse(BaseModel):
    """Union-style response: either full tokens or MFA challenge."""
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    mfa_required: bool = False
    mfa_token: str | None = None
    # AUP §5.2 — set when the user's password is older than
    # `auth.password_max_age_days`. Frontend should force the user
    # through /change-password before showing the main UI.
    password_expired: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── User schemas ────────────────────────────────────────────────────────────

class UserRead(OpsFluxSchema):
    id: UUID
    email: str
    first_name: str
    last_name: str
    active: bool
    default_entity_id: UUID | None
    tier_contact_id: UUID | None = None
    intranet_id: str | None = None
    language: str
    avatar_url: str | None
    # Auth & security
    auth_type: str = "email_password"
    mfa_enabled: bool = False
    failed_login_count: int = 0
    locked_until: datetime | None = None
    last_login_ip: str | None = None
    account_expires_at: datetime | None = None
    password_changed_at: datetime | None = None
    # HR Identity
    passport_name: str | None = None
    gender: str | None = None
    nationality: str | None = None
    birth_country: str | None = None
    birth_date: date | None = None
    birth_city: str | None = None
    # Identity verification
    identity_verified: bool = False
    identity_verified_by: UUID | None = None
    identity_verified_at: datetime | None = None
    # Travel
    contractual_airport: str | None = None
    nearest_airport: str | None = None
    nearest_station: str | None = None
    loyalty_program: str | None = None
    # Health / Medical
    last_medical_check: date | None = None
    last_international_medical_check: date | None = None
    last_subsidiary_medical_check: date | None = None
    # Body measurements / Mensurations
    height: int | None = None
    weight: float | None = None
    ppe_clothing_size: str | None = None
    ppe_clothing_size_bottom: str | None = None
    ppe_shoe_size: str | None = None
    # Misc / HR
    retirement_date: date | None = None
    vantage_number: str | None = None
    extension_number: str | None = None
    # Classification
    user_type: str = "internal"
    # Job position (conformité)
    job_position_id: UUID | None = None
    job_position_name: str | None = None
    # Business unit
    business_unit_id: UUID | None = None
    business_unit_name: str | None = None
    # Messaging preference
    preferred_messaging_channel: str = "auto"
    # Timestamps
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime | None = None


class UserAdminRead(UserRead):
    """Extended user view for admin user management — adds computed lock status."""
    is_locked: bool = False
    lock_remaining_minutes: int | None = None


class UserListItem(OpsFluxSchema):
    """Minimal user view for list endpoints (autocomplete, mention picker, etc.).

    Bug #67 (QA v3) : `UserRead` exposait passport, medical, body measurements,
    addresses, etc. à tout caller ayant `user.read` (présent dans READER role).
    Conséquence : un user en lecture seule pouvait dump la PII de tous les
    comptes via GET /users. Ce schéma ne contient QUE les champs publics
    nécessaires à l'identification d'un user (autocomplete, assigné à, etc.).
    Pour la vue complète, il faut soit être le user lui-même (/auth/me) soit
    avoir `admin.users.read` (vue admin).
    """
    id: UUID
    email: str
    first_name: str
    last_name: str
    active: bool
    avatar_url: str | None = None
    default_entity_id: UUID | None = None
    user_type: str = "internal"
    job_position_name: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    password: str | None = Field(None, min_length=8)
    default_entity_id: UUID | None = None
    intranet_id: str | None = None
    language: str = "fr"
    user_type: str = "internal"
    # Optional HR fields at creation
    passport_name: str | None = None
    gender: str | None = None
    nationality: str | None = None
    birth_country: str | None = None
    birth_date: date | None = None
    birth_city: str | None = None
    job_position_id: UUID | None = None


class UserUpdate(BaseModel):
    # Bug #84 (QA v3 Phase 8) : durcissement strict mode -- avant ce fix
    # UserUpdate etait en mode permissif par defaut (extra="ignore" Pydantic),
    # ce qui silently dropait tout champ inconnu. Combine avec bug #65 (le
    # champ password n'existait pas) ca laissait passer des reset password
    # avec 200 sans aucun effet. Maintenant extra="forbid" force un 422 sur
    # tout champ inconnu -- les bugs de protocole sont detectes au plus tot.
    # A appliquer progressivement aux autres Update schemas (TierUpdate,
    # ProjectUpdate, etc.) apres audit frontend pour identifier les champs
    # que l'UI envoyait inutilement.
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    first_name: str | None = None
    last_name: str | None = None
    # Bug #65 (QA v3 Phase 1) : avant ce fix, UserUpdate n'avait pas de
    # champ `password` du tout. Quand un admin envoyait
    # PATCH /users/<id> {"password":"..."}, Pydantic ignorait silencieusement
    # le champ inconnu (mode permissif) et la route retournait 200 sans rien
    # changer cote BDD -- impossible de detecter l'echec du reset depuis le
    # client. Maintenant on accepte explicitement password + on le hashe dans
    # la route avant le setattr loop.
    password: str | None = Field(None, min_length=8, max_length=200)
    default_entity_id: UUID | None = None
    intranet_id: str | None = None
    language: str | None = None
    active: bool | None = None
    user_type: str | None = None
    account_expires_at: datetime | None = None
    # HR Identity
    passport_name: str | None = None
    gender: str | None = None
    nationality: str | None = None
    birth_country: str | None = None
    birth_date: date | None = None
    birth_city: str | None = None
    # Travel
    contractual_airport: str | None = None
    nearest_airport: str | None = None
    nearest_station: str | None = None
    loyalty_program: str | None = None
    # Health / Medical
    last_medical_check: date | None = None
    last_international_medical_check: date | None = None
    last_subsidiary_medical_check: date | None = None
    # Body measurements / Mensurations
    height: int | None = None
    weight: float | None = None
    ppe_clothing_size: str | None = None
    ppe_clothing_size_bottom: str | None = None
    ppe_shoe_size: str | None = None
    # Misc / HR
    retirement_date: date | None = None
    vantage_number: str | None = None
    extension_number: str | None = None
    # Job position (conformité)
    job_position_id: UUID | None = None


# ─── Entity schemas ──────────────────────────────────────────────────────────

class EntityRead(OpsFluxSchema):
    id: UUID
    code: str
    name: str
    country: str | None
    timezone: str
    active: bool


class EntityCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    country: str | None = None
    timezone: str = "Africa/Douala"


# ─── Department schemas ─────────────────────────────────────────────────────

class BusinessUnitRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    description: str | None = None
    manager_id: UUID | None = None
    manager_name: str | None = None
    active: bool
    created_at: datetime | None = None

class BusinessUnitCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    description: str | None = None
    manager_id: UUID | None = None
    active: bool = True

class BusinessUnitUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    manager_id: UUID | None = None
    active: bool | None = None

# Backward compatibility aliases
DepartmentRead = BusinessUnitRead
DepartmentCreate = BusinessUnitCreate
DepartmentUpdate = BusinessUnitUpdate

class CostCenterRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    department_id: UUID | None = None
    active: bool
    created_at: datetime | None = None

class CostCenterCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    department_id: UUID | None = None
    active: bool = True

class CostCenterUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    department_id: UUID | None = None
    active: bool | None = None


class ImputationOtpTemplateRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    description: str | None = None
    rubrics: list[dict[str, Any]]
    active: bool
    created_at: datetime | None = None


class ImputationOtpTemplateCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    description: str | None = None
    rubrics: list[dict[str, Any]] = Field(default_factory=list)
    active: bool = True


class ImputationOtpTemplateUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    rubrics: list[dict[str, Any]] | None = None
    active: bool | None = None


class ImputationReferenceRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    description: str | None = None
    imputation_type: str
    otp_policy: str
    otp_template_id: UUID | None = None
    default_project_id: UUID | None = None
    default_cost_center_id: UUID | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    active: bool
    metadata_: dict[str, Any] | None = Field(default=None, alias="metadata")
    created_at: datetime | None = None


class ImputationReferenceCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    description: str | None = None
    imputation_type: str = Field(default="OPEX", pattern="^(OPEX|SOPEX|CAPEX|OTHER)$")
    otp_policy: str = Field(default="forbidden", pattern="^(forbidden|required|optional)$")
    otp_template_id: UUID | None = None
    default_project_id: UUID | None = None
    default_cost_center_id: UUID | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    active: bool = True
    metadata: dict[str, Any] | None = None


class ImputationReferenceUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    imputation_type: str | None = Field(default=None, pattern="^(OPEX|SOPEX|CAPEX|OTHER)$")
    otp_policy: str | None = Field(default=None, pattern="^(forbidden|required|optional)$")
    otp_template_id: UUID | None = None
    default_project_id: UUID | None = None
    default_cost_center_id: UUID | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    active: bool | None = None
    metadata: dict[str, Any] | None = None


class ImputationAssignmentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    imputation_reference_id: UUID
    target_type: str
    target_id: UUID
    priority: int
    valid_from: date | None = None
    valid_to: date | None = None
    active: bool
    notes: str | None = None
    created_at: datetime | None = None


class ImputationAssignmentCreate(BaseModel):
    imputation_reference_id: UUID
    target_type: str = Field(..., pattern="^(user|user_group|business_unit|project)$")
    target_id: UUID
    priority: int = 100
    valid_from: date | None = None
    valid_to: date | None = None
    active: bool = True
    notes: str | None = None


class ImputationAssignmentUpdate(BaseModel):
    priority: int | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    active: bool | None = None
    notes: str | None = None


# ─── Tier schemas ────────────────────────────────────────────────────────────

class TierRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    alias: str | None = None
    trade_name: str | None = None
    logo_url: str | None = None
    logo_attachment_id: UUID | None = None
    type: str | None
    website: str | None = None
    is_authorization_center: bool = False
    authorization_center_code: str | None = None
    certificate_verification_url: str | None = None
    # Legacy fields (prefer polymorphic phones/emails)
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    # Corporate
    legal_form: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    vat_number: str | None = None
    capital: float | None = None
    # Currency: optional — backend defaults to entity.currency on create.
    # Each tier can override its own currency.
    currency: str | None = None
    fiscal_year_start: int = 1
    industry: str | None = None
    founded_date: date | None = None
    payment_terms: str | None = None
    incoterm: str | None = None
    incoterm_city: str | None = None
    description: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    timezone: str = "Africa/Douala"
    language: str = "fr"
    social_networks: dict[str, Any] | None = None
    opening_hours: dict[str, Any] | None = None
    notes: str | None = None
    active: bool
    archived: bool
    is_blocked: bool = False
    scope: str = "local"
    contact_count: int = 0
    created_at: datetime


# Defined before TierCreate so the latter can use it as an element type
# in `contacts: list[TierContactCreate]`. Python resolves names at
# module eval time; keeping TierContactCreate above TierCreate avoids
# needing forward refs + model_rebuild().
class TierContactCreate(BaseModel):
    """Bug #142 (QA v3 round 38) : email accepte n'importe quelle string
    sans format check. Maintenant : EmailStr pour validation RFC propre."""

    civility: str | None = None
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    position: str | None = None
    department: str | None = None
    job_position_id: UUID | None = None
    photo_url: str | None = Field(None, max_length=1000)
    is_primary: bool = False


class TierCreate(BaseModel):
    # ``code`` is always auto-generated server-side via the TIR numbering
    # pattern. It must not be provided by the client.
    name: str = Field(..., min_length=1, max_length=200)
    alias: str | None = None
    trade_name: str | None = None
    logo_url: str | None = None
    type: str | None = None
    website: str | None = None
    is_authorization_center: bool = False
    authorization_center_code: str | None = Field(default=None, max_length=80)
    certificate_verification_url: str | None = Field(default=None, max_length=500)
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    legal_form: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    vat_number: str | None = None
    # Bug #99 (QA v3 round 4) : capital negatif acceptait silencieusement,
    # mais un capital negatif n'a aucun sens metier (montant en monnaie
    # toujours positif ou zero). ge=0 rejette en 422 cote Pydantic.
    capital: float | None = Field(default=None, ge=0)
    # Currency: optional — backend defaults to entity.currency on create.
    currency: str | None = None
    fiscal_year_start: int = 1
    industry: str | None = None
    # Bug #100 (QA v3 round 4) : founded_date 2099-12-31 (futur) acceptait
    # alors que c'est par definition impossible (une entreprise ne peut pas
    # avoir ete fondee dans le futur). On compare a date.today() au moment
    # de la validation. Note : pas de borne min car certaines entreprises
    # tres anciennes (Lloyd's of London 1688, etc.) sont legitimes.
    founded_date: date | None = None
    payment_terms: str | None = None
    incoterm: str | None = None
    incoterm_city: str | None = None
    description: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    # Timezone & language: optional on create — backend defaults to the
    # entity's tz/lang. Each tier can override its own.
    timezone: str | None = None
    language: str | None = None
    social_networks: dict[str, Any] | None = None
    opening_hours: dict[str, Any] | None = None
    notes: str | None = None
    scope: str = "local"
    # Client-generated UUID used during create to stage polymorphic children
    # (phones, emails, addresses, legal IDs, social, opening hours,
    # attachments, notes, tags, external refs) before the tier row exists.
    staging_ref: UUID | None = None
    # Initial contacts to create along with the tier in a single request.
    # TierContact is FK-linked (not polymorphic), so rows are inserted in
    # the same transaction as the tier. Rarely more than a handful;
    # additional contacts can be added later via the detail panel.
    contacts: list[TierContactCreate] = Field(default_factory=list)

    # Note Bug #100 : la validation de founded_date pas dans le futur a
    # ete deplacee dans la route create_tier (app/api/routes/modules/tiers.py)
    # car le field_validator + ValueError + handler global creait une
    # cascade qui retournait 500 au lieu de 422 (probleme de routing
    # d'exception_handler en FastAPI). Le check direct via HTTPException
    # dans la route est garanti d'aboutir au 422 propre.


class TierUpdate(BaseModel):
    """Bug #132 (QA v3 round 10) : `extra="forbid"` pour fail-fast sur
    champs immuables (id, code, entity_id, created_at) et typos. Avant
    fix : `PATCH {"code":"TIR-HACKED"}` -> 200 silencieux (code drop)
    laissant croire au client que la modification a abouti."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    alias: str | None = None
    trade_name: str | None = None
    logo_url: str | None = None
    type: str | None = None
    website: str | None = None
    is_authorization_center: bool | None = None
    authorization_center_code: str | None = Field(default=None, max_length=80)
    certificate_verification_url: str | None = Field(default=None, max_length=500)
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    legal_form: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    vat_number: str | None = None
    capital: float | None = Field(default=None, ge=0)
    currency: str | None = None
    fiscal_year_start: int | None = None
    industry: str | None = None
    founded_date: date | None = None
    payment_terms: str | None = None
    incoterm: str | None = None
    incoterm_city: str | None = None
    description: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    timezone: str | None = None
    language: str | None = None
    social_networks: dict[str, Any] | None = None
    opening_hours: dict[str, Any] | None = None
    notes: str | None = None
    active: bool | None = None
    scope: str | None = None


# ─── TierContact schemas ────────────────────────────────────────────────────

class TierContactRead(OpsFluxSchema):
    id: UUID
    tier_id: UUID
    civility: str | None = None
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    position: str | None
    department: str | None = None
    job_position_id: UUID | None = None
    job_position_name: str | None = None
    photo_url: str | None = None
    is_primary: bool
    active: bool
    linked_user_id: UUID | None = None
    linked_user_email: str | None = None
    linked_user_active: bool | None = None
    created_at: datetime


class TierContactWithTier(TierContactRead):
    """Contact enriched with parent tier info — for global contacts listing."""
    tier_name: str
    tier_code: str


class TierContactUpdate(BaseModel):
    """Bug #135 (QA v3 round 11) : extra=forbid pour fail-fast sur
    champs immuables (tier_id, id, created_at) et typos."""

    model_config = ConfigDict(extra="forbid")

    civility: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    position: str | None = None
    department: str | None = None
    job_position_id: UUID | None = None
    photo_url: str | None = Field(None, max_length=1000)
    is_primary: bool | None = None
    active: bool | None = None


class TierContactPromoteUserRequest(BaseModel):
    role: str = Field(default="viewer", min_length=1, max_length=50)
    language: str = Field(default="fr", min_length=2, max_length=5)
    send_invitation: bool = True


# ─── LegalIdentifier schemas (polymorphic) ─────────────────────────────────

class LegalIdentifierRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    type: str
    value: str
    country: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None
    created_at: datetime


class LegalIdentifierCreate(BaseModel):
    type: str = Field(..., min_length=1, max_length=50)
    value: str = Field(..., min_length=1, max_length=200)
    country: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None


class LegalIdentifierUpdate(BaseModel):
    type: str | None = None
    value: str | None = None
    country: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None


# Backward-compatible aliases
TierIdentifierRead = LegalIdentifierRead
TierIdentifierCreate = LegalIdentifierCreate
TierIdentifierUpdate = LegalIdentifierUpdate


# ─── TierBlock schemas ────────────────────────────────────────────────────

class TierBlockCreate(BaseModel):
    reason: str = Field(..., min_length=1)
    block_type: str = Field(default="purchasing", pattern="^(purchasing|payment|all)$")
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_date_order(self) -> "TierBlockCreate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be greater than or equal to start_date")
        return self


class TierBlockRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    tier_id: UUID
    action: str
    reason: str
    block_type: str
    start_date: date | None = None
    end_date: date | None = None
    performed_by: UUID
    active: bool
    created_at: datetime
    performer_name: str | None = None


# ─── ExternalReference schemas ────────────────────────────────────────────

class ExternalReferenceCreate(BaseModel):
    system: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=200)
    label: str | None = None
    url: str | None = None
    notes: str | None = None


class ExternalReferenceRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    system: str
    code: str
    label: str | None = None
    url: str | None = None
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime


# ─── Notification schemas ────────────────────────────────────────────────────

class NotificationRead(OpsFluxSchema):
    id: UUID
    title: str
    body: str | None
    category: str
    link: str | None
    read: bool
    read_at: datetime | None
    created_at: datetime


# ─── Settings schemas ────────────────────────────────────────────────────────

class SettingRead(OpsFluxSchema):
    key: str
    value: dict[str, Any]
    scope: str
    scope_id: str | None


class SettingWrite(BaseModel):
    key: str
    value: dict[str, Any]


# ─── Personal Access Tokens ─────────────────────────────────────────────────

class TokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    scopes: list[str] = Field(..., min_length=1)
    expires_at: datetime | None = None


class TokenRead(OpsFluxSchema):
    id: UUID
    name: str
    token_prefix: str
    scopes: list[str]
    expires_at: datetime | None
    last_used_at: datetime | None
    revoked: bool
    created_at: datetime


class TokenCreatedResponse(OpsFluxSchema):
    """Returned only at creation time — includes the full token value."""
    id: UUID
    name: str
    token: str
    scopes: list[str]
    expires_at: datetime | None
    created_at: datetime


# ─── Sessions ───────────────────────────────────────────────────────────────

class SessionRead(OpsFluxSchema):
    id: UUID
    ip_address: str | None
    browser: str | None
    os: str | None
    device_type: str
    last_active_at: datetime
    created_at: datetime
    is_current: bool = False


# ─── Delegation / Acting Context ───────────────────────────────────────────

class UserBriefRead(OpsFluxSchema):
    id: UUID
    first_name: str
    last_name: str
    email: str
    avatar_url: str | None = None


class UserDelegationCreate(BaseModel):
    delegate_id: UUID
    start_date: datetime
    end_date: datetime
    reason: str | None = None
    scope_type: str = Field(default="all", pattern="^(all|role|permissions)$")
    role_code: str | None = None
    permission_codes: list[str] = Field(default_factory=list)


class UserDelegationUpdate(BaseModel):
    start_date: datetime | None = None
    end_date: datetime | None = None
    reason: str | None = None
    active: bool | None = None


class UserDelegationRead(OpsFluxSchema):
    id: UUID
    delegator_id: UUID
    delegate_id: UUID
    entity_id: UUID
    permissions: list[str]
    start_date: datetime
    end_date: datetime
    active: bool
    reason: str | None = None
    delegator: UserBriefRead | None = None
    delegate: UserBriefRead | None = None


class ActingContextRead(OpsFluxSchema):
    key: str
    mode: str
    label: str
    target_user_id: UUID | None = None
    target_user: UserBriefRead | None = None
    cumulative: bool = False
    permission_count: int | None = None


class ActingContextStatusRead(OpsFluxSchema):
    key: str
    mode: str
    cumulative: bool
    target_user_id: UUID | None = None
    target_user: UserBriefRead | None = None
    permission_count: int


# ─── User Emails ────────────────────────────────────────────────────────────

class UserEmailCreate(BaseModel):
    email: EmailStr


class UserEmailRead(OpsFluxSchema):
    id: UUID
    email: str
    is_primary: bool
    is_notification: bool
    verified: bool
    verified_at: datetime | None
    created_at: datetime


# ─── OAuth Applications ─────────────────────────────────────────────────────

class OAuthAppCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    redirect_uris: list[str] = Field(..., min_length=1)
    scopes: list[str] = Field(default_factory=list)
    confidential: bool = True


class OAuthAppRead(OpsFluxSchema):
    id: UUID
    name: str
    client_id: str
    redirect_uris: list[str]
    scopes: list[str]
    confidential: bool
    active: bool
    created_at: datetime


class OAuthAppCreatedResponse(OpsFluxSchema):
    """Returned only at creation time — includes secret."""
    id: UUID
    name: str
    client_id: str
    client_secret: str | None
    redirect_uris: list[str]
    scopes: list[str]
    confidential: bool


class OAuthAuthorizationRead(OpsFluxSchema):
    id: UUID
    application: OAuthAppRead
    scopes: list[str]
    created_at: datetime


# ─── Addresses (polymorphic) ────────────────────────────────────────────────

class AddressCreate(BaseModel):
    # SUP-bug : cohérence de nommage. D'autres modèles (Tier, UserHealth,
    # PaxLog…) utilisent `zip_code` + `is_primary` au lieu de `postal_code`
    # + `is_default`. On accepte les deux en entrée via populate_by_name :
    # le client peut envoyer `zip_code` (alias) qui sera reçu comme
    # `postal_code`, et `is_primary` (alias) sera reçu comme `is_default`.
    # Évite les 422 "Field required" injustifiés selon l'origine du client.
    model_config = {"populate_by_name": True}
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    label: str = Field(..., min_length=1, max_length=50)
    address_line1: str = Field(..., min_length=1, max_length=255)
    address_line2: str | None = None
    city: str = Field(..., min_length=1, max_length=100)
    state_province: str | None = None
    postal_code: str | None = Field(default=None, alias="zip_code")
    country: str = Field(..., min_length=1, max_length=100)
    latitude: float | None = None
    longitude: float | None = None
    is_default: bool = Field(default=False, alias="is_primary")


class AddressUpdate(BaseModel):
    # Bug #84 followup (session 28) : extra="forbid" sur schemas Update
    # simples valides apres audit FE/BE (AddressCreate FE expose
    # exactement les memes champs que AddressUpdate BE). Tout champ
    # inconnu envoye par le frontend declenche maintenant un 422 explicite
    # au lieu d'etre silently dropped.
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    label: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_province: str | None = None
    postal_code: str | None = Field(default=None, alias="zip_code")
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_default: bool | None = Field(default=None, alias="is_primary")


class AddressRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    label: str
    address_line1: str
    address_line2: str | None
    city: str
    state_province: str | None
    postal_code: str | None
    country: str
    latitude: float | None
    longitude: float | None
    is_default: bool
    created_at: datetime


# ─── Tags (polymorphic) ───────────────────────────────────────────────────

class TagCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6b7280", max_length=20)
    visibility: str = Field(default="public", pattern="^(public|private)$")
    parent_id: UUID | None = None


class TagUpdate(BaseModel):
    # Bug #84 followup (session 28) : extra="forbid" sur schemas Update simples.
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    color: str | None = None
    visibility: str | None = None
    parent_id: UUID | None = None


class TagRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    name: str
    color: str
    visibility: str
    created_by: UUID
    parent_id: UUID | None = None
    created_at: datetime


class TagTreeRead(OpsFluxSchema):
    """Tag with nested children for tree display."""
    id: UUID
    owner_type: str
    owner_id: UUID
    name: str
    color: str
    visibility: str
    created_by: UUID
    parent_id: UUID | None = None
    children: list["TagTreeRead"] = []
    created_at: datetime


# ─── Phones (polymorphic) ────────────────────────────────────────────────

class PhoneCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    label: str = Field(default="mobile", max_length=50)
    number: str = Field(..., min_length=1, max_length=50)
    country_code: str | None = Field(None, max_length=10)
    is_default: bool = False


class PhoneUpdate(BaseModel):
    # Bug #84 followup (session 28) : extra="forbid" sur schemas Update simples.
    model_config = ConfigDict(extra="forbid")
    label: str | None = None
    number: str | None = None
    country_code: str | None = None
    is_default: bool | None = None


class PhoneRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    label: str
    number: str
    country_code: str | None
    is_default: bool
    verified: bool = False
    verified_at: datetime | None = None
    created_at: datetime


# ─── Contact Emails (polymorphic) ────────────────────────────────────────

class ContactEmailCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    label: str = Field(default="work", max_length=50)
    email: EmailStr
    is_default: bool = False


class ContactEmailUpdate(BaseModel):
    # Bug #84 followup (session 28) : extra="forbid" sur schemas Update simples.
    model_config = ConfigDict(extra="forbid")
    label: str | None = None
    email: EmailStr | None = None
    is_default: bool | None = None


class ContactEmailRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    label: str
    email: str
    is_default: bool
    verified: bool = False
    verified_at: datetime | None = None
    created_at: datetime


# ─── Notes (polymorphic) ─────────────────────────────────────────────────

class NoteCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    content: str = Field(..., min_length=1)
    visibility: str = Field(default="public", pattern="^(public|private)$")
    pinned: bool = False


class NoteUpdate(BaseModel):
    content: str | None = None
    visibility: str | None = None
    pinned: bool | None = None


class NoteRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    content: str
    visibility: str
    pinned: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    author_name: str | None = None


# ─── Attachments (polymorphic) ───────────────────────────────────────────

class AttachmentRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    filename: str
    original_name: str
    content_type: str
    size_bytes: int
    description: str | None
    category: str | None = None
    file_hash_sha256: str | None = None
    uploaded_by: UUID
    entity_id: UUID | None
    created_at: datetime


# ─── Cost Imputations (polymorphic) ──────────────────────────────────────────

class CostImputationCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    imputation_reference_id: UUID | None = None
    project_id: UUID | None = None
    wbs_id: UUID | None = None
    cost_center_id: UUID | None = None
    percentage: float = Field(..., gt=0, le=100)
    cross_imputation: bool = False
    notes: str | None = None


class CostImputationUpdate(BaseModel):
    imputation_reference_id: UUID | None = None
    project_id: UUID | None = None
    wbs_id: UUID | None = None
    cost_center_id: UUID | None = None
    percentage: float | None = Field(None, gt=0, le=100)
    cross_imputation: bool | None = None
    notes: str | None = None


class CostImputationRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    imputation_reference_id: UUID | None
    project_id: UUID | None
    wbs_id: UUID | None
    cost_center_id: UUID | None
    percentage: float
    cross_imputation: bool
    notes: str | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Enriched (joined)
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None
    imputation_type: str | None = None
    otp_policy: str | None = None
    project_name: str | None = None
    cost_center_name: str | None = None
    author_name: str | None = None


# ─── Social Networks (polymorphic) ───────────────────────────────────────────

class SocialNetworkCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    network: str = Field(..., min_length=1, max_length=50)
    url: str = Field(..., min_length=1, max_length=500)
    label: str | None = None
    sort_order: int = 0


class SocialNetworkRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    network: str
    url: str
    label: str | None
    sort_order: int
    created_at: datetime


class SocialNetworkUpdate(BaseModel):
    network: str | None = None
    url: str | None = None
    label: str | None = None
    sort_order: int | None = None


# ─── Opening Hours (polymorphic) ───────────────────────────────────────────

class OpeningHourCreate(BaseModel):
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    day_of_week: int = Field(..., ge=0, le=6)
    open_time: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    close_time: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    is_closed: bool = False
    label: str | None = None


class OpeningHourRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    day_of_week: int
    open_time: str | None
    close_time: str | None
    is_closed: bool
    label: str | None
    created_at: datetime


class OpeningHourUpdate(BaseModel):
    day_of_week: int | None = Field(None, ge=0, le=6)
    open_time: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    close_time: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    is_closed: bool | None = None
    label: str | None = None


# ─── Notification Preferences ───────────────────────────────────────────────

class NotificationPreferenceRead(OpsFluxSchema):
    global_level: str
    notification_email_id: UUID | None
    notify_own_actions: bool
    group_overrides: dict | None


class NotificationPreferenceUpdate(BaseModel):
    global_level: str | None = None
    notification_email_id: UUID | None = None
    notify_own_actions: bool | None = None
    group_overrides: dict | None = None


# ─── Profile ────────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    language: str | None = Field(None, pattern="^[a-z]{2}(-[A-Z]{2})?$")
    # HR Identity (self-service)
    passport_name: str | None = None
    gender: str | None = None
    nationality: str | None = None
    birth_country: str | None = None
    birth_date: date | None = None
    birth_city: str | None = None
    # Travel
    contractual_airport: str | None = None
    nearest_airport: str | None = None
    nearest_station: str | None = None
    loyalty_program: str | None = None
    # Health / Medical
    last_medical_check: date | None = None
    last_international_medical_check: date | None = None
    last_subsidiary_medical_check: date | None = None
    # Body measurements / PPE
    height: int | None = None
    weight: float | None = None
    ppe_clothing_size: str | None = None
    ppe_clothing_size_bottom: str | None = None
    ppe_shoe_size: str | None = None
    # Misc
    retirement_date: date | None = None
    vantage_number: str | None = None
    extension_number: str | None = None
    # Job position (conformité)
    job_position_id: UUID | None = None
    # Messaging preference
    preferred_messaging_channel: str | None = Field(None, pattern="^(auto|whatsapp|sms|email)$")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


# ─── Audit Log ──────────────────────────────────────────────────────────────

class AuditLogRead(OpsFluxSchema):
    id: UUID
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: str | None
    details: dict | None
    ip_address: str | None
    created_at: datetime


# ─── MFA ───────────────────────────────────────────────────────────────

class MFASetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class MFAVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)


class MFABackupCodesResponse(BaseModel):
    backup_codes: list[str]


class MFADisableRequest(BaseModel):
    password: str = Field(..., min_length=1)


class MFAStatusRead(OpsFluxSchema):
    mfa_enabled: bool
    has_totp: bool


# ─── Search ────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    type: str
    id: str
    title: str
    subtitle: str | None
    url: str


class SearchResponse(BaseModel):
    results: list[SearchResult]


# ─── Email Templates ──────────────────────────────────────────────────────

class EmailTemplateCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    object_type: str = Field(default="system", max_length=50)
    enabled: bool = True
    variables_schema: dict[str, Any] | None = None


class EmailTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    object_type: str | None = None
    enabled: bool | None = None
    variables_schema: dict[str, Any] | None = None


class EmailTemplateVersionCreate(BaseModel):
    language: str = Field(default="fr", pattern="^[a-z]{2}(-[A-Z]{2})?$")
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    is_active: bool = False
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class EmailTemplateVersionUpdate(BaseModel):
    subject: str | None = None
    body_html: str | None = None
    is_active: bool | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class EmailTemplateVersionRead(OpsFluxSchema):
    id: UUID
    template_id: UUID
    version: int
    language: str
    subject: str
    body_html: str
    is_active: bool
    valid_from: datetime | None
    valid_until: datetime | None
    created_by: UUID | None
    created_at: datetime


class EmailTemplateLinkCreate(BaseModel):
    link_type: str = Field(..., min_length=1, max_length=50)
    link_id: UUID


class EmailTemplateLinkRead(OpsFluxSchema):
    id: UUID
    template_id: UUID
    link_type: str
    link_id: UUID


class EmailTemplateRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    slug: str
    name: str
    description: str | None
    object_type: str
    enabled: bool
    variables_schema: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    versions: list[EmailTemplateVersionRead] = []
    links: list[EmailTemplateLinkRead] = []


class EmailTemplateSummaryRead(OpsFluxSchema):
    """Lightweight read for list views (no versions/links)."""
    id: UUID
    entity_id: UUID
    slug: str
    name: str
    description: str | None
    object_type: str
    enabled: bool
    created_at: datetime
    updated_at: datetime
    active_languages: list[str] = []
    version_count: int = 0


class EmailTemplateCheckResponse(BaseModel):
    """Response for template availability check."""
    available: bool
    enabled: bool = False
    template_id: UUID | None = None
    active_languages: list[str] = []


class EmailPreviewRequest(BaseModel):
    """Request to preview a rendered template."""
    version_id: UUID
    variables: dict[str, Any] = Field(default_factory=dict)


# ─── Compliance / Conformite ────────────────────────────────────────────────


class ComplianceTypeRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    category: str
    code: str
    name: str
    description: str | None = None
    validity_days: int | None = None
    is_mandatory: bool
    active: bool
    compliance_source: str = "opsflux"
    external_provider: str | None = None
    external_mapping: dict | None = None
    created_at: datetime


class ComplianceTypeCreate(BaseModel):
    category: str = Field(..., pattern=r'^(formation|certification|habilitation|audit|medical|epi)$')
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    validity_days: int | None = None
    is_mandatory: bool = False
    compliance_source: str = "opsflux"
    external_provider: str | None = None
    external_mapping: dict | None = None


class ComplianceTypeUpdate(BaseModel):
    category: str | None = None
    code: str | None = None
    name: str | None = None
    description: str | None = None
    validity_days: int | None = None
    is_mandatory: bool | None = None
    active: bool | None = None
    compliance_source: str | None = None
    external_provider: str | None = None
    external_mapping: dict | None = None


class ComplianceAuthorizedCenterRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    compliance_type_id: UUID
    tier_id: UUID
    tier_name: str
    tier_code: str | None = None
    authorization_center_code: str | None = None
    certificate_verification_url: str | None = None
    active: bool
    accreditation_starts_at: date | None = None
    accreditation_ends_at: date | None = None
    notes: str | None = None
    created_at: datetime


class ComplianceAuthorizedCenterCreate(BaseModel):
    tier_id: UUID
    accreditation_starts_at: date | None = None
    accreditation_ends_at: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _validate_period(self):
        if self.accreditation_starts_at and self.accreditation_ends_at and self.accreditation_starts_at > self.accreditation_ends_at:
            raise ValueError("La date de debut d'accreditation doit etre avant la date de fin.")
        return self


class ComplianceAuthorizedCenterUpdate(BaseModel):
    active: bool | None = None
    accreditation_starts_at: date | None = None
    accreditation_ends_at: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _validate_period(self):
        if self.accreditation_starts_at and self.accreditation_ends_at and self.accreditation_starts_at > self.accreditation_ends_at:
            raise ValueError("La date de debut d'accreditation doit etre avant la date de fin.")
        return self


class ComplianceRuleRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    compliance_type_id: UUID
    subject_scope: str = "person"
    target_type: str
    target_value: str | None = None
    description: str | None = None
    active: bool
    # V2 fields
    version: int = 1
    effective_from: date | None = None
    effective_to: date | None = None
    priority: str = "normal"
    applicability: str = "permanent"  # permanent | contextual
    override_validity_days: int | None = None
    grace_period_days: int | None = None
    renewal_reminder_days: int | None = None
    attachment_required: bool = True
    condition_json: dict | None = None
    change_reason: str | None = None
    changed_by: UUID | None = None
    created_at: datetime


class ComplianceRuleCreate(BaseModel):
    compliance_type_id: UUID
    subject_scope: str = Field("person", pattern=r'^(person|company|asset|cargo|all)$')
    target_type: str = Field(..., pattern=r'^(tier|tier_type|tier_country|tier_industry|tier_tag|person_tag|asset|department|job_position|packlog_cargo|all)$')
    target_value: str | None = None
    description: str | None = None
    # V2 optional fields
    effective_from: date | None = None
    effective_to: date | None = None
    priority: str = "normal"
    applicability: str = "permanent"  # permanent | contextual
    override_validity_days: int | None = None
    grace_period_days: int | None = None
    renewal_reminder_days: int | None = None
    attachment_required: bool = True
    condition_json: dict | None = None


class ComplianceRuleUpdate(BaseModel):
    subject_scope: str | None = Field(None, pattern=r'^(person|company|asset|cargo|all)$')
    target_type: str | None = Field(None, pattern=r'^(tier|tier_type|tier_country|tier_industry|tier_tag|person_tag|asset|department|job_position|packlog_cargo|all)$')
    target_value: str | None = None
    description: str | None = None
    active: bool | None = None
    # V2 fields
    effective_from: date | None = None
    effective_to: date | None = None
    priority: str | None = None
    applicability: str | None = None  # permanent | contextual
    override_validity_days: int | None = None
    grace_period_days: int | None = None
    renewal_reminder_days: int | None = None
    attachment_required: bool | None = None
    condition_json: dict | None = None
    change_reason: str | None = None


class ComplianceRuleHistoryRead(OpsFluxSchema):
    id: UUID
    rule_id: UUID
    version: int
    action: str
    snapshot: dict
    change_reason: str | None = None
    changed_by: UUID | None = None
    changed_at: datetime


class ComplianceRecordRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    compliance_type_id: UUID
    owner_type: str
    owner_id: UUID
    status: str
    title: str | None = None
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    issuer: str | None = None
    issuer_tier_id: UUID | None = None
    issuer_tier_name: str | None = None
    reference_number: str | None = None
    notes: str | None = None
    external_verification_provider: str | None = None
    external_verification_id: str | None = None
    external_verification_checked_at: datetime | None = None
    external_verification_payload: dict | None = None
    created_by: UUID
    active: bool
    created_at: datetime
    # Verification (VerifiableMixin)
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None
    # Enriched
    type_name: str | None = None
    type_category: str | None = None
    type_compliance_source: str | None = None
    type_external_provider: str | None = None
    attachment_count: int = 0


class ComplianceRecordCreate(BaseModel):
    compliance_type_id: UUID
    owner_type: str = Field(..., pattern=r'^(tier_contact|tier|asset|user)$')
    owner_id: UUID
    title: str | None = None
    # status is NOT user-settable — always starts as "pending", promoted by verification
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    issuer: str | None = None
    issuer_tier_id: UUID | None = None
    reference_number: str | None = None
    notes: str | None = None
    staging_ref: UUID | None = None


class ComplianceRecordUpdate(BaseModel):
    # status is NOT user-settable — managed by verification workflow
    title: str | None = None
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    issuer: str | None = None
    issuer_tier_id: UUID | None = None
    reference_number: str | None = None
    notes: str | None = None


class ComplianceCheckResult(BaseModel):
    """Result of checking compliance for an object.

    Compliance hierarchy:
    1. Account must be verified (email or phone) → account_verified
    2. Permanent rules must be satisfied
    3. Contextual rules checked only when include_contextual=true
    4. is_compliant = account_verified AND no missing AND no expired
    """
    owner_type: str
    owner_id: UUID
    account_verified: bool = True
    """Whether the owner has at least one verified email or phone."""
    total_required: int
    total_valid: int
    total_expired: int
    total_missing: int
    total_unverified: int = 0
    """Records with verification_status != 'verified' (pending/rejected)."""
    is_compliant: bool
    details: list[dict] = Field(default_factory=list)


class ComplianceExemptionCreate(BaseModel):
    compliance_record_id: UUID
    reason: str = Field(..., min_length=1)
    start_date: date
    end_date: date
    conditions: str | None = None


class ComplianceExemptionUpdate(BaseModel):
    status: str | None = None
    conditions: str | None = None
    end_date: date | None = None


class ComplianceExemptionRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    compliance_record_id: UUID
    reason: str
    approved_by: UUID | None = None
    status: str
    start_date: date
    end_date: date
    conditions: str | None = None
    rejection_reason: str | None = None
    created_by: UUID
    active: bool
    created_at: datetime
    updated_at: datetime
    # Enriched fields
    record_type_name: str | None = None
    record_type_category: str | None = None
    owner_name: str | None = None
    approver_name: str | None = None
    creator_name: str | None = None


# ─── Job Positions / Fiches de Poste ─────────────────────────────────────────


class ComplianceAuditQuestionCreate(BaseModel):
    code: str | None = Field(None, max_length=50)
    text: str = Field(..., min_length=1)
    response_type: str = Field("score", pattern=r"^(score|yes_no|choice|text)$")
    weight: float = Field(1.0, ge=0)
    required: bool = True
    attachment_required: bool = False
    options_json: dict | None = None
    position: int = 0


class ComplianceAuditQuestionRead(OpsFluxSchema):
    id: UUID
    theme_id: UUID
    code: str | None = None
    text: str
    response_type: str
    weight: float
    required: bool
    attachment_required: bool
    options_json: dict | None = None
    position: int


class ComplianceAuditThemeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    weight: float = Field(1.0, ge=0)
    position: int = 0
    questions: list[ComplianceAuditQuestionCreate] = Field(default_factory=list)


class ComplianceAuditThemeRead(OpsFluxSchema):
    id: UUID
    template_id: UUID
    title: str
    description: str | None = None
    weight: float
    position: int
    questions: list[ComplianceAuditQuestionRead] = Field(default_factory=list)


class ComplianceAuditScoreThreshold(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=100)
    min_score: float = Field(..., ge=0, le=100)
    color: str | None = Field(None, max_length=30)
    blocks_assignment: bool = False


class ComplianceAuditTemplateCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    audit_type: str = Field(..., min_length=1, max_length=50)
    target_scope: str = Field("company", pattern=r"^(company)$")
    description: str | None = None
    passing_score: float = Field(70.0, ge=0, le=100)
    score_thresholds: list[ComplianceAuditScoreThreshold] = Field(default_factory=list)
    validity_days: int | None = Field(None, ge=1)
    themes: list[ComplianceAuditThemeCreate] = Field(default_factory=list)


class ComplianceAuditTemplateUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    audit_type: str | None = Field(None, max_length=50)
    description: str | None = None
    passing_score: float | None = Field(None, ge=0, le=100)
    score_thresholds: list[ComplianceAuditScoreThreshold] | None = None
    validity_days: int | None = Field(None, ge=1)
    active: bool | None = None


class ComplianceAuditTemplateRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    audit_type: str
    target_scope: str
    description: str | None = None
    passing_score: float
    score_thresholds: list[ComplianceAuditScoreThreshold] | None = None
    validity_days: int | None = None
    active: bool
    created_at: datetime
    updated_at: datetime
    themes: list[ComplianceAuditThemeRead] = Field(default_factory=list)


class ComplianceAuditAnswerUpsert(BaseModel):
    question_id: UUID
    response_value: dict | None = None
    score: float | None = Field(None, ge=0, le=100)
    notes: str | None = None


class ComplianceAuditCreate(BaseModel):
    template_id: UUID
    target_type: str = Field("tier", pattern=r"^(tier)$")
    target_id: UUID
    title: str | None = Field(None, max_length=200)
    planned_at: date | None = None
    summary: str | None = None


class ComplianceAuditUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    planned_at: date | None = None
    summary: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|in_progress|submitted|in_review|validated|rejected|closed)$")


class ComplianceAuditSubmit(BaseModel):
    validator_user_ids: list[UUID] = Field(default_factory=list)
    comment: str | None = None


class ComplianceAuditAnswerRead(OpsFluxSchema):
    id: UUID
    audit_id: UUID
    question_id: UUID
    response_value: dict | None = None
    score: float | None = None
    notes: str | None = None
    answered_by: UUID | None = None
    answered_at: datetime | None = None
    attachment_count: int = 0


class ComplianceAuditRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    template_id: UUID
    target_type: str
    target_id: UUID
    reference: str
    title: str
    status: str
    planned_at: date | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    validated_at: datetime | None = None
    valid_until: date | None = None
    score_percent: float | None = None
    summary: str | None = None
    validation_moc_id: UUID | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    template: ComplianceAuditTemplateRead | None = None
    answers: list[ComplianceAuditAnswerRead] = Field(default_factory=list)
    target_name: str | None = None
    score_category: ComplianceAuditScoreThreshold | None = None


class JobPositionRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    description: str | None = None
    department: str | None = None
    active: bool
    created_at: datetime


class JobPositionCreate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    department: str | None = None


class JobPositionUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    department: str | None = None
    active: bool | None = None


# ─── Employee Transfer Log ───────────────────────────────────────────────────


class TierContactTransferRead(OpsFluxSchema):
    id: UUID
    contact_id: UUID
    from_tier_id: UUID
    to_tier_id: UUID
    transfer_date: datetime
    reason: str | None = None
    new_job_position_id: UUID | None = None
    transferred_by: UUID
    created_at: datetime
    contact_name: str | None = None
    from_tier_name: str | None = None
    to_tier_name: str | None = None
    new_job_position_name: str | None = None


class TierContactTransferCreate(BaseModel):
    contact_id: UUID
    from_tier_id: UUID
    to_tier_id: UUID
    transfer_date: datetime
    reason: str | None = None
    new_job_position_id: UUID | None = None


# ─── Projects / Projets ─────────────────────────────────────────────────────


class ProjectRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    description: str | None = None
    status: str
    priority: str
    weather: str
    trend: str = "flat"
    color: str | None = None
    progress: int
    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_end_date: datetime | None = None
    budget: float | None = None
    currency: str = "XAF"
    manager_id: UUID | None = None
    parent_id: UUID | None = None
    tier_id: UUID | None = None
    asset_id: UUID | None = None
    external_ref: str | None = None  # e.g. "gouti:<id>" for imported projects
    project_type: str = "project"
    department_id: UUID | None = None
    # 'equal' | 'effort' | 'duration' | 'manual' | None (→ admin default)
    progress_weight_method: str | None = None
    active: bool
    archived: bool
    created_at: datetime
    # Enriched
    manager_name: str | None = None
    tier_name: str | None = None
    parent_name: str | None = None
    department_name: str | None = None
    task_count: int = 0
    member_count: int = 0
    children_count: int = 0


# Defined before ProjectCreate so `initial_tasks: list[ProjectInitialTask]`
# resolves at module-load time without needing a forward ref + model_rebuild.
class ProjectInitialTask(BaseModel):
    """Minimal task seed accepted inside `ProjectCreate.initial_tasks`.

    `predecessor_index` (optional) references another task defined
    earlier in the same list — at creation time the backend wires a
    ProjectTaskDependency from that task to this one, using
    `dependency_type` + `lag_days` just like a normal dep.
    """
    title: str = Field(..., min_length=1, max_length=300)
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    start_date: datetime | None = None
    due_date: datetime | None = None
    is_milestone: bool = False
    estimated_hours: float | None = Field(default=None, ge=0)
    # Antécédent — 0-based index into the same initial_tasks list of
    # the predecessor task. None = no dependency.
    predecessor_index: int | None = Field(default=None, ge=0)
    dependency_type: str = Field(
        default="finish_to_start",
        pattern=r"^(finish_to_start|start_to_start|finish_to_finish|start_to_finish)$",
    )
    lag_days: int = Field(default=0)


class ProjectCreate(BaseModel):
    # Auto-generated server-side via the PRJ numbering pattern when absent.
    code: str | None = Field(None, min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    project_type: str = "project"
    department_id: UUID | None = None
    # Bug #157 (QA schema hardening) : status/priority sans pattern ->
    # valeurs hors-enum acceptees silencieusement. Patterns alignes sur
    # le modele Project (commentaire colonne) ET frontend api.ts (types
    # TS identiques verifies). Enum FERME, pas de divergence.
    status: str = Field(default="draft", pattern=r"^(draft|planned|active|on_hold|completed|cancelled)$")
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    weather: str = "sunny"
    trend: str = Field(default="flat", pattern=r"^(up|flat|down)$")
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    # Currency: optional on create — backend defaults to entity.currency
    # if not provided. Each project can override its own currency.
    currency: str | None = None
    manager_id: UUID | None = None
    parent_id: UUID | None = None
    tier_id: UUID | None = None
    # Site / installation — REQUIRED for native creation per spec §1.4:
    # "Chaque projet doit être associé à un site ou une installation."
    # Gouti-imported projects bypass this schema (they go through
    # _upsert_project_from_gouti which constructs Project() directly), so
    # the Gouti import path remains unaffected and the user can fill the
    # asset later via PATCH (ProjectUpdate keeps it Optional).
    asset_id: UUID = Field(..., description="Site/installation rattachement (obligatoire)")
    # Optional override of how `progress` is computed. None → fall back to
    # the entity-scoped admin default.
    progress_weight_method: str | None = Field(
        default=None,
        pattern=r"^(equal|effort|duration|manual)$",
        description="Méthode de pondération pour calculer l'avancement projet",
    )
    # Client-generated UUID used during creation to stage polymorphic
    # children (attachments, notes, tags, …) before the project row exists.
    # On create, the backend re-targets every row with
    # `owner_type='project_staging'` + `owner_id=staging_ref` to the new project.
    staging_ref: UUID | None = None
    # Initial tasks to seed the new project with. FK-linked, created in
    # the same transaction. Minimal subset of ProjectTaskCreate — users
    # refine details (assignee, progress, etc.) later in the detail view.
    initial_tasks: list[ProjectInitialTask] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    """Bug #133 (QA v3 round 10) : `extra="forbid"` pour fail-fast sur
    champs typo. Avant fix : `PATCH {"FOO":"x"}` -> 200 silencieux. Le
    status est protege par RBAC route-level (transitions via permission
    check) mais les champs typo passaient silencieusement."""

    model_config = ConfigDict(extra="forbid")

    code: str | None = None
    name: str | None = None
    description: str | None = None
    # Bug #157 : patterns enum (cf ProjectCreate). status reste librement
    # PATCHable au niveau Pydantic (les transitions metier sont gerees par
    # RBAC route-level) mais une valeur hors-enum est desormais rejetee.
    status: str | None = Field(default=None, pattern=r"^(draft|planned|active|on_hold|completed|cancelled)$")
    priority: str | None = Field(default=None, pattern=r"^(low|medium|high|critical)$")
    weather: str | None = None
    trend: str | None = Field(default=None, pattern=r"^(up|flat|down)$")
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
    progress: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_end_date: datetime | None = None
    budget: float | None = None
    currency: str | None = None
    manager_id: UUID | None = None
    parent_id: UUID | None = None
    tier_id: UUID | None = None
    asset_id: UUID | None = None
    progress_weight_method: str | None = Field(
        default=None,
        pattern=r"^(equal|effort|duration|manual)$",
        description="Méthode de pondération pour calculer l'avancement projet (NULL pour utiliser le défaut admin)",
    )
    active: bool | None = None


class ProjectMemberRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    role: str
    allocation_pct: int = 100
    start_date: date | None = None
    end_date: date | None = None
    hourly_rate: float | None = None
    daily_rate: float | None = None
    currency: str | None = None
    specialty: str | None = None
    notes: str | None = None
    active: bool
    created_at: datetime
    # Enriched
    member_name: str | None = None
    avatar_url: str | None = None


class ProjectMemberCreate(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    role: str = "member"
    allocation_pct: int = Field(default=100, ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None
    hourly_rate: float | None = Field(default=None, ge=0)
    daily_rate: float | None = Field(default=None, ge=0)
    currency: str | None = None
    specialty: str | None = None
    notes: str | None = None


class ProjectMemberUpdate(BaseModel):
    role: str | None = None
    allocation_pct: int | None = Field(default=None, ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None
    hourly_rate: float | None = Field(default=None, ge=0)
    daily_rate: float | None = Field(default=None, ge=0)
    currency: str | None = None
    specialty: str | None = None
    notes: str | None = None
    active: bool | None = None


# ── Project task losses (pertes / waste) ───────────────────────────────

class ProjectTaskLossRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID
    task_id: UUID | None = None
    member_id: UUID | None = None
    date: _date_t
    category: str
    hours_lost: float | None = None
    cost_amount: float | None = None
    currency: str | None = None
    description: str
    reported_by: UUID | None = None
    created_at: datetime
    # Enriched
    task_title: str | None = None
    member_name: str | None = None
    reporter_name: str | None = None


class ProjectTaskLossCreate(BaseModel):
    task_id: UUID | None = None
    member_id: UUID | None = None
    date: _date_t
    category: str = Field(..., min_length=1, max_length=30)  # weather, material, equipment, manpower, contractual, accident, other
    hours_lost: float | None = Field(default=None, ge=0)
    cost_amount: float | None = Field(default=None, ge=0)
    currency: str | None = None
    description: str = Field(..., min_length=1)


class ProjectTaskLossUpdate(BaseModel):
    task_id: UUID | None = None
    member_id: UUID | None = None
    date: _date_t | None = None
    category: str | None = None
    hours_lost: float | None = Field(default=None, ge=0)
    cost_amount: float | None = Field(default=None, ge=0)
    currency: str | None = None
    description: str | None = None


# ── Project task allocations (affectation membre × tâche) ──────────────

class ProjectTaskAllocationRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID
    task_id: UUID
    member_id: UUID
    planned_hours: float
    allocation_pct: int
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    created_at: datetime
    # Enriched
    member_name: str | None = None
    task_title: str | None = None
    actual_hours: float | None = None  # validated time entries on this (task, member)


class ProjectTaskAllocationCreate(BaseModel):
    task_id: UUID
    member_id: UUID
    planned_hours: float = Field(default=0, ge=0)
    allocation_pct: int = Field(default=100, ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class ProjectTaskAllocationUpdate(BaseModel):
    planned_hours: float | None = Field(default=None, ge=0)
    allocation_pct: int | None = Field(default=None, ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


# ── Project time entries (pointage) ─────────────────────────────────────

class ProjectTimeEntryRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID
    member_id: UUID
    task_id: UUID | None = None
    date: _date_t
    hours: float
    description: str | None = None
    status: str
    rate_snapshot: float | None = None
    currency_snapshot: str | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    rejected_reason: str | None = None
    created_at: datetime
    # Enriched
    member_name: str | None = None
    task_title: str | None = None
    cost: float | None = None  # hours * rate_snapshot if available


class ProjectTimeEntryCreate(BaseModel):
    member_id: UUID
    task_id: UUID | None = None
    date: _date_t
    hours: float = Field(..., gt=0, le=24)
    description: str | None = None


class ProjectTimeEntryUpdate(BaseModel):
    task_id: UUID | None = None
    date: _date_t | None = None
    hours: float | None = Field(default=None, gt=0, le=24)
    description: str | None = None


class ProjectTimeEntryReject(BaseModel):
    reason: str = Field(..., min_length=1)


class ProjectTaskRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    parent_id: UUID | None = None
    wbs_node_id: UUID | None = None
    code: str | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    assignee_id: UUID | None = None
    progress: int
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    pob_quota: int = 0
    pob_quota_mode: str = "constant"
    pob_quota_daily: dict[str, int] | None = None
    # Manual weight — only used when the project's
    # progress_weight_method == 'manual'. Read-only computed weight is
    # NOT exposed; this is the user-set value only.
    weight: float | None = None
    order: int
    active: bool
    is_milestone: bool = False
    created_at: datetime
    # Enriched
    assignee_name: str | None = None
    # Number of PlannerActivity rows whose `source_task_id` points to
    # this task. Lets the UI surface a "linked to N Planner activity(ies)"
    # chip without making a per-row request.
    linked_planner_count: int = 0


class ProjectTaskEnriched(ProjectTaskRead):
    """Task with project info — for cross-project spreadsheet view."""
    project_code: str | None = None
    project_name: str | None = None


# ── Project Situation Snapshots (Métriques tab) ─────────────────────

class ProjectSituationCreate(BaseModel):
    """Payload for POST /projects/{id}/situations.

    Only the situation_summary, situation_text + (optional) weather/trend
    are user-driven.
    Progress and computed `metrics` are derived server-side from the
    current project state at capture time.
    """
    situation_summary: str | None = Field(default=None, max_length=220)
    situation_text: str | None = None
    # When set, also persists weather/trend on the Project row so the
    # KPI strip stays in sync with the latest snapshot.
    weather: str | None = None
    trend: str | None = None


class ProjectSituationRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    captured_at: datetime
    captured_by: UUID | None = None
    captured_by_name: str | None = None
    progress: int
    weather: str | None = None
    trend: str | None = None
    situation_summary: str | None = None
    situation_text: str | None = None
    metrics: dict[str, Any] = {}


class ProjectChangeRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID
    reference: str
    title: str
    change_type: str
    status: str
    priority: str
    source: str | None = None
    requested_by: UUID | None = None
    requested_by_name: str | None = None
    decided_by: UUID | None = None
    decided_by_name: str | None = None
    decided_at: datetime | None = None
    description: str | None = None
    decision_summary: str | None = None
    planning_impact_days: int | None = None
    budget_impact_amount: float | None = None
    currency: str | None = None
    affected_task_ids: list[str] | None = None
    impact_snapshot: dict[str, Any] | None = None
    attachment_count: int = 0
    active: bool
    created_at: datetime
    updated_at: datetime


class ProjectChangeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=220)
    change_type: str = Field(default="other", max_length=100)
    status: str = Field(default="draft", pattern=r"^(draft|submitted|approved|rejected|implemented|cancelled)$")
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    source: str | None = Field(default=None, max_length=100)
    description: str | None = None
    decision_summary: str | None = None
    planning_impact_days: int | None = None
    # Signed delta: a validated project change can increase or reduce budget.
    budget_impact_amount: float | None = None
    currency: str | None = Field(default=None, max_length=10)
    affected_task_ids: list[str] | None = None
    impact_snapshot: dict[str, Any] | None = None


class ProjectChangeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    change_type: str | None = Field(default=None, max_length=100)
    status: str | None = Field(default=None, pattern=r"^(draft|submitted|approved|rejected|implemented|cancelled)$")
    priority: str | None = Field(default=None, pattern=r"^(low|medium|high|critical)$")
    source: str | None = Field(default=None, max_length=100)
    description: str | None = None
    decision_summary: str | None = None
    planning_impact_days: int | None = None
    # Signed delta: a validated project change can increase or reduce budget.
    budget_impact_amount: float | None = None
    currency: str | None = Field(default=None, max_length=10)
    affected_task_ids: list[str] | None = None
    impact_snapshot: dict[str, Any] | None = None
    active: bool | None = None


class ProjectTaskCreate(BaseModel):
    """Bug #154 (QA200 round 39) : priority + status sans pattern Pydantic
    -> 'INVALID' acceptait silencieusement (insertion DB OK car les colonnes
    sont String sans CheckConstraint). Maintenant : patterns regex pour
    rejeter en 422 et garantir coherence enums."""

    parent_id: UUID | None = None
    wbs_node_id: UUID | None = None
    code: str | None = None
    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    status: str = Field(default="todo", pattern=r"^(todo|in_progress|review|done|cancelled)$")
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    assignee_id: UUID | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    estimated_hours: float | None = None
    pob_quota: int = Field(default=0, ge=0)
    pob_quota_mode: str = Field(default="constant", pattern=r"^(constant|variable)$")
    pob_quota_daily: dict[str, int] | None = None
    weight: float | None = Field(default=None, ge=0, description="Poids manuel pour le calcul d'avancement (utilisé en mode 'manual')")
    is_milestone: bool = Field(default=False, description="True crée un jalon (date unique = start_date = due_date, pas de sous-tâche).")


class ProjectTaskUpdate(BaseModel):
    """Bug #134 (QA v3 round 11) : extra=forbid pour fail-fast sur typos
    et champs immuables (id, project_id, created_at)."""

    model_config = ConfigDict(extra="forbid")

    parent_id: UUID | None = None
    wbs_node_id: UUID | None = None
    code: str | None = None
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: UUID | None = None
    progress: int | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    order: int | None = None
    pob_quota: int | None = Field(default=None, ge=0)
    pob_quota_mode: str | None = Field(default=None, pattern=r"^(constant|variable)$")
    pob_quota_daily: dict[str, int] | None = None
    weight: float | None = Field(default=None, ge=0)
    is_milestone: bool | None = None


class ProjectMilestoneRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    name: str
    description: str | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    status: str
    active: bool
    created_at: datetime


class ProjectMilestoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    due_date: datetime | None = None


class ProjectMilestoneUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    status: str | None = None


# ─── Planning Revisions ─────────────────────────────────────────────────────


class PlanningRevisionRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    revision_number: int
    name: str
    description: str | None = None
    is_active: bool
    is_simulation: bool
    snapshot_data: dict | None = None
    created_by: UUID
    active: bool
    created_at: datetime
    creator_name: str | None = None


class PlanningRevisionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    is_simulation: bool = False


class PlanningRevisionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_simulation: bool | None = None
    is_active: bool | None = None


# ─── Task Deliverables ──────────────────────────────────────────────────────


class TaskDeliverableRead(OpsFluxSchema):
    id: UUID
    task_id: UUID
    name: str
    type_code: str | None = None
    description: str | None = None
    status: str
    due_date: datetime | None = None
    delivered_at: datetime | None = None
    accepted_by: UUID | None = None
    active: bool
    created_at: datetime


class TaskDeliverableCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    type_code: str | None = Field(default=None, max_length=100)
    description: str | None = None
    status: str = "pending"
    due_date: datetime | None = None


class TaskDeliverableUpdate(BaseModel):
    name: str | None = None
    type_code: str | None = Field(default=None, max_length=100)
    description: str | None = None
    status: str | None = None
    due_date: datetime | None = None
    delivered_at: datetime | None = None
    accepted_by: UUID | None = None


# ─── Task Actions / Checklists ──────────────────────────────────────────────


class TaskActionRead(OpsFluxSchema):
    id: UUID
    task_id: UUID
    title: str
    completed: bool
    completed_at: datetime | None = None
    completed_by: UUID | None = None
    order: int
    active: bool
    created_at: datetime


class TaskActionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    completed: bool = False


class TaskActionUpdate(BaseModel):
    title: str | None = None
    completed: bool | None = None
    order: int | None = None


# ─── Task Change Log ────────────────────────────────────────────────────────


class TaskChangeLogRead(OpsFluxSchema):
    id: UUID
    task_id: UUID
    change_type: str
    field_name: str
    old_value: str | None = None
    new_value: str | None = None
    reason: str | None = None
    changed_by: UUID
    created_at: datetime
    author_name: str | None = None


# ─── Task Dependencies ──────────────────────────────────────────────────────


class TaskDependencyRead(OpsFluxSchema):
    id: UUID
    from_task_id: UUID
    to_task_id: UUID
    dependency_type: str
    lag_days: int


class TaskDependencyCreate(BaseModel):
    from_task_id: UUID
    to_task_id: UUID
    dependency_type: str = "finish_to_start"
    lag_days: int = 0


# ─── Project Task Assignees ──────────────────────────────────────────────────


class TaskAssigneeRead(OpsFluxSchema):
    id: UUID
    task_id: UUID
    user_id: UUID
    role: str
    user_name: str | None = None


class TaskAssigneeCreate(BaseModel):
    user_id: UUID
    role: str = "assignee"


# ─── Project Comments ────────────────────────────────────────────────────────


class ProjectCommentRead(OpsFluxSchema):
    id: UUID
    owner_type: str
    owner_id: UUID
    author_id: UUID
    body: str
    mentions: list[UUID] | None = None
    parent_id: UUID | None = None
    edited_at: datetime | None = None
    active: bool
    created_at: datetime
    author_name: str | None = None


class ProjectCommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)
    mentions: list[UUID] | None = None
    parent_id: UUID | None = None


class ProjectCommentUpdate(BaseModel):
    body: str | None = Field(None, min_length=1, max_length=10000)


# ─── Project Status History ──────────────────────────────────────────────────


class ProjectStatusHistoryRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    from_status: str | None = None
    to_status: str
    changed_by: UUID
    reason: str | None = None
    changed_at: datetime
    changed_by_name: str | None = None


# ─── Project WBS Nodes ──────────────────────────────────────────────────────


class ProjectWBSNodeRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    parent_id: UUID | None = None
    code: str
    name: str
    type_code: str | None = None
    description: str | None = None
    cost_center_id: UUID | None = None
    budget: float | None = None
    order: int
    active: bool
    # Enriched
    cost_center_name: str | None = None
    children_count: int = 0
    task_count: int = 0


class ProjectWBSNodeCreate(BaseModel):
    parent_id: UUID | None = None
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=300)
    type_code: str | None = Field(default=None, max_length=100)
    description: str | None = None
    cost_center_id: UUID | None = None
    budget: float | None = None
    order: int = 0


class ProjectWBSNodeUpdate(BaseModel):
    parent_id: UUID | None = None
    code: str | None = Field(None, min_length=1, max_length=50)
    name: str | None = Field(None, min_length=1, max_length=300)
    type_code: str | None = Field(default=None, max_length=100)
    description: str | None = None
    cost_center_id: UUID | None = None
    budget: float | None = None
    order: int | None = None


# ─── CPM (Critical Path Method) ─────────────────────────────────────────────


class CPMTaskInfo(OpsFluxSchema):
    id: UUID
    title: str
    early_start: int  # days from project start
    early_finish: int
    late_start: int
    late_finish: int
    slack: int  # total float = late_start - early_start
    is_critical: bool
    duration_days: int


class CPMResult(OpsFluxSchema):
    project_duration_days: int
    critical_path_task_ids: list[UUID]
    tasks: list[CPMTaskInfo]
    has_cycles: bool = False
    warnings: list[str] = []


# ─── PDF Templates ──────────────────────────────────────────────────────────


class PdfTemplateCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_.]*$")
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    object_type: str = Field(default="system", max_length=50)
    enabled: bool = True
    variables_schema: dict[str, Any] | None = None
    page_size: str = Field(default="A4", pattern="^(A4|A5|A6|Letter)$")
    orientation: str = Field(default="portrait", pattern="^(portrait|landscape)$")
    margin_top: int = Field(default=15, ge=0, le=100)
    margin_right: int = Field(default=12, ge=0, le=100)
    margin_bottom: int = Field(default=15, ge=0, le=100)
    margin_left: int = Field(default=12, ge=0, le=100)


class PdfTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    object_type: str | None = None
    enabled: bool | None = None
    variables_schema: dict[str, Any] | None = None
    page_size: str | None = Field(default=None, pattern="^(A4|A5|A6|Letter)$")
    orientation: str | None = Field(default=None, pattern="^(portrait|landscape)$")
    margin_top: int | None = Field(default=None, ge=0, le=100)
    margin_right: int | None = Field(default=None, ge=0, le=100)
    margin_bottom: int | None = Field(default=None, ge=0, le=100)
    margin_left: int | None = Field(default=None, ge=0, le=100)


class PdfTemplateVersionCreate(BaseModel):
    language: str = Field(default="fr", pattern="^[a-z]{2}(-[A-Z]{2})?$")
    body_html: str = Field(..., min_length=1)
    header_html: str | None = None
    footer_html: str | None = None
    is_published: bool = False


class PdfTemplateVersionUpdate(BaseModel):
    body_html: str | None = Field(default=None, min_length=1)
    header_html: str | None = None
    footer_html: str | None = None
    is_published: bool | None = None


class PdfTemplateVersionRead(OpsFluxSchema):
    id: UUID
    template_id: UUID
    version_number: int
    language: str
    body_html: str
    header_html: str | None = None
    footer_html: str | None = None
    is_published: bool
    created_by: UUID | None = None
    created_at: datetime


class PdfTemplateRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID | None = None
    slug: str
    name: str
    description: str | None = None
    object_type: str
    enabled: bool
    variables_schema: dict[str, Any] | None = None
    page_size: str
    orientation: str
    margin_top: int
    margin_right: int
    margin_bottom: int
    margin_left: int
    created_at: datetime
    updated_at: datetime
    versions: list[PdfTemplateVersionRead] = []


class PdfTemplateSummaryRead(OpsFluxSchema):
    """Lightweight read for list views (no versions)."""
    id: UUID
    entity_id: UUID | None = None
    slug: str
    name: str
    description: str | None = None
    object_type: str
    enabled: bool
    page_size: str
    orientation: str
    created_at: datetime
    updated_at: datetime
    published_languages: list[str] = []
    version_count: int = 0


class PdfPreviewRequest(BaseModel):
    """Request to preview a rendered PDF template."""
    version_id: UUID | None = None
    body_html: str | None = None
    header_html: str | None = None
    footer_html: str | None = None
    variables: dict[str, Any] = Field(default_factory=dict)
    output: str = Field(default="html", pattern="^(html|pdf)$")


class PdfTemplateValidationRequest(BaseModel):
    body_html: str = ""
    header_html: str | None = None
    footer_html: str | None = None
    variables_schema: dict[str, Any] | None = None


class PdfTemplateValidationIssue(OpsFluxSchema):
    level: str
    area: str
    message: str


class PdfTemplateValidationRead(OpsFluxSchema):
    valid: bool
    issues: list[PdfTemplateValidationIssue] = []
    referenced_variables: list[str] = []
    unknown_variables: list[str] = []


# ─── User Sub-Model Schemas ───────────────────────────────────────────────────

# UserPassport
class UserPassportCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    passport_type: str | None = None
    number: str
    country: str
    passport_name: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None

class UserPassportUpdate(BaseModel):
    passport_type: str | None = None
    number: str | None = None
    country: str | None = None
    passport_name: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None

class UserPassportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    passport_type: str | None = None
    number: str
    country: str
    passport_name: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None
    created_at: datetime
    updated_at: datetime
    # Verification
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None

# UserVisa
class UserVisaCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    visa_type: str
    number: str | None = None
    country: str
    issue_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None

class UserVisaUpdate(BaseModel):
    visa_type: str | None = None
    number: str | None = None
    country: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None

class UserVisaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    visa_type: str
    number: str | None = None
    country: str
    issue_date: date | None = None
    expiry_date: date | None = None
    document_url: str | None = None
    created_at: datetime
    updated_at: datetime
    # Verification
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None

# EmergencyContact
class EmergencyContactCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    relationship_type: str
    name: str
    phone_number: str | None = None
    email: str | None = None

class EmergencyContactUpdate(BaseModel):
    relationship_type: str | None = None
    name: str | None = None
    phone_number: str | None = None
    email: str | None = None

class EmergencyContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    relationship_type: str
    name: str
    phone_number: str | None = None
    email: str | None = None
    created_at: datetime
    updated_at: datetime

# SocialSecurity
class SocialSecurityCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    country: str
    number: str

class SocialSecurityUpdate(BaseModel):
    country: str | None = None
    number: str | None = None

class SocialSecurityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    country: str
    number: str
    created_at: datetime
    updated_at: datetime
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None

# UserVaccine
class UserVaccineCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    vaccine_type: str
    date_administered: date | None = None
    expiry_date: date | None = None
    batch_number: str | None = None

class UserVaccineUpdate(BaseModel):
    vaccine_type: str | None = None
    date_administered: date | None = None
    expiry_date: date | None = None
    batch_number: str | None = None

class UserVaccineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    vaccine_type: str
    date_administered: date | None = None
    expiry_date: date | None = None
    batch_number: str | None = None
    created_at: datetime
    updated_at: datetime
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None

# UserLanguage
class UserLanguageCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    language_code: str
    proficiency_level: str | None = None

class UserLanguageUpdate(BaseModel):
    language_code: str | None = None
    proficiency_level: str | None = None

class UserLanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    language_code: str
    proficiency_level: str | None = None
    created_at: datetime
    updated_at: datetime

# DrivingLicense
class DrivingLicenseCreate(BaseModel):
    user_id: UUID | None = None  # injected from URL path
    license_type: str
    country: str
    expiry_date: date | None = None
    document_url: str | None = None

class DrivingLicenseUpdate(BaseModel):
    license_type: str | None = None
    country: str | None = None
    expiry_date: date | None = None
    document_url: str | None = None

class DrivingLicenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    license_type: str
    country: str
    expiry_date: date | None = None
    document_url: str | None = None
    created_at: datetime
    updated_at: datetime
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None


# ─── MedicalCheck (polymorphic) ──────────────────────────────────────────

class MedicalCheckCreate(BaseModel):
    check_type: str
    check_date: date
    expiry_date: date | None = None
    provider: str | None = None
    notes: str | None = None
    document_url: str | None = None

class MedicalCheckUpdate(BaseModel):
    check_type: str | None = None
    check_date: date | None = None
    expiry_date: date | None = None
    provider: str | None = None
    notes: str | None = None
    document_url: str | None = None

class MedicalCheckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    owner_type: str
    owner_id: UUID
    check_type: str
    check_date: date
    expiry_date: date | None = None
    provider: str | None = None
    notes: str | None = None
    document_url: str | None = None
    created_at: datetime
    updated_at: datetime
    verification_status: str = "pending"
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None


# ─── UserSSOProvider ─────────────────────────────────────────────────────

class UserSSOProviderCreate(BaseModel):
    provider: str
    sso_subject: str
    email: str | None = None
    display_name: str | None = None

class UserSSOProviderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    provider: str
    sso_subject: str
    email: str | None = None
    display_name: str | None = None
    linked_at: datetime
    last_used_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# ─── DictionaryEntry ─────────────────────────────────────────────────────

class DictionaryEntryCreate(BaseModel):
    category: str
    code: str
    label: str
    sort_order: int = 0
    active: bool = True
    metadata_json: dict | None = None
    translations: dict | None = None

class DictionaryEntryUpdate(BaseModel):
    code: str | None = None
    label: str | None = None
    sort_order: int | None = None
    active: bool | None = None
    metadata_json: dict | None = None
    translations: dict | None = None

class DictionaryEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    category: str
    code: str
    label: str
    sort_order: int
    active: bool
    metadata_json: dict | None = None
    translations: dict | None = None
    created_at: datetime
    updated_at: datetime


# ─── User Health Conditions ──────────────────────────────────────────────────

class UserHealthConditionCreate(BaseModel):
    condition_code: str

class UserHealthConditionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    condition_code: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ─── Mobile QR Pairing (WhatsApp-Web style) ───────────────────────────────────

class MobilePairingGenerateResponse(BaseModel):
    """Response when the web asks for a fresh pairing token."""
    token: str  # Plaintext — displayed in QR, shown once
    qr_payload: str  # Full string to encode in the QR (JSON with api, token, v)
    expires_at: datetime
    ttl_seconds: int


class MobilePairingStatusResponse(BaseModel):
    """Polled by the web to know when the mobile has scanned."""
    status: str  # pending | consumed | expired | revoked
    consumed_at: datetime | None = None
    consumed_device_info: dict | None = None


class MobilePairingConsumeRequest(BaseModel):
    """Mobile posts the scanned token + its device info to exchange for JWT."""
    token: str
    device_info: dict = Field(
        default_factory=dict,
        description="Mobile device metadata (os, os_version, model, app_version, locale)",
    )


class MobilePairingConsumeResponse(BaseModel):
    """Same shape as LoginResponse, plus the user info bootstrap needs."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict  # { id, email, first_name, last_name, language, default_entity_id }
    entity_id: str | None = None


# ─── User Verifications (phone, email, location, ID, biometric) ───────────────

class VerificationStartPhoneRequest(BaseModel):
    phone_id: UUID
    preferred_channel: str | None = None  # 'whatsapp' | 'sms' | None = use entity default


class VerificationStartEmailRequest(BaseModel):
    email_id: UUID


class VerificationConfirmOtpRequest(BaseModel):
    verification_id: UUID
    otp: str = Field(min_length=4, max_length=10)


class VerificationLocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)
    altitude_m: float | None = None
    source: str = "gps"  # gps | network | fused
    captured_at: datetime | None = None


class VerificationIdDocumentRequest(BaseModel):
    id_document_type: str  # passport | national_id | driver_license
    front_attachment_id: UUID
    back_attachment_id: UUID | None = None
    selfie_attachment_id: UUID
    document_number: str | None = None
    issuing_country: str | None = None


class UserVerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    type: str
    status: str
    method: str
    verified_at: datetime | None = None
    expires_at: datetime | None = None
    rejection_reason: str | None = None
    evidence: dict | None = None
    created_at: datetime


# ─── i18n — Server-driven translations ────────────────────────────────────────

class I18nLanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    label: str
    english_label: str
    active: bool
    rtl: bool
    sort_order: int


class I18nLanguageCreate(BaseModel):
    code: str = Field(min_length=2, max_length=10)
    label: str
    english_label: str
    active: bool = True
    rtl: bool = False
    sort_order: int = 0


class I18nLanguageUpdate(BaseModel):
    label: str | None = None
    english_label: str | None = None
    active: bool | None = None
    rtl: bool | None = None
    sort_order: int | None = None


class I18nMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    key: str
    language_code: str
    namespace: str
    value: str
    notes: str | None = None
    updated_by: UUID | None = None
    updated_at: datetime


class I18nMessageUpsert(BaseModel):
    """Create-or-update — (key, language_code, namespace) is the natural key."""
    key: str = Field(min_length=1, max_length=255)
    language_code: str = Field(min_length=2, max_length=10)
    namespace: str = "mobile"
    value: str
    notes: str | None = None


class I18nMessageUpdate(BaseModel):
    value: str | None = None
    notes: str | None = None


class I18nCatalogResponse(BaseModel):
    """Public catalog response — flat dict of key -> value, plus meta."""
    language: str
    namespace: str
    hash: str
    messages: dict[str, str]
    count: int


class I18nCatalogMetaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    language_code: str
    namespace: str
    hash: str
    message_count: int
    updated_at: datetime


class I18nBulkUpsertItem(BaseModel):
    key: str
    value: str
    notes: str | None = None


class I18nBulkUpsertRequest(BaseModel):
    """Replace or upsert many keys for a single (language, namespace)."""
    language_code: str
    namespace: str = "mobile"
    messages: list[I18nBulkUpsertItem]
    replace: bool = False  # if true, delete keys not in this payload
