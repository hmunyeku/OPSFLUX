import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { usePaxProfile, useUpdatePaxProfile, usePaxCredentials, usePaxProfileSitePresenceHistory, useCredentialTypes } from '@/hooks/usePaxlog'
import { useComplianceRecords } from '@/hooks/useConformite'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useCallback, useMemo } from 'react'
import { normalizeNames } from '@/lib/normalize'
import type { CredentialType, PaxCredential, PaxSitePresence } from '@/services/paxlogService'
import { DynamicPanelShell, PanelActionButton, FormSection, PanelContentLayout, DangerConfirmButton, InlineEditableRow, ReadOnlyRow, SectionColumns } from '@/components/layout/DynamicPanel'
import { Users, Loader2, Plus, User, ArrowLeft, Trash2, Building2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { formatDate, StatusBadge } from '../shared'

export function ProfileDetailPanel({ id, paxSource, adsId }: { id: string; paxSource: 'user' | 'contact'; adsId?: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: profile, isLoading, isError, error } = usePaxProfile(id, paxSource)
  const updateProfile = useUpdatePaxProfile()
  const { data: credentials } = usePaxCredentials(id)
  const { data: complianceRecordsData } = useComplianceRecords({ owner_type: profile?.pax_source === 'contact' ? 'tier_contact' : 'user', owner_id: profile?.entity_id || undefined, page: 1, page_size: 50 })
  const { data: sitePresenceHistory } = usePaxProfileSitePresenceHistory(id, profile?.pax_source)
  const { data: credentialTypes } = useCredentialTypes()
  const paxTypeLabels = useDictionaryLabels('pax_type', { internal: t('paxlog.internal'), external: t('paxlog.external') })

  const handleSave = useCallback((field: string, value: string) => {
    updateProfile.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateProfile])

  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  if (isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (isError || !profile) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('common.error')
    return (
      <DynamicPanelShell title={t('paxlog.profile_panel.not_found_title')} icon={<Users size={14} className="text-primary" />}>
        <div className="py-10 px-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{t('paxlog.profile_panel.not_found_message')}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </DynamicPanelShell>
    )
  }

  const profileOwnerType = profile.pax_source === 'contact' ? 'tier_contact' : 'user'
  const profileOwnerId = profile.entity_id
  const complianceRecords = complianceRecordsData?.items ?? []

  return (
    <DynamicPanelShell
      title={`${profile.first_name} ${profile.last_name}`}
      subtitle={profile.badge_number || profile.pax_type}
      icon={<User size={14} className="text-primary" />}
      actions={
        <>
          {adsId && (
            <PanelActionButton
              onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: adsId, meta: { subtype: 'ads' } })}
            >
              <ArrowLeft size={12} /> {t('paxlog.profile_panel.back_to_ads')}
            </PanelActionButton>
          )}
          <DangerConfirmButton
            icon={<Trash2 size={12} />}
            onConfirm={() => { updateProfile.mutate({ id, payload: { status: 'archived' } }); closeDynamicPanel() }}
            confirmLabel={t('paxlog.profile_panel.archive_confirm')}
          >
            {t('common.archive')}
          </DangerConfirmButton>
        </>
      }
    >
      <PanelContentLayout>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={profile.active ? 'active' : 'inactive'} />
          <span className={cn('gl-badge', profile.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {paxTypeLabels[profile.pax_type] || profile.pax_type}
          </span>
        </div>

        {profile.company_name && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <Building2 size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              {profile.company_id ? (
                <CrossModuleLink module="tiers" id={profile.company_id} label={profile.company_name} showIcon={false} className="text-xs font-medium text-foreground truncate block" />
              ) : (
                <p className="text-xs font-medium text-foreground truncate">{profile.company_name}</p>
              )}
              <p className="text-[10px] text-muted-foreground">{t('paxlog.profile_panel.linked_company')}</p>
            </div>
          </div>
        )}
        {profile.email && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <User size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{profile.email}</p>
              <p className="text-[10px] text-muted-foreground">{t('paxlog.profile_panel.linked_user')}</p>
            </div>
          </div>
        )}
        {profile.pax_source === 'contact' && profile.linked_user_id && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <User size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <CrossModuleLink
                module="users"
                id={profile.linked_user_id}
                label={profile.linked_user_email || t('paxlog.profile_panel.external_user')}
                showIcon={false}
                className="text-xs font-medium text-foreground truncate block"
              />
              <p className="text-[10px] text-muted-foreground">
                {profile.linked_user_active === false
                  ? t('paxlog.profile_panel.promoted_external_user_inactive')
                  : t('paxlog.profile_panel.promoted_external_user')}
              </p>
            </div>
          </div>
        )}

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title={t('paxlog.profile_panel.sections.identity')}>
              <InlineEditableRow label={t('paxlog.profile_panel.fields.first_name')} value={profile.first_name} onSave={(v) => handleSave('first_name', v)} />
              <InlineEditableRow label={t('paxlog.profile_panel.fields.last_name')} value={profile.last_name} onSave={(v) => handleSave('last_name', v)} />
              <ReadOnlyRow label={t('paxlog.profile_panel.fields.birth_date')} value={formatDate(profile.birth_date)} />
              <InlineEditableRow label={t('paxlog.profile_panel.fields.nationality')} value={profile.nationality || ''} onSave={(v) => handleSave('nationality', v)} />
              <InlineEditableRow label={t('paxlog.profile_panel.fields.badge_number')} value={profile.badge_number || ''} onSave={(v) => handleSave('badge_number', v)} />
            </FormSection>

            {profile.pax_source === 'user' && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-xs">
                <Info size={12} /> {t('paxlog.profile_panel.internal_user_profile')}
              </div>
            )}
            {profile.pax_source === 'contact' && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
                <Info size={12} />
                {profile.linked_user_id
                  ? t('paxlog.profile_panel.external_contact_promoted')
                  : t('paxlog.profile_panel.external_contact_profile')}
              </div>
            )}
          </div>

          <div className="@container space-y-5">
            <FormSection title={t('paxlog.profile_panel.credentials_title', { count: credentials?.length || 0 })}>
              {!credentials || credentials.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.no_certification')}</p>
              ) : (
                <div className="space-y-1">
                  {credentials.map((cred: PaxCredential) => (
                    <div key={cred.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{credTypeMap[cred.credential_type_id]?.name || t('paxlog.credentials')}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t('paxlog.profile_panel.credential_obtained', { date: formatDate(cred.obtained_date) })}
                          {cred.expiry_date && ` — ${t('paxlog.profile_panel.credential_expires', { date: formatDate(cred.expiry_date) })}`}
                        </p>
                      </div>
                      <StatusBadge status={cred.status} />
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title={t('paxlog.profile_panel.compliance_records_title', { count: complianceRecords.length })}>
              {complianceRecords.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.profile_panel.compliance_records_empty')}</p>
              ) : (
                <div className="space-y-1">
                  {complianceRecords.slice(0, 8).map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      className="gl-button gl-button-default w-full text-left"
                      onClick={() => openDynamicPanel({ type: 'detail', module: 'conformite', id: record.id, meta: { subtype: 'record' } })}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{record.type_name || record.compliance_type_id}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(record.reference_number || t('common.none'))}
                            {record.issuer ? ` • ${record.issuer}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn('gl-badge', (record.attachment_count ?? 0) > 0 ? 'gl-badge-success' : 'gl-badge-warning')}>
                            {(record.attachment_count ?? 0) > 0
                              ? t('paxlog.profile_panel.proof_present', { count: record.attachment_count ?? 0 })
                              : t('paxlog.profile_panel.proof_missing')}
                          </span>
                          <StatusBadge status={record.status} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title={t('paxlog.profile_panel.site_presence_title', { count: sitePresenceHistory?.length || 0 })}>
              {!sitePresenceHistory || sitePresenceHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.profile_panel.site_presence_empty')}</p>
              ) : (
                <div className="space-y-1">
                  {sitePresenceHistory.slice(0, 8).map((presence: PaxSitePresence) => (
                    <div key={presence.ads_id} className="rounded border border-border px-2 py-1.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{presence.site_name || t('paxlog.profile_panel.unknown_site')}</span>
                        <StatusBadge status={presence.ads_status} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{presence.ads_reference}</span>
                        <span>{formatDate(presence.start_date)} — {formatDate(presence.end_date)}</span>
                      </div>
                      {(presence.boarding_status || presence.completed_at) && (
                        <div className="text-[10px] text-muted-foreground">
                          {presence.boarding_status
                            ? t('paxlog.profile_panel.boarding_status', { status: presence.boarding_status, date: formatDate(presence.boarded_at) })
                            : t('paxlog.profile_panel.completed_at', { date: formatDate(presence.completed_at) })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <ReadOnlyRow label={t('common.created_at')} value={formatDate(profile.created_at)} />
          </div>
        </SectionColumns>

        <FormSection title={t('paxlog.profile_panel.sections.reference_evidence')} collapsible defaultExpanded={false}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('paxlog.profile_panel.reference_evidence_help')}
            </p>
            <div>
              <PanelActionButton
                onClick={() => openDynamicPanel({
                  type: 'create',
                  module: 'conformite',
                  meta: {
                    subtype: 'record',
                    prefill_owner_type: profileOwnerType,
                    prefill_owner_id: profileOwnerId,
                    prefill_owner_label: `${profile.first_name} ${profile.last_name}`,
                  },
                })}
              >
                <Plus size={12} /> {t('paxlog.profile_panel.add_compliance_record')}
              </PanelActionButton>
            </div>
            <AttachmentManager ownerType={profileOwnerType} ownerId={profileOwnerId} compact />
          </div>
        </FormSection>

        <CollapsibleSection id="profile-tags-notes" title={t('paxlog.ads_detail.sections.tags_notes_files')}>
          <div className="space-y-3 p-3">
            <TagManager ownerType={profileOwnerType} ownerId={profileOwnerId} compact />
            <AttachmentManager ownerType={profileOwnerType} ownerId={profileOwnerId} compact />
            <NoteManager ownerType={profileOwnerType} ownerId={profileOwnerId} compact />
          </div>
        </CollapsibleSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ── Create AdS Panel ──────────────────────────────────────────

