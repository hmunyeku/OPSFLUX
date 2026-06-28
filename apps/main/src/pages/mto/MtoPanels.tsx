/**
 * MtoPanels — panneau de détail d'un groupe consolidé MTO + enregistrement
 * dans le registry des panneaux détachables.
 *
 * Mécanisme (identique à MOC / PackLog) : `registerPanelRenderer('mto', …)`
 * mappe une `DynamicPanelView` (type 'detail' + id) vers le composant à
 * rendre. La page appelle ensuite `renderRegisteredPanel(dynamicPanel)`.
 *
 * Le détail d'un groupe montre, sur un layout DynamicPanelShell tabbé :
 *   - Fiche        : besoin / dispo / statut / couverture + table des lignes
 *                    MTO d'origine (children) + correction inline du
 *                    rapprochement SAP.
 *   - Commentaires : NoteManager polymorphe (owner_type="mto_group").
 *   - Étiquettes   : TagManager polymorphe (owner_type="mto_group").
 *   - Documents    : AttachmentManager polymorphe (owner_type="mto_group").
 *
 * Actions Valider / Corriger gated par usePermission, placées dans la barre
 * d'actions du panneau (plus de dialogs custom).
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  FileText,
  Info,
  MessageSquare,
  Package,
  Search,
  Tag as TagIcon,
} from 'lucide-react'

import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  DetailFieldGrid,
  ReadOnlyRow,
  PanelActionButton,
} from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { BadgeCell } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonDetailPanel } from '@/components/ui/Skeleton'
import { NoteManager } from '@/components/shared/NoteManager'
import { TagManager } from '@/components/shared/TagManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { CoverageBar } from '@/components/mto/CoverageBar'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { usePermission } from '@/hooks/usePermission'
import {
  useCatalogSearch,
  useCorrectGroup,
  useMtoGroups,
  useValidateGroup,
  type MtoChild,
} from '@/hooks/useMto'
import { mtoStatusLabel, mtoStatusVariant, mtoStatusTextClass } from '@/services/mtoService'

const OWNER_TYPE = 'mto_group'

interface MtoGroupDetailPanelProps {
  /** id du groupe consolidé. */
  id: string
  /** batch courant (pour invalider la bonne query après mutation). */
  batchId?: string | null
}

type DetailTab = 'fiche' | 'comments' | 'tags' | 'documents'

/** Détail d'un groupe MTO consolidé. */
export function MtoGroupDetailPanel({ id, batchId = null }: MtoGroupDetailPanelProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { hasPermission } = usePermission()
  const [activeTab, setActiveTab] = useState<DetailTab>('fiche')
  const [correctOpen, setCorrectOpen] = useState(false)
  const [search, setSearch] = useState('')

  // On relit le groupe depuis la liste du batch déjà en cache (pas
  // d'endpoint "get one"). batchId est passé par le registry via la vue.
  const { data: groups, isLoading } = useMtoGroups(batchId)
  const group = useMemo(() => (groups ?? []).find((g) => g.id === id), [groups, id])

  const validate = useValidateGroup(batchId)
  const correct = useCorrectGroup(batchId)
  const { data: catalogResults, isFetching: searching } = useCatalogSearch(search)

  const canValidate = hasPermission('mto.matching.validate') || hasPermission('mto.admin')
  const canCorrect = hasPermission('mto.matching.correct') || hasPermission('mto.admin')

  if (isLoading || !group) {
    return (
      <DynamicPanelShell title={t('mto.detail.loading')}>
        <SkeletonDetailPanel />
      </DynamicPanelShell>
    )
  }

  const isVerified = group.verification_status === 'verified'
  const children = group.children ?? []

  const doValidate = async () => {
    const ok = await confirm({
      title: t('mto.detail.validate_title'),
      message: t('mto.detail.validate_message', {
        item: group.designation_sap || group.mto_key || t('mto.detail.title_fallback'),
        article: group.article_code ?? t('mto.common.dash'),
      }),
      confirmLabel: t('mto.detail.validate_confirm'),
    })
    if (!ok) return
    try {
      await validate.mutateAsync(group.id)
      toast({ title: t('mto.detail.validate_success'), variant: 'success' })
    } catch {
      toast({ title: t('mto.detail.validate_error'), variant: 'error' })
    }
  }

  const doCorrect = async (articleCode: string) => {
    try {
      await correct.mutateAsync({ groupId: group.id, articleCode })
      toast({ title: t('mto.detail.correct_success'), variant: 'success' })
      setCorrectOpen(false)
      setSearch('')
    } catch {
      toast({ title: t('mto.detail.correct_error'), variant: 'error' })
    }
  }

  const tabItems = [
    { id: 'fiche' as const, label: t('mto.detail.tab_fiche'), icon: Info },
    { id: 'comments' as const, label: t('mto.detail.tab_comments'), icon: MessageSquare },
    { id: 'tags' as const, label: t('mto.detail.tab_tags'), icon: TagIcon },
    { id: 'documents' as const, label: t('mto.detail.tab_documents'), icon: FileText },
  ]

  return (
    <DynamicPanelShell
      icon={<Package size={16} className="text-primary" />}
      title={group.designation_sap || group.mto_key || t('mto.detail.title_fallback')}
      subtitle={
        group.article_code
          ? t('mto.detail.subtitle_article', { code: group.article_code })
          : t('mto.detail.subtitle_not_found')
      }
      actions={[
        ...(canValidate && group.found && !isVerified
          ? [
              <PanelActionButton
                key="validate"
                icon={<CheckCircle2 size={12} />}
                variant="primary"
                disabled={validate.isPending}
                onClick={doValidate}
              >
                {t('mto.detail.validate')}
              </PanelActionButton>,
            ]
          : []),
        ...(canCorrect
          ? [
              <PanelActionButton
                key="correct"
                icon={<Search size={12} />}
                variant="default"
                onClick={() => setCorrectOpen((v) => !v)}
              >
                {t('mto.detail.correct')}
              </PanelActionButton>,
            ]
          : []),
      ]}
    >
      {/* Bandeau statut + vérification — toujours visible au-dessus des onglets. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('mto.detail.status')}
        </span>
        {group.statut ? (
          <BadgeCell value={mtoStatusLabel(group.statut)} variant={mtoStatusVariant(group.statut)} />
        ) : (
          <span className="text-xs text-muted-foreground">{t('mto.common.dash')}</span>
        )}
        <span className="ml-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('mto.detail.verif')}
        </span>
        <VerificationBadge status={group.verification_status} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t('mto.common.lines_count', { count: group.nb_lignes })}
        </span>
      </div>

      <TabBar items={tabItems} activeId={activeTab} onTabChange={setActiveTab} />

      <PanelContentLayout>
        {activeTab === 'fiche' && (
          <>
            {/* Correction inline du rapprochement SAP (remplace l'ancien dialog). */}
            {correctOpen && canCorrect && (
              <FormSection title={t('mto.detail.correct_section')} defaultExpanded>
                <p className="mb-2 text-xs text-muted-foreground">
                  {t('mto.detail.correct_current')}{' '}
                  <code className="font-mono text-foreground">
                    {group.article_code ?? t('mto.common.dash')}
                  </code>
                  {group.designation_sap ? ` — ${group.designation_sap}` : ''}
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <Search size={14} className="shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('mto.detail.correct_search_placeholder')}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border/60">
                  {searching && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {t('mto.detail.searching')}
                    </p>
                  )}
                  {search.trim().length < 2 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {t('mto.detail.min_chars')}
                    </p>
                  )}
                  {(catalogResults ?? []).map((a) => (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() => doCorrect(a.code)}
                      disabled={correct.isPending}
                      className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left text-sm transition-colors last:border-0 hover:bg-muted/40 disabled:opacity-50"
                    >
                      <span className="font-mono text-xs text-primary">{a.code}</span>
                      <span className="truncate text-muted-foreground">{a.designation}</span>
                    </button>
                  ))}
                </div>
              </FormSection>
            )}

            {/* Entête article SAP rapproché. */}
            <FormSection title={t('mto.detail.section_article_sap')} defaultExpanded>
              <DetailFieldGrid>
                <ReadOnlyRow label={t('mto.detail.field_mto_key')} value={group.mto_key} />
                <ReadOnlyRow
                  label={t('mto.detail.field_article_code')}
                  value={
                    group.article_code ? (
                      <span className="font-mono text-primary">{group.article_code}</span>
                    ) : (
                      t('mto.common.dash')
                    )
                  }
                />
                <ReadOnlyRow
                  label={t('mto.detail.field_designation')}
                  value={
                    group.found ? (
                      group.designation_sap || t('mto.common.dash')
                    ) : (
                      <span className="italic text-muted-foreground">{t('mto.matching.not_found')}</span>
                    )
                  }
                />
                <ReadOnlyRow label={t('mto.detail.field_famille')} value={group.famille || t('mto.common.dash')} />
                <ReadOnlyRow label={t('mto.detail.field_diameter')} value={group.diameter || t('mto.common.dash')} />
              </DetailFieldGrid>
            </FormSection>

            {/* Besoin / dispo / couverture / emplacements / statut + score. */}
            <FormSection title={t('mto.detail.section_rapprochement')} defaultExpanded>
              <DetailFieldGrid>
                <ReadOnlyRow
                  label={t('mto.detail.field_besoin')}
                  value={
                    <span>
                      <span className="tabular-nums">{group.besoin}</span>{' '}
                      {group.unite ?? ''}
                      {group.unit_check && (
                        <span className="ml-1 text-warning" title={group.unit_detail ?? ''}>
                          {t('mto.detail.units_heterogeneous')}
                        </span>
                      )}
                    </span>
                  }
                />
                <ReadOnlyRow
                  label={t('mto.detail.field_disponible')}
                  value={<span className="tabular-nums">{group.dispo}</span>}
                />
                <ReadOnlyRow
                  label={t('mto.detail.field_couverture')}
                  value={
                    <span className={`tabular-nums font-medium ${mtoStatusTextClass(group.statut)}`}>
                      {group.dispo}/{group.besoin}
                    </span>
                  }
                />
                <ReadOnlyRow label={t('mto.detail.field_emplacements')} value={group.emplacements || t('mto.common.dash')} />
                <ReadOnlyRow
                  label={t('mto.detail.field_statut')}
                  value={
                    group.statut ? (
                      <BadgeCell
                        value={mtoStatusLabel(group.statut)}
                        variant={mtoStatusVariant(group.statut)}
                      />
                    ) : (
                      t('mto.common.dash')
                    )
                  }
                />
                <ReadOnlyRow
                  label={t('mto.detail.field_score')}
                  value={group.confidence || t('mto.common.dash')}
                />
              </DetailFieldGrid>

              {/* Barre de couverture du groupe (segment selon son statut). */}
              {group.statut && (
                <div className="mt-3">
                  <CoverageBar counts={{ [group.statut]: 1 }} size="md" />
                </div>
              )}
            </FormSection>

            {/* Table des lignes MTO d'origine (children). */}
            <FormSection title={t('mto.detail.section_lignes_origine', { count: children.length })} defaultExpanded>
              {children.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={t('mto.detail.empty_lignes_origine')}
                  size="compact"
                />
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-chrome text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">{t('mto.detail.col_ligne')}</th>
                        <th className="px-3 py-1.5 text-left font-medium">{t('mto.detail.col_repere')}</th>
                        <th className="px-3 py-1.5 text-left font-medium">{t('mto.detail.col_description')}</th>
                        <th className="px-3 py-1.5 text-left font-medium">{t('mto.detail.col_diameter')}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t('mto.detail.col_qte')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {children.map((c: MtoChild, i: number) => (
                        <tr key={`${id}-c${i}`} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {c.line_num ?? c.row ?? t('mto.common.dash')}
                          </td>
                          <td className="px-3 py-1.5 text-foreground">
                            {c.mark ?? c.tag ?? t('mto.common.dash')}
                          </td>
                          <td className="px-3 py-1.5 text-foreground">{c.description ?? t('mto.common.dash')}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{c.diameter ?? t('mto.common.dash')}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                            {c.qte ?? t('mto.common.dash')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </FormSection>
          </>
        )}

        {activeTab === 'comments' && (
          <FormSection title={t('mto.detail.tab_comments_title')} defaultExpanded>
            <NoteManager ownerType={OWNER_TYPE} ownerId={group.id} />
          </FormSection>
        )}

        {activeTab === 'tags' && (
          <FormSection title={t('mto.detail.tab_tags_title')} defaultExpanded>
            <TagManager ownerType={OWNER_TYPE} ownerId={group.id} />
          </FormSection>
        )}

        {activeTab === 'documents' && (
          <FormSection title={t('mto.detail.tab_documents_title')} defaultExpanded>
            <AttachmentManager ownerType={OWNER_TYPE} ownerId={group.id} />
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

/**
 * Badge de statut de vérification humaine d'un rapprochement.
 *   verified → success « Validé » · rejected → danger « Rejeté »
 *   pending / autre → neutral « En attente ».
 */
function VerificationBadge({ status }: { status?: string | null }) {
  const { t } = useTranslation()
  if (status === 'verified') return <BadgeCell value={t('mto.verification.verified')} variant="success" />
  if (status === 'rejected') return <BadgeCell value={t('mto.verification.rejected')} variant="danger" />
  return <BadgeCell value={t('mto.verification.pending')} variant="neutral" />
}

// ── Enregistrement dans le registry des panneaux ──────────────────────────
//
// La vue porte le batchId courant dans `meta.batchId` pour que le panneau
// puisse relire le bon cache de groupes (il n'y a pas d'endpoint "get one").
registerPanelRenderer('mto', (view) => {
  if (view.type === 'detail' && 'id' in view) {
    const batchId = (view.meta?.batchId as string | undefined) ?? null
    return <MtoGroupDetailPanel id={view.id} batchId={batchId} />
  }
  return null
})
