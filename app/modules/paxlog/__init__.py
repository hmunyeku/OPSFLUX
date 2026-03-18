"""PaxLog module manifest — PAX management, credentials, compliance, AdS, incidents."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="paxlog",
    name="PaxLog",
    version="1.0.0",
    permissions=[
        "paxlog.profile.read",
        "paxlog.profile.create",
        "paxlog.profile.update",
        "paxlog.credential.read",
        "paxlog.credential.create",
        "paxlog.credential.validate",
        "paxlog.credential_type.read",
        "paxlog.credential_type.create",
        "paxlog.compliance.read",
        "paxlog.compliance.manage",
        "paxlog.ads.read",
        "paxlog.ads.create",
        "paxlog.ads.update",
        "paxlog.ads.submit",
        "paxlog.ads.cancel",
        "paxlog.ads.pax.manage",
        "paxlog.incident.read",
        "paxlog.incident.create",
        "paxlog.incident.resolve",
    ],
    routes_prefix="/api/v1/pax",
)
