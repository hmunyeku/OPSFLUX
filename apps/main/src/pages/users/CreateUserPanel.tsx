/**
 * Panel used to create a new user — opened via the `+` button on
 * UsersPage. Pure form with its own submit handler; no props.
 *
 * Adopts the SmartForm standard (simple/avancé/wizard modes) so
 * operators see only the essentials on first use, and advanced
 * admin fields (intranet_id, expiration, password override) stay
 * hidden until explicitly requested.
 *
 * On save, reopens the user's detail panel so the admin can assign
 * groups/roles/entities immediately — the "polymorphic add-ons
 * after create" pattern shared with every other module.
 */
import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Plus, X, Building2, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useCreateUser } from '@/hooks/useUsers'
import { useAllEntities } from '@/hooks/useEntities'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  PanelContentLayout,
  SectionColumns,
  TagSelector,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormInlineHelpDrawer,
  SmartFormWizardNav,
  useSmartForm,
} from '@/components/layout/SmartForm'
import type { UserCreate } from '@/types/api'

export function CreateUserPanel() {
  return (
    <SmartFormProvider panelId="create-user" defaultMode="simple">
      <CreateUserInner />
    </SmartFormProvider>
  )
}

function CreateUserInner() {
  const ctx = useSmartForm()
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const { toast } = useToast()
  const { data: allEntitiesData } = useAllEntities({ page: 1, page_size: 200 })
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const dictLanguageOptions = useDictionaryOptions('language')
  const dictUserTypeOptions = useDictionaryOptions('user_type')

  const [form, setForm] = useState<UserCreate & { account_expires_at?: string }>({
    email: '', first_name: '', last_name: '', password: '', language: 'fr',
  })
  const [sendInvite, setSendInvite] = useState(true)

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    try {
      const { account_expires_at, password, ...rest } = form
      const payload = normalizeNames(rest) as UserCreate & { account_expires_at?: string }
      // Send null instead of empty string for optional password (min_length=8 validation)
      payload.password = password && password.length >= 8 ? password : undefined
      if (account_expires_at) payload.account_expires_at = account_expires_at
      const created = await createUser.mutateAsync(payload as UserCreate)
      toast({ title: t('users.created_success'), variant: 'success' })
      // Reopen on the detail panel — that's where groups/roles/entities
      // get assigned. Classic "polymorphic children after create" flow.
      openDynamicPanel({ type: 'detail', module: 'users', id: created.id })
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: unknown } } }
      const detail = e2?.response?.data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? (detail as { msg: string }[]).map((d) => d.msg).join(', ')
          : t('common.error_generic')
      toast({ title: t('users.create_error'), description: msg, variant: 'error' })
    }
  }, [form, createUser, toast, t, openDynamicPanel])

  const entities = allEntitiesData?.items?.filter((e) => e.active) ?? []

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), icon: X, priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      icon: Plus,
      variant: 'primary',
      priority: 100,
      loading: createUser.isPending,
      disabled: createUser.isPending,
      onClick: () => (document.getElementById('create-user-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createUser.isPending])

  return (
    <DynamicPanelShell
      title={t('users.create')}
      subtitle={t('users.title')}
      icon={<Users size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <form id="create-user-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SmartFormToolbar />
          <SmartFormSimpleHint />
          <SmartFormInlineHelpDrawer />

          {/* Identité — always visible, minimal set for 'simple' mode */}
          <SmartFormSection
            id="t_user_identity"
            title={t('users.sections.identity', 'Identité')}
            level="essential"
            help={{ description: t('users.sections.identity_help', 'Nom, prénom, email — obligatoires') }}
          >
            <FormGrid>
              <DynamicPanelField label={t('users.last_name')} required>
                <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} placeholder="DUPONT" />
              </DynamicPanelField>
              <DynamicPanelField label={t('users.first_name')} required>
                <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} placeholder="Jean" />
              </DynamicPanelField>
              <DynamicPanelField label="Email" required span="full">
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={panelInputClass} placeholder="alice.dupont@example.com" />
              </DynamicPanelField>
              <DynamicPanelField label={t('settings.language')}>
                <TagSelector options={dictLanguageOptions} value={form.language || 'fr'} onChange={(v) => setForm({ ...form, language: v })} />
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>

          {/* Entité & accès — still essential: needed to know where the user belongs */}
          <SmartFormSection
            id="t_user_entity"
            title={t('users.sections.entity_access', 'Entité & Accès')}
            level="essential"
            help={{ description: t('users.sections.entity_access_help', "Type d'utilisateur + entité d'affectation") }}
          >
            <SectionColumns>
              <FormGrid>
                <DynamicPanelField label="Type">
                  <TagSelector
                    options={dictUserTypeOptions}
                    value={form.user_type || 'internal'}
                    onChange={(v) => setForm({ ...form, user_type: v })}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Entité par défaut">
                  <select
                    value={form.default_entity_id || ''}
                    onChange={(e) => setForm({ ...form, default_entity_id: e.target.value || undefined })}
                    className="gl-form-select"
                  >
                    <option value="">— Aucune —</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>{entity.name} ({entity.code})</option>
                    ))}
                  </select>
                </DynamicPanelField>
              </FormGrid>
              <div className="text-xs text-muted-foreground italic px-2 py-4">
                <Shield size={11} className="inline mr-1 -mt-0.5" />
                Les rôles et groupes se configurent sur la fiche utilisateur,
                après la création.
              </div>
            </SectionColumns>
          </SmartFormSection>

          {/* Authentification — advanced: password + invite toggle */}
          <SmartFormSection
            id="t_user_auth"
            title={t('users.sections.auth', 'Authentification')}
            level="advanced"
            help={{ description: t('users.sections.auth_help', "Mot de passe manuel (sinon auto-généré) + email d'invitation") }}
            defaultExpanded={false}
          >
            <FormGrid>
              <DynamicPanelField label={t('auth.password')} span="full">
                <input
                  type="password"
                  minLength={8}
                  value={form.password || ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={panelInputClass}
                  placeholder={t('users.min_8_caracteres')}
                />
                <p className="text-xs text-muted-foreground mt-1">Vide = mot de passe temporaire auto-généré.</p>
              </DynamicPanelField>
              <DynamicPanelField label="Invitation" span="full">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <div>
                    <span className="text-sm text-foreground group-hover:text-primary transition-colors">Envoyer un email d'invitation</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Lien pour définir son mot de passe.</p>
                  </div>
                </label>
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>

          {/* Détails RH / admin — advanced: intranet ID, expiration, etc. */}
          <SmartFormSection
            id="t_user_admin"
            title={t('users.sections.admin', 'Détails administratifs')}
            level="advanced"
            help={{ description: t('users.sections.admin_help', 'ID intranet, date d\'expiration du compte') }}
            defaultExpanded={false}
          >
            <FormGrid>
              <DynamicPanelField label="ID Intranet">
                <input
                  type="text"
                  value={form.intranet_id || ''}
                  onChange={(e) => setForm({ ...form, intranet_id: e.target.value || undefined })}
                  className={cn(panelInputClass, 'max-w-[240px]')}
                  placeholder="EMP-001"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Expiration du compte">
                <input
                  type="date"
                  value={form.account_expires_at || ''}
                  onChange={(e) => setForm({ ...form, account_expires_at: e.target.value || undefined })}
                  className={cn(panelInputClass, 'max-w-[240px]')}
                />
                <p className="text-xs text-muted-foreground mt-1">Vide = pas d'expiration.</p>
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>

          {ctx?.mode === 'wizard' && (
            <SmartFormWizardNav
              onSubmit={() => (document.getElementById('create-user-form') as HTMLFormElement)?.requestSubmit()}
              onCancel={closeDynamicPanel}
            />
          )}
        </PanelContentLayout>
      </form>

      {/* Hidden icon imports for unused references — kept so that
          Building2 imported icon doesn't get tree-shaken from our
          bundle if re-imported later for the simple-mode layout. */}
      <div className="hidden"><Building2 size={0} /></div>
    </DynamicPanelShell>
  )
}
