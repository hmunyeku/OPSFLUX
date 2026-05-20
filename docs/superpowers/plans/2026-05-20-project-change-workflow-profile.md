# Project Change Workflow Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate project changes from the process MOC workflow while keeping the shared MOC engine for audit, validation, notes, and attachments.

**Architecture:** Add a `workflow_profile` discriminator to MOC rows, keep the existing process FSM, add a project-change FSM, and make the reusable `ChangeRegister` render project terminology/actions when used from the project module.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, Alembic, PostgreSQL, Pydantic, React, TypeScript, TanStack Query, existing MOC and project services.

---

## File Structure

- Modify `app/models/moc.py`: add workflow profile constants and column.
- Create `alembic/versions/186_moc_workflow_profiles.py`: add column, update status/profile constraints, normalize existing contextual project rows.
- Modify `app/schemas/moc.py`: expose `workflow_profile`.
- Modify `app/services/modules/moc_service.py`: add project FSM, creation defaults, and profile-aware transition dispatch.
- Modify `app/api/routes/modules/moc.py`: expose profile-aware FSM and keep existing endpoints stable.
- Modify `apps/main/src/services/mocService.ts`: add profile/status types and context payload support.
- Modify `apps/main/src/hooks/useMOC.ts`: ensure project transition invalidates context queries.
- Modify `apps/main/src/components/shared/ChangeRegister.tsx`: add project-change labels and actions.
- Modify `apps/main/src/pages/projets/panels/ProjectChangesSection.tsx`: pass `workflowProfile="project_change"`.
- Modify locale JSON files: add project-change labels.
- Modify `tests/unit/test_moc_context_engine.py`: source-level coverage for profile defaults and project FSM.

---

### Task 1: Add Workflow Profile Model And Migration

- [ ] Add MOC constants `MOC_WORKFLOW_PROFILES`, `PROCESS_MOC_STATUSES`, `PROJECT_CHANGE_STATUSES`, and `MOC_STATUSES`.
- [ ] Add `workflow_profile` to `MOC`.
- [ ] Add Alembic revision `186_moc_workflow_profiles`.
- [ ] Verify Python compilation.
- [ ] Commit as `feat: add moc workflow profile`.

### Task 2: Add Project Change FSM

- [ ] Add `PROJECT_CHANGE_FSM`.
- [ ] Add `fsm_for_profile` and `allowed_transitions`.
- [ ] Make contextual project MOC creation default to `workflow_profile='project_change'` and `status='draft'`.
- [ ] Make `transition` dispatch by profile and enforce required validations before project approval.
- [ ] Verify Python compilation.
- [ ] Commit as `feat: add project change workflow profile`.

### Task 3: Expose Profile In API And Client

- [ ] Add `workflow_profile` to read/create schemas and TypeScript interfaces.
- [ ] Update `/fsm` output to include per-profile transitions.
- [ ] Add client support for profile-aware transitions.
- [ ] Run TypeScript.
- [ ] Commit as `feat: expose moc workflow profiles`.

### Task 4: Update Project Change UI

- [ ] Add `workflowProfile` prop to `ChangeRegister`.
- [ ] Render project labels/statuses for `project_change`.
- [ ] Add compact workflow action buttons for project statuses.
- [ ] Keep notes and attachments bound to `ownerType='moc'`.
- [ ] Pass `workflowProfile='project_change'` from the project panel.
- [ ] Run TypeScript.
- [ ] Commit as `feat: render project change workflow`.

### Task 5: Validate And Push

- [ ] Run `python -m py_compile` on changed backend files.
- [ ] Run `npx.cmd tsc --noEmit` in `apps/main`.
- [ ] Run `git diff --check`.
- [ ] Simulate creating a project-context change and advancing the project workflow.
- [ ] Push `main`.
