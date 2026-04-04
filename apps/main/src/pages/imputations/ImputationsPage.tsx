/**
 * ImputationsPage — cost imputation management.
 *
 * Standard OpsFlux layout: PanelHeader + tab bar + PanelContent.
 * Tabs: Défaut (default imputations), Registre (references, templates, assignments).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Landmark, BookOpen, Settings2 } from 'lucide-react'
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
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={Landmark} title={t('imputations.page_title')} subtitle={t('nav.imputations')} />

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

        <PanelContent>
          {activeTab === 'default' && <DefaultTab />}
          {activeTab === 'registry' && <RegistryTab />}
        </PanelContent>
      </div>
    </div>
  )
}

// ── Default imputations tab ──────────────────────────────────────────────────

function DefaultTab() {
  const { t } = useTranslation()

  return (
    <div className="p-4 space-y-4">
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
    <div className="p-4 space-y-4">
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
