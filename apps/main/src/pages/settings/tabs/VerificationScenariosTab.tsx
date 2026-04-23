/**
 * Settings tab — CRUD for Playwright verification scenarios.
 *
 * Registered under the "Support" settings group. Admins define reusable
 * scenarios here; the agent harness picks them at verification time based
 * on the ticket's tags + smoke test flag + criticality (see spec §4.3.2).
 */
import { useState } from 'react'
import { Plus, Play, Trash2, Edit3, Loader2, Save, X } from 'lucide-react'
import {
  useVerificationScenarios,
  useCreateVerificationScenario,
  useUpdateVerificationScenario,
  useDeleteVerificationScenario,
  type VerificationScenario,
  type ScenarioCriticality,
} from '@/hooks/useVerificationScenarios'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const DEFAULT_SCRIPT = `// Scenario runs in a Chromium context. In scope:
//   page        — Playwright Page
//   targetUrl   — deploy URL (env TARGET_URL)
//   expect      — @playwright/test assertion helper
//   screenshot  — async (label) => void (saves screenshot to artefacts)

await page.goto(targetUrl)
await expect(page).toHaveTitle(/OPSFLUX/i)
await screenshot('homepage-loaded')
`

export function VerificationScenariosTab() {
  const { data: scenarios = [], isLoading } = useVerificationScenarios()
  const del = useDeleteVerificationScenario()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const handleDelete = async (s: VerificationScenario) => {
    const ok = await confirm({
      title: 'Supprimer le scénario ?',
      message: `"${s.name}" sera supprimé. Les résultats des runs passés sont conservés mais perdront leur lien.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await del.mutateAsync(s.id)
      toast({ title: 'Scénario supprimé', variant: 'success' })
    } catch (err) {
      toast({ title: 'Erreur', description: String(err), variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Scénarios de vérification Playwright</h3>
          <p className="text-xs text-muted-foreground">
            Exécutés automatiquement après un déploiement staging pour valider un run agent.
          </p>
        </div>
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-confirm"
          onClick={() => setCreating(true)}
        >
          <Plus size={12} /> Nouveau scénario
        </button>
      </div>

      {creating && (
        <ScenarioForm mode="create" onClose={() => setCreating(false)} />
      )}

      <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Chargement…
          </div>
        ) : scenarios.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground italic">
            Aucun scénario configuré. Le runner retournera "skipped_no_scenarios".
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {scenarios.map((s) => (
              <li key={s.id}>
                {editingId === s.id ? (
                  <div className="p-3">
                    <ScenarioForm
                      mode="edit"
                      initial={s}
                      onClose={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <ScenarioRow
                    scenario={s}
                    onEdit={() => setEditingId(s.id)}
                    onDelete={() => handleDelete(s)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ScenarioRow({
  scenario,
  onEdit,
  onDelete,
}: {
  scenario: VerificationScenario
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{scenario.name}</span>
          <CritBadge c={scenario.criticality} />
          {scenario.is_smoke_test && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              <Play size={8} className="inline" /> smoke
            </span>
          )}
          {!scenario.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              désactivé
            </span>
          )}
          {scenario.tags.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {scenario.tags.join(', ')}
            </span>
          )}
        </div>
        {scenario.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{scenario.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {scenario.script_language} · timeout {scenario.timeout_seconds}s ·{' '}
          {scenario.script_content.length} chars
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default"
          onClick={onEdit}
          title="Éditer"
        >
          <Edit3 size={12} />
        </button>
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default text-destructive"
          onClick={onDelete}
          title="Supprimer"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function CritBadge({ c }: { c: ScenarioCriticality }) {
  const cls =
    c === 'critical'
      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      : c === 'important'
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
        : 'bg-muted text-muted-foreground'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{c}</span>
}

function ScenarioForm({
  mode,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit'
  initial?: VerificationScenario
  onClose: () => void
}) {
  const create = useCreateVerificationScenario()
  const update = useUpdateVerificationScenario()
  const { toast } = useToast()

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [scriptContent, setScriptContent] = useState(initial?.script_content ?? DEFAULT_SCRIPT)
  const [timeout, setTimeout] = useState(initial?.timeout_seconds ?? 60)
  const [isSmokeTest, setIsSmokeTest] = useState(initial?.is_smoke_test ?? false)
  const [criticality, setCriticality] = useState<ScenarioCriticality>(
    initial?.criticality ?? 'important'
  )
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  const busy = create.isPending || update.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = {
      name,
      description: description || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      script_language: 'typescript' as const,
      script_content: scriptContent,
      timeout_seconds: timeout,
      is_smoke_test: isSmokeTest,
      criticality,
      enabled,
    }
    try {
      if (mode === 'create') {
        await create.mutateAsync(body)
        toast({ title: 'Scénario créé', variant: 'success' })
      } else if (initial) {
        await update.mutateAsync({ id: initial.id, ...body })
        toast({ title: 'Scénario mis à jour', variant: 'success' })
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: 'Erreur', description: msg || String(err), variant: 'error' })
    }
  }

  return (
    <form onSubmit={submit} className="p-3 border border-border/60 rounded bg-muted/30 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="gl-label-sm">Nom *</label>
          <input
            type="text"
            required
            className="gl-form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="gl-label-sm">Criticité</label>
          <select
            className="gl-form-input"
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as ScenarioCriticality)}
          >
            <option value="critical">critical (bloque)</option>
            <option value="important">important (warn)</option>
            <option value="nice_to_have">nice_to_have (info)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="gl-label-sm">Description</label>
        <input
          type="text"
          className="gl-form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="gl-label-sm">Tags (séparés par virgule)</label>
          <input
            type="text"
            className="gl-form-input"
            placeholder="auth, login"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <div>
          <label className="gl-label-sm">Timeout (s)</label>
          <input
            type="number"
            className="gl-form-input"
            value={timeout}
            min={5}
            max={900}
            onChange={(e) => setTimeout(parseInt(e.target.value) || 60)}
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={isSmokeTest}
              onChange={(e) => setIsSmokeTest(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Smoke test
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Activé
          </label>
        </div>
      </div>
      <div>
        <label className="gl-label-sm">Script Playwright *</label>
        <textarea
          required
          className="gl-form-input font-mono text-xs h-48"
          value={scriptContent}
          onChange={(e) => setScriptContent(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="gl-button gl-button-sm gl-button-default" onClick={onClose}>
          <X size={12} /> Annuler
        </button>
        <button type="submit" className="gl-button gl-button-sm gl-button-confirm" disabled={busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {mode === 'create' ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
