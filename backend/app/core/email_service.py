"""
Service d'envoi d'emails avec fallback vers les paramètres .env
"""

import logging
from pathlib import Path
from typing import Any

import emails  # type: ignore
from emails.template import JinjaTemplate  # type: ignore
from sqlmodel import Session

from app.core.config import settings
from app.models import AppSettings


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
            db: Session SQLModel (optionnel)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        config = EmailService._get_email_config(db)

        subject = f"{settings.PROJECT_NAME} - Email de test"
        html_content = f"""
        <html>
            <body>
                <h2>Email de test</h2>
                <p>Cet email confirme que votre configuration SMTP fonctionne correctement.</p>
                <hr>
                <p><strong>Configuration utilisée:</strong></p>
                <ul>
                    <li>Serveur SMTP: {config["host"]}</li>
                    <li>Port: {config["port"]}</li>
                    <li>TLS: {config["use_tls"]}</li>
                    <li>SSL: {config["use_ssl"]}</li>
                    <li>Expéditeur: {config["from_email"]}</li>
                </ul>
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
            db: Session SQLModel (optionnel)

        Returns:
            bool: True si envoyé avec succès, False sinon
        """
        subject = f"{settings.PROJECT_NAME} - Réinitialisation de votre mot de passe"

        # Construire le lien de réinitialisation
        reset_link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"

        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Réinitialisation de mot de passe</h2>
                    <p>Bonjour,</p>
                    <p>Vous avez demandé à réinitialiser le mot de passe de votre compte <strong>{email}</strong>.</p>
                    <p>Pour réinitialiser votre mot de passe, cliquez sur le bouton ci-dessous :</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_link}"
                           style="background-color: #2563eb; color: white; padding: 12px 30px;
                                  text-decoration: none; border-radius: 5px; display: inline-block;">
                            Réinitialiser mon mot de passe
                        </a>
                    </div>
                    <p>Ou copiez ce lien dans votre navigateur :</p>
                    <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 5px;">
                        {reset_link}
                    </p>
                    <p><strong>Ce lien est valable pendant {settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS} heures.</strong></p>
                    <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email en toute sécurité.</p>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px;">
                        Cet email a été envoyé par {settings.PROJECT_NAME}.
                        Pour des raisons de sécurité, ne partagez jamais ce lien avec personne.
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
