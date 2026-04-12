/**
 * PackLog Configuration tab — module-specific entity-level settings.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function PackLogConfigTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: settings, isLoading } = useScopedSettingsMap('entity')
  const mutation = useSaveScopedSetting('entity')

  const save = useCallback((key: string, value: unknown) => {
    mutation.mutate({ key, value }, {
      onSuccess: () => toast({ title: t('settings.toast.general.setting_saved'), variant: 'success' }),
      onError: () => toast({ title: t('settings.toast.error'), variant: 'error' }),
    })
  }, [mutation, toast])

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>

  const s = settings ?? {}
  const isCatalogGlobal = s['packlog.article_catalog_global'] === true || s['packlog.article_catalog_global'] === 'true'

  return (
    <CollapsibleSection
      id="packlog-catalog"
      title="Catalogue articles SAP"
      description="Comportement du catalogue d'articles SAP utilisé par PackLog (matching, recherche, import CSV)."
      storageKey="settings.packlog.catalog.collapse"
      showSeparator={false}
    >
      <div className="mt-2 space-y-0">
        <SettingRow
          label="Catalogue partagé entre toutes les entités"
          description={
            isCatalogGlobal
              ? "Activé — le catalogue SAP est unique pour toutes les entités du tenant. Tout import, création ou recherche concerne le même référentiel global."
              : "Désactivé (recommandé) — chaque entité possède son propre catalogue SAP. Les articles créés sans entité (import historique, données seed) restent visibles de toutes les entités comme fallback."
          }
        >
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              checked={isCatalogGlobal}
              onChange={(e) => save('packlog.article_catalog_global', e.target.checked)}
            />
            <span className="text-xs text-muted-foreground">{isCatalogGlobal ? 'Global' : 'Par entité'}</span>
          </label>
        </SettingRow>
      </div>
    </CollapsibleSection>
  )
}
