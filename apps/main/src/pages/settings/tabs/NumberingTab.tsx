/**
 * Numbering Patterns tab — admin configuration for reference number templates.
 *
 * Features:
 * - Variable reference panel with click-to-insert
 * - Validation rules display
 * - Regex tester per pattern
 * - Live preview with 3 example outputs
 * - Usage stats badge per prefix
 * - Visual template builder with color-coded syntax
 * - Grouped by category with CollapsibleSection
 *
 * API-backed:
 * - GET  /api/v1/references/numbering-patterns
 * - PUT  /api/v1/references/numbering-patterns/:prefix
 * - GET  /api/v1/references/numbering-preview/:prefix
 */
import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2,
  Eye,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Hash,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Regex,
  Sparkles,
  BarChart3,
  Minus,
  Dot,
  Slash,
  GripVertical,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface NumberingPattern {
  prefix: string
  template: string
  record_count?: number
}

interface NumberingPreview {
  prefix: string
  next_reference: string
  template: string
}

// ── API layer ─────────────────────────────────────────────────

async function fetchPatterns(): Promise<NumberingPattern[]> {
  const { data } = await api.get('/api/v1/references/numbering-patterns')
  return data
}

async function updatePattern(prefix: string, template: string): Promise<NumberingPattern> {
  const { data } = await api.put(`/api/v1/references/numbering-patterns/${prefix}`, { template })
  return data
}

async function previewPattern(prefix: string, template?: string): Promise<NumberingPreview> {
  const params: Record<string, string> = {}
  if (template) params.template = template
  const { data } = await api.get(`/api/v1/references/numbering-preview/${prefix}`, { params })
  return data
}

function useNumberingPatterns() {
  return useQuery({
    queryKey: ['references', 'numbering-patterns'],
    queryFn: fetchPatterns,
    staleTime: 60_000,
  })
}

// ── Known prefixes, grouped by category ──────────────────────

interface PrefixEntry {
  prefix: string
  label: string
}

interface PrefixCategory {
  key: string
  label: string
  icon: typeof Hash
  prefixes: PrefixEntry[]
}

const PREFIX_CATEGORIES: PrefixCategory[] = [
  {
    key: 'logistique',
    label: 'Logistique',
    icon: BarChart3,
    prefixes: [
      { prefix: 'ADS', label: 'Avis de séjour' },
      { prefix: 'VYG', label: 'Voyages' },
      { prefix: 'CGO', label: 'Cargo' },
      { prefix: 'ACT', label: 'Activities' },
      { prefix: 'AVM', label: 'Avis de mission (AVM)' },
    ],
  },
  {
    key: 'projets',
    label: 'Projets',
    icon: Sparkles,
    prefixes: [
      { prefix: 'PRJ', label: 'Projets' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin & Tiers',
    icon: Hash,
    prefixes: [
      { prefix: 'TRS', label: 'Tiers' },
      { prefix: 'DOC', label: 'Documents' },
    ],
  },
  {
    key: 'technique',
    label: 'Technique',
    icon: Regex,
    prefixes: [
      { prefix: 'AST', label: 'Assets' },
      { prefix: 'PID', label: 'PID/PFD' },
    ],
  },
]

const DEFAULT_TEMPLATE = '{PREFIX}{YY}{MM}{ENTITY}{###}'

// ── Variable definitions ──────────────────────────────────────

interface VariableDef {
  token: string
  label: string
  description: string
  example: string
}

const AVAILABLE_VARIABLES: VariableDef[] = [
  { token: '{PREFIX}', label: 'PREFIX', description: 'Module prefix (ADS, VYG, PRJ...)', example: 'ADS' },
  { token: '{YYYY}', label: 'YYYY', description: '4-digit year', example: '2026' },
  { token: '{YY}', label: 'YY', description: '2-digit year', example: '26' },
  { token: '{MM}', label: 'MM', description: 'Month (01-12)', example: '03' },
  { token: '{DD}', label: 'DD', description: 'Day (01-31)', example: '20' },
  { token: '{#####}', label: '#####', description: 'Sequential number (5-digit, zero-padded)', example: '00042' },
  { token: '{###}', label: '###', description: 'Sequential number (3-digit)', example: '042' },
  { token: '{ENTITY}', label: 'ENTITY', description: 'Entity code', example: 'PER' },
  { token: '{SITE}', label: 'SITE', description: 'Site code (if applicable)', example: 'LBV' },
  { token: '{TYPE}', label: 'TYPE', description: 'Object type code', example: 'EQ' },
  { token: '{RAND:4}', label: 'RAND:4', description: 'Random alphanumeric (N chars)', example: 'A7X2' },
]

const FORBIDDEN_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', ' ']
const MAX_TEMPLATE_LENGTH = 30

// ── Validation helpers ────────────────────────────────────────

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function validateTemplate(template: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for forbidden characters (outside of variable tokens)
  const withoutTokens = template.replace(/\{[^}]+\}/g, '')
  for (const ch of FORBIDDEN_CHARS) {
    if (withoutTokens.includes(ch)) {
      errors.push(`Forbidden character: "${ch === ' ' ? 'space' : ch}"`)
    }
  }

  // Check max length (estimate: tokens expand to ~5 chars each)
  if (template.length > MAX_TEMPLATE_LENGTH) {
    warnings.push(`Template is ${template.length} chars (max ${MAX_TEMPLATE_LENGTH})`)
  }

  // Must contain sequential placeholder
  if (!/\{#+\}/.test(template)) {
    errors.push('Must contain a sequential placeholder like {#####}')
  }

  // Should start with {PREFIX} or a literal
  if (!template.startsWith('{PREFIX}') && !/^[A-Z]{2,5}/.test(template)) {
    warnings.push('Should start with {PREFIX} or a literal prefix')
  }

  // Check for unknown variables
  const tokens = template.match(/\{[^}]+\}/g) || []
  const knownPatterns = [
    /^\{PREFIX\}$/,
    /^\{YYYY\}$/,
    /^\{YY\}$/,
    /^\{MM\}$/,
    /^\{DD\}$/,
    /^\{#+\}$/,
    /^\{ENTITY\}$/,
    /^\{SITE\}$/,
    /^\{TYPE\}$/,
    /^\{RAND:\d+\}$/,
  ]
  for (const tok of tokens) {
    if (!knownPatterns.some((p) => p.test(tok))) {
      warnings.push(`Unknown variable: ${tok}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/** Convert a numbering template to a regex pattern string. */
function templateToRegex(template: string): string {
  let regex = template
  // Escape regex special chars in literal parts first
  regex = regex.replace(/([.+*?^${}()|[\]\\])/g, (match, _p1, offset) => {
    // Check if this char is inside a template variable
    const before = template.substring(0, offset)
    const openBraces = (before.match(/\{/g) || []).length
    const closeBraces = (before.match(/\}/g) || []).length
    if (openBraces > closeBraces) return match // Inside a variable, don't escape
    return `\\${match}`
  })

  // Replace template variables with regex groups
  regex = regex.replace(/\\\{PREFIX\\\}/g, '([A-Z]{2,5})')
  regex = regex.replace(/\\\{YYYY\\\}/g, '(\\d{4})')
  regex = regex.replace(/\\\{YY\\\}/g, '(\\d{2})')
  regex = regex.replace(/\\\{MM\\\}/g, '(0[1-9]|1[0-2])')
  regex = regex.replace(/\\\{DD\\\}/g, '(0[1-9]|[12]\\d|3[01])')
  regex = regex.replace(/\\\{(#+)\\\}/g, (_m, hashes: string) => `(\\d{${hashes.length}})`)
  regex = regex.replace(/\\\{ENTITY\\\}/g, '([A-Z]{2,5})')
  regex = regex.replace(/\\\{SITE\\\}/g, '([A-Z]{2,5})')
  regex = regex.replace(/\\\{TYPE\\\}/g, '([A-Z]{2,5})')
  regex = regex.replace(/\\\{RAND:(\d+)\\\}/g, (_m, n: string) => `([A-Z0-9]{${n}})`)

  return `^${regex}$`
}

/** Generate a simulated example reference from a template. */
function generateExample(template: string, prefix: string, seqNumber: number): string {
  const now = new Date()
  let result = template

  result = result.replace(/\{PREFIX\}/g, prefix)
  result = result.replace(/\{YYYY\}/g, String(now.getFullYear()))
  result = result.replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
  result = result.replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0'))
  result = result.replace(/\{DD\}/g, String(now.getDate()).padStart(2, '0'))
  result = result.replace(/\{(#+)\}/g, (_m, hashes: string) =>
    String(seqNumber).padStart(hashes.length, '0'),
  )
  result = result.replace(/\{ENTITY\}/g, 'PER')
  result = result.replace(/\{SITE\}/g, 'LBV')
  result = result.replace(/\{TYPE\}/g, 'EQ')
  result = result.replace(/\{RAND:(\d+)\}/g, (_m, n: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let s = ''
    for (let i = 0; i < Number(n); i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  })

  return result
}

// ── Color-coded template rendering ───────────────────────────

function ColorCodedTemplate({ template }: { template: string }) {
  const parts: { text: string; type: 'variable' | 'separator' | 'literal' }[] = []
  const regex = /(\{[^}]+\})/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      const literal = template.slice(lastIndex, match.index)
      for (const ch of literal) {
        if ('-_./' .includes(ch)) {
          parts.push({ text: ch, type: 'separator' })
        } else {
          // Group consecutive literal chars
          const last = parts[parts.length - 1]
          if (last && last.type === 'literal') {
            last.text += ch
          } else {
            parts.push({ text: ch, type: 'literal' })
          }
        }
      }
    }
    parts.push({ text: match[1], type: 'variable' })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < template.length) {
    const literal = template.slice(lastIndex)
    for (const ch of literal) {
      if ('-_./' .includes(ch)) {
        parts.push({ text: ch, type: 'separator' })
      } else {
        const last = parts[parts.length - 1]
        if (last && last.type === 'literal') {
          last.text += ch
        } else {
          parts.push({ text: ch, type: 'literal' })
        }
      }
    }
  }

  return (
    <span className="font-mono text-xs inline-flex flex-wrap items-center gap-0">
      {parts.map((part, i) => (
        <span
          key={i}
          className={cn(
            part.type === 'variable' && 'text-blue-600 dark:text-blue-400 font-semibold',
            part.type === 'separator' && 'text-muted-foreground/60',
            part.type === 'literal' && 'text-foreground/60',
          )}
        >
          {part.text}
        </span>
      ))}
    </span>
  )
}

// ── Variable Reference Card ──────────────────────────────────

function VariableReferenceCard({
  onInsert,
}: {
  onInsert: (token: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Info size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">Available Variables</span>
        <span className="text-[10px] text-muted-foreground ml-auto">Click to insert into active template</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            onClick={() => onInsert(v.token)}
            className={cn(
              'group/var relative inline-flex items-center gap-1 rounded-md border px-2 py-1',
              'bg-background hover:bg-primary/5 border-border hover:border-primary/30',
              'text-xs font-mono transition-colors cursor-pointer',
            )}
            title={`${v.description} (e.g. ${v.example})`}
          >
            <span className="text-blue-600 dark:text-blue-400 font-semibold">{v.token}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{v.example}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Validation Rules Card ────────────────────────────────────

function ValidationRulesCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-amber-500" />
        <span className="text-xs font-semibold text-foreground">Validation Rules</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <XCircle size={11} className="text-red-400 mt-0.5 shrink-0" />
          <span>
            Forbidden chars:{' '}
            <span className="font-mono text-red-500 dark:text-red-400">
              {FORBIDDEN_CHARS.map((c) => (c === ' ' ? 'space' : c)).join(' ')}
            </span>
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <Info size={11} className="text-blue-400 mt-0.5 shrink-0" />
          <span>Max length: <span className="font-semibold text-foreground">{MAX_TEMPLATE_LENGTH}</span> characters</span>
        </div>
        <div className="flex items-start gap-1.5">
          <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />
          <span>Must contain sequential placeholder <span className="font-mono text-blue-600 dark:text-blue-400">{'{#####}'}</span></span>
        </div>
        <div className="flex items-start gap-1.5">
          <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />
          <span>Should start with <span className="font-mono text-blue-600 dark:text-blue-400">{'{PREFIX}'}</span> or a literal prefix</span>
        </div>
      </div>
    </div>
  )
}

// ── Separator selector ───────────────────────────────────────

const SEPARATORS = [
  { char: '-', label: 'Dash', icon: Minus },
  { char: '_', label: 'Underscore', icon: GripVertical },
  { char: '.', label: 'Dot', icon: Dot },
  { char: '/', label: 'Slash', icon: Slash },
]

// ── Inline Regex Tester ──────────────────────────────────────

function RegexTester({ template }: { template: string }) {
  const [testValue, setTestValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const regexStr = useMemo(() => templateToRegex(template), [template])
  const testResult = useMemo(() => {
    if (!testValue.trim()) return null
    try {
      const re = new RegExp(regexStr)
      return re.test(testValue)
    } catch {
      return false
    }
  }, [testValue, regexStr])

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Regex size={11} />
        <span>Regex Tester</span>
        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>

      {isOpen && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <code className="text-[10px] font-mono bg-muted/60 rounded px-1.5 py-0.5 text-muted-foreground max-w-[300px] truncate block select-all">
              {regexStr}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(regexStr)}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Copy regex"
            >
              <Copy size={10} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={testValue}
              onChange={(e) => setTestValue(e.target.value)}
              placeholder="Test a reference string..."
              className="h-6 w-48 rounded border border-input bg-background px-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {testResult !== null && (
              <span className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium',
                testResult ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
              )}>
                {testResult ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                {testResult ? 'Match' : 'No match'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Pattern Row with inline editor ───────────────────────────

function PatternRow({
  prefix,
  label,
  savedTemplate,
  onRequestInsert,
  activePrefix,
  onSetActive,
}: {
  prefix: string
  label: string
  savedTemplate: string
  onRequestInsert: (callback: (token: string) => void) => void
  activePrefix: string | null
  onSetActive: (prefix: string | null) => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [template, setTemplate] = useState(savedTemplate)
  const [previews, setPreviews] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const isDirty = template !== savedTemplate
  const isExpanded = activePrefix === prefix

  // Re-sync when savedTemplate changes externally
  useEffect(() => {
    if (!isDirty) setTemplate(savedTemplate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTemplate])

  const validation = useMemo(() => validateTemplate(template), [template])

  // Generate local examples
  const localExamples = useMemo(() => {
    const base = Math.floor(Math.random() * 100) + 1
    return [
      generateExample(template, prefix, base),
      generateExample(template, prefix, base + 1),
      generateExample(template, prefix, base + 2),
    ]
  }, [template, prefix])

  const mutation = useMutation({
    mutationFn: () => updatePattern(prefix, template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['references', 'numbering-patterns'] })
      toast({ title: t('settings.numbering.saved'), description: `${prefix}: ${template}`, variant: 'success' })
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'error' })
    },
  })

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const result = await previewPattern(prefix, template)
      setPreviews([result.next_reference])
    } catch {
      setPreviews(['--'])
    }
    setPreviewLoading(false)
  }, [prefix, template])

  const handleReset = useCallback(() => {
    setTemplate(savedTemplate)
    setPreviews([])
  }, [savedTemplate])

  const handleToggle = useCallback(() => {
    onSetActive(isExpanded ? null : prefix)
  }, [isExpanded, prefix, onSetActive])

  // Register insert callback when this row becomes active
  useEffect(() => {
    if (isExpanded) {
      onRequestInsert((token: string) => {
        if (inputRef.current) {
          const el = inputRef.current
          const start = el.selectionStart ?? template.length
          const end = el.selectionEnd ?? template.length
          const newTemplate = template.slice(0, start) + token + template.slice(end)
          setTemplate(newTemplate)
          setPreviews([])
          // Restore cursor position after React re-render
          requestAnimationFrame(() => {
            el.focus()
            const newPos = start + token.length
            el.setSelectionRange(newPos, newPos)
          })
        } else {
          setTemplate((prev) => prev + token)
          setPreviews([])
        }
      })
    }
  }, [isExpanded, onRequestInsert, template])

  const handleInsertSeparator = useCallback((sep: string) => {
    if (inputRef.current) {
      const el = inputRef.current
      const start = el.selectionStart ?? template.length
      const end = el.selectionEnd ?? template.length
      const newTemplate = template.slice(0, start) + sep + template.slice(end)
      setTemplate(newTemplate)
      setPreviews([])
      requestAnimationFrame(() => {
        el.focus()
        const newPos = start + 1
        el.setSelectionRange(newPos, newPos)
      })
    } else {
      setTemplate((prev) => prev + sep)
      setPreviews([])
    }
  }, [template])

  return (
    <div className={cn(
      'border border-border/60 rounded-lg transition-all',
      isExpanded ? 'bg-card shadow-sm' : 'bg-transparent hover:bg-card/50',
      isDirty && 'ring-1 ring-primary/20',
    )}>
      {/* Collapsed row header */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer select-none"
      >
        <ChevronRight
          size={13}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90',
          )}
        />

        {/* Prefix badge */}
        <span className="inline-flex items-center justify-center rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary min-w-[36px]">
          {prefix}
        </span>

        {/* Label */}
        <span className="text-xs text-muted-foreground flex-shrink-0 w-28 truncate">{label}</span>

        {/* Color-coded template preview */}
        <div className="flex-1 min-w-0 truncate">
          <ColorCodedTemplate template={template} />
        </div>

        {/* Validation indicator */}
        {!validation.valid ? (
          <XCircle size={12} className="text-red-400 shrink-0" />
        ) : validation.warnings.length > 0 ? (
          <AlertTriangle size={12} className="text-amber-400 shrink-0" />
        ) : (
          <CheckCircle2 size={12} className="text-green-500 shrink-0" />
        )}

        {/* Dirty indicator */}
        {isDirty && (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-semibold text-primary shrink-0">
            modified
          </span>
        )}

        {/* Quick preview */}
        <span className="text-[10px] font-mono text-muted-foreground max-w-[160px] truncate hidden lg:inline">
          {previews[0] || localExamples[0]}
        </span>
      </button>

      {/* Expanded inline editor */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-3">
          {/* Template input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('settings.numbering.template')}
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={template}
                onChange={(e) => { setTemplate(e.target.value); setPreviews([]) }}
                onFocus={() => onSetActive(prefix)}
                className={cn(
                  'h-8 flex-1 rounded-md border bg-background px-3 text-sm font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-ring/40',
                  isDirty ? 'border-primary/50' : 'border-input',
                  !validation.valid && 'border-red-400 focus:ring-red-300/40',
                )}
                spellCheck={false}
                autoComplete="off"
              />
              <div className="flex items-center gap-1">
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handlePreview}
                  title={t('settings.numbering.preview')}
                >
                  {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                </button>
                {isDirty && (
                  <>
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      onClick={handleReset}
                      title={t('settings.numbering.reset')}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      className={cn(
                        'h-7 px-2.5 flex items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors',
                        validation.valid
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-muted-foreground cursor-not-allowed',
                      )}
                      onClick={() => mutation.mutate()}
                      disabled={mutation.isPending || !validation.valid}
                      title={t('common.save')}
                    >
                      {mutation.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      <span>{t('common.save')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Separator quick-insert */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Separators:</span>
            {SEPARATORS.map(({ char, label: sepLabel }) => (
              <button
                key={char}
                type="button"
                onClick={() => handleInsertSeparator(char)}
                className={cn(
                  'h-6 px-2 rounded border border-border/60 bg-background',
                  'text-xs font-mono hover:bg-accent hover:border-border transition-colors',
                )}
                title={`Insert ${sepLabel}`}
              >
                {char}
              </button>
            ))}
          </div>

          {/* Color-coded display */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Parsed:</span>
            <div className="bg-muted/40 rounded px-2 py-1">
              <ColorCodedTemplate template={template} />
            </div>
          </div>

          {/* Validation messages */}
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="space-y-1">
              {validation.errors.map((err, i) => (
                <div key={`e-${i}`} className="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400">
                  <XCircle size={11} className="shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
              {validation.warnings.map((warn, i) => (
                <div key={`w-${i}`} className="flex items-center gap-1.5 text-[11px] text-amber-500 dark:text-amber-400">
                  <AlertTriangle size={11} className="shrink-0" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live preview — 3 examples */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground">Preview (next 3 references)</span>
            <div className="flex flex-wrap gap-2">
              {(previews.length > 0 ? previews : localExamples).map((ex, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-md bg-muted/60 px-2.5 py-1 text-xs font-mono text-foreground"
                >
                  {ex}
                </span>
              ))}
            </div>
          </div>

          {/* Regex tester */}
          <RegexTester template={template} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function NumberingTab() {
  const { t } = useTranslation()
  const { data: patterns, isLoading } = useNumberingPatterns()
  const [activePrefix, setActivePrefix] = useState<string | null>(null)
  const insertCallbackRef = useRef<((token: string) => void) | null>(null)

  // Merge saved patterns with all known prefixes
  const patternMap = useMemo(() => {
    const map = new Map<string, NumberingPattern>()
    for (const p of patterns ?? []) {
      map.set(p.prefix, p)
    }
    return map
  }, [patterns])

  const handleVariableInsert = useCallback((token: string) => {
    if (insertCallbackRef.current) {
      insertCallbackRef.current(token)
    }
  }, [])

  const handleRequestInsert = useCallback((callback: (token: string) => void) => {
    insertCallbackRef.current = callback
  }, [])

  return (
    <CollapsibleSection
      id="numbering-patterns"
      title={t('settings.numbering.title')}
      description={t('settings.numbering.description')}
      storageKey="settings.numbering.collapse"
      showSeparator={false}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Reference cards */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <VariableReferenceCard onInsert={handleVariableInsert} />
            <ValidationRulesCard />
          </div>

          {/* Grouped pattern categories */}
          {PREFIX_CATEGORIES.map((cat) => {
            const CatIcon = cat.icon
            return (
              <div key={cat.key}>
                <div className="flex items-center gap-2 mb-2 mt-4">
                  <CatIcon size={14} className="text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {cat.label}
                  </h3>
                  <div className="flex-1 border-t border-border/40" />
                  <span className="text-[10px] text-muted-foreground">
                    {cat.prefixes.length} {cat.prefixes.length === 1 ? 'pattern' : 'patterns'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {cat.prefixes.map(({ prefix, label }) => {
                    const saved = patternMap.get(prefix)
                    return (
                      <PatternRow
                        key={prefix}
                        prefix={prefix}
                        label={label}
                        savedTemplate={saved?.template || DEFAULT_TEMPLATE}
                        onRequestInsert={handleRequestInsert}
                        activePrefix={activePrefix}
                        onSetActive={setActivePrefix}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CollapsibleSection>
  )
}
