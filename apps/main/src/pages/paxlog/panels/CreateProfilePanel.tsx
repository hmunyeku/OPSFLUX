import { useTranslation } from 'react-i18next'
import { useCreatePaxProfile } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import { useState } from 'react'
import { useTiers } from '@/hooks/useTiers'
import { useUsers } from '@/hooks/useUsers'
import { normalizeNames } from '@/lib/normalize'
import { DynamicPanelShell, PanelActionButton, PanelContentLayout, FormSection, TagSelector, FormGrid, DynamicPanelField, panelInputClass } from '@/components/layout/DynamicPanel'
import { Users, Loader2, Building2, User } from 'lucide-react'
import { SearchablePicker } from '../shared'

export function CreateProfilePanel() {
  const { t } = useTranslation()
  const createProfile = useCreatePaxProfile()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const paxTypeOptions = useDictionaryOptions('pax_type')
  const paxTypeLabels = useDictionaryLabels('pax_type', { internal: t('paxlog.internal'), external: t('paxlog.external') })

  const [form, setForm] = useState({
    type: 'external' as 'internal' | 'external',
    first_name: '',
    last_name: '',
    birth_date: null as string | null,
    nationality: null as string | null,
    badge_number: null as string | null,
    company_id: null as string | null,
    user_id: null as string | null,
  })

  const [companySearch, setCompanySearch] = useState('')
  const { data: tiersData, isLoading: tiersLoading } = useTiers({
    page: 1, page_size: 20, search: companySearch || undefined,
  })

  const [userSearch, setUserSearch] = useState('')
  const { data: usersData, isLoading: usersLoading } = useUsers({
    page: 1, page_size: 20, search: userSearch || undefined, active: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createProfile.mutateAsync(normalizeNames({
      type: form.type,
      first_name: form.first_name,
      last_name: form.last_name,
      birth_date: form.birth_date || undefined,
      nationality: form.nationality || undefined,
      badge_number: form.badge_number || undefined,
      company_id: form.type === 'external' ? form.company_id || undefined : undefined,
      user_id: form.type === 'internal' ? form.user_id || undefined : undefined,
    }))
    closeDynamicPanel()
  }

  const handleUserSelect = (user: { id: string; first_name: string; last_name: string; email: string }) => {
    setForm({
      ...form,
      user_id: user.id,
      first_name: form.first_name || user.first_name,
      last_name: form.last_name || user.last_name,
    })
  }

  return (
    <DynamicPanelShell
      title={t('paxlog.profile_panel.create_title')}
      subtitle={t('paxlog.profile_panel.subtitle')}
      icon={<Users size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProfile.isPending}
            onClick={() => (document.getElementById('create-profile-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProfile.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-profile-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title={t('paxlog.profile_panel.sections.profile_type')}>
          <TagSelector
            options={paxTypeOptions}
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as 'internal' | 'external', company_id: null, user_id: null })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.type === 'internal'
              ? t('paxlog.profile_panel.type_help.internal')
              : t('paxlog.profile_panel.type_help.external')}
          </p>
          <p className="text-[10px] text-muted-foreground">{paxTypeLabels[form.type] || form.type}</p>
        </FormSection>

        {form.type === 'external' && (
          <FormSection title={t('tiers.title')}>
            <SearchablePicker
              label={t('paxlog.profile_panel.fields.company')}
              icon={<Building2 size={12} className="text-muted-foreground" />}
              items={tiersData?.items || []}
              isLoading={tiersLoading}
              searchValue={companySearch}
              onSearchChange={setCompanySearch}
              renderItem={(tier) => <><span className="font-semibold">{tier.code}</span> — {tier.name}</>}
              selectedId={form.company_id}
              onSelect={(tier) => setForm({ ...form, company_id: tier.id })}
              onClear={() => setForm({ ...form, company_id: null })}
              placeholder={t('paxlog.search_company')}
            />
          </FormSection>
        )}

        {form.type === 'internal' && (
          <FormSection title={t('paxlog.profile_panel.sections.user_account')}>
            <SearchablePicker
              label={t('paxlog.profile_panel.fields.user')}
              icon={<User size={12} className="text-muted-foreground" />}
              items={usersData?.items || []}
              isLoading={usersLoading}
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              renderItem={(u) => <>{u.first_name} {u.last_name} <span className="text-muted-foreground">({u.email})</span></>}
              selectedId={form.user_id}
              onSelect={handleUserSelect}
              onClear={() => setForm({ ...form, user_id: null })}
              placeholder={t('paxlog.search_user')}
            />
          </FormSection>
        )}

        <FormSection title={t('paxlog.profile_panel.sections.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.first_name')} required>
              <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.last_name')} required>
              <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('paxlog.profile_panel.sections.additional_info')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.birth_date')}>
              <input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.nationality')}>
              <input type="text" value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value || null })} className={panelInputClass} placeholder={t('paxlog.profile_panel.placeholders.nationality')} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.badge_number')}>
              <input type="text" value={form.badge_number || ''} onChange={(e) => setForm({ ...form, badge_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── PAX Profile Detail Panel ──────────────────────────────────

