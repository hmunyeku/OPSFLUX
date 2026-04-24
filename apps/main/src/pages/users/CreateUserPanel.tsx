/**
 * Panel used to create a new user — opened via the `+` button on
 * UsersPage. Pure form with its own submit handler; no props.
 *
 * Extracted from UsersPage.tsx. The `sendInvite` checkbox is local
 * state only for now — wiring it to the backend happens server-side
 * via a follow-up (the backend already sends the invite email when
 * the password is left blank, so this checkbox is informational).
 */
import { useMemo, useState } from 'react'
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
  SectionColumns,
  SectionHeader,
  TagSelector,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import type { UserCreate } from '@/types/api'

export function CreateUserPanel() {
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const { toast } = useToast()
  const { data: allEntitiesData } = useAllEntities({ page: 1, page_size: 200 })
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const dictLanguageOptions = useDictionaryOptions('language')
  const dictUserTypeOptions = useDictionaryOptions('user_type')
  const languageOptions = dictLanguageOptions
  const userTypeOptions = dictUserTypeOptions
  const [form, setForm] = useState<UserCreate & { account_expires_at?: string }>({
    email: '', first_name: '', last_name: '', password: '', language: 'fr',
  })
  const [sendInvite, setSendInvite] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { account_expires_at, password, ...rest } = form
      const payload = normalizeNames(rest) as UserCreate & { account_expires_at?: string }
      // Send null instead of empty string for optional password (min_length=8 validation)
      payload.password = password && password.length >= 8 ? password : undefined
      if (account_expires_at) payload.account_expires_at = account_expires_at
      await createUser.mutateAsync(payload as UserCreate)
      toast({ title: t('users.created_success'), variant: 'success' })
      closeDynamicPanel()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      const detail = e?.response?.data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? (detail as { msg: string }[]).map((d) => d.msg).join(', ')
          : t('common.error_generic')
      toast({ title: t('users.create_error'), description: msg, variant: 'error' })
    }
  }

  const entities = allEntitiesData?.items?.filter((e) => e.active) ?? []

  const createUserActionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'cancel',
      label: t('common.cancel'),
      icon: X,
      priority: 40,
      onClick: closeDynamicPanel,
    },
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
      actionItems={createUserActionItems}
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="p-4 space-y-0">
        <SectionColumns>
          {/* ── Column 1: Identité ── */}
          <div className="@container">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[160px]" />
                <col />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={2} className="pt-2 pb-1.5 px-3">
                    <SectionHeader><span className="flex items-center gap-1.5"><Users size={12} /> Identité</span></SectionHeader>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">
                    {t('users.last_name')} <span className="text-destructive">*</span>
                  </td>
                  <td className="py-2 px-3">
                    <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} placeholder="DUPONT" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">
                    {t('users.first_name')} <span className="text-destructive">*</span>
                  </td>
                  <td className="py-2 px-3">
                    <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} placeholder="Jean" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">
                    Email <span className="text-destructive">*</span>
                  </td>
                  <td className="py-2 px-3">
                    <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={panelInputClass} placeholder="alice.dupont@example.com" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">ID Intranet</td>
                  <td className="py-2 px-3">
                    <input type="text" value={form.intranet_id || ''} onChange={(e) => setForm({ ...form, intranet_id: e.target.value || undefined })} className={cn(panelInputClass, 'max-w-[200px]')} placeholder="EMP-001" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">{t('settings.language')}</td>
                  <td className="py-2 px-3">
                    <TagSelector options={languageOptions} value={form.language || 'fr'} onChange={(v) => setForm({ ...form, language: v })} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Column 2: Entité & Accès + Authentification ── */}
          <div className="@container">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[160px]" />
                <col />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={2} className="pt-2 pb-1.5 px-3">
                    <SectionHeader><span className="flex items-center gap-1.5"><Building2 size={12} /> Entité & Accès</span></SectionHeader>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Type</td>
                  <td className="py-2 px-3">
                    <TagSelector
                      options={userTypeOptions}
                      value={form.user_type || 'internal'}
                      onChange={(v) => setForm({ ...form, user_type: v })}
                    />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Entité par défaut</td>
                  <td className="py-2 px-3">
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
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Expiration</td>
                  <td className="py-2 px-3">
                    <input
                      type="date"
                      value={form.account_expires_at || ''}
                      onChange={(e) => setForm({ ...form, account_expires_at: e.target.value || undefined })}
                      className={cn(panelInputClass, 'max-w-[200px]')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Vide = pas d'expiration.</p>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Rôles & Groupes</td>
                  <td className="py-2 px-3">
                    <p className="text-xs text-muted-foreground italic">Configurable après création.</p>
                  </td>
                </tr>

                {/* ── Sub-section: Authentification ── */}
                <tr>
                  <td colSpan={2} className="pt-5 pb-1.5 px-3">
                    <SectionHeader><span className="flex items-center gap-1.5"><Shield size={12} /> Authentification</span></SectionHeader>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">{t('auth.password')}</td>
                  <td className="py-2 px-3">
                    <input
                      type="password"
                      minLength={8}
                      value={form.password || ''}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={panelInputClass}
                      placeholder={t('users.min_8_caracteres')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Vide = mot de passe temporaire auto-généré.</p>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Invitation</td>
                  <td className="py-2 px-3">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                      <div>
                        <span className="text-sm text-foreground group-hover:text-primary transition-colors">Envoyer un email d'invitation</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Lien pour définir son mot de passe.</p>
                      </div>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionColumns>
      </form>
    </DynamicPanelShell>
  )
}
