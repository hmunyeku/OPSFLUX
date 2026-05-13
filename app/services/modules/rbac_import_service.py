"""RBAC bulk import service - 3 targets via ImportWizard.

Targets:
- rbac_role_permission : Role <-> Permission liaisons
- rbac_group_override  : Group permission overrides
- rbac_user_group      : User <-> Group memberships (with optional role assignment)

Guardrails:
- Cannot create new Role or Permission via import (security)
- Cannot import UserPermissionOverride (too sensitive RGPD)
- All imports log a RbacAuditEvent with row_count + hash of input
"""
import hashlib
import json
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    GroupPermissionOverride,
    Permission,
    RbacAuditEvent,
    Role,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)


async def _hash_rows(rows: list[dict]) -> str:
    """Stable SHA-256 of the import payload for audit traceability."""
    canonical = json.dumps(rows, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _log_import_audit(
    db: AsyncSession,
    entity_id: UUID,
    actor_user_id: UUID,
    target: str,
    rows: list[dict],
    result: dict,
) -> None:
    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type=f"import.{target}",
        target=target,
        params={"strategy": result.get("strategy"), "row_count": len(rows)},
        result_summary={
            "created": result.get("created", 0),
            "updated": result.get("updated", 0),
            "ignored": result.get("ignored", 0),
            "errors": result.get("errors", []),
        },
        file_hash_sha256=await _hash_rows(rows),
        actor_user_id=actor_user_id,
        status="success" if not result.get("errors") else "failure",
    )
    db.add(audit)
    await db.commit()


async def import_rbac_role_permission(
    db: AsyncSession,
    entity_id: UUID,
    rows: list[dict],
    strategy: Literal["MERGE", "REPLACE_ROLE"] = "MERGE",
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Expected columns: role_code, permission_code.

    REPLACE_ROLE: for each role_code touched, delete all existing liaisons, then insert.
    MERGE: insert with ON CONFLICT DO NOTHING semantics.
    """
    errors: list[dict] = []
    created = 0
    ignored = 0

    # Validate references
    valid_roles_q = await db.execute(select(Role.code))
    valid_roles = {r[0] for r in valid_roles_q.all()}

    valid_perms_q = await db.execute(select(Permission.code).where(Permission.deprecated == False))
    valid_perms = {p[0] for p in valid_perms_q.all()}

    # Filter and validate
    valid_rows: list[dict] = []
    for i, row in enumerate(rows):
        role_code = row.get("role_code")
        perm_code = row.get("permission_code")
        if not role_code or not perm_code:
            errors.append({"row": i, "message": "role_code or permission_code is missing"})
            continue
        if role_code not in valid_roles:
            errors.append({"row": i, "message": f"Unknown role_code: {role_code}"})
            continue
        if perm_code not in valid_perms:
            errors.append({"row": i, "message": f"Unknown or deprecated permission_code: {perm_code}"})
            continue
        valid_rows.append({"role_code": role_code, "permission_code": perm_code})

    # REPLACE: purge existing liaisons for the touched roles
    if strategy == "REPLACE_ROLE":
        touched_roles = {r["role_code"] for r in valid_rows}
        for role_code in touched_roles:
            await db.execute(delete(RolePermission).where(RolePermission.role_code == role_code))

    # Insert
    for row in valid_rows:
        existing_q = await db.execute(
            select(RolePermission).where(
                RolePermission.role_code == row["role_code"],
                RolePermission.permission_code == row["permission_code"],
            )
        )
        if existing_q.scalar_one_or_none():
            ignored += 1
            continue
        db.add(RolePermission(**row))
        created += 1

    await db.commit()

    result = {"strategy": strategy, "created": created, "ignored": ignored, "errors": errors}
    if actor_user_id:
        await _log_import_audit(db, entity_id, actor_user_id, "rbac_role_permission", rows, result)
    return result


async def import_rbac_group_override(
    db: AsyncSession,
    entity_id: UUID,
    rows: list[dict],
    strategy: Literal["MERGE", "REPLACE_GROUP"] = "MERGE",
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Expected columns: group_id (or group_name), permission_code, granted (bool)."""
    errors: list[dict] = []
    created = 0
    ignored = 0

    # Pre-resolve groups
    groups_q = await db.execute(select(UserGroup).where(UserGroup.entity_id == entity_id))
    groups_by_id = {str(g.id): g for g in groups_q.scalars().all()}
    groups_by_name = {g.name: g for g in groups_by_id.values()}

    valid_perms_q = await db.execute(select(Permission.code).where(Permission.deprecated == False))
    valid_perms = {p[0] for p in valid_perms_q.all()}

    valid_rows: list[dict] = []
    for i, row in enumerate(rows):
        group_ref = row.get("group_id") or row.get("group_name")
        if not group_ref:
            errors.append({"row": i, "message": "group_id or group_name required"})
            continue
        group = groups_by_id.get(str(group_ref)) or groups_by_name.get(str(group_ref))
        if not group:
            errors.append({"row": i, "message": f"Unknown group: {group_ref}"})
            continue
        perm_code = row.get("permission_code")
        if perm_code not in valid_perms:
            errors.append({"row": i, "message": f"Unknown permission: {perm_code}"})
            continue
        granted = row.get("granted")
        if isinstance(granted, str):
            granted = granted.lower() in ("true", "1", "yes", "oui")
        valid_rows.append({"group_id": group.id, "permission_code": perm_code, "granted": bool(granted)})

    if strategy == "REPLACE_GROUP":
        touched = {r["group_id"] for r in valid_rows}
        for gid in touched:
            await db.execute(delete(GroupPermissionOverride).where(GroupPermissionOverride.group_id == gid))

    for row in valid_rows:
        existing_q = await db.execute(
            select(GroupPermissionOverride).where(
                GroupPermissionOverride.group_id == row["group_id"],
                GroupPermissionOverride.permission_code == row["permission_code"],
            )
        )
        existing = existing_q.scalar_one_or_none()
        if existing:
            if strategy == "MERGE":
                existing.granted = row["granted"]
                created += 1
            else:
                ignored += 1
        else:
            db.add(GroupPermissionOverride(**row))
            created += 1

    await db.commit()
    result = {"strategy": strategy, "created": created, "ignored": ignored, "errors": errors}
    if actor_user_id:
        await _log_import_audit(db, entity_id, actor_user_id, "rbac_group_override", rows, result)
    return result


async def import_rbac_user_group(
    db: AsyncSession,
    entity_id: UUID,
    rows: list[dict],
    strategy: Literal["MERGE", "REPLACE_USER"] = "MERGE",
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Expected columns: user_email (or user_id), group_name (or group_id), roles (csv optional)."""
    errors: list[dict] = []
    created = 0
    ignored = 0

    # Pre-resolve
    users_q = await db.execute(select(User))
    users_by_email = {u.email: u for u in users_q.scalars().all()}

    groups_q = await db.execute(select(UserGroup).where(UserGroup.entity_id == entity_id))
    groups_by_id = {str(g.id): g for g in groups_q.scalars().all()}
    groups_by_name = {g.name: g for g in groups_by_id.values()}

    roles_q = await db.execute(select(Role.code))
    valid_roles = {r[0] for r in roles_q.all()}

    valid_rows: list[dict] = []
    for i, row in enumerate(rows):
        user_ref = row.get("user_email") or row.get("user_id")
        group_ref = row.get("group_id") or row.get("group_name")
        if not user_ref or not group_ref:
            errors.append({"row": i, "message": "user and group required"})
            continue
        user = users_by_email.get(str(user_ref))
        if not user:
            errors.append({"row": i, "message": f"Unknown user: {user_ref}"})
            continue
        group = groups_by_id.get(str(group_ref)) or groups_by_name.get(str(group_ref))
        if not group:
            errors.append({"row": i, "message": f"Unknown group: {group_ref}"})
            continue
        roles_csv = row.get("roles") or ""
        roles_list = [r.strip() for r in str(roles_csv).split(",") if r.strip()]
        unknown_roles = set(roles_list) - valid_roles
        if unknown_roles:
            errors.append({"row": i, "message": f"Unknown role(s): {sorted(unknown_roles)}"})
            continue
        valid_rows.append({"user_id": user.id, "group_id": group.id, "roles": roles_list})

    if strategy == "REPLACE_USER":
        touched_users = {r["user_id"] for r in valid_rows}
        for uid in touched_users:
            await db.execute(delete(UserGroupMember).where(UserGroupMember.user_id == uid))

    for row in valid_rows:
        existing_q = await db.execute(
            select(UserGroupMember).where(
                UserGroupMember.user_id == row["user_id"],
                UserGroupMember.group_id == row["group_id"],
            )
        )
        if not existing_q.scalar_one_or_none():
            db.add(UserGroupMember(user_id=row["user_id"], group_id=row["group_id"]))
            created += 1
        else:
            ignored += 1
        # Add roles on the group (idempotent)
        for role_code in row["roles"]:
            r_q = await db.execute(
                select(UserGroupRole).where(
                    UserGroupRole.group_id == row["group_id"],
                    UserGroupRole.role_code == role_code,
                )
            )
            if not r_q.scalar_one_or_none():
                db.add(UserGroupRole(group_id=row["group_id"], role_code=role_code))

    await db.commit()
    result = {"strategy": strategy, "created": created, "ignored": ignored, "errors": errors}
    if actor_user_id:
        await _log_import_audit(db, entity_id, actor_user_id, "rbac_user_group", rows, result)
    return result
