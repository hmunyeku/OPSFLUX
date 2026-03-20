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

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors text-left',
        mono && 'font-mono',
        className,
      )}
      title={`Ouvrir dans ${module}`}
    >
      <span className="truncate">{label}</span>
      {showIcon && <ExternalLink size={10} className="shrink-0 opacity-60" />}
    </button>
  )
}
