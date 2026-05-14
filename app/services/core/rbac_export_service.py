"""Helpers to build the `variables` dict passed to render_pdf for each RBAC PDF template."""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    Entity,
    Permission,
    Role,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)
from app.services.core.module_lifecycle_service import is_module_enabled, normalize_module_slug


async def _build_tenant_block(db: AsyncSession, entity_id: UUID) -> dict:
    entity = await db.get(Entity, entity_id)
    return {
        "id": str(entity.id),
        "name": entity.name,
        "logo_url": entity.logo_url,
    }


async def _build_generated_by_block(user: User) -> dict:
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
    }


async def _list_permissions(db: AsyncSession, entity_id: UUID, include_disabled: bool) -> list[Permission]:
    """Return permissions, marking module_disabled if relevant."""
    result = await db.execute(select(Permission).order_by(Permission.module, Permission.code))
    perms = list(result.scalars().all())
    if not include_disabled:
        filtered = []
        for p in perms:
            mod = normalize_module_slug(p.module) or "core"
            if mod == "core" or await is_module_enabled(db, entity_id, mod):
                filtered.append(p)
        return filtered
    return perms


async def _list_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(select(Role).order_by(Role.code))
    return list(result.scalars().all())


def _serialize_perm(p: Permission, entity_modules_disabled: set[str]) -> dict:
    mod = normalize_module_slug(p.module) or "core"
    return {
        "code": p.code,
        "name": p.name,
        "module": p.module,
        "namespace": p.namespace,
        "resource": p.resource,
        "action": p.action,
        "sensitive": p.sensitive,
        "deprecated": p.deprecated,
        "module_disabled": mod in entity_modules_disabled,
    }


def _serialize_role(r: Role) -> dict:
    return {
        "code": r.code,
        "name": r.name,
        "description": r.description,
        "module": r.module,
    }


async def _disabled_modules_for_entity(db: AsyncSession, entity_id: UUID) -> set[str]:
    """Return the set of modules disabled for the tenant. Empty if none."""
    # The function `is_module_enabled` knows what's disabled — we ask for known modules
    candidates = ["asset_registry", "moc", "paxlog", "packlog", "planner", "papyrus",
                  "pid_pfd", "conformite", "imputation", "support", "teams", "messaging",
                  "travelwiz", "report_editor", "workflow"]
    disabled: set[str] = set()
    for mod in candidates:
        if not await is_module_enabled(db, entity_id, mod):
            disabled.add(mod)
    return disabled


async def build_matrix_role_permissions_variables(
    db: AsyncSession,
    entity_id: UUID,
    user: User,
    lang: str,
    include_disabled: bool,
    audit_event_id: str = "",
    content_hash: str = "",
) -> dict:
    """Variables for `core.rbac.matrix_role_permissions` template."""
    tenant = await _build_tenant_block(db, entity_id)
    roles = await _list_roles(db)
    permissions = await _list_permissions(db, entity_id, include_disabled)

    # grants : dict (role_code, perm_code) -> bool. We use a flat list of [r, p] pairs (JSON-friendly)
    rp_result = await db.execute(select(RolePermission.role_code, RolePermission.permission_code))
    grants_set = {(row[0], row[1]) for row in rp_result.all()}
    perm_codes = {p.code for p in permissions}
    grants_flat = [[r, p] for (r, p) in grants_set if p in perm_codes]

    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    # Group permissions by module for the rendered matrix
    modules_map: dict[str, list[Permission]] = {}
    for p in permissions:
        mod = normalize_module_slug(p.module) or "core"
        modules_map.setdefault(mod, []).append(p)
    modules = [
        {
            "namespace": mod,
            "label": mod.replace("_", " ").title(),
            "permissions": [_serialize_perm(p, disabled_mods) for p in plist],
            "permission_count": len(plist),
            "disabled_in_tenant": mod in disabled_mods,
        }
        for mod, plist in sorted(modules_map.items())
    ]

    return {
        "tenant": tenant,
        "roles": [_serialize_role(r) for r in roles],
        "permissions": [_serialize_perm(p, disabled_mods) for p in permissions],
        "grants": grants_flat,
        "modules": modules,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_role_detail_variables(
    db: AsyncSession,
    entity_id: UUID,
    user: User,
    role_code: str,
    lang: str,
    audit_event_id: str = "",
    content_hash: str = "",
) -> dict:
    """Variables for `core.rbac.role_detail` template."""
    role = await db.get(Role, role_code)
    if not role:
        raise ValueError(f"Role {role_code} not found")

    # Permissions of this role, grouped by module
    perms_result = await db.execute(
        select(Permission)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .where(RolePermission.role_code == role_code)
        .order_by(Permission.module, Permission.code)
    )
    perms = list(perms_result.scalars().all())
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    grouped: dict[str, list[dict]] = {}
    for p in perms:
        mod = normalize_module_slug(p.module) or "core"
        grouped.setdefault(mod, []).append(_serialize_perm(p, disabled_mods))
    permissions_by_module = [
        {"module": mod, "permissions": plist} for mod, plist in sorted(grouped.items())
    ]

    # Groups using this role
    groups_result = await db.execute(
        select(UserGroup.id, UserGroup.name, UserGroup.entity_id, UserGroup.active)
        .join(UserGroupRole, UserGroupRole.group_id == UserGroup.id)
        .where(UserGroupRole.role_code == role_code, UserGroup.entity_id == entity_id)
    )
    groups = [
        {"id": str(row.id), "name": row.name, "active": row.active}
        for row in groups_result.all()
    ]

    # Users via groups (count)
    users_count_result = await db.execute(
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .join(UserGroupRole, UserGroupRole.group_id == UserGroupMember.group_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroupRole.role_code == role_code, UserGroup.entity_id == entity_id)
    )

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "role": _serialize_role(role),
        "permissions_by_module": permissions_by_module,
        "permission_count": len(perms),
        "groups_using_role": groups,
        "users_via_groups_count": users_count_result.scalar() or 0,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_permission_catalog_variables(
    db: AsyncSession,
    entity_id: UUID,
    user: User,
    lang: str,
    group_by: str,
    include_disabled: bool,
    audit_event_id: str = "",
    content_hash: str = "",
) -> dict:
    """Variables for `core.rbac.permission_catalog` template."""
    permissions = await _list_permissions(db, entity_id, include_disabled)
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    if group_by == "action":
        grouped: dict[str, list[dict]] = {}
        for p in permissions:
            grouped.setdefault(p.action or "other", []).append(_serialize_perm(p, disabled_mods))
        permissions_grouped = [{"group": k, "permissions": v} for k, v in sorted(grouped.items())]
    else:
        grouped = {}
        for p in permissions:
            mod = normalize_module_slug(p.module) or "core"
            grouped.setdefault(mod, []).append(_serialize_perm(p, disabled_mods))
        permissions_grouped = [{"group": k, "permissions": v} for k, v in sorted(grouped.items())]

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "permissions_by_module": permissions_grouped,
        "permission_count": len(permissions),
        "group_by": group_by,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_matrix_group_permissions_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str, include_disabled: bool,
    group_ids: list[UUID] | None = None,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Same pattern as build_matrix_role_permissions but with groups + their effective permissions (3+1 layers)."""
    # Fetch groups
    stmt = select(UserGroup).where(UserGroup.entity_id == entity_id, UserGroup.active == True)
    if group_ids:
        stmt = stmt.where(UserGroup.id.in_(group_ids))
    groups = list((await db.execute(stmt)).scalars().all())

    permissions = await _list_permissions(db, entity_id, include_disabled)
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    # For each group, compute effective permissions (role + overrides).
    # The `source` field reflects the WINNING layer for that (group, perm)
    # pair so the matrix can colour-code it via the same legend as the
    # other matrices (role / group / delegation). Delegations don't apply
    # to groups — they're per-user.
    grants_with_source: list[dict] = []
    from app.models.common import GroupPermissionOverride
    for g in groups:
        # Layer 2 (lower priority): role perms via UserGroupRole + RolePermission
        role_perms_stmt = (
            select(RolePermission.permission_code)
            .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
            .where(UserGroupRole.group_id == g.id)
        )
        role_perms = {row[0] for row in (await db.execute(role_perms_stmt)).all()}

        # Layer 1 (higher priority): group overrides — track them separately
        # so we can attribute the right source in the matrix cell.
        go_stmt = select(
            GroupPermissionOverride.permission_code,
            GroupPermissionOverride.granted,
        ).where(GroupPermissionOverride.group_id == g.id)
        override_grants: set[str] = set()
        override_revokes: set[str] = set()
        for pcode, granted in (await db.execute(go_stmt)).all():
            if granted:
                override_grants.add(pcode)
            else:
                override_revokes.add(pcode)

        # Compose effective set: role perms ∪ override grants \ override revokes
        effective = (role_perms | override_grants) - override_revokes

        for pcode in effective:
            if pcode in override_grants and pcode not in role_perms:
                # Granted explicitly by an override, not present at role level
                source = "group"
            elif pcode in override_grants and pcode in role_perms:
                # Both layers agree — show the override (higher priority) so
                # admins see that the override is what guarantees the grant
                source = "group"
            else:
                source = "role"
            grants_with_source.append({
                "group_id": str(g.id),
                "perm_code": pcode,
                "source": source,
            })

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "groups": [{"id": str(g.id), "name": g.name, "active": g.active} for g in groups],
        "permissions": [_serialize_perm(p, disabled_mods) for p in permissions],
        "grants": grants_with_source,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_matrix_user_permissions_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    user_ids: list[UUID] | None = None, role_code: str | None = None,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Users x Permissions matrix. Uses get_user_permissions for each user."""
    from app.core.rbac import get_user_permissions

    # Resolve user list
    stmt = (
        select(User)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id)
        .distinct()
    )
    if user_ids:
        stmt = stmt.where(User.id.in_(user_ids))
    if role_code:
        stmt = stmt.join(UserGroupRole, UserGroupRole.group_id == UserGroup.id).where(
            UserGroupRole.role_code == role_code
        )

    users = list((await db.execute(stmt)).scalars().all())

    permissions = await _list_permissions(db, entity_id, include_disabled=False)
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    # For each user, get effective permissions
    grants: list[dict] = []
    for u in users:
        effective = await get_user_permissions(u.id, entity_id, db)
        for pcode in effective:
            grants.append({"user_id": str(u.id), "perm_code": pcode})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "users": [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in users],
        "permissions": [_serialize_perm(p, disabled_mods) for p in permissions],
        "grants": grants,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_group_detail_variables(
    db: AsyncSession, entity_id: UUID, user: User, group_id: UUID, lang: str,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Single group detail. Members, roles, effective perms with source."""
    group = await db.get(UserGroup, group_id)
    if not group or group.entity_id != entity_id:
        raise ValueError("Group not found")

    # Roles
    roles_stmt = (
        select(Role).join(UserGroupRole, UserGroupRole.role_code == Role.code).where(UserGroupRole.group_id == group_id)
    )
    roles = [_serialize_role(r) for r in (await db.execute(roles_stmt)).scalars().all()]

    # Members
    members_stmt = (
        select(User).join(UserGroupMember, UserGroupMember.user_id == User.id).where(UserGroupMember.group_id == group_id)
    )
    members = [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in (await db.execute(members_stmt)).scalars().all()]

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "group": {
            "id": str(group.id),
            "name": group.name,
            "active": group.active,
            "asset_scope": str(group.asset_scope) if group.asset_scope else None,
        },
        "roles": roles,
        "members": members,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_user_detail_variables(
    db: AsyncSession, entity_id: UUID, user: User, target_user_id: UUID, lang: str,
    include_delegations: bool = True,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Single user detail. Groups, roles via groups, overrides, effective perms, delegations."""
    from app.core.rbac import get_user_permissions_with_sources
    from app.models.common import UserDelegation, UserPermissionOverride

    target = await db.get(User, target_user_id)
    if not target:
        raise ValueError("User not found")

    # Groups
    groups_stmt = (
        select(UserGroup).join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == target_user_id, UserGroup.entity_id == entity_id)
    )
    groups = list((await db.execute(groups_stmt)).scalars().all())

    # Effective perms with source
    sources = await get_user_permissions_with_sources(target_user_id, entity_id, db)
    effective = [{"code": code, "source": src} for code, src in sorted(sources.items())]

    # User overrides
    overrides_stmt = select(UserPermissionOverride).where(UserPermissionOverride.user_id == target_user_id)
    overrides = [
        {"code": o.permission_code, "granted": o.granted}
        for o in (await db.execute(overrides_stmt)).scalars().all()
    ]

    delegations_received: list[dict] = []
    delegations_given: list[dict] = []
    if include_delegations:
        rec_stmt = select(UserDelegation).where(
            UserDelegation.delegate_id == target_user_id, UserDelegation.entity_id == entity_id
        )
        for d in (await db.execute(rec_stmt)).scalars().all():
            delegations_received.append({
                "id": str(d.id),
                "delegator_id": str(d.delegator_id),
                "permissions": d.permissions,
                "start_date": d.start_date.isoformat(),
                "end_date": d.end_date.isoformat(),
                "active": d.active,
                "reason": d.reason,
            })
        giv_stmt = select(UserDelegation).where(
            UserDelegation.delegator_id == target_user_id, UserDelegation.entity_id == entity_id
        )
        for d in (await db.execute(giv_stmt)).scalars().all():
            delegations_given.append({
                "id": str(d.id),
                "delegate_id": str(d.delegate_id),
                "permissions": d.permissions,
                "start_date": d.start_date.isoformat(),
                "end_date": d.end_date.isoformat(),
                "active": d.active,
                "reason": d.reason,
            })

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "user": {
            "id": str(target.id),
            "full_name": target.full_name,
            "email": target.email,
            "user_type": target.user_type,
        },
        "groups": [{"id": str(g.id), "name": g.name} for g in groups],
        "overrides": overrides,
        "effective_permissions": effective,
        "delegations_received": delegations_received,
        "delegations_given": delegations_given,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_role_modules_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Roles x Modules summary view. For each (role, module), compute an access level."""
    roles = await _list_roles(db)
    permissions = await _list_permissions(db, entity_id, include_disabled=True)

    rp_stmt = select(RolePermission.role_code, RolePermission.permission_code)
    rp_map: dict[str, set[str]] = {}
    for r, p in (await db.execute(rp_stmt)).all():
        rp_map.setdefault(r, set()).add(p)

    perm_module: dict[str, str] = {p.code: (normalize_module_slug(p.module) or "core") for p in permissions}

    levels: list[dict] = []
    modules_in_use = sorted({m for m in perm_module.values()})

    # Hierarchical access-level classifier — highest match wins. Tiers are
    # designed to match the legend baked into role_modules.{fr,en}.body.html
    # (ADM / MGR / RWA / RWS / RW / R / —). The previous version produced
    # the literal "?" for roles whose granted actions didn't fall in the
    # narrow (approve|validate|submit|create|update|delete|read) bucket —
    # e.g. roles that only have "manage", "import", "publish"… The new
    # buckets cover the 24 distinct actions present in prod (2026-05).
    APPROVE_ACTIONS = {"approve", "validate", "validate_afc", "verify"}
    SUBMIT_ACTIONS = {"submit", "reject", "transition", "apply", "cancel"}
    WRITE_ACTIONS = {
        "create", "update", "delete", "publish", "customize", "reorder",
        "share", "declare", "import", "export", "check", "receive", "resolve",
    }

    for r in roles:
        for mod in modules_in_use:
            mod_perms = {p.code for p in permissions if perm_module[p.code] == mod}
            granted = rp_map.get(r.code, set()) & mod_perms
            if not granted:
                # Use en-dash (U+2013) to match the template's empty marker
                # (`level == '–'` check in role_modules.{fr,en}.body.html).
                level = "–"
            elif granted == mod_perms:
                level = "ADM"
            else:
                actions = {p.action for p in permissions if p.code in granted}
                if "manage" in actions:
                    level = "MGR"
                elif actions & APPROVE_ACTIONS:
                    level = "RWA"
                elif actions & SUBMIT_ACTIONS:
                    level = "RWS"
                elif actions & WRITE_ACTIONS:
                    level = "RW"
                elif "read" in actions:
                    level = "R"
                else:
                    # No recognised action and no read either — show the
                    # neutral en-dash marker instead of "?" which looked
                    # like a rendering glitch in past PDFs.
                    level = "–"
            levels.append({"role_code": r.code, "module": mod, "level": level})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "roles": [_serialize_role(r) for r in roles],
        "modules": modules_in_use,
        "access_levels": levels,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_sod_matrix_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Segregation of duties - detect anti-patterns."""
    SOD_RULES = [
        {"id": "MOC_CREATE_APPROVE", "label": "MOC: create + approve", "perms": ["moc.change.create", "moc.change.approve"]},
        {"id": "ADS_CREATE_APPROVE", "label": "ADS: create + approve", "perms": ["paxlog.ads.create", "paxlog.ads.approve"]},
        {"id": "DOC_CREATE_APPROVE", "label": "Document: create + approve", "perms": ["papyrus.document.create", "papyrus.document.approve"]},
    ]

    rp_stmt = select(RolePermission.role_code, RolePermission.permission_code)
    rp_map: dict[str, set[str]] = {}
    for r, p in (await db.execute(rp_stmt)).all():
        rp_map.setdefault(r, set()).add(p)

    violations: list[dict] = []
    for rule in SOD_RULES:
        for role_code, perms in rp_map.items():
            if all(p in perms for p in rule["perms"]):
                violations.append({"role_code": role_code, "rule_id": rule["id"], "rule_label": rule["label"], "perms": rule["perms"]})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "sod_rules": SOD_RULES,
        "violations": violations,
        "violation_count": len(violations),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_delegations_registry_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    status: str | None = None, start_date: datetime | None = None, end_date: datetime | None = None,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Registry of delegations. Filter by status/period."""
    from app.models.common import UserDelegation
    stmt = select(UserDelegation).where(UserDelegation.entity_id == entity_id)
    if start_date:
        stmt = stmt.where(UserDelegation.start_date >= start_date)
    if end_date:
        stmt = stmt.where(UserDelegation.end_date <= end_date)
    stmt = stmt.order_by(UserDelegation.created_at.desc())
    delegations_raw = list((await db.execute(stmt)).scalars().all())

    now = datetime.now(timezone.utc)
    delegations: list[dict] = []
    for d in delegations_raw:
        if not d.active:
            s = "revoked"
        elif d.start_date > now:
            s = "programmed"
        elif d.end_date <= now:
            s = "expired"
        else:
            s = "active"
        if status and s != status:
            continue
        delegator = await db.get(User, d.delegator_id)
        delegate = await db.get(User, d.delegate_id)
        delegations.append({
            "id": str(d.id),
            "delegator_name": delegator.full_name if delegator else "?",
            "delegate_name": delegate.full_name if delegate else "?",
            "permissions": d.permissions,
            "start_date": d.start_date.isoformat(),
            "end_date": d.end_date.isoformat(),
            "status": s,
            "reason": d.reason,
        })

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "delegations": delegations,
        "delegation_count": len(delegations),
        "period": {
            "start": start_date.isoformat() if start_date else None,
            "end": end_date.isoformat() if end_date else None,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }
