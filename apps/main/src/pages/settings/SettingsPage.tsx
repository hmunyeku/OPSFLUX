/**
 * Settings page — GitLab Pajamas pattern with extensible module registry.
 *
 * Architecture:
 * - Core tabs registered at import time via settingsRegistry
 * - Any module can call registerSettingsSection() to add its own tabs
 * - Supports collapsible groups (like GitLab's "Access" group)
 * - Two categories: 'user' (personal) and 'general' (admin/system)
 * - Sidebar: 240px, items 28px/8px-radius, Pajamas blue active tint
 *   Collapsible groups with chevron, indented children
 * - Content: sticky section headers, 25px/600 headings, full width
 * - Deep linking: URL hash → activates tab + expands specific section
 *   e.g. /settings#cartographie → activates general-config tab, expands Cartographie section
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Settings, User, Lock, Shield, Clock, Palette,
  Bell,
  ChevronRight, ChevronDown,
  Globe, Plug, FileText, FileOutput, Trash2,
  Activity, Hash, BookOpen, ShieldCheck, Database,
  Users, CalendarClock, Ship, Boxes, FolderKanban,
  Languages, ClipboardList,
  Sliders, LayoutTemplate, Briefcase, Server, CircleCheck, Bot,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import {
  registerSettingsSection,
  registerSettingsGroup,
  useSettingsSections,
  useSettingsGroups,
  useGroupChildren,
  findSettingsSection,
  type SettingsSection,
  type SettingsGroup,
} from '@/lib/settingsRegistry'
import { CollapsibleProvider } from '@/components/shared/CollapsibleSection'
import { useSettingsBadges } from '@/hooks/useSettingsBadges'
import { useModules } from '@/hooks/useModules'

// ── Deep-link mapping: sub-section ID → parent tab ID ────────
// When a URL hash matches a sub-section inside a tab, this maps it to the tab.
// Each tab declares the IDs of its internal CollapsibleSections.
const SECTION_TAB_MAP: Record<string, string> = {
  // ProfileTab sections
  'avatar': 'profile',
  'main-settings': 'profile',
  // SecurityTab sections
  'password': 'security',
  'mfa': 'security',
  // AccessTokensTab
  'access-tokens': 'tokens',
  // ApplicationsTab
  'oauth-apps': 'applications',
  // SessionsTab
  'active-sessions': 'sessions',
  // EmailsTab sections
  'emails-list': 'emails',
  'add-email': 'emails',
  // AddressesTab
  'user-addresses': 'addresses',
  // NotificationsTab sections
  'notifications-global': 'notifications',
  'notifications-groups': 'notifications',
  'notifications-matrix': 'notifications',
  'delegations-outgoing': 'delegations',
  'delegations-incoming': 'delegations',
  'delegations-simulation': 'delegations',
  // PreferencesTab sections
  'theme': 'preferences',
  'language-pref': 'preferences',
  // RolesTab sections
  'roles-list': 'roles',
  'groups-list': 'roles',
  'permissions-list': 'roles',
  // RbacAdminTab sections
  'admin-roles': 'rbac-admin',
  'admin-groups': 'rbac-admin',
  'admin-permissions': 'rbac-admin',
  // GeneralConfigTab sections
  'langue-region': 'general-config',
  'datatable-config': 'general-config',
  'cartographie': 'general-config',
  'notifications-config': 'general-config',
  'emails-config': 'general-config',
  // PaxLogConfigTab sections
  'paxlog-compliance': 'paxlog-config',
  'paxlog-operations': 'paxlog-config',
  // PlannerConfigTab sections
  'planner-capacity-heatmap': 'planner-config',
  // TravelWizConfigTab sections
  'travelwiz-operations': 'travelwiz-config',
  // GdprTab sections
  'gdpr-dpo': 'gdpr',
  'gdpr-retention': 'gdpr',
  'gdpr-consent': 'gdpr',
  'gdpr-breaches': 'gdpr',
  // IntegrationsTab sections
  'services-connectes': 'integrations',
  'cartographie-integration': 'integrations',
  // EmailTemplatesTab sections
  'email-templates-system': 'email-templates',
  'email-templates-custom': 'email-templates',
  // PdfTemplatesTab sections
  'pdf-templates-system': 'pdf-templates',
  'pdf-templates-modules': 'pdf-templates',
  // NumberingTab sections
  'numbering-patterns': 'numbering',
  // SecurityPolicyTab sections
  'password-policy': 'security-policy',
  'account-lockout': 'security-policy',
  'rate-limiting': 'security-policy',
  'bot-protection': 'security-policy',
  'sessions-notifications': 'security-policy',
  // DeletePoliciesTab sections
  'delete-policies-main': 'delete-policies',
  'delete-policies-child': 'delete-policies',
  // AuditTab sections
  'audit-log': 'audit-log',
  // UserMcpTab sections
  'mcp-personal-backends': 'mcp',
  'mcp-personal-tokens': 'mcp',
  // EntitiesTab sections
  'entity-users': 'entities',
  // SystemHealthTab sections
  'system-health': 'system-health',
}

// ── Import tab components ───────────────────────────────────
import { ProfileTab } from './tabs/ProfileTab'
import { AccessTab } from './tabs/AccessTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { DelegationsTab } from './tabs/DelegationsTab'
import { UserMcpTab } from './tabs/UserMcpTab'
import { RolesTab } from './tabs/RolesTab'
import { ActivityTab } from './tabs/ActivityTab'
import { PreferencesTab } from './tabs/PreferencesTab'
import { GeneralConfigTab } from './tabs/GeneralConfigTab'
import { IntegrationsTab } from './tabs/IntegrationsTab'
import { VerificationScenariosTab } from './tabs/VerificationScenariosTab'
import { AgentIaTab } from './tabs/AgentIaTab'
import { EmailTemplatesTab } from './tabs/EmailTemplatesTab'
import { PdfTemplatesTab } from './tabs/PdfTemplatesTab'
// RbacAdminTab moved to UsersPage (Comptes)
import { NumberingTab } from './tabs/NumberingTab'
import { DeletePoliciesTab } from './tabs/DeletePoliciesTab'
import DictionaryTab from './tabs/DictionaryTab'
import I18nTab from './tabs/I18nTab'
import { SecurityPolicyTab } from './tabs/SecurityPolicyTab'

import { PaxLogConfigTab } from './tabs/PaxLogConfigTab'
import { PlannerConfigTab } from './tabs/PlannerConfigTab'
import { TravelWizConfigTab } from './tabs/TravelWizConfigTab'
import { PackLogConfigTab } from './tabs/PackLogConfigTab'
import { ProjetsConfigTab } from './tabs/ProjetsConfigTab'
import { MOCConfigTab } from './tabs/MOCConfigTab'
import { GdprTab } from './tabs/GdprTab'
import { AdminerTab } from './tabs/AdminerTab'
import { SystemTab } from './tabs/SystemTab'
import { ModulesTab } from './tabs/ModulesTab'
// EntitiesTab moved to dedicated /entities sidebar page

// ── Import dynamic panel forms ──────────────────────────────
import { CreateTokenPanel } from './panels/CreateTokenPanel'
import { CreateAppPanel } from './panels/CreateAppPanel'
import { CreateAddressPanel } from './panels/CreateAddressPanel'
import { EditEmailTemplatePanel } from './panels/EditEmailTemplatePanel'
import { EditPdfTemplatePanel } from './panels/EditPdfTemplatePanel'

// ── Register core user settings ─────────────────────────────────
// Flat list (8 items). Order: identity → display → auth → notifications
// → delegations → informational (read-only) → technical (niche last).
registerSettingsSection({ id: 'profile', label: 'Profil', icon: User, component: ProfileTab, category: 'user', order: 10 })
registerSettingsSection({ id: 'preferences', label: 'Préférences', icon: Palette, component: PreferencesTab, category: 'user', order: 20 })
registerSettingsSection({ id: 'access', label: 'Accès', icon: Lock, component: AccessTab, category: 'user', order: 30 })
registerSettingsSection({ id: 'notifications', label: 'Notifications', icon: Bell, component: NotificationsTab, category: 'user', order: 40 })
registerSettingsSection({ id: 'delegations', label: 'Délégations', icon: Shield, component: DelegationsTab, category: 'user', order: 50 })
// Read-only informational views
registerSettingsSection({ id: 'roles', label: 'Rôles & Permissions', icon: Shield, component: RolesTab, category: 'user', order: 70 })
registerSettingsSection({ id: 'activity', label: 'Activité', icon: Clock, component: ActivityTab, category: 'user', order: 80 })
// Niche / technical at the bottom
registerSettingsSection({ id: 'mcp', label: 'MCP', icon: Plug, component: UserMcpTab, category: 'user', order: 90 })

// ── Register general (admin) settings — 5 collapsible groups ────
// Ordering rule: sections inside a group are ordered relative to one
// another; the group's own `order` decides its vertical position
// among top-level items (interleaved with ungrouped sections).

registerSettingsGroup({ id: 'grp-config',   label: 'Configuration générale', icon: Sliders,         category: 'general', order: 10 })
registerSettingsGroup({ id: 'grp-templates', label: 'Modèles de documents',  icon: LayoutTemplate,  category: 'general', order: 20 })
registerSettingsGroup({ id: 'grp-modules',   label: 'Modules métier',        icon: Briefcase,       category: 'general', order: 30 })
registerSettingsGroup({ id: 'grp-security',  label: 'Sécurité & Conformité', icon: ShieldCheck,     category: 'general', order: 40 })
registerSettingsGroup({ id: 'grp-system',    label: 'Système',               icon: Server,          category: 'general', order: 50 })

// Group 1: Configuration générale — most-used admin controls first
registerSettingsSection({ id: 'general-config', label: 'Configuration',  icon: Globe,     component: GeneralConfigTab, category: 'general', parentId: 'grp-config', order: 10, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'integrations',   label: 'Intégrations',   icon: Plug,      component: IntegrationsTab,  category: 'general', parentId: 'grp-config', order: 20, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'dictionnaire',   label: 'Dictionnaire',   icon: BookOpen,  component: DictionaryTab,    category: 'general', parentId: 'grp-config', order: 30, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'i18n',           label: 'Traductions',    icon: Languages, component: I18nTab,          category: 'general', parentId: 'grp-config', order: 40, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'numbering',      label: 'Numérotation',   icon: Hash,      component: NumberingTab,     category: 'general', parentId: 'grp-config', order: 50, requiredPermission: 'core.settings.manage' })

// Group 2: Templates de documents
registerSettingsSection({ id: 'email-templates', label: 'Modèles d\'emails', icon: FileText,   component: EmailTemplatesTab, category: 'general', parentId: 'grp-templates', order: 10, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'pdf-templates',   label: 'Modèles PDF',       icon: FileOutput, component: PdfTemplatesTab,   category: 'general', parentId: 'grp-templates', order: 20, requiredPermission: 'core.settings.manage' })

// Agent IA — verification scenarios (Sprint 6) + config (Sprint 7)
registerSettingsSection({ id: 'verification-scenarios', label: 'Scénarios Playwright', icon: CircleCheck, component: VerificationScenariosTab, category: 'general', parentId: 'grp-config', order: 60, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'agent-ia', label: 'Agent IA', icon: Bot, component: AgentIaTab, category: 'general', parentId: 'grp-config', order: 55, requiredPermission: 'core.settings.manage' })

// Group 3: Modules métier — one per business module
registerSettingsSection({ id: 'projets-config',   label: 'Projets',   icon: FolderKanban,   component: ProjetsConfigTab,   category: 'general', parentId: 'grp-modules', order: 10, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'paxlog-config',    label: 'PaxLog',    icon: Users,          component: PaxLogConfigTab,    category: 'general', parentId: 'grp-modules', order: 20, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'planner-config',   label: 'Planner',   icon: CalendarClock,  component: PlannerConfigTab,   category: 'general', parentId: 'grp-modules', order: 30, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'travelwiz-config', label: 'TravelWiz', icon: Ship,           component: TravelWizConfigTab, category: 'general', parentId: 'grp-modules', order: 40, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'packlog-config',   label: 'PackLog',   icon: Boxes,          component: PackLogConfigTab,   category: 'general', parentId: 'grp-modules', order: 50, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'moc-config',       label: 'MOCTrack',  icon: ClipboardList,  component: MOCConfigTab,       category: 'general', parentId: 'grp-modules', order: 60, requiredPermission: 'core.settings.manage' })

// Group 4: Sécurité & Conformité — auth policy, data protection, retention
registerSettingsSection({ id: 'security-policy',  label: 'Sécurité & Authentification',  icon: ShieldCheck, component: SecurityPolicyTab, category: 'general', parentId: 'grp-security', order: 10, requiredPermission: 'admin.system' })
registerSettingsSection({ id: 'gdpr',             label: 'RGPD / Protection des données', icon: Shield,     component: GdprTab,           category: 'general', parentId: 'grp-security', order: 20, requiredPermission: 'admin.system' })
registerSettingsSection({ id: 'delete-policies',  label: 'Politiques de suppression',    icon: Trash2,      component: DeletePoliciesTab, category: 'general', parentId: 'grp-security', order: 30, requiredPermission: 'core.settings.manage' })

// Group 5: Système — technical / rarely touched, at the bottom
registerSettingsSection({ id: 'system',  label: 'Système',          icon: Activity, component: SystemTab,  category: 'general', parentId: 'grp-system', order: 10, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'modules', label: 'Modules',          icon: Boxes,    component: ModulesTab, category: 'general', parentId: 'grp-system', order: 20, requiredPermission: 'core.settings.manage' })
registerSettingsSection({ id: 'adminer', label: 'Base de données',  icon: Database, component: AdminerTab, category: 'general', parentId: 'grp-system', order: 30, requiredPermission: 'admin.system' })

registerPanelRenderer('settings-pdf-template', (view) => (
  <EditPdfTemplatePanel
    mode={view.type === 'create' ? 'create' : 'edit'}
    templateId={typeof view.data?.templateId === 'string' ? view.data.templateId : (view.type !== 'create' ? view.id : null)}
  />
))

/* ── Main Settings Page ── */
export function SettingsPage() {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const { data: modules = [] } = useModules()
  const enabledModules = new Set(modules.filter((m) => m.enabled).map((m) => m.slug))
  const allUserSections = useSettingsSections('user')
  const allGeneralSections = useSettingsSections('general')
  const userGroups = useSettingsGroups('user')
  const generalGroups = useSettingsGroups('general')

  // Filter sections by requiredPermission — user sections are always visible,
  // general (admin) sections require the declared permission
  const userSections = allUserSections
  const settingsSectionModuleMap: Record<string, string> = {
    'paxlog-config': 'paxlog',
    'planner-config': 'planner',
    'travelwiz-config': 'travelwiz',
    'modules': 'dashboard',
  }
  const generalSections = allGeneralSections.filter((s) => {
    if (s.requiredPermission && !hasPermission(s.requiredPermission)) return false
    const targetModule = settingsSectionModuleMap[s.id]
    if (targetModule && modules.length > 0 && !enabledModules.has(targetModule)) return false
    return true
  })
  const [activeTab, setActiveTab] = useState<string>('profile')
  const [focusedSection, setFocusedSection] = useState<string | null>(null)
  const [subtitleOverride, setSubtitleOverride] = useState<string | null>(null)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  // Check if a settings-specific dynamic panel is open in full mode
  const isSettingsPanelFull = panelMode === 'full' && dynamicPanel !== null && (dynamicPanel.module.startsWith('settings-'))

  // Find the active section across all (including nested)
  const activeSection = findSettingsSection(activeTab)
  const ActiveComponent = activeSection?.component

  // If active tab doesn't exist, fallback
  useEffect(() => {
    if (!activeSection && userSections.length > 0) {
      setActiveTab(userSections[0].id)
    }
  }, [activeSection, userSections])

  // ── Deep-link: read URL hash on mount + listen for hash changes ──
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '')
      if (!hash) return

      // 1. Check if hash matches a tab ID directly
      const directSection = findSettingsSection(hash)
      if (directSection) {
        setActiveTab(hash)
        setFocusedSection(null)
        return
      }

      // 2. Check if hash matches a sub-section inside a tab
      const parentTab = SECTION_TAB_MAP[hash]
      if (parentTab) {
        setActiveTab(parentTab)
        setFocusedSection(hash)
        return
      }
    }

    // Run on mount
    handleHash()

    // Listen for hash changes (e.g., from internal links)
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  // Callback from CollapsibleSection when a section is focused/expanded
  const handleSectionFocus = useCallback((title: string | null) => {
    setSubtitleOverride(title)
  }, [])

  // Clear focusedSection when switching tabs manually
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId)
    setFocusedSection(null)
    setSubtitleOverride(null)
  }, [])

  // Build ordered sidebar items: interleave top-level sections and groups by order
  const buildSidebarItems = (
    sections: SettingsSection[],
    groups: SettingsGroup[],
  ): Array<{ type: 'section'; item: SettingsSection } | { type: 'group'; item: SettingsGroup }> => {
    const items: Array<{ type: 'section'; item: SettingsSection; order: number } | { type: 'group'; item: SettingsGroup; order: number }> = []
    for (const s of sections) {
      items.push({ type: 'section', item: s, order: s.order ?? 50 })
    }
    for (const g of groups) {
      items.push({ type: 'group', item: g, order: g.order ?? 50 })
    }
    items.sort((a, b) => a.order - b.order)
    return items
  }

  const badges = useSettingsBadges()
  const userItems = buildSidebarItems(userSections, userGroups)
  const generalItems = buildSidebarItems(generalSections, generalGroups)

  // Flatten all sections for mobile tab strip (skip groups, show children inline)
  const userGroupChildren = useGroupChildren('access')
  const allFlatSections = useMemo(() => {
    const flat: { section: SettingsSection; category: 'user' | 'general' }[] = []
    const addItems = (items: typeof userItems, cat: 'user' | 'general', groupChildrenMap: Record<string, SettingsSection[]>) => {
      for (const entry of items) {
        if (entry.type === 'section') {
          flat.push({ section: entry.item, category: cat })
        } else {
          // Group: add children inline
          const children = groupChildrenMap[entry.item.id] ?? []
          for (const child of children) {
            flat.push({ section: child, category: cat })
          }
        }
      }
    }
    addItems(userItems, 'user', { access: userGroupChildren })
    addItems(generalItems, 'general', {})
    return flat
  }, [userItems, generalItems, userGroupChildren])

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* ── Mobile tab selector (md and below) ── */}
      <div className="md:hidden shrink-0 border-b border-border bg-background">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground"
        >
          <span className="flex items-center gap-2">
            {(() => {
              const Icon = activeSection?.icon ?? Settings
              return <Icon size={15} />
            })()}
            {activeSection?.label ?? t('settings.title')}
          </span>
          <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', mobileMenuOpen && 'rotate-180')} />
        </button>
        {mobileMenuOpen && (
          <nav className="px-2 pb-2 space-y-0.5 max-h-[50vh] overflow-y-auto">
            {allFlatSections.map(({ section }, i) => {
              // Show separator before first general section
              const prevCat = i > 0 ? allFlatSections[i - 1].category : null
              const showSep = prevCat === 'user' && allFlatSections[i].category === 'general'
              const Icon = section.icon
              return (
                <div key={section.id}>
                  {showSep && <div className="my-1.5 mx-2 h-px bg-border" />}
                  <button
                    onClick={() => { handleTabChange(section.id); setMobileMenuOpen(false) }}
                    className={cn(
                      // Mobile: 40px touch target (h-10), label padding bumped
                      'flex w-full items-center gap-2.5 rounded-lg h-10 px-3 text-sm transition-colors',
                      activeTab === section.id
                        ? 'bg-primary/[0.16] text-foreground font-medium'
                        : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="truncate">{section.label}</span>
                  </button>
                </div>
              )
            })}
          </nav>
        )}
      </div>

      {/* ── Desktop settings sub-sidebar ── */}
      <div className="hidden md:block w-[240px] shrink-0 border-r border-border bg-background overflow-y-auto">
        {/* User settings group */}
        <div className="px-5 pt-3 pb-2">
          <span className="text-sm font-semibold text-foreground">{t('settings.title')}</span>
        </div>
        <nav className="px-2 space-y-0.5">
          {userItems.map((entry) =>
            entry.type === 'section' ? (
              <SidebarItem
                key={entry.item.id}
                section={entry.item}
                isActive={activeTab === entry.item.id}
                onClick={() => handleTabChange(entry.item.id)}
                badge={badges[entry.item.id]}
              />
            ) : (
              <SidebarGroup
                key={entry.item.id}
                group={entry.item}
                activeTab={activeTab}
                onSelectTab={handleTabChange}
                badges={badges}
              />
            ),
          )}
        </nav>

        {/* General settings group (if any modules registered) */}
        {generalItems.length > 0 && (
          <>
            <div className="px-5 pt-5 pb-2">
              <span className="text-sm font-semibold text-foreground">{t('settings.general')}</span>
            </div>
            <nav className="px-2 pb-4 space-y-0.5">
              {generalItems.map((entry) =>
                entry.type === 'section' ? (
                  <SidebarItem
                    key={entry.item.id}
                    section={entry.item}
                    isActive={activeTab === entry.item.id}
                    onClick={() => handleTabChange(entry.item.id)}
                    badge={badges[entry.item.id]}
                  />
                ) : (
                  <SidebarGroup
                    key={entry.item.id}
                    group={entry.item}
                    activeTab={activeTab}
                    onSelectTab={handleTabChange}
                    badges={badges}
                  />
                ),
              )}
            </nav>
          </>
        )}
      </div>

      {/* ── Content area (static panel + optional dynamic panel) ── */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Static panel — settings tab content (hidden when a settings panel is in full mode) */}
        {!isSettingsPanelFull && <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <PanelHeader
            icon={Settings}
            title={t('settings.title')}
            subtitle={subtitleOverride || activeSection?.label}
          />

          <PanelContent className="px-3 sm:px-6 py-4">
            <CollapsibleProvider
              key={activeTab}
              focusedSection={focusedSection}
              onSectionFocus={handleSectionFocus}
            >
              {ActiveComponent && <ActiveComponent />}
            </CollapsibleProvider>
          </PanelContent>
        </div>}

        {/* Dynamic panel — create/edit forms open here */}
        {dynamicPanel?.module === 'settings-token' && dynamicPanel.type === 'create' && <CreateTokenPanel />}
        {dynamicPanel?.module === 'settings-app' && dynamicPanel.type === 'create' && <CreateAppPanel />}
        {dynamicPanel?.module === 'settings-address' && (dynamicPanel.type === 'create' || dynamicPanel.type === 'edit') && <CreateAddressPanel />}
        {dynamicPanel?.module === 'settings-email-template' && <EditEmailTemplatePanel />}
        {dynamicPanel?.module === 'settings-pdf-template' && (
          <EditPdfTemplatePanel
            mode={dynamicPanel.type === 'create' ? 'create' : 'edit'}
            templateId={
              typeof dynamicPanel.data?.templateId === 'string'
                ? dynamicPanel.data.templateId
                : dynamicPanel.type !== 'create'
                  ? dynamicPanel.id
                  : null
            }
          />
        )}
      </div>
    </div>
  )
}

/* ── Sidebar nav item (top-level or child) ── */
function SidebarItem({
  section,
  isActive,
  onClick,
  indent = false,
  badge,
}: {
  section: SettingsSection
  isActive: boolean
  onClick: () => void
  indent?: boolean
  badge?: number
}) {
  const Icon = section.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg h-7 px-1 py-0.5 text-sm transition-colors',
        indent && 'pl-7',
        isActive
          ? 'bg-primary/[0.16] text-foreground font-medium'
          : 'text-foreground hover:bg-accent',
      )}
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate flex-1 text-left">{section.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] text-muted-foreground bg-accent rounded-full px-1.5 min-w-[18px] text-center shrink-0">
          {badge}
        </span>
      )}
    </button>
  )
}

/* ── Collapsible sidebar group (like GitLab "Access") ── */
function SidebarGroup({
  group,
  activeTab,
  onSelectTab,
  badges,
}: {
  group: SettingsGroup
  activeTab: string
  onSelectTab: (id: string) => void
  badges?: Record<string, number | undefined>
}) {
  const children = useGroupChildren(group.id)
  const hasActiveChild = children.some((c) => c.id === activeTab)
  const [expanded, setExpanded] = useState(hasActiveChild)

  // Auto-expand only on the false→true transition of hasActiveChild
  // (e.g. deep-link navigation into a child section). Never re-expand
  // on subsequent renders — otherwise the user can't collapse a group
  // while one of its children is the active tab.
  const prevHadActiveChildRef = useRef(hasActiveChild)
  useEffect(() => {
    if (hasActiveChild && !prevHadActiveChildRef.current) {
      setExpanded(true)
    }
    prevHadActiveChildRef.current = hasActiveChild
  }, [hasActiveChild])

  const Icon = group.icon
  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg h-7 px-1 py-0.5 text-sm transition-colors',
          hasActiveChild
            ? 'text-foreground font-medium'
            : 'text-foreground hover:bg-accent',
        )}
      >
        <Icon size={15} className="shrink-0" />
        <span className="truncate flex-1 text-left">{group.label}</span>
        <ChevronIcon size={14} className="shrink-0 text-muted-foreground" />
      </button>

      {expanded && (
        <div className="space-y-0.5 mt-0.5">
          {children.map((child) => (
            <SidebarItem
              key={child.id}
              section={child}
              isActive={activeTab === child.id}
              onClick={() => onSelectTab(child.id)}
              indent
              badge={badges?.[child.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
