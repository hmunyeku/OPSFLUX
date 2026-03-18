"""Common Pydantic schemas — request/response models."""

from datetime import datetime
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
    language: str
    avatar_url: str | None
    last_login_at: datetime | None
    created_at: datetime


class UserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    password: str | None = Field(None, min_length=8)
    default_entity_id: UUID | None = None
    language: str = "fr"


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    default_entity_id: UUID | None = None
    language: str | None = None
    active: bool | None = None


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
    active: bool
    created_at: datetime


class AssetCreate(BaseModel):
    parent_id: UUID | None = None
    type: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    latitude: float | None = None
    longitude: float | None = None
    allow_overlap: bool = True
    metadata: dict[str, Any] | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    allow_overlap: bool | None = None
    active: bool | None = None
    metadata: dict[str, Any] | None = None


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
    description: str | None = None
    active: bool
    archived: bool
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
    description: str | None = None


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
    description: str | None = None
    active: bool | None = None


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


# ─── TierIdentifier schemas ────────────────────────────────────────────────

class TierIdentifierRead(OpsFluxSchema):
    id: UUID
    tier_id: UUID
    type: str
    value: str
    country: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None
    created_at: datetime


class TierIdentifierCreate(BaseModel):
    type: str = Field(..., min_length=1, max_length=50)
    value: str = Field(..., min_length=1, max_length=200)
    country: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None


class TierIdentifierUpdate(BaseModel):
    type: str | None = None
    value: str | None = None
    country: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None


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
    created_at: datetime


class ComplianceTypeCreate(BaseModel):
    category: str = Field(..., pattern=r'^(formation|certification|habilitation|audit|medical)$')
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    validity_days: int | None = None
    is_mandatory: bool = False


class ComplianceTypeUpdate(BaseModel):
    category: str | None = None
    code: str | None = None
    name: str | None = None
    description: str | None = None
    validity_days: int | None = None
    is_mandatory: bool | None = None
    active: bool | None = None


class ComplianceRuleRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    compliance_type_id: UUID
    target_type: str
    target_value: str | None = None
    description: str | None = None
    active: bool
    created_at: datetime


class ComplianceRuleCreate(BaseModel):
    compliance_type_id: UUID
    target_type: str = Field(..., pattern=r'^(tier_type|asset|department|all)$')
    target_value: str | None = None
    description: str | None = None


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
    verified_by: UUID | None = None
    created_by: UUID
    active: bool
    created_at: datetime
    # Enriched
    type_name: str | None = None
    type_category: str | None = None


class ComplianceRecordCreate(BaseModel):
    compliance_type_id: UUID
    owner_type: str = Field(..., pattern=r'^(tier_contact|tier|asset|user)$')
    owner_id: UUID
    status: str = "valid"
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
    """Result of checking compliance for an object."""
    owner_type: str
    owner_id: UUID
    total_required: int
    total_valid: int
    total_expired: int
    total_missing: int
    is_compliant: bool
    details: list[dict] = Field(default_factory=list)


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
    task_count: int = 0
    member_count: int = 0


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
