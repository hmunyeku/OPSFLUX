/**
 * QuickAccessWidget — Grid of shortcuts, favorites, bookmarks, frequent actions.
 *
 * Displays a configurable grid of quick-access tiles linking to:
 *   - Module tabs / pages
 *   - User bookmarks / favorites
 *   - Frequently used actions
 *
 * Config shape:
 *   items: Array<{ label, path, icon?, color?, description? }>
 *   columns: number (2-6, default 4)
 */
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, MapPin, FolderKanban, Ship,
  Shield, ClipboardList, FileText, Settings, Bookmark, Star,
  Zap, Search, Bell, Calendar, BarChart3, Globe, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, users: Users, tiers: Building2, assets: MapPin,
  projets: FolderKanban, travelwiz: Ship, conformite: Shield, planner: ClipboardList,
  documents: FileText, settings: Settings, bookmark: Bookmark, star: Star,
  zap: Zap, search: Search, bell: Bell, calendar: Calendar, chart: BarChart3, globe: Globe,
}

interface QuickAccessItem {
  label: string
  path: string
  icon?: string
  color?: string
  description?: string
}

interface QuickAccessWidgetProps {
  config: Record<string, unknown>
  data?: unknown[]
}

export function QuickAccessWidget({ config }: QuickAccessWidgetProps) {
  const navigate = useNavigate()
  const items = (config.items as QuickAccessItem[]) || []
  const columns = Math.min(6, Math.max(2, (config.columns as number) || 4))

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Configurez les raccourcis dans les parametres du widget
      </div>
    )
  }

  return (
    <div
      className="grid gap-2 h-full p-1 auto-rows-fr"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {items.map((item, i) => {
        const IconComp = ICON_MAP[item.icon || ''] || Bookmark
        const tileColor = item.color || '#3b82f6'
        return (
          <button
            key={i}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent',
              'transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98]',
              'text-white p-2 min-h-[60px]',
            )}
            style={{ backgroundColor: tileColor }}
          >
            <IconComp size={18} />
            <span className="text-[11px] font-medium leading-tight text-center">{item.label}</span>
            {item.description && (
              <span className="text-[9px] opacity-75 leading-tight text-center">{item.description}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
