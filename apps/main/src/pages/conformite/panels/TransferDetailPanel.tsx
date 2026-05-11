/**
 * TransferDetailPanel — read-only view of a single tier-contact transfer.
 *
 * Un transfert est une entree d'audit log immuable (audit trail des
 * changements d'entreprise d'un employe au fil du temps), donc pas
 * d'edition possible — juste un affichage clair de qui, quoi, quand,
 * pourquoi.
 *
 * Cree apres signalement Bastien (mai 2026): "il n'est pas possible de
 * cliquer sur un transfert dans conformité pour afficher son panel
 * view detail" — la table conformite > transferts n'avait ni onRowClick
 * ni composant de detail enregistre.
 */
import { GitBranch, Building2, Calendar, FileText, User } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DynamicPanelShell,
  FormSection,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { useTransfers } from '@/hooks/useConformite'
import { formatDate, formatDateTime } from '@/lib/i18n'

export function TransferDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  // Note: pas d'endpoint GET /transfers/{id} cote backend pour l'instant —
  // on filtre la list cachee par React Query. Meme pattern que
  // JobPositionDetailPanel. A migrer vers un endpoint dedie si la table
  // grandit (perf: aujourd'hui une page de 25 transferts max charges).
  const { data, isLoading } = useTransfers({ page: 1, page_size: 200 })
  const transfer = useMemo(() => (data?.items ?? []).find((tr) => tr.id === id), [data, id])

  if (isLoading || !transfer) {
    return (
      <DynamicPanelShell
        title={t('common.loading')}
        icon={<GitBranch size={14} className="text-blue-500" />}
      >
        <div className="py-16 text-center text-xs text-muted-foreground">
          {isLoading ? t('common.loading') : t('common.not_found', 'Transfert introuvable')}
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={t('conformite.transfers.detail_title', 'Transfert d\'employé')}
      subtitle={transfer.contact_name || transfer.contact_id}
      icon={<GitBranch size={14} className="text-blue-500" />}
    >
      <PanelContentLayout>
        <FormSection title={t('conformite.transfers.employee_section', 'Employé concerné')}>
          <DetailFieldGrid>
            <ReadOnlyRow
              label={t('conformite.columns.employee')}
              value={
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <User size={11} className="text-muted-foreground" />
                  {/* Le contact_id pointe vers une TierContact — il existe une
                      vue PAX pour ces contacts (paxlog module). On rend un lien
                      vers la fiche profil PaxLog quand possible. */}
                  <CrossModuleLink
                    module="paxlog"
                    id={transfer.contact_id}
                    label={transfer.contact_name || transfer.contact_id}
                    subtype="profile"
                  />
                </span>
              }
            />
          </DetailFieldGrid>
        </FormSection>

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
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
