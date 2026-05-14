/**
 * Maintenance tab — admin-level destructive operations + demo data.
 *
 * Two sections:
 *  1. Génération de données de démonstration — pre-filled French/Cameroonian
 *     oil & gas data (Tiers, Contacts, Projets, Sites, Users).
 *  2. Réinitialisation — purge tenant data per scope. Requires the user
 *     to type the literal phrase RESET-ENTITY-DATA into a confirm modal.
 *
 * Backend routes (see app/api/routes/core/maintenance.py):
 *   GET  /api/v1/admin/maintenance/scopes
 *   POST /api/v1/admin/maintenance/generate-demo
 *   POST /api/v1/admin/maintenance/reset-tenant
 *
 * Permission: core.settings.manage (gated at the sidebar level).
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  AlertTriangle, Loader2, Sparkles, DatabaseZap, ShieldAlert,
  CheckCircle2, X,
} from 'lucide-react'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useToast } from '@/components/ui/Toast'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────

interface DemoCounts {
  tiers: number
  contacts: number
  projects: number
  sites: number
  users: number
}

interface GenerateDemoResponse {
  generated: Record<string, number>
  entity_id: string
}

interface ScopeInfo {
  key: string
  label: string
  table_count: number
}

interface ScopesListResponse {
  scopes: ScopeInfo[]
  confirm_phrase: string
}

interface ResetTenantResponse {
  deleted: Record<string, number>
  scopes_executed: string[]
  entity_id: string
}

// ── API ──────────────────────────────────────────────────────

async function fetchScopes(): Promise<ScopesListResponse> {
  const { data } = await api.get('/api/v1/admin/maintenance/scopes')
  return data
}

async function generateDemo(counts: DemoCounts): Promise<GenerateDemoResponse> {
  const { data } = await api.post('/api/v1/admin/maintenance/generate-demo', { counts })
  return data
}

async function resetTenant(payload: { confirm_phrase: string; scopes: string[] | null }): Promise<ResetTenantResponse> {
  const { data } = await api.post('/api/v1/admin/maintenance/reset-tenant', payload)
  return data
}

// ── Setting Row helper (matches GeneralConfigTab pattern) ─

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────

export function MaintenanceTab() {
  const { t } = useTranslation()
  const { toast } = useToast()

  // Demo counts (form state)
  const [counts, setCounts] = useState<DemoCounts>({
    tiers: 5, contacts: 20, projects: 3, sites: 3, users: 2,
  })

  // Reset state
  const { data: scopesData, isLoading: scopesLoading } = useQuery({
    queryKey: ['maintenance', 'scopes'],
    queryFn: fetchScopes,
    staleTime: 5 * 60_000,
  })
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [showResetModal, setShowResetModal] = useState(false)
  const [confirmPhrase, setConfirmPhrase] = useState('')

  // ── Mutations ────────────────────────────────────────────

  const generateMutation = useMutation({
    mutationFn: generateDemo,
    onSuccess: (data) => {
      const summary = Object.entries(data.generated)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
      toast({
        title: t('settings.maintenance.toast.demo_generated', 'Données de démonstration générées'),
        description: summary || t('settings.maintenance.toast.demo_nothing', 'Aucune donnée générée'),
        variant: 'success',
      })
    },
    onError: (err) => {
      toast({
        title: t('settings.maintenance.toast.demo_error', "Échec de la génération"),
        description: describeError(err, t),
        variant: 'error',
      })
    },
  })

  const resetMutation = useMutation({
    mutationFn: resetTenant,
    onSuccess: (data) => {
      const total = Object.values(data.deleted).reduce((a, b) => a + b, 0)
      toast({
        title: t('settings.maintenance.toast.reset_done', 'Réinitialisation terminée'),
        description: t('settings.maintenance.toast.reset_summary', '{{count}} enregistrements supprimés sur {{scopes}} domaines', {
          count: total,
          scopes: data.scopes_executed.length,
        }),
        variant: 'success',
      })
      setShowResetModal(false)
      setConfirmPhrase('')
      setSelectedScopes(new Set())
    },
    onError: (err) => {
      toast({
        title: t('settings.maintenance.toast.reset_error', 'Échec de la réinitialisation'),
        description: describeError(err, t),
        variant: 'error',
      })
    },
  })

  // ── Helpers ─────────────────────────────────────────────

  const requiredPhrase = scopesData?.confirm_phrase ?? 'RESET-ENTITY-DATA'
  const scopes = scopesData?.scopes ?? []
  const allSelected = scopes.length > 0 && selectedScopes.size === scopes.length
  const noneSelected = selectedScopes.size === 0

  const toggleScope = (key: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelectedScopes(new Set())
    else setSelectedScopes(new Set(scopes.map((s) => s.key)))
  }

  const handleResetClick = () => {
    if (noneSelected) {
      toast({
        title: t('settings.maintenance.toast.select_scope', 'Sélectionnez au moins un domaine'),
        variant: 'error',
      })
      return
    }
    setConfirmPhrase('')
    setShowResetModal(true)
  }

  const handleResetConfirm = () => {
    if (confirmPhrase !== requiredPhrase) return
    resetMutation.mutate({
      confirm_phrase: requiredPhrase,
      scopes: allSelected ? null : Array.from(selectedScopes),
    })
  }

  const totalDemoCount = useMemo(
    () => counts.tiers + counts.contacts + counts.projects + counts.sites + counts.users,
    [counts],
  )

  // ── Render ──────────────────────────────────────────────

  return (
    <>
      {/* ── Demo data section ─────────────────────────────── */}
      <CollapsibleSection
        id="maintenance-demo"
        title={t('settings.maintenance.demo.title', 'Données de démonstration')}
        description={t(
          'settings.maintenance.demo.description',
          "Génère un jeu de données réaliste (secteur pétrole/gaz, Cameroun) pour tester l'application. Codes suffixés d'un identifiant aléatoire — ré-exécutable sans collision.",
        )}
        defaultExpanded
      >
        <div className="bg-card border border-border rounded-lg p-4 mb-3">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              {t(
                'settings.maintenance.demo.hint',
                "Sociétés (PERENCO, TOTAL, SNH, CDR, Schlumberger…), contacts (noms français/camerounais), projets oil & gas avec tâches Gantt, sites onshore/offshore, comptes utilisateurs de test.",
              )}
            </div>
          </div>
        </div>

        <SettingRow label={t('settings.maintenance.demo.tiers', 'Sociétés (Tiers)')}>
          <input
            type="number"
            min={0}
            max={200}
            value={counts.tiers}
            onChange={(e) => setCounts({ ...counts, tiers: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })}
            className="gl-form-input w-24 text-sm text-right"
            disabled={generateMutation.isPending}
          />
        </SettingRow>
        <SettingRow label={t('settings.maintenance.demo.contacts', 'Contacts (employés des sociétés)')}>
          <input
            type="number"
            min={0}
            max={2000}
            value={counts.contacts}
            onChange={(e) => setCounts({ ...counts, contacts: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })}
            className="gl-form-input w-24 text-sm text-right"
            disabled={generateMutation.isPending}
          />
        </SettingRow>
        <SettingRow label={t('settings.maintenance.demo.projects', 'Projets (avec tâches)')}>
          <input
            type="number"
            min={0}
            max={100}
            value={counts.projects}
            onChange={(e) => setCounts({ ...counts, projects: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="gl-form-input w-24 text-sm text-right"
            disabled={generateMutation.isPending}
          />
        </SettingRow>
        <SettingRow label={t('settings.maintenance.demo.sites', 'Sites (champs et installations)')}>
          <input
            type="number"
            min={0}
            max={50}
            value={counts.sites}
            onChange={(e) => setCounts({ ...counts, sites: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
            className="gl-form-input w-24 text-sm text-right"
            disabled={generateMutation.isPending}
          />
        </SettingRow>
        <SettingRow
          label={t('settings.maintenance.demo.users', "Comptes utilisateurs de test")}
          description={t(
            'settings.maintenance.demo.users_hint',
            "Crée des comptes 'demo-XXXX-NN@opsflux.io' avec mot de passe DemoXXXX!2026.",
          )}
        >
          <input
            type="number"
            min={0}
            max={50}
            value={counts.users}
            onChange={(e) => setCounts({ ...counts, users: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
            className="gl-form-input w-24 text-sm text-right"
            disabled={generateMutation.isPending}
          />
        </SettingRow>

        <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-2">
          <span className="text-xs text-muted-foreground">
            {t('settings.maintenance.demo.total', 'Total à générer : {{count}} enregistrements', { count: totalDemoCount })}
          </span>
          <button
            onClick={() => generateMutation.mutate(counts)}
            disabled={generateMutation.isPending || totalDemoCount === 0}
            className="btn-sm btn-primary inline-flex items-center gap-2"
          >
            {generateMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {t('settings.maintenance.demo.generate', 'Générer')}
          </button>
        </div>
      </CollapsibleSection>

      {/* ── Reset section ─────────────────────────────────── */}
      <CollapsibleSection
        id="maintenance-reset"
        title={t('settings.maintenance.reset.title', 'Réinitialisation des données')}
        description={t(
          'settings.maintenance.reset.description',
          "Vide les données opérationnelles de l'entité par domaine. La configuration (utilisateurs, rôles, paramètres) est toujours préservée.",
        )}
      >
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-foreground space-y-1.5">
              <p className="font-medium">
                {t('settings.maintenance.reset.warning_title', 'Action irréversible')}
              </p>
              <p className="text-muted-foreground">
                {t(
                  'settings.maintenance.reset.warning_body',
                  "La suppression est immédiate et définitive (pas de corbeille). Les domaines cochés sont vidés pour l'entité courante uniquement — les autres entités ne sont pas affectées.",
                )}
              </p>
              <p className="text-muted-foreground">
                {t('settings.maintenance.reset.preserved_hint')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            {t('settings.maintenance.reset.scopes', 'Domaines à vider')}
            {scopesData && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({selectedScopes.size}/{scopes.length})
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            disabled={scopesLoading}
            className="text-xs text-primary hover:underline"
          >
            {allSelected
              ? t('settings.maintenance.reset.deselect_all', 'Tout désélectionner')
              : t('settings.maintenance.reset.select_all', 'Tout sélectionner')}
          </button>
        </div>

        {scopesLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            {t('common.loading', 'Chargement…')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mb-4">
            {scopes.map((scope) => {
              // Cherche un libellé i18n dans settings.maintenance.scopes_map.<key>
              // pour bilingue. Si non trouvé, fallback sur le label brut du
              // backend (cas d'un nouveau scope ajouté sans i18n encore).
              const localizedLabel = t(`settings.maintenance.scopes_map.${scope.key}`, scope.label)
              return (
                <label
                  key={scope.key}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors',
                    selectedScopes.has(scope.key)
                      ? 'bg-destructive/5 border-destructive/30'
                      : 'bg-card border-border hover:bg-accent/50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.has(scope.key)}
                    onChange={() => toggleScope(scope.key)}
                    className="mt-0.5 shrink-0"
                    disabled={resetMutation.isPending}
                  />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">{localizedLabel}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {scope.key} · {scope.table_count} {t('settings.maintenance.reset.tables', 'tables')}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-end pt-4 border-t border-border/50">
          <button
            onClick={handleResetClick}
            disabled={scopesLoading || resetMutation.isPending || noneSelected}
            className="btn-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex items-center gap-2"
          >
            {resetMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <DatabaseZap size={14} />
            )}
            {t('settings.maintenance.reset.purge', 'Vidanger')}
          </button>
        </div>
      </CollapsibleSection>

      {/* ── Confirm modal ─────────────────────────────────── */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in-0 duration-200"
          role="dialog"
          aria-modal="true"
          onClick={() => !resetMutation.isPending && setShowResetModal(false)}
        >
          <div
            className="relative bg-gradient-to-br from-card to-card/80 border border-destructive/40 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 pb-2">
              <div className="p-2 rounded-lg bg-destructive/10 ring-1 ring-destructive/30 text-destructive">
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('settings.maintenance.modal.title', 'Confirmer la réinitialisation')}
              </h3>
              <button
                type="button"
                onClick={() => !resetMutation.isPending && setShowResetModal(false)}
                disabled={resetMutation.isPending}
                className="ml-auto p-1 hover:bg-muted rounded-md text-muted-foreground"
                aria-label={t('common.close', 'Fermer')}
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-4 pb-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  'settings.maintenance.modal.body',
                  "Vous allez vider {{count}} domaine(s) sur l'entité courante. Cette action est irréversible.",
                  { count: selectedScopes.size },
                )}
              </p>

              <div className="bg-muted/30 rounded-md p-2.5 max-h-40 overflow-y-auto">
                <ul className="space-y-1">
                  {scopes
                    .filter((s) => selectedScopes.has(s.key))
                    .map((s) => (
                      <li key={s.key} className="text-xs text-foreground flex items-center gap-1.5">
                        <CheckCircle2 size={11} className="text-destructive shrink-0" />
                        {t(`settings.maintenance.scopes_map.${s.key}`, s.label)}
                      </li>
                    ))}
                </ul>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  {t('settings.maintenance.modal.type_phrase', 'Pour confirmer, saisissez :')}{' '}
                  <code className="font-mono text-foreground bg-muted px-1 py-0.5 rounded">
                    {requiredPhrase}
                  </code>
                </label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder={requiredPhrase}
                  className="gl-form-input w-full text-sm font-mono"
                  autoFocus
                  disabled={resetMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && confirmPhrase === requiredPhrase) handleResetConfirm()
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetMutation.isPending}
                className="btn-sm btn-secondary"
              >
                {t('common.cancel', 'Annuler')}
              </button>
              <button
                onClick={handleResetConfirm}
                disabled={confirmPhrase !== requiredPhrase || resetMutation.isPending}
                className="btn-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex items-center gap-2 disabled:opacity-40"
              >
                {resetMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <DatabaseZap size={14} />
                )}
                {t('settings.maintenance.modal.confirm', 'Vidanger maintenant')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
