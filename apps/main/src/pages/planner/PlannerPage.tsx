/**
 * Planner page — Gantt, Activites, Conflits, Capacite.
 *
 * Static Panel: tab bar + content per tab.
 * Dynamic Panel: create/detail forms per entity.
 *
 * The original monolithic implementation has been split into:
 *   - shared.ts                    — types, constants, helpers, atoms
 *   - tabs/ActivitiesTab.tsx
 *   - tabs/ConflitsTab.tsx
 *   - tabs/CapacityTab.tsx
 *   - tabs/ScenariosTab.tsx
 *   - panels/ScenarioDetailPanel.tsx
 *   - panels/ActivityDetailPanel.tsx
 *   - panels/CreateActivityPanel.tsx
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Plus, FlaskConical } from 'lucide-react'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { GanttView } from './GanttView'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { PageNavBar } from '@/components/ui/Tabs'
import { getDefaultDateRange } from '@/components/shared/gantt/ganttEngine'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'
import type { GanttSettings } from '@/components/shared/gantt/ganttTypes'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import {
  DEFAULT_PLANNER_GANTT_VIEW,
  validatePlannerGanttPrefs,
  type PlannerGanttViewPrefs,
} from './PlannerCustomizationModal'
import { useReferenceScenario, useScenario } from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import {
  TAB_DEFS,
  VALID_PLANNER_TABS,
  VALID_SCALES,
  repairTimelineRange,
  type PlannerTab,
  type PlannerTimelinePref,
} from './shared'
import { ActivitiesTab } from './tabs/ActivitiesTab'
import { ConflitsTab } from './tabs/ConflitsTab'
import { CapacityTab } from './tabs/CapacityTab'
import { ScenariosTab } from './tabs/ScenariosTab'
import { ScenarioDetailPanel } from './panels/ScenarioDetailPanel'
import { ActivityDetailPanel } from './panels/ActivityDetailPanel'
import { ConflictClusterDetailPanel } from './panels/ConflictClusterDetailPanel'
import { CreateActivityPanel } from './panels/CreateActivityPanel'

import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
export function PlannerPage() {
  useOpenDetailFromPath({ matchers: [{ prefix: '/planner/activity/', module: 'planner' }, { prefix: '/planner/scenario/', module: 'planner', meta: { subtype: 'scenario' } }] })
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as PlannerTab | null
  const scenarioFromUrl = searchParams.get('scenario')

  // Legacy redirect: ?tab=forecast was a separate tab pre-merger.
  // It now lives as a sub-view inside Capacity. Old bookmarks /
  // shared links keep working via this transparent redirect.
  // String compare instead of casting to the (narrowed) PlannerTab
  // union — same runtime, no `as unknown as`.
  const normalizedTabFromUrl: PlannerTab | null =
    (tabFromUrl as string | null) === 'forecast'
      ? 'capacity'
      : tabFromUrl
  const [activeTab, setActiveTabRaw] = useState<PlannerTab>(
    normalizedTabFromUrl && VALID_PLANNER_TABS.has(normalizedTabFromUrl)
      ? normalizedTabFromUrl
      : 'dashboard',
  )

  // Active scenario: if URL has ?scenario=<id>, we're in simulation mode for that scenario.
  // If no scenario param, we're viewing the live reference plan.
  const activeScenarioId = scenarioFromUrl || undefined

  const { data: referenceScenario } = useReferenceScenario()
  // Fetch the active scenario's metadata so we can show its name in the banner.
  const { data: activeScenarioData } = useScenario(activeScenarioId)

  // True if we're viewing a scenario that is NOT the reference (= simulation mode)
  const isSimulationMode = !!activeScenarioId && activeScenarioId !== referenceScenario?.id

  const setActiveTab = useCallback((tab: PlannerTab) => {
    setActiveTabRaw(tab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'dashboard') {
        next.delete('tab')
      } else {
        next.set('tab', tab)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setActiveScenario = useCallback((scenarioId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (scenarioId) {
        next.set('scenario', scenarioId)
      } else {
        next.delete('scenario')
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  // Translate tab labels from i18n keys so the UI follows the active language.
  const translatedTabs = useMemo(
    () => TAB_DEFS.map((tab) => ({ ...tab, label: t(tab.labelKey) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  // Load persisted timeline pref (loaded from localStorage instantly, then API)
  const { getPref, setPref } = useUserPreferences()
  const persistedTimeline = getPref<PlannerTimelinePref | null>('planner.timeline', null)

  // Initial state — fall back to month default if nothing persisted yet
  const initialScale: TimeScale =
    persistedTimeline && VALID_SCALES.has(persistedTimeline.scale)
      ? persistedTimeline.scale
      : 'month'
  const initialRange = persistedTimeline?.start && persistedTimeline?.end
    ? repairTimelineRange(initialScale, persistedTimeline.start, persistedTimeline.end)
    : getDefaultDateRange(initialScale)

  const [sharedTimelineScale, setSharedTimelineScale] = useState<TimeScale>(initialScale)
  const [sharedTimelineRange, setSharedTimelineRange] = useState(initialRange)

  // If persisted prefs arrive AFTER mount (first load before localStorage cache)
  // sync once into local state so the user sees their saved scale.
  const hydratedFromPrefsRef = useRef(false)
  useEffect(() => {
    if (hydratedFromPrefsRef.current) return
    if (!persistedTimeline) return
    if (!VALID_SCALES.has(persistedTimeline.scale)) return
    hydratedFromPrefsRef.current = true
    setSharedTimelineScale(persistedTimeline.scale)
    if (persistedTimeline.start && persistedTimeline.end) {
      setSharedTimelineRange(
        repairTimelineRange(persistedTimeline.scale, persistedTimeline.start, persistedTimeline.end),
      )
    }
  }, [persistedTimeline])

  // Persist helper — debounced inside useUserPreferences (300 ms)
  const persistTimeline = useCallback((scale: TimeScale, range: { start: string; end: string }) => {
    setPref('planner.timeline', { scale, start: range.start, end: range.end })
  }, [setPref])

  // ── Gantt+Heatmap view customization preferences ──
  const ganttViewPrefs = getPref<PlannerGanttViewPrefs>(
    'planner.gantt_view',
    DEFAULT_PLANNER_GANTT_VIEW,
  )
  const handleGanttViewPrefsChange = useCallback((prefs: PlannerGanttViewPrefs) => {
    setPref('planner.gantt_view', validatePlannerGanttPrefs(prefs))
  }, [setPref])

  // ── GanttCore internal settings (columns visibility/widths, filters, bar
  // height, show progress / baselines / weekends, ...). Persisted on a
  // separate key so the user keeps their column layout between sessions.
  const ganttCoreSettings = getPref<Partial<GanttSettings>>('planner.gantt_core', {})
  const handleGanttCoreSettingsChange = useCallback(
    (settings: GanttSettings) => {
      setPref('planner.gantt_core', settings)
    },
    [setPref],
  )

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'planner'

  const { hasPermission } = usePermission()
  const canCreate = hasPermission('planner.activity.create')

  const handleCreate = useCallback(() => {
    openDynamicPanel({ type: 'create', module: 'planner', meta: { subtype: 'activity' } })
  }, [openDynamicPanel])

  // Keyboard shortcut: `n` opens the New Activity panel — same gate
  // as the toolbar button (canCreate + tab matches + not simulating).
  // Skipped when focus is inside any editable surface so typing 'n'
  // in a field still produces an 'n' (audit K3).
  useEffect(() => {
    if (!canCreate || isSimulationMode) return
    if (activeTab !== 'activities' && activeTab !== 'gantt') return
    const isEditableTarget = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null
      if (!node) return false
      if (node.isContentEditable) return true
      const tag = node.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (node.closest?.('.ProseMirror')) return true
      return false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      handleCreate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCreate, isSimulationMode, activeTab, handleCreate])

  const handleTimelineScaleChange = useCallback((scale: TimeScale) => {
    const range = getDefaultDateRange(scale)
    setSharedTimelineScale(scale)
    setSharedTimelineRange(range)
    persistTimeline(scale, range)
  }, [persistTimeline])

  const handleTimelineRangeChange = useCallback((from: string, to: string) => {
    const range = { start: from, end: to }
    setSharedTimelineRange(range)
    persistTimeline(sharedTimelineScale, range)
  }, [persistTimeline, sharedTimelineScale])

  const handleGanttViewChange = useCallback((scale: TimeScale, start: string, end: string) => {
    const range = { start, end }
    setSharedTimelineScale(scale)
    setSharedTimelineRange(range)
    persistTimeline(scale, range)
  }, [persistTimeline])

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={CalendarRange} title={t('planner.title')} subtitle={t('planner.subtitle')}>
            {canCreate && (activeTab === 'activities' || activeTab === 'gantt') && !isSimulationMode && (
              <ToolbarButton icon={Plus} label={t('planner.actions.new_activity')} variant="primary" onClick={handleCreate} />
            )}
          </PanelHeader>

          {/* ── Simulation mode banner ───────────────────────────────── */}
          {isSimulationMode && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
              <FlaskConical size={14} className="shrink-0" />
              <span className="font-medium">{t('planner.simulation.label', 'Simulation')}</span>
              {activeScenarioData?.title && (
                <span className="font-semibold truncate max-w-[200px]">— {activeScenarioData.title}</span>
              )}
              <span className="text-amber-600 dark:text-amber-400 hidden sm:inline truncate">
                — {t('planner.simulation.banner_warning', 'aucune modification ne déclenche de workflow')}
              </span>
              <button
                onClick={() => setActiveScenario(null)}
                className="ml-auto shrink-0 text-xs px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap"
              >
                ✕ {t('planner.simulation.exit', 'Quitter')}
              </button>
            </div>
          )}

          {/* Tab bar — uses the shared `PageNavBar` component. The rightSlot
              hosts the dashboard "Modifier" toolbar via portal, only when
              the dashboard tab is active. */}
          <PageNavBar
            items={translatedTabs}
            activeId={activeTab}
            onTabChange={setActiveTab}
            rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-planner" /> : null}
          />

          {activeTab === 'dashboard' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ModuleDashboard module="planner" title="Planner" toolbarPortalId="dash-toolbar-planner" />
            </div>
          )}
          {activeTab === 'gantt' && (
            <div className="flex-1 min-h-0 flex flex-col p-3">
              <GanttView
                scale={sharedTimelineScale}
                startDate={sharedTimelineRange.start}
                endDate={sharedTimelineRange.end}
                onViewChange={handleGanttViewChange}
                viewPrefs={ganttViewPrefs}
                onViewPrefsChange={handleGanttViewPrefsChange}
                ganttSettings={ganttCoreSettings}
                onGanttSettingsChange={handleGanttCoreSettingsChange}
                scenarioId={activeScenarioId}
              />
            </div>
          )}
          {activeTab === 'activities' && <ActivitiesTab scenarioId={activeScenarioId} />}
          {activeTab === 'conflicts' && <ConflitsTab />}
          {activeTab === 'capacity' && (
            <CapacityTab
              timelineScale={sharedTimelineScale}
              timelineStartDate={sharedTimelineRange.start}
              timelineEndDate={sharedTimelineRange.end}
              onTimelineScaleChange={handleTimelineScaleChange}
              onTimelineRangeChange={handleTimelineRangeChange}
              scenarioId={activeScenarioId}
            />
          )}
          {activeTab === 'scenarios' && (
            <ScenariosTab
              activeScenarioId={activeScenarioId}
              onActivateScenario={(sid) => {
                setActiveScenario(sid)
                if (sid) setActiveTab('gantt')
              }}
            />
          )}
        </div>
      )}

      {dynamicPanel?.module === 'planner' && dynamicPanel.type === 'create' && <CreateActivityPanel />}
      {dynamicPanel?.module === 'planner' && dynamicPanel.type === 'detail' && 'id' in dynamicPanel && dynamicPanel.meta?.subtype === 'scenario' && <ScenarioDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'planner' && dynamicPanel.type === 'detail' && 'id' in dynamicPanel && dynamicPanel.meta?.subtype === 'conflict-cluster' && <ConflictClusterDetailPanel />}
      {dynamicPanel?.module === 'planner' && dynamicPanel.type === 'detail' && 'id' in dynamicPanel && dynamicPanel.meta?.subtype !== 'scenario' && dynamicPanel.meta?.subtype !== 'conflict-cluster' && <ActivityDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// -- Module-level renderer registration --
registerPanelRenderer('planner', (view) => {
  if (view.type === 'create') return <CreateActivityPanel />
  if (view.type === 'detail' && 'id' in view) return <ActivityDetailPanel id={view.id} />
  return null
})
