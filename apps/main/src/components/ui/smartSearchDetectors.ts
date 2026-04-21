/**
 * smartSearchDetectors — ERPNext-style "awesomebar" helpers.
 *
 * Given a raw query string, each detector runs in order and returns
 * zero or more CommandItems to prepend to the palette results. This
 * turns the search bar into an action dispatcher:
 *
 *  • "2+2*3"              → "= 8" calculator result (Enter to copy)
 *  • "ADS-2026-0001"      → jump to that ADS detail panel
 *  • "CGO-2026-0007"      → jump to that PackLog cargo item
 *  • "TIR-2026-0001"      → jump to that tier
 *  • "new ads" / "nouveau ticket" → action shortcut
 *  • "accueil" / "projets" → direct module jump
 *
 * Fallthrough to the API /api/v1/search call is unchanged, so
 * arbitrary text still gets full-text semantic search.
 */
import {
  Calculator,
  Compass,
  FilePlus,
  Hash,
  Plus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface SmartItem {
  id: string
  label: string
  icon: LucideIcon
  url: string
  subtitle?: string
  category: string
  action?: 'copy' | 'navigate'
  /** When `action: 'copy'` this is the payload copied to clipboard. */
  copyValue?: string
}

// ─────────────────────────────────────────────────────────────
// 1. Calculator — basic arithmetic (+ − × ÷ % parens)
// ─────────────────────────────────────────────────────────────
// Accept digits, whitespace, . , and the 4 operators + ( ). We
// deliberately reject letters, $, # etc. so we don't trigger on
// random strings like "DEMO-BUS-01".
const CALC_REGEX = /^[\d\s+\-*/().,%]+$/
const HAS_OPERATOR = /[+\-*/%]/

function safeEval(expr: string): number | null {
  // Replace commas with dots (FR locale) and strip spaces.
  const cleaned = expr.replace(/\s/g, '').replace(/,/g, '.')
  if (!CALC_REGEX.test(cleaned) || !HAS_OPERATOR.test(cleaned)) return null
  // Defence: reject dangerous chars beyond what the regex permits,
  // then evaluate in a Function scope (no access to globals we care
  // about since `Function` still runs in sloppy mode but with only
  // maths primitives).
  if (/[^\d+\-*/().%]/.test(cleaned)) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const result = new Function(`"use strict"; return (${cleaned});`)()
    if (typeof result !== 'number' || !Number.isFinite(result)) return null
    return result
  } catch {
    return null
  }
}

export function detectCalculator(query: string): SmartItem | null {
  const trimmed = query.trim()
  if (trimmed.length < 3) return null
  const result = safeEval(trimmed)
  if (result === null) return null
  const formatted = Number.isInteger(result)
    ? result.toString()
    : result.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
  return {
    id: `calc-${trimmed}`,
    label: `= ${formatted}`,
    subtitle: `${trimmed} — Entrée pour copier le résultat`,
    icon: Calculator,
    url: '',
    category: 'Calcul',
    action: 'copy',
    copyValue: String(result),
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Object code shortcuts — jump to a specific record
// ─────────────────────────────────────────────────────────────
interface CodePattern {
  pattern: RegExp
  label: (match: string) => string
  url: (match: string) => string
  subtitle: string
  icon: LucideIcon
}

const CODE_PATTERNS: CodePattern[] = [
  {
    pattern: /^ADS-\d{4}-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/paxlog?tab=ads&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir cet Avis de Séjour',
    icon: Hash,
  },
  {
    pattern: /^AVM-\d{4}-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/paxlog?tab=avm&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir cet Avis de Mission',
    icon: Hash,
  },
  {
    pattern: /^CGO-\d{4}-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/packlog?tab=cargo&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir ce colis PackLog',
    icon: Hash,
  },
  {
    pattern: /^CGR-\d{4}-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/packlog?tab=requests&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir cette demande PackLog',
    icon: Hash,
  },
  {
    pattern: /^TIR-\d{4}-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/tiers?tab=entreprises&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir cette fiche tier',
    icon: Hash,
  },
  {
    pattern: /^PRJ-\d{2}-\d{6}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/projets?tab=projets&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir ce projet',
    icon: Hash,
  },
  {
    pattern: /^SUP-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/support?tab=tickets&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir ce ticket support',
    icon: Hash,
  },
  {
    pattern: /^MOC-\d{4}-\d{4}$/i,
    label: (m) => m.toUpperCase(),
    url: (m) => `/moc?tab=list&search=${encodeURIComponent(m)}`,
    subtitle: 'Ouvrir ce MOC',
    icon: Hash,
  },
]

export function detectObjectCode(query: string): SmartItem | null {
  const trimmed = query.trim()
  for (const p of CODE_PATTERNS) {
    if (p.pattern.test(trimmed)) {
      return {
        id: `code-${trimmed}`,
        label: p.label(trimmed),
        subtitle: p.subtitle,
        icon: p.icon,
        url: p.url(trimmed),
        category: 'Raccourci',
        action: 'navigate',
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// 3. Action shortcuts — "nouveau X" / "créer Y" / "new Z"
// ─────────────────────────────────────────────────────────────
interface ActionShortcut {
  /** Keywords that match (case-insensitive, any order after the verb) */
  keywords: string[]
  label: string
  url: string
  icon?: LucideIcon
}

const NEW_VERBS = ['new', 'nouveau', 'nouvelle', 'créer', 'creer', 'ajouter']

const ACTIONS: ActionShortcut[] = [
  { keywords: ['ads', 'séjour', 'sejour'], label: 'Nouvel Avis de Séjour', url: '/paxlog?tab=ads&new=1' },
  { keywords: ['avm', 'mission'], label: 'Nouvel Avis de Mission', url: '/paxlog?tab=avm&new=1' },
  { keywords: ['cargo', 'colis'], label: 'Nouveau colis PackLog', url: '/packlog?tab=cargo&new=1' },
  { keywords: ['demande', 'request', 'cgr'], label: 'Nouvelle demande PackLog', url: '/packlog?tab=requests&new=1' },
  { keywords: ['projet', 'project'], label: 'Nouveau projet', url: '/projets?tab=projets&new=1' },
  { keywords: ['voyage', 'trip'], label: 'Nouveau voyage TravelWiz', url: '/travelwiz?tab=voyages&new=1' },
  { keywords: ['tier', 'entreprise', 'tiers'], label: 'Nouvelle entreprise', url: '/tiers?tab=entreprises&new=1' },
  { keywords: ['ticket', 'support'], label: 'Nouveau ticket support', url: '/support?tab=tickets&new=1' },
  { keywords: ['utilisateur', 'user', 'compte'], label: 'Nouvel utilisateur', url: '/users?tab=utilisateurs&new=1' },
  { keywords: ['moc', 'modification'], label: 'Nouveau MOC', url: '/moc?tab=list&new=1' },
  { keywords: ['activite', 'activity', 'activité'], label: 'Nouvelle activité Planner', url: '/planner?tab=activities&new=1' },
]

export function detectActionShortcut(query: string): SmartItem[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return []
  const verb = words[0]
  if (!NEW_VERBS.includes(verb)) return []
  const rest = words.slice(1).join(' ')

  const results: SmartItem[] = []
  for (const action of ACTIONS) {
    if (action.keywords.some((k) => rest.includes(k))) {
      results.push({
        id: `action-${action.url}`,
        label: action.label,
        subtitle: 'Créer un nouvel enregistrement',
        icon: action.icon || FilePlus,
        url: action.url,
        category: 'Action',
        action: 'navigate',
      })
    }
  }
  return results
}

// ─────────────────────────────────────────────────────────────
// 4. Module jumps — "tiers" / "projets" / "aller vers X"
// ─────────────────────────────────────────────────────────────
interface ModuleJump {
  keywords: string[]
  label: string
  url: string
}

const MODULES: ModuleJump[] = [
  { keywords: ['accueil', 'home'],                       label: 'Accueil',          url: '/home' },
  { keywords: ['dashboard', 'tableau de bord'],          label: 'Tableau de bord',  url: '/dashboard' },
  { keywords: ['tiers', 'entreprises'],                  label: 'Tiers',            url: '/tiers' },
  { keywords: ['projets', 'projects'],                   label: 'Projets',          url: '/projets' },
  { keywords: ['planner', 'planning'],                   label: 'Planner',          url: '/planner' },
  { keywords: ['paxlog', 'pax'],                         label: 'PaxLog',           url: '/paxlog' },
  { keywords: ['travelwiz', 'voyages'],                  label: 'TravelWiz',        url: '/travelwiz' },
  { keywords: ['packlog', 'colis', 'expédition'],        label: 'PackLog',          url: '/packlog' },
  { keywords: ['imputations', 'budget'],                 label: 'Imputations',      url: '/imputations' },
  { keywords: ['papyrus', 'documents'],                  label: 'Papyrus',          url: '/papyrus' },
  { keywords: ['workflows', 'workflow'],                 label: 'Workflows',        url: '/workflow' },
  { keywords: ['moc', 'moctrack', 'management of change'],label: 'MOCTrack',        url: '/moc' },
  { keywords: ['conformité', 'conformite', 'compliance'],label: 'Conformité',       url: '/conformite' },
  { keywords: ['assets', 'registre'],                    label: 'Assets',           url: '/assets' },
  { keywords: ['entités', 'entites', 'entities'],        label: 'Entités',          url: '/entities' },
  { keywords: ['comptes', 'utilisateurs', 'users'],      label: 'Comptes',          url: '/users' },
  { keywords: ['support', 'tickets'],                    label: 'Support',          url: '/support' },
  { keywords: ['fichiers', 'files'],                     label: 'Fichiers',         url: '/files' },
  { keywords: ['paramètres', 'parametres', 'settings'],  label: 'Paramètres',       url: '/settings' },
]

const GOTO_VERBS = ['aller', 'goto', 'go', 'ouvrir', 'open', 'nav']

export function detectModuleJump(query: string): SmartItem | null {
  const raw = query.toLowerCase().trim()
  if (raw.length < 2) return null
  // Strip optional leading goto verb
  const stripped = (() => {
    const parts = raw.split(/\s+/)
    if (parts.length > 1 && GOTO_VERBS.includes(parts[0])) {
      return parts.slice(1).join(' ')
    }
    return raw
  })()
  for (const m of MODULES) {
    if (m.keywords.some((k) => stripped === k || stripped === k.replace(/ /g, ''))) {
      return {
        id: `jump-${m.url}`,
        label: m.label,
        subtitle: 'Ouvrir ce module',
        icon: Compass,
        url: m.url,
        category: 'Navigation',
        action: 'navigate',
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// Master orchestrator — composes the smart items list
// ─────────────────────────────────────────────────────────────
export function runSmartDetectors(query: string): SmartItem[] {
  const out: SmartItem[] = []
  const calc = detectCalculator(query)
  if (calc) out.push(calc)
  const code = detectObjectCode(query)
  if (code) out.push(code)
  const actions = detectActionShortcut(query)
  out.push(...actions)
  const jump = detectModuleJump(query)
  if (jump) out.push(jump)
  return out
}

// Re-export shared icons so the caller can type-check icon props
// without needing a second import.
export const SMART_ICONS = { Calculator, Plus, Sparkles }
