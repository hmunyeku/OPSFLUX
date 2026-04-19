/**
 * MOCTrack Configuration tab — module-specific entity-level settings.
 *
 * Exposes the reminder schedule for temporary MOCs (list of J-N thresholds)
 * and the global enable flag. Values are persisted in the Setting table
 * scoped to the current entity; the APScheduler job
 * `moc_temporary_expiry` reads them on every run.
 */
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'

const DEFAULT_DAYS_BEFORE = [30, 14, 7, 1]

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function normalisedThresholds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const v of raw) {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    if (!Number.isNaN(n) && n > 0 && n <= 365) out.push(n)
  }
  return Array.from(new Set(out)).sort((a, b) => b - a)
}

export function MOCConfigTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: settings, isLoading } = useScopedSettingsMap('entity')
  const mutation = useSaveScopedSetting('entity')

  const save = useCallback(
    (key: string, value: unknown) => {
      mutation.mutate(
        { key, value },
        {
          onSuccess: () =>
            toast({
              title: t('settings.toast.general.setting_saved'),
              variant: 'success',
            }),
          onError: () =>
            toast({ title: t('settings.toast.error'), variant: 'error' }),
        },
      )
    },
    [mutation, toast, t],
  )

  const rawThresholds = settings?.['moc.reminders.days_before']
  const thresholds = useMemo<number[]>(
    () => {
      const list = normalisedThresholds(rawThresholds)
      return list.length ? list : DEFAULT_DAYS_BEFORE
    },
    [rawThresholds],
  )
  const remindersEnabled =
    settings?.['moc.reminders.enabled'] !== false &&
    settings?.['moc.reminders.enabled'] !== 'false'

  const [newThreshold, setNewThreshold] = useState('')

  const addThreshold = () => {
    const n = parseInt(newThreshold, 10)
    if (Number.isNaN(n) || n <= 0 || n > 365) {
      toast({ title: t('moc.settings.reminders.invalid_threshold'), variant: 'error' })
      return
    }
    const next = normalisedThresholds([...thresholds, n])
    save('moc.reminders.days_before', next)
    setNewThreshold('')
  }

  const removeThreshold = (n: number) => {
    const next = thresholds.filter((x) => x !== n)
    save('moc.reminders.days_before', next.length ? next : DEFAULT_DAYS_BEFORE)
  }

  const resetThresholds = () => {
    save('moc.reminders.days_before', DEFAULT_DAYS_BEFORE)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <CollapsibleSection
        id="moc-reminders"
        title={t('moc.settings.reminders.title')}
        description={t('moc.settings.reminders.description')}
        storageKey="settings.moc.reminders.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-0">
          <SettingRow
            label={t('moc.settings.reminders.enabled_label')}
            description={t('moc.settings.reminders.enabled_hint')}
          >
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(e) =>
                  save('moc.reminders.enabled', e.target.checked)
                }
              />
              {remindersEnabled
                ? t('common.enabled')
                : t('common.disabled')}
            </label>
          </SettingRow>

          <SettingRow
            label={t('moc.settings.reminders.thresholds_label')}
            description={t('moc.settings.reminders.thresholds_hint')}
          >
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-1.5 max-w-[320px]">
                {thresholds.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs"
                  >
                    J-{n}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeThreshold(n)}
                      title={t('common.remove') as string}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="gl-form-input h-7 w-20 text-xs"
                  placeholder="J-?"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addThreshold()
                    }
                  }}
                />
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-default"
                  onClick={addThreshold}
                >
                  <Plus size={12} /> {t('common.add')}
                </button>
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-default"
                  onClick={resetThresholds}
                  title={t('moc.settings.reminders.reset') as string}
                >
                  {t('common.reset')}
                </button>
              </div>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>
    </>
  )
}
