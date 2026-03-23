"""Common Pydantic schemas — request/response models."""

from datetime import date, datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

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
    """Second step of login: verify MFA code to get real tokens."""
    mfa_token: str
    code: str


class LoginResponse(BaseModel):
    """Union-style response: either full tokens or MFA challenge."""
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    mfa_required: bool = False
    mfa_token: str | None = None


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
    email: EmailStr | None = None
    first_name: str | None = None
    last_name: str | None = None
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

class DepartmentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    active: bool
    created_at: datetime | None = None

class DepartmentCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    active: bool = True

class DepartmentUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    active: bool | None = None

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


# ─── Asset schemas ───────────────────────────────────────────────────────────

class AssetRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    parent_id: UUID | None
    type: str
    code: str
    name: str
    path: str | None
    latitude: float | None
    longitude: float | None
    allow_overlap: bool
    max_pax: int | None
    permanent_ops_quota: int
    active: bool
    status: str
    created_at: datetime


class AssetCreate(BaseModel):
    parent_id: UUID | None = None
    type: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    latitude: float | None = None
    longitude: float | None = None
    allow_overlap: bool = True
    max_pax: int | None = None
    permanent_ops_quota: int = 0
    status: str = "operational"
    metadata: dict[str, Any] | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    allow_overlap: bool | None = None
    max_pax: int | None = None
    permanent_ops_quota: int | None = None
    active: bool | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None


# ─── Asset Type Config schemas ───────────────────────────────────────────────

class AssetTypeConfigRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    asset_type: str
    label: str
    icon_name: str | None
    icon_url: str | None
    color: str | None
    map_marker_shape: str
    is_fixed_installation: bool
    show_on_map: bool
    sort_order: int
    active: bool
    created_at: datetime
    updated_at: datetime


class AssetTypeConfigCreate(BaseModel):
    asset_type: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=200)
    icon_name: str | None = None
    icon_url: str | None = None
    color: str | None = None
    map_marker_shape: str = "circle"
    is_fixed_installation: bool = True
    show_on_map: bool = True
    sort_order: int = 0
    active: bool = True


class AssetTypeConfigUpdate(BaseModel):
    asset_type: str | None = None
    label: str | None = None
    icon_name: str | None = None
    icon_url: str | None = None
    color: str | None = None
    map_marker_shape: str | None = None
    is_fixed_installation: bool | None = None
    show_on_map: bool | None = None
    sort_order: int | None = None
    active: bool | None = None


# ─── Tier schemas ────────────────────────────────────────────────────────────

class TierRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: str
    alias: str | None = None
    type: str | None
    website: str | None = None
    # Legacy fields (prefer polymorphic phones/emails)
    phone: str | None = None
    email: str | None = None
    # Corporate
    legal_form: str | None = None
    capital: float | None = None
    currency: str = "XAF"
    industry: str | None = None
    payment_terms: str | None = None
    incoterm: str | None = None
    incoterm_city: str | None = None
    description: str | None = None
    active: bool
    archived: bool
    is_blocked: bool = False
    scope: str = "local"
    contact_count: int = 0
    created_at: datetime


class TierCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    alias: str | None = None
    type: str | None = None
    website: str | None = None
    legal_form: str | None = None
    capital: float | None = None
    currency: str = "XAF"
    industry: str | None = None
    payment_terms: str | None = None
    incoterm: str | None = None
    incoterm_city: str | None = None
    description: str | None = None
    scope: str = "local"


class TierUpdate(BaseModel):
    name: str | None = None
    alias: str | None = None
    type: str | None = None
    website: str | None = None
    legal_form: str | None = None
    capital: float | None = None
    currency: str | None = None
    industry: str | None = None
    payment_terms: str | None = None
    incoterm: str | None = None
    incoterm_city: str | None = None
    description: str | None = None
    active: bool | None = None
    scope: str | None = None


# ─── TierContact schemas ────────────────────────────────────────────────────

class TierContactRead(OpsFluxSchema):
    id: UUID
    tier_id: UUID
    civility: str | None = None
    first_name: str
    last_name: str
    position: str | None
    department: str | None = None
    is_primary: bool
    active: bool
    created_at: datetime


class TierContactWithTier(TierContactRead):
    """Contact enriched with parent tier info — for global contacts listing."""
    tier_name: str
    tier_code: str


class TierContactCreate(BaseModel):
    civility: str | None = None
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    position: str | None = None
    department: str | None = None
    is_primary: bool = False


class TierContactUpdate(BaseModel):
    civility: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    position: str | None = None
    department: str | None = None
    is_primary: bool | None = None
    active: bool | None = None


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
    owner_type: str = Field(..., min_length=1, max_length=50)
    owner_id: UUID
    label: str = Field(..., min_length=1, max_length=50)
    address_line1: str = Field(..., min_length=1, max_length=255)
    address_line2: str | None = None
    city: str = Field(..., min_length=1, max_length=100)
    state_province: str | None = None
    postal_code: str | None = None
    country: str = Field(..., min_length=1, max_length=100)
    latitude: float | None = None
    longitude: float | None = None
    is_default: bool = False


class AddressUpdate(BaseModel):
    label: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_default: bool | None = None


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
    uploaded_by: UUID
    created_at: datetime


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
    language: str | None = Field(None, pattern="^(fr|en)$")
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
    language: str = Field(default="fr", pattern="^(fr|en)$")
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


class ComplianceRuleRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    compliance_type_id: UUID
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
    condition_json: dict | None = None
    change_reason: str | None = None
    changed_by: UUID | None = None
    created_at: datetime


class ComplianceRuleCreate(BaseModel):
    compliance_type_id: UUID
    target_type: str = Field(..., pattern=r'^(tier_type|asset|department|job_position|all)$')
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
    condition_json: dict | None = None


class ComplianceRuleUpdate(BaseModel):
    target_type: str | None = Field(None, pattern=r'^(tier_type|asset|department|job_position|all)$')
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
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    issuer: str | None = None
    reference_number: str | None = None
    notes: str | None = None
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


class ComplianceRecordCreate(BaseModel):
    compliance_type_id: UUID
    owner_type: str = Field(..., pattern=r'^(tier_contact|tier|asset|user)$')
    owner_id: UUID
    status: str = "pending"  # starts pending, becomes valid after verification
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    issuer: str | None = None
    reference_number: str | None = None
    notes: str | None = None


class ComplianceRecordUpdate(BaseModel):
    status: str | None = None
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    issuer: str | None = None
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
    code: str = Field(..., min_length=1, max_length=50)
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
    transferred_by: UUID
    created_at: datetime
    contact_name: str | None = None
    from_tier_name: str | None = None
    to_tier_name: str | None = None


class TierContactTransferCreate(BaseModel):
    contact_id: UUID
    from_tier_id: UUID
    to_tier_id: UUID
    transfer_date: datetime
    reason: str | None = None


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
    progress: int
    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_end_date: datetime | None = None
    budget: float | None = None
    manager_id: UUID | None = None
    parent_id: UUID | None = None
    tier_id: UUID | None = None
    asset_id: UUID | None = None
    active: bool
    archived: bool
    created_at: datetime
    # Enriched
    manager_name: str | None = None
    tier_name: str | None = None
    parent_name: str | None = None
    task_count: int = 0
    member_count: int = 0
    children_count: int = 0


class ProjectCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    status: str = "draft"
    priority: str = "medium"
    weather: str = "sunny"
    start_date: datetime | None = None
    end_date: datetime | None = None
    budget: float | None = None
    manager_id: UUID | None = None
    parent_id: UUID | None = None
    tier_id: UUID | None = None
    asset_id: UUID | None = None


class ProjectUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    weather: str | None = None
    progress: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    actual_end_date: datetime | None = None
    budget: float | None = None
    manager_id: UUID | None = None
    parent_id: UUID | None = None
    tier_id: UUID | None = None
    asset_id: UUID | None = None
    active: bool | None = None


class ProjectMemberRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    user_id: UUID | None = None
    contact_id: UUID | None = None
    role: str
    active: bool
    created_at: datetime
    # Enriched
    member_name: str | None = None


class ProjectMemberCreate(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    role: str = "member"


class ProjectTaskRead(OpsFluxSchema):
    id: UUID
    project_id: UUID
    parent_id: UUID | None = None
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
    order: int
    active: bool
    created_at: datetime
    # Enriched
    assignee_name: str | None = None


class ProjectTaskEnriched(ProjectTaskRead):
    """Task with project info — for cross-project spreadsheet view."""
    project_code: str | None = None
    project_name: str | None = None


class ProjectTaskCreate(BaseModel):
    parent_id: UUID | None = None
    code: str | None = None
    title: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    status: str = "todo"
    priority: str = "medium"
    assignee_id: UUID | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    estimated_hours: float | None = None


class ProjectTaskUpdate(BaseModel):
    parent_id: UUID | None = None
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
    description: str | None = None
    status: str
    due_date: datetime | None = None
    delivered_at: datetime | None = None
    accepted_by: UUID | None = None
    active: bool
    created_at: datetime


class TaskDeliverableCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    status: str = "pending"
    due_date: datetime | None = None


class TaskDeliverableUpdate(BaseModel):
    name: str | None = None
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
    language: str = Field(default="fr", pattern="^(fr|en)$")
    body_html: str = Field(..., min_length=1)
    header_html: str | None = None
    footer_html: str | None = None
    is_published: bool = False


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
    version_id: UUID
    variables: dict[str, Any] = Field(default_factory=dict)
    output: str = Field(default="html", pattern="^(html|pdf)$")


# ─── User Sub-Model Schemas ───────────────────────────────────────────────────

# UserPassport
class UserPassportCreate(BaseModel):
    user_id: UUID
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
    user_id: UUID
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
    user_id: UUID
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
    user_id: UUID
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
    user_id: UUID
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
    user_id: UUID
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
    user_id: UUID
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
