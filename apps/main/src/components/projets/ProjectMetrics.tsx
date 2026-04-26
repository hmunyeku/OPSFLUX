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
  Save, History, Target, ListTodo, Users, Milestone as MilestoneIcon,
  Sun, Cloud, CloudRain, CloudLightning, CloudSun,
  TrendingUp, TrendingDown, Minus,
  Loader2, CalendarClock, Scale,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormSection, panelInputClass } from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import {
  useProjectSituations, useCreateProjectSituation,
  useUpdateProject,
} from '@/hooks/useProjets'
import type { Project, ProjectTask, ProjectMember, ProjectMilestone, ProjectSituation } from '@/types/api'

// ──────────────────────────────────────────────────────────────────────
// Donut gauge (pure SVG — no chart lib dep needed for one chart)
// ──────────────────────────────────────────────────────────────────────

function ProgressGauge({ value, size = 160 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, value))
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // Half-circle gauge (270° arc looks nicer + matches Gouti). Fill
  // goes clockwise from 9 o'clock (-225° start) over 270° span.
  const span = 270
  const filled = (v / 100) * span
  const tone = v >= 75 ? '#16a34a' : v >= 40 ? 'hsl(var(--primary))' : v > 0 ? '#d97706' : 'hsl(var(--muted-foreground))'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size * 0.72 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[225deg]">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke}
          strokeDasharray={`${(span / 360) * c} ${c}`}
          strokeLinecap="round"
        />
        {/* Fill */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={tone} strokeWidth={stroke}
          strokeDasharray={`${(filled / 360) * c} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 350ms ease' }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-3xl font-display font-bold tabular-nums" style={{ color: tone }}>{v}%</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mt-0.5">Avancement</span>
      </div>
    </div>
  )
}

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
  const month = findOlderThan(28)
  const deltaWeek = week ? project.progress - week.progress : null
  const deltaMonth = month ? project.progress - month.progress : null

  // ── Computed metrics ──
  const tasksTotal = tasks.length
  const tasksDone = tasks.filter(t => t.status === 'done').length
  const tasksInProgress = tasks.filter(t => t.status === 'in_progress').length
  const milestonesTotal = milestones.length
  const membersTotal = members.length

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

  const renderDelta = (delta: number | null, label: string) => {
    if (delta == null) return (
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground/70 tabular-nums">—</span>
      </div>
    )
    const tone = delta > 0 ? 'bg-green-500/10 text-green-700 dark:text-green-400'
      : delta < 0 ? 'bg-red-500/10 text-red-700 dark:text-red-400'
      : 'bg-muted/60 text-muted-foreground'
    const sign = delta > 0 ? '+' : delta < 0 ? '' : ''
    return (
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('px-1.5 py-0.5 rounded tabular-nums font-medium', tone)}>{sign}{delta}%</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Top section — situation + gauge + qualitative selectors */}
      <FormSection title="Situation projet" defaultExpanded>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4 items-start">
          {/* Left: text + selectors */}
          <div className="space-y-3">
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
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>
                  Dernière capture : <span className="text-foreground/80">{fmtDateTime(lastSituation?.captured_at)}</span>
                  {lastSituation?.captured_by_name && <span className="ml-1 italic">par {lastSituation.captured_by_name}</span>}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={createSituation.isPending}
                  className="inline-flex items-center gap-1 px-2 h-6 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createSituation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                  Enregistrer la situation
                </button>
              </div>
            </div>

            {/* Météo radios */}
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

            {/* Tendance radios */}
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

          {/* Right: gauge + deltas */}
          <div className="flex flex-col items-center gap-2">
            <ProgressGauge value={project.progress} />
            <div className="space-y-1 self-stretch px-2">
              {renderDelta(deltaWeek, 'Δ semaine dernière')}
              {renderDelta(deltaMonth, 'Δ 4 semaines')}
            </div>
          </div>
        </div>
      </FormSection>

      {/* Stats: durations + workload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormSection title="Statut des durées" defaultExpanded>
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
              label="Durée projet"
              value={dureeProjet == null ? '—' : `${dureeProjet} j`}
            />
          </div>
        </FormSection>

        <FormSection title="Statut de la charge" defaultExpanded>
          <div className="space-y-1.5 text-[11px]">
            <StatRow
              icon={Scale}
              label="Charge totale"
              value={`${hoursEstimated.toFixed(0)} h`}
              suffix={`${hoursToJH(hoursEstimated)} j/h`}
            />
            <StatRow
              icon={Scale}
              label="Charge consommée"
              value={`${hoursConsumed.toFixed(0)} h`}
              suffix={`${hoursToJH(hoursConsumed)} j/h`}
            />
            <StatRow
              icon={Scale}
              label="Reste à faire"
              value={`${hoursRemaining.toFixed(0)} h`}
              suffix={`${hoursToJH(hoursRemaining)} j/h`}
              tone="primary"
            />
          </div>
        </FormSection>
      </div>

      {/* Quantitative grid */}
      <FormSection title="Données quantitatives" defaultExpanded>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <QuantTile icon={Users}         label="Personnes"     value={membersTotal} tone={membersTotal > 0 ? 'foreground' : 'muted'} />
          <QuantTile icon={ListTodo}      label="Tâches"        value={tasksTotal}   tone={tasksTotal > 0 ? 'foreground' : 'muted'} />
          <QuantTile icon={Target}        label="Tâches done"   value={tasksDone}    tone="good" />
          <QuantTile icon={Target}        label="En cours"      value={tasksInProgress} tone="primary" />
          <QuantTile icon={MilestoneIcon} label="Jalons"        value={milestonesTotal} tone={milestonesTotal > 0 ? 'foreground' : 'muted'} />
        </div>
      </FormSection>

      {/* History */}
      <FormSection
        title={`Historique des situations (${situations.length})`}
        collapsible
        defaultExpanded={false}
        storageKey="project-detail-situations-history"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
            <Loader2 size={12} className="animate-spin" /> Chargement…
          </div>
        ) : situations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            Aucune situation enregistrée pour le moment. Cliquez sur « Enregistrer la situation » pour créer le premier point de mesure.
          </p>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <div className="grid grid-cols-[120px_60px_60px_1fr_120px] gap-1 px-2 py-1 bg-muted/50 text-[9px] font-semibold uppercase text-muted-foreground">
              <span>Date</span>
              <span className="text-right">%</span>
              <span>Météo</span>
              <span>Note</span>
              <span>Auteur</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {situations.map(s => (
                <div key={s.id} className="grid grid-cols-[120px_60px_60px_1fr_120px] gap-1 px-2 py-1 text-[11px] border-t border-border/30 items-center">
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
      </FormSection>

      {situations.length === 0 && !isLoading && (
        <div className="flex items-start gap-1.5 text-[10px] p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200">
          <History size={11} className="mt-0.5 shrink-0" />
          <span>
            Les delta « Δ semaine dernière / Δ 4 semaines » ne s’affichent qu’après plusieurs captures. Enregistrez la situation chaque semaine pour voir l’évolution.
          </span>
        </div>
      )}
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
