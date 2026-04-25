import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/ui/Toast'
import { useProjects } from '@/hooks/useProjets'
import { useCostCenters, useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'
import type { DefaultImputationSettingValue } from '@/services/settingsService'

function normalizeSetting(value: unknown): DefaultImputationSettingValue {
  if (!value || typeof value !== 'object') {
    return { project_id: null, cost_center_id: null }
  }

  const record = value as Record<string, unknown>
  return {
    project_id: typeof record.project_id === 'string' ? record.project_id : null,
    cost_center_id: typeof record.cost_center_id === 'string' ? record.cost_center_id : null,
  }
}

export function DefaultImputationSettingEditor({
  scope,
  title,
  description,
  hint,
}: {
  scope: 'user' | 'entity'
  title: string
  description: string
  hint?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: settingsMap, isLoading } = useScopedSettingsMap(scope)
  const saveSetting = useSaveScopedSetting(scope)
  const { data: projectsData, isLoading: projectsLoading } = useProjects({ page_size: 200 })
  const { data: costCentersData, isLoading: costCentersLoading } = useCostCenters({ page_size: 200 })

  const currentValue = normalizeSetting(settingsMap?.['core.default_imputation'])
  const [draft, setDraft] = useState<DefaultImputationSettingValue | null>(null)

  const effective = draft ?? currentValue

  const projects = useMemo(
    () => (projectsData?.items ?? []).map((project) => ({
      value: project.id,
      label: `${project.code} - ${project.name}`,
    })),
    [projectsData],
  )

  const costCenters = useMemo(
    () => (costCentersData?.items ?? []).map((center) => ({
      value: center.id,
      label: `${center.code} - ${center.name}`,
    })),
    [costCentersData],
  )

  const isBusy = isLoading || projectsLoading || costCentersLoading

  const handleChange = (field: keyof DefaultImputationSettingValue, value: string) => {
    setDraft({
      ...effective,
      [field]: value || null,
    })
  }

  const handleSave = async () => {
    try {
      await saveSetting.mutateAsync({
        key: 'core.default_imputation',
        value: {
          project_id: effective.project_id || null,
          cost_center_id: effective.cost_center_id || null,
        },
      })
      setDraft(null)
      toast({ title: t('settings.default_imputation.saved'), variant: 'success' })
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({
        title: t('common.error'),
        description: detail || t('settings.default_imputation.save_error'),
        variant: 'error',
      })
    }
  }

  const handleReset = async () => {
    try {
      await saveSetting.mutateAsync({
        key: 'core.default_imputation',
        value: {
          project_id: null,
          cost_center_id: null,
        },
      })
      setDraft(null)
      toast({ title: t('settings.default_imputation.reset_success'), variant: 'success' })
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({
        title: t('common.error'),
        description: detail || t('settings.default_imputation.reset_error'),
        variant: 'error',
      })
    }
  }

  const isDirty = (draft?.project_id ?? currentValue.project_id ?? null) !== (currentValue.project_id ?? null)
    || (draft?.cost_center_id ?? currentValue.cost_center_id ?? null) !== (currentValue.cost_center_id ?? null)

  if (isBusy) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-2">{hint}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div>
          <label className="gl-label">{t('settings.default_imputation.default_project')}</label>
          <select
            className="gl-form-input"
            value={effective.project_id || ''}
            onChange={(e) => handleChange('project_id', e.target.value)}
          >
            <option value="">{t('settings.default_imputation.no_default_project')}</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('settings.default_imputation.default_project_help')}
          </p>
        </div>

        <div>
          <label className="gl-label">{t('settings.default_imputation.default_cost_center')}</label>
          <select
            className="gl-form-input"
            value={effective.cost_center_id || ''}
            onChange={(e) => handleChange('cost_center_id', e.target.value)}
          >
            <option value="">{t('settings.default_imputation.no_default_cost_center')}</option>
            {costCenters.map((center) => (
              <option key={center.value} value={center.value}>
                {center.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('settings.default_imputation.default_cost_center_help')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="gl-button-sm gl-button-confirm"
          disabled={!isDirty || saveSetting.isPending}
          onClick={handleSave}
        >
          {saveSetting.isPending && <Loader2 size={12} className="animate-spin mr-1" />}
          {t('common.save')}
        </button>
        <button
          type="button"
          className="gl-button-sm gl-button-default"
          disabled={saveSetting.isPending}
          onClick={handleReset}
        >
          {t('settings.default_imputation.reset')}
        </button>
      </div>
    </div>
  )
}
