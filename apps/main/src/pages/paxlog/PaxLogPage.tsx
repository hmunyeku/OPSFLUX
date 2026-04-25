/**
 * PaxLog page — PAX management, Avis de Sejour, Credentials, Compliance,
 * Signalements, Rotations.
 *
 * Thin orchestrator: tab routing + dynamic panel dispatch.
 * Tabs live in ./tabs, panels in ./panels, shared helpers in ./shared.
 */
import { useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, Plus } from 'lucide-react'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import { PageNavBar } from '@/components/ui/Tabs'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { usePermission } from '@/hooks/usePermission'

import { ALL_TABS } from './shared'
import type { MainTabId } from './shared'

import { RequesterHomeTab } from './tabs/RequesterHomeTab'
import { ValidatorHomeTab } from './tabs/ValidatorHomeTab'
import { AdsTab } from './tabs/AdsTab'
import { WaitlistTab } from './tabs/WaitlistTab'
import { ProfilesTab } from './tabs/ProfilesTab'
import { ComplianceTab } from './tabs/ComplianceTab'
import { SignalementsTab } from './tabs/SignalementsTab'
import { RotationsTab } from './tabs/RotationsTab'
import { AvmTab } from './tabs/AvmTab'

import { CreateProfilePanel } from './panels/CreateProfilePanel'
import { ProfileDetailPanel } from './panels/ProfileDetailPanel'
import { CreateAdsPanel } from './panels/CreateAdsPanel'
import { AdsDetailPanel } from './panels/AdsDetailPanel'
import { CreateIncidentPanel } from './panels/CreateIncidentPanel'
import { CreateRotationPanel } from './panels/CreateRotationPanel'
import { CreateAvmPanel } from './panels/CreateAvmPanel'
import { AvmDetailPanel } from './panels/AvmDetailPanel'

import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
const VALID_PAXLOG_TABS = new Set<MainTabId>(['dashboard', 'ads', 'waitlist', 'profiles', 'compliance', 'signalements', 'rotations', 'avm'])

export function PaxLogPage() {
  useOpenDetailFromPath({ matchers: [{ prefix: '/paxlog/ads/', module: 'paxlog', meta: { subtype: 'ads' } }, { prefix: '/paxlog/avm/', module: 'paxlog', meta: { subtype: 'avm' } }, { prefix: '/paxlog/profiles/', module: 'paxlog', meta: { subtype: 'profile' } }] })
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as MainTabId | null
  const [activeTab, setActiveTabRaw] = useState<MainTabId>(
    tabFromUrl && VALID_PAXLOG_TABS.has(tabFromUrl) ? tabFromUrl : 'dashboard',
  )
  const setActiveTab = useCallback((tab: MainTabId) => {
    setActiveTabRaw(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }, [setSearchParams])
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const { hasPermission, hasAny } = usePermission()

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'paxlog'
  const isAdmin = hasPermission('*') || hasPermission('admin.system')
  const isRequesterProfile = !isAdmin && hasAny(['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.avm.create', 'paxlog.avm.update']) &&
    !hasAny(['paxlog.profile.read', 'paxlog.compliance.read', 'paxlog.rotation.manage', 'paxlog.profile_type.manage', 'paxlog.credtype.manage'])
  const isValidatorProfile = !isAdmin && !isRequesterProfile && hasAny(['paxlog.ads.approve', 'paxlog.compliance.read', 'paxlog.avm.approve', 'paxlog.avm.complete'])

  const visibleTabs = useMemo(() => {
    const tabs = ALL_TABS.filter((tab) => {
      if (tab.id === 'dashboard') return true
      if (tab.id === 'ads') return hasAny(['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.update', 'paxlog.ads.approve'])
      if (tab.id === 'waitlist') return hasPermission('paxlog.ads.approve')
      if (tab.id === 'avm') return hasAny(['paxlog.avm.create', 'paxlog.avm.update', 'paxlog.avm.approve', 'paxlog.avm.complete'])
      if (tab.id === 'profiles') return hasPermission('paxlog.profile.read')
      if (tab.id === 'compliance') return hasPermission('paxlog.compliance.read')
      if (tab.id === 'signalements') return hasPermission('paxlog.incident.read')
      if (tab.id === 'rotations') return hasPermission('paxlog.rotation.manage')
      return false
    })
    return tabs.length ? tabs : ALL_TABS.filter((tab) => tab.id === 'dashboard')
  }, [hasAny, hasPermission])

  const effectiveTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : visibleTabs[0].id

  const handleCreate = useCallback(() => {
    if (effectiveTab === 'profiles') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'profile' } })
    else if (effectiveTab === 'ads') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'ads' } })
    else if (effectiveTab === 'signalements') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'incident' } })
    else if (effectiveTab === 'rotations') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'rotation' } })
    else if (effectiveTab === 'avm') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'avm' } })
  }, [effectiveTab, openDynamicPanel])

  const handleOpenDetail = useCallback((id: string, meta?: Record<string, unknown>) => {
    if (effectiveTab === 'profiles') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'profile', ...(meta || {}) } })
    else if (effectiveTab === 'ads') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })
    else if (effectiveTab === 'avm') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })
  }, [effectiveTab, openDynamicPanel])

  const createLabel = effectiveTab === 'profiles' ? t('paxlog.actions.new_profile')
    : effectiveTab === 'ads' ? t('paxlog.new_ads')
    : effectiveTab === 'signalements' ? t('paxlog.actions.new_signalement')
    : effectiveTab === 'rotations' ? t('paxlog.actions.new_rotation')
    : effectiveTab === 'avm' ? t('paxlog.new_avm')
    : ''
  const showCreate = ['profiles', 'ads', 'signalements', 'rotations', 'avm'].includes(effectiveTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Users} title={t('paxlog.title')} subtitle={t('paxlog.subtitle')}>
            {showCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          <PageNavBar
            items={visibleTabs.map((tab) => ({
              id: tab.id,
              label: t(tab.labelKey),
              icon: tab.icon,
            }))}
            activeId={effectiveTab}
            onTabChange={(id) => setActiveTab(id as typeof effectiveTab)}
            rightSlot={effectiveTab === 'dashboard' && !isRequesterProfile && !isValidatorProfile ? <div id="dash-toolbar-paxlog" /> : null}
          />

          {effectiveTab === 'dashboard' && (
            isRequesterProfile
              ? <RequesterHomeTab onCreateAds={() => openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'ads' } })} onCreateAvm={() => openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'avm' } })} onOpenAds={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })} onOpenAvm={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })} />
              : isValidatorProfile
                ? <ValidatorHomeTab onOpenAds={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })} onOpenAvm={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })} />
                : <ModuleDashboard module="paxlog" toolbarPortalId="dash-toolbar-paxlog" />
          )}
          {effectiveTab === 'ads' && <AdsTab openDetail={handleOpenDetail} requesterOnly={isRequesterProfile} validatorOnly={isValidatorProfile} />}
          {effectiveTab === 'waitlist' && <WaitlistTab openDetail={handleOpenDetail} />}
          {effectiveTab === 'profiles' && <ProfilesTab openDetail={handleOpenDetail} />}
          {effectiveTab === 'compliance' && <ComplianceTab />}
          {effectiveTab === 'signalements' && <SignalementsTab />}
          {effectiveTab === 'rotations' && <RotationsTab />}
          {effectiveTab === 'avm' && <AvmTab openDetail={handleOpenDetail} requesterOnly={isRequesterProfile} validatorOnly={isValidatorProfile} />}
        </div>
      )}

      {/* Dynamic panels */}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'profile' && <CreateProfilePanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'ads' && <CreateAdsPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'incident' && <CreateIncidentPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rotation' && <CreateRotationPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'avm' && <CreateAvmPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'profile' && <ProfileDetailPanel id={dynamicPanel.id} paxSource={(dynamicPanel.meta?.pax_source as 'user' | 'contact') || 'user'} adsId={dynamicPanel.meta?.from_ads_id as string | undefined} />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'ads' && <AdsDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'avm' && <AvmDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Panel renderer registration ───────────────────────────────
registerPanelRenderer('paxlog', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'profile') return <CreateProfilePanel />
    if (view.meta?.subtype === 'ads') return <CreateAdsPanel />
    if (view.meta?.subtype === 'incident') return <CreateIncidentPanel />
    if (view.meta?.subtype === 'rotation') return <CreateRotationPanel />
    if (view.meta?.subtype === 'avm') return <CreateAvmPanel />
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'profile') return <ProfileDetailPanel id={view.id} paxSource={(view.meta?.pax_source as 'user' | 'contact') || 'user'} adsId={view.meta?.from_ads_id as string | undefined} />
    if (view.meta?.subtype === 'ads') return <AdsDetailPanel id={view.id} />
    if (view.meta?.subtype === 'avm') return <AvmDetailPanel id={view.id} />
  }
  return null
})
