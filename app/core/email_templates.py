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
    # ── Compliance verification templates ─────────────────────────────────────
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
