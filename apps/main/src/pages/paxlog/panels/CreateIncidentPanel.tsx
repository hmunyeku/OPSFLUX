import { useTranslation } from 'react-i18next'
import { useCreatePaxIncident, usePaxProfiles, usePaxGroups } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useState } from 'react'
import { useTiers } from '@/hooks/useTiers'
import { DynamicPanelShell, PanelActionButton, PanelContentLayout, FormSection, TagSelector, DynamicPanelField, panelInputClass } from '@/components/layout/DynamicPanel'
import { AlertTriangle, Loader2, User, Building2, Users } from 'lucide-react'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { RichTextField } from '@/components/shared/RichTextField'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useStagingRef } from '@/hooks/useStagingRef'
import { SearchablePicker } from '../shared'

export function CreateIncidentPanel() {
  const { t } = useTranslation()
  const createIncident = useCreatePaxIncident()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const severityOptions = useDictionaryOptions('pax_incident_severity')
  const [targetScope, setTargetScope] = useState<'pax' | 'company' | 'group'>('pax')
  const { stagingRef, stagingOwnerType } = useStagingRef('pax_incident')

  const [paxSearch, setPaxSearch] = useState('')
  const { data: paxData, isLoading: paxLoading } = usePaxProfiles({ page: 1, page_size: 20, search: paxSearch || undefined })
  const [companySearch, setCompanySearch] = useState('')
  const { data: tiersData, isLoading: tiersLoading } = useTiers({ page: 1, page_size: 20, search: companySearch || undefined })
  const [groupSearch, setGroupSearch] = useState('')

  const [form, setForm] = useState<{
    severity: 'info' | 'warning' | 'site_ban' | 'temp_ban' | 'permanent_ban'
    description: string
    incident_date: string
    user_id: string | null
    contact_id: string | null
    company_id: string | null
    pax_group_id: string | null
    pax_display: string | null
    company_display: string | null
    group_display: string | null
    asset_id: string | null
    ban_start_date: string | null
    ban_end_date: string | null
  }>({
    severity: 'warning',
    description: '',
    incident_date: new Date().toISOString().split('T')[0],
    user_id: null,
    contact_id: null,
    company_id: null,
    pax_group_id: null,
    pax_display: null,
    company_display: null,
    group_display: null,
    asset_id: null,
    ban_start_date: null,
    ban_end_date: null,
  })
  const { data: groupData, isLoading: groupLoading } = usePaxGroups({
    page: 1,
    page_size: 20,
    search: groupSearch || undefined,
    company_id: targetScope === 'group' ? form.company_id || undefined : undefined,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createIncident.mutateAsync({
      severity: form.severity,
      description: form.description,
      incident_date: form.incident_date,
      user_id: targetScope === 'pax' ? form.user_id || null : null,
      contact_id: targetScope === 'pax' ? form.contact_id || null : null,
      company_id: targetScope === 'company' ? form.company_id || null : null,
      pax_group_id: targetScope === 'group' ? form.pax_group_id || null : null,
      asset_id: form.asset_id || null,
      ban_start_date: form.ban_start_date || null,
      ban_end_date: form.ban_end_date || null,
      staging_ref: stagingRef,
    })
    closeDynamicPanel()
  }

  const showBanDates = form.severity === 'temp_ban' || form.severity === 'permanent_ban'
  const showAssetTarget = form.severity === 'site_ban'

  return (
    <DynamicPanelShell
      title={t('paxlog.incident_panel.create_title')}
      subtitle={t('paxlog.incident_panel.subtitle')}
      icon={<AlertTriangle size={14} className="text-destructive" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createIncident.isPending}
            onClick={() => (document.getElementById('create-incident-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createIncident.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-incident-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title={t('paxlog.incident_panel.sections.severity')}>
          <TagSelector
            options={severityOptions}
            value={form.severity}
            onChange={(v) => setForm({ ...form, severity: v as typeof form.severity })}
          />
        </FormSection>

        <FormSection title={t('paxlog.incident_panel.sections.concerned_pax')}>
          <TagSelector
            options={[
              { value: 'pax', label: t('paxlog.incident_panel.target_scope.pax') },
              { value: 'company', label: t('paxlog.incident_panel.target_scope.company') },
              { value: 'group', label: t('paxlog.incident_panel.target_scope.group') },
            ]}
            value={targetScope}
            onChange={(v) => {
              const next = v as 'pax' | 'company' | 'group'
              setTargetScope(next)
              setForm((prev) => ({
                ...prev,
                user_id: null,
                contact_id: null,
                company_id: next === 'company' ? prev.company_id : prev.company_id,
                pax_group_id: null,
                pax_display: null,
                company_display: next === 'pax' ? null : prev.company_display,
                group_display: null,
              }))
            }}
          />

          {targetScope === 'pax' && (
            <SearchablePicker
              label={t('paxlog.incident_panel.fields.pax_profile')}
              icon={<User size={12} className="text-muted-foreground" />}
              items={paxData?.items || []}
              isLoading={paxLoading}
              searchValue={paxSearch}
              onSearchChange={setPaxSearch}
              renderItem={(p) => <>{p.last_name} {p.first_name} {p.company_name ? <span className="text-muted-foreground">— {p.company_name}</span> : ''}</>}
              selectedId={form.user_id || form.contact_id}
              onSelect={(p) => {
                const isUser = p.pax_source === 'user' || p.pax_type === 'internal'
                setForm({
                  ...form,
                  user_id: isUser ? p.id : null,
                  contact_id: isUser ? null : p.id,
                  company_id: null,
                  pax_group_id: null,
                  pax_display: `${p.last_name} ${p.first_name}`,
                  company_display: null,
                  group_display: null,
                })
              }}
              onClear={() => setForm({ ...form, user_id: null, contact_id: null, pax_display: null })}
              placeholder={t('paxlog.incident_panel.placeholders.search_pax')}
            />
          )}

          {targetScope === 'company' && (
            <SearchablePicker
              label={t('paxlog.incident_panel.fields.company')}
              icon={<Building2 size={12} className="text-muted-foreground" />}
              items={tiersData?.items || []}
              isLoading={tiersLoading}
              searchValue={companySearch}
              onSearchChange={setCompanySearch}
              renderItem={(tier) => <>{tier.name}</>}
              selectedId={form.company_id}
              onSelect={(tier) => setForm({
                ...form,
                user_id: null,
                contact_id: null,
                company_id: tier.id,
                pax_group_id: null,
                pax_display: null,
                company_display: tier.name,
                group_display: null,
              })}
              onClear={() => setForm({ ...form, company_id: null, company_display: null })}
              placeholder={t('paxlog.incident_panel.placeholders.search_company')}
            />
          )}

          {targetScope === 'group' && (
            <div className="space-y-3">
              <SearchablePicker
                label={t('paxlog.incident_panel.fields.company_filter')}
                icon={<Building2 size={12} className="text-muted-foreground" />}
                items={tiersData?.items || []}
                isLoading={tiersLoading}
                searchValue={companySearch}
                onSearchChange={setCompanySearch}
                renderItem={(tier) => <>{tier.name}</>}
                selectedId={form.company_id}
                onSelect={(tier) => setForm({ ...form, company_id: tier.id, company_display: tier.name, pax_group_id: null, group_display: null })}
                onClear={() => setForm({ ...form, company_id: null, company_display: null, pax_group_id: null, group_display: null })}
                placeholder={t('paxlog.incident_panel.placeholders.search_company')}
              />
              <SearchablePicker
                label={t('paxlog.incident_panel.fields.pax_group')}
                icon={<Users size={12} className="text-muted-foreground" />}
                items={groupData?.items || []}
                isLoading={groupLoading}
                searchValue={groupSearch}
                onSearchChange={setGroupSearch}
                renderItem={(group) => <>{group.name}{group.company_name ? <span className="text-muted-foreground"> — {group.company_name}</span> : ''}</>}
                selectedId={form.pax_group_id}
                onSelect={(group) => setForm({
                  ...form,
                  user_id: null,
                  contact_id: null,
                  company_id: group.company_id || form.company_id,
                  pax_group_id: group.id,
                  pax_display: null,
                  company_display: group.company_name || form.company_display,
                  group_display: group.name,
                })}
                onClear={() => setForm({ ...form, pax_group_id: null, group_display: null })}
                placeholder={t('paxlog.incident_panel.placeholders.search_group')}
              />
            </div>
          )}
        </FormSection>

        <FormSection title={t('paxlog.incident_panel.sections.details')}>
          <DynamicPanelField label={t('paxlog.incident_panel.fields.incident_date')} required>
            <input type="date" required value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
          {showAssetTarget && (
            <DynamicPanelField label={t('paxlog.incident_panel.fields.asset')} required>
              <AssetPicker
                value={form.asset_id}
                onChange={(id) => setForm({ ...form, asset_id: id || null })}
              />
            </DynamicPanelField>
          )}
          <DynamicPanelField label={t('common.description')} required>
            <RichTextField
              value={form.description}
              onChange={(html) => setForm({ ...form, description: html })}
              rows={4}
              placeholder={t('paxlog.incident_panel.placeholders.description') as string}
              imageOwnerType={stagingOwnerType}
              imageOwnerId={stagingRef}
            />
          </DynamicPanelField>
        </FormSection>

        {showBanDates && (
          <FormSection title={t('paxlog.incident_panel.sections.ban_period')}>
            {form.severity === 'temp_ban' ? (
              <DateRangePicker
                startDate={form.ban_start_date || null}
                endDate={form.ban_end_date || null}
                onStartChange={(v) => setForm({ ...form, ban_start_date: v || null })}
                onEndChange={(v) => setForm({ ...form, ban_end_date: v || null })}
                startLabel={t('paxlog.incident_panel.fields.ban_start')}
                endLabel={t('paxlog.incident_panel.fields.ban_end')}
              />
            ) : (
              <DynamicPanelField label={t('paxlog.incident_panel.fields.ban_start')}>
                <input type="date" value={form.ban_start_date || ''} onChange={(e) => setForm({ ...form, ban_start_date: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
            )}
          </FormSection>
        )}

        <FormSection title={t('common.attachments')} collapsible defaultExpanded={false}>
          <AttachmentManager
            ownerType={stagingOwnerType}
            ownerId={stagingRef}
            compact
          />
        </FormSection>

        <FormSection title={t('common.notes')} collapsible defaultExpanded={false}>
          <NoteManager
            ownerType={stagingOwnerType}
            ownerId={stagingRef}
            compact
          />
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── Create Rotation Panel ─────────────────────────────────────

