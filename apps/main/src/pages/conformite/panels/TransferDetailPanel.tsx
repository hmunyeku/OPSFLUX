/**
 * TransferDetailPanel — vue complete d'un transfert d'employe.
 *
 * Specs SUP-0038 (Bastien, mai 2026):
 * > Pendant un transfert on doit voir tout le profil du gars, son
 * > historique, ses antecedents, sa conformite etc. [...] On doit
 * > organiser ces anciennes donnees en timeline d'entreprise par
 * > lesquelles il est passees.
 *
 * 5 onglets:
 *  - Detail: mouvement (from->to tier), date, motif, nouveau poste, audit
 *  - Profil: identite de l'employe (link CrossModule vers fiche complete)
 *  - Conformite: records de l'employe (incl. ceux invalides par le transfert)
 *  - Timeline: historique des transferts du contact (toutes entreprises)
 *  - Documents: AttachmentManager + NoteManager polymorphes
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GitBranch, Building2, Calendar, FileText, User, Shield, History,
  Paperclip, AlertCircle, CheckCircle2, XCircle, ArrowRight, Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  FormSection,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { useTransfers } from '@/hooks/useConformite'
import { useComplianceRecords } from '@/hooks/useConformite'
import { usePaxProfile } from '@/hooks/usePaxlog'
import { formatDate, formatDateTime } from '@/lib/i18n'

type Tab = 'detail' | 'profile' | 'compliance' | 'timeline' | 'documents'

export function TransferDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('detail')

  // Pas d'endpoint GET /transfers/{id} dedie cote backend — on filtre la
  // list (cf. JobPositionDetailPanel meme pattern). page_size:200 = OK
  // pour la majorite des tenants.
  const { data: allTransfers } = useTransfers({ page: 1, page_size: 200 })
  const transfer = useMemo(
    () => (allTransfers?.items ?? []).find((tr) => tr.id === id),
    [allTransfers, id],
  )

  // Historique des transferts de ce contact specifiquement, pour la
  // timeline d'entreprises (incl. le transfert courant + ceux qui
  // l'ont precede).
  const { data: contactHistoryData } = useTransfers({
    page: 1,
    page_size: 100,
    contact_id: transfer?.contact_id,
  })

  // Profil PaxLog du contact (pour pax_source='contact', PaxProfile.id
  // == TierContact.id, donc transfer.contact_id matche directement).
  const { data: profile } = usePaxProfile(
    transfer?.contact_id || '',
    transfer?.contact_id ? 'contact' : undefined,
  )

  // Records de conformite de l'employe — incl. les invalides par le
  // transfert (cf. backend _invalidate_compliance_on_transfer qui set
  // active=False post-transfert).
  const { data: recordsData } = useComplianceRecords({
    owner_type: 'tier_contact',
    owner_id: transfer?.contact_id,
    page: 1,
    page_size: 200,
  })
  const records = recordsData?.items ?? []
  const recordsActive = records.filter((r) => (r as { active?: boolean }).active !== false)
  const recordsInvalidated = records.filter((r) => (r as { active?: boolean }).active === false)

  if (!transfer) {
    return (
      <DynamicPanelShell
        title={t('common.loading')}
        icon={<GitBranch size={14} className="text-blue-500" />}
      >
        <div className="py-16 text-center text-xs text-muted-foreground">{t('common.loading')}</div>
      </DynamicPanelShell>
    )
  }

  // Timeline structuree : on classe les transferts par date asc pour
  // raconter l'histoire chronologique des entreprises traversees.
  const historyChronological = [...(contactHistoryData?.items ?? [])]
    .sort((a, b) => (a.transfer_date < b.transfer_date ? -1 : 1))

  return (
    <DynamicPanelShell
      title={t('conformite.transfers.detail_title', 'Transfert d\'employé')}
      subtitle={transfer.contact_name || transfer.contact_id}
      icon={<GitBranch size={14} className="text-blue-500" />}
    >
      <TabBar
        items={[
          { id: 'detail', label: t('common.detail', 'Détail'), icon: GitBranch },
          { id: 'profile', label: t('paxlog.profile_panel.sections.identity', 'Profil'), icon: User },
          {
            id: 'compliance',
            label: t('paxlog.profile_panel.compliance_records_title', { count: records.length }) as string || `Conformité (${records.length})`,
            icon: Shield,
            badge: recordsInvalidated.length > 0 ? String(recordsInvalidated.length) : undefined,
          },
          {
            id: 'timeline',
            label: t('conformite.transfers.timeline_tab', 'Timeline'),
            icon: History,
            badge: historyChronological.length > 1 ? String(historyChronological.length) : undefined,
          },
          { id: 'documents', label: t('common.documents', 'Documents'), icon: Paperclip },
        ]}
        activeId={tab}
        onTabChange={(id) => setTab(id as Tab)}
      />

      {tab === 'detail' && (
        <PanelContentLayout>
          <FormSection title={t('conformite.transfers.movement_section', 'Mouvement')}>
            <DetailFieldGrid>
              <ReadOnlyRow
                label={t('conformite.transfers.from_company', 'Entreprise source')}
                value={
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Building2 size={11} className="text-muted-foreground" />
                    {transfer.from_tier_id ? (
                      <CrossModuleLink
                        module="tiers"
                        id={transfer.from_tier_id}
                        label={transfer.from_tier_name || transfer.from_tier_id}
                        showIcon={false}
                      />
                    ) : (
                      <span>{transfer.from_tier_name || '—'}</span>
                    )}
                  </span>
                }
              />
              <ReadOnlyRow
                label={t('conformite.transfers.to_company', 'Entreprise destination')}
                value={
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Building2 size={11} className="text-muted-foreground" />
                    {transfer.to_tier_id ? (
                      <CrossModuleLink
                        module="tiers"
                        id={transfer.to_tier_id}
                        label={transfer.to_tier_name || transfer.to_tier_id}
                        showIcon={false}
                      />
                    ) : (
                      <span>{transfer.to_tier_name || '—'}</span>
                    )}
                  </span>
                }
              />
              <ReadOnlyRow
                label={t('conformite.columns.date')}
                value={
                  <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                    <Calendar size={11} className="text-muted-foreground" />
                    {formatDate(transfer.transfer_date)}
                  </span>
                }
              />
              {/* PR #11 SUP-0038: nouveau poste optionnel pendant le transfert.
                  Si renseigne, le backend a aussi update tier_contact.job_position_id. */}
              {transfer.new_job_position_id && (
                <ReadOnlyRow
                  label={t('conformite.transfers.new_job_position', 'Nouveau poste')}
                  value={
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Briefcase size={11} className="text-muted-foreground" />
                      <CrossModuleLink
                        module="conformite"
                        id={transfer.new_job_position_id}
                        label={transfer.new_job_position_name || transfer.new_job_position_id}
                        subtype="job-position"
                      />
                    </span>
                  }
                />
              )}
            </DetailFieldGrid>
          </FormSection>

          {transfer.reason && (
            <FormSection title={t('common.reason', 'Motif')}>
              <div className="px-2 py-2 rounded-md bg-muted/30 border border-border/50 text-sm whitespace-pre-wrap">
                <FileText size={11} className="inline mr-1.5 text-muted-foreground" />
                {transfer.reason}
              </div>
            </FormSection>
          )}

          <FormSection title={t('conformite.transfers.audit_section', 'Traçabilité')}>
            <DetailFieldGrid>
              <ReadOnlyRow
                label={t('common.created_at')}
                value={<span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(transfer.created_at)}</span>}
              />
              <ReadOnlyRow
                label={t('conformite.transfers.transferred_by', 'Enregistré par')}
                value={<span className="text-xs text-muted-foreground font-mono">{transfer.transferred_by || '—'}</span>}
              />
            </DetailFieldGrid>
          </FormSection>

          {/* Effet sur la conformite — message resumant ce que le backend
              a fait (cf. _invalidate_compliance_on_transfer dans
              conformite.py). Rendu en banner info car c'est un side effect
              automatique, pas une action manuelle. */}
          {recordsInvalidated.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {t('conformite.transfers.compliance_invalidated_title', `${recordsInvalidated.length} enregistrement(s) de conformité invalidé(s) par ce transfert.`)}
                </p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-400">
                  {t('conformite.transfers.compliance_invalidated_hint', 'Les certifications liées au site précédent doivent être re-vérifiées. Voir onglet Conformité.')}
                </p>
              </div>
            </div>
          )}
        </PanelContentLayout>
      )}

      {tab === 'profile' && (
        <PanelContentLayout>
          <FormSection title={t('paxlog.profile_panel.sections.identity', 'Identité')}>
            {profile ? (
              <DetailFieldGrid>
                <ReadOnlyRow label={t('paxlog.profile_panel.fields.first_name')} value={profile.first_name} />
                <ReadOnlyRow label={t('paxlog.profile_panel.fields.last_name')} value={profile.last_name} />
                <ReadOnlyRow label={t('paxlog.profile_panel.fields.birth_date')} value={formatDate(profile.birth_date)} />
                <ReadOnlyRow label={t('paxlog.profile_panel.fields.nationality')} value={profile.nationality || '—'} />
                <ReadOnlyRow label={t('paxlog.profile_panel.fields.badge_number')} value={profile.badge_number || '—'} />
                <ReadOnlyRow
                  label={t('paxlog.profile_panel.linked_company', 'Entreprise')}
                  value={profile.company_id ? (
                    <CrossModuleLink module="tiers" id={profile.company_id} label={profile.company_name || profile.company_id} showIcon={false} />
                  ) : '—'}
                />
              </DetailFieldGrid>
            ) : (
              <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
            )}
          </FormSection>

          <div className="flex items-center justify-end">
            <CrossModuleLink
              module="paxlog"
              id={transfer.contact_id}
              label={t('paxlog.profile_panel.open_full_profile', 'Ouvrir la fiche complète')}
              subtype="profile"
            />
          </div>
        </PanelContentLayout>
      )}

      {tab === 'compliance' && (
        <PanelContentLayout>
          <FormSection title={t('conformite.transfers.compliance_active', `Conformité actuelle (${recordsActive.length})`)}>
            {recordsActive.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('paxlog.profile_panel.compliance_records_empty', 'Aucun enregistrement actif.')}</p>
            ) : (
              <div className="space-y-1">
                {recordsActive.map((r) => (
                  <ComplianceRowCard key={r.id} record={r} active />
                ))}
              </div>
            )}
          </FormSection>

          {recordsInvalidated.length > 0 && (
            <FormSection title={t('conformite.transfers.compliance_invalidated', `Invalidés par le transfert (${recordsInvalidated.length})`)}>
              <div className="space-y-1">
                {recordsInvalidated.map((r) => (
                  <ComplianceRowCard key={r.id} record={r} active={false} />
                ))}
              </div>
            </FormSection>
          )}
        </PanelContentLayout>
      )}

      {tab === 'timeline' && (
        <PanelContentLayout>
          <FormSection title={t('conformite.transfers.timeline_title', 'Parcours entreprises')}>
            {historyChronological.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('conformite.transfers.timeline_empty', 'Aucun historique de transfert pour cet employé.')}</p>
            ) : (
              <div className="space-y-2">
                {historyChronological.map((tr, idx) => {
                  const isCurrent = tr.id === transfer.id
                  return (
                    <div
                      key={tr.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
                        isCurrent
                          ? 'border-primary/60 bg-primary/5'
                          : 'border-border bg-muted/20',
                      )}
                    >
                      <span className="font-mono text-muted-foreground shrink-0">{idx + 1}.</span>
                      <span className="tabular-nums text-muted-foreground shrink-0 w-20">
                        {formatDate(tr.transfer_date)}
                      </span>
                      <Building2 size={11} className="text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{tr.from_tier_name || tr.from_tier_id}</span>
                      <ArrowRight size={11} className="text-muted-foreground shrink-0" />
                      <Building2 size={11} className="text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{tr.to_tier_name || tr.to_tier_id}</span>
                      {isCurrent && (
                        <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary shrink-0">
                          {t('common.current', 'En cours')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'documents' && (
        <PanelContentLayout>
          <FormSection title={t('common.attachments', 'Pièces jointes')}>
            <AttachmentManager ownerType="tier_contact" ownerId={transfer.contact_id} compact />
          </FormSection>
          <FormSection title={t('common.notes')}>
            <NoteManager ownerType="tier_contact" ownerId={transfer.contact_id} compact />
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}

// ── Sous-composant: ligne d'un record de conformite ─────────────
function ComplianceRowCard({ record, active }: { record: unknown; active: boolean }) {
  const r = record as {
    id: string
    type_name?: string | null
    compliance_type_id: string
    reference_number?: string | null
    issuer?: string | null
    status?: string | null
    expires_at?: string | null
  }
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
      active ? 'border-border bg-card' : 'border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20',
    )}>
      {active ? (
        <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
      ) : (
        <XCircle size={11} className="text-amber-600 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{r.type_name || r.compliance_type_id}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {r.reference_number || '—'}
          {r.issuer ? ` • ${r.issuer}` : ''}
          {r.expires_at ? ` • Expire ${formatDate(r.expires_at)}` : ''}
        </p>
      </div>
      {r.status && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
          {r.status}
        </span>
      )}
    </div>
  )
}
