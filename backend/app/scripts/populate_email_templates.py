"""
Script pour créer les templates email par défaut dans la base de données
"""
import sys
from pathlib import Path

# Ajouter le répertoire parent au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from datetime import datetime
from sqlmodel import Session, create_engine, select

from app.core.config import settings
from app.core.db import engine
from app.models_email_templates import EmailTemplate, EmailTemplateCategory


def create_default_templates(session: Session) -> None:
    """Crée les templates email par défaut s'ils n'existent pas"""

    templates = [
        {
            "name": "Invitation utilisateur",
            "slug": "user_invitation",
            "description": "Email envoyé lors de l'invitation d'un nouvel utilisateur",
            "category": EmailTemplateCategory.TRANSACTIONAL,
            "subject": "{{ project_name }} - Vous êtes invité(e) à rejoindre l'équipe",
            "html_content": """
<html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Invitation à rejoindre {{ project_name }}</h2>
            <p>Bonjour,</p>
            <p><strong>{{ inviter_name }}</strong> vous invite à rejoindre {{ project_name }}.</p>
            <p>Pour créer votre compte et rejoindre l'équipe, cliquez sur le bouton ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ signup_link }}"
                   style="background-color: #2563eb; color: white; padding: 12px 30px;
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    Créer mon compte
                </a>
            </div>
            <p>Ou copiez ce lien dans votre navigateur :</p>
            <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 5px;">
                {{ signup_link }}
            </p>
            <p><strong>Cette invitation expire dans {{ expiry_days }} jours.</strong></p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">
                Cet email a été envoyé par {{ project_name }}.
                Si vous n'êtes pas censé(e) recevoir cette invitation, vous pouvez l'ignorer.
            </p>
        </div>
    </body>
</html>
            """,
            "text_content": """
Invitation à rejoindre {{ project_name }}

Bonjour,

{{ inviter_name }} vous invite à rejoindre {{ project_name }}.

Pour créer votre compte et rejoindre l'équipe, cliquez sur le lien ci-dessous :
{{ signup_link }}

Cette invitation expire dans {{ expiry_days }} jours.

Cet email a été envoyé par {{ project_name }}.
Si vous n'êtes pas censé(e) recevoir cette invitation, vous pouvez l'ignorer.
            """,
            "available_variables": ["project_name", "inviter_name", "signup_link", "expiry_days"],
            "is_system": True,
            "is_active": True,
            "preview_data": {
                "project_name": "OpsFlux",
                "inviter_name": "Jean Dupont",
                "signup_link": "https://app.opsflux.io/accept-invitation?token=abc123",
                "expiry_days": "7"
            }
        },
        {
            "name": "Réinitialisation mot de passe",
            "slug": "password_reset",
            "description": "Email envoyé lors d'une demande de réinitialisation de mot de passe",
            "category": EmailTemplateCategory.TRANSACTIONAL,
            "subject": "{{ project_name }} - Réinitialisation de votre mot de passe",
            "html_content": """
<html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Réinitialisation de mot de passe</h2>
            <p>Bonjour,</p>
            <p>Vous avez demandé à réinitialiser le mot de passe de votre compte <strong>{{ user_email }}</strong>.</p>
            <p>Pour réinitialiser votre mot de passe, cliquez sur le bouton ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ reset_link }}"
                   style="background-color: #2563eb; color: white; padding: 12px 30px;
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    Réinitialiser mon mot de passe
                </a>
            </div>
            <p>Ou copiez ce lien dans votre navigateur :</p>
            <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 5px;">
                {{ reset_link }}
            </p>
            <p><strong>Ce lien est valable pendant {{ expiry_hours }} heures.</strong></p>
            <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email en toute sécurité.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">
                Cet email a été envoyé par {{ project_name }}.
                Pour des raisons de sécurité, ne partagez jamais ce lien avec personne.
            </p>
        </div>
    </body>
</html>
            """,
            "text_content": """
Réinitialisation de mot de passe

Bonjour,

Vous avez demandé à réinitialiser le mot de passe de votre compte {{ user_email }}.

Pour réinitialiser votre mot de passe, cliquez sur le lien ci-dessous :
{{ reset_link }}

Ce lien est valable pendant {{ expiry_hours }} heures.

Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email en toute sécurité.

Cet email a été envoyé par {{ project_name }}.
Pour des raisons de sécurité, ne partagez jamais ce lien avec personne.
            """,
            "available_variables": ["project_name", "user_email", "reset_link", "expiry_hours"],
            "is_system": True,
            "is_active": True,
            "preview_data": {
                "project_name": "OpsFlux",
                "user_email": "user@example.com",
                "reset_link": "https://app.opsflux.io/reset-password?token=xyz789",
                "expiry_hours": "24"
            }
        },
        {
            "name": "Bienvenue",
            "slug": "welcome",
            "description": "Email de bienvenue envoyé après la création d'un compte",
            "category": EmailTemplateCategory.TRANSACTIONAL,
            "subject": "Bienvenue sur {{ project_name }} !",
            "html_content": """
<html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Bienvenue sur {{ project_name }} !</h2>
            <p>Bonjour <strong>{{ user_name }}</strong>,</p>
            <p>Nous sommes ravis de vous accueillir sur {{ project_name }} !</p>
            <p>Votre compte a été créé avec succès. Vous pouvez maintenant accéder à toutes les fonctionnalités de la plateforme.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ platform_url }}"
                   style="background-color: #2563eb; color: white; padding: 12px 30px;
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    Accéder à la plateforme
                </a>
            </div>
            <p><strong>Besoin d'aide ?</strong></p>
            <p>Consultez notre documentation ou contactez le support si vous avez des questions.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">
                Cet email a été envoyé par {{ project_name }}.
            </p>
        </div>
    </body>
</html>
            """,
            "text_content": """
Bienvenue sur {{ project_name }} !

Bonjour {{ user_name }},

Nous sommes ravis de vous accueillir sur {{ project_name }} !

Votre compte a été créé avec succès. Vous pouvez maintenant accéder à toutes les fonctionnalités de la plateforme.

Accédez à la plateforme : {{ platform_url }}

Besoin d'aide ?
Consultez notre documentation ou contactez le support si vous avez des questions.

Cet email a été envoyé par {{ project_name }}.
            """,
            "available_variables": ["project_name", "user_name", "platform_url"],
            "is_system": True,
            "is_active": True,
            "preview_data": {
                "project_name": "OpsFlux",
                "user_name": "Marie Martin",
                "platform_url": "https://app.opsflux.io"
            }
        },
        {
            "name": "Email de test",
            "slug": "test_email",
            "description": "Email de test pour vérifier la configuration SMTP",
            "category": EmailTemplateCategory.SYSTEM,
            "subject": "{{ project_name }} - Email de test",
            "html_content": """
<html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Email de test</h2>
            <p>Cet email confirme que votre configuration SMTP fonctionne correctement.</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p><strong>Configuration utilisée:</strong></p>
            <ul>
                <li>Serveur SMTP: {{ smtp_host }}</li>
                <li>Port: {{ smtp_port }}</li>
                <li>TLS: {{ smtp_tls }}</li>
                <li>SSL: {{ smtp_ssl }}</li>
                <li>Expéditeur: {{ from_email }}</li>
            </ul>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">
                Cet email a été envoyé par {{ project_name }}.
            </p>
        </div>
    </body>
</html>
            """,
            "text_content": """
Email de test

Cet email confirme que votre configuration SMTP fonctionne correctement.

Configuration utilisée:
- Serveur SMTP: {{ smtp_host }}
- Port: {{ smtp_port }}
- TLS: {{ smtp_tls }}
- SSL: {{ smtp_ssl }}
- Expéditeur: {{ from_email }}

Cet email a été envoyé par {{ project_name }}.
            """,
            "available_variables": ["project_name", "smtp_host", "smtp_port", "smtp_tls", "smtp_ssl", "from_email"],
            "is_system": True,
            "is_active": True,
            "preview_data": {
                "project_name": "OpsFlux",
                "smtp_host": "smtp.example.com",
                "smtp_port": "587",
                "smtp_tls": "True",
                "smtp_ssl": "False",
                "from_email": "noreply@opsflux.io"
            }
        },
        {
            "name": "Notification générique",
            "slug": "notification",
            "description": "Template de notification générique",
            "category": EmailTemplateCategory.NOTIFICATION,
            "subject": "{{ project_name }} - {{ title }}",
            "html_content": """
<html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">{{ title }}</h2>
            <p>{{ message }}</p>
            {% if action_url %}
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ action_url }}"
                   style="background-color: #2563eb; color: white; padding: 12px 30px;
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    {{ action_text }}
                </a>
            </div>
            {% endif %}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">
                Cet email a été envoyé par {{ project_name }}.
            </p>
        </div>
    </body>
</html>
            """,
            "text_content": """
{{ title }}

{{ message }}

{% if action_url %}
{{ action_text }}: {{ action_url }}
{% endif %}

Cet email a été envoyé par {{ project_name }}.
            """,
            "available_variables": ["project_name", "title", "message", "action_url", "action_text"],
            "is_system": True,
            "is_active": True,
            "preview_data": {
                "project_name": "OpsFlux",
                "title": "Nouvelle notification",
                "message": "Ceci est un exemple de notification générique.",
                "action_url": "https://app.opsflux.io/notifications",
                "action_text": "Voir les détails"
            }
        }
    ]

    created_count = 0
    updated_count = 0

    for template_data in templates:
        # Vérifier si le template existe déjà
        statement = select(EmailTemplate).where(EmailTemplate.slug == template_data["slug"])
        existing_template = session.exec(statement).first()

        if existing_template:
            # Mettre à jour le template existant
            for key, value in template_data.items():
                setattr(existing_template, key, value)
            existing_template.updated_at = datetime.now()
            session.add(existing_template)
            updated_count += 1
            print(f"✓ Template '{template_data['slug']}' mis à jour")
        else:
            # Créer un nouveau template
            template = EmailTemplate(
                **template_data,
                created_at=datetime.now()
            )
            session.add(template)
            created_count += 1
            print(f"✓ Template '{template_data['slug']}' créé")

    session.commit()

    print(f"\n{'='*50}")
    print(f"Templates créés: {created_count}")
    print(f"Templates mis à jour: {updated_count}")
    print(f"Total: {created_count + updated_count}")
    print(f"{'='*50}")


def main():
    """Point d'entrée principal du script"""
    print("Création des templates email par défaut...")
    print(f"Base de données: {settings.POSTGRES_SERVER}")
    print()

    with Session(engine) as session:
        create_default_templates(session)

    print("\n✓ Script terminé avec succès!")


if __name__ == "__main__":
    main()
