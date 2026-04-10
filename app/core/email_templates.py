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


def _infer_notification_category_from_slug(slug: str) -> str | None:
    raw = (slug or "").strip().lower()
    if not raw:
        return None
    if "." in raw:
        return raw.split(".", 1)[0]

    aliases = {
        "ticket_comment": "support",
        "ticket_resolved": "support",
        "record_verified": "conformite",
        "welcome": "core",
        "user_invitation": "core",
        "password_reset": "core",
        "email_verification": "core",
        "paxlog_external_link_otp": None,
    }
    return aliases.get(raw)

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
        "slug": "paxlog_external_link_otp",
        "name": "PaxLog - OTP portail externe",
        "description": "Envoyé pour transmettre le lien externe PaxLog et le code OTP associé.",
        "object_type": "ads",
        "variables_schema": {
            "otp_code": "Code OTP à usage unique",
            "external_link_url": "Lien du portail externe",
            "otp_expires_minutes": "Durée de validité du code OTP en minutes",
            "ads.reference": "Référence de l'AdS",
            "ads.visit_purpose": "Objet de la visite",
            "ads.start_date": "Date de début",
            "ads.end_date": "Date de fin",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Code OTP et lien d'accès pour {{ ads.reference }}",
                "body_html": (
                    "<p>Bonjour,</p>"
                    "<p>Vous avez reçu un accès sécurisé au portail externe OpsFlux pour l'AdS <strong>{{ ads.reference }}</strong>.</p>"
                    "<p>Objet : {{ ads.visit_purpose }}</p>"
                    "<p>Période : {{ ads.start_date }} au {{ ads.end_date }}</p>"
                    "<p>Votre code OTP est :</p>"
                    "<p><strong style='font-size:20px'>{{ otp_code }}</strong></p>"
                    "<p>Utilisez ensuite ce lien :</p>"
                    '<p><a href="{{ external_link_url }}">{{ external_link_url }}</a></p>'
                    "<p>Le code expire dans {{ otp_expires_minutes }} minutes.</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — OTP code and access link for {{ ads.reference }}",
                "body_html": (
                    "<p>Hello,</p>"
                    "<p>You have received secure access to the OpsFlux external portal for AdS <strong>{{ ads.reference }}</strong>.</p>"
                    "<p>Purpose: {{ ads.visit_purpose }}</p>"
                    "<p>Period: {{ ads.start_date }} to {{ ads.end_date }}</p>"
                    "<p>Your OTP code is:</p>"
                    "<p><strong style='font-size:20px'>{{ otp_code }}</strong></p>"
                    "<p>Then use this link:</p>"
                    '<p><a href="{{ external_link_url }}">{{ external_link_url }}</a></p>'
                    "<p>This code expires in {{ otp_expires_minutes }} minutes.</p>"
                ),
            },
        },
    },
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
                    '<!DOCTYPE html>'
                    '<html lang="fr">'
                    "<head>"
                    '<meta charset="UTF-8">'
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
                    "<title>Invitation OpsFlux</title>"
                    "</head>"
                    '<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">'
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f9;">'
                    "<tr>"
                    "<td align=\"center\" style=\"padding:32px 16px;\">"
                    # ── Main container ──
                    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">'
                    # ── Header ──
                    "<tr>"
                    '<td style="background-color:#2563EB;padding:28px 40px;text-align:center;">'
                    '<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.5px;">OpsFlux</h1>'
                    "</td>"
                    "</tr>"
                    # ── Body ──
                    "<tr>"
                    '<td style="padding:40px 40px 16px 40px;">'
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "Bonjour {{ user.first_name }},"
                    "</p>"
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "{{ inviter.first_name }} {{ inviter.last_name }} vous invite à rejoindre "
                    "l'organisation <strong style=\"color:#2563EB;\">{{ entity.name }}</strong> sur OpsFlux."
                    "</p>"
                    '<p style="margin:0 0 24px 0;font-size:14px;color:#6b7280;line-height:1.6;">'
                    "OpsFlux est une plateforme ERP moderne pour la gestion des opérations, "
                    "de la conformité HSE, des ressources humaines et des projets."
                    "</p>"
                    # ── Entity badge ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">'
                    "<tr>"
                    '<td align="center">'
                    '<table role="presentation" cellspacing="0" cellpadding="0" border="0">'
                    "<tr>"
                    '<td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 24px;">'
                    '<p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Organisation</p>'
                    '<p style="margin:4px 0 0 0;font-size:18px;color:#1e40af;font-weight:600;">{{ entity.name }}</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    # ── CTA button ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">'
                    "<tr>"
                    '<td align="center">'
                    '<a href="{{ invitation_url }}" target="_blank" style="display:inline-block;background-color:#2563EB;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:6px;mso-padding-alt:0;">'
                    "<!--[if mso]><i style=\"mso-font-width:150%;mso-text-raise:24px;\">&#xA0;</i><![endif]-->"
                    "Accepter l'invitation"
                    "<!--[if mso]><i style=\"mso-font-width:150%;\">&#xA0;</i><![endif]-->"
                    "</a>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    # ── Next steps ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:#f9fafb;border-radius:6px;">'
                    "<tr>"
                    '<td style="padding:16px 20px;">'
                    '<p style="margin:0 0 8px 0;font-size:14px;color:#374151;font-weight:600;">Prochaines étapes :</p>'
                    '<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">'
                    "1. Cliquez sur le bouton ci-dessus<br/>"
                    "2. Créez votre mot de passe<br/>"
                    "3. Accédez à votre espace {{ entity.name }}"
                    "</p>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    # ── Expiry notice ──
                    '<p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;line-height:1.5;text-align:center;">'
                    "Ce lien d'invitation expirera dans <strong>24 heures</strong>."
                    "</p>"
                    '<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;text-align:center;">'
                    "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email."
                    "</p>"
                    "</td>"
                    "</tr>"
                    # ── Footer ──
                    "<tr>"
                    '<td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">'
                    '<p style="margin:0 0 4px 0;font-size:13px;color:#9ca3af;">Cordialement,</p>'
                    '<p style="margin:0;font-size:14px;color:#6b7280;font-weight:600;">L\'équipe OpsFlux</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</body>"
                    "</html>"
                ),
            },
            "en": {
                "subject": "OpsFlux — You're invited to join {{ entity.name }}",
                "body_html": (
                    '<!DOCTYPE html>'
                    '<html lang="en">'
                    "<head>"
                    '<meta charset="UTF-8">'
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
                    "<title>OpsFlux Invitation</title>"
                    "</head>"
                    '<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">'
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f9;">'
                    "<tr>"
                    "<td align=\"center\" style=\"padding:32px 16px;\">"
                    # ── Main container ──
                    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">'
                    # ── Header ──
                    "<tr>"
                    '<td style="background-color:#2563EB;padding:28px 40px;text-align:center;">'
                    '<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.5px;">OpsFlux</h1>'
                    "</td>"
                    "</tr>"
                    # ── Body ──
                    "<tr>"
                    '<td style="padding:40px 40px 16px 40px;">'
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "Hello {{ user.first_name }},"
                    "</p>"
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "{{ inviter.first_name }} {{ inviter.last_name }} has invited you to join "
                    "the organisation <strong style=\"color:#2563EB;\">{{ entity.name }}</strong> on OpsFlux."
                    "</p>"
                    '<p style="margin:0 0 24px 0;font-size:14px;color:#6b7280;line-height:1.6;">'
                    "OpsFlux is a modern ERP platform for operations management, "
                    "HSE compliance, human resources and project management."
                    "</p>"
                    # ── Entity badge ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">'
                    "<tr>"
                    '<td align="center">'
                    '<table role="presentation" cellspacing="0" cellpadding="0" border="0">'
                    "<tr>"
                    '<td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 24px;">'
                    '<p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Organisation</p>'
                    '<p style="margin:4px 0 0 0;font-size:18px;color:#1e40af;font-weight:600;">{{ entity.name }}</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    # ── CTA button ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">'
                    "<tr>"
                    '<td align="center">'
                    '<a href="{{ invitation_url }}" target="_blank" style="display:inline-block;background-color:#2563EB;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:6px;mso-padding-alt:0;">'
                    "<!--[if mso]><i style=\"mso-font-width:150%;mso-text-raise:24px;\">&#xA0;</i><![endif]-->"
                    "Accept Invitation"
                    "<!--[if mso]><i style=\"mso-font-width:150%;\">&#xA0;</i><![endif]-->"
                    "</a>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    # ── Next steps ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:#f9fafb;border-radius:6px;">'
                    "<tr>"
                    '<td style="padding:16px 20px;">'
                    '<p style="margin:0 0 8px 0;font-size:14px;color:#374151;font-weight:600;">What happens next:</p>'
                    '<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">'
                    "1. Click the button above<br/>"
                    "2. Set up your password<br/>"
                    "3. Access your {{ entity.name }} workspace"
                    "</p>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    # ── Expiry notice ──
                    '<p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;line-height:1.5;text-align:center;">'
                    "This invitation link will expire in <strong>24 hours</strong>."
                    "</p>"
                    '<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;text-align:center;">'
                    "If you did not expect this invitation, you can safely ignore this email."
                    "</p>"
                    "</td>"
                    "</tr>"
                    # ── Footer ──
                    "<tr>"
                    '<td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">'
                    '<p style="margin:0 0 4px 0;font-size:13px;color:#9ca3af;">Best regards,</p>'
                    '<p style="margin:0;font-size:14px;color:#6b7280;font-weight:600;">The OpsFlux Team</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</body>"
                    "</html>"
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
    # ── Workflow / Document templates ──────────────────────────────────────────
    {
        "slug": "workflow.validation_required",
        "name": "Validation requise",
        "description": "Envoyé aux valideurs quand un document est soumis pour approbation.",
        "object_type": "document",
        "variables_schema": {
            "document_number": "Numéro du document",
            "document_title": "Titre du document",
            "document_id": "ID du document (pour lien)",
            "workflow_step": "Étape du workflow",
            "comment": "Commentaire de soumission",
            "user.first_name": "Prénom du destinataire",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Validation requise : {{ document_number }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le document <strong>{{ document_number }}</strong> «{{ document_title }}» "
                    "a été soumis pour validation (étape : {{ workflow_step }}).</p>"
                    "{% if comment %}<p><em>Commentaire :</em> {{ comment }}</p>{% endif %}"
                    "<p>Merci de le consulter dans OpsFlux.</p>"
                    "<p>Cordialement,<br/>OpsFlux</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Validation required: {{ document_number }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Document <strong>{{ document_number }}</strong> &laquo;{{ document_title }}&raquo; "
                    "has been submitted for validation (step: {{ workflow_step }}).</p>"
                    "{% if comment %}<p><em>Comment:</em> {{ comment }}</p>{% endif %}"
                    "<p>Please review it in OpsFlux.</p>"
                    "<p>Best regards,<br/>OpsFlux</p>"
                ),
            },
        },
    },
    {
        "slug": "workflow.approved",
        "name": "Document approuvé",
        "description": "Envoyé à l'auteur quand son document est approuvé.",
        "object_type": "document",
        "variables_schema": {
            "document_number": "Numéro du document",
            "document_title": "Titre du document",
            "document_id": "ID du document",
            "user.first_name": "Prénom du destinataire",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Document approuvé : {{ document_number }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre document <strong>{{ document_number }}</strong> «{{ document_title }}» "
                    "a été <strong>approuvé</strong>.</p>"
                    "<p>Cordialement,<br/>OpsFlux</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Document approved: {{ document_number }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your document <strong>{{ document_number }}</strong> &laquo;{{ document_title }}&raquo; "
                    "has been <strong>approved</strong>.</p>"
                    "<p>Best regards,<br/>OpsFlux</p>"
                ),
            },
        },
    },
    {
        "slug": "workflow.rejected",
        "name": "Document rejeté",
        "description": "Envoyé à l'auteur quand son document est rejeté avec motif.",
        "object_type": "document",
        "variables_schema": {
            "document_number": "Numéro du document",
            "document_title": "Titre du document",
            "document_id": "ID du document",
            "rejection_reason": "Motif du rejet",
            "user.first_name": "Prénom du destinataire",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Document rejeté : {{ document_number }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre document <strong>{{ document_number }}</strong> «{{ document_title }}» "
                    "a été <strong>rejeté</strong>.</p>"
                    "{% if rejection_reason %}<p><em>Motif :</em> {{ rejection_reason }}</p>{% endif %}"
                    "<p>Veuillez effectuer les corrections nécessaires et soumettre à nouveau.</p>"
                    "<p>Cordialement,<br/>OpsFlux</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Document rejected: {{ document_number }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your document <strong>{{ document_number }}</strong> &laquo;{{ document_title }}&raquo; "
                    "has been <strong>rejected</strong>.</p>"
                    "{% if rejection_reason %}<p><em>Reason:</em> {{ rejection_reason }}</p>{% endif %}"
                    "<p>Please make the necessary corrections and resubmit.</p>"
                    "<p>Best regards,<br/>OpsFlux</p>"
                ),
            },
        },
    },
    {
        "slug": "document.published",
        "name": "Document publié",
        "description": "Envoyé aux destinataires des listes de distribution quand un document est publié.",
        "object_type": "document",
        "variables_schema": {
            "document_number": "Numéro du document",
            "document_title": "Titre du document",
            "document_id": "ID du document",
            "role": "Rôle du destinataire (to/cc/bcc)",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Nouveau document publié : {{ document_number }}",
                "body_html": (
                    "<p>Bonjour,</p>"
                    "<p>Le document <strong>{{ document_number }}</strong> «{{ document_title }}» "
                    "vient d'être publié.</p>"
                    "<p>Vous recevez ce message car vous êtes dans la liste de distribution "
                    "({{ role | default('cc') }}).</p>"
                    "<p>Cordialement,<br/>OpsFlux</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — New document published: {{ document_number }}",
                "body_html": (
                    "<p>Hello,</p>"
                    "<p>Document <strong>{{ document_number }}</strong> &laquo;{{ document_title }}&raquo; "
                    "has been published.</p>"
                    "<p>You are receiving this because you are on the distribution list "
                    "({{ role | default('cc') }}).</p>"
                    "<p>Best regards,<br/>OpsFlux</p>"
                ),
            },
        },
    },
    # ── ADS (Autorisation de Séjour) Templates ─────────────────────────────
    {
        "slug": "ads.submitted",
        "name": "AdS soumise",
        "description": "Envoyé au demandeur quand son AdS est soumise pour validation.",
        "object_type": "ads",
        "variables_schema": {
            "reference": "Référence de l'AdS",
            "ads_id": "ID de l'AdS (pour lien)",
            "pax_count": "Nombre de PAX dans l'AdS",
            "site_name": "Nom du site de destination",
            "start_date": "Date de début du séjour",
            "end_date": "Date de fin du séjour",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre AdS {{ reference }} a été soumise",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre Autorisation de Séjour <strong>{{ reference }}</strong> "
                    "a été soumise pour validation.</p>"
                    "<ul>"
                    "<li>Site : {{ site_name }}</li>"
                    "<li>Dates : {{ start_date }} — {{ end_date }}</li>"
                    "<li>PAX : {{ pax_count }}</li>"
                    "</ul>"
                    "<p>Vous serez notifié(e) dès qu'elle aura été examinée.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your AdS {{ reference }} has been submitted",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your Site Access Authorization <strong>{{ reference }}</strong> "
                    "has been submitted for validation.</p>"
                    "<ul>"
                    "<li>Site: {{ site_name }}</li>"
                    "<li>Dates: {{ start_date }} &mdash; {{ end_date }}</li>"
                    "<li>PAX: {{ pax_count }}</li>"
                    "</ul>"
                    "<p>You will be notified once it has been reviewed.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "ads.approved",
        "name": "AdS approuvée",
        "description": "Envoyé au demandeur et à la liste PAX quand l'AdS est approuvée.",
        "object_type": "ads",
        "variables_schema": {
            "reference": "Référence de l'AdS",
            "ads_id": "ID de l'AdS (pour lien)",
            "site_name": "Nom du site de destination",
            "start_date": "Date de début du séjour",
            "end_date": "Date de fin du séjour",
            "pax_count": "Nombre de PAX approuvés",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre AdS {{ reference }} a été approuvée",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre Autorisation de Séjour <strong>{{ reference }}</strong> "
                    "a été <strong>approuvée</strong>.</p>"
                    "<ul>"
                    "<li>Site : {{ site_name }}</li>"
                    "<li>Dates : {{ start_date }} — {{ end_date }}</li>"
                    "<li>PAX approuvés : {{ pax_count }}</li>"
                    "</ul>"
                    "<p>Le transport sera organisé prochainement.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your AdS {{ reference }} has been approved",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your Site Access Authorization <strong>{{ reference }}</strong> "
                    "has been <strong>approved</strong>.</p>"
                    "<ul>"
                    "<li>Site: {{ site_name }}</li>"
                    "<li>Dates: {{ start_date }} &mdash; {{ end_date }}</li>"
                    "<li>Approved PAX: {{ pax_count }}</li>"
                    "</ul>"
                    "<p>Transport arrangements will follow shortly.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "ads.rejected",
        "name": "AdS rejetée",
        "description": "Envoyé au demandeur quand son AdS est rejetée, avec le motif.",
        "object_type": "ads",
        "variables_schema": {
            "reference": "Référence de l'AdS",
            "ads_id": "ID de l'AdS (pour lien)",
            "rejection_reason": "Motif du rejet",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre AdS {{ reference }} a été rejetée",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre Autorisation de Séjour <strong>{{ reference }}</strong> "
                    "a été <strong>rejetée</strong>.</p>"
                    "{% if rejection_reason %}"
                    "<p><em>Motif :</em> {{ rejection_reason }}</p>"
                    "{% endif %}"
                    "<p>Veuillez corriger les points mentionnés et soumettre une nouvelle demande "
                    "si nécessaire.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your AdS {{ reference }} has been rejected",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your Site Access Authorization <strong>{{ reference }}</strong> "
                    "has been <strong>rejected</strong>.</p>"
                    "{% if rejection_reason %}"
                    "<p><em>Reason:</em> {{ rejection_reason }}</p>"
                    "{% endif %}"
                    "<p>Please correct the issues mentioned and submit a new request "
                    "if necessary.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "ads.compliance_failed",
        "name": "AdS non-conformités détectées",
        "description": "Envoyé au demandeur quand des non-conformités PAX sont détectées lors de la soumission.",
        "object_type": "ads",
        "variables_schema": {
            "reference": "Référence de l'AdS",
            "ads_id": "ID de l'AdS (pour lien)",
            "issues_summary": "Résumé des non-conformités (texte)",
            "blocked_pax_count": "Nombre de PAX bloqués",
            "total_pax_count": "Nombre total de PAX",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — AdS {{ reference }} : non-conformités détectées",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre Autorisation de Séjour <strong>{{ reference }}</strong> "
                    "présente des <strong>non-conformités</strong> pour certains PAX.</p>"
                    "<ul>"
                    "<li>PAX bloqués : {{ blocked_pax_count }} / {{ total_pax_count }}</li>"
                    "</ul>"
                    "{% if issues_summary %}"
                    "<p><em>Détail :</em> {{ issues_summary }}</p>"
                    "{% endif %}"
                    "<p>Veuillez régulariser les documents manquants ou expirés avant de "
                    "soumettre à nouveau.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — AdS {{ reference }}: compliance issues detected",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your Site Access Authorization <strong>{{ reference }}</strong> "
                    "has <strong>compliance issues</strong> for some PAX.</p>"
                    "<ul>"
                    "<li>Blocked PAX: {{ blocked_pax_count }} / {{ total_pax_count }}</li>"
                    "</ul>"
                    "{% if issues_summary %}"
                    "<p><em>Details:</em> {{ issues_summary }}</p>"
                    "{% endif %}"
                    "<p>Please ensure all missing or expired documents are updated before "
                    "resubmitting.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "ads.cancelled",
        "name": "AdS annulée",
        "description": "Envoyé au demandeur et aux PAX affectés quand l'AdS est annulée.",
        "object_type": "ads",
        "variables_schema": {
            "reference": "Référence de l'AdS",
            "ads_id": "ID de l'AdS (pour lien)",
            "site_name": "Nom du site",
            "start_date": "Date de début prévue",
            "end_date": "Date de fin prévue",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — L'AdS {{ reference }} a été annulée",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>L'Autorisation de Séjour <strong>{{ reference }}</strong> "
                    "a été <strong>annulée</strong>.</p>"
                    "<ul>"
                    "<li>Site : {{ site_name }}</li>"
                    "<li>Dates : {{ start_date }} — {{ end_date }}</li>"
                    "</ul>"
                    "<p>Si vous avez des questions, veuillez contacter le service logistique.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — AdS {{ reference }} has been cancelled",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Site Access Authorization <strong>{{ reference }}</strong> "
                    "has been <strong>cancelled</strong>.</p>"
                    "<ul>"
                    "<li>Site: {{ site_name }}</li>"
                    "<li>Dates: {{ start_date }} &mdash; {{ end_date }}</li>"
                    "</ul>"
                    "<p>If you have any questions, please contact the logistics department.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "ads.modified",
        "name": "AdS modifiée après approbation",
        "description": "Envoyé aux parties concernées quand une AdS approuvée est modifiée.",
        "object_type": "ads",
        "variables_schema": {
            "reference": "Référence de l'AdS",
            "ads_id": "ID de l'AdS (pour lien)",
            "changes_summary": "Résumé des modifications",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — L'AdS {{ reference }} a été modifiée après approbation",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>L'Autorisation de Séjour <strong>{{ reference }}</strong> "
                    "a été <strong>modifiée</strong> après son approbation.</p>"
                    "{% if changes_summary %}"
                    "<p><em>Modifications :</em> {{ changes_summary }}</p>"
                    "{% endif %}"
                    "<p>Veuillez vérifier les changements dans OpsFlux.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — AdS {{ reference }} modified after approval",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Site Access Authorization <strong>{{ reference }}</strong> "
                    "has been <strong>modified</strong> after approval.</p>"
                    "{% if changes_summary %}"
                    "<p><em>Changes:</em> {{ changes_summary }}</p>"
                    "{% endif %}"
                    "<p>Please review the changes in OpsFlux.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    # ── Planner Templates ──────────────────────────────────────────────────
    {
        "slug": "planner.activity.submitted",
        "name": "Activité soumise pour validation",
        "description": "Envoyé aux valideurs quand une activité est soumise pour validation.",
        "object_type": "planner_activity",
        "variables_schema": {
            "reference": "Référence de l'activité",
            "activity_id": "ID de l'activité (pour lien)",
            "title": "Titre de l'activité",
            "asset_name": "Nom de l'actif concerné",
            "planned_date": "Date prévue",
            "user.first_name": "Prénom du destinataire (valideur)",
            "submitter_name": "Nom du soumetteur",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Activité {{ reference }} soumise pour validation",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>L'activité <strong>{{ reference }}</strong> «{{ title }}» "
                    "a été soumise pour validation par {{ submitter_name }}.</p>"
                    "<ul>"
                    "<li>Actif : {{ asset_name }}</li>"
                    "<li>Date prévue : {{ planned_date }}</li>"
                    "</ul>"
                    "<p>Merci de la consulter dans OpsFlux.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Activity {{ reference }} submitted for validation",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Activity <strong>{{ reference }}</strong> &laquo;{{ title }}&raquo; "
                    "has been submitted for validation by {{ submitter_name }}.</p>"
                    "<ul>"
                    "<li>Asset: {{ asset_name }}</li>"
                    "<li>Planned date: {{ planned_date }}</li>"
                    "</ul>"
                    "<p>Please review it in OpsFlux.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "planner.activity.validated",
        "name": "Activité validée",
        "description": "Envoyé au demandeur quand son activité est validée.",
        "object_type": "planner_activity",
        "variables_schema": {
            "reference": "Référence de l'activité",
            "activity_id": "ID de l'activité (pour lien)",
            "title": "Titre de l'activité",
            "user.first_name": "Prénom du destinataire (demandeur)",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Activité {{ reference }} validée",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre activité <strong>{{ reference }}</strong> «{{ title }}» "
                    "a été <strong>validée</strong>.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Activity {{ reference }} validated",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your activity <strong>{{ reference }}</strong> &laquo;{{ title }}&raquo; "
                    "has been <strong>validated</strong>.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "planner.activity.rejected",
        "name": "Activité rejetée",
        "description": "Envoyé au demandeur quand son activité est rejetée, avec motif.",
        "object_type": "planner_activity",
        "variables_schema": {
            "reference": "Référence de l'activité",
            "activity_id": "ID de l'activité (pour lien)",
            "title": "Titre de l'activité",
            "rejection_reason": "Motif du rejet",
            "user.first_name": "Prénom du destinataire (demandeur)",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Activité {{ reference }} rejetée",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Votre activité <strong>{{ reference }}</strong> «{{ title }}» "
                    "a été <strong>rejetée</strong>.</p>"
                    "{% if rejection_reason %}"
                    "<p><em>Motif :</em> {{ rejection_reason }}</p>"
                    "{% endif %}"
                    "<p>Veuillez corriger les points mentionnés et soumettre à nouveau "
                    "si nécessaire.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Activity {{ reference }} rejected",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Your activity <strong>{{ reference }}</strong> &laquo;{{ title }}&raquo; "
                    "has been <strong>rejected</strong>.</p>"
                    "{% if rejection_reason %}"
                    "<p><em>Reason:</em> {{ rejection_reason }}</p>"
                    "{% endif %}"
                    "<p>Please correct the issues and resubmit if necessary.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "planner.activity.cancelled",
        "name": "Activité annulée",
        "description": "Envoyé aux parties concernées quand une activité est annulée.",
        "object_type": "planner_activity",
        "variables_schema": {
            "reference": "Référence de l'activité",
            "activity_id": "ID de l'activité (pour lien)",
            "title": "Titre de l'activité",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Activité {{ reference }} annulée",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>L'activité <strong>{{ reference }}</strong> «{{ title }}» "
                    "a été <strong>annulée</strong>.</p>"
                    "<p>Les demandes de séjour liées pourraient être impactées.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Activity {{ reference }} cancelled",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Activity <strong>{{ reference }}</strong> &laquo;{{ title }}&raquo; "
                    "has been <strong>cancelled</strong>.</p>"
                    "<p>Related site access requests may be affected.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "planner.conflict.detected",
        "name": "Conflit de planning détecté",
        "description": "Envoyé aux administrateurs/DO quand un conflit de capacité est détecté.",
        "object_type": "planner_conflict",
        "variables_schema": {
            "conflict_id": "ID du conflit (pour lien)",
            "asset_name": "Nom du site/actif en conflit",
            "conflict_date": "Date du conflit",
            "total_pax_requested": "Total PAX demandés",
            "max_capacity": "Capacité maximale du site",
            "user.first_name": "Prénom du destinataire (admin/DO)",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Conflit de planning détecté sur {{ asset_name }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Un <strong>conflit de capacité</strong> a été détecté :</p>"
                    "<ul>"
                    "<li>Site : {{ asset_name }}</li>"
                    "<li>Date : {{ conflict_date }}</li>"
                    "<li>PAX demandés : {{ total_pax_requested }}</li>"
                    "<li>Capacité maximale : {{ max_capacity }}</li>"
                    "</ul>"
                    "<p>Un arbitrage est requis. Veuillez consulter le planning dans OpsFlux.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Planning conflict detected on {{ asset_name }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>A <strong>capacity conflict</strong> has been detected:</p>"
                    "<ul>"
                    "<li>Site: {{ asset_name }}</li>"
                    "<li>Date: {{ conflict_date }}</li>"
                    "<li>PAX requested: {{ total_pax_requested }}</li>"
                    "<li>Maximum capacity: {{ max_capacity }}</li>"
                    "</ul>"
                    "<p>Arbitration is required. Please review the schedule in OpsFlux.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    # ── TravelWiz Templates ────────────────────────────────────────────────
    {
        "slug": "travelwiz.voyage.confirmed",
        "name": "Voyage confirmé",
        "description": "Envoyé aux PAX du manifeste quand un voyage est confirmé.",
        "object_type": "voyage",
        "variables_schema": {
            "code": "Code du voyage",
            "voyage_id": "ID du voyage (pour lien)",
            "departure_base": "Base de départ",
            "destination": "Destination",
            "scheduled_departure": "Date/heure de départ prévue",
            "transport_mode": "Mode de transport (hélicoptère, bateau, etc.)",
            "user.first_name": "Prénom du destinataire (passager)",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Voyage {{ code }} confirmé",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le voyage <strong>{{ code }}</strong> a été <strong>confirmé</strong>.</p>"
                    "<ul>"
                    "<li>Départ : {{ departure_base }}</li>"
                    "<li>Destination : {{ destination }}</li>"
                    "<li>Date de départ : {{ scheduled_departure }}</li>"
                    "<li>Transport : {{ transport_mode }}</li>"
                    "</ul>"
                    "<p>Veuillez vous présenter à l'heure indiquée avec vos documents à jour.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Voyage {{ code }} confirmed",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Voyage <strong>{{ code }}</strong> has been <strong>confirmed</strong>.</p>"
                    "<ul>"
                    "<li>Departure: {{ departure_base }}</li>"
                    "<li>Destination: {{ destination }}</li>"
                    "<li>Departure date: {{ scheduled_departure }}</li>"
                    "<li>Transport: {{ transport_mode }}</li>"
                    "</ul>"
                    "<p>Please report at the specified time with your documents up to date.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "travelwiz.manifest.validated",
        "name": "Manifeste validé",
        "description": "Envoyé au capitaine et aux PAX quand un manifeste est validé.",
        "object_type": "manifest",
        "variables_schema": {
            "code": "Code du voyage associé",
            "manifest_id": "ID du manifeste (pour lien)",
            "voyage_id": "ID du voyage (pour lien)",
            "passenger_count": "Nombre de passagers",
            "departure_base": "Base de départ",
            "destination": "Destination",
            "scheduled_departure": "Date/heure de départ prévue",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Manifeste {{ code }} validé",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le manifeste du voyage <strong>{{ code }}</strong> "
                    "a été <strong>validé</strong>.</p>"
                    "<ul>"
                    "<li>Passagers : {{ passenger_count }}</li>"
                    "<li>Départ : {{ departure_base }}</li>"
                    "<li>Destination : {{ destination }}</li>"
                    "<li>Date de départ : {{ scheduled_departure }}</li>"
                    "</ul>"
                    "<p>Le manifeste est désormais figé pour l'embarquement.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Manifest {{ code }} validated",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>The manifest for voyage <strong>{{ code }}</strong> "
                    "has been <strong>validated</strong>.</p>"
                    "<ul>"
                    "<li>Passengers: {{ passenger_count }}</li>"
                    "<li>Departure: {{ departure_base }}</li>"
                    "<li>Destination: {{ destination }}</li>"
                    "<li>Departure date: {{ scheduled_departure }}</li>"
                    "</ul>"
                    "<p>The manifest is now frozen for boarding.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "travelwiz.voyage.delayed",
        "name": "Voyage retardé",
        "description": "Envoyé aux opérateurs et passagers lorsqu'un voyage est retardé.",
        "object_type": "voyage",
        "variables_schema": {
            "code": "Code du voyage",
            "voyage_id": "ID du voyage",
            "delay_reason": "Motif du retard",
            "delay_hours": "Durée actuelle du retard en heures",
            "reassign_available": "Indique si des alternatives existent",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Voyage {{ code }} retardé",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le voyage <strong>{{ code }}</strong> est actuellement <strong>retardé</strong>.</p>"
                    "<ul>"
                    "<li>Retard constaté : {{ delay_hours }} h</li>"
                    "<li>Motif : {{ delay_reason | default('non renseigné') }}</li>"
                    "<li>Réassignation disponible : {{ reassign_available }}</li>"
                    "</ul>"
                    "<p>Veuillez consulter OpsFlux pour les consignes mises à jour.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Voyage {{ code }} delayed",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Voyage <strong>{{ code }}</strong> is currently <strong>delayed</strong>.</p>"
                    "<ul>"
                    "<li>Current delay: {{ delay_hours }} h</li>"
                    "<li>Reason: {{ delay_reason | default('not specified') }}</li>"
                    "<li>Reassignment available: {{ reassign_available }}</li>"
                    "</ul>"
                    "<p>Please consult OpsFlux for updated instructions.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "travelwiz.manifest.closed",
        "name": "Manifeste clôturé",
        "description": "Envoyé aux PAX quand un manifeste est clôturé (voyage terminé).",
        "object_type": "manifest",
        "variables_schema": {
            "code": "Code du voyage associé",
            "manifest_id": "ID du manifeste",
            "voyage_id": "ID du voyage",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Manifeste {{ code }} clôturé — voyage terminé",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le manifeste du voyage <strong>{{ code }}</strong> "
                    "a été <strong>clôturé</strong>. Le voyage est terminé.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Manifest {{ code }} closed &mdash; voyage completed",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>The manifest for voyage <strong>{{ code }}</strong> "
                    "has been <strong>closed</strong>. The voyage is complete.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    # ── Project templates ──────────────────────────────────────────────────
    {
        "slug": "project.status.changed",
        "name": "Statut projet modifié",
        "description": "Envoyé aux parties prenantes quand le statut d'un projet change.",
        "object_type": "project",
        "variables_schema": {
            "project_id": "ID du projet",
            "project_code": "Code du projet",
            "project_name": "Nom du projet",
            "old_status": "Ancien statut",
            "new_status": "Nouveau statut",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Projet {{ project_code | default(project_name) }} : statut mis à jour",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le projet <strong>{{ project_code | default(project_name) }}</strong>"
                    "{% if project_name and project_name != project_code %} «{{ project_name }}»{% endif %} "
                    "a changé de statut.</p>"
                    "<ul>"
                    "{% if old_status %}<li>Ancien statut : {{ old_status }}</li>{% endif %}"
                    "<li>Nouveau statut : {{ new_status }}</li>"
                    "</ul>"
                    "<p>Veuillez consulter le projet dans OpsFlux si une action est requise.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Project {{ project_code | default(project_name) }}: status updated",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Project <strong>{{ project_code | default(project_name) }}</strong>"
                    "{% if project_name and project_name != project_code %} &laquo;{{ project_name }}&raquo;{% endif %} "
                    "has changed status.</p>"
                    "<ul>"
                    "{% if old_status %}<li>Previous status: {{ old_status }}</li>{% endif %}"
                    "<li>New status: {{ new_status }}</li>"
                    "</ul>"
                    "<p>Please review the project in OpsFlux if action is required.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "project.task.assigned",
        "name": "Tâche projet assignée",
        "description": "Envoyé à un utilisateur quand il est assigné à une tâche projet.",
        "object_type": "project_task",
        "variables_schema": {
            "project_id": "ID du projet",
            "project_code": "Code du projet",
            "project_name": "Nom du projet",
            "task_id": "ID de la tâche",
            "task_title": "Titre de la tâche",
            "task_role": "Rôle d'assignation",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Nouvelle assignation sur {{ project_code | default(project_name) }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Vous avez été assigné(e) à la tâche <strong>{{ task_title }}</strong>.</p>"
                    "<ul>"
                    "<li>Projet : {{ project_code | default(project_name) }}{% if project_name and project_name != project_code %} — {{ project_name }}{% endif %}</li>"
                    "{% if task_role %}<li>Rôle : {{ task_role }}</li>{% endif %}"
                    "</ul>"
                    "<p>Veuillez consulter le projet dans OpsFlux pour plus de détails.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — New assignment on {{ project_code | default(project_name) }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>You have been assigned to task <strong>{{ task_title }}</strong>.</p>"
                    "<ul>"
                    "<li>Project: {{ project_code | default(project_name) }}{% if project_name and project_name != project_code %} — {{ project_name }}{% endif %}</li>"
                    "{% if task_role %}<li>Role: {{ task_role }}</li>{% endif %}"
                    "</ul>"
                    "<p>Please review the project in OpsFlux for details.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    # ── Tier templates ─────────────────────────────────────────────────────
    {
        "slug": "tier.blocked",
        "name": "Tiers bloqué",
        "description": "Envoyé aux contacts référents quand un tiers est bloqué.",
        "object_type": "tier",
        "variables_schema": {
            "tier_id": "ID du tiers",
            "tier_code": "Code du tiers",
            "tier_name": "Nom du tiers",
            "reason": "Motif du blocage",
            "block_type": "Type de blocage",
            "performed_by_name": "Nom de l'auteur",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre tiers {{ tier_code | default(tier_name) }} a été bloqué",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le tiers <strong>{{ tier_code | default(tier_name) }}</strong>"
                    "{% if tier_name and tier_name != tier_code %} — {{ tier_name }}{% endif %} "
                    "a été <strong>bloqué</strong>.</p>"
                    "<ul>"
                    "{% if block_type %}<li>Type : {{ block_type }}</li>{% endif %}"
                    "{% if reason %}<li>Motif : {{ reason }}</li>{% endif %}"
                    "{% if performed_by_name %}<li>Par : {{ performed_by_name }}</li>{% endif %}"
                    "</ul>"
                    "<p>Veuillez contacter votre interlocuteur OpsFlux si nécessaire.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your tier {{ tier_code | default(tier_name) }} has been blocked",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Tier <strong>{{ tier_code | default(tier_name) }}</strong>"
                    "{% if tier_name and tier_name != tier_code %} — {{ tier_name }}{% endif %} "
                    "has been <strong>blocked</strong>.</p>"
                    "<ul>"
                    "{% if block_type %}<li>Type: {{ block_type }}</li>{% endif %}"
                    "{% if reason %}<li>Reason: {{ reason }}</li>{% endif %}"
                    "{% if performed_by_name %}<li>By: {{ performed_by_name }}</li>{% endif %}"
                    "</ul>"
                    "<p>Please contact your OpsFlux counterpart if needed.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "tier.unblocked",
        "name": "Tiers débloqué",
        "description": "Envoyé aux contacts référents quand un tiers est débloqué.",
        "object_type": "tier",
        "variables_schema": {
            "tier_id": "ID du tiers",
            "tier_code": "Code du tiers",
            "tier_name": "Nom du tiers",
            "reason": "Motif du déblocage",
            "performed_by_name": "Nom de l'auteur",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre tiers {{ tier_code | default(tier_name) }} a été débloqué",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Le tiers <strong>{{ tier_code | default(tier_name) }}</strong>"
                    "{% if tier_name and tier_name != tier_code %} — {{ tier_name }}{% endif %} "
                    "a été <strong>débloqué</strong>.</p>"
                    "<ul>"
                    "{% if reason %}<li>Motif : {{ reason }}</li>{% endif %}"
                    "{% if performed_by_name %}<li>Par : {{ performed_by_name }}</li>{% endif %}"
                    "</ul>"
                    "<p>L'accès opérationnel peut reprendre selon les règles en vigueur.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your tier {{ tier_code | default(tier_name) }} has been unblocked",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>Tier <strong>{{ tier_code | default(tier_name) }}</strong>"
                    "{% if tier_name and tier_name != tier_code %} — {{ tier_name }}{% endif %} "
                    "has been <strong>unblocked</strong>.</p>"
                    "<ul>"
                    "{% if reason %}<li>Reason: {{ reason }}</li>{% endif %}"
                    "{% if performed_by_name %}<li>By: {{ performed_by_name }}</li>{% endif %}"
                    "</ul>"
                    "<p>Operational access may resume according to current rules.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    # ── Compliance verification templates ─────────────────────────────────────
    {
        "slug": "conformite.rule.changed",
        "name": "Exigence de conformité créée ou mise à jour",
        "description": "Envoyé aux utilisateurs affectés lorsqu'une exigence de conformité est créée ou modifiée.",
        "object_type": "compliance_rule",
        "variables_schema": {
            "rule_id": "ID de la règle",
            "action_label": "Libellé de l'action",
            "description": "Description de la règle",
            "target_type": "Type de cible",
            "target_value": "Valeur de cible",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — {{ action_label }} de conformité",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p><strong>{{ action_label }}</strong> dans votre périmètre de conformité.</p>"
                    "{% if description %}<p>{{ description }}</p>{% endif %}"
                    "<ul>"
                    "<li>Cible : {{ target_type }}{% if target_value %} — {{ target_value }}{% endif %}</li>"
                    "</ul>"
                    "<p>Veuillez consulter le module Conformité dans OpsFlux.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — {{ action_label }} compliance requirement",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p><strong>{{ action_label }}</strong> in your compliance scope.</p>"
                    "{% if description %}<p>{{ description }}</p>{% endif %}"
                    "<ul>"
                    "<li>Target: {{ target_type }}{% if target_value %} — {{ target_value }}{% endif %}</li>"
                    "</ul>"
                    "<p>Please review the Compliance module in OpsFlux.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "record_verified",
        "name": "Document vérifié/rejeté",
        "description": "Envoyé quand un document soumis est vérifié ou rejeté par un validateur.",
        "object_type": "compliance",
        "variables_schema": {
            "user.first_name": "Prénom du propriétaire",
            "user.email": "Email du propriétaire",
            "record_type": "Type de document (Passeport, Visa, etc.)",
            "record_description": "Description du document",
            "action": "Action effectuée (vérifié/rejeté)",
            "verifier_name": "Nom du vérificateur",
            "rejection_reason": "Motif du rejet (si rejeté)",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre document a été {{ action }}",
                "body_html": (
                    '<!DOCTYPE html>'
                    '<html lang="fr">'
                    "<head>"
                    '<meta charset="UTF-8">'
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
                    "<title>Document {{ action }}</title>"
                    "</head>"
                    '<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">'
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f9;">'
                    "<tr>"
                    "<td align=\"center\" style=\"padding:32px 16px;\">"
                    # ── Main container ──
                    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">'
                    # ── Header ──
                    "<tr>"
                    '<td style="background-color:#2563EB;padding:28px 40px;text-align:center;">'
                    '<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.5px;">OpsFlux</h1>'
                    "</td>"
                    "</tr>"
                    # ── Body ──
                    "<tr>"
                    '<td style="padding:40px 40px 16px 40px;">'
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "Bonjour {{ user.first_name }},"
                    "</p>"
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "Votre document <strong>{{ record_type }}</strong>"
                    "{% if record_description %} ({{ record_description }}){% endif %}"
                    " a été <strong>{{ action }}</strong> par {{ verifier_name }}."
                    "</p>"
                    # ── Verified: green success box ──
                    "{% if action == 'vérifié' %}"
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">'
                    "<tr>"
                    '<td style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;">'
                    '<p style="margin:0;font-size:14px;color:#166534;line-height:1.6;">'
                    "&#10003; Votre document a été vérifié avec succès. Aucune action supplémentaire n'est requise."
                    "</p>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "{% endif %}"
                    # ── Rejected: red reason box ──
                    "{% if action == 'rejeté' %}"
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">'
                    "<tr>"
                    '<td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 20px;">'
                    '<p style="margin:0 0 8px 0;font-size:14px;color:#991b1b;font-weight:600;">Motif du rejet :</p>'
                    '<p style="margin:0;font-size:14px;color:#991b1b;line-height:1.6;">'
                    "{{ rejection_reason }}"
                    "</p>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    '<p style="margin:0 0 20px 0;font-size:14px;color:#6b7280;line-height:1.6;">'
                    "Veuillez effectuer les corrections nécessaires et soumettre à nouveau votre document."
                    "</p>"
                    "{% endif %}"
                    # ── Entity badge ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">'
                    "<tr>"
                    '<td align="center">'
                    '<table role="presentation" cellspacing="0" cellpadding="0" border="0">'
                    "<tr>"
                    '<td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 24px;">'
                    '<p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Organisation</p>'
                    '<p style="margin:4px 0 0 0;font-size:18px;color:#1e40af;font-weight:600;">{{ entity.name }}</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    # ── Footer ──
                    "<tr>"
                    '<td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">'
                    '<p style="margin:0 0 4px 0;font-size:13px;color:#9ca3af;">Cordialement,</p>'
                    '<p style="margin:0;font-size:14px;color:#6b7280;font-weight:600;">L\'équipe OpsFlux</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</body>"
                    "</html>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your document has been {{ action }}",
                "body_html": (
                    '<!DOCTYPE html>'
                    '<html lang="en">'
                    "<head>"
                    '<meta charset="UTF-8">'
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
                    "<title>Document {{ action }}</title>"
                    "</head>"
                    '<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">'
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f9;">'
                    "<tr>"
                    "<td align=\"center\" style=\"padding:32px 16px;\">"
                    # ── Main container ──
                    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">'
                    # ── Header ──
                    "<tr>"
                    '<td style="background-color:#2563EB;padding:28px 40px;text-align:center;">'
                    '<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.5px;">OpsFlux</h1>'
                    "</td>"
                    "</tr>"
                    # ── Body ──
                    "<tr>"
                    '<td style="padding:40px 40px 16px 40px;">'
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "Hello {{ user.first_name }},"
                    "</p>"
                    '<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">'
                    "Your document <strong>{{ record_type }}</strong>"
                    "{% if record_description %} ({{ record_description }}){% endif %}"
                    " has been <strong>{{ action }}</strong> by {{ verifier_name }}."
                    "</p>"
                    # ── Verified: green success box ──
                    "{% if action == 'verified' %}"
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">'
                    "<tr>"
                    '<td style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;">'
                    '<p style="margin:0;font-size:14px;color:#166534;line-height:1.6;">'
                    "&#10003; Your document has been successfully verified. No further action is required."
                    "</p>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "{% endif %}"
                    # ── Rejected: red reason box ──
                    "{% if action == 'rejected' %}"
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">'
                    "<tr>"
                    '<td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 20px;">'
                    '<p style="margin:0 0 8px 0;font-size:14px;color:#991b1b;font-weight:600;">Rejection reason:</p>'
                    '<p style="margin:0;font-size:14px;color:#991b1b;line-height:1.6;">'
                    "{{ rejection_reason }}"
                    "</p>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    '<p style="margin:0 0 20px 0;font-size:14px;color:#6b7280;line-height:1.6;">'
                    "Please make the necessary corrections and resubmit your document."
                    "</p>"
                    "{% endif %}"
                    # ── Entity badge ──
                    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">'
                    "<tr>"
                    '<td align="center">'
                    '<table role="presentation" cellspacing="0" cellpadding="0" border="0">'
                    "<tr>"
                    '<td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 24px;">'
                    '<p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Organisation</p>'
                    '<p style="margin:4px 0 0 0;font-size:18px;color:#1e40af;font-weight:600;">{{ entity.name }}</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    # ── Footer ──
                    "<tr>"
                    '<td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">'
                    '<p style="margin:0 0 4px 0;font-size:13px;color:#9ca3af;">Best regards,</p>'
                    '<p style="margin:0;font-size:14px;color:#6b7280;font-weight:600;">The OpsFlux Team</p>'
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</td>"
                    "</tr>"
                    "</table>"
                    "</body>"
                    "</html>"
                ),
            },
        },
    },
    {
        "slug": "conformite.record.expired",
        "name": "Enregistrement de conformité expiré",
        "description": "Envoyé aux administrateurs quand un enregistrement de conformité expire.",
        "object_type": "compliance",
        "variables_schema": {
            "record_id": "ID de l'enregistrement",
            "record_type": "Type de document",
            "record_label": "Libellé lisible du document",
            "owner_name": "Nom du porteur",
            "user.first_name": "Prénom du destinataire",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Conformité expirée : {{ record_label | default(record_type) }}",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Un enregistrement de conformité a <strong>expiré</strong>.</p>"
                    "<ul>"
                    "<li>Type : {{ record_label | default(record_type) }}</li>"
                    "{% if owner_name %}<li>Porteur : {{ owner_name }}</li>{% endif %}"
                    "<li>ID : {{ record_id }}</li>"
                    "</ul>"
                    "<p>Veuillez vérifier la situation dans le module Conformité.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Compliance expired: {{ record_label | default(record_type) }}",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>A compliance record has <strong>expired</strong>.</p>"
                    "<ul>"
                    "<li>Type: {{ record_label | default(record_type) }}</li>"
                    "{% if owner_name %}<li>Owner: {{ owner_name }}</li>{% endif %}"
                    "<li>ID: {{ record_id }}</li>"
                    "</ul>"
                    "<p>Please review the situation in the Compliance module.</p>"
                    "<p>Best regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "ticket_comment",
        "name": "Nouveau commentaire sur un ticket",
        "description": "Envoyé quand un commentaire est ajouté à un ticket de support.",
        "object_type": "support_ticket",
        "versions": {
            "fr": {
                "subject": "Nouveau commentaire sur votre ticket {{reference}}",
                "body_html": (
                    "<html><body style='font-family:Arial,sans-serif;color:#333'>"
                    "<h2 style='color:#2563eb'>Nouveau commentaire</h2>"
                    "<p>Un commentaire a été ajouté à votre ticket <strong>{{reference}}</strong> — « {{title}} ».</p>"
                    "<p><a href='{{link}}' style='background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none'>Voir le ticket</a></p>"
                    "<p style='color:#999;font-size:12px'>OpsFlux — Support</p>"
                    "</body></html>"
                ),
            },
        },
    },
    {
        "slug": "ticket_resolved",
        "name": "Ticket résolu",
        "description": "Envoyé quand un ticket de support est marqué comme résolu.",
        "object_type": "support_ticket",
        "versions": {
            "fr": {
                "subject": "Votre ticket {{reference}} a été résolu",
                "body_html": (
                    "<html><body style='font-family:Arial,sans-serif;color:#333'>"
                    "<h2 style='color:#16a34a'>Ticket résolu</h2>"
                    "<p>Votre ticket <strong>{{reference}}</strong> — « {{title}} » a été résolu.</p>"
                    "<p><a href='{{link}}' style='background:#16a34a;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none'>Voir le ticket</a></p>"
                    "<p style='color:#999;font-size:12px'>OpsFlux — Support</p>"
                    "</body></html>"
                ),
            },
        },
    },
    {
        "slug": "gdpr_export_ready",
        "name": "Export RGPD prêt",
        "description": "Envoyé quand l'export des données personnelles de l'utilisateur est prêt.",
        "object_type": "user",
        "variables_schema": {
            "user_name": "Nom affiché de l'utilisateur",
            "exports_url": "URL du profil où récupérer l'export",
            "download_link": "Lien direct de téléchargement si souhaité",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Votre export de données personnelles est prêt",
                "body_html": (
                    "<p>Bonjour {{ user_name or 'utilisateur' }},</p>"
                    "<p>Votre export de données personnelles est prêt.</p>"
                    "<p>Vous pouvez le récupérer depuis votre profil OpsFlux :</p>"
                    '<p><a href="{{ exports_url }}">{{ exports_url }}</a></p>'
                    "<p>Si vous préférez un lien direct de téléchargement, utilisez :</p>"
                    '<p><a href="{{ download_link }}">{{ download_link }}</a></p>'
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Your personal data export is ready",
                "body_html": (
                    "<p>Hello {{ user_name or 'user' }},</p>"
                    "<p>Your personal data export is ready.</p>"
                    "<p>You can retrieve it from your OpsFlux profile:</p>"
                    '<p><a href="{{ exports_url }}">{{ exports_url }}</a></p>'
                    "<p>If you prefer a direct download link, use:</p>"
                    '<p><a href="{{ download_link }}">{{ download_link }}</a></p>'
                    "<p>Regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "integration_test_email",
        "name": "Email de test connecteur",
        "description": "Envoyé lors d'un test réel de la configuration SMTP.",
        "object_type": "integration",
        "variables_schema": {
            "sender_name": "Nom de l'utilisateur ayant lancé le test",
            "tested_at": "Horodatage ISO du test",
            "recipient": "Adresse de destination du test",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — Test de configuration email",
                "body_html": (
                    "<p>Bonjour,</p>"
                    "<p>Ce message est un test de configuration. Si vous le recevez, le service d'envoi d'emails fonctionne correctement.</p>"
                    "<ul>"
                    "<li><strong>Envoyé par :</strong> {{ sender_name }}</li>"
                    "<li><strong>Date :</strong> {{ tested_at }}</li>"
                    "<li><strong>Destinataire :</strong> {{ recipient }}</li>"
                    "</ul>"
                    "<p>Aucune action n'est requise.</p>"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — Email configuration test",
                "body_html": (
                    "<p>Hello,</p>"
                    "<p>This message is a configuration test. If you received it, your email delivery service is working correctly.</p>"
                    "<ul>"
                    "<li><strong>Sent by:</strong> {{ sender_name }}</li>"
                    "<li><strong>Date:</strong> {{ tested_at }}</li>"
                    "<li><strong>Recipient:</strong> {{ recipient }}</li>"
                    "</ul>"
                    "<p>No action is required.</p>"
                    "<p>Regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "papyrus_dispatch_email",
        "name": "Diffusion Papyrus",
        "description": "Envoyé lors d'un dispatch email Papyrus planifié ou manuel.",
        "object_type": "document",
        "variables_schema": {
            "dispatch_subject": "Sujet final calculé pour la diffusion",
            "content_html": "Contenu HTML rendu du document",
            "document.number": "Numéro du document",
            "document.title": "Titre du document",
            "document.status": "Statut du document",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "{{ dispatch_subject }}",
                "body_html": (
                    "<p>Bonjour,</p>"
                    "<p>Une diffusion Papyrus est disponible pour le document <strong>{{ document.number }}</strong> — {{ document.title }}.</p>"
                    "{{ content_html | safe }}"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "{{ dispatch_subject }}",
                "body_html": (
                    "<p>Hello,</p>"
                    "<p>A Papyrus dispatch is available for document <strong>{{ document.number }}</strong> — {{ document.title }}.</p>"
                    "{{ content_html | safe }}"
                    "<p>Regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "notification_digest",
        "name": "Digest de notifications",
        "description": "Envoyé pour résumer les notifications non lues d'un utilisateur.",
        "object_type": "user",
        "variables_schema": {
            "user.first_name": "Prénom de l'utilisateur",
            "unread_count": "Nombre de notifications non lues",
            "notifications_html": "Tableau HTML des notifications",
            "notifications_url": "URL de la page notifications",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "OpsFlux — {{ unread_count }} notifications non lues",
                "body_html": (
                    "<p>Bonjour {{ user.first_name }},</p>"
                    "<p>Vous avez <strong>{{ unread_count }}</strong> notifications non lues au cours des dernières 24 heures.</p>"
                    "{{ notifications_html | safe }}"
                    '<p><a href="{{ notifications_url }}">Voir toutes les notifications</a></p>'
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "OpsFlux — {{ unread_count }} unread notifications",
                "body_html": (
                    "<p>Hello {{ user.first_name }},</p>"
                    "<p>You have <strong>{{ unread_count }}</strong> unread notifications in the last 24 hours.</p>"
                    "{{ notifications_html | safe }}"
                    '<p><a href="{{ notifications_url }}">View all notifications</a></p>'
                    "<p>Regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
    {
        "slug": "queued_notification_email",
        "name": "Email générique en file",
        "description": "Enveloppe centrale pour les notifications email génériques passées par la queue.",
        "object_type": "notification",
        "variables_schema": {
            "notification.title": "Titre de la notification",
            "notification.body": "Corps de la notification",
            "notification.link": "Lien vers l'écran cible",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "subject": "{{ notification.title }}",
                "body_html": (
                    "<p>{{ notification.body }}</p>"
                    "{% if notification.link %}<p><a href=\"{{ notification.link }}\">Voir dans OpsFlux</a></p>{% endif %}"
                    "<p>Cordialement,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
            "en": {
                "subject": "{{ notification.title }}",
                "body_html": (
                    "<p>{{ notification.body }}</p>"
                    "{% if notification.link %}<p><a href=\"{{ notification.link }}\">Open in OpsFlux</a></p>{% endif %}"
                    "<p>Regards,<br/>{{ entity.name | default('OpsFlux') }}</p>"
                ),
            },
        },
    },
]


def _get_default_template_def(slug: str) -> dict | None:
    for template in DEFAULT_TEMPLATES:
        if template.get("slug") == slug:
            return template
    return None


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
    entity_id: UUID | None,
    language: str = "fr",
) -> EmailTemplateVersion | None:
    """Find the active version for a slug + entity + language.

    Resolution order:
      1. Active version in requested language within valid date range
      2. Active version in requested language (no date restriction)
      3. Fallback to any active version (other language)
      4. None if nothing found
    """
    if entity_id is None:
        return None

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
    entity_id: UUID | None,
    language: str = "fr",
    variables: dict | None = None,
) -> tuple[str, str] | None:
    """Resolve and render a template. Returns (subject, body_html) or None."""
    version = await resolve_template_version(
        db, slug=slug, entity_id=entity_id, language=language,
    )
    ctx = variables or {}
    if version:
        subject = render_template_string(version.subject, ctx)
        body_html = render_template_string(version.body_html, ctx)
        return subject, body_html

    default_tpl = _get_default_template_def(slug)
    if not default_tpl:
        return None

    default_versions = default_tpl.get("default_versions", {})
    version_payload = default_versions.get(language) or default_versions.get("fr")
    if not isinstance(version_payload, dict):
        return None

    subject = render_template_string(version_payload.get("subject", ""), ctx)
    body_html = render_template_string(version_payload.get("body_html", ""), ctx)
    return subject, body_html


async def render_and_send_email(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID | None,
    language: str = "fr",
    to: str,
    variables: dict | None = None,
    from_name: str | None = None,
    user_id: UUID | None = None,
    category: str | None = None,
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

    if user_id is None:
        from app.models.common import User

        resolved_user = await db.execute(
            select(User.id).where(
                User.email == to,
                User.active == True,  # noqa: E712
            )
        )
        user_id = resolved_user.scalar_one_or_none()

    inferred_category = category or _infer_notification_category_from_slug(slug)

    from app.core.notifications import send_email
    await send_email(
        to=to,
        subject=subject,
        body_html=body_html,
        from_name=from_name,
        db=db,
        user_id=user_id,
        category=inferred_category,
        channel="email",
    )
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
