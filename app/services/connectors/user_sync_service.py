"""
User sync providers — fetch users from external identity systems.

Each provider normalizes results to a common format for the Import Wizard.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ── Common output format ──────────────────────────────────────

class NormalizedUser:
    """Standard user record returned by all providers."""
    __slots__ = (
        "external_ref", "email", "first_name", "last_name",
        "department", "position", "phone", "groups", "active",
    )

    def __init__(
        self,
        external_ref: str,
        email: str,
        first_name: str = "",
        last_name: str = "",
        department: str | None = None,
        position: str | None = None,
        phone: str | None = None,
        groups: list[str] | None = None,
        active: bool = True,
    ):
        self.external_ref = external_ref
        self.email = email
        self.first_name = first_name
        self.last_name = last_name
        self.department = department
        self.position = position
        self.phone = phone
        self.groups = groups or []
        self.active = active

    def to_dict(self) -> dict[str, Any]:
        return {
            "external_ref": self.external_ref,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "department": self.department,
            "position": self.position,
            "phone": self.phone,
            "groups": self.groups,
            "active": self.active,
        }


# ── Abstract provider ─────────────────────────────────────────

class UserSyncProvider(ABC):
    """Base class for all user sync providers."""

    provider_id: str = ""
    label: str = ""

    @abstractmethod
    async def fetch_users(self) -> list[NormalizedUser]:
        """Fetch all users from the external system."""
        ...

    @abstractmethod
    async def test_connection(self) -> tuple[str, str]:
        """Test connectivity. Returns (status, message)."""
        ...

    @classmethod
    @abstractmethod
    def from_settings(cls, settings: dict[str, str]) -> "UserSyncProvider":
        """Factory: build a provider instance from a settings dict.

        Every concrete provider (LDAP / Azure AD / Okta / Keycloak / GouTi /
        SCIM) overrides this classmethod. Marking it ``@abstractmethod``
        makes the contract explicit — attempting to subclass without
        providing a factory will fail at import time rather than at first
        call. (Was previously a ``raise NotImplementedError`` — same
        runtime effect, now typechecker-friendly.)
        """
        ...


# ── LDAP / Active Directory ───────────────────────────────────

class LDAPUserSync(UserSyncProvider):
    provider_id = "ldap"
    label = "Active Directory / LDAP"

    def __init__(
        self,
        server_url: str,
        bind_dn: str,
        bind_password: str,
        base_dn: str,
        user_search_filter: str = "(objectClass=person)",
        group_search_filter: str = "(objectClass=group)",
    ):
        self.server_url = server_url
        self.bind_dn = bind_dn
        self.bind_password = bind_password
        self.base_dn = base_dn
        self.user_search_filter = user_search_filter
        self.group_search_filter = group_search_filter

    @classmethod
    def from_settings(cls, settings: dict[str, str]) -> "LDAPUserSync":
        return cls(
            server_url=settings.get("server_url", ""),
            bind_dn=settings.get("bind_dn", ""),
            bind_password=settings.get("bind_password", ""),
            base_dn=settings.get("base_dn", ""),
            user_search_filter=settings.get("user_search_filter", "(objectClass=person)"),
            group_search_filter=settings.get("group_search_filter", "(objectClass=group)"),
        )

    async def test_connection(self) -> tuple[str, str]:
        try:
            import ldap3
            server = ldap3.Server(self.server_url, get_info=ldap3.ALL)
            conn = ldap3.Connection(server, self.bind_dn, self.bind_password, auto_bind=True)
            conn.unbind()
            return "ok", f"Connected to {self.server_url}"
        except ImportError:
            # ldap3 is a declared dependency; this means deployment is broken.
            logger.exception("ldap3 module not importable — check pyproject.toml deps and Docker image")
            return "error", "ldap3 module not available in this build"
        except Exception as exc:
            return "error", str(exc)

    async def fetch_users(self) -> list[NormalizedUser]:
        try:
            import ldap3
        except ImportError:
            logger.exception("ldap3 module not importable during fetch_users — deployment broken")
            raise RuntimeError(
                "LDAP sync failed: ldap3 module is declared in pyproject.toml but not "
                "available at runtime. Check the Docker image build."
            )

        users: list[NormalizedUser] = []
        try:
            server = ldap3.Server(self.server_url, get_info=ldap3.ALL)
            conn = ldap3.Connection(server, self.bind_dn, self.bind_password, auto_bind=True)

            conn.search(
                self.base_dn,
                self.user_search_filter,
                attributes=[
                    "distinguishedName", "mail", "givenName", "sn",
                    "sAMAccountName", "department", "title",
                    "telephoneNumber", "memberOf", "userAccountControl",
                ],
            )

            for entry in conn.entries:
                attrs = entry.entry_attributes_as_dict
                email = (attrs.get("mail") or [""])[0]
                if not email:
                    continue

                # AD userAccountControl bit 2 = ACCOUNTDISABLE
                uac = int((attrs.get("userAccountControl") or [0])[0] or 0)
                active = not bool(uac & 0x2)

                # Extract group names from memberOf DNs
                groups = []
                for dn in attrs.get("memberOf", []):
                    # "CN=GroupName,OU=Groups,DC=corp,DC=local" → "GroupName"
                    if dn.startswith("CN="):
                        groups.append(dn.split(",")[0][3:])

                users.append(NormalizedUser(
                    external_ref=f"ldap:{(attrs.get('distinguishedName') or [''])[0]}",
                    email=email,
                    first_name=(attrs.get("givenName") or [""])[0],
                    last_name=(attrs.get("sn") or [""])[0],
                    department=(attrs.get("department") or [None])[0],
                    position=(attrs.get("title") or [None])[0],
                    phone=(attrs.get("telephoneNumber") or [None])[0],
                    groups=groups,
                    active=active,
                ))

            conn.unbind()
        except Exception:
            logger.exception("LDAP user fetch failed")

        return users


# ── Azure AD / Entra ID ───────────────────────────────────────

class AzureADUserSync(UserSyncProvider):
    provider_id = "azure_ad"
    label = "Azure AD / Entra ID"

    def __init__(self, tenant_id: str, client_id: str, client_secret: str):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret

    @classmethod
    def from_settings(cls, settings: dict[str, str]) -> "AzureADUserSync":
        return cls(
            tenant_id=settings.get("tenant_id", ""),
            client_id=settings.get("client_id", ""),
            client_secret=settings.get("client_secret", ""),
        )

    async def _get_token(self) -> str:
        url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "scope": "https://graph.microsoft.com/.default",
            })
            resp.raise_for_status()
            return resp.json()["access_token"]

    async def test_connection(self) -> tuple[str, str]:
        try:
            token = await self._get_token()
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://graph.microsoft.com/v1.0/users?$top=1",
                    headers={"Authorization": f"Bearer {token}"},
                )
                resp.raise_for_status()
            return "ok", "Connected to Microsoft Graph"
        except Exception as exc:
            return "error", str(exc)

    async def fetch_users(self) -> list[NormalizedUser]:
        users: list[NormalizedUser] = []
        try:
            token = await self._get_token()
            headers = {"Authorization": f"Bearer {token}"}
            url: str | None = (
                "https://graph.microsoft.com/v1.0/users"
                "?$select=id,mail,givenName,surname,department,jobTitle,businessPhones,accountEnabled"
                "&$top=999"
            )

            async with httpx.AsyncClient() as client:
                while url:
                    resp = await client.get(url, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()

                    for u in data.get("value", []):
                        email = u.get("mail") or ""
                        if not email:
                            continue
                        phones = u.get("businessPhones") or []
                        users.append(NormalizedUser(
                            external_ref=f"azure:{u['id']}",
                            email=email,
                            first_name=u.get("givenName") or "",
                            last_name=u.get("surname") or "",
                            department=u.get("department"),
                            position=u.get("jobTitle"),
                            phone=phones[0] if phones else None,
                            active=u.get("accountEnabled", True),
                        ))

                    url = data.get("@odata.nextLink")

        except Exception:
            logger.exception("Azure AD user fetch failed")

        return users


# ── GouTi RH ─────────────────────────────────────────────────

class GouTiUserSync(UserSyncProvider):
    provider_id = "gouti"
    label = "GouTi RH"

    def __init__(self, base_url: str, client_id: str, client_secret: str, entity_code: str):
        self.base_url = base_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.entity_code = entity_code

    @classmethod
    def from_settings(cls, settings: dict[str, str]) -> "GouTiUserSync":
        return cls(
            base_url=settings.get("base_url", "https://apiprd.gouti.net/v1/client"),
            client_id=settings.get("client_id", ""),
            client_secret=settings.get("client_secret", ""),
            entity_code=settings.get("entity_code", ""),
        )

    async def _get_token(self) -> str:
        async with httpx.AsyncClient() as client:
            # Step 1: get auth code
            resp1 = await client.post(f"{self.base_url}/code", json={
                "client_id": self.client_id,
                "callback_url": "https://opsflux.io/callback",
            })
            resp1.raise_for_status()
            code = resp1.json().get("authorization_code", resp1.json().get("code", ""))

            # Step 2: exchange for token
            resp2 = await client.post(f"{self.base_url}/token", json={
                "code": code,
                "client_id": self.client_id,
                "secret_client": self.client_secret,
            })
            resp2.raise_for_status()
            return resp2.json()["access_token"]

    async def test_connection(self) -> tuple[str, str]:
        try:
            await self._get_token()
            return "ok", "Connected to GouTi"
        except Exception as exc:
            return "error", str(exc)

    async def fetch_users(self) -> list[NormalizedUser]:
        users: list[NormalizedUser] = []
        try:
            token = await self._get_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Client-Id": self.client_id,
                "Entity-Code": self.entity_code,
                "Accept": "application/json",
            }

            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{self.base_url}/personnel", headers=headers)
                resp.raise_for_status()
                data = resp.json()

                items = data if isinstance(data, list) else data.get("data", data.get("results", []))

                for p in items:
                    email = p.get("email") or p.get("mail") or ""
                    if not email:
                        continue
                    pid = p.get("id") or p.get("personnel_id") or p.get("matricule") or ""
                    users.append(NormalizedUser(
                        external_ref=f"gouti:{pid}",
                        email=email,
                        first_name=p.get("prenom") or p.get("first_name") or "",
                        last_name=p.get("nom") or p.get("last_name") or "",
                        department=p.get("service") or p.get("department"),
                        position=p.get("fonction") or p.get("poste") or p.get("position"),
                        phone=p.get("telephone") or p.get("phone"),
                        active=p.get("actif", p.get("active", True)),
                    ))

        except Exception:
            logger.exception("GouTi user fetch failed")

        return users


# ── Okta ──────────────────────────────────────────────────────

class OktaUserSync(UserSyncProvider):
    provider_id = "okta"
    label = "Okta"

    def __init__(self, domain: str, api_token: str):
        self.domain = domain.rstrip("/")
        self.api_token = api_token

    @classmethod
    def from_settings(cls, settings: dict[str, str]) -> "OktaUserSync":
        return cls(
            domain=settings.get("domain", ""),
            api_token=settings.get("api_token", ""),
        )

    async def test_connection(self) -> tuple[str, str]:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://{self.domain}/api/v1/users?limit=1",
                    headers={"Authorization": f"SSWS {self.api_token}"},
                )
                resp.raise_for_status()
            return "ok", f"Connected to Okta ({self.domain})"
        except Exception as exc:
            return "error", str(exc)

    async def fetch_users(self) -> list[NormalizedUser]:
        users: list[NormalizedUser] = []
        try:
            headers = {"Authorization": f"SSWS {self.api_token}", "Accept": "application/json"}
            url: str | None = f"https://{self.domain}/api/v1/users?limit=200"

            async with httpx.AsyncClient() as client:
                while url:
                    resp = await client.get(url, headers=headers)
                    resp.raise_for_status()

                    for u in resp.json():
                        profile = u.get("profile", {})
                        email = profile.get("email") or profile.get("login") or ""
                        if not email:
                            continue
                        users.append(NormalizedUser(
                            external_ref=f"okta:{u['id']}",
                            email=email,
                            first_name=profile.get("firstName") or "",
                            last_name=profile.get("lastName") or "",
                            department=profile.get("department"),
                            position=profile.get("title"),
                            phone=profile.get("primaryPhone"),
                            active=u.get("status") == "ACTIVE",
                        ))

                    # Okta pagination via Link header
                    url = None
                    link_header = resp.headers.get("link", "")
                    for part in link_header.split(","):
                        if 'rel="next"' in part:
                            url = part.split(";")[0].strip().strip("<>")

        except Exception:
            logger.exception("Okta user fetch failed")

        return users


# ── Keycloak ──────────────────────────────────────────────────

class KeycloakUserSync(UserSyncProvider):
    provider_id = "keycloak"
    label = "Keycloak"

    def __init__(self, base_url: str, realm: str, client_id: str, client_secret: str):
        self.base_url = base_url.rstrip("/")
        self.realm = realm
        self.client_id = client_id
        self.client_secret = client_secret

    @classmethod
    def from_settings(cls, settings: dict[str, str]) -> "KeycloakUserSync":
        return cls(
            base_url=settings.get("base_url", ""),
            realm=settings.get("realm", "master"),
            client_id=settings.get("client_id", ""),
            client_secret=settings.get("client_secret", ""),
        )

    async def _get_token(self) -> str:
        url = f"{self.base_url}/realms/{self.realm}/protocol/openid-connect/token"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            })
            resp.raise_for_status()
            return resp.json()["access_token"]

    async def test_connection(self) -> tuple[str, str]:
        try:
            token = await self._get_token()
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/admin/realms/{self.realm}/users?max=1",
                    headers={"Authorization": f"Bearer {token}"},
                )
                resp.raise_for_status()
            return "ok", f"Connected to Keycloak ({self.realm})"
        except Exception as exc:
            return "error", str(exc)

    async def fetch_users(self) -> list[NormalizedUser]:
        users: list[NormalizedUser] = []
        try:
            token = await self._get_token()
            headers = {"Authorization": f"Bearer {token}"}
            first = 0
            batch = 100

            async with httpx.AsyncClient() as client:
                while True:
                    resp = await client.get(
                        f"{self.base_url}/admin/realms/{self.realm}/users?first={first}&max={batch}",
                        headers=headers,
                    )
                    resp.raise_for_status()
                    batch_users = resp.json()

                    if not batch_users:
                        break

                    for u in batch_users:
                        email = u.get("email") or ""
                        if not email:
                            continue
                        users.append(NormalizedUser(
                            external_ref=f"keycloak:{u['id']}",
                            email=email,
                            first_name=u.get("firstName") or "",
                            last_name=u.get("lastName") or "",
                            active=u.get("enabled", True),
                        ))

                    first += batch

        except Exception:
            logger.exception("Keycloak user fetch failed")

        return users


# ── Generic SCIM 2.0 ──────────────────────────────────────────
#
# SCIM (System for Cross-domain Identity Management) is an IETF standard
# for user provisioning. Many IdPs expose a SCIM 2.0 endpoint
# (https://datatracker.ietf.org/doc/html/rfc7644) — OneLogin, Workday,
# Bamboo, custom HR systems, etc. Supporting it generically lets OpsFlux
# ingest from any compliant provider without a bespoke class per vendor.

class SCIMUserSync(UserSyncProvider):
    provider_id = "scim"
    label = "SCIM 2.0 (générique)"

    def __init__(
        self,
        base_url: str,
        bearer_token: str,
        page_size: int = 100,
        filter_expr: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.bearer_token = bearer_token
        self.page_size = page_size
        self.filter_expr = filter_expr

    @classmethod
    def from_settings(cls, settings: dict[str, str]) -> "SCIMUserSync":
        return cls(
            base_url=settings.get("base_url", ""),
            bearer_token=settings.get("bearer_token", ""),
            page_size=int(settings.get("page_size", "100") or "100"),
            filter_expr=settings.get("filter") or None,
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.bearer_token}",
            "Accept": "application/scim+json, application/json",
        }

    async def test_connection(self) -> tuple[str, str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.base_url}/Users?count=1",
                    headers=self._headers(),
                )
                resp.raise_for_status()
            return "ok", f"Connected to SCIM endpoint ({self.base_url})"
        except Exception as exc:
            return "error", str(exc)

    async def fetch_users(self) -> list[NormalizedUser]:
        users: list[NormalizedUser] = []
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                start_index = 1
                while True:
                    params = {"startIndex": start_index, "count": self.page_size}
                    if self.filter_expr:
                        params["filter"] = self.filter_expr
                    resp = await client.get(
                        f"{self.base_url}/Users",
                        headers=self._headers(),
                        params=params,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    resources = data.get("Resources") or data.get("resources") or []
                    if not resources:
                        break
                    for u in resources:
                        users.append(self._to_normalized(u))
                    total = int(data.get("totalResults", len(resources)))
                    returned = int(data.get("itemsPerPage", len(resources)))
                    start_index += returned
                    if start_index > total or returned == 0:
                        break
        except Exception:
            logger.exception("SCIM user fetch failed")
        return users

    @staticmethod
    def _to_normalized(u: dict[str, Any]) -> NormalizedUser:
        emails = u.get("emails") or []
        primary_email = next(
            (e.get("value") for e in emails if e.get("primary")),
            emails[0].get("value") if emails else u.get("userName", ""),
        )
        name = u.get("name") or {}
        phones = u.get("phoneNumbers") or []
        enterprise = u.get("urn:ietf:params:scim:schemas:extension:enterprise:2.0:User") or {}
        groups = [g.get("display") or g.get("value") for g in u.get("groups") or [] if g]
        return NormalizedUser(
            external_ref=f"scim:{u.get('id') or u.get('externalId') or primary_email}",
            email=primary_email or "",
            first_name=name.get("givenName") or "",
            last_name=name.get("familyName") or "",
            department=enterprise.get("department") or u.get("department"),
            position=u.get("title") or enterprise.get("jobTitle"),
            phone=(phones[0].get("value") if phones else None),
            groups=[g for g in groups if g],
            active=u.get("active", True),
        )


# ── Provider registry ─────────────────────────────────────────

PROVIDER_REGISTRY: dict[str, type[UserSyncProvider]] = {
    "ldap": LDAPUserSync,
    "azure_ad": AzureADUserSync,
    "gouti": GouTiUserSync,
    "okta": OktaUserSync,
    "keycloak": KeycloakUserSync,
    "scim": SCIMUserSync,
}

# Settings prefix for each provider
PROVIDER_SETTINGS_PREFIX: dict[str, str] = {
    "ldap": "integration.ldap",
    "azure_ad": "integration.azure",
    "gouti": "integration.gouti",
    "okta": "integration.okta",
    "keycloak": "integration.keycloak",
    "scim": "integration.scim",
}


def get_provider(provider_id: str, settings: dict[str, str]) -> UserSyncProvider:
    """Build a provider instance from settings dict."""
    cls = PROVIDER_REGISTRY.get(provider_id)
    if not cls:
        raise ValueError(f"Unknown provider: {provider_id}")
    return cls.from_settings(settings)
