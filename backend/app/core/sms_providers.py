"""
Service SMS multi-providers avec adaptateurs.
Support: Twilio, BulkSMS, OVH, MessageBird, Vonage.
"""

from abc import ABC, abstractmethod
from typing import Optional
import requests
from twilio.rest import Client as TwilioClient


class SMSProvider(ABC):
    """Interface abstraite pour les providers SMS."""

    @abstractmethod
    def send_sms(self, to: str, message: str) -> dict:
        """
        Envoie un SMS.

        Args:
            to: Numéro destinataire (format international)
            message: Contenu du message

        Returns:
            dict avec status et message_id
        """
        pass


class TwilioProvider(SMSProvider):
    """Provider Twilio."""

    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.client = TwilioClient(account_sid, auth_token)
        self.from_number = from_number

    def send_sms(self, to: str, message: str) -> dict:
        try:
            msg = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to
            )
            return {"status": "sent", "message_id": msg.sid}
        except Exception as e:
            return {"status": "failed", "error": str(e)}


class BulkSMSProvider(SMSProvider):
    """Provider BulkSMS."""

    def __init__(self, username: str, password: str, from_number: str):
        self.username = username
        self.password = password
        self.from_number = from_number
        self.api_url = "https://api.bulksms.com/v1/messages"

    def send_sms(self, to: str, message: str) -> dict:
        try:
            response = requests.post(
                self.api_url,
                auth=(self.username, self.password),
                json={
                    "to": to,
                    "body": message,
                    "from": self.from_number
                }
            )
            if response.status_code in [200, 201]:
                data = response.json()
                return {"status": "sent", "message_id": data.get("id")}
            else:
                return {"status": "failed", "error": response.text}
        except Exception as e:
            return {"status": "failed", "error": str(e)}


class OVHProvider(SMSProvider):
    """Provider OVH."""

    def __init__(self, app_key: str, app_secret: str, consumer_key: str, service_name: str, from_number: str):
        self.app_key = app_key
        self.app_secret = app_secret
        self.consumer_key = consumer_key
        self.service_name = service_name
        self.from_number = from_number
        self.api_url = f"https://eu.api.ovh.com/1.0/sms/{service_name}/jobs"

    def send_sms(self, to: str, message: str) -> dict:
        try:
            # OVH nécessite une signature complexe, simplifié ici
            headers = {
                "X-Ovh-Application": self.app_key,
                "X-Ovh-Consumer": self.consumer_key,
                "Content-Type": "application/json"
            }
            response = requests.post(
                self.api_url,
                headers=headers,
                json={
                    "message": message,
                    "receivers": [to],
                    "sender": self.from_number,
                    "senderForResponse": True
                }
            )
            if response.status_code in [200, 201]:
                data = response.json()
                return {"status": "sent", "message_id": str(data.get("ids", [""])[0])}
            else:
                return {"status": "failed", "error": response.text}
        except Exception as e:
            return {"status": "failed", "error": str(e)}


class MessageBirdProvider(SMSProvider):
    """Provider MessageBird."""

    def __init__(self, access_key: str, from_number: str):
        self.access_key = access_key
        self.from_number = from_number
        self.api_url = "https://rest.messagebird.com/messages"

    def send_sms(self, to: str, message: str) -> dict:
        try:
            headers = {"Authorization": f"AccessKey {self.access_key}"}
            response = requests.post(
                self.api_url,
                headers=headers,
                json={
                    "recipients": [to],
                    "originator": self.from_number,
                    "body": message
                }
            )
            if response.status_code in [200, 201]:
                data = response.json()
                return {"status": "sent", "message_id": data.get("id")}
            else:
                return {"status": "failed", "error": response.text}
        except Exception as e:
            return {"status": "failed", "error": str(e)}


class VonageProvider(SMSProvider):
    """Provider Vonage (anciennement Nexmo)."""

    def __init__(self, api_key: str, api_secret: str, from_number: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.from_number = from_number
        self.api_url = "https://rest.nexmo.com/sms/json"

    def send_sms(self, to: str, message: str) -> dict:
        try:
            response = requests.post(
                self.api_url,
                json={
                    "api_key": self.api_key,
                    "api_secret": self.api_secret,
                    "to": to,
                    "from": self.from_number,
                    "text": message
                }
            )
            if response.status_code == 200:
                data = response.json()
                messages = data.get("messages", [])
                if messages and messages[0].get("status") == "0":
                    return {"status": "sent", "message_id": messages[0].get("message-id")}
                else:
                    error = messages[0].get("error-text") if messages else "Unknown error"
                    return {"status": "failed", "error": error}
            else:
                return {"status": "failed", "error": response.text}
        except Exception as e:
            return {"status": "failed", "error": str(e)}


class SMSProviderFactory:
    """Factory pour créer le bon provider selon la config."""

    @staticmethod
    def create_provider(
        provider_name: str,
        account_sid: Optional[str],
        auth_token: Optional[str],
        from_number: Optional[str]
    ) -> Optional[SMSProvider]:
        """
        Crée une instance du provider demandé.

        Args:
            provider_name: twilio, bulksms, ovh, messagebird, vonage
            account_sid: Account SID / Username / API Key
            auth_token: Auth Token / Password / API Secret
            from_number: Numéro émetteur

        Returns:
            Instance du provider ou None si config invalide
        """
        if not all([account_sid, auth_token, from_number]):
            return None

        provider_name = provider_name.lower()

        if provider_name == "twilio":
            return TwilioProvider(account_sid, auth_token, from_number)
        elif provider_name == "bulksms":
            return BulkSMSProvider(account_sid, auth_token, from_number)
        elif provider_name == "ovh":
            # OVH nécessite plus de params, on utilise auth_token comme consumer_key
            # et from_number comme service_name
            return OVHProvider(
                app_key=account_sid,
                app_secret=auth_token,
                consumer_key=auth_token,  # Simplifié
                service_name=from_number.split("/")[0] if "/" in from_number else "sms-default",
                from_number=from_number.split("/")[1] if "/" in from_number else from_number
            )
        elif provider_name == "messagebird":
            return MessageBirdProvider(account_sid, from_number)
        elif provider_name == "vonage":
            return VonageProvider(account_sid, auth_token, from_number)
        else:
            return None
