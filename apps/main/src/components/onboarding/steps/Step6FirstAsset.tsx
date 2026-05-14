/**
 * Step 6 — Create the first site/installation.
 *
 * The Asset Registry hierarchy is Field > Site > Installation. To keep
 * onboarding short we let the admin enter just a name + site type +
 * country, then create a parent "Field" with sensible defaults and the
 * Site underneath. The admin can refine everything later from the
 * Assets page.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Loader2, Check, Upload } from 'lucide-react'
import { useCreateField, useCreateSite } from '@/hooks/useAssetRegistry'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { ImportWizard } from '@/components/shared/ImportWizard'

export interface Step6Value {
  name: string
  site_type: string
  country: string
}

interface Props {
  value: Step6Value
  onChange: (v: Partial<Step6Value>) => void
}

const SITE_TYPES = [
  { v: 'ONSHORE', label: 'site_type_onshore' },
  { v: 'OFFSHORE_FIXED', label: 'site_type_offshore_fixed' },
  { v: 'OFFSHORE_FLOATING', label: 'site_type_offshore_floating' },
  { v: 'SUBSEA', label: 'site_type_subsea' },
  { v: 'TERMINAL', label: 'site_type_terminal' },
  { v: 'PIPELINE', label: 'site_type_pipeline' },
] as const

function slugCode(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12) || 'SITE'
}

export function Step6FirstAsset({ value, onChange }: Props) {
  const { t } = useTranslation()
  const createField = useCreateField()
  const createSite = useCreateSite()
  const { toast } = useToast()
  const [createdSiteId, setCreatedSiteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [importTarget, setImportTarget] = useState<'ar_field' | 'ar_site' | 'ar_installation' | 'ar_equipment'>('ar_site')

  const handleCreate = async () => {
    if (!value.name.trim() || !value.country.trim()) {
      toast({ title: t('onboarding.step6.error_required'), variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const code = slugCode(value.name)
      // Create the parent Field with sensible defaults — the admin can
      // edit this in the Assets module later.
      const field = await createField.mutateAsync({
        code: `FLD-${code}`,
        name: `${value.name} (Field)`,
        country: value.country,
        status: 'OPERATIONAL',
        access_road: false,
      } as Parameters<typeof createField.mutateAsync>[0])
      const site = await createSite.mutateAsync({
        field_id: field.id,
        code: `STE-${code}`,
        name: value.name,
        site_type: value.site_type,
        environment: value.site_type === 'ONSHORE' ? 'ONSHORE' : 'OFFSHORE',
        country: value.country,
        access_road: value.site_type === 'ONSHORE',
        access_helicopter: value.site_type !== 'ONSHORE',
        access_vessel: value.site_type !== 'ONSHORE',
        helideck_available: false,
        manned: true,
        status: 'OPERATIONAL',
      } as Parameters<typeof createSite.mutateAsync>[0])
      setCreatedSiteId(site.id)
      toast({ title: t('onboarding.step6.created'), description: site.code, variant: 'success' })
    } catch {
      toast({ title: t('common.failed'), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const isCreated = createdSiteId !== null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          {t('onboarding.step6.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t('onboarding.step6.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="gl-label-sm" htmlFor="ob-asset-name">
            {t('onboarding.step6.name')}
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <input
            id="ob-asset-name"
            className={panelInputClass}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('onboarding.step6.name_ph')}
            disabled={isCreated}
          />
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-asset-type">
            {t('onboarding.step6.site_type')}
          </label>
          <select
            id="ob-asset-type"
            className={panelInputClass}
            value={value.site_type}
            onChange={(e) => onChange({ site_type: e.target.value })}
            disabled={isCreated}
          >
            {SITE_TYPES.map((opt) => (
              <option key={opt.v} value={opt.v}>
                {t(`onboarding.step6.${opt.label}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-asset-country">
            {t('onboarding.step6.country')}
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <input
            id="ob-asset-country"
            className={panelInputClass}
            value={value.country}
            onChange={(e) => onChange({ country: e.target.value })}
            placeholder={t('onboarding.step6.country_ph')}
            disabled={isCreated}
            autoComplete="country-name"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={busy || isCreated}
          className="btn btn-sm btn-primary"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {isCreated ? t('onboarding.step6.created_short') : t('onboarding.step6.create')}
        </button>
        {isCreated && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check size={12} />
            {t('onboarding.step6.saved')}
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">{t('onboarding.step6.hint')}</p>

      {/* Alternative: import en masse via wizard CSV/XLSX, par niveau */}
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Upload size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                {t('onboarding.step6.bulk_title', 'Plusieurs sites/équipements à créer ?')}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t('onboarding.step6.bulk_hint', 'Importez votre hiérarchie depuis un fichier CSV ou Excel.')}
              </p>
            </div>
          </div>
          <select
            value={importTarget}
            onChange={(e) => setImportTarget(e.target.value as typeof importTarget)}
            className="gl-form-input text-xs h-7 px-1.5 shrink-0"
          >
            <option value="ar_field">{t('onboarding.step6.bulk_level_field', 'Champs')}</option>
            <option value="ar_site">{t('onboarding.step6.bulk_level_site', 'Sites')}</option>
            <option value="ar_installation">{t('onboarding.step6.bulk_level_installation', 'Installations')}</option>
            <option value="ar_equipment">{t('onboarding.step6.bulk_level_equipment', 'Équipements')}</option>
          </select>
          <button
            type="button"
            onClick={() => setShowImportWizard(true)}
            className="btn btn-sm btn-secondary shrink-0"
          >
            <Upload size={12} />
            {t('onboarding.step6.bulk_btn', 'Importer en masse')}
          </button>
        </div>
      </div>

      <ImportWizard
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        targetObject={importTarget}
        onImportComplete={() => {
          setShowImportWizard(false)
          toast({ title: t('onboarding.step6.bulk_imported', 'Actifs importés avec succès'), variant: 'success' })
        }}
      />
    </div>
  )
}
