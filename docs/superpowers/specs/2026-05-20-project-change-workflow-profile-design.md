# Project Change Workflow Profile Design

## Context

The polymorphic MOC engine now lets a project change be stored as a contextual
MOC row. That direction is correct for reuse of notes, attachments, audit,
permissions, and validations. The current implementation is still wrong in
domain terms because project changes inherit the process MOC workflow language:
site chief, director, lead process, DO/DG, PID/ESD, and execution gates.

Project changes must use the same change-management engine without pretending
to be process MOCs.

## Goal

Introduce workflow profiles on top of the common MOC engine:

- `process_moc`: the existing industrial MOC process.
- `project_change`: a project-management change workflow.

Project change status flow:

`draft -> submitted -> in_review -> approved | rejected -> implemented -> closed`

The project profile keeps validations, comments, attachments, status history,
entity scoping, and audit from MOC, but uses project terminology and project
gates.

## Project Change Semantics

A project change captures:

- requester and project context;
- affected tasks;
- planning impact;
- budget impact;
- decision summary;
- optional validation roles: project manager, sponsor, planner, finance, HSE;
- implementation and closure evidence.

It must not require process-only concepts such as site chief signature,
director confirmation, process study, DO/DG execution accord, PID update, or
ESD update.

## Backend Design

Add `workflow_profile` to `mocs`.

Process MOC rows default to `process_moc`; project-context rows default to
`project_change`.

Status validation must accept both profile status sets. The service layer is
responsible for choosing the correct FSM based on `workflow_profile`:

- existing `FSM` remains for `process_moc`;
- new `PROJECT_CHANGE_FSM` handles project changes.

Project change transitions:

- `draft -> submitted`
- `submitted -> in_review`
- `in_review -> approved`
- `in_review -> rejected`
- `approved -> implemented`
- `implemented -> closed`

`approved` is only allowed when required validation rows are approved. The
same `MOCValidation` table is reused, but the roles are project-oriented where
possible. Existing role strings can be reused for now only as storage codes,
while UI labels must be project-specific.

## API Design

Existing endpoints remain stable:

- `GET /api/v1/moc/context/{context_type}/{context_id}`
- `POST /api/v1/moc/context/{context_type}/{context_id}`
- `POST /api/v1/moc/{id}/transition`
- `POST /api/v1/moc/{id}/validations`

The transition endpoint dispatches to the correct FSM based on
`workflow_profile`.

Contextual project creation sets:

- `workflow_profile='project_change'`
- `status='draft'`
- `context_payload.workflow_profile='project_change'` for client convenience

## Frontend Design

`ChangeRegister` receives `workflowProfile`.

For `workflowProfile='project_change'`, it:

- uses project labels and status names;
- hides process MOC type wording;
- shows validation progress compactly;
- exposes project workflow actions:
  - submit;
  - start review;
  - approve;
  - reject;
  - mark implemented;
  - close;
- keeps notes and attachments under `ownerType="moc"`;
- keeps planning/budget impact on the same line.

The project tab passes `workflowProfile="project_change"`.

## Migration

Add `mocs.workflow_profile`.

Existing rows:

- rows with `context_module='projets'` or `context_type in ('project', 'project_task')`
  become `project_change`;
- all others become `process_moc`.

Rows that were created as project contextual MOCs with process statuses are
normalized conservatively:

- `created -> draft`
- `study_in_validation -> in_review`
- `validated -> approved`
- `execution -> implemented`
- `closed -> closed`
- process-only intermediate statuses become `submitted` or `in_review`.

## Testing

Backend:

- project contextual creation sets workflow profile and draft status;
- project transition flow allows project statuses;
- project approval requires required validations;
- process MOC FSM still exists unchanged.

Frontend:

- TypeScript must pass;
- project change register must not render process labels;
- project change actions map to project statuses.
