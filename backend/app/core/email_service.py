"""
Service d'envoi d'emails avec fallback vers les paramètres .env
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import emails  # type: ignore
from emails.template import JinjaTemplate  # type: ignore
from jinja2 import Template, TemplateSyntaxError
from sqlmodel import Session, select

from app.core.config import settings
from app.models import AppSettings
from app.models_email_templates import EmailTemplate


logger = logging.getLogger(__name__)


class EmailService:
    """Service pour l'envoi d'emails avec configuration dynamique depuis AppSettings"""

    @staticmethod
    def _get_email_config(db: Session | None = None) -> dict[str, Any]:
        """
        Récupère la configuration email depuis AppSettings ou .env (fallback)

        Args:
            db: Session SQLModel (optionnel)

        Returns:
            dict: Configuration email {host, port, username, password, from_email, from_name, use_tls, use_ssl}
        """
        config = {
            "host": settings.SMTP_HOST,
            "port": settings.SMTP_PORT,
            "username": settings.SMTP_USER,
            "password": settings.SMTP_PASSWORD,
            "from_email": settings.EMAILS_FROM_EMAIL,
            "from_name": settings.EMAILS_FROM_NAME,
            "use_tls": settings.SMTP_TLS,
            "use_ssl": settings.SMTP_SSL,
        }

        # Si DB disponible, tenter de récupérer depuis AppSettings
        if db:
            try:
                app_settings = db.query(AppSettings).first()
                if app_settings:
                    # Override avec les valeurs d'AppSettings si elles existent
                    if app_settings.email_host:
                        config["host"] = app_settings.email_host
                    if app_settings.email_port:
                        config["port"] = app_settings.email_port
                    if app_settings.email_username:
                        config["username"] = app_settings.email_username
                    if app_settings.email_password:
                        config["password"] = app_settings.email_password
                    if app_settings.email_from:
                        config["from_email"] = app_settings.email_from
                    if app_settings.email_from_name:
                        config["from_name"] = app_settings.email_from_name
                    if app_settings.email_use_tls is not None:
                        config["use_tls"] = app_settings.email_use_tls
                    if app_settings.email_use_ssl is not None:
                        config["use_ssl"] = app_settings.email_use_ssl
            except Exception as e:
                logger.warning(f"Impossible de récupérer les paramètres email depuis AppSettings: {e}")

        return config

    @staticmethod
    def send_email(
        *,
        email_to: str,
        subject: str,
        html_content: str,
        db: Session | None = None,
    ) -> bool:
        """
        Envoie un email

        Args:
            email_to: Adresse email destinataire
            subject: Sujet de l'email
            html_content: Contenu HTML de l'email
            db: Session SQLModel (optionnel, pour récupérer config AppSettings)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        config = EmailService._get_email_config(db)

        # Vérifier que la configuration est complète
        if not config["host"] or not config["from_email"]:
            logger.error("Configuration email incomplète. SMTP_HOST et EMAILS_FROM_EMAIL requis.")
            return False

        try:
            message = emails.Message(
                subject=subject,
                html=html_content,
                mail_from=(config["from_name"], config["from_email"]),
            )

            smtp_options = {
                "host": config["host"],
                "port": config["port"],
            }

            if config["use_tls"]:
                smtp_options["tls"] = True
            if config["use_ssl"]:
                smtp_options["ssl"] = True
            if config["username"]:
                smtp_options["user"] = config["username"]
            if config["password"]:
                smtp_options["password"] = config["password"]

            response = message.send(to=email_to, smtp=smtp_options)

            if response.status_code not in [250, 200]:
                logger.error(f"Erreur lors de l'envoi de l'email: {response.status_code}")
                return False

            logger.info(f"Email envoyé avec succès à {email_to}")
            return True

        except Exception as e:
            logger.error(f"Exception lors de l'envoi de l'email: {e}")
            return False

    @staticmethod
    def send_test_email(email_to: str, db: Session | None = None) -> bool:
        """
        Envoie un email de test pour vérifier la configuration

        Args:
            email_to: Adresse email destinataire
            db: Session SQLModel (requis pour récupérer le template)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        if not db:
            logger.error("Session DB requise pour send_test_email")
            return False

        config = EmailService._get_email_config(db)

        # Variables pour le template
        variables = {
            "project_name": settings.PROJECT_NAME,
            "smtp_host": config["host"] or "Non configuré",
            "smtp_port": str(config["port"]) or "Non configuré",
            "smtp_tls": str(config["use_tls"]),
            "smtp_ssl": str(config["use_ssl"]),
            "from_email": config["from_email"] or "Non configuré",
        }

        # Utiliser le template de la DB
        return EmailService.send_templated_email_by_slug(
            email_to=email_to,
            template_slug="test_email",
            variables=variables,
            db=db,
        )

    @staticmethod
    def send_reset_password_email(
        email_to: str,
        email: str,
        token: str,
        db: Session | None = None,
    ) -> bool:
        """
        Envoie un email de réinitialisation de mot de passe

        Args:
            email_to: Adresse email destinataire
            email: Email de l'utilisateur (pour affichage)
            token: Token de réinitialisation
            db: Session SQLModel (requis pour récupérer le template)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        if not db:
            logger.error("Session DB requise pour send_reset_password_email")
            return False

        # Construire le lien de réinitialisation
        reset_link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"

        # Variables pour le template
        variables = {
            "project_name": settings.PROJECT_NAME,
            "user_email": email,
            "reset_link": reset_link,
            "expiry_hours": str(settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS),
        }

        # Utiliser le template de la DB
        return EmailService.send_templated_email_by_slug(
            email_to=email_to,
            template_slug="password_reset",
            variables=variables,
            db=db,
        )

    @staticmethod
    def send_user_invitation_email(
        email_to: str,
        inviter_name: str,
        invitation_token: str,
        db: Session | None = None,
    ) -> bool:
        """
        Envoie un email d'invitation pour un nouvel utilisateur

        Args:
            email_to: Adresse email du nouvel utilisateur
            inviter_name: Nom de la personne qui invite
            invitation_token: Token d'invitation
            db: Session SQLModel (requis pour récupérer le template)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        if not db:
            logger.error("Session DB requise pour send_user_invitation_email")
            return False

        # Récupérer le délai d'expiration depuis les settings
        from app.models import AppSettings
        app_settings = db.exec(select(AppSettings)).first()
        expiry_days = app_settings.invitation_expiry_days if app_settings and app_settings.invitation_expiry_days else 7

        # Construire le lien d'inscription
        signup_link = f"{settings.FRONTEND_HOST}/accept-invitation?token={invitation_token}"

        # Variables pour le template
        variables = {
            "project_name": settings.PROJECT_NAME,
            "inviter_name": inviter_name,
            "signup_link": signup_link,
            "expiry_days": str(expiry_days),
        }

        # Utiliser le template de la DB
        return EmailService.send_templated_email_by_slug(
            email_to=email_to,
            template_slug="user_invitation",
            variables=variables,
            db=db,
        )

    @staticmethod
    def send_welcome_email(
        email_to: str,
        user_name: str,
        db: Session | None = None,
    ) -> bool:
        """
        Envoie un email de bienvenue à un nouvel utilisateur

        Args:
            email_to: Adresse email de l'utilisateur
            user_name: Nom de l'utilisateur
            db: Session SQLModel (requis pour récupérer le template)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        if not db:
            logger.error("Session DB requise pour send_welcome_email")
            return False

        # Variables pour le template
        variables = {
            "project_name": settings.PROJECT_NAME,
            "user_name": user_name,
            "platform_url": settings.FRONTEND_HOST,
        }

        # Utiliser le template de la DB
        return EmailService.send_templated_email_by_slug(
            email_to=email_to,
            template_slug="welcome",
            variables=variables,
            db=db,
        )

    @staticmethod
    def send_notification_email(
        email_to: str,
        title: str,
        message: str,
        action_url: str | None = None,
        action_text: str = "Voir les détails",
        db: Session | None = None,
    ) -> bool:
        """
        Envoie un email de notification générique

        Args:
            email_to: Adresse email destinataire
            title: Titre de la notification
            message: Message de la notification
            action_url: URL optionnelle pour une action
            action_text: Texte du bouton d'action
            db: Session SQLModel (optionnel)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        subject = f"{settings.PROJECT_NAME} - {title}"

        action_button = ""
        if action_url:
            full_url = f"{settings.FRONTEND_HOST}{action_url}" if action_url.startswith("/") else action_url
            action_button = f"""
            <div style="text-align: center; margin: 30px 0;">
                <a href="{full_url}"
                   style="background-color: #2563eb; color: white; padding: 12px 30px;
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    {action_text}
                </a>
            </div>
            """

        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">{title}</h2>
                    <p>{message}</p>
                    {action_button}
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px;">
                        Cet email a été envoyé par {settings.PROJECT_NAME}.
                    </p>
                </div>
            </body>
        </html>
        """

        return EmailService.send_email(
            email_to=email_to,
            subject=subject,
            html_content=html_content,
            db=db,
        )

    @staticmethod
    def render_template(template_content: str, variables: dict[str, Any]) -> str:
        """
        Rend un template Jinja2 avec les variables fournies.

        Args:
            template_content: Contenu du template Jinja2 (HTML)
            variables: Dictionnaire de variables à injecter dans le template

        Returns:
            str: HTML rendu avec les variables

        Raises:
            TemplateSyntaxError: Si le template contient des erreurs de syntaxe
            Exception: Si le rendu échoue
        """
        try:
            template = Template(template_content)
            rendered = template.render(**variables)
            return rendered
        except TemplateSyntaxError as e:
            logger.error(f"Erreur de syntaxe dans le template: {e}")
            raise
        except Exception as e:
            logger.error(f"Erreur lors du rendu du template: {e}")
            raise

    @staticmethod
    def send_templated_email(
        *,
        email_to: str,
        template_id: UUID,
        variables: dict[str, Any],
        db: Session,
    ) -> bool:
        """
        Envoie un email en utilisant un template de la base de données.

        Cette méthode récupère le template EmailTemplate depuis la DB,
        rend le contenu avec les variables fournies, puis envoie l'email.

        Args:
            email_to: Adresse email destinataire
            template_id: UUID du template EmailTemplate
            variables: Dictionnaire de variables pour le rendu (ex: {"user_name": "John", "reset_link": "https://..."})
            db: Session SQLModel (requis pour récupérer le template)

        Returns:
            bool: True si envoyé avec succès, False sinon

        Example:
            >>> send_templated_email(
            ...     email_to="user@example.com",
            ...     template_id=UUID("..."),
            ...     variables={"user_name": "John Doe", "reset_link": "https://..."},
            ...     db=session
            ... )
            True
        """
        # Récupérer le template depuis la DB
        try:
            statement = select(EmailTemplate).where(
                EmailTemplate.id == template_id,
                EmailTemplate.is_active == True
            )
            result = db.exec(statement)
            template = result.one_or_none()

            if not template:
                logger.error(f"Template {template_id} non trouvé ou inactif")
                return False

            # Rendre le sujet
            subject = EmailService.render_template(template.subject, variables)

            # Rendre le contenu HTML
            html_content = EmailService.render_template(template.html_content, variables)

            # Envoyer l'email
            success = EmailService.send_email(
                email_to=email_to,
                subject=subject,
                html_content=html_content,
                db=db,
            )

            if success:
                # Mettre à jour les statistiques du template
                template.sent_count += 1
                template.last_sent_at = datetime.now()
                db.add(template)
                db.commit()

            return success

        except TemplateSyntaxError as e:
            logger.error(f"Erreur de syntaxe dans le template {template_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Erreur lors de l'envoi de l'email templé {template_id}: {e}")
            return False

    @staticmethod
    def send_templated_email_by_slug(
        *,
        email_to: str,
        template_slug: str,
        variables: dict[str, Any],
        db: Session,
    ) -> bool:
        """
        Envoie un email en utilisant un template de la base de données identifié par son slug.

        Cette méthode est un wrapper autour de send_templated_email qui récupère
        le template par son slug au lieu de son UUID.

        Args:
            email_to: Adresse email destinataire
            template_slug: Slug du template EmailTemplate (ex: "user_invitation", "password_reset")
            variables: Dictionnaire de variables pour le rendu
            db: Session SQLModel (requis pour récupérer le template)

        Returns:
            bool: True si envoyé avec succès, False sinon

        Example:
            >>> send_templated_email_by_slug(
            ...     email_to="user@example.com",
            ...     template_slug="user_invitation",
            ...     variables={"inviter_name": "John", "signup_link": "https://..."},
            ...     db=session
            ... )
            True
        """
        try:
            # Récupérer le template par slug
            statement = select(EmailTemplate).where(
                EmailTemplate.slug == template_slug,
                EmailTemplate.is_active == True
            )
            result = db.exec(statement)
            template = result.one_or_none()

            if not template:
                logger.error(f"Template avec slug '{template_slug}' non trouvé ou inactif")
                return False

            # Utiliser la méthode send_templated_email avec l'ID du template
            return EmailService.send_templated_email(
                email_to=email_to,
                template_id=template.id,
                variables=variables,
                db=db,
            )

        except Exception as e:
            logger.error(f"Erreur lors de l'envoi de l'email avec template slug '{template_slug}': {e}")
            return False

    @staticmethod
    def verify_connection(db: Session | None = None) -> tuple[bool, str]:
        """
        Vérifie la connexion au serveur SMTP

        Args:
            db: Session SQLModel (optionnel)

        Returns:
            tuple[bool, str]: (succès, message)
        """
        config = EmailService._get_email_config(db)

        if not config["host"]:
            return False, "Serveur SMTP non configuré"

        if not config["from_email"]:
            return False, "Email expéditeur non configuré"

        try:
            import smtplib

            # Tentative de connexion
            if config["use_ssl"]:
                server = smtplib.SMTP_SSL(config["host"], config["port"], timeout=10)
            else:
                server = smtplib.SMTP(config["host"], config["port"], timeout=10)
                if config["use_tls"]:
                    server.starttls()

            # Authentification si credentials fournis
            if config["username"] and config["password"]:
                server.login(config["username"], config["password"])

            server.quit()
            return True, "Connexion au serveur SMTP réussie"

        except smtplib.SMTPAuthenticationError:
            return False, "Erreur d'authentification - Vérifiez vos identifiants"
        except smtplib.SMTPConnectError:
            return False, "Impossible de se connecter au serveur SMTP"
        except TimeoutError:
            return False, "Timeout - Le serveur SMTP ne répond pas"
        except Exception as e:
            return False, f"Erreur: {str(e)}"


# Instance singleton
email_service = EmailService()
