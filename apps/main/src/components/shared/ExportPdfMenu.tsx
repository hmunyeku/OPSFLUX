/**
 * ExportPdfMenu — shared dropdown menu to trigger RBAC PDF exports.
 *
 * Usage:
 *   <ExportPdfMenu items={[...]} selectedIds={selectedRoleCodes} context="roles" />
 *
 * Behavior:
 * - Renders a "Export PDF" button with FileDown icon
 * - On click, opens a dropdown listing the items
 * - Each item is enabled/disabled based on `requiresSelection` + current selection
 * - Top of dropdown has lang + include-disabled-modules toggles
 * - On item click, navigates to the export URL (browser handles the download)
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDown, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadPdf } from '@/lib/downloadPdf'
import { useToast } from '@/components/ui/Toast'

export interface ExportPdfItem {
  key: string
  label: string
  description: string
  buildUrl: (params: { lang: 'fr' | 'en'; includeDisabledModules: boolean; selectedIds: string[] }) => string | null
  requiresSelection?: boolean
  permission?: string  // for hint text only — server enforces
}

export type ExportPdfContext = 'roles' | 'groups' | 'permissions' | 'users' | 'delegations'

interface ExportPdfMenuProps {
  items: ExportPdfItem[]
  selectedIds?: string[]
  context: ExportPdfContext
  defaultLang?: 'fr' | 'en'
  defaultIncludeDisabledModules?: boolean
  /** Optional permission gate — if provided and user doesn't have it, the button is hidden. */
  hasPermission?: boolean
}

export function ExportPdfMenu({
  items,
  selectedIds = [],
  context: _context,
  defaultLang = 'fr',
  defaultIncludeDisabledModules = false,
  hasPermission = true,
}: ExportPdfMenuProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<'fr' | 'en'>(defaultLang)
  const [includeDisabledModules, setIncludeDisabledModules] = useState(defaultIncludeDisabledModules)

  if (!hasPermission) return null

  const handleClick = async (item: ExportPdfItem): Promise<void> => {
    if (item.requiresSelection && selectedIds.length === 0) return
    const url = item.buildUrl({ lang, includeDisabledModules, selectedIds })
    if (!url) return
    setOpen(false)
    try {
      // Authenticated download — Bearer token is attached by the shared axios
      // instance, which a raw `window.location.href` would bypass.
      await downloadPdf(url)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({ title: t('rbac.export.error', 'Erreur'), description: msg, variant: 'error' })
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        <FileDown className="h-4 w-4" />
        {t('rbac.export.button')}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-label={t('rbac.export.close')}
          />
          <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {/* Header: language + disabled modules toggle */}
            <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{t('rbac.export.lang')}</span>
                <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-600">
                  {(['fr', 'en'] as const).map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      className={cn(
                        'px-2 py-0.5 text-xs uppercase',
                        lang === l ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'bg-transparent'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeDisabledModules}
                  onChange={e => setIncludeDisabledModules(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <span>{t('rbac.export.include_disabled_modules')}</span>
              </label>
            </div>

            {/* Items */}
            <ul className="py-1">
              {items.map(item => {
                const disabled = item.requiresSelection && selectedIds.length === 0
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => handleClick(item)}
                      disabled={disabled}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm',
                        disabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                      )}
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-slate-500">{item.description}</div>
                      {disabled && (
                        <div className="mt-0.5 text-xs text-orange-600 dark:text-orange-400">
                          {t('rbac.export.selection_required')}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
