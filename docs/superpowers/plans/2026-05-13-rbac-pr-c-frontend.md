# RBAC PR-C — Frontend RbacAdminTab + Delegations + Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir l'UI front RBAC pour exposer les routes ajoutées par PR-A : exports PDF dans Rôles/Groupes/Permissions/Utilisateurs, panel Délégations (CRUD + wizard), panel Réglages (rôles par défaut + ISO + mode résolution), 4ᵉ source `delegation` dans la matrice de permissions.

**Architecture:** Étendre les fichiers existants (`RbacAdminTab.tsx`, `rbacService.ts`, `useRbac.ts`, `RbacPermissionMatrix.tsx`) + créer 3 nouveaux fichiers (`ExportPdfMenu.tsx`, `RbacDelegationsTab.tsx`, `RbacSettingsTab.tsx`). Conventions du projet OpsFlux : React 18 + TypeScript strict, `@tanstack/react-table`, `react-i18next`, TanStack Query via hooks dans `useRbac.ts`, `DynamicPanelShell` pour les panels détail, `DataTable` partagé pour les listes.

**Tech Stack:** React 18, TypeScript strict, Vite, TanStack Query, TanStack React Table, react-i18next, lucide-react icons, Tailwind, shadcn-style UI primitives, Vitest pour unit, Playwright pour e2e.

**Spec source:** [`docs/superpowers/specs/2026-05-13-rbac-bootstrap-design.md`](../specs/2026-05-13-rbac-bootstrap-design.md) §9 (UI frontend)

**Overview:** [`docs/superpowers/plans/2026-05-13-rbac-bootstrap-overview.md`](./2026-05-13-rbac-bootstrap-overview.md)

**Depends on:** PR-A + PR-B mergées (routes API + templates PDF/email seedés)

---

## Pré-requis

- [ ] Être sur la branche `claude/gracious-haslett-4b8b09` (continuation après PR-A+B+follow-ups, dernier commit `8adea42d`)
- [ ] Vérifier `npx tsc --noEmit` passe SUR LA BASE avant de commencer :
  ```bash
  cd apps/main && npx tsc --noEmit 2>&1 | tail -20
  ```
  Tout `error TS...` pré-existant doit être noté avant de démarrer — pour distinguer les régressions PR-C des erreurs déjà présentes.
- [ ] Vérifier que les hooks existants dans `apps/main/src/hooks/useRbac.ts` fonctionnent (lecture rapide)

---

## File structure

```
apps/main/src/
├── components/
│   ├── shared/
│   │   └── ExportPdfMenu.tsx              # NEW: shared PDF export menu component
│   └── ui/DataTable/
│       └── types.ts                        # MODIFY: extend ExportItem type (used by ExportPdfMenu)
├── pages/settings/tabs/
│   ├── RbacAdminTab.tsx                   # MODIFY: 3 → 5 sub-tabs, add export buttons
│   ├── RbacPermissionMatrix.tsx           # MODIFY: add 'delegation' to PermSource + SOURCE_BADGE
│   ├── RbacDelegationsTab.tsx             # NEW: 5th sub-tab content
│   └── RbacSettingsTab.tsx                # NEW: 6th sub-tab content (or merge with existing settings page)
├── services/
│   └── rbacService.ts                     # MODIFY: add delegation + defaults + audit-events + matrix + export types/functions
├── hooks/
│   └── useRbac.ts                         # MODIFY: add useDelegations, useCreateDelegation, useDefaults, useAuditEvents, etc.
└── i18n/locales/
    ├── fr/rbac.json                       # MODIFY: add ~50 new strings
    └── en/rbac.json                       # MODIFY: same

apps/main/tests/
└── rbac/
    ├── ExportPdfMenu.test.tsx             # NEW: Vitest unit test
    └── RbacDelegationsTab.test.tsx        # NEW: Vitest unit test

test-e2e/
└── rbac/
    └── delegation-flow.spec.ts            # NEW: Playwright e2e — admin creates delegation, downloads cert
```

---

## Groupe 1 — Service & Hooks (extension de l'existant)

### Task 1.1 : Étendre `rbacService.ts` avec types & fetchers pour delegation, defaults, audit-events, matrix JSON, exports

**Files:**
- Modify: `apps/main/src/services/rbacService.ts` (existing, 283 lines — append at the end)

- [ ] **Step 1: Append types and fetcher functions**

À la fin de `apps/main/src/services/rbacService.ts`, ajouter :

```typescript
// ════════════════════════════════════════════════════════════
// DELEGATIONS (PR-A)
// ════════════════════════════════════════════════════════════

export type DelegationStatus = 'active' | 'programmed' | 'expired' | 'revoked'

export interface DelegationCreatePayload {
  delegate_id: string
  permissions: string[]
  start_date: string  // ISO datetime
  end_date: string
  reason: string
}

export interface DelegationUpdatePayload {
  reason?: string
  end_date?: string  // can only be shortened
}

export interface DelegationRead {
  id: string
  delegator_id: string
  delegate_id: string
  entity_id: string
  permissions: string[]
  start_date: string
  end_date: string
  active: boolean
  reason: string | null
  created_at: string
  delegator_name?: string | null
  delegate_name?: string | null
  status: DelegationStatus
  duration_days: number
}

export interface DelegationListItem {
  id: string
  delegator_name: string
  delegate_name: string
  permissions_count: number
  start_date: string
  end_date: string
  status: DelegationStatus
  reason: string | null
}

export interface DelegationListFilters {
  status?: DelegationStatus
  delegator_id?: string
  delegate_id?: string
  direction?: 'received' | 'given'
}

export async function listDelegations(filters: DelegationListFilters = {}): Promise<DelegationListItem[]> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.delegator_id) params.set('delegator_id', filters.delegator_id)
  if (filters.delegate_id) params.set('delegate_id', filters.delegate_id)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return await apiClient.get(`/api/v1/rbac/delegations/${qs}`)
}

export async function listMyDelegations(direction?: 'received' | 'given'): Promise<DelegationListItem[]> {
  const qs = direction ? `?direction=${direction}` : ''
  return await apiClient.get(`/api/v1/rbac/delegations/mine${qs}`)
}

export async function getDelegation(id: string): Promise<DelegationRead> {
  return await apiClient.get(`/api/v1/rbac/delegations/${id}`)
}

export async function createDelegation(payload: DelegationCreatePayload): Promise<DelegationRead> {
  return await apiClient.post('/api/v1/rbac/delegations/', payload)
}

export async function updateDelegation(id: string, payload: DelegationUpdatePayload): Promise<DelegationRead> {
  return await apiClient.patch(`/api/v1/rbac/delegations/${id}`, payload)
}

export async function revokeDelegation(id: string, reason: string): Promise<DelegationRead> {
  return await apiClient.post(`/api/v1/rbac/delegations/${id}/revoke`, { reason })
}

export function delegationCertificateUrl(id: string): string {
  return `/api/v1/rbac/delegations/${id}/certificate.pdf`
}

// ════════════════════════════════════════════════════════════
// DEFAULTS (rbac.default_role.* per user_type)
// ════════════════════════════════════════════════════════════

export interface RbacDefaults {
  internal: string  // role code
  external: string
  tier_contact: string
}

export async function getRbacDefaults(): Promise<RbacDefaults> {
  return await apiClient.get('/api/v1/rbac/defaults')
}

export async function setRbacDefaults(payload: RbacDefaults): Promise<RbacDefaults> {
  return await apiClient.put('/api/v1/rbac/defaults', payload)
}

// ════════════════════════════════════════════════════════════
// AUDIT EVENTS
// ════════════════════════════════════════════════════════════

export interface RbacAuditEventRead {
  id: string
  tenant_id: string
  event_type: string
  target: string | null
  params: Record<string, unknown> | null
  result_summary: Record<string, unknown> | null
  file_hash_sha256: string | null
  actor_user_id: string
  occurred_at: string
  completed_at: string | null
  duration_ms: number | null
  status: 'success' | 'failure' | 'pending' | 'partial'
  error_code: string | null
}

export interface RbacAuditEventsListResponse {
  items: RbacAuditEventRead[]
  total: number
  page: number
  page_size: number
}

export interface AuditEventFilters {
  event_type?: string
  event_type_prefix?: string
  actor_user_id?: string
  status?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export async function listAuditEvents(filters: AuditEventFilters = {}): Promise<RbacAuditEventsListResponse> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString() ? `?${params.toString()}` : ''
  return await apiClient.get(`/api/v1/rbac/audit-events${qs}`)
}

// ════════════════════════════════════════════════════════════
// MATRIX JSON HELPERS (for in-app views, distinct from PDF exports)
// ════════════════════════════════════════════════════════════

export interface MatrixRolePermissionsJson {
  tenant: { id: string; name: string; logo_url: string | null }
  roles: Array<{ code: string; name: string; description: string | null; module: string | null }>
  permissions: Array<{
    code: string
    name: string
    module: string | null
    namespace: string | null
    resource: string | null
    action: string | null
    sensitive: boolean
    deprecated: boolean
    module_disabled: boolean
  }>
  grants: Array<[string, string]>  // [role_code, perm_code]
  modules: Array<{ namespace: string; label: string; permission_count: number; disabled_in_tenant: boolean }>
}

export async function getMatrixRolePermissions(includeDisabledModules = false): Promise<MatrixRolePermissionsJson> {
  const qs = includeDisabledModules ? '?include_disabled_modules=true' : ''
  return await apiClient.get(`/api/v1/rbac/matrix/role-permissions${qs}`)
}

export interface SodViolation {
  role_code: string
  rule_id: string
  rule_label: string
  perms: string[]
}

export interface SodMatrixJson {
  tenant: { id: string; name: string }
  sod_rules: Array<{ id: string; label: string; perms: string[] }>
  violations: SodViolation[]
  violation_count: number
}

export async function getSodMatrix(): Promise<SodMatrixJson> {
  return await apiClient.get('/api/v1/rbac/matrix/sod')
}

// ════════════════════════════════════════════════════════════
// PDF EXPORT URLs (return URLs to construct download links / iframe previews)
// ════════════════════════════════════════════════════════════

export interface PdfExportOptions {
  lang?: 'fr' | 'en'
  include_disabled_modules?: boolean
}

function buildExportUrl(path: string, options: PdfExportOptions = {}, extraParams: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  if (options.lang) params.set('lang', options.lang)
  if (options.include_disabled_modules) params.set('include_disabled_modules', 'true')
  for (const [k, v] of Object.entries(extraParams)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString() ? `?${params.toString()}` : ''
  return `/api/v1/rbac/exports${path}${qs}`
}

export function exportMatrixRolePermissionsUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/role-permissions.pdf', o)
}
export function exportMatrixGroupPermissionsUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/group-permissions.pdf', o)
}
export function exportMatrixUserPermissionsUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/user-permissions.pdf', o)
}
export function exportRoleDetailUrl(roleCode: string, o: PdfExportOptions = {}): string {
  return buildExportUrl(`/role/${encodeURIComponent(roleCode)}.pdf`, o)
}
export function exportGroupDetailUrl(groupId: string, o: PdfExportOptions = {}): string {
  return buildExportUrl(`/group/${encodeURIComponent(groupId)}.pdf`, o)
}
export function exportUserDetailUrl(userId: string, o: PdfExportOptions = {}, includeDelegations = true): string {
  return buildExportUrl(`/user/${encodeURIComponent(userId)}.pdf`, o, { include_delegations: includeDelegations ? 'true' : 'false' })
}
export function exportRoleModulesUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/role-modules.pdf', o)
}
export function exportPermissionCatalogUrl(o: PdfExportOptions = {}, groupBy: 'module' | 'action' = 'module'): string {
  return buildExportUrl('/catalog/permissions.pdf', o, { group_by: groupBy })
}
export function exportSodMatrixUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/sod.pdf', o)
}
export function exportDelegationRegistryUrl(o: PdfExportOptions = {}, status?: DelegationStatus): string {
  return buildExportUrl('/delegations/registry.pdf', o, { status: status ?? '' })
}
```

- [ ] **Step 2: Verify `apiClient.get/post/patch/put` already exists**

```bash
grep -n "apiClient\." apps/main/src/services/rbacService.ts | head -5
```

If `apiClient` is imported and has `.get/.post/.patch/.put` methods, OK. Otherwise adapt to whatever HTTP client convention is used.

- [ ] **Step 3: `npx tsc --noEmit`**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -30
```

Expected: aucune nouvelle erreur (les erreurs pré-existantes notées dans le pré-requis sont OK). Si erreurs nouvelles : fixer (typiquement des types `unknown` à narrow, des imports manquants).

- [ ] **Step 4: Commit**

```bash
git add apps/main/src/services/rbacService.ts
git commit -m "feat(rbac): extend rbacService with delegations, defaults, audit-events, matrix JSON, PDF export URLs"
```

### Task 1.2 : Étendre `useRbac.ts` avec hooks TanStack Query

**Files:**
- Modify: `apps/main/src/hooks/useRbac.ts` (existing, 255 lines — append at the end)

- [ ] **Step 1: Append hooks**

```typescript
// ════════════════════════════════════════════════════════════
// DELEGATIONS
// ════════════════════════════════════════════════════════════

export function useDelegations(filters: rbacService.DelegationListFilters = {}) {
  return useQuery({
    queryKey: ['rbac', 'delegations', filters],
    queryFn: () => rbacService.listDelegations(filters),
    staleTime: 30_000,
  })
}

export function useMyDelegations(direction?: 'received' | 'given') {
  return useQuery({
    queryKey: ['rbac', 'delegations', 'mine', direction],
    queryFn: () => rbacService.listMyDelegations(direction),
    staleTime: 30_000,
  })
}

export function useDelegation(id: string | null) {
  return useQuery({
    queryKey: ['rbac', 'delegation', id],
    queryFn: () => rbacService.getDelegation(id!),
    enabled: !!id,
  })
}

export function useCreateDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: rbacService.DelegationCreatePayload) => rbacService.createDelegation(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'delegations'] })
    },
  })
}

export function useUpdateDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: rbacService.DelegationUpdatePayload }) =>
      rbacService.updateDelegation(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'delegations'] })
    },
  })
}

export function useRevokeDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rbacService.revokeDelegation(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'delegations'] })
    },
  })
}

// ════════════════════════════════════════════════════════════
// DEFAULTS
// ════════════════════════════════════════════════════════════

export function useRbacDefaults() {
  return useQuery({
    queryKey: ['rbac', 'defaults'],
    queryFn: rbacService.getRbacDefaults,
    staleTime: 60_000,
  })
}

export function useSetRbacDefaults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: rbacService.setRbacDefaults,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'defaults'] })
    },
  })
}

// ════════════════════════════════════════════════════════════
// AUDIT EVENTS
// ════════════════════════════════════════════════════════════

export function useAuditEvents(filters: rbacService.AuditEventFilters = {}) {
  return useQuery({
    queryKey: ['rbac', 'audit-events', filters],
    queryFn: () => rbacService.listAuditEvents(filters),
    staleTime: 15_000,
  })
}

// ════════════════════════════════════════════════════════════
// MATRIX JSON (for in-app views)
// ════════════════════════════════════════════════════════════

export function useMatrixRolePermissions(includeDisabledModules = false) {
  return useQuery({
    queryKey: ['rbac', 'matrix', 'role-permissions', includeDisabledModules],
    queryFn: () => rbacService.getMatrixRolePermissions(includeDisabledModules),
    staleTime: 30_000,
  })
}

export function useSodMatrix() {
  return useQuery({
    queryKey: ['rbac', 'matrix', 'sod'],
    queryFn: rbacService.getSodMatrix,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 2: Verify imports at top of file**

Look at the existing imports in `useRbac.ts`:
```bash
head -20 apps/main/src/hooks/useRbac.ts
```

If it uses `import * as rbacService from '@/services/rbacService'`, you're good. Otherwise check the existing convention and adapt — typically `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`.

- [ ] **Step 3: TSC check + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -30
git add apps/main/src/hooks/useRbac.ts
git commit -m "feat(rbac): add TanStack Query hooks for delegations, defaults, audit-events, matrix JSON"
```

---

## Groupe 2 — Composant partagé `ExportPdfMenu`

### Task 2.1 : Créer `ExportPdfMenu.tsx`

**Files:**
- Create: `apps/main/src/components/shared/ExportPdfMenu.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
/**
 * ExportPdfMenu — shared dropdown menu to trigger RBAC PDF exports.
 *
 * Usage:
 *   <ExportPdfMenu items={[...]} selectedIds={selectedRoleCodes} context="roles" />
 *
 * Behavior:
 * - Renders a "Export PDF" button with FileDown icon
 * - On click, opens a dropdown listing the items
 * - Each item is enabled/disabled based on `requiresSelection` + current selection
 * - Top of dropdown has lang + include-disabled-modules toggles
 * - On item click, navigates to the export URL (browser handles the download)
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDown, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ExportPdfItem {
  key: string
  label: string
  description: string
  buildUrl: (params: { lang: 'fr' | 'en'; includeDisabledModules: boolean; selectedIds: string[] }) => string | null
  requiresSelection?: boolean
  permission?: string  // for hint text only — server enforces
}

export type ExportPdfContext = 'roles' | 'groups' | 'permissions' | 'users' | 'delegations'

interface ExportPdfMenuProps {
  items: ExportPdfItem[]
  selectedIds?: string[]
  context: ExportPdfContext
  defaultLang?: 'fr' | 'en'
  defaultIncludeDisabledModules?: boolean
  /** Optional permission gate — if provided and user doesn't have it, the button is hidden. */
  hasPermission?: boolean
}

export function ExportPdfMenu({
  items,
  selectedIds = [],
  context: _context,
  defaultLang = 'fr',
  defaultIncludeDisabledModules = false,
  hasPermission = true,
}: ExportPdfMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<'fr' | 'en'>(defaultLang)
  const [includeDisabledModules, setIncludeDisabledModules] = useState(defaultIncludeDisabledModules)

  if (!hasPermission) return null

  const handleClick = (item: ExportPdfItem) => {
    if (item.requiresSelection && selectedIds.length === 0) return
    const url = item.buildUrl({ lang, includeDisabledModules, selectedIds })
    if (!url) return
    setOpen(false)
    // Trigger browser download
    window.location.href = url
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        <FileDown className="h-4 w-4" />
        {t('rbac.export.button')}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-label={t('rbac.export.close')}
          />
          <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {/* Header: language + disabled modules toggle */}
            <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{t('rbac.export.lang')}</span>
                <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-600">
                  {(['fr', 'en'] as const).map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      className={cn(
                        'px-2 py-0.5 text-xs uppercase',
                        lang === l ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'bg-transparent'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeDisabledModules}
                  onChange={e => setIncludeDisabledModules(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <span>{t('rbac.export.include_disabled_modules')}</span>
              </label>
            </div>

            {/* Items */}
            <ul className="py-1">
              {items.map(item => {
                const disabled = item.requiresSelection && selectedIds.length === 0
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => handleClick(item)}
                      disabled={disabled}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm',
                        disabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                      )}
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-slate-500">{item.description}</div>
                      {disabled && (
                        <div className="mt-0.5 text-xs text-orange-600 dark:text-orange-400">
                          {t('rbac.export.selection_required')}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TSC check + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -20
git add apps/main/src/components/shared/ExportPdfMenu.tsx
git commit -m "feat(rbac): shared ExportPdfMenu component for triggering PDF exports"
```

### Task 2.2 : Test Vitest pour `ExportPdfMenu`

**Files:**
- Create: `apps/main/tests/rbac/ExportPdfMenu.test.tsx`

- [ ] **Step 1: Vérifier l'infra Vitest existante**

```bash
ls apps/main/tests/ 2>&1 | head -10
cat apps/main/vitest.config.ts 2>&1 | head -20
```

Si le dossier `apps/main/tests/rbac/` n'existe pas, le créer.

- [ ] **Step 2: Créer le test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportPdfMenu } from '@/components/shared/ExportPdfMenu'

// Mock react-i18next so t() returns the key as-is
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ExportPdfMenu', () => {
  const baseItem = {
    key: 'matrix',
    label: 'Matrix Roles × Permissions',
    description: 'Full matrix of roles and permissions',
    buildUrl: ({ lang, includeDisabledModules }: any) =>
      `/api/v1/rbac/exports/matrix/role-permissions.pdf?lang=${lang}&include_disabled_modules=${includeDisabledModules}`,
  }

  it('renders the export button when hasPermission is true (default)', () => {
    render(<ExportPdfMenu items={[baseItem]} context="roles" />)
    expect(screen.getByRole('button', { name: /rbac\.export\.button/i })).toBeInTheDocument()
  })

  it('hides itself when hasPermission is false', () => {
    const { container } = render(<ExportPdfMenu items={[baseItem]} context="roles" hasPermission={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens dropdown on click and lists items', () => {
    render(<ExportPdfMenu items={[baseItem]} context="roles" />)
    fireEvent.click(screen.getByRole('button', { name: /rbac\.export\.button/i }))
    expect(screen.getByText('Matrix Roles × Permissions')).toBeInTheDocument()
  })

  it('disables items that require selection when nothing is selected', () => {
    const item = { ...baseItem, requiresSelection: true }
    render(<ExportPdfMenu items={[item]} context="roles" selectedIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /rbac\.export\.button/i }))
    const itemBtn = screen.getByText('Matrix Roles × Permissions').closest('button')
    expect(itemBtn).toBeDisabled()
  })

  it('builds the URL with current lang and includeDisabledModules state', () => {
    // We can verify buildUrl is called with right args by spying
    const spy = vi.fn(() => '/dummy.pdf')
    const item = { ...baseItem, buildUrl: spy }

    // We can't trigger window.location.href in JSDOM cleanly, so mock it
    const originalLocation = window.location
    delete (window as any).location
    ;(window as any).location = { ...originalLocation, href: '' }

    render(<ExportPdfMenu items={[item]} context="roles" defaultLang="en" defaultIncludeDisabledModules={true} />)
    fireEvent.click(screen.getByRole('button', { name: /rbac\.export\.button/i }))
    fireEvent.click(screen.getByText('Matrix Roles × Permissions'))

    expect(spy).toHaveBeenCalledWith({ lang: 'en', includeDisabledModules: true, selectedIds: [] })

    ;(window as any).location = originalLocation
  })
})
```

- [ ] **Step 3: Run Vitest**

```bash
cd apps/main && npx vitest run tests/rbac/ExportPdfMenu.test.tsx 2>&1 | tail -20
```

Expected: 5 tests PASS. Si erreurs (typiquement testing-library pas configuré ou JSDOM env manquant), checker `vitest.config.ts` et adapter. Si l'infra n'est pas prête, marquer le test avec `.skip` et committer en DONE_WITH_CONCERNS.

- [ ] **Step 4: Commit**

```bash
git add apps/main/tests/rbac/ExportPdfMenu.test.tsx
git commit -m "test(rbac): Vitest unit tests for ExportPdfMenu component"
```

---

## Groupe 3 — Mise à jour `RbacPermissionMatrix.tsx` (4ᵉ source delegation)

### Task 3.1 : Ajouter `'delegation'` à `PermSource` et `SOURCE_BADGE`

**Files:**
- Modify: `apps/main/src/pages/settings/tabs/RbacPermissionMatrix.tsx`

- [ ] **Step 1: Lire le fichier pour identifier `PermSource` et `SOURCE_BADGE`**

```bash
grep -n "PermSource\|SOURCE_BADGE" apps/main/src/pages/settings/tabs/RbacPermissionMatrix.tsx | head -10
```

- [ ] **Step 2: Étendre les définitions**

Localiser :
```typescript
export type PermSource = 'user' | 'role' | 'group'
```

Remplacer par :
```typescript
export type PermSource = 'user' | 'role' | 'group' | 'delegation'
```

Localiser :
```typescript
export const SOURCE_BADGE = {
  user: { label: 'Utilisateur', color: 'red' },
  role: { label: 'Rôle', color: 'blue' },
  group: { label: 'Groupe', color: 'amber' },
}
```

Ajouter l'entrée `delegation` :
```typescript
export const SOURCE_BADGE = {
  user: { label: 'Utilisateur', color: 'red' },
  role: { label: 'Rôle', color: 'blue' },
  group: { label: 'Groupe', color: 'amber' },
  delegation: { label: 'Délégation', color: 'purple' },
} as const
```

(L'ajout de `as const` aide TypeScript à narrow le type.)

Si d'autres switch/maps utilisent `PermSource`, vérifier qu'ils sont exhaustifs maintenant (typescript va flagger les `default:` manquants).

- [ ] **Step 3: TSC check + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | grep "PermSource\|SOURCE_BADGE\|RbacPermissionMatrix" | head -20
```

Expected: aucune nouvelle erreur. Si erreur "Type 'string' is not assignable to PermSource", il faut narrow dans le composant consommateur.

- [ ] **Step 4: Commit**

```bash
git add apps/main/src/pages/settings/tabs/RbacPermissionMatrix.tsx
git commit -m "feat(rbac): add 'delegation' as 4th PermSource value with purple badge"
```

---

## Groupe 4 — Mise à jour `RbacAdminTab.tsx` (3 → 5 sous-onglets + boutons export)

### Task 4.1 : Étendre `RbacSubTab` type et `SUB_TABS` array

**Files:**
- Modify: `apps/main/src/pages/settings/tabs/RbacAdminTab.tsx`

- [ ] **Step 1: Modifier le type et la liste**

Localiser dans le fichier (~ligne 70) :
```typescript
type RbacSubTab = 'roles' | 'groups' | 'permissions'

const SUB_TABS: { key: RbacSubTab; label: string; icon: React.ElementType }[] = [
  { key: 'roles', label: 'Rôles', icon: ShieldCheck },
  { key: 'groups', label: 'Groupes', icon: Users },
  { key: 'permissions', label: 'Permissions', icon: Lock },
]
```

Remplacer par :
```typescript
type RbacSubTab = 'roles' | 'groups' | 'permissions' | 'delegations' | 'settings'

const SUB_TABS: { key: RbacSubTab; label: string; icon: React.ElementType }[] = [
  { key: 'roles', label: 'Rôles', icon: ShieldCheck },
  { key: 'groups', label: 'Groupes', icon: Users },
  { key: 'permissions', label: 'Permissions', icon: Lock },
  { key: 'delegations', label: 'Délégations', icon: UserCheck },
  { key: 'settings', label: 'Réglages', icon: Settings2 },
]
```

Ajouter `UserCheck` et `Settings2` aux imports `lucide-react` :
```typescript
import {
  ShieldCheck, Users, Lock, Loader2, Search,
  ChevronRight, ChevronDown, Check, X, UserPlus, Trash2,
  Shield, UserCheck, Settings2,
} from 'lucide-react'
```

- [ ] **Step 2: Ajouter le routing dans le JSX**

Localiser dans le composant principal `RbacAdminTab` le `switch` ou les conditions qui rendent le contenu selon `activeTab`. Probablement quelque chose comme :

```typescript
{activeTab === 'roles' && <RolesPanel ... />}
{activeTab === 'groups' && <GroupsPanel ... />}
{activeTab === 'permissions' && <PermissionsPanel ... />}
```

Ajouter à la fin :

```typescript
{activeTab === 'delegations' && <RbacDelegationsTab />}
{activeTab === 'settings' && <RbacSettingsTab />}
```

Et au début du fichier, importer les nouveaux composants :

```typescript
import { RbacDelegationsTab } from './RbacDelegationsTab'
import { RbacSettingsTab } from './RbacSettingsTab'
```

NOTE: ces 2 composants n'existent pas encore (Groupes 5 et 6). L'ajout des imports va causer une erreur TS jusqu'à la création des fichiers. **Stratégie** : créer des stubs vides pour passer TSC, ou différer ces 2 imports au Groupe 5/6.

**Décision** : créer des stubs vides MAINTENANT pour ne pas bloquer la TSC compilation pendant la création des composants suivants :

```bash
cat > apps/main/src/pages/settings/tabs/RbacDelegationsTab.tsx <<'EOF'
import { useTranslation } from 'react-i18next'

export function RbacDelegationsTab() {
  const { t } = useTranslation()
  return <div className="p-4 text-slate-500">{t('rbac.delegations.coming_soon')}</div>
}
EOF

cat > apps/main/src/pages/settings/tabs/RbacSettingsTab.tsx <<'EOF'
import { useTranslation } from 'react-i18next'

export function RbacSettingsTab() {
  const { t } = useTranslation()
  return <div className="p-4 text-slate-500">{t('rbac.settings.coming_soon')}</div>
}
EOF
```

- [ ] **Step 3: TSC + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -20
git add apps/main/src/pages/settings/tabs/RbacAdminTab.tsx \
        apps/main/src/pages/settings/tabs/RbacDelegationsTab.tsx \
        apps/main/src/pages/settings/tabs/RbacSettingsTab.tsx
git commit -m "feat(rbac): RbacAdminTab now has 5 sub-tabs (added Délégations + Réglages stubs)"
```

### Task 4.2 : Ajouter `ExportPdfMenu` aux 3 sous-onglets existants (Rôles, Groupes, Permissions)

**Files:**
- Modify: `apps/main/src/pages/settings/tabs/RbacAdminTab.tsx`

- [ ] **Step 1: Import du composant + service URLs**

En haut du fichier, ajouter :
```typescript
import { ExportPdfMenu, type ExportPdfItem } from '@/components/shared/ExportPdfMenu'
import {
  exportMatrixRolePermissionsUrl,
  exportRoleDetailUrl,
  exportMatrixGroupPermissionsUrl,
  exportGroupDetailUrl,
  exportPermissionCatalogUrl,
  exportSodMatrixUrl,
  exportRoleModulesUrl,
} from '@/services/rbacService'
```

- [ ] **Step 2: Construire les items pour chaque sous-onglet**

Sous le composant principal (avant le `return`), définir :

```typescript
const ROLES_EXPORT_ITEMS: ExportPdfItem[] = [
  {
    key: 'matrix_role_perms',
    label: 'Matrice complète Rôles × Permissions',
    description: 'Vue exhaustive de toutes les permissions par rôle, décomposée par module',
    buildUrl: ({ lang, includeDisabledModules }) =>
      exportMatrixRolePermissionsUrl({ lang, include_disabled_modules: includeDisabledModules }),
  },
  {
    key: 'role_modules',
    label: 'Vue Rôles × Modules',
    description: 'Synthèse des niveaux d\'accès (R, RW, RWA, MGR) par rôle et module',
    buildUrl: ({ lang }) => exportRoleModulesUrl({ lang }),
  },
  {
    key: 'role_detail',
    label: 'Fiche détaillée du rôle sélectionné',
    description: 'Permissions, groupes utilisant ce rôle, nombre d\'utilisateurs',
    requiresSelection: true,
    buildUrl: ({ lang, selectedIds }) =>
      selectedIds[0] ? exportRoleDetailUrl(selectedIds[0], { lang }) : null,
  },
  {
    key: 'sod_matrix',
    label: 'Matrice SoD (Ségrégation des Devoirs)',
    description: 'Conflits détectés selon les règles SoD configurées',
    buildUrl: ({ lang }) => exportSodMatrixUrl({ lang }),
  },
  {
    key: 'permission_catalog',
    label: 'Catalogue de permissions',
    description: 'Liste de toutes les permissions actives groupées par module',
    buildUrl: ({ lang, includeDisabledModules }) =>
      exportPermissionCatalogUrl({ lang, include_disabled_modules: includeDisabledModules }),
  },
]

const GROUPS_EXPORT_ITEMS: ExportPdfItem[] = [
  {
    key: 'matrix_group_perms',
    label: 'Matrice complète Groupes × Permissions',
    description: 'Permissions effectives par groupe (avec source : rôle / override / délégation)',
    buildUrl: ({ lang, includeDisabledModules }) =>
      exportMatrixGroupPermissionsUrl({ lang, include_disabled_modules: includeDisabledModules }),
  },
  {
    key: 'group_detail',
    label: 'Fiche détaillée du groupe sélectionné',
    description: 'Rôles, membres, périmètre asset, permissions effectives',
    requiresSelection: true,
    buildUrl: ({ lang, selectedIds }) =>
      selectedIds[0] ? exportGroupDetailUrl(selectedIds[0], { lang }) : null,
  },
]

const PERMISSIONS_EXPORT_ITEMS: ExportPdfItem[] = [
  {
    key: 'permission_catalog',
    label: 'Catalogue de permissions',
    description: 'Liste exhaustive des permissions, groupées par module',
    buildUrl: ({ lang, includeDisabledModules }) =>
      exportPermissionCatalogUrl({ lang, include_disabled_modules: includeDisabledModules }),
  },
  {
    key: 'sod_matrix',
    label: 'Matrice SoD (Ségrégation des Devoirs)',
    description: 'Conflits détectés',
    buildUrl: ({ lang }) => exportSodMatrixUrl({ lang }),
  },
]
```

- [ ] **Step 3: Insérer `<ExportPdfMenu>` dans la toolbar de chaque sous-onglet**

Dans le sous-onglet Rôles (`activeTab === 'roles'`), localiser la toolbar existante (probablement contient une input de recherche, un filtre module, etc.) et ajouter :

```tsx
<ExportPdfMenu
  items={ROLES_EXPORT_ITEMS}
  selectedIds={selectedRoleCodes /* ou le state existant */}
  context="roles"
/>
```

Idem pour `'groups'` avec `GROUPS_EXPORT_ITEMS` et `selectedGroupIds`.
Idem pour `'permissions'` avec `PERMISSIONS_EXPORT_ITEMS` (pas de sélection nécessaire — `selectedIds={[]}`).

Le state `selectedRoleCodes` / `selectedGroupIds` existe probablement déjà dans le composant pour gérer la sélection de ligne (sinon, ajouter un `useState<string[]>([])` ad-hoc — la sélection des fiches détaillées est best-effort).

- [ ] **Step 4: TSC + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -20
git add apps/main/src/pages/settings/tabs/RbacAdminTab.tsx
git commit -m "feat(rbac): add ExportPdfMenu to Rôles, Groupes, Permissions sub-tabs"
```

---

## Groupe 5 — `RbacDelegationsTab.tsx` (panel délégations complet)

### Task 5.1 : Implémentation du composant principal

**Files:**
- Modify: `apps/main/src/pages/settings/tabs/RbacDelegationsTab.tsx` (remplace le stub)

- [ ] **Step 1: Remplacer le stub par l'implémentation complète**

```tsx
/**
 * RbacDelegationsTab — 5th sub-tab of the RBAC admin page.
 *
 * Sections (from top to bottom):
 * 1. KPI cards (active / expiring-7d / expired-30d / revoked-30d)
 * 2. Filterable list of all delegations in the tenant
 * 3. "Create delegation" modal wizard (3 steps)
 * 4. Audit panel (collapsable, last delegation events)
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Filter, FileDown, Loader2, X, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import {
  useDelegations,
  useRevokeDelegation,
  useAuditEvents,
} from '@/hooks/useRbac'
import { delegationCertificateUrl, exportDelegationRegistryUrl } from '@/services/rbacService'
import type { DelegationListItem, DelegationStatus } from '@/services/rbacService'
import { DelegationCreateWizard } from './rbac/DelegationCreateWizard'
import { formatDate } from '@/lib/i18n'

// ════════════════════════════════════════════════════════════
// Status badge helper
// ════════════════════════════════════════════════════════════

const STATUS_BADGE: Record<DelegationStatus, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  programmed: { label: 'Programmée', bg: 'bg-blue-100', text: 'text-blue-700' },
  expired: { label: 'Expirée', bg: 'bg-slate-100', text: 'text-slate-600' },
  revoked: { label: 'Révoquée', bg: 'bg-red-100', text: 'text-red-700' },
}

function StatusBadge({ status }: { status: DelegationStatus }) {
  const cfg = STATUS_BADGE[status]
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// KPI cards
// ════════════════════════════════════════════════════════════

function KpiCards({ delegations }: { delegations: DelegationListItem[] }) {
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 86400000)
  const thirty_ago = new Date(now.getTime() - 30 * 86400000)

  const stats = useMemo(() => {
    let active = 0, expiringSoon = 0, expired30d = 0, revoked30d = 0
    for (const d of delegations) {
      const endDate = new Date(d.end_date)
      if (d.status === 'active') {
        active++
        if (endDate <= in7days) expiringSoon++
      } else if (d.status === 'expired' && endDate >= thirty_ago) {
        expired30d++
      } else if (d.status === 'revoked') {
        revoked30d++
      }
    }
    return { active, expiringSoon, expired30d, revoked30d }
  }, [delegations])

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard label="Actives" value={stats.active} tone="blue" />
      <KpiCard label="Expirent dans 7j" value={stats.expiringSoon} tone="orange" />
      <KpiCard label="Expirées (30j)" value={stats.expired30d} tone="slate" />
      <KpiCard label="Révoquées (30j)" value={stats.revoked30d} tone="red" />
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'orange' | 'slate' | 'red' }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-900/30 dark:border-orange-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-900/30 dark:border-slate-700',
    red: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/30 dark:border-red-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${colorMap[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════

export function RbacDelegationsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState<DelegationStatus | ''>('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  const { data: delegations = [], isLoading, refetch } = useDelegations(
    statusFilter ? { status: statusFilter } : {}
  )
  const revokeMutation = useRevokeDelegation()

  const handleRevoke = async () => {
    if (!revokingId) return
    try {
      await revokeMutation.mutateAsync({ id: revokingId, reason: revokeReason })
      toast({ title: 'Délégation révoquée', tone: 'success' })
      setRevokingId(null)
      setRevokeReason('')
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.message ?? String(err), tone: 'error' })
    }
  }

  const columns: ColumnDef<DelegationListItem>[] = useMemo(() => [
    { accessorKey: 'delegator_name', header: 'Délégant' },
    { accessorKey: 'delegate_name', header: 'Délégué' },
    {
      accessorKey: 'start_date',
      header: 'Période',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">
          {formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}
        </span>
      ),
    },
    {
      accessorKey: 'permissions_count',
      header: 'Perms',
      cell: ({ row }) => <span className="font-mono">{row.original.permissions_count}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <a
            href={delegationCertificateUrl(row.original.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            title="Télécharger le certificat PDF"
          >
            <FileDown className="h-3.5 w-3.5" />
          </a>
          {row.original.status === 'active' && (
            <button
              type="button"
              onClick={() => setRevokingId(row.original.id)}
              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              title="Révoquer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ], [])

  return (
    <div className="space-y-4 p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('rbac.delegations.title')}</h2>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as DelegationStatus | '')}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Tous statuts</option>
            <option value="active">Actives</option>
            <option value="programmed">Programmées</option>
            <option value="expired">Expirées</option>
            <option value="revoked">Révoquées</option>
          </select>
          <a
            href={exportDelegationRegistryUrl({ lang: 'fr' }, statusFilter || undefined)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" />
            Export registre
          </a>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Créer une délégation
          </button>
        </div>
      </div>

      <KpiCards delegations={delegations} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={delegations}
          // adapt to your DataTable API — emptyState text etc.
        />
      )}

      {/* Create wizard */}
      {wizardOpen && (
        <DelegationCreateWizard
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false)
            refetch()
          }}
        />
      )}

      {/* Revoke confirmation modal */}
      {revokingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-lg bg-white p-4 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Révoquer cette délégation ?</h3>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              Le délégué perdra immédiatement ces permissions. Cette action est tracée dans l'audit ISO.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Motif (obligatoire)</span>
              <textarea
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                rows={3}
                minLength={5}
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
                placeholder="Ex: Demande du délégué, fin de mission, etc."
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRevokingId(null); setRevokeReason('') }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revokeReason.trim().length < 5 || revokeMutation.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revokeMutation.isPending ? 'Révocation…' : 'Révoquer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier l'import `formatDate`**

```bash
grep -n "export.*formatDate" apps/main/src/lib/i18n.ts apps/main/src/lib/*.ts 2>&1 | head -3
```

Si `formatDate` n'existe pas, l'inliner :
```typescript
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
```

- [ ] **Step 3: Note sur `DelegationCreateWizard`**

L'import `import { DelegationCreateWizard } from './rbac/DelegationCreateWizard'` pointe vers un composant non-encore créé (Task 5.2). Comme on a fait pour les stubs du Groupe 4, créer un stub minimal :

```bash
mkdir -p apps/main/src/pages/settings/tabs/rbac
cat > apps/main/src/pages/settings/tabs/rbac/DelegationCreateWizard.tsx <<'EOF'
interface Props {
  onClose: () => void
  onCreated: () => void
}

export function DelegationCreateWizard({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-4 dark:bg-slate-800">
        <h3 className="text-lg font-semibold">Wizard en cours de développement</h3>
        <button type="button" onClick={onClose} className="mt-3 rounded-md border px-3 py-1.5 text-sm">
          Fermer
        </button>
      </div>
    </div>
  )
}
EOF
```

- [ ] **Step 4: TSC + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -30
git add apps/main/src/pages/settings/tabs/RbacDelegationsTab.tsx \
        apps/main/src/pages/settings/tabs/rbac/DelegationCreateWizard.tsx
git commit -m "feat(rbac): RbacDelegationsTab with KPI cards, filterable list, revoke modal + wizard stub"
```

### Task 5.2 : Wizard de création de délégation (3 steps)

**Files:**
- Modify: `apps/main/src/pages/settings/tabs/rbac/DelegationCreateWizard.tsx` (remplacer le stub)

- [ ] **Step 1: Implémenter le wizard**

```tsx
/**
 * DelegationCreateWizard — 3-step modal to create a delegation.
 *
 * Steps:
 * 1. Choose delegate (user picker)
 * 2. Choose permissions (multi-select from current user's effective perms)
 * 3. Period (datepicker) + Reason (textarea)
 */
import { useState } from 'react'
import { ChevronRight, ChevronLeft, X, Loader2 } from 'lucide-react'
import { useCreateDelegation } from '@/hooks/useRbac'
import { useUsers } from '@/hooks/useUsers'
import { usePermissions } from '@/hooks/useRbac'
import { useToast } from '@/components/ui/Toast'

interface Props {
  onClose: () => void
  onCreated: () => void
}

type Step = 1 | 2 | 3

export function DelegationCreateWizard({ onClose, onCreated }: Props) {
  const toast = useToast()
  const createMutation = useCreateDelegation()
  const [step, setStep] = useState<Step>(1)
  const [delegateId, setDelegateId] = useState<string>('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 16))
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16)
  )
  const [reason, setReason] = useState<string>('')

  const { data: usersResp } = useUsers({ page: 1, page_size: 200 })
  const users = usersResp?.items ?? []
  const { data: allPerms = [] } = usePermissions()

  const canNext1 = !!delegateId
  const canNext2 = permissions.length > 0
  const canSubmit = startDate && endDate && reason.trim().length >= 10 && new Date(endDate) > new Date(startDate)

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        delegate_id: delegateId,
        permissions,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        reason: reason.trim(),
      })
      toast({ title: 'Délégation créée', description: '2 emails envoyés (vous + délégué)', tone: 'success' })
      onCreated()
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail?.message ?? err?.message ?? 'Erreur inconnue'
      toast({ title: 'Échec de la création', description: errMsg, tone: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[600px] max-h-[80vh] overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold">Créer une délégation — Étape {step}/3</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {/* Step 1: Delegate picker */}
          {step === 1 && (
            <div>
              <label className="block text-sm font-medium mb-2">Délégué (qui reçoit la délégation)</label>
              <select
                value={delegateId}
                onChange={e => setDelegateId(e.target.value)}
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
              >
                <option value="">— Sélectionner un utilisateur —</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Step 2: Permissions */}
          {step === 2 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Permissions à déléguer ({permissions.length} sélectionnées)
              </label>
              <p className="mb-2 text-xs text-slate-500">
                Note : vous ne pouvez déléguer que les permissions que vous possédez effectivement (hors délégations reçues).
              </p>
              <div className="max-h-80 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
                {allPerms.map((p: any) => (
                  <label key={p.code} className="flex items-center gap-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                    <input
                      type="checkbox"
                      checked={permissions.includes(p.code)}
                      onChange={e => {
                        setPermissions(prev =>
                          e.target.checked ? [...prev, p.code] : prev.filter(c => c !== p.code)
                        )
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-mono text-xs text-slate-500">{p.code}</span>
                    <span className="text-slate-700">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Period + reason */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-sm font-medium mb-1">Début</span>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium mb-1">Fin</span>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  />
                </label>
              </div>
              <label>
                <span className="block text-sm font-medium mb-1">
                  Motif (obligatoire, minimum 10 caractères — exigence ISO 27001)
                </span>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  placeholder="Ex: Vacances du 1er au 15 août — déléguer la validation des MOC"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {reason.length}/500 caractères, minimum 10
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setStep(s => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(s => ((s + 1) as Step))}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || createMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Création…
                </>
              ) : (
                'Créer la délégation'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TSC + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -30
git add apps/main/src/pages/settings/tabs/rbac/DelegationCreateWizard.tsx
git commit -m "feat(rbac): 3-step DelegationCreateWizard (delegate → permissions → period+reason)"
```

---

## Groupe 6 — `RbacSettingsTab.tsx` (réglages)

### Task 6.1 : Implémenter le composant

**Files:**
- Modify: `apps/main/src/pages/settings/tabs/RbacSettingsTab.tsx` (remplace le stub)

- [ ] **Step 1: Implémentation**

```tsx
/**
 * RbacSettingsTab — 6th sub-tab: default-role-per-user-type + ISO delegation settings.
 *
 * Sections:
 * 1. Default role per user_type (internal / external / tier_contact)
 * 2. ISO delegation settings (max duration, notify security officer)
 * 3. Permission resolution mode (restrictive / additive) — already exists, surface here
 * 4. Audit panel (recent RBAC events)
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useRbacDefaults, useSetRbacDefaults, useRoles, useAuditEvents } from '@/hooks/useRbac'

export function RbacSettingsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: defaults, isLoading } = useRbacDefaults()
  const { data: roles = [] } = useRoles({})
  const setMutation = useSetRbacDefaults()
  const { data: auditResp } = useAuditEvents({ event_type_prefix: 'delegation', page_size: 10 })

  const [internal, setInternal] = useState('')
  const [external, setExternal] = useState('')
  const [tierContact, setTierContact] = useState('')

  useEffect(() => {
    if (defaults) {
      setInternal(defaults.internal)
      setExternal(defaults.external)
      setTierContact(defaults.tier_contact)
    }
  }, [defaults])

  const handleSave = async () => {
    try {
      await setMutation.mutateAsync({ internal, external, tier_contact: tierContact })
      toast({ title: 'Réglages sauvés', tone: 'success' })
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.message ?? String(err), tone: 'error' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      {/* Section 1: Default roles */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-1 text-lg font-semibold">Rôles par défaut à la création d'un utilisateur</h3>
        <p className="mb-4 text-sm text-slate-500">
          Quand un admin crée un utilisateur, ce rôle lui est automatiquement attribué (via un groupe "Default {`{role}`}").
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <DefaultRoleSelect
            label="Type interne"
            value={internal}
            onChange={setInternal}
            roles={roles}
          />
          <DefaultRoleSelect
            label="Type externe"
            value={external}
            onChange={setExternal}
            roles={roles}
          />
          <DefaultRoleSelect
            label="Contact tiers"
            value={tierContact}
            onChange={setTierContact}
            roles={roles}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={setMutation.isPending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {setMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sauvegarde…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Enregistrer
            </>
          )}
        </button>
      </section>

      {/* Section 2: ISO delegation settings — placeholder for now (uses Settings API) */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-1 text-lg font-semibold">Réglages ISO délégations</h3>
        <p className="text-sm text-slate-500">
          La durée maximale des délégations et l'option de notification du SECURITY_OFFICER se règlent via
          l'onglet Settings global (clé <code>rbac.delegation.max_duration_days</code> et{' '}
          <code>rbac.delegation.notify_security_officer</code>). Voir
          /api/v1/settings.
        </p>
      </section>

      {/* Section 3: Recent RBAC audit */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-3 text-lg font-semibold">Audit RBAC récent (délégations)</h3>
        {auditResp?.items?.length ? (
          <ul className="space-y-2">
            {auditResp.items.map(e => (
              <li key={e.id} className="text-sm">
                <span className="font-mono text-xs text-slate-500">{new Date(e.occurred_at).toLocaleString('fr-FR')}</span>
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{e.event_type}</span>
                <span className="ml-2 text-slate-700">{e.target}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Aucun événement récent.</p>
        )}
      </section>
    </div>
  )
}

function DefaultRoleSelect({
  label,
  value,
  onChange,
  roles,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  roles: Array<{ code: string; name: string }>
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 p-2 text-sm"
      >
        <option value="">— Aucun —</option>
        {roles.map(r => (
          <option key={r.code} value={r.code}>
            {r.code} — {r.name}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 2: TSC + commit**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | head -20
git add apps/main/src/pages/settings/tabs/RbacSettingsTab.tsx
git commit -m "feat(rbac): RbacSettingsTab with default roles, ISO delegation note, recent audit"
```

---

## Groupe 7 — i18n + tests Playwright

### Task 7.1 : Ajouter les chaînes i18n

**Files:**
- Modify: `apps/main/src/i18n/locales/fr/rbac.json` (ou ajout dans common.json selon convention)
- Modify: `apps/main/src/i18n/locales/en/rbac.json`

- [ ] **Step 1: Identifier les fichiers i18n**

```bash
ls apps/main/src/i18n/locales/fr/
ls apps/main/src/i18n/locales/en/
```

Si `rbac.json` n'existe pas, créer. Si tout est dans `common.json`, ajouter à `common.json`.

- [ ] **Step 2: Ajouter les ~30 nouvelles clés**

FR:
```json
{
  "rbac": {
    "export": {
      "button": "Exporter PDF",
      "close": "Fermer",
      "lang": "Langue :",
      "include_disabled_modules": "Inclure modules désactivés",
      "selection_required": "Sélection requise"
    },
    "delegations": {
      "title": "Délégations de permissions",
      "coming_soon": "À venir."
    },
    "settings": {
      "coming_soon": "À venir."
    }
  }
}
```

EN: même structure, traduit naturellement.

- [ ] **Step 3: Commit**

```bash
git add apps/main/src/i18n/locales/
git commit -m "i18n(rbac): add FR+EN strings for RBAC frontend (export menu, delegations, settings)"
```

### Task 7.2 : Test Playwright e2e (1 scenario critique : créer une délégation)

**Files:**
- Create: `test-e2e/rbac/delegation-flow.spec.ts`

- [ ] **Step 1: Vérifier l'infra Playwright**

```bash
ls test-e2e/ 2>&1 | head -10
cat test-e2e/playwright.config.ts 2>&1 | head -20
```

Si pas de dossier `test-e2e/rbac/`, le créer.

- [ ] **Step 2: Test scenario "admin creates delegation"**

```typescript
import { test, expect } from '@playwright/test'

test.describe('RBAC Delegations', () => {
  test('admin creates a delegation and downloads the certificate', async ({ page }) => {
    // Login as admin (assumes auth helper or fixture)
    await page.goto('/settings/rbac')

    // Navigate to Délégations sub-tab
    await page.click('button:has-text("Délégations")')
    await expect(page.locator('h2')).toContainText('Délégations de permissions')

    // Open the create wizard
    await page.click('button:has-text("Créer une délégation")')
    await expect(page.locator('h2:has-text("Créer une délégation")')).toBeVisible()

    // Step 1: Pick delegate
    await page.selectOption('select', { index: 1 })  // first user other than admin
    await page.click('button:has-text("Suivant")')

    // Step 2: Pick at least 1 permission
    await page.click('input[type="checkbox"]')  // first permission
    await page.click('button:has-text("Suivant")')

    // Step 3: Period + reason
    await page.fill('textarea', 'Test e2e: délégation de validation pendant les vacances')
    await page.click('button:has-text("Créer la délégation")')

    // Toast confirms creation
    await expect(page.locator('text="Délégation créée"')).toBeVisible({ timeout: 5000 })

    // Wizard closes, new row appears
    await expect(page.locator('table tbody tr').first()).toBeVisible()

    // Download the certificate (verify it triggers a download)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[title="Télécharger le certificat PDF"]').first().click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add test-e2e/rbac/delegation-flow.spec.ts
git commit -m "test(rbac): Playwright e2e — admin creates delegation and downloads certificate"
```

### Task 7.3 : Final push

- [ ] **Step 1: Vérifier le diff complet**

```bash
git log --oneline 8adea42d..HEAD | wc -l  # commits PR-C
git log --oneline 8adea42d..HEAD
```

- [ ] **Step 2: TSC global final**

```bash
cd apps/main && npx tsc --noEmit 2>&1 | tail -10
```

Aucune nouvelle erreur (à comparer avec la baseline notée dans les pré-requis).

- [ ] **Step 3: Push**

```bash
git push origin claude/gracious-haslett-4b8b09
```

---

## Récap PR-C

| Métrique | Valeur estimée |
|---|---|
| Fichiers nouveaux | 5 (ExportPdfMenu + RbacDelegationsTab + DelegationCreateWizard + RbacSettingsTab + tests) |
| Fichiers modifiés | 5 (RbacAdminTab + RbacPermissionMatrix + rbacService + useRbac + i18n) |
| Lignes ajoutées | ~2000 |
| Hooks TanStack Query ajoutés | 9 |
| Tests Vitest | 5 |
| Tests Playwright e2e | 1 (scenario critique) |
| Groupes | 7 |
| Tâches TDD | ~12 |
| Commits estimés | ~15 |

**Après merge** : ré-invoquer `superpowers:writing-plans` pour PR-D (matrice ~1200 liaisons role×permission seedées) si tu veux poursuivre, ou stopper là et faire le rollout des 3 PRs.

---

## Self-review

1. **Spec coverage** : §9 du spec (UI front) → couvert intégralement (5 sous-onglets, ExportPdfMenu, RbacPermissionMatrix 4ᵉ source, RbacDelegationsTab, RbacSettingsTab, services + hooks, i18n, tests).
2. **Placeholder scan** :
   - Pas de "TBD" ou "TODO" non résolu
   - Pas de "Similar to Task N" — chaque task a son code complet
   - 2 endroits utilisent des stubs (Task 4.1 crée des stubs RbacDelegationsTab + RbacSettingsTab, remplacés au Groupe 5/6 ; Task 5.1 crée un stub DelegationCreateWizard remplacé au Task 5.2). C'est justifié et clairement noté.
3. **Type consistency** :
   - `PermSource` étendu à 4 valeurs cohérentes avec PR-A (`'user' | 'role' | 'group' | 'delegation'`)
   - `DelegationStatus` cohérent : `'active' | 'programmed' | 'expired' | 'revoked'` (idem que le backend)
   - `ExportPdfItem.buildUrl` retourne `string | null` (null si selection required vide)
4. **Risques notables** :
   - Beaucoup de TypeScript strict — chaque commit doit passer `npx tsc --noEmit`. Le plan force ça.
   - `RbacAdminTab.tsx` (1835 lignes) est gros — l'implementer doit faire des edits ciblés, pas réécrire.
   - L'API du composant `DataTable` n'est pas vérifiée à 100% (col defs, emptyState, etc.). Le plan note "adapt to your DataTable API".
   - Pas de gating de permission côté front sur le bouton "Créer une délégation" — server enforce de toutes façons, mais l'UX peut être améliorée plus tard.
5. **Pas de tests Vitest pour `RbacDelegationsTab`** : l'UI est complexe avec beaucoup de stubs/mocks nécessaires. Couverte seulement par le Playwright e2e du Task 7.2.

Pas d'autres issues détectées.
