/**
 * Step 5 — Create the very first business partner (Tier).
 *
 * Minimal form: name + type + email. Code is auto-generated server-side
 * via the TIR numbering pattern.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, Loader2, Check } from 'lucide-react'
import { useCreateTier } from '@/hooks/useTiers'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'

export interface Step5Value {
  name: string
  type: string
  email: string
}

interface Props {
  value: Step5Value
  onChange: (v: Partial<Step5Value>) => void
}

const TIER_TYPES = [
  { v: 'customer', label: 'tier_type_customer' },
  { v: 'supplier', label: 'tier_type_supplier' },
  { v: 'partner', label: 'tier_type_partner' },
  { v: 'subcontractor', label: 'tier_type_subcontractor' },
  { v: 'other', label: 'tier_type_other' },
] as const

export function Step5FirstTier({ value, onChange }: Props) {
  const { t } = useTranslation()
  const createTier = useCreateTier()
  const { toast } = useToast()
  const [createdId, setCreatedId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!value.name.trim()) {
      toast({ title: t('onboarding.step5.error_required'), variant: 'error' })
      return
    }
    try {
      const res = await createTier.mutateAsync({
        name: value.name,
        type: value.type,
        email: value.email || null,
      })
      setCreatedId(res.id)
      toast({ title: t('onboarding.step5.created'), description: res.code, variant: 'success' })
    } catch {
      toast({ title: t('common.failed'), variant: 'error' })
    }
  }

  const isCreated = createdId !== null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Briefcase size={16} className="text-primary" />
          {t('onboarding.step5.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t('onboarding.step5.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="gl-label-sm" htmlFor="ob-tier-name">
            {t('onboarding.step5.name')}
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <input
            id="ob-tier-name"
            className={panelInputClass}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('onboarding.step5.name_ph')}
            disabled={isCreated}
          />
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-tier-type">
            {t('onboarding.step5.type')}
          </label>
          <select
            id="ob-tier-type"
            className={panelInputClass}
            value={value.type}
            onChange={(e) => onChange({ type: e.target.value })}
            disabled={isCreated}
          >
            {TIER_TYPES.map((opt) => (
              <option key={opt.v} value={opt.v}>
                {t(`onboarding.step5.${opt.label}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-tier-email">
            {t('onboarding.step5.email')}
          </label>
          <input
            id="ob-tier-email"
            type="email"
            className={panelInputClass}
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder={t('onboarding.step5.email_ph')}
            disabled={isCreated}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={createTier.isPending || isCreated}
          className="btn btn-sm btn-primary"
        >
          {createTier.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {isCreated ? t('onboarding.step5.created_short') : t('onboarding.step5.create')}
        </button>
        {isCreated && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check size={12} />
            {t('onboarding.step5.saved')}
          </span>
        )}
      </div>
    </div>
  )
}
