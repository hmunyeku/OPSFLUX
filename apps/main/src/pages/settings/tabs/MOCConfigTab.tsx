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
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'
import {
  useAddMOCTypeRule,
  useCreateMOCType,
  useDeleteMOCType,
  useDeleteMOCTypeRule,
  useMOCTypes,
  useUpdateMOCType,
  useUpdateMOCTypeRule,
} from '@/hooks/useMOC'
import type {
  MOCType,
  MOCValidationLevel,
  MOCValidationRole,
} from '@/services/mocService'

const ROLE_OPTIONS: MOCValidationRole[] = [
  'hse',
  'lead_process',
  'production_manager',
  'gas_manager',
  'maintenance_manager',
  'process_engineer',
  'metier',
]

const LEVEL_OPTIONS: MOCValidationLevel[] = ['DO', 'DG', 'DO_AND_DG']

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

      <CollapsibleSection
        id="moc-types"
        title={t('moc.settings.types.title')}
        description={t('moc.settings.types.description')}
        storageKey="settings.moc.types.collapse"
      >
        <MOCTypesAdmin />
      </CollapsibleSection>
    </>
  )
}


// ─── MOC Types administration (catalogue + validation matrix template) ──────


function MOCTypesAdmin() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data: types = [], isLoading } = useMOCTypes(true)
  const createType = useCreateMOCType()
  const updateType = useUpdateMOCType()
  const deleteType = useDeleteMOCType()

  const [creating, setCreating] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const onCreate = async () => {
    if (!newCode.trim() || !newLabel.trim()) return
    try {
      await createType.mutateAsync({
        code: newCode.trim(),
        label: newLabel.trim(),
        active: true,
      })
      setNewCode('')
      setNewLabel('')
      setCreating(false)
      toast({ title: t('moc.settings.types.created'), variant: 'success' })
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail?.message || t('settings.toast.error')
      toast({ title: msg, variant: 'error' })
    }
  }

  const onDelete = async (type: MOCType) => {
    const ok = await confirm({
      title: t('moc.settings.types.confirm_delete_title', 'Supprimer ce type MOC ?'),
      message: t('moc.settings.types.confirm_delete', { label: type.label }) as string,
      variant: 'danger',
      confirmLabel: t('common.delete', 'Supprimer'),
    })
    if (!ok) return
    try {
      await deleteType.mutateAsync(type.id)
      toast({ title: t('moc.settings.types.deleted'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {creating ? (
          <div className="flex flex-wrap items-center gap-1">
            <input
              className="gl-form-input h-7 w-28 text-xs"
              placeholder={t('moc.settings.types.code_ph') as string}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <input
              className="gl-form-input h-7 w-56 text-xs"
              placeholder={t('moc.settings.types.label_ph') as string}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-primary"
              disabled={!newCode.trim() || !newLabel.trim() || createType.isPending}
              onClick={onCreate}
            >
              {t('common.create')}
            </button>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-default"
              onClick={() => {
                setCreating(false)
                setNewCode('')
                setNewLabel('')
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="gl-button gl-button-sm gl-button-default"
            onClick={() => setCreating(true)}
          >
            <Plus size={12} /> {t('moc.settings.types.add')}
          </button>
        )}
      </div>

      {types.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {t('moc.settings.types.empty')}
        </p>
      ) : (
        types.map((type) => (
          <MOCTypeCard
            key={type.id}
            type={type}
            onToggleActive={(active) =>
              updateType.mutate({ id: type.id, payload: { active } })
            }
            onRenameLabel={(label) =>
              updateType.mutate({ id: type.id, payload: { label } })
            }
            onDelete={() => onDelete(type)}
          />
        ))
      )}
    </div>
  )
}


function MOCTypeCard({
  type,
  onToggleActive,
  onRenameLabel,
  onDelete,
}: {
  type: MOCType
  onToggleActive: (active: boolean) => void
  onRenameLabel: (label: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const addRule = useAddMOCTypeRule()
  const updateRule = useUpdateMOCTypeRule()
  const deleteRule = useDeleteMOCTypeRule()

  const [labelDraft, setLabelDraft] = useState(type.label)
  const [ruleRole, setRuleRole] = useState<MOCValidationRole>('hse')
  const [ruleMetier, setRuleMetier] = useState('')
  const [ruleLevel, setRuleLevel] = useState<'' | MOCValidationLevel>('')
  const [ruleRequired, setRuleRequired] = useState(true)

  const onAddRule = async () => {
    try {
      await addRule.mutateAsync({
        typeId: type.id,
        payload: {
          role: ruleRole,
          metier_code: ruleRole === 'metier' && ruleMetier ? ruleMetier : null,
          metier_name: ruleRole === 'metier' && ruleMetier ? ruleMetier : null,
          level: ruleLevel || null,
          required: ruleRequired,
          position: type.rules.length,
          active: true,
        },
      })
      setRuleMetier('')
      setRuleLevel('')
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail?.message || t('settings.toast.error')
      toast({ title: msg, variant: 'error' })
    }
  }

  return (
    <div className="rounded border border-border bg-background/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {type.code}
        </span>
        <input
          className="gl-form-input h-7 flex-1 min-w-[200px] text-xs"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            if (labelDraft.trim() && labelDraft !== type.label) onRenameLabel(labelDraft.trim())
          }}
        />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={type.active}
            onChange={(e) => onToggleActive(e.target.checked)}
          />
          {type.active ? t('common.active') : t('common.inactive')}
        </label>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title={t('common.delete') as string}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div>
        <h5 className="mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
          {t('moc.settings.types.rules_title')}
        </h5>
        {type.rules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            {t('moc.settings.types.rules_empty')}
          </p>
        ) : (
          <ul className="space-y-1">
            {type.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center gap-2 text-xs rounded bg-muted/30 px-2 py-1"
              >
                <span className="font-medium min-w-[140px]">{rule.role}</span>
                {rule.metier_name && (
                  <span className="text-muted-foreground">{rule.metier_name}</span>
                )}
                {rule.level && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px]">
                    {rule.level}
                  </span>
                )}
                <label className="flex items-center gap-1 ml-auto">
                  <input
                    type="checkbox"
                    checked={rule.required}
                    onChange={(e) =>
                      updateRule.mutate({
                        typeId: type.id,
                        ruleId: rule.id,
                        payload: { required: e.target.checked },
                      })
                    }
                  />
                  {t('moc.fields.required')}
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={rule.active}
                    onChange={(e) =>
                      updateRule.mutate({
                        typeId: type.id,
                        ruleId: rule.id,
                        payload: { active: e.target.checked },
                      })
                    }
                  />
                  {t('common.active')}
                </label>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    deleteRule.mutate({ typeId: type.id, ruleId: rule.id })
                  }
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <select
          className="gl-form-input h-7 text-xs"
          value={ruleRole}
          onChange={(e) => setRuleRole(e.target.value as MOCValidationRole)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {ruleRole === 'metier' && (
          <input
            className="gl-form-input h-7 w-32 text-xs"
            placeholder={t('moc.settings.types.metier_ph') as string}
            value={ruleMetier}
            onChange={(e) => setRuleMetier(e.target.value)}
          />
        )}
        <select
          className="gl-form-input h-7 text-xs"
          value={ruleLevel}
          onChange={(e) => setRuleLevel(e.target.value as '' | MOCValidationLevel)}
        >
          <option value="">—</option>
          {LEVEL_OPTIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={ruleRequired}
            onChange={(e) => setRuleRequired(e.target.checked)}
          />
          {t('moc.fields.required')}
        </label>
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default"
          disabled={addRule.isPending}
          onClick={onAddRule}
        >
          <Plus size={12} /> {t('moc.settings.types.add_rule')}
        </button>
      </div>
    </div>
  )
}
