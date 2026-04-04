import { Link } from 'react-router-dom'
import { ArrowRightLeft, Landmark, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ImputationAdminSection } from '@/components/shared/ImputationAdminSection'
import { DefaultImputationSettingEditor } from '@/components/shared/DefaultImputationSettingEditor'

export function ImputationsPage() {
  const { t } = useTranslation()

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('nav.imputations')}
            </span>
            <h1 className="text-2xl font-semibold text-foreground">
              {t('imputations.page_title')}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t('imputations.page_description')}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Link
              to="/assets"
              className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <Landmark className="mt-0.5 h-4 w-4 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{t('imputations.asset_link_title')}</div>
                <div className="text-xs text-muted-foreground">{t('imputations.asset_link_description')}</div>
              </div>
            </Link>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-4">
              <ArrowRightLeft className="mt-0.5 h-4 w-4 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{t('imputations.assignment_priority_title')}</div>
                <div className="text-xs text-muted-foreground">{t('imputations.assignment_priority_description')}</div>
              </div>
            </div>
          </div>
        </header>

        <CollapsibleSection
          id="imputation-default-entity"
          title={t('settings.default_imputation.entity_section_title')}
          description={t('settings.default_imputation.entity_section_description')}
          storageKey="imputations.page.collapse"
        >
          <div className="mt-2">
            <DefaultImputationSettingEditor
              scope="entity"
              title={t('settings.default_imputation.entity_card_title')}
              description={t('settings.default_imputation.entity_card_description')}
              hint={t('settings.default_imputation.entity_card_hint')}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="imputations-registry"
          title={t('settings.imputations.section_title')}
          description={t('settings.imputations.section_description')}
          storageKey="imputations.page.collapse"
          showSeparator={false}
        >
          <div className="mt-2">
            <ImputationAdminSection />
          </div>
        </CollapsibleSection>

        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <Settings2 className="h-4 w-4" />
            {t('imputations.settings_hint_title')}
          </div>
          <p>{t('imputations.settings_hint_description')}</p>
        </div>
      </div>
    </div>
  )
}
