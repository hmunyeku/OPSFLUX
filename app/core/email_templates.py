"""Email template rendering engine.

Resolves, renders, and sends templated emails:
  1. Looks up the active EmailTemplateVersion for a slug + entity + language
  2. Renders subject & body_html with Jinja2 variable substitution
  3. Sends via the existing send_email() function

If no template is found or template is disabled, returns None — the caller
decides whether to skip the action or fall back.

Usage:
    result = await render_and_send_email(
        db=db,
        slug="user_invitation",
        entity_id=entity_id,
        language="fr",
        to="user@example.com",
        variables={"user": {"first_name": "Alice", "email": "alice@example.com"}, "entity": {"name": "Perenco"}},
    )
    if result is None:
        # Template not configured — action should not be offered in UI
        pass
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from jinja2 import BaseLoader, Environment, TemplateSyntaxError, Undefined
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.common import EmailTemplate, EmailTemplateVersion

logger = logging.getLogger(__name__)

# Jinja2 env with sandboxed auto-escape (safe for HTML emails)
_jinja_env = Environment(
    loader=BaseLoader(),
    autoescape=True,
    undefined=Undefined,  # missing vars render as empty string
)


# ── Known template slugs with default variable schemas ─────────────────────
# These are seeded on first migration. The variables_schema documents
# which variables are available for substitution.

DEFAULT_TEMPLATES: list[dict] = [
    {
        "slug": "email_verification",
        "name": "Vérification d'adresse email",
        "description": "Envoyé quand un utilisateur ajoute une nouvelle adresse email.",
        "object_type": "user",
        "variables_schema": {
            "verification_url": "Lien de vérification",
            "user.first_name": "Prénom de l'utilisateur",
            "user.last_name": "Nom de l'utilisateur",
            "user.email": "Email de l'utilisateur",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Vérification de votre adresse email",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Veuillez cliquer sur le lien ci-dessous pour vérifier votre adresse email :</p>"
                    '<p><a href="{{ verification_url }}">{{ verification_url }}</a></p>'
                    "<p>Merci,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Verify your email address",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Please click the link below to verify your email address:</p>"
                    '<p><a href="{{ verification_url }}">{{ verification_url }}</a></p>'
                    "<p>Thank you,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "user_invitation",
        "name": "Invitation utilisateur",
        "description": "Envoyé quand un administrateur invite un nouvel utilisateur.",
        "object_type": "user",
        "variables_schema": {
            "invitation_url": "Lien d'inscription",
            "user.first_name": "Prénom de l'invité",
            "user.last_name": "Nom de l'invité",
            "user.email": "Email de l'invité",
            "inviter.first_name": "Prénom de l'inviteur",
            "inviter.last_name": "Nom de l'inviteur",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Vous êtes invité(e) à rejoindre {{ entity.name }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>{{ inviter.first_name }} {{ inviter.last_name }} vous invite à rejoindre "
                    "<strong>{{ entity.name }}</strong> sur OpsFlux.</p>"
                    '<p><a href="{{ invitation_url }}">Accepter l\'invitation</a></p>'
                    "<p>Cordialement,<br/>L'équipe OpsFlux</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — You're invited to join {{ entity.name }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>{{ inviter.first_name }} {{ inviter.last_name }} has invited you to join "
                    "<strong>{{ entity.name }}</strong> on OpsFlux.</p>"
                    '<p><a href="{{ invitation_url }}">Accept invitation</a></p>'
                    "<p>Best regards,<br/>The OpsFlux Team</p>"
                ),
            },
        },
    },
    {
        "slug": "password_reset",
        "name": "Réinitialisation de mot de passe",
        "description": "Envoyé quand un utilisateur demande la réinitialisation de son mot de passe.",
        "object_type": "user",
        "variables_schema": {
            "reset_url": "Lien de réinitialisation",
            "user.first_name": "Prénom",
            "user.email": "Email",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Réinitialisation de votre mot de passe",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Une demande de réinitialisation de mot de passe a été effectuée pour votre compte.</p>"
                    '<p><a href="{{ reset_url }}">Réinitialiser mon mot de passe</a></p>'
                    "<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Reset your password",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>A password reset request was made for your account.</p>"
                    '<p><a href="{{ reset_url }}">Reset my password</a></p>'
                    "<p>If you did not request this, please ignore this email.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "welcome",
        "name": "Bienvenue",
        "description": "Envoyé après la première connexion d'un utilisateur.",
        "object_type": "user",
        "variables_schema": {
            "login_url": "Lien de connexion",
            "user.first_name": "Prénom",
            "user.last_name": "Nom",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "Bienvenue sur OpsFlux — {{ entity.name }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Bienvenue sur OpsFlux ! Votre compte pour <strong>{{ entity.name }}</strong> est prêt.</p>"
                    '<p><a href="{{ login_url }}">Accéder à OpsFlux</a></p>'
                    "<p>Cordialement,<br/>L'équipe OpsFlux</p>"
                ),
            },
            "en": {
                "subject": "Welcome to OpsFlux — {{ entity.name }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Welcome to OpsFlux! Your account for <strong>{{ entity.name }}</strong> is ready.</p>"
                    '<p><a href="{{ login_url }}">Go to OpsFlux</a></p>'
                    "<p>Best regards,<br/>The OpsFlux Team</p>"
                ),
            },
        },
    },
]


# ── Rendering helpers ──────────────────────────────────────────────────────

def _flatten_variables(variables: dict, prefix: str = "") -> dict[str, str]:
    """Flatten nested dicts for Jinja2: {"user": {"first_name": "A"}} → {"user.first_name": "A", "user": {"first_name": "A"}}."""
    flat: dict = {}
    for key, value in variables.items():
        full_key = f"{prefix}{key}" if not prefix else f"{prefix}.{key}"
        if isinstance(value, dict):
            flat[key if not prefix else full_key] = value
            flat.update(_flatten_variables(value, key if not prefix else full_key))
        else:
            flat[full_key if prefix else key] = value
    return flat


def _make_dot_accessible(variables: dict) -> dict:
    """Create a template context that supports both {{ user.first_name }} and {{ verification_url }}."""
    ctx: dict = {}
    for key, value in variables.items():
        if isinstance(value, dict):
            # Nested object: user, entity, etc.
            ctx[key] = value
        else:
            ctx[key] = value
    return ctx


def render_template_string(template_str: str, variables: dict) -> str:
    """Render a Jinja2 template string with the given variables."""
    try:
        tpl = _jinja_env.from_string(template_str)
        return tpl.render(**_make_dot_accessible(variables))
    except TemplateSyntaxError as e:
        logger.warning("Template syntax error: %s", e)
        return template_str  # Return raw template on error


# ── Core resolve & render function ─────────────────────────────────────────

async def resolve_template_version(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
    language: str = "fr",
) -> EmailTemplateVersion | None:
    """Find the active version for a slug + entity + language.

    Resolution order:
      1. Active version in requested language within valid date range
      2. Active version in requested language (no date restriction)
      3. Fallback to any active version (other language)
      4. None if nothing found
    """
    now = datetime.now(UTC)

    # Get the template
    result = await db.execute(
        select(EmailTemplate)
        .options(selectinload(EmailTemplate.versions))
        .where(
            EmailTemplate.slug == slug,
            EmailTemplate.entity_id == entity_id,
            EmailTemplate.enabled == True,  # noqa: E712
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        return None

    # Filter active versions
    active_versions = [v for v in template.versions if v.is_active]
    if not active_versions:
        return None

    # 1. Exact language + within date range
    for v in active_versions:
        if v.language == language:
            if v.valid_from and v.valid_from > now:
                continue
            if v.valid_until and v.valid_until < now:
                continue
            return v

    # 2. Exact language, ignore dates
    for v in active_versions:
        if v.language == language:
            return v

    # 3. Fallback to any active version
    return active_versions[0] if active_versions else None


async def render_email(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
    language: str = "fr",
    variables: dict | None = None,
) -> tuple[str, str] | None:
    """Resolve and render a template. Returns (subject, body_html) or None."""
    version = await resolve_template_version(
        db, slug=slug, entity_id=entity_id, language=language,
    )
    if not version:
        return None

    ctx = variables or {}
    subject = render_template_string(version.subject, ctx)
    body_html = render_template_string(version.body_html, ctx)
    return subject, body_html


async def render_and_send_email(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
    language: str = "fr",
    to: str,
    variables: dict | None = None,
    from_name: str | None = None,
) -> bool:
    """Resolve, render, and send a templated email.

    Returns True if sent, False if template not found/disabled.
    """
    result = await render_email(
        db, slug=slug, entity_id=entity_id, language=language, variables=variables,
    )
    if result is None:
        logger.info("Email template '%s' not found or disabled for entity %s", slug, entity_id)
        return False

    subject, body_html = result

    from app.core.notifications import send_email
    await send_email(to=to, subject=subject, body_html=body_html, from_name=from_name)
    return True


async def is_template_available(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
) -> bool:
    """Check if a template is configured and enabled (for conditional UI)."""
    result = await db.execute(
        select(EmailTemplate.id)
        .where(
            EmailTemplate.slug == slug,
            EmailTemplate.entity_id == entity_id,
            EmailTemplate.enabled == True,  # noqa: E712
        )
    )
    template_id = result.scalar_one_or_none()
    if not template_id:
        return False

    # Check if at least one active version exists
    result2 = await db.execute(
        select(EmailTemplateVersion.id)
        .where(
            EmailTemplateVersion.template_id == template_id,
            EmailTemplateVersion.is_active == True,  # noqa: E712
        )
        .limit(1)
    )
    return result2.scalar_one_or_none() is not None
