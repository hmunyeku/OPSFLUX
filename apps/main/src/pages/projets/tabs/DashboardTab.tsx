/**
 * Dashboard tab (KPIs + health overview).
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 * DashboardView itself now delegates to ModuleDashboard; the legacy
 * implementation is kept behind _OldDashboardView_REMOVED for reference.
 */
import { useState, useMemo } from 'react'
import {
  FolderKanban, Loader2, Target, Sun, CheckCircle2, ListTodo, Clock, CircleDot, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useUIStore } from '@/stores/uiStore'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import { useProjectFilter } from '@/hooks/useProjectFilter'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { useProjects, useAllProjectTasks } from '@/hooks/useProjets'
import {
  PROJECT_WEATHER_VALUES, PROJECT_WEATHER_LABELS_FALLBACK,
  WEATHER_ICON_MAP,
  WeatherIcon, TaskStatusIcon,
  GoutiBadge,
} from '../shared'

function DashboardKpiCard({ icon: Icon, label, value, hint, tone = 'default' }: {
  icon: typeof Target
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary'
}) {
  const colors = {
    default: { icon: '#6b7280', bg: '#6b728015' },
    success: { icon: '#22c55e', bg: '#22c55e15' },
    warning: { icon: '#f59e0b', bg: '#f59e0b15' },
    danger:  { icon: '#ef4444', bg: '#ef444415' },
    primary: { icon: '#3b82f6', bg: '#3b82f615' },
  }[tone]
  return (
    <div className="relative rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: colors.icon }} />
      <div className="flex items-center gap-3 p-3.5 pl-4">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: colors.bg }}>
          <Icon size={16} style={{ color: colors.icon }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold tabular-nums leading-none text-foreground">{value}</div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-1">{label}</div>
          {hint && <div className="text-[9px] text-muted-foreground/50 mt-0.5">{hint}</div>}
        </div>
      </div>
    </div>
  )
}

/** @deprecated Replaced by ModuleDashboard module="projets" */
export function DashboardView() {
  return <ModuleDashboard module="projets" />
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _OldDashboardView_REMOVED() {
  const { data: projectsData, isLoading: projLoading } = useProjects({ page_size: 200 })
  const { data: tasksData, isLoading: tasksLoading } = useAllProjectTasks({ page: 1, page_size: 1000 })
  const openDynamicPanel = useUIStore(s => s.openDynamicPanel)
  const { selection, setSelection, filteredProjectIds, isFiltered } = useProjectFilter()
  const [showSelector, setShowSelector] = useState(false)
  const projectWeatherLabels = useDictionaryLabels('project_weather', PROJECT_WEATHER_LABELS_FALLBACK)

  const allProjects = projectsData?.items ?? []
  const allTasks = tasksData?.items ?? []
  // Apply shared project filter
  const projects = useMemo(() => {
    if (!filteredProjectIds) return allProjects
    return allProjects.filter(p => filteredProjectIds.has(p.id))
  }, [allProjects, filteredProjectIds])
  const tasks = useMemo(() => {
    if (!filteredProjectIds) return allTasks
    return allTasks.filter(t => filteredProjectIds.has(t.project_id))
  }, [allTasks, filteredProjectIds])

  const stats = useMemo(() => {
    const total = projects.length
    const active = projects.filter(p => p.status === 'active').length
    const completed = projects.filter(p => p.status === 'completed').length
    const onHold = projects.filter(p => p.status === 'on_hold').length
    const avgProgress = total > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / total) : 0
    const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0)
    const goutiCount = projects.filter(p => p.external_ref && p.external_ref.startsWith('gouti:')).length

    const tasksDone = tasks.filter(t => t.status === 'done').length
    const tasksOverdue = tasks.filter(t => {
      if (!t.due_date || t.status === 'done' || t.status === 'cancelled') return false
      return new Date(t.due_date).getTime() < Date.now()
    }).length
    const tasksInProgress = tasks.filter(t => t.status === 'in_progress').length
    const tasksCritical = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length

    // Health by weather
    const byWeather: Record<string, number> = { sunny: 0, cloudy: 0, rainy: 0, stormy: 0 }
    for (const p of projects) byWeather[p.weather] = (byWeather[p.weather] ?? 0) + 1

    // Upcoming deadlines (next 14 days)
    const horizon = Date.now() + 14 * 86400000
    const upcoming = tasks
      .filter(t => t.due_date && t.status !== 'done' && t.status !== 'cancelled')
      .filter(t => new Date(t.due_date!).getTime() < horizon)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 8)

    // Top projects by task volume
    const topProjects = [...projects]
      .sort((a, b) => (b.task_count ?? 0) - (a.task_count ?? 0))
      .slice(0, 5)

    return {
      total, active, completed, onHold, avgProgress, totalBudget, goutiCount,
      tasksDone, tasksOverdue, tasksInProgress, tasksCritical,
      byWeather, upcoming, topProjects,
    }
  }, [projects, tasks])

  if (projLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const formatCurrency = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Project filter bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowSelector(true)}
          className={cn('px-2 py-1 rounded border text-xs', isFiltered ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}
        >
          {isFiltered ? `${selection.projectIds.length} projet(s) sélectionnés` : 'Tous les projets'}
        </button>
        {isFiltered && <span className="text-xs text-muted-foreground">{projects.length} projets · {tasks.length} tâches affichées</span>}
      </div>
      <ProjectSelectorModal open={showSelector} onClose={() => setShowSelector(false)} selection={selection} onSelectionChange={setSelection} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpiCard icon={FolderKanban} label="Projets actifs" value={stats.active} hint={`${stats.total} au total`} tone="primary" />
        <DashboardKpiCard icon={CheckCircle2} label="Projets terminés" value={stats.completed} tone="success" />
        <DashboardKpiCard icon={Target} label="Progression moy." value={`${stats.avgProgress}%`} />
        <DashboardKpiCard
          icon={Target}
          label="Budget cumulé"
          value={`${formatCurrency(stats.totalBudget)} XAF`}
          hint={stats.goutiCount > 0 ? `${stats.goutiCount} depuis Gouti` : undefined}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpiCard icon={ListTodo} label="Tâches en cours" value={stats.tasksInProgress} tone="primary" />
        <DashboardKpiCard icon={Clock} label="Tâches en retard" value={stats.tasksOverdue} tone={stats.tasksOverdue > 0 ? 'danger' : 'default'} />
        <DashboardKpiCard icon={CircleDot} label="Tâches critiques" value={stats.tasksCritical} tone={stats.tasksCritical > 0 ? 'warning' : 'default'} />
        <DashboardKpiCard icon={CheckCircle2} label="Tâches terminées" value={stats.tasksDone} tone="success" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-border rounded-md p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1">
            <Sun size={12} className="text-yellow-500" /> Santé des projets (météo)
          </div>
          <div className="space-y-1.5">
            {PROJECT_WEATHER_VALUES.map((weather) => {
              const count = stats.byWeather[weather] ?? 0
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              const Icon = WEATHER_ICON_MAP[weather]
              return (
                <div key={weather} className="flex items-center gap-2 text-[11px]">
                  <Icon size={12} className={
                    weather === 'sunny' ? 'text-yellow-500' :
                    weather === 'cloudy' ? 'text-gray-400' :
                    weather === 'rainy' ? 'text-blue-400' : 'text-red-500'
                  } />
                  <span className="w-16">{projectWeatherLabels[weather] ?? weather}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        weather === 'sunny' ? 'bg-yellow-500' :
                        weather === 'cloudy' ? 'bg-gray-400' :
                        weather === 'rainy' ? 'bg-blue-400' : 'bg-red-500',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="border border-border rounded-md p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1">
            <Clock size={12} className="text-orange-500" /> Échéances 14 prochains jours
          </div>
          {stats.upcoming.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">Aucune tâche dans les 14 prochains jours</div>
          ) : (
            <div className="space-y-1">
              {stats.upcoming.map(t => {
                const isOverdue = new Date(t.due_date!).getTime() < Date.now()
                return (
                  <div key={t.id} className="flex items-center gap-1.5 text-[11px]">
                    <TaskStatusIcon status={t.status} size={10} />
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className="text-[9px] text-muted-foreground font-mono">{t.project_code}</span>
                    <span className={cn('text-[9px] tabular-nums', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                      {new Date(t.due_date!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-md p-3">
        <div className="text-xs font-semibold mb-2 flex items-center gap-1">
          <Layers size={12} className="text-primary" /> Projets par volume de tâches (top 5)
        </div>
        {stats.topProjects.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">Aucun projet</div>
        ) : (
          <div className="space-y-1.5">
            {stats.topProjects.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-muted/40 px-2 py-1 rounded"
                onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: p.id })}
              >
                <WeatherIcon weather={p.weather} size={12} />
                <span className="font-mono text-muted-foreground">{p.code}</span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.external_ref && p.external_ref.startsWith('gouti:') && <GoutiBadge />}
                <div className="flex items-center gap-1 w-[120px]">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-8 text-right">{p.progress}%</span>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{p.task_count ?? 0} t.</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

void _OldDashboardView_REMOVED
