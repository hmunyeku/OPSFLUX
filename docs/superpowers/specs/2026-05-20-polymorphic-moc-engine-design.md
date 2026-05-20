# Polymorphic MOC Engine Design

## Context

OpsFlux currently has two overlapping change-management concepts:

- `ProjectChange`, scoped to a project, lightweight, recently added for project decisions, budget impact, planning impact, attachments, and notes.
- `MOC`, a much richer Management of Change module with FSM, validation matrix, status history, type templates, signatures, attachments, notes, and role-based permissions.

Keeping both as independent validation systems would create duplicated status rules, duplicated approval logic, duplicated permissions, and inconsistent audit trails. The better direction is to evolve MOC into the central change-management engine and expose it through contextual registers where needed, including project changes.

## Goal

Make the MOC module the reusable engine for change management across contexts:

- project change
- project task change
- process change
- asset / installation change
- future contexts that need controlled decisions, impact tracking, validation, attachments, and comments

The project "Changements" section should become a contextual MOC register, not a separate mini workflow.

## Non-Goals

- Do not remove the existing MOC process workflow.
- Do not delete `ProjectChange` immediately.
- Do not create a second approval engine inside the project module.
- Do not bypass entity scoping, module permissions, dictionary configuration, or existing attachment/note security.

## Domain Model

### MOC Context

Add contextual ownership fields to `mocs`:

- `context_type`: string, required for new contextual MOCs. Examples: `project`, `project_task`, `process`, `asset`, `installation`.
- `context_id`: UUID, nullable for legacy/global MOCs.
- `context_module`: string, nullable, examples: `projets`, `moc`, `asset_registry`.
- `context_payload`: JSONB, nullable, for contextual snapshot data that should not become first-class columns yet.

For project-backed changes, the engine should also keep using `project_id` where it already exists, because it is useful for joins and existing MOC/project promotion flows.

### Project Change Compatibility

`ProjectChange` remains temporarily as a compatibility/read model. It should not gain more workflow behavior. New project change creation should create or link a MOC instance.

Recommended transition:

1. Add `moc_id` to `project_changes`.
2. New project changes create a MOC and store its id in `project_changes.moc_id`.
3. Project UI reads contextual MOCs directly once stable.
4. `ProjectChange` remains a compatibility table for one release, then becomes a read model or is retired through a dedicated cleanup migration.

## Validation And Workflow

Validation must stay in MOC:

- MOC type defines the default validation matrix.
- Ad-hoc validators use existing MOC validation invite logic.
- Status transitions use existing MOC FSM.
- Project-specific "submit for validation" maps to MOC validators and status transitions, not a separate project status flow.

Project-level simple changes may use a lightweight MOC type such as `PROJECT_CHANGE`, with a small validation matrix, while process changes keep the full industrial MOC matrix.

## Attachments, Notes, And Audit

Attachments:

- Use `AttachmentManager ownerType="moc" ownerId={moc.id}` for all MOC-backed changes.
- Keep category dictionaries contextual through `moc_attachment_type` or future type-specific dictionary scopes.

Notes/comments:

- Use `NoteManager ownerType="moc" ownerId={moc.id}`.
- Do not create a project-specific comment mechanism for changes.

Audit:

- MOC status history remains the canonical timeline.
- Project pages can display a compact contextual timeline derived from MOC status history and notes.

## UI Architecture

Create a reusable frontend component:

`ChangeRegister`

Inputs:

- `contextType`
- `contextId`
- `contextModule`
- `projectId?`
- `tasks?`
- `compact?`
- `allowCreate?`
- `allowValidation?`
- `attachmentCategoryDictionary?`

Behavior:

- Lists MOC instances filtered by context.
- Provides a compact header without large KPI cards.
- Shows each change as a dense professional row/card with:
  - reference
  - title
  - type
  - status
  - priority
  - planning impact and budget impact on one line
  - linked tasks
  - validator state
  - attachment count
  - comment count when available
- Expands a change to show details, notes, attachments, validations, and history.
- On mobile, the register must not create horizontal scroll. Dense metadata wraps below the title.

Project usage:

- Project detail tab "Changements" renders `ChangeRegister contextType="project" contextId={project.id} contextModule="projets"`.
- Task detail integration is part of the same reusable component contract: it renders `ChangeRegister contextType="project_task" contextId={task.id} contextModule="projets" projectId={project.id}` when task-level changes are enabled.

## API Architecture

Add contextual MOC endpoints without breaking existing `/api/v1/moc`:

- `GET /api/v1/moc/context/{context_type}/{context_id}`
- `POST /api/v1/moc/context/{context_type}/{context_id}`

The endpoints must:

- require `moc.change.read` for read
- require `moc.create` or a context-specific bridge permission for create
- enforce tenant scoping on the contextual owner
- validate that `context_id` belongs to the current entity
- when `context_type=project_task`, validate the task belongs to the current entity and project
- preserve existing MOC type validation behavior

Project routes may expose thin wrappers only if useful for ergonomics:

- `GET /api/v1/projects/{project_id}/moc-changes`
- `POST /api/v1/projects/{project_id}/moc-changes`

These wrappers should delegate to the MOC service and not contain independent workflow rules.

## Permissions

Keep MOC permissions canonical:

- read: `moc.change.read`
- create: `moc.create`
- update: `moc.update`
- transition: `moc.transition`
- validate: `moc.validate`
- invite validator: `moc.validator.invite`

Add bridge permissions only where the UX needs project-specific delegation:

- `project.change.create` may allow creating a project-context MOC.
- `project.change.update` may allow editing limited project-context fields before submission.

Bridge permissions must not allow bypassing MOC validation or signature permissions.

## Migration Strategy

1. Add MOC context fields and indexes.
2. Add `project_changes.moc_id`.
3. Backfill existing active project changes into MOC rows:
   - `context_type='project'`
   - `context_id=project_changes.project_id`
   - `context_module='projets'`
   - `project_id=project_changes.project_id`
   - title, description, decision summary, priority, source, planning impact, budget impact copied into MOC fields or `context_payload`
4. Retarget existing `project_change` attachments and notes to the created MOC where safe, or keep a compatibility display during transition.
5. Switch project UI to read MOC contextual changes.
6. Stop creating standalone `ProjectChange` workflow data.

## Security And Multientity Rules

- Every contextual MOC query must filter by `entity_id`.
- Context owner resolution must deny unknown `context_type`.
- Cross-entity context IDs must return not found.
- Attachments and notes remain protected by existing owner resolution.
- Signature redaction rules remain unchanged.
- Context payload must be treated as internal structured metadata and never used to bypass relational checks.

## Testing

Backend tests:

- Context owner resolver denies unknown context types.
- Project-context MOC list only returns rows for current entity.
- Project-task context rejects tasks outside the project/entity.
- Project bridge create uses MOC service and produces a MOC row.
- `ProjectChange` compatibility does not introduce independent validation status rules.

Frontend tests or TypeScript checks:

- `ChangeRegister` accepts generic context props.
- Project tab uses the reusable register instead of project-only cards.
- Compact header has no large KPI grid.
- Attachments and notes panels use `ownerType="moc"`.

Manual browser verification:

- Project "Changements" tab on desktop and mobile.
- Create project-context change with planning and budget impacts on one line.
- Link one or more tasks.
- Invite a validator.
- Add a PJ and a note.
- Verify no horizontal scroll on mobile.

## Decisions For Implementation

- Keep `ProjectChange` as a compatibility table for one release while the UI moves to contextual MOC reads.
- Store project-specific impacts in `context_payload` first, with stable keys `planning_impact_days`, `budget_impact_amount`, `currency`, and `affected_task_ids`. Promote them to first-class MOC columns only if multiple contexts need the same fields.
- Use the existing MOC FSM with a lightweight `PROJECT_CHANGE` MOC type and validation matrix. Do not create a separate project-change FSM.
