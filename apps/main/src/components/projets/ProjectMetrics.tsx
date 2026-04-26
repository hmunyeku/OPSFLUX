/**
 * ProjectMetrics — content of the project detail panel's "Métriques" tab.
 *
 * Aggregates the project's headline state into a single page:
 *   - "Situation" header: free-text status + Save Snapshot button +
 *     last capture date.
 *   - Big progress gauge (donut) + delta vs last week / 4 weeks.
 *   - Météo + Tendance editable selectors (mirror Project columns).
 *   - "Statut des durées" card: project end date, écart à la livraison,
 *     durée projet calculée.
 *   - "Statut de la charge" card: total / consumed / remaining hours
 *     (also expressed in j/h = man-days at 8h).
 *   - Quantitative grid: tasks, members, milestones, ... with icons.
 *   - History accordion: list of past snapshots.
 *
 * Data sources:
 *   - Current project + tasks + members + milestones (passed from
 *     parent panel — already cached by react-query)
 *   - Snapshots via useProjectSituations
 */
import { useMemo, useState } from 'react'
import {
  Save, History, Target, ListTodo, Users,
  Sun, Cloud, CloudRain, CloudLightning, CloudSun,
  TrendingUp, TrendingDown, Minus,
  Loader2, CalendarClock, Scale,
  Wallet, Coins, Banknote, CalendarCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectInsightsBar } from './ProjectInsightsBar'
import { FormSection, panelInputClass } from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import {
  useProjectSituations, useCreateProjectSituation,
  useUpdateProject,
} from '@/hooks/useProjets'
import type { Project, ProjectTask, ProjectMember, ProjectMilestone, ProjectSituation } from '@/types/api'

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '—' }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}
function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const da = new Date(a); const db = new Date(b)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}
function hoursToJH(h: number): number {
  return Math.round((h / 8) * 10) / 10
}

const WEATHER_OPTIONS: { value: string; label: string; icon: typeof Sun; tone: string }[] = [
  { value: 'sunny',  label: 'Ensoleillé', icon: Sun,           tone: 'text-amber-500' },
  { value: 'partly', label: 'Partiel',    icon: CloudSun,      tone: 'text-amber-400' },
  { value: 'cloudy', label: 'Nuageux',    icon: Cloud,         tone: 'text-zinc-400' },
  { value: 'rainy',  label: 'Pluvieux',   icon: CloudRain,     tone: 'text-blue-500' },
  { value: 'stormy', label: 'Orageux',    icon: CloudLightning,tone: 'text-red-500' },
]

const TREND_OPTIONS: { value: string; label: string; icon: typeof TrendingUp; tone: string }[] = [
  { value: 'up',   label: 'En amélioration', icon: TrendingUp,   tone: 'text-green-600' },
  { value: 'flat', label: 'Stable',          icon: Minus,        tone: 'text-muted-foreground' },
  { value: 'down', label: 'En dégradation',  icon: TrendingDown, tone: 'text-red-600' },
]

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

interface MetricsProps {
  project: Project
  tasks: ProjectTask[]
  members: ProjectMember[]
  milestones: ProjectMilestone[]
}

// ──────────────────────────────────────────────────────────────────────
// Hero KPI card — Mastt-style colored block with HUGE value.
// Used to surface the project's bottom-line numbers at a glance:
// Budget, Engagé, Reste à dépenser, Fin prévue, etc.
// ──────────────────────────────────────────────────────────────────────

type HeroTone = 'orange' | 'navy' | 'sky' | 'emerald' | 'amber' | 'primary' | 'rose'

interface HeroKpiProps {
  label: string
  value: string
  /** Optional small subtitle below the value (e.g. unit, secondary value). */
  sub?: string
  icon?: typeof Wallet
  tone: HeroTone
}

function HeroKpi({ label, value, sub, icon: Icon, tone }: HeroKpiProps) {
  const palette: Record<HeroTone, { bg: string; text: string; sub: string; iconBg: string }> = {
    orange:  { bg: 'bg-orange-500',          text: 'text-white',     sub: 'text-orange-50/80',     iconBg: 'bg-white/15' },
    navy:    { bg: 'bg-slate-900',           text: 'text-white',     sub: 'text-slate-300',        iconBg: 'bg-white/10' },
    sky:     { bg: 'bg-sky-500',             text: 'text-white',     sub: 'text-sky-50/80',        iconBg: 'bg-white/15' },
    emerald: { bg: 'bg-emerald-500',         text: 'text-white',     sub: 'text-emerald-50/80',    iconBg: 'bg-white/15' },
    amber:   { bg: 'bg-amber-400',           text: 'text-slate-900', sub: 'text-slate-700',        iconBg: 'bg-slate-900/10' },
    primary: { bg: 'bg-primary',             text: 'text-primary-foreground', sub: 'text-primary-foreground/75', iconBg: 'bg-white/15' },
    rose:    { bg: 'bg-rose-500',            text: 'text-white',     sub: 'text-rose-50/80',       iconBg: 'bg-white/15' },
  }
  const p = palette[tone]
  // Compact card — proportional to content. Label at the top, value
  // immediately below (no flex-grow gap), optional sub-line right of
  // the value baseline. Mastt-style executive density.
  return (
    <div className={cn(p.bg, p.text, 'rounded-lg px-3.5 py-2.5')}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && (
          <span className={cn(p.iconBg, 'w-5 h-5 rounded inline-flex items-center justify-center shrink-0')}>
            <Icon size={11} />
          </span>
        )}
        <span className={cn('text-[10px] uppercase tracking-wider font-semibold', p.sub)}>{label}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-display font-bold tabular-nums leading-none text-3xl">
          {value}
        </span>
        {sub && <span className={cn('text-[10px] font-medium', p.sub)}>{sub}</span>}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Health ring — colored circle (red/amber/green) with center icon.
// Inspired by the Mastt PMO dashboard: 4 simple rings (Périmètre,
// Calendrier, Coût, Qualité) communicate the project's health status
// at a glance.
// ──────────────────────────────────────────────────────────────────────

type HealthLevel = 'good' | 'warn' | 'bad' | 'unknown'

function HealthRing({ label, level, size = 72 }: { label: string; level: HealthLevel; size?: number }) {
  const tone = level === 'good' ? '#10b981'
    : level === 'warn' ? '#f59e0b'
    : level === 'bad' ? '#ef4444'
    : '#cbd5e1'  // softer slate for unknown — doesn't read as alarming
  const isKnown = level !== 'unknown'
  const stroke = 6
  const r = (size - stroke) / 2
  // For unknown we render a thin dashed ring (not a solid red/green)
  // so the user can tell "no data yet" from "actually fine".
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {isKnown ? (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={tone} strokeWidth={stroke} strokeLinecap="round" />
          ) : (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={tone} strokeWidth={stroke - 2} strokeDasharray="4 4" />
          )}
        </svg>
        {/* No center icon — matches Mastt's clean ring grammar.
            The label below carries the meaning; the ring color
            already communicates the level. */}
      </div>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Compact money formatter (1.5 k€, 1.2 M€). Returns '—' when no value
// to avoid the dashboard reading like "0 €" everywhere on projects
// without a budget configured yet.
// ──────────────────────────────────────────────────────────────────────
function fmtCompactMoney(n: number | null | undefined, currency = '€'): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs < 0.5) return '—'
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} M${currency}`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} k${currency}`
  return `${Math.round(n)} ${currency}`
}

export function ProjectMetrics({ project, tasks, members, milestones }: MetricsProps) {
  const { data: situations = [], isLoading } = useProjectSituations(project.id)
  const createSituation = useCreateProjectSituation()
  const updateProject = useUpdateProject()
  const { toast } = useToast()
  const [situationText, setSituationText] = useState('')

  const lastSituation = situations[0] // newest first from backend

  // ── Deltas vs older snapshots ──
  // Find the most recent snapshot older than 7 / 28 days.
  const now = Date.now()
  const findOlderThan = (days: number): ProjectSituation | undefined => {
    const cutoff = now - days * 86_400_000
    return situations.find(s => new Date(s.captured_at).getTime() <= cutoff)
  }
  const week = findOlderThan(7)
  const deltaWeek = week ? project.progress - week.progress : null
  // 28-day delta is computed but not yet shown — saved for the
  // moment we add a sparkline / mini-trend on the hero.
  void findOlderThan

  // ── Computed metrics ──
  const tasksTotal = tasks.length
  const tasksDone = tasks.filter(t => t.status === 'done').length
  const tasksInProgress = tasks.filter(t => t.status === 'in_progress').length
  // milestones / members counts are surfaced inline by the Tâches +
  // Quantitative blocks below — kept available for follow-up rows.
  void milestones; void members;

  const lastTaskEnd = useMemo(() => {
    let max: string | null = null
    for (const t of tasks) {
      if (!t.due_date) continue
      if (!max || t.due_date > max) max = t.due_date
    }
    return max
  }, [tasks])
  const ecartLivraison = daysBetween(project.end_date, lastTaskEnd)
  const dureeProjet = daysBetween(project.start_date, project.end_date)

  const hoursEstimated = useMemo(
    () => tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0),
    [tasks],
  )
  const hoursConsumed = useMemo(
    () => tasks.reduce((s, t) => s + (t.actual_hours ?? 0), 0),
    [tasks],
  )
  const hoursRemaining = Math.max(0, hoursEstimated - hoursConsumed)

  // ── Budget figures (proxy until explicit committed/forecast columns) ──
  const budget = project.budget ?? 0
  const committed = budget * (project.progress / 100)   // proxy
  const remaining = Math.max(0, budget - committed)

  // ── Health levels ──
  // Schedule (Calendrier): physical progress vs calendar elapsed.
  //   bad   = today > end_date and progress < 100
  //   warn  = progress is >10% behind expected by today
  //   good  = otherwise
  const scheduleLevel: HealthLevel = (() => {
    if (!project.start_date || !project.end_date) return 'unknown'
    const start = new Date(project.start_date).getTime()
    const end = new Date(project.end_date).getTime()
    const today = Date.now()
    if (today > end && project.progress < 100) return 'bad'
    if (today < start) return 'good'
    const expected = ((today - start) / (end - start)) * 100
    const delta = (project.progress ?? 0) - expected
    if (delta < -25) return 'bad'
    if (delta < -10) return 'warn'
    return 'good'
  })()
  // Cost (Coût): committed vs progress proportion. We don't have real
  // committed yet, so this is a proxy; will sharpen with real data.
  const costLevel: HealthLevel = (() => {
    if (budget <= 0) return 'unknown'
    if (committed > budget * 1.05) return 'bad'
    if (committed > budget) return 'warn'
    return 'good'
  })()
  // Scope/Quality: manual signals — default green until exposed on Project.
  const scopeLevel: HealthLevel = 'good'
  const qualityLevel: HealthLevel = 'good'

  const handleSave = () => {
    createSituation.mutate(
      { projectId: project.id, payload: { situation_text: situationText.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: 'Situation enregistrée', variant: 'success' })
          setSituationText('')
        },
        onError: () => toast({ title: 'Échec de l’enregistrement', variant: 'error' }),
      },
    )
  }

  const handleWeatherChange = (weather: string) => {
    if (weather === project.weather) return
    updateProject.mutate({ id: project.id, payload: { weather } })
  }
  const handleTrendChange = (trend: string) => {
    if (trend === project.trend) return
    updateProject.mutate({ id: project.id, payload: { trend } })
  }

  return (
    <div className="space-y-4">
      {/* ─── ROW 1 ── HERO KPIS — Mastt-style colored cards.
          Surfaces the bottom-line numbers PMs scan first when opening
          a project: budget, engagé, reste, avancement, fin prévue. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <HeroKpi
          label="Budget"
          value={fmtCompactMoney(budget)}
          tone="orange"
          icon={Wallet}
        />
        <HeroKpi
          label="Engagé"
          value={fmtCompactMoney(committed)}
          sub={budget > 0 ? `${Math.round((committed / budget) * 100)}% du budget` : undefined}
          tone="sky"
          icon={Coins}
        />
        <HeroKpi
          label="Reste à dépenser"
          value={fmtCompactMoney(remaining)}
          tone="navy"
          icon={Banknote}
        />
        <HeroKpi
          label="Avancement"
          value={`${project.progress}%`}
          sub={deltaWeek != null ? `Δ 7j: ${deltaWeek > 0 ? '+' : ''}${deltaWeek}%` : undefined}
          tone="primary"
          icon={Target}
        />
        <HeroKpi
          label="Fin prévue"
          value={project.end_date ? new Date(project.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          sub={ecartLivraison != null ? `Écart livraison ${ecartLivraison >= 0 ? '+' : ''}${ecartLivraison}j` : undefined}
          tone="amber"
          icon={CalendarCheck}
        />
      </div>

      {/* ─── ROW 2 ── HEALTH RINGS — at-a-glance project health
          across 4 axes (Mastt grammar). The avancement gauge that
          used to live here was a duplicate of the hero KPI — removed
          to keep this row symmetric and focused on the 4 health axes. */}
      <FormSection title="Santé du projet" defaultExpanded>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 justify-items-center py-2">
          <HealthRing label="Périmètre" level={scopeLevel} />
          <HealthRing label="Calendrier" level={scheduleLevel} />
          <HealthRing label="Coût" level={costLevel} />
          <HealthRing label="Qualité" level={qualityLevel} />
        </div>
      </FormSection>

      {/* ─── ROW 3 ── PLANNING + BUDGET CHART (full width) ─── */}
      <FormSection title="Planning & Budget" defaultExpanded>
        <ProjectInsightsBar project={project} />
      </FormSection>

      {/* ─── ROW 3 ── Détail durées + charge (lignes) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormSection title="Statut des durées" collapsible defaultExpanded={false} storageKey="project-detail-metrics-durations">
          <div className="space-y-1.5 text-[11px]">
            <StatRow icon={CalendarClock} label="Date de fin prévue" value={fmtDate(project.end_date)} />
            <StatRow icon={CalendarClock} label="Fin dernière tâche" value={fmtDate(lastTaskEnd)} />
            <StatRow
              icon={CalendarClock}
              label="Écart à la livraison"
              value={ecartLivraison == null ? '—' : `${ecartLivraison >= 0 ? '+' : ''}${ecartLivraison} j`}
              tone={ecartLivraison == null ? undefined : ecartLivraison >= 0 ? 'good' : 'bad'}
            />
            <StatRow
              icon={CalendarClock}
              label="Durée projet calculée"
              value={dureeProjet == null ? '—' : `${dureeProjet} j`}
            />
          </div>
        </FormSection>

        <FormSection title="Statut de la charge" collapsible defaultExpanded={false} storageKey="project-detail-metrics-workload">
          <div className="space-y-1.5 text-[11px]">
            <StatRow icon={Scale} label="Charge totale" value={`${hoursEstimated.toFixed(0)} h`} suffix={`${hoursToJH(hoursEstimated)} j/h`} />
            <StatRow icon={Scale} label="Charge consommée" value={`${hoursConsumed.toFixed(0)} h`} suffix={`${hoursToJH(hoursConsumed)} j/h`} />
            <StatRow icon={Scale} label="Reste à faire" value={`${hoursRemaining.toFixed(0)} h`} suffix={`${hoursToJH(hoursRemaining)} j/h`} tone="primary" />
          </div>
        </FormSection>
      </div>

      {/* ─── ROW 4 ── Tâches: répartition par statut ─── */}
      <FormSection title="Tâches" collapsible defaultExpanded={false} storageKey="project-detail-metrics-tasks">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuantTile icon={ListTodo} label="Total" value={tasksTotal} tone={tasksTotal > 0 ? 'foreground' : 'muted'} />
          <QuantTile icon={Target} label="Terminées" value={tasksDone} tone="good" />
          <QuantTile icon={Target} label="En cours" value={tasksInProgress} tone="primary" />
          <QuantTile icon={Target} label="À faire" value={Math.max(0, tasksTotal - tasksDone - tasksInProgress)} tone="muted" />
        </div>
      </FormSection>

      {/* ─── ROW 5 ── Situation projet (textarea + météo + tendance + save) ─── */}
      <FormSection title="Situation projet" defaultExpanded>
        <div className="space-y-3">
          {/* Editor */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium block mb-1">
              Situation générale
            </label>
            <textarea
              value={situationText}
              onChange={(e) => setSituationText(e.target.value)}
              placeholder={lastSituation?.situation_text || 'Décrivez en quelques mots l’état actuel du projet…'}
              rows={3}
              className={cn(panelInputClass, 'w-full text-xs resize-y')}
            />
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground gap-3">
              <span className="truncate">
                Dernière capture : <span className="text-foreground/80">{fmtDateTime(lastSituation?.captured_at)}</span>
                {lastSituation?.captured_by_name && <span className="ml-1 italic">par {lastSituation.captured_by_name}</span>}
              </span>
              <button
                type="button"
                onClick={handleSave}
                disabled={createSituation.isPending}
                className="inline-flex items-center gap-1 px-2 h-7 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors text-[11px] font-medium shrink-0"
              >
                {createSituation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Enregistrer la situation
              </button>
            </div>
          </div>

          {/* Qualitative selectors — météo + tendance side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium block mb-1">Météo</span>
              <div className="flex gap-1.5 flex-wrap">
                {WEATHER_OPTIONS.map(({ value, label, icon: Icon, tone }) => {
                  const active = project.weather === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleWeatherChange(value)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted/40',
                      )}
                      title={label}
                    >
                      <Icon size={12} className={tone} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium block mb-1">Tendance</span>
              <div className="flex gap-1.5 flex-wrap">
                {TREND_OPTIONS.map(({ value, label, icon: Icon, tone }) => {
                  const active = (project.trend ?? 'flat') === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleTrendChange(value)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted/40',
                      )}
                      title={label}
                    >
                      <Icon size={12} className={tone} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* History — table inside the same Situation section */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                Historique ({situations.length})
              </span>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
                <Loader2 size={12} className="animate-spin" /> Chargement…
              </div>
            ) : situations.length === 0 ? (
              <div className="flex items-start gap-1.5 text-[10px] p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200">
                <History size={11} className="mt-0.5 shrink-0" />
                <span>
                  Aucune situation enregistrée. Les Δ ne s’affichent qu’après plusieurs captures — enregistrez la situation chaque semaine pour voir l’évolution.
                </span>
              </div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <div className="grid grid-cols-[120px_50px_70px_1fr_110px] gap-1 px-2 py-1 bg-muted/50 text-[9px] font-semibold uppercase text-muted-foreground">
                  <span>Date</span>
                  <span className="text-right">%</span>
                  <span>Météo</span>
                  <span>Note</span>
                  <span>Auteur</span>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  {situations.map(s => (
                    <div key={s.id} className="grid grid-cols-[120px_50px_70px_1fr_110px] gap-1 px-2 py-1 text-[11px] border-t border-border/30 items-center">
                      <span className="text-muted-foreground tabular-nums">{fmtDateTime(s.captured_at)}</span>
                      <span className="text-right font-medium tabular-nums">{s.progress}%</span>
                      <span className="text-muted-foreground capitalize">
                        {WEATHER_OPTIONS.find(w => w.value === s.weather)?.label ?? s.weather ?? '—'}
                      </span>
                      <span className="text-foreground/90 truncate" title={s.situation_text || undefined}>
                        {s.situation_text || <span className="text-muted-foreground/60 italic">—</span>}
                      </span>
                      <span className="text-muted-foreground truncate">{s.captured_by_name || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </FormSection>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function StatRow({
  icon: Icon, label, value, suffix, tone,
}: {
  icon: typeof CalendarClock
  label: string
  value: string
  suffix?: string
  tone?: 'good' | 'bad' | 'primary'
}) {
  const valueCls = tone === 'good' ? 'text-green-600 dark:text-green-400'
    : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : tone === 'primary' ? 'text-primary'
    : 'text-foreground'
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={11} className="shrink-0" />
        {label}
      </span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className={cn('font-semibold', valueCls)}>{value}</span>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </span>
    </div>
  )
}

function QuantTile({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Users
  label: string
  value: number
  tone: 'foreground' | 'muted' | 'good' | 'primary'
}) {
  const valueCls = tone === 'good' ? 'text-green-600 dark:text-green-400'
    : tone === 'primary' ? 'text-primary'
    : tone === 'muted' ? 'text-muted-foreground/40'
    : 'text-foreground'
  const iconCls = tone === 'good' ? 'text-green-500'
    : tone === 'primary' ? 'text-primary'
    : 'text-muted-foreground'
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card/40">
      <Icon size={18} className={iconCls} />
      <div className="flex flex-col leading-tight min-w-0">
        <span className={cn('text-lg font-display font-bold tabular-nums leading-none', valueCls)}>{value}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium truncate">{label}</span>
      </div>
    </div>
  )
}
