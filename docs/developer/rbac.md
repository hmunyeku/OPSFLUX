# Guide développeur — RBAC OpsFlux

## Convention de nommage des permissions

Toutes les permissions suivent : `<namespace>.<resource>.<action>`.

### Comment ajouter une nouvelle permission

1. Choisir le `namespace` parmi les 21 namespaces autorisés (cf. spec §4.2)
2. Choisir le `resource` (singulier, le nom de l'objet métier dans ce namespace)
3. Choisir l'`action` parmi les actions standardisées (cf. spec §4.3)
4. Ajouter le code dans une migration alembic via `INSERT INTO permissions ... ON CONFLICT DO UPDATE`
5. Si la permission est sensible RGPD (donne accès à des données personnelles), mettre `sensitive=true`
6. Raccrocher la permission aux rôles concernés via `INSERT INTO role_permissions`

### Vérification dans le code

Utiliser `require_permission("<code>")` comme dépendance FastAPI :

```python
@router.get("/", dependencies=[require_permission("asset.asset.read")])
async def list_assets(...):
    ...
```

## Convention `OWN` (filtrage métier)

`OWN` n'est pas une permission distincte. C'est un filtre appliqué au niveau du code des routes,
typiquement avec un `WHERE` SQL.

Exemples :

```python
# paxlog : un PAX voit son propre profil
stmt = select(PaxProfile).where(PaxProfile.user_id == current_user.id)

# tier_contact : un contact tier voit sa propre compagnie
stmt = select(Tier).join(UserTierLink, UserTierLink.tier_id == Tier.id).where(
    UserTierLink.user_id == current_user.id
)
```

La permission au niveau RBAC reste générique (`paxlog.profile.read`). C'est le code qui restreint
selon le rôle effectif du user.

## Moteur de résolution 4 couches

Voir `app/core/rbac.py:78` — fonction `_resolve_permissions`.

Ordre (mode restrictive, défaut) :
1. Group overrides (lowest)
2. Role permissions
3. Active delegations received
4. User overrides (highest)

## Délégations ISO

Voir `app/services/core/rbac_delegation_service.py`. Garde-fous :
- Validation de la durée max (setting `rbac.delegation.max_duration_days`)
- Validation des permissions effectives du délégateur
- Blocage de la sous-délégation (perms reçues via délégation non re-déléguables)
- Audit trail avec hash SHA-256 du certificat PDF
- 4 emails templates : granted, received, revoked, expired (FR + EN)

## Templates PDF système

Liste des slugs `core.rbac.*` :
- `core.rbac.matrix_role_permissions`
- `core.rbac.matrix_group_permissions`
- `core.rbac.matrix_user_permissions`
- `core.rbac.role_detail`
- `core.rbac.group_detail`
- `core.rbac.user_detail`
- `core.rbac.role_modules`
- `core.rbac.permission_catalog`
- `core.rbac.sod_matrix`
- `core.rbac.delegation_registry`
- `core.rbac.delegation_certificate`

Templates email :
- `rbac.delegation.granted`
- `rbac.delegation.received`
- `rbac.delegation.revoked`
- `rbac.delegation.expired`

Ces templates sont seedés en PR-B. Tant que PR-B n'est pas déployée, les endpoints d'export
retournent `404 RBAC_TEMPLATE_NOT_FOUND`.
