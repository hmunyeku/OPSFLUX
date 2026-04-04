/**
 * ImputationsPage — cost imputation management.
 *
 * Standard OpsFlux layout: PanelHeader + tab bar + content.
 * Tabs: Défaut (default imputations), Registre (references, templates, assignments).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Landmark, ArrowRightLeft, BookOpen, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ImputationAdminSection } from '@/components/shared/ImputationAdminSection'
import { DefaultImputationSettingEditor } from '@/components/shared/DefaultImputationSettingEditor'

const TABS = [
  { id: 'default', labelKey: 'imputations.tab_default', icon: Settings2 },
  { id: 'registry', labelKey: 'imputations.tab_registry', icon: BookOpen },
] as const

type TabId = (typeof TABS)[number]['id']

export function ImputationsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('default')

  return (
    <div className="flex h-full flex-col min-w-0 overflow-hidden">
      <PanelHeader
        icon={Landmark}
        title={t('imputations.page_title')}
        subtitle={t('nav.imputations')}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-3.5 h-9 shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-primary/[0.16] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <Icon size={12} />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      <PanelContent className="p-4">
        {activeTab === 'default' && <DefaultTab />}
        {activeTab === 'registry' && <RegistryTab />}
      </PanelContent>
    </div>
  )
}

// ── Default imputations tab ──────────────────────────────────────────────────

function DefaultTab() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Info box */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/30 p-4">
        <ArrowRightLeft size={16} className="text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {t('imputations.assignment_priority_title')}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('imputations.assignment_priority_description')}
          </p>
        </div>
      </div>

      <CollapsibleSection
        id="imputation-default-entity"
        title={t('settings.default_imputation.entity_section_title')}
        description={t('settings.default_imputation.entity_section_description')}
        storageKey="imputations.page.default.collapse"
        showSeparator={false}
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
    </div>
  )
}

// ── Registry tab ─────────────────────────────────────────────────────────────

function RegistryTab() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4 max-w-5xl">
      <CollapsibleSection
        id="imputations-registry"
        title={t('settings.imputations.section_title')}
        description={t('settings.imputations.section_description')}
        storageKey="imputations.page.registry.collapse"
        showSeparator={false}
      >
        <div className="mt-2">
          <ImputationAdminSection />
        </div>
      </CollapsibleSection>
    </div>
  )
}
