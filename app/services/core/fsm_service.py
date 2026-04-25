"""FSM (Finite State Machine) service — generic workflow state transitions.

All modules use this service for status changes. No module implements
its own transition logic directly (D-014).

Features:
- Validates transitions against workflow definition (dict or list format)
- Role-based transition guards (required_roles per transition edge)
- Row-level locking (SELECT ... FOR UPDATE) to prevent races
- Immutable audit trail (WorkflowTransition records)
- Event emission AFTER commit via EventBus (D-004)
- Optimistic version bump for concurrent safety

Pattern: await fsm_service.transition(entity, to_state, actor, db)
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.event_contracts import WORKFLOW_TRANSITION_EVENT, workflow_status_changed_event_names
from app.core.events import OpsFluxEvent, event_bus
from app.core.rbac import get_user_permissions
from app.models.common import (
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowTransition,
)

logger = logging.getLogger(__name__)


class FSMError(Exception):
    """Raised when a transition is not allowed."""
    pass


class FSMPermissionError(FSMError):
    """Raised when the actor does not have the required role for the transition."""
    pass


@dataclass
class TransitionInfo:
    """Metadata about a single allowed transition edge."""
    from_state: str
    to_state: str
    label: str | None = None
    required_roles: list[str] | None = None
    required_permission: str | None = None
    comment_required: bool = False
    sla_hours: int | None = None
    condition: dict | None = None
    assignee: dict | None = None


def _apply_transition_runtime_metadata(
    metadata: dict | None,
    *,
    to_state: str,
    sla_hours: int | None,
    assigned_to: str | None = None,
    assigned_role_code: str | None = None,
) -> dict:
    """Persist generic runtime timing hints for the current workflow state.

    This keeps temporal workflow automation generic:
    - the FSM records when the current state started
    - the scheduler can later use the configured SLA to send reminders
    """
    now = datetime.now(UTC)
    runtime_metadata = dict(metadata or {})
    runtime_metadata["current_state_name"] = to_state
    runtime_metadata["current_state_entered_at"] = now.isoformat()
    runtime_metadata.pop("current_state_last_reminder_at", None)
    if assigned_to:
        runtime_metadata["assigned_to"] = assigned_to
    else:
        runtime_metadata.pop("assigned_to", None)
    if assigned_role_code:
        runtime_metadata["assigned_role_code"] = assigned_role_code
    else:
        runtime_metadata.pop("assigned_role_code", None)

    if sla_hours and sla_hours > 0:
        runtime_metadata["current_state_sla_hours"] = sla_hours
        runtime_metadata["current_state_due_at"] = (now + timedelta(hours=sla_hours)).isoformat()
    else:
        runtime_metadata.pop("current_state_sla_hours", None)
        runtime_metadata.pop("current_state_due_at", None)

    return runtime_metadata


def _resolve_assignee_runtime_metadata(assignee: dict | None, context: dict | None) -> tuple[str | None, str | None]:
    if not assignee or not isinstance(assignee, dict):
        return None, None
    resolver = assignee.get("resolver")
    if resolver == "field":
        field_name = assignee.get("field")
        if field_name and context:
            value = context.get(field_name)
            if value:
                return str(value), None
        return None, None
    if resolver == "role":
        role_code = assignee.get("role_code")
        return None, str(role_code) if role_code else None
    return None, None


class FSMService:
    """Generic FSM service that manages workflow state transitions."""

    # ── Instance management ────────────────────────────────────────────

    async def get_or_create_instance(
        self,
        db: AsyncSession,
        *,
        workflow_slug: str,
        entity_type: str,
        entity_id: str,
        initial_state: str = "draft",
        entity_id_scope: UUID | None = None,
        created_by: UUID | None = None,
    ) -> WorkflowInstance:
        """Get existing workflow instance or create a new one."""
        result = await db.execute(
            select(WorkflowInstance).where(
                WorkflowInstance.entity_type == entity_type,
                WorkflowInstance.entity_id_ref == entity_id,
            )
        )
        instance = result.scalar_one_or_none()
        if instance:
            return instance

        # Find workflow definition (prefer entity-scoped, then global/any)
        stmt = select(WorkflowDefinition).where(
            WorkflowDefinition.slug == workflow_slug,
            WorkflowDefinition.active.is_(True),
        )
        if entity_id_scope:
            # Prefer entity-scoped definition
            scoped = await db.execute(
                stmt.where(WorkflowDefinition.entity_id == entity_id_scope)
            )
            definition = scoped.scalar_one_or_none()
            if not definition:
                # Fall back to any active definition
                any_result = await db.execute(stmt)
                definition = any_result.scalar_one_or_none()
        else:
            any_result = await db.execute(stmt)
            definition = any_result.scalar_one_or_none()

        if not definition:
            raise FSMError(f"Workflow definition '{workflow_slug}' not found")

        instance = WorkflowInstance(
            entity_id=entity_id_scope or definition.entity_id,
            workflow_definition_id=definition.id,
            entity_type=entity_type,
            entity_id_ref=entity_id,
            current_state=initial_state,
            metadata_=_apply_transition_runtime_metadata(None, to_state=initial_state, sla_hours=None),
            created_by=created_by,
        )
        db.add(instance)
        await db.flush()
        return instance

    async def get_instance(
        self,
        db: AsyncSession,
        *,
        entity_type: str,
        entity_id: str,
    ) -> WorkflowInstance | None:
        """Get an existing workflow instance (returns None if not found)."""
        result = await db.execute(
            select(WorkflowInstance).where(
                WorkflowInstance.entity_type == entity_type,
                WorkflowInstance.entity_id_ref == entity_id,
            )
        )
        return result.scalar_one_or_none()

    # ── Transition ─────────────────────────────────────────────────────

    async def transition(
        self,
        db: AsyncSession,
        *,
        workflow_slug: str,
        entity_type: str,
        entity_id: str,
        to_state: str,
        actor_id: UUID,
        comment: str | None = None,
        entity_id_scope: UUID | None = None,
        skip_role_check: bool = False,
        runtime_context: dict | None = None,
    ) -> WorkflowInstance:
        """Execute a state transition with validation and row-level locking.

        Steps:
        1. Get or create workflow instance
        2. Lock instance row (SELECT ... FOR UPDATE)
        3. Validate transition is allowed by definition
        4. Check actor has required role (if configured)
        5. Check comment is provided (if required for rejection)
        6. Update state + version
        7. Record immutable transition history
        8. Audit log
        9. Emit event AFTER the caller commits (via post_commit_events)

        Raises:
            FSMError: if transition is not allowed
            FSMPermissionError: if actor lacks required role
        """
        instance = await self.get_or_create_instance(
            db,
            workflow_slug=workflow_slug,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_id_scope=entity_id_scope,
        )

        # Re-select with lock to prevent concurrent transitions
        locked_result = await db.execute(
            select(WorkflowInstance)
            .where(WorkflowInstance.id == instance.id)
            .with_for_update()
        )
        instance = locked_result.scalar_one()
        from_state = instance.current_state

        # Load definition
        def_result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.id == instance.workflow_definition_id,
            )
        )
        definition = def_result.scalar_one()

        # Find matching transition and validate
        transition_meta = self._find_transition(
            definition.transitions, from_state, to_state, workflow_slug
        )

        # Role-based guard: check if actor has the required role
        if not skip_role_check and transition_meta.required_roles:
            has_role = await self._check_actor_role(
                db, actor_id, instance.entity_id, transition_meta.required_roles
            )
            if not has_role:
                raise FSMPermissionError(
                    f"Actor does not have required role(s) "
                    f"{transition_meta.required_roles} for transition "
                    f"'{from_state}' → '{to_state}'"
                )

        # Permission guard
        if not skip_role_check and transition_meta.required_permission:
            perms = await get_user_permissions(actor_id, instance.entity_id, db)
            if transition_meta.required_permission not in perms and "*" not in perms:
                raise FSMPermissionError(
                    f"Actor lacks permission '{transition_meta.required_permission}' "
                    f"for transition '{from_state}' → '{to_state}'"
                )

        # Comment required check (typically for rejections)
        if transition_meta.comment_required and not comment:
            raise FSMError(
                f"Comment is required for transition '{from_state}' → '{to_state}'"
            )

        # Execute transition
        instance.current_state = to_state
        instance.version = (instance.version or 1) + 1
        merged_metadata = dict(instance.metadata_ or {})
        if runtime_context:
            merged_metadata.update(runtime_context)
        assigned_to, assigned_role_code = _resolve_assignee_runtime_metadata(
            transition_meta.assignee,
            merged_metadata,
        )
        instance.metadata_ = _apply_transition_runtime_metadata(
            merged_metadata,
            to_state=to_state,
            sla_hours=transition_meta.sla_hours,
            assigned_to=assigned_to,
            assigned_role_code=assigned_role_code,
        )

        # Record immutable transition history
        transition_record = WorkflowTransition(
            instance_id=instance.id,
            from_state=from_state,
            to_state=to_state,
            actor_id=actor_id,
            comment=comment,
        )
        db.add(transition_record)

        # Audit log
        await record_audit(
            db,
            action="workflow.transition",
            resource_type=entity_type,
            resource_id=entity_id,
            user_id=actor_id,
            entity_id=entity_id_scope or instance.entity_id,
            details={
                "workflow": workflow_slug,
                "from": from_state,
                "to": to_state,
                "comment": comment,
            },
        )

        logger.info(
            "FSM: %s %s transitioned %s → %s by %s",
            entity_type, entity_id, from_state, to_state, actor_id,
        )

        return instance

    async def emit_transition_event(
        self,
        *,
        entity_type: str,
        entity_id: str,
        from_state: str,
        to_state: str,
        actor_id: UUID,
        workflow_slug: str,
        extra_payload: dict | None = None,
    ) -> None:
        """Emit a transition event AFTER the caller has committed.

        Must be called AFTER db.commit() — never inside a transaction (D-004).
        Event contract:
        - Always emit `{entity_type}.{to_state}` for direct FSM consumers.
        - Always emit `workflow.transition` as the generic orchestration spine.
        - Emit both `{entity_type}.status_changed` and `{entity_type}.status.changed`
          as compatibility aliases for modules still consuming one naming style.

        Domain-specific business events with richer payloads should still be
        emitted separately by route/service code when downstream modules depend
        on module semantics rather than raw workflow state changes.
        """
        payload = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_id_ref": entity_id,
            "from_state": from_state,
            "to_state": to_state,
            "actor_id": str(actor_id),
            "workflow_slug": workflow_slug,
            "definition_slug": workflow_slug,
        }
        if extra_payload:
            payload.update(extra_payload)

        event = OpsFluxEvent(
            event_type=f"{entity_type}.{to_state}",
            payload=payload,
        )
        await event_bus.publish(event)

        # Also emit a generic transition event
        generic_event = OpsFluxEvent(
            event_type=WORKFLOW_TRANSITION_EVENT,
            payload=payload,
        )
        await event_bus.publish(generic_event)

        for status_changed_event_name in workflow_status_changed_event_names(entity_type):
            await event_bus.publish(
                OpsFluxEvent(
                    event_type=status_changed_event_name,
                    payload=payload,
                )
            )

    # ── Query helpers ──────────────────────────────────────────────────

    async def get_allowed_transitions(
        self,
        db: AsyncSession,
        *,
        workflow_slug: str,
        entity_type: str,
        entity_id: str,
        actor_id: UUID | None = None,
    ) -> list[TransitionInfo]:
        """Get allowed transitions from current state, optionally filtered by actor's roles."""
        instance = await self.get_instance(
            db, entity_type=entity_type, entity_id=entity_id
        )
        if not instance:
            return []

        def_result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.id == instance.workflow_definition_id,
            )
        )
        definition = def_result.scalar_one()
        current = instance.current_state
        transitions = definition.transitions

        all_transitions = self._get_transitions_from_state(transitions, current)

        if not actor_id:
            return all_transitions

        # Filter by actor's roles
        actor_roles = await self._get_actor_roles(db, actor_id, instance.entity_id)
        filtered = []
        for t in all_transitions:
            if not t.required_roles:
                # No role restriction — anyone can do it
                filtered.append(t)
            elif any(r in actor_roles for r in t.required_roles):
                filtered.append(t)
            elif "*" in actor_roles:
                # Super admin
                filtered.append(t)
        return filtered

    async def get_definition(
        self,
        db: AsyncSession,
        *,
        workflow_slug: str,
        entity_id_scope: UUID | None = None,
    ) -> WorkflowDefinition | None:
        stmt = select(WorkflowDefinition).where(
            WorkflowDefinition.slug == workflow_slug,
            WorkflowDefinition.active.is_(True),
        )
        if entity_id_scope:
            scoped = await db.execute(stmt.where(WorkflowDefinition.entity_id == entity_id_scope))
            definition = scoped.scalar_one_or_none()
            if definition:
                return definition
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    def resolve_next_transition(
        self,
        *,
        transitions: dict | list,
        from_state: str,
        context: dict | None = None,
    ) -> TransitionInfo | None:
        """Return the first transition whose declarative condition matches.

        Transitions without a `condition` act as fallback transitions and are
        selected only if no earlier conditional edge matched.
        """
        context = context or {}
        candidates = self._get_transitions_from_state(transitions, from_state)
        fallback: TransitionInfo | None = None
        for transition in candidates:
            if not transition.condition:
                fallback = fallback or transition
                continue
            if self._evaluate_condition(transition.condition, context):
                return transition
        return fallback

    async def get_current_state(
        self,
        db: AsyncSession,
        *,
        entity_type: str,
        entity_id: str,
    ) -> str | None:
        """Get current state of an entity's workflow instance."""
        instance = await self.get_instance(
            db, entity_type=entity_type, entity_id=entity_id
        )
        return instance.current_state if instance else None

    async def get_transition_history(
        self,
        db: AsyncSession,
        *,
        entity_type: str,
        entity_id: str,
    ) -> list[WorkflowTransition]:
        """Get full transition history for an entity."""
        instance = await self.get_instance(
            db, entity_type=entity_type, entity_id=entity_id
        )
        if not instance:
            return []

        result = await db.execute(
            select(WorkflowTransition)
            .where(WorkflowTransition.instance_id == instance.id)
            .order_by(WorkflowTransition.created_at)
        )
        return list(result.scalars().all())

    # ── Internal helpers ───────────────────────────────────────────────

    def _find_transition(
        self,
        transitions: dict | list,
        from_state: str,
        to_state: str,
        workflow_slug: str,
    ) -> TransitionInfo:
        """Find and validate a transition edge. Raises FSMError if not found."""
        if isinstance(transitions, list):
            # Rich format: list of transition objects with metadata
            for t in transitions:
                t_from = t.get("from") or t.get("source")
                t_to = t.get("to") or t.get("target")
                if t_from == from_state and t_to == to_state:
                    return TransitionInfo(
                        from_state=from_state,
                        to_state=to_state,
                        label=t.get("label"),
                        required_roles=t.get("required_roles"),
                        required_permission=t.get("required_permission"),
                        comment_required=t.get("comment_required", False),
                        sla_hours=t.get("sla_hours"),
                        condition=t.get("condition"),
                        assignee=t.get("assignee"),
                    )
        elif isinstance(transitions, dict):
            # Simple format: {state: [allowed_targets]}
            allowed = transitions.get(from_state, [])
            if to_state in allowed:
                return TransitionInfo(
                    from_state=from_state,
                    to_state=to_state,
                )

        raise FSMError(
            f"Transition from '{from_state}' to '{to_state}' not allowed "
            f"for workflow '{workflow_slug}'"
        )

    def _get_transitions_from_state(
        self,
        transitions: dict | list,
        current_state: str,
    ) -> list[TransitionInfo]:
        """Get all possible transitions from a given state."""
        result = []
        if isinstance(transitions, list):
            for t in transitions:
                t_from = t.get("from") or t.get("source")
                t_to = t.get("to") or t.get("target")
                if t_from == current_state and t_to:
                    result.append(TransitionInfo(
                        from_state=current_state,
                        to_state=t_to,
                        label=t.get("label"),
                        required_roles=t.get("required_roles"),
                        required_permission=t.get("required_permission"),
                        comment_required=t.get("comment_required", False),
                        sla_hours=t.get("sla_hours"),
                        condition=t.get("condition"),
                        assignee=t.get("assignee"),
                    ))
        elif isinstance(transitions, dict):
            for target in transitions.get(current_state, []):
                result.append(TransitionInfo(
                    from_state=current_state,
                    to_state=target,
                ))
        return result

    async def _check_actor_role(
        self,
        db: AsyncSession,
        actor_id: UUID,
        entity_id: UUID,
        required_roles: list[str],
    ) -> bool:
        """Check if the actor belongs to a group with one of the required roles.

        Roles are stored on the UserGroupRole junction table (group_id +
        role_code). Joining UserGroup → UserGroupMember → UserGroupRole
        gives us the actor's effective roles within the entity.
        """
        result = await db.execute(
            select(UserGroupRole.role_code)
            .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(
                UserGroupMember.user_id == actor_id,
                UserGroup.entity_id == entity_id,
                UserGroup.active.is_(True),
            )
        )
        actor_roles = {row[0] for row in result.all()}

        # SUPER_ADMIN bypasses all role checks
        if "SUPER_ADMIN" in actor_roles:
            return True

        # Wildcard permission (* in user permissions) also bypasses
        perms = await get_user_permissions(actor_id, entity_id, db)
        if "*" in perms:
            return True

        return bool(actor_roles & set(required_roles))

    async def _get_actor_roles(
        self,
        db: AsyncSession,
        actor_id: UUID,
        entity_id: UUID,
    ) -> set[str]:
        """Get all role codes for an actor in an entity."""
        result = await db.execute(
            select(UserGroupRole.role_code)
            .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(
                UserGroupMember.user_id == actor_id,
                UserGroup.entity_id == entity_id,
                UserGroup.active.is_(True),
            )
        )
        roles = {row[0] for row in result.all()}

        # Check for wildcard permission (super admin)
        perms = await get_user_permissions(actor_id, entity_id, db)
        if "*" in perms:
            roles.add("*")

        return roles

    def _evaluate_condition(self, condition: dict, context: dict) -> bool:
        if "all" in condition:
            return all(self._evaluate_condition(item, context) for item in condition["all"])
        if "any" in condition:
            return any(self._evaluate_condition(item, context) for item in condition["any"])
        if "not" in condition:
            nested = condition["not"]
            return not self._evaluate_condition(nested, context) if isinstance(nested, dict) else False

        field = condition.get("field")
        op = (condition.get("op") or "eq").lower()
        left = self._resolve_context_value(context, field)
        right = condition.get("value")
        if "value_from" in condition:
            right = self._resolve_context_value(context, condition.get("value_from"))

        if op == "eq":
            return left == right
        if op == "ne":
            return left != right
        if op == "truthy":
            return bool(left)
        if op == "falsy":
            return not bool(left)
        if op == "in":
            return left in (right or [])
        if op == "not_in":
            return left not in (right or [])
        return False

    def _resolve_context_value(self, context: dict, path: str | None):
        if not path:
            return None
        value = context
        for part in str(path).split("."):
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = getattr(value, part, None)
            if value is None:
                return None
        return value


# Singleton
fsm_service = FSMService()
