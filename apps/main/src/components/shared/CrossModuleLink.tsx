/**
 * CrossModuleLink — clickable link that navigates to another module's detail.
 *
 * Two modes:
 *  1. "panel" (default) — opens the target in the DynamicPanel (stays on current page)
 *  2. "navigate" — navigates to the target module's page via router
 *
 * Renders as a styled inline link with an optional icon.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'

// Display labels for tooltips
const MODULE_LABELS: Record<string, string> = {
  assets: 'Assets',
  tiers: 'Tiers',
  projets: 'Projets',
  planner: 'Planner',
  paxlog: 'PaxLog',
  conformite: 'Conformité',
  travelwiz: 'TravelWiz',
  workflow: 'Workflow',
  'report-editor': 'Report Editor',
  'pid-pfd': 'PID/PFD',
}

// Route map for each module
const MODULE_ROUTES: Record<string, string> = {
  assets: '/assets',
  tiers: '/tiers',
  projets: '/projets',
  planner: '/planner',
  paxlog: '/paxlog',
  conformite: '/conformite',
  travelwiz: '/travelwiz',
  workflow: '/workflow',
  'report-editor': '/report-editor',
  'pid-pfd': '/pid-pfd',
}

interface CrossModuleLinkProps {
  /** Target module slug (e.g., 'projets', 'planner', 'assets') */
  module: string
  /** Record ID to open */
  id: string
  /** Display label */
  label: string
  /** Optional subtype for polymorphic modules (e.g., 'ads', 'activity') */
  subtype?: string
  /** Navigation mode: 'panel' opens in DynamicPanel, 'navigate' changes route */
  mode?: 'panel' | 'navigate'
  /** Show external link icon */
  showIcon?: boolean
  /** Additional CSS classes */
  className?: string
  /** Mono font style for codes/references */
  mono?: boolean
}

export function CrossModuleLink({
  module,
  id,
  label,
  subtype,
  mode = 'panel',
  showIcon = true,
  className,
  mono = false,
}: CrossModuleLinkProps) {
  const navigate = useNavigate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (mode === 'navigate') {
        const route = MODULE_ROUTES[module]
        if (route) {
          navigate(route)
          // Also open the detail panel after navigation
          setTimeout(() => {
            openDynamicPanel({
              type: 'detail',
              module,
              id,
              meta: subtype ? { subtype } : undefined,
            })
          }, 100)
        }
      } else {
        openDynamicPanel({
          type: 'detail',
          module,
          id,
          meta: subtype ? { subtype } : undefined,
        })
      }
    },
    [module, id, subtype, mode, navigate, openDynamicPanel],
  )

  if (!id || !label) return null

  const moduleLabel = MODULE_LABELS[module] ?? module

  return (
    <button
      onClick={handleClick}
      className={cn(
        'group/cml relative inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors text-left',
        mono && 'font-mono',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {showIcon && <ExternalLink size={10} className="shrink-0 opacity-60" />}
      {/* Hover tooltip */}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md bg-popover border border-border shadow-lg text-[10px] leading-tight whitespace-nowrap opacity-0 scale-95 group-hover/cml:opacity-100 group-hover/cml:scale-100 transition-all duration-150 z-50">
        <span className="font-semibold text-popover-foreground block">{label}</span>
        <span className="text-muted-foreground">Ouvrir dans {moduleLabel}</span>
      </span>
    </button>
  )
}
