"""Teams module manifest — equipes transverses reutilisables."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="teams",
    name="Equipes",
    version="1.0.0",
    permissions=[
        "teams.read",       # voir les equipes publiques de l'entite + ses privees
        "teams.create",     # creer une nouvelle equipe (inline depuis ADS/Projet/...)
        "teams.update",     # modifier une equipe dont on est createur, ou si admin
        "teams.delete",     # soft-delete d'une equipe
        "teams.manage",     # acces full (read all incl. privees autres users)
        "teams.member.manage",  # add/remove/move members d'une equipe
    ],
    routes_prefix="/api/v1/teams",
)
