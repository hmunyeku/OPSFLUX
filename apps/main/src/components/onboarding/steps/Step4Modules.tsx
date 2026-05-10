/**
 * Step 4 — Choose which business modules to enable for this entity.
 *
 * Lists all available modules from /api/v1/modules and lets the admin
 * toggle them. Protected modules are read-only. The wizard only saves
 * the deltas (modules whose state actually flips).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Boxes, Loader2, Check, ShieldCheck } from 'lucide-react'
import { useModules, useUpdateModuleState } from '@/hooks/useModules'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

interface Props {
  value: string[] // slugs the user wants enabled
  onChange: (v: string[]) => void
}

export function Step4Modules({ value, onChange }: Props) {
  const { t } = useTranslation()
  const { data: modules, isLoading } = useModules()
  const updateModule = useUpdateModuleState()
  const { toast } = useToast()
  const [savedOnce, setSavedOnce] = useState(false)

  // First mount: pre-fill the local selection from currently enabled modules.
  useEffect(() => {
    if (modules && value.length === 0) {
      onChange(modules.filter((m) => m.enabled).map((m) => m.slug))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules])

  const toggle = (slug: string, currentlySelected: boolean) => {
    if (currentlySelected) onChange(value.filter((s) => s !== slug))
    else onChange([...value, slug])
  }

  const handleApply = async () => {
    if (!modules) return
    // Compute deltas to avoid pointless API calls.
    const deltas = modules.filter((m) => {
      const want = value.includes(m.slug)
      return want !== m.enabled && !m.is_protected
    })
    if (deltas.length === 0) {
      setSavedOnce(true)
      toast({ title: t('onboarding.step4.no_change'), variant: 'default' })
      return
    }
    let okCount = 0
    let failCount = 0
    for (const m of deltas) {
      const want = value.includes(m.slug)
      try {
        await updateModule.mutateAsync({ slug: m.slug, enabled: want })
        okCount++
      } catch {
        failCount++
      }
    }
    setSavedOnce(true)
    toast({
      title: t('onboarding.step4.applied', { count: okCount }),
      description: failCount > 0 ? t('onboarding.step4.partial_fail', { count: failCount }) : undefined,
      variant: failCount > 0 ? 'warning' : 'success',
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Boxes size={16} className="text-primary" />
          {t('onboarding.step4.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t('onboarding.step4.subtitle')}</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
          <Loader2 size={14} className="animate-spin mr-2" />
          {t('common.loading')}
        </div>
      )}

      {modules && (
        <div className="space-y-1.5">
          {modules.map((m) => {
            const selected = value.includes(m.slug)
            const protectedRow = m.is_protected
            return (
              <label
                key={m.slug}
                className={cn(
                  'flex items-start gap-3 px-3 py-2.5 rounded-md border border-border transition-colors',
                  protectedRow ? 'bg-muted/40 cursor-not-allowed opacity-80' : 'hover:bg-muted/40 cursor-pointer',
                  selected && !protectedRow && 'border-primary/50 bg-primary/5',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={protectedRow}
                  onChange={() => toggle(m.slug, selected)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{m.name}</span>
                    {protectedRow && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <ShieldCheck size={10} />
                        {t('onboarding.step4.protected')}
                      </span>
                    )}
                  </div>
                  {m.depends_on.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t('onboarding.step4.depends')}: {m.depends_on.join(', ')}
                    </p>
                  )}
                  {m.missing_dependencies.length > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                      {t('onboarding.step4.missing')}: {m.missing_dependencies.join(', ')}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  v{m.version}
                </span>
              </label>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={updateModule.isPending || isLoading}
          className="btn btn-sm btn-primary"
        >
          {updateModule.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('onboarding.step4.apply')}
        </button>
        {savedOnce && !updateModule.isPending && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check size={12} />
            {t('onboarding.step4.saved')}
          </span>
        )}
      </div>
    </div>
  )
}
