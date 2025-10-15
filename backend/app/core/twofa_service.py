"""
Service de gestion 2FA (Two-Factor Authentication).
Support TOTP (Google Authenticator) et SMS backup.
"""

import base64
import io
import secrets
from datetime import datetime, timedelta
from typing import Optional

import pyotp
import qrcode
from sqlmodel import Session, select
from twilio.rest import Client

from app.core.config import settings
from app.core.security_settings_service import SecuritySettingsService
from app.core.sms_providers import SMSProviderFactory
from app.models import User
from app.models_2fa import (
    SMSVerification,
    TwoFactorBackupCodes,
    TwoFactorConfig,
    TwoFactorSetup,
)


class TwoFactorService:
    """Service centralisé pour toutes les opérations 2FA."""

    @staticmethod
    def generate_totp_secret() -> str:
        """
        Génère un secret TOTP aléatoire (base32).

        Returns:
            str: Secret base32 (32 caractères)
        """
        return pyotp.random_base32()

    @staticmethod
    def generate_totp_uri(secret: str, user_email: str, issuer: str = "OpsFlux") -> str:
        """
        Génère l'URI TOTP pour QR code.

        Args:
            secret: Secret TOTP base32
            user_email: Email utilisateur
            issuer: Nom de l'application

        Returns:
            str: URI format otpauth://totp/...
        """
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=user_email, issuer_name=issuer)

    @staticmethod
    def generate_qr_code(totp_uri: str) -> str:
        """
        Génère QR code au format data URL base64.

        Args:
            totp_uri: URI TOTP

        Returns:
            str: Data URL (data:image/png;base64,...)
        """
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        # Convertir en base64 data URL
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        img_base64 = base64.b64encode(buffer.getvalue()).decode()

        return f"data:image/png;base64,{img_base64}"

    @staticmethod
    def verify_totp_code(secret: str, code: str, window: int = 1) -> bool:
        """
        Vérifie un code TOTP.

        Args:
            secret: Secret TOTP base32
            code: Code à 6 chiffres saisi par user
            window: Fenêtre de tolérance (1 = ±30s)

        Returns:
            bool: True si code valide
        """
        try:
            totp = pyotp.TOTP(secret)
            return totp.verify(code, valid_window=window)
        except Exception:
            return False

    @staticmethod
    def setup_totp(*, session: Session, user: User) -> TwoFactorSetup:
        """
        Prépare la configuration TOTP initiale.
        Génère secret, URI et QR code.

        Args:
            session: Session DB
            user: Utilisateur

        Returns:
            TwoFactorSetup: Données pour affichage QR code
        """
        # Générer secret
        secret = TwoFactorService.generate_totp_secret()

        # Générer URI et QR code
        totp_uri = TwoFactorService.generate_totp_uri(secret, user.email)
        qr_code_data_url = TwoFactorService.generate_qr_code(totp_uri)

        # Créer ou mettre à jour config (pas encore activé)
        config = session.exec(
            select(TwoFactorConfig).where(TwoFactorConfig.user_id == user.id)
        ).first()

        if not config:
            config = TwoFactorConfig(user_id=user.id)

        config.totp_secret = secret
        session.add(config)
        session.commit()
        session.refresh(config)

        return TwoFactorSetup(
            totp_secret=secret,
            totp_uri=totp_uri,
            qr_code_data_url=qr_code_data_url,
        )

    @staticmethod
    def enable_totp(
        *,
        session: Session,
        user: User,
        verification_code: str,
        generate_backup_codes: bool = True,
    ) -> TwoFactorConfig:
        """
        Active TOTP après vérification du code.

        Args:
            session: Session DB
            user: Utilisateur
            verification_code: Code 6 chiffres pour vérification
            generate_backup_codes: Générer codes backup

        Returns:
            TwoFactorConfig: Config 2FA activée

        Raises:
            ValueError: Si code invalide ou pas de setup
        """
        config = session.exec(
            select(TwoFactorConfig).where(TwoFactorConfig.user_id == user.id)
        ).first()

        if not config or not config.totp_secret:
            raise ValueError("2FA pas configuré. Lancer setup d'abord.")

        # Vérifier code
        if not TwoFactorService.verify_totp_code(config.totp_secret, verification_code):
            raise ValueError("Code 2FA invalide")

        # Activer
        config.is_enabled = True
        config.primary_method = "totp"
        config.totp_verified_at = datetime.utcnow()

        # Générer codes backup
        if generate_backup_codes:
            backup_codes = TwoFactorService.generate_backup_codes()
            config.backup_codes = backup_codes
            config.backup_codes_generated_at = datetime.utcnow()

        session.add(config)
        session.commit()
        session.refresh(config)

        return config

    @staticmethod
    def generate_backup_codes(count: int = 10) -> list[str]:
        """
        Génère des codes backup à usage unique.

        Args:
            count: Nombre de codes (défaut 10)

        Returns:
            list[str]: Liste de codes (8 caractères chacun)
        """
        codes = []
        for _ in range(count):
            # Format : XXXX-XXXX (8 chars alphanumériques)
            code = secrets.token_hex(4).upper()
            formatted = f"{code[:4]}-{code[4:]}"
            codes.append(formatted)
        return codes

    @staticmethod
    def verify_backup_code(*, session: Session, user: User, code: str) -> bool:
        """
        Vérifie et consomme un code backup.

        Args:
            session: Session DB
            user: Utilisateur
            code: Code backup format XXXX-XXXX

        Returns:
            bool: True si code valide et consommé
        """
        config = session.exec(
            select(TwoFactorConfig).where(
                TwoFactorConfig.user_id == user.id,
                TwoFactorConfig.is_enabled == True,  # noqa: E712
            )
        ).first()

        if not config or not config.backup_codes:
            return False

        # Normaliser le code (uppercase, remove espaces)
        normalized_code = code.upper().replace(" ", "")

        if normalized_code in config.backup_codes:
            # Consommer le code
            config.backup_codes.remove(normalized_code)
            config.last_used_at = datetime.utcnow()
            session.add(config)
            session.commit()
            return True

        return False

    @staticmethod
    def regenerate_backup_codes(
        *, session: Session, user: User
    ) -> TwoFactorBackupCodes:
        """
        Régénère les codes backup (invalide les anciens).

        Args:
            session: Session DB
            user: Utilisateur

        Returns:
            TwoFactorBackupCodes: Nouveaux codes

        Raises:
            ValueError: Si 2FA pas activé
        """
        config = session.exec(
            select(TwoFactorConfig).where(
                TwoFactorConfig.user_id == user.id,
                TwoFactorConfig.is_enabled == True,  # noqa: E712
            )
        ).first()

        if not config:
            raise ValueError("2FA pas activé")

        # Générer nouveaux codes
        new_codes = TwoFactorService.generate_backup_codes()
        config.backup_codes = new_codes
        config.backup_codes_generated_at = datetime.utcnow()

        session.add(config)
        session.commit()

        return TwoFactorBackupCodes(
            codes=new_codes, generated_at=config.backup_codes_generated_at  # type: ignore
        )

    @staticmethod
    def send_sms_code(
        *, session: Session, user: User, phone_number: str, purpose: str = "login"
    ) -> SMSVerification:
        """
        Envoie un code SMS via Twilio.

        Args:
            session: Session DB
            user: Utilisateur
            phone_number: Numéro format international (+33...)
            purpose: login, verify_phone, password_reset

        Returns:
            SMSVerification: Record du SMS envoyé

        Raises:
            ValueError: Si rate limit atteint ou config manquante
        """
        # Rate limiting: max N SMS par heure (configurable via AppSettings)
        sms_rate_limit = SecuritySettingsService.get_2fa_sms_rate_limit(session)
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_sms = session.exec(
            select(SMSVerification).where(
                SMSVerification.user_id == user.id,
                SMSVerification.created_at >= one_hour_ago,
            )
        ).all()

        if len(recent_sms) >= sms_rate_limit:
            raise ValueError(
                f"Trop de tentatives SMS. Attendez 1 heure ou utilisez codes backup."
            )

        # Générer code 6 chiffres
        code = "".join([str(secrets.randbelow(10)) for _ in range(6)])

        # Durée de validité du code (configurable via AppSettings)
        sms_timeout_minutes = SecuritySettingsService.get_2fa_sms_timeout_minutes(session)

        # Créer record
        sms = SMSVerification(
            user_id=user.id,
            phone_number=phone_number,
            code=code,
            purpose=purpose,
            expires_at=datetime.utcnow() + timedelta(minutes=sms_timeout_minutes),
        )

        session.add(sms)
        session.commit()
        session.refresh(sms)

        # Envoyer SMS via provider configuré
        sms_config = SecuritySettingsService.get_sms_provider_config(session)

        # Fallback vers settings si pas configuré dans AppSettings
        provider_name = sms_config["provider"] or "twilio"
        account_sid = sms_config["account_sid"] or settings.TWILIO_ACCOUNT_SID
        auth_token = sms_config["auth_token"] or settings.TWILIO_AUTH_TOKEN
        from_number = sms_config["phone_number"] or settings.TWILIO_PHONE_NUMBER

        # Créer le provider via la factory
        provider = SMSProviderFactory.create_provider(
            provider_name=provider_name,
            account_sid=account_sid,
            auth_token=auth_token,
            from_number=from_number
        )

        if provider:
            try:
                message_text = f"Votre code OpsFlux: {code}\nValide {sms_timeout_minutes} minutes."
                result = provider.send_sms(phone_number, message_text)

                if result["status"] != "sent":
                    print(f"SMS Error: {result.get('error', 'Unknown error')}")
                # TODO: Logger message_id pour tracking
            except Exception as e:
                # En développement, on log juste le code
                print(f"SMS Code: {code} (Error: {e})")
        else:
            # Mode développement sans provider configuré
            print(f"[DEV] SMS Code pour {phone_number}: {code}")

        return sms

    @staticmethod
    def verify_sms_code(*, session: Session, user: User, code: str) -> bool:
        """
        Vérifie un code SMS.

        Args:
            session: Session DB
            user: Utilisateur
            code: Code 6 chiffres

        Returns:
            bool: True si code valide
        """
        # Chercher code non utilisé et non expiré
        now = datetime.utcnow()
        sms = session.exec(
            select(SMSVerification).where(
                SMSVerification.user_id == user.id,
                SMSVerification.code == code,
                SMSVerification.is_used == False,  # noqa: E712
                SMSVerification.expires_at > now,
            )
        ).first()

        if not sms:
            return False

        # Marquer comme utilisé
        sms.is_used = True
        sms.used_at = now
        session.add(sms)
        session.commit()

        return True

    @staticmethod
    def disable_2fa(*, session: Session, user: User) -> None:
        """
        Désactive 2FA pour un utilisateur.

        Args:
            session: Session DB
            user: Utilisateur
        """
        config = session.exec(
            select(TwoFactorConfig).where(TwoFactorConfig.user_id == user.id)
        ).first()

        if config:
            config.is_enabled = False
            session.add(config)
            session.commit()

    @staticmethod
    def get_config(*, session: Session, user: User) -> Optional[TwoFactorConfig]:
        """
        Récupère la configuration 2FA d'un utilisateur.

        Args:
            session: Session DB
            user: Utilisateur

        Returns:
            TwoFactorConfig ou None
        """
        return session.exec(
            select(TwoFactorConfig).where(TwoFactorConfig.user_id == user.id)
        ).first()

    @staticmethod
    def mask_phone_number(phone: str) -> str:
        """
        Masque un numéro de téléphone pour affichage public.

        Args:
            phone: +33 6 12 34 56 78

        Returns:
            str: +33 6 ** ** ** 78
        """
        if len(phone) < 4:
            return "****"

        # Garder début (+33 6) et fin (78)
        return f"{phone[:6]} ** ** ** {phone[-2:]}"
