/**
 * Step 2 — Entity (tenant) info: name, address, currency, timezone.
 *
 * Pre-remplit depuis l'entite courante puis sauve via useUpdateEntity.
 * L'utilisateur est TOUJOURS rattache a une entite existante : il ne
 * peut donc pas la creer ni la "changer" depuis ce step — uniquement
 * editer ses infos (et seulement s'il a core.entity.update).
 *
 * Affiche un banner "Vous editez l'entite X" pour rappeler le contexte.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Loader2, Check, Lock, Info } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useEntity, useUpdateEntity } from '@/hooks/useEntities'
import { usePermission } from '@/hooks/usePermission'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'

export interface Step2Value {
  name: string
  address_line1: string
  city: string
  country: string
  currency: string
  timezone: string
}

interface Props {
  value: Step2Value
  onChange: (v: Partial<Step2Value>) => void
}

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'XOF', 'XAF', 'NGN', 'AED']
const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Madrid',
  'Africa/Lagos',
  'Africa/Casablanca',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'UTC',
]

export function Step2Entity({ value, onChange }: Props) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('core.entity.update')
  const currentEntityId = useAuthStore((s) => s.currentEntityId)
  const { data: entity } = useEntity(currentEntityId || undefined)
  const updateEntity = useUpdateEntity()
  const { toast } = useToast()
  const [savedOnce, setSavedOnce] = useState(false)

  useEffect(() => {
    if (entity && !value.name) {
      onChange({
        name: entity.name || '',
        address_line1: entity.address_line1 || '',
        city: entity.city || '',
        country: entity.country || '',
        currency: entity.currency || 'EUR',
        timezone: entity.timezone || 'Europe/Paris',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity])

  const handleSave = async () => {
    if (!currentEntityId) {
      toast({ title: t('onboarding.step2.error_no_entity'), variant: 'error' })
      return
    }
    if (!value.name.trim()) {
      toast({ title: t('onboarding.step2.error_required'), variant: 'error' })
      return
    }
    try {
      await updateEntity.mutateAsync({
        id: currentEntityId,
        payload: {
          name: value.name,
          address_line1: value.address_line1 || null,
          city: value.city || null,
          country: value.country || null,
          currency: value.currency,
          timezone: value.timezone,
        },
      })
      setSavedOnce(true)
    } catch {
      // Toast is handled by useUpdateEntity onError.
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Building2 size={16} className="text-primary" />
          {t('onboarding.step2.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t('onboarding.step2.subtitle')}</p>
      </div>

      {/* Banner contexte : rappelle l'utilisateur a quelle entite il est rattache.
          Pas possible de changer ici (rattachement gere via /entities admin). */}
      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs">
        <Info size={14} className="mt-0.5 shrink-0 text-info" />
        <div className="flex-1">
          <p className="text-foreground">
            {t('onboarding.step2.editing_entity', 'Vous êtes rattaché à l’entité')}{' '}
            <span className="font-semibold">{entity?.name ?? '—'}</span>
            {entity?.code && <span className="text-muted-foreground"> ({entity.code})</span>}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {canEdit
              ? t('onboarding.step2.editing_entity_hint', 'Vous pouvez compléter ses informations ci-dessous.')
              : t('onboarding.step2.readonly_hint', 'Vous n’avez pas la permission de modifier cette entité. Contactez votre administrateur.')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="gl-label-sm" htmlFor="ob-entity-name">
            {t('onboarding.step2.name')}
            <span className="text-destructive ml-0.5">*</span>
            {!canEdit && <Lock size={10} className="inline ml-1.5 text-muted-foreground" />}
          </label>
          <input
            id="ob-entity-name"
            className={panelInputClass}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('onboarding.step2.name_ph')}
            disabled={!canEdit}
            readOnly={!canEdit}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="gl-label-sm" htmlFor="ob-entity-address">
            {t('onboarding.step2.address')}
          </label>
          <input
            id="ob-entity-address"
            className={panelInputClass}
            value={value.address_line1}
            onChange={(e) => onChange({ address_line1: e.target.value })}
            placeholder={t('onboarding.step2.address_ph')}
            autoComplete="street-address"
          />
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-entity-city">
            {t('onboarding.step2.city')}
          </label>
          <input
            id="ob-entity-city"
            className={panelInputClass}
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            autoComplete="address-level2"
          />
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-entity-country">
            {t('onboarding.step2.country')}
          </label>
          <input
            id="ob-entity-country"
            className={panelInputClass}
            value={value.country}
            onChange={(e) => onChange({ country: e.target.value })}
            placeholder={t('onboarding.step2.country_ph')}
            autoComplete="country-name"
          />
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-entity-currency">
            {t('onboarding.step2.currency')}
          </label>
          <select
            id="ob-entity-currency"
            className={panelInputClass}
            value={value.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-entity-timezone">
            {t('onboarding.step2.timezone')}
          </label>
          <select
            id="ob-entity-timezone"
            className={panelInputClass}
            value={value.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={updateEntity.isPending}
          className="btn btn-sm btn-primary"
        >
          {updateEntity.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('onboarding.step2.save')}
        </button>
        {savedOnce && !updateEntity.isPending && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check size={12} />
            {t('onboarding.step2.saved')}
          </span>
        )}
      </div>
    </div>
  )
}
