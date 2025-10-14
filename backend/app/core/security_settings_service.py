"""
Service de gestion des paramètres de sécurité globaux.
Gère les settings 2FA, SMS provider, etc. avec cache pour performance.
"""

from typing import Optional
from sqlmodel import Session, select

from app.models import AppSettings


class SecuritySettingsService:
    """Service centralisé pour gérer les paramètres de sécurité globaux."""

    # Cache en mémoire pour éviter requêtes DB répétées
    _settings_cache: Optional[AppSettings] = None

    @staticmethod
    def get_settings(session: Session, use_cache: bool = True) -> AppSettings:
        """
        Récupère les paramètres globaux de l'application.
        Il ne doit y avoir qu'un seul enregistrement dans app_settings.

        Args:
            session: Session DB
            use_cache: Utiliser le cache ou forcer refresh

        Returns:
            AppSettings: Paramètres globaux
        """
        # Utiliser cache si disponible
        if use_cache and SecuritySettingsService._settings_cache is not None:
            return SecuritySettingsService._settings_cache

        # Récupérer depuis DB
        settings = session.exec(select(AppSettings)).first()

        # Si aucun settings n'existe, créer avec valeurs par défaut
        if not settings:
            settings = AppSettings()
            session.add(settings)
            session.commit()
            session.refresh(settings)

        # Mettre en cache
        SecuritySettingsService._settings_cache = settings

        return settings

    @staticmethod
    def clear_cache() -> None:
        """Vide le cache des settings (appelé après update)."""
        SecuritySettingsService._settings_cache = None

    @staticmethod
    def get_2fa_max_attempts(session: Session) -> int:
        """
        Récupère le nombre maximum de tentatives 2FA autorisées.

        Args:
            session: Session DB

        Returns:
            int: Nombre max de tentatives (défaut: 5)
        """
        settings = SecuritySettingsService.get_settings(session)
        return settings.twofa_max_attempts or 5

    @staticmethod
    def get_2fa_sms_timeout_minutes(session: Session) -> int:
        """
        Récupère la durée de validité des codes SMS en minutes.

        Args:
            session: Session DB

        Returns:
            int: Timeout en minutes (défaut: 10)
        """
        settings = SecuritySettingsService.get_settings(session)
        return settings.twofa_sms_timeout_minutes or 10

    @staticmethod
    def get_2fa_sms_rate_limit(session: Session) -> int:
        """
        Récupère le nombre maximum de SMS autorisés par heure.

        Args:
            session: Session DB

        Returns:
            int: Nombre max SMS/heure (défaut: 5)
        """
        settings = SecuritySettingsService.get_settings(session)
        return settings.twofa_sms_rate_limit or 5

    @staticmethod
    def get_sms_provider_config(session: Session) -> dict[str, Optional[str]]:
        """
        Récupère la configuration du provider SMS (Twilio, etc.).

        Args:
            session: Session DB

        Returns:
            dict: Configuration avec provider, account_sid, auth_token, phone_number
        """
        settings = SecuritySettingsService.get_settings(session)

        return {
            "provider": settings.sms_provider or "twilio",
            "account_sid": settings.sms_provider_account_sid,
            "auth_token": settings.sms_provider_auth_token,
            "phone_number": settings.sms_provider_phone_number,
        }

    @staticmethod
    def update_2fa_settings(
        session: Session,
        max_attempts: Optional[int] = None,
        sms_timeout_minutes: Optional[int] = None,
        sms_rate_limit: Optional[int] = None,
    ) -> AppSettings:
        """
        Met à jour les paramètres de sécurité 2FA.

        Args:
            session: Session DB
            max_attempts: Nombre max de tentatives 2FA
            sms_timeout_minutes: Durée validité code SMS
            sms_rate_limit: Nombre max SMS/heure

        Returns:
            AppSettings: Paramètres mis à jour
        """
        settings = SecuritySettingsService.get_settings(session, use_cache=False)

        if max_attempts is not None:
            settings.twofa_max_attempts = max_attempts
        if sms_timeout_minutes is not None:
            settings.twofa_sms_timeout_minutes = sms_timeout_minutes
        if sms_rate_limit is not None:
            settings.twofa_sms_rate_limit = sms_rate_limit

        session.add(settings)
        session.commit()
        session.refresh(settings)

        # Vider cache
        SecuritySettingsService.clear_cache()

        return settings

    @staticmethod
    def update_sms_provider(
        session: Session,
        provider: Optional[str] = None,
        account_sid: Optional[str] = None,
        auth_token: Optional[str] = None,
        phone_number: Optional[str] = None,
    ) -> AppSettings:
        """
        Met à jour la configuration du provider SMS.

        Args:
            session: Session DB
            provider: Nom du provider (twilio, etc.)
            account_sid: Account SID
            auth_token: Auth Token
            phone_number: Numéro émetteur

        Returns:
            AppSettings: Paramètres mis à jour
        """
        settings = SecuritySettingsService.get_settings(session, use_cache=False)

        if provider is not None:
            settings.sms_provider = provider
        if account_sid is not None:
            settings.sms_provider_account_sid = account_sid
        if auth_token is not None:
            settings.sms_provider_auth_token = auth_token
        if phone_number is not None:
            settings.sms_provider_phone_number = phone_number

        session.add(settings)
        session.commit()
        session.refresh(settings)

        # Vider cache
        SecuritySettingsService.clear_cache()

        return settings
