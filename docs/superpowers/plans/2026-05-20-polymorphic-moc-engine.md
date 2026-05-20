# Polymorphic MOC Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing MOC module into the canonical polymorphic change-management engine and use it for project changes without duplicating validation logic.

**Architecture:** Add context ownership fields to `mocs`, expose contextual MOC endpoints, and build a reusable `ChangeRegister` frontend component that uses MOC notes, attachments, validations, and status history. Keep `ProjectChange` as a one-release compatibility table linked to `mocs.moc_id`, but stop adding workflow behavior to it.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, Alembic, PostgreSQL JSONB, Pydantic, React, TypeScript, TanStack Query, existing OpsFlux MOC/Projets services, existing `AttachmentManager` and `NoteManager`.

---

## File Structure

- Modify: `app/models/moc.py`
  - Add MOC context columns.
- Modify: `app/models/common.py`
  - Add `ProjectChange.moc_id` compatibility FK.
- Create: `alembic/versions/185_polymorphic_moc_context.py`
  - Add MOC context fields, indexes, compatibility FK, and backfill.
- Modify: `app/schemas/moc.py`
  - Add context fields to create/read/update schemas and contextual create payload.
- Modify: `app/services/modules/moc_service.py`
  - Add owner resolution, contextual creation helper, and contextual list helper.
- Modify: `app/api/routes/modules/moc.py`
  - Add context endpoints and reuse MOC service helpers.
- Modify: `app/api/deps.py`
  - Ensure notes/attachments can safely resolve `moc` and keep `project_change` only for compatibility.
- Modify: `app/api/routes/modules/projets.py`
  - Add thin project wrapper endpoints or delegate project change creation to contextual MOC.
- Modify: `app/modules/moc/__init__.py` and `app/modules/projets/__init__.py`
  - Keep MOC canonical permissions; keep bridge project permissions.
- Modify: `apps/main/src/services/mocService.ts`
  - Add context APIs and context fields.
- Modify: `apps/main/src/hooks/useMOC.ts`
  - Add React Query hooks for contextual MOCs.
- Create: `apps/main/src/components/shared/ChangeRegister.tsx`
  - Reusable compact change register UI.
- Modify: `apps/main/src/pages/projets/panels/ProjectChangesSection.tsx`
  - Replace project-only implementation with `ChangeRegister`.
- Modify: `apps/main/src/pages/projets/panels/ProjectDetailPanel.tsx`
  - Keep tab wiring but pass project/tasks to contextual register.
- Modify: `apps/main/src/locales/fr/common.json` and `apps/main/src/locales/en/common.json`
  - Add shared change-register labels.
- Test: `tests/unit/test_moc_context_engine.py`
  - Backend context resolver and permission/security behavior.
- Test: `tests/unit/test_projects_flows.py`
  - Project bridge does not implement a separate workflow.

---

### Task 1: Migration And ORM Context Fields

**Files:**
- Create: `alembic/versions/185_polymorphic_moc_context.py`
- Modify: `app/models/moc.py`
- Modify: `app/models/common.py`
- Test: `tests/unit/test_moc_context_engine.py`

- [ ] **Step 1: Write failing model/migration test**

Add to `tests/unit/test_moc_context_engine.py`:

```python
from __future__ import annotations

from app.models.common import ProjectChange
from app.models.moc import MOC


def test_moc_declares_polymorphic_context_columns():
    assert hasattr(MOC, "context_type")
    assert hasattr(MOC, "context_id")
    assert hasattr(MOC, "context_module")
    assert hasattr(MOC, "context_payload")


def test_project_change_declares_moc_compatibility_link():
    assert hasattr(ProjectChange, "moc_id")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest tests/unit/test_moc_context_engine.py -q
```

Expected: FAIL because `MOC.context_type` and `ProjectChange.moc_id` do not exist yet. If pytest is missing in the local environment, record the blocker and continue with `python -m py_compile` after implementation.

- [ ] **Step 3: Add ORM fields**

In `app/models/moc.py`, add to `class MOC` near `project_id`:

```python
    context_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    context_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    context_module: Mapped[str | None] = mapped_column(String(80), nullable=True)
    context_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

In `app/models/common.py`, add to `class ProjectChange`:

```python
    moc_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mocs.id", ondelete="SET NULL"), nullable=True
    )
```

- [ ] **Step 4: Add migration**

Create `alembic/versions/185_polymorphic_moc_context.py`:

```python
"""Add polymorphic MOC context.

Revision ID: 185_polymorphic_moc_context
Revises: 184_project_change_management
Create Date: 2026-05-20
"""

from alembic import op


revision = "185_polymorphic_moc_context"
down_revision = "184_project_change_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_type VARCHAR(60)")
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_id UUID")
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_module VARCHAR(80)")
    op.execute("ALTER TABLE mocs ADD COLUMN IF NOT EXISTS context_payload JSONB")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mocs_context ON mocs(entity_id, context_type, context_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mocs_context_module ON mocs(entity_id, context_module)")
    op.execute("ALTER TABLE project_changes ADD COLUMN IF NOT EXISTS moc_id UUID REFERENCES mocs(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_changes_moc ON project_changes(moc_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_project_changes_moc")
    op.execute("ALTER TABLE project_changes DROP COLUMN IF EXISTS moc_id")
    op.execute("DROP INDEX IF EXISTS idx_mocs_context_module")
    op.execute("DROP INDEX IF EXISTS idx_mocs_context")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_payload")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_module")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_id")
    op.execute("ALTER TABLE mocs DROP COLUMN IF EXISTS context_type")
```

- [ ] **Step 5: Run verification**

Run:

```powershell
python -m py_compile app/models/moc.py app/models/common.py
python -m pytest tests/unit/test_moc_context_engine.py -q
```

Expected: py_compile OK. Test PASS when pytest is available.

- [ ] **Step 6: Commit**

```powershell
git add app/models/moc.py app/models/common.py alembic/versions/185_polymorphic_moc_context.py tests/unit/test_moc_context_engine.py
git commit -m "feat: add polymorphic moc context fields"
```

---

### Task 2: Context Owner Resolver And MOC Service Helpers

**Files:**
- Modify: `app/services/modules/moc_service.py`
- Test: `tests/unit/test_moc_context_engine.py`

- [ ] **Step 1: Write failing resolver tests**

Append to `tests/unit/test_moc_context_engine.py`:

```python
import inspect

from app.services.modules import moc_service


def test_moc_context_resolver_denies_unknown_context_types():
    src = inspect.getsource(moc_service.resolve_moc_context_owner)
    assert 'raise HTTPException(404, "Context owner not found")' in src
    assert 'context_type == "project"' in src
    assert 'context_type == "project_task"' in src


def test_contextual_moc_creation_helper_sets_context_fields():
    src = inspect.getsource(moc_service.create_contextual_moc)
    assert "context_type=context_type" in src
    assert "context_id=context_id" in src
    assert "context_module=context_module" in src
    assert "context_payload=context_payload" in src
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest tests/unit/test_moc_context_engine.py -q
```

Expected: FAIL because service helpers do not exist.

- [ ] **Step 3: Add resolver and helpers**

In `app/services/modules/moc_service.py`, add imports:

```python
from app.models.common import Project, ProjectTask
```

Add:

```python
async def resolve_moc_context_owner(
    db: AsyncSession,
    *,
    entity_id: UUID,
    context_type: str,
    context_id: UUID,
    project_id: UUID | None = None,
) -> object:
    if context_type == "project":
        owner = (await db.execute(
            select(Project).where(Project.id == context_id, Project.entity_id == entity_id)
        )).scalar_one_or_none()
        if owner is None:
            raise HTTPException(404, "Context owner not found")
        return owner

    if context_type == "project_task":
        stmt = (
            select(ProjectTask)
            .join(Project, Project.id == ProjectTask.project_id)
            .where(ProjectTask.id == context_id, Project.entity_id == entity_id)
        )
        if project_id is not None:
            stmt = stmt.where(ProjectTask.project_id == project_id)
        owner = (await db.execute(stmt)).scalar_one_or_none()
        if owner is None:
            raise HTTPException(404, "Context owner not found")
        return owner

    raise HTTPException(404, "Context owner not found")


async def list_contextual_mocs(
    db: AsyncSession,
    *,
    entity_id: UUID,
    context_type: str,
    context_id: UUID,
) -> list[MOC]:
    await resolve_moc_context_owner(
        db,
        entity_id=entity_id,
        context_type=context_type,
        context_id=context_id,
    )
    return list((await db.execute(
        select(MOC)
        .where(
            MOC.entity_id == entity_id,
            MOC.context_type == context_type,
            MOC.context_id == context_id,
            MOC.archived == False,  # noqa: E712
        )
        .order_by(MOC.created_at.desc())
    )).scalars().all())


async def create_contextual_moc(
    db: AsyncSession,
    *,
    entity_id: UUID,
    actor: User,
    context_type: str,
    context_id: UUID,
    context_module: str,
    payload,
    context_payload: dict | None = None,
) -> MOC:
    owner = await resolve_moc_context_owner(
        db,
        entity_id=entity_id,
        context_type=context_type,
        context_id=context_id,
    )
    project_id = getattr(owner, "project_id", None)
    if context_type == "project":
        project_id = getattr(owner, "id", None)
    platform_code = (getattr(owner, "code", None) or context_type).upper()
    reference = await generate_reference(db, entity_id=entity_id, platform_code=platform_code)
    moc = MOC(
        entity_id=entity_id,
        reference=reference,
        initiator_id=actor.id,
        initiator_name=actor.full_name,
        initiator_email=actor.email,
        title=payload.title,
        description=payload.description,
        objectives=payload.objectives,
        proposed_changes=payload.proposed_changes,
        impact_analysis=payload.impact_analysis,
        moc_type_id=payload.moc_type_id,
        manager_id=payload.manager_id,
        site_label=payload.site_label or "PROJECT",
        platform_code=platform_code,
        project_id=project_id,
        context_type=context_type,
        context_id=context_id,
        context_module=context_module,
        context_payload=context_payload,
        status="created",
    )
    db.add(moc)
    await db.flush()
    if payload.moc_type_id:
        await seed_matrix_from_type(db, moc=moc, moc_type_id=payload.moc_type_id)
    db.add(MOCStatusHistory(
        moc_id=moc.id,
        old_status=None,
        new_status="created",
        changed_by=actor.id,
        note="MOC créé",
    ))
    return moc
```

- [ ] **Step 4: Run verification**

```powershell
python -m py_compile app/services/modules/moc_service.py
python -m pytest tests/unit/test_moc_context_engine.py -q
```

Expected: py_compile OK. Tests PASS when pytest is available.

- [ ] **Step 5: Commit**

```powershell
git add app/services/modules/moc_service.py tests/unit/test_moc_context_engine.py
git commit -m "feat: add contextual moc service helpers"
```

---

### Task 3: Contextual MOC API Endpoints

**Files:**
- Modify: `app/schemas/moc.py`
- Modify: `app/api/routes/modules/moc.py`
- Test: `tests/unit/test_moc_context_engine.py`

- [ ] **Step 1: Write failing route/schema tests**

Append:

```python
from app.api.routes.modules import moc as moc_routes
from app.schemas import moc as moc_schemas


def test_moc_context_payload_schema_exists():
    assert hasattr(moc_schemas, "MOCContextCreate")
    fields = moc_schemas.MOCContextCreate.model_fields
    assert "title" in fields
    assert "context_payload" in fields
    assert "initial_validators" in fields


def test_moc_routes_expose_context_endpoints():
    src = inspect.getsource(moc_routes)
    assert '"/context/{context_type}/{context_id}"' in src
    assert "list_contextual_mocs" in src
    assert "create_contextual_moc" in src
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/unit/test_moc_context_engine.py -q
```

Expected: FAIL because schema and endpoints are missing.

- [ ] **Step 3: Add contextual schema**

In `app/schemas/moc.py`, after `MOCCreate`, add:

```python
class MOCContextCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    objectives: str | None = None
    proposed_changes: str | None = None
    impact_analysis: str | None = None
    moc_type_id: UUID | None = None
    manager_id: UUID | None = None
    site_label: str | None = Field(default=None, max_length=100)
    context_module: str = Field(default="projets", max_length=80)
    context_payload: dict | None = None
    initial_validators: list[MOCInitialValidator] = Field(default_factory=list)
```

Add to `MOCRead`:

```python
    context_type: str | None = None
    context_id: UUID | None = None
    context_module: str | None = None
    context_payload: dict | None = None
```

- [ ] **Step 4: Add endpoints**

In `app/api/routes/modules/moc.py`, import schema/helper names:

```python
    MOCContextCreate,
```

```python
    create_contextual_moc,
    list_contextual_mocs,
```

Add after `create_moc`:

```python
@router.get(
    "/context/{context_type}/{context_id}",
    response_model=list[MOCReadWithDetails],
    dependencies=[require_permission("moc.change.read")],
)
async def list_mocs_for_context(
    context_type: str,
    context_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mocs = await list_contextual_mocs(
        db,
        entity_id=entity_id,
        context_type=context_type,
        context_id=context_id,
    )
    names = await _user_display(db, {m.initiator_id for m in mocs})
    out = []
    for moc in mocs:
        detail = await _get_or_404(db, moc.id, entity_id, with_details=True)
        d = MOCReadWithDetails.model_validate(detail).model_dump(by_alias=True)
        d.update(_enrich(detail, names))
        await _redact_signatures(d, moc=detail, user=current_user, entity_id=entity_id, db=db)
        out.append(d)
    return out


@router.post(
    "/context/{context_type}/{context_id}",
    response_model=MOCReadWithDetails,
    status_code=201,
    dependencies=[require_permission("moc.change.create")],
)
async def create_moc_for_context(
    context_type: str,
    context_id: UUID,
    body: MOCContextCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    moc = await create_contextual_moc(
        db,
        entity_id=entity_id,
        actor=current_user,
        context_type=context_type,
        context_id=context_id,
        context_module=body.context_module,
        payload=body,
        context_payload=body.context_payload,
    )
    await db.commit()
    detail = await _get_or_404(db, moc.id, entity_id, with_details=True)
    names = await _user_display(db, {detail.initiator_id})
    d = MOCReadWithDetails.model_validate(detail).model_dump(by_alias=True)
    d.update(_enrich(detail, names))
    await _redact_signatures(d, moc=detail, user=current_user, entity_id=entity_id, db=db)
    return d
```

- [ ] **Step 5: Run verification**

```powershell
python -m py_compile app/schemas/moc.py app/api/routes/modules/moc.py
python -m pytest tests/unit/test_moc_context_engine.py -q
```

Expected: py_compile OK. Tests PASS when pytest is available.

- [ ] **Step 6: Commit**

```powershell
git add app/schemas/moc.py app/api/routes/modules/moc.py tests/unit/test_moc_context_engine.py
git commit -m "feat: expose contextual moc endpoints"
```

---

### Task 4: Frontend MOC Context Service And Hooks

**Files:**
- Modify: `apps/main/src/services/mocService.ts`
- Modify: `apps/main/src/hooks/useMOC.ts`

- [ ] **Step 1: Add TypeScript types**

In `apps/main/src/services/mocService.ts`, add fields to `MOC`:

```ts
  context_type: string | null
  context_id: string | null
  context_module: string | null
  context_payload: Record<string, unknown> | null
```

Add:

```ts
export interface MOCContextCreatePayload {
  title: string
  description?: string | null
  objectives?: string | null
  proposed_changes?: string | null
  impact_analysis?: string | null
  moc_type_id?: string | null
  manager_id?: string | null
  site_label?: string | null
  context_module?: string
  context_payload?: Record<string, unknown> | null
  initial_validators?: MOCInitialValidator[]
}
```

- [ ] **Step 2: Add service methods**

Inside `mocService`, add:

```ts
  listForContext: async (contextType: string, contextId: string): Promise<MOCDetail[]> => {
    const { data } = await api.get(`${BASE}/context/${contextType}/${contextId}`)
    return data
  },

  createForContext: async (
    contextType: string,
    contextId: string,
    payload: MOCContextCreatePayload,
  ): Promise<MOCDetail> => {
    const { data } = await api.post(`${BASE}/context/${contextType}/${contextId}`, payload)
    return data
  },
```

- [ ] **Step 3: Add hooks**

In `apps/main/src/hooks/useMOC.ts`, add:

```ts
export function useMOCsForContext(contextType: string, contextId: string | undefined) {
  return useQuery({
    queryKey: ['moc-context', contextType, contextId],
    queryFn: () => mocService.listForContext(contextType, contextId!),
    enabled: Boolean(contextType && contextId),
  })
}

export function useCreateMOCForContext() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contextType, contextId, payload }: {
      contextType: string
      contextId: string
      payload: MOCContextCreatePayload
    }) => mocService.createForContext(contextType, contextId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['moc-context', variables.contextType, variables.contextId] })
    },
  })
}
```

- [ ] **Step 4: Run TypeScript**

```powershell
npx.cmd tsc --noEmit --pretty false
```

Expected: TypeScript OK.

- [ ] **Step 5: Commit**

```powershell
git add apps/main/src/services/mocService.ts apps/main/src/hooks/useMOC.ts
git commit -m "feat: add moc context client hooks"
```

---

### Task 5: Reusable ChangeRegister Component

**Files:**
- Create: `apps/main/src/components/shared/ChangeRegister.tsx`
- Modify: `apps/main/src/locales/fr/common.json`
- Modify: `apps/main/src/locales/en/common.json`

- [ ] **Step 1: Add i18n labels**

Add `shared.change_register` keys in both locale files:

```json
"change_register": {
  "add": "Ajouter un changement",
  "empty_title": "Aucun changement enregistré",
  "empty_description": "Les décisions, écarts et impacts seront listés ici.",
  "title_placeholder": "Titre du changement",
  "planning_impact": "Impact planning",
  "budget_impact": "Impact budget",
  "linked_tasks": "Tâches liées",
  "validator": "Validateur",
  "attachments": "Pièces jointes",
  "notes": "Notes",
  "history": "Historique",
  "details": "Détails"
}
```

Use English equivalents in `en/common.json`.

- [ ] **Step 2: Create component**

Create `apps/main/src/components/shared/ChangeRegister.tsx` with:

```tsx
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, FileText, Loader2, Plus } from 'lucide-react'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { RichTextDisplay, RichTextField } from '@/components/shared/RichTextField'
import { EmptyState } from '@/components/ui/EmptyState'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { useCreateMOCForContext, useMOCsForContext } from '@/hooks/useMOC'
import { useMOCTypes } from '@/hooks/useMOC'
import type { MOCDetail } from '@/services/mocService'
import type { ProjectTask } from '@/types/api'
import { cn } from '@/lib/utils'

interface ChangeRegisterProps {
  contextType: string
  contextId: string | undefined
  contextModule: string
  projectId?: string
  tasks?: ProjectTask[]
  currency?: string
  compact?: boolean
  attachmentCategoryDictionary?: string
}

function contextPayloadValue(moc: MOCDetail, key: string) {
  const payload = moc.context_payload
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : null
}

function formatMoney(value: unknown, currency: string, locale: string) {
  const amount = typeof value === 'number' ? value : Number(value || 0)
  return `${new Intl.NumberFormat(locale || 'fr-FR', { maximumFractionDigits: 0 }).format(amount)} ${currency}`
}

function ChangeRow({ moc, tasks, currency }: { moc: MOCDetail; tasks: ProjectTask[]; currency: string }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const taskIds = Array.isArray(contextPayloadValue(moc, 'affected_task_ids'))
    ? contextPayloadValue(moc, 'affected_task_ids') as string[]
    : []
  const linkedTasks = tasks.filter((task) => taskIds.includes(task.id))
  const planningImpact = contextPayloadValue(moc, 'planning_impact_days') ?? 0
  const budgetImpact = contextPayloadValue(moc, 'budget_impact_amount') ?? 0
  const payloadCurrency = String(contextPayloadValue(moc, 'currency') || currency)

  return (
    <article className="rounded-md border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-3 px-3 py-2 text-left"
      >
        <ChevronDown size={14} className={cn('mt-1 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{moc.reference}</span>
            <span className="rounded border border-border px-1.5 py-0.5">{moc.status}</span>
            {moc.priority && <span className="rounded border border-border px-1.5 py-0.5">P{moc.priority}</span>}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{moc.title || moc.objectives || moc.reference}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span>{t('shared.change_register.planning_impact')}: <b className="text-foreground">{String(planningImpact)}j</b></span>
            <span>{t('shared.change_register.budget_impact')}: <b className="text-foreground">{formatMoney(budgetImpact, payloadCurrency, i18n.language)}</b></span>
            {linkedTasks.length > 0 && <span>{t('shared.change_register.linked_tasks')}: <b className="text-foreground">{linkedTasks.length}</b></span>}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {moc.description && <RichTextDisplay value={moc.description} className="text-sm" />}
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t('shared.change_register.attachments')}</div>
              <AttachmentManager ownerType="moc" ownerId={moc.id} compact categoryDictionary="moc_attachment_type" />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t('shared.change_register.notes')}</div>
              <NoteManager ownerType="moc" ownerId={moc.id} compact />
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

export function ChangeRegister({
  contextType,
  contextId,
  contextModule,
  tasks = [],
  currency = 'XAF',
  compact = true,
}: ChangeRegisterProps) {
  const { t } = useTranslation()
  const { data: mocs = [], isLoading } = useMOCsForContext(contextType, contextId)
  const { data: mocTypes = [] } = useMOCTypes(false)
  const create = useCreateMOCForContext()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [planningImpact, setPlanningImpact] = useState('')
  const [budgetImpact, setBudgetImpact] = useState('')
  const [mocTypeId, setMocTypeId] = useState('')
  const [taskIds, setTaskIds] = useState<string[]>([])

  const selectedTasksLabel = useMemo(() => tasks.filter((task) => taskIds.includes(task.id)).map((task) => task.title).join(', '), [taskIds, tasks])

  const save = async () => {
    if (!contextId || !title.trim()) return
    await create.mutateAsync({
      contextType,
      contextId,
      payload: {
        title: title.trim(),
        description: description || null,
        context_module: contextModule,
        moc_type_id: mocTypeId || null,
        context_payload: {
          planning_impact_days: planningImpact ? Number(planningImpact) : 0,
          budget_impact_amount: budgetImpact ? Number(budgetImpact) : 0,
          currency,
          affected_task_ids: taskIds,
        },
      },
    })
    setTitle('')
    setDescription('')
    setPlanningImpact('')
    setBudgetImpact('')
    setTaskIds([])
    setOpen(false)
  }

  return (
    <div className={cn('space-y-3', compact && 'text-sm')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{mocs.length} {t('shared.change_register.details')}</div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          <Plus size={14} /> {t('shared.change_register.add')}
        </button>
      </div>
      {open && (
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input className={panelInputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('shared.change_register.title_placeholder')} />
            <select className={panelInputClass} value={mocTypeId} onChange={(e) => setMocTypeId(e.target.value)}>
              <option value="">MOC</option>
              {mocTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
            <input className={panelInputClass} type="number" value={planningImpact} onChange={(e) => setPlanningImpact(e.target.value)} placeholder={t('shared.change_register.planning_impact')} />
            <input className={panelInputClass} type="number" value={budgetImpact} onChange={(e) => setBudgetImpact(e.target.value)} placeholder={t('shared.change_register.budget_impact')} />
          </div>
          {tasks.length > 0 && (
            <select
              className={`${panelInputClass} mt-2`}
              value=""
              onChange={(e) => {
                if (e.target.value && !taskIds.includes(e.target.value)) setTaskIds([...taskIds, e.target.value])
              }}
            >
              <option value="">{selectedTasksLabel || t('shared.change_register.linked_tasks')}</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          )}
          <div className="mt-2">
            <RichTextField value={description} onChange={setDescription} compact rows={3} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!title.trim() || create.isPending}>
              {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {t('common.save')}
            </button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="py-4 text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : mocs.length === 0 ? (
        <EmptyState icon={AlertTriangle} title={t('shared.change_register.empty_title')} description={t('shared.change_register.empty_description')} />
      ) : (
        <div className="space-y-2">
          {mocs.map((moc) => <ChangeRow key={moc.id} moc={moc} tasks={tasks} currency={currency} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript**

```powershell
npx.cmd tsc --noEmit --pretty false
```

Expected: TypeScript OK. If imports need exact `MOCDetail` naming from `mocService.ts`, adjust the import and rerun.

- [ ] **Step 4: Commit**

```powershell
git add apps/main/src/components/shared/ChangeRegister.tsx apps/main/src/locales/fr/common.json apps/main/src/locales/en/common.json
git commit -m "feat: add reusable change register"
```

---

### Task 6: Replace Project Changes Section With ChangeRegister

**Files:**
- Modify: `apps/main/src/pages/projets/panels/ProjectChangesSection.tsx`
- Modify: `apps/main/src/pages/projets/panels/ProjectDetailPanel.tsx`

- [ ] **Step 1: Replace project-only section**

In `ProjectChangesSection.tsx`, replace the existing body with a thin wrapper:

```tsx
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FormSection } from '@/components/layout/DynamicPanel'
import { ChangeRegister } from '@/components/shared/ChangeRegister'
import type { ProjectTask } from '@/types/api'

export function ProjectChangesSection({
  projectId,
  currency = 'XAF',
  tasks = [],
}: {
  projectId: string
  currency?: string
  tasks?: ProjectTask[]
}) {
  const { t } = useTranslation()
  return (
    <FormSection
      title={<span className="inline-flex items-center gap-2"><AlertTriangle size={14} /> {t('projets.detail.tabs.changes')}</span>}
      collapsible
      defaultExpanded
      storageKey="project-changes"
    >
      <ChangeRegister
        contextType="project"
        contextId={projectId}
        contextModule="projets"
        projectId={projectId}
        tasks={tasks}
        currency={currency}
        compact
        attachmentCategoryDictionary="moc_attachment_type"
      />
    </FormSection>
  )
}
```

- [ ] **Step 2: Pass tasks from project detail**

In `ProjectDetailPanel.tsx`, find the `ProjectChangesSection` render and pass existing `tasks`:

```tsx
<ProjectChangesSection projectId={project.id} currency={project.currency || 'XAF'} tasks={tasks ?? []} />
```

- [ ] **Step 3: Run TypeScript**

```powershell
npx.cmd tsc --noEmit --pretty false
```

Expected: TypeScript OK.

- [ ] **Step 4: Browser check**

Open:

```text
http://127.0.0.1:5174/projets/2b641ff3-932a-44c1-aade-3f3d2da1c583
```

Expected:

- Changement tab has no large insight KPI grid.
- Planning and budget impact fields are on the same line on desktop.
- No horizontal scroll on mobile width.
- Attachments and notes are shown under expanded MOC rows using `ownerType="moc"`.

- [ ] **Step 5: Commit**

```powershell
git add apps/main/src/pages/projets/panels/ProjectChangesSection.tsx apps/main/src/pages/projets/panels/ProjectDetailPanel.tsx
git commit -m "feat: use moc register for project changes"
```

---

### Task 7: Project Compatibility Bridge

**Files:**
- Modify: `app/api/routes/modules/projets.py`
- Modify: `tests/unit/test_projects_flows.py`

- [ ] **Step 1: Write failing bridge test**

Add to `tests/unit/test_projects_flows.py`:

```python
def test_project_change_creation_delegates_to_moc_engine():
    src = inspect.getsource(projets.create_project_change)
    assert "create_contextual_moc" in src
    assert "context_type=\"project\"" in src
    assert "MOCStatusHistory" not in src
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/unit/test_projects_flows.py::test_project_change_creation_delegates_to_moc_engine -q
```

Expected: FAIL because `create_project_change` still creates `ProjectChange` directly.

- [ ] **Step 3: Delegate create to MOC**

In `app/api/routes/modules/projets.py`, import:

```python
from app.services.modules.moc_service import create_contextual_moc
```

Inside `create_project_change`, after payload validation, call the helper and set compatibility link:

```python
    context_payload = {
        "planning_impact_days": payload.get("planning_impact_days") or 0,
        "budget_impact_amount": payload.get("budget_impact_amount") or 0,
        "currency": payload.get("currency") or project.currency,
        "affected_task_ids": payload.get("affected_task_ids") or [],
        "source": payload.get("source"),
        "project_change_type": payload.get("change_type"),
    }
    moc_payload = SimpleNamespace(
        title=payload["title"],
        description=payload.get("description"),
        objectives=payload["title"],
        proposed_changes=payload.get("decision_summary"),
        impact_analysis=payload.get("description"),
        moc_type_id=None,
        manager_id=None,
        site_label=project.code or "PROJECT",
    )
    moc = await create_contextual_moc(
        db,
        entity_id=entity_id,
        actor=current_user,
        context_type="project",
        context_id=project_id,
        context_module="projets",
        payload=moc_payload,
        context_payload=context_payload,
    )
```

Then create `ProjectChange` as compatibility with `moc_id=moc.id`, without independent workflow changes.

Add `from types import SimpleNamespace` if not already present.

- [ ] **Step 4: Run verification**

```powershell
python -m py_compile app/api/routes/modules/projets.py
python -m pytest tests/unit/test_projects_flows.py::test_project_change_creation_delegates_to_moc_engine -q
```

Expected: py_compile OK. Test PASS when pytest is available.

- [ ] **Step 5: Commit**

```powershell
git add app/api/routes/modules/projets.py tests/unit/test_projects_flows.py
git commit -m "feat: bridge project changes to moc engine"
```

---

### Task 8: Final Verification And Push

**Files:**
- All modified files from Tasks 1-7.

- [ ] **Step 1: Run backend static verification**

```powershell
python -m py_compile app/models/moc.py app/models/common.py app/schemas/moc.py app/services/modules/moc_service.py app/api/routes/modules/moc.py app/api/routes/modules/projets.py app/api/deps.py
```

Expected: exit 0.

- [ ] **Step 2: Run frontend typecheck**

```powershell
cd apps/main
npx.cmd tsc --noEmit --pretty false
```

Expected: exit 0.

- [ ] **Step 3: Run tests if pytest is available**

```powershell
python -m pytest tests/unit/test_moc_context_engine.py tests/unit/test_projects_flows.py -q
```

Expected: PASS. If the environment still reports `No module named pytest`, record that exact blocker in the final response.

- [ ] **Step 4: Browser verification**

Use the in-app browser at:

```text
http://127.0.0.1:5174/projets/2b641ff3-932a-44c1-aade-3f3d2da1c583
```

Check:

- "Changements" tab renders.
- No horizontal scroll at mobile width.
- Add form is compact.
- Planning and budget impact fields share a row on desktop and wrap on mobile.
- Expanded row shows notes and PJ via MOC owner.

- [ ] **Step 5: Check diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Only intended files are modified; `AGENTS.md` remains untracked and unstaged.

- [ ] **Step 6: Push**

```powershell
git push
```

Expected: branch `main` pushed.
