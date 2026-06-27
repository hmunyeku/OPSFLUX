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
import { useToast } from '@/components/ui/Toast'
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
  const { toast } = useToast()
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
      <DynamicPanelShell title="Chargement…">
        <SkeletonDetailPanel />
      </DynamicPanelShell>
    )
  }

  const isVerified = group.verification_status === 'verified'
  const children = group.children ?? []

  const doValidate = async () => {
    try {
      await validate.mutateAsync(group.id)
      toast({ title: 'Rapprochement validé', variant: 'success' })
    } catch {
      toast({ title: 'Validation impossible', variant: 'error' })
    }
  }

  const doCorrect = async (articleCode: string) => {
    try {
      await correct.mutateAsync({ groupId: group.id, articleCode })
      toast({ title: 'Rapprochement corrigé', variant: 'success' })
      setCorrectOpen(false)
      setSearch('')
    } catch {
      toast({ title: 'Correction impossible', variant: 'error' })
    }
  }

  const tabItems = [
    { id: 'fiche' as const, label: 'Fiche', icon: Info },
    { id: 'comments' as const, label: 'Commentaires', icon: MessageSquare },
    { id: 'tags' as const, label: 'Étiquettes', icon: TagIcon },
    { id: 'documents' as const, label: 'Documents', icon: FileText },
  ]

  return (
    <DynamicPanelShell
      icon={<Package size={16} className="text-primary" />}
      title={group.designation_sap || group.mto_key || 'Groupe MTO'}
      subtitle={group.article_code ? `Article ${group.article_code}` : 'Article non trouvé'}
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
                Valider
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
                Corriger
              </PanelActionButton>,
            ]
          : []),
      ]}
    >
      {/* Bandeau statut — toujours visible au-dessus des onglets. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Statut
        </span>
        {group.statut ? (
          <BadgeCell value={mtoStatusLabel(group.statut)} variant={mtoStatusVariant(group.statut)} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {isVerified && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 size={12} /> Validé
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {group.nb_lignes} ligne{group.nb_lignes !== 1 ? 's' : ''}
        </span>
      </div>

      <TabBar items={tabItems} activeId={activeTab} onTabChange={setActiveTab} />

      <PanelContentLayout>
        {activeTab === 'fiche' && (
          <>
            {/* Correction inline du rapprochement SAP (remplace l'ancien dialog). */}
            {correctOpen && canCorrect && (
              <FormSection title="Corriger le rapprochement" defaultExpanded>
                <p className="mb-2 text-xs text-muted-foreground">
                  Actuel :{' '}
                  <code className="font-mono text-foreground">{group.article_code ?? '—'}</code>
                  {group.designation_sap ? ` — ${group.designation_sap}` : ''}
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <Search size={14} className="shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un article (code ou désignation)…"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border/60">
                  {searching && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Recherche…</p>
                  )}
                  {search.trim().length < 2 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Saisissez au moins 2 caractères.
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

            {/* Besoin / dispo / statut. */}
            <FormSection title="Rapprochement" defaultExpanded>
              <DetailFieldGrid>
                <ReadOnlyRow label="Clé MTO" value={group.mto_key} />
                <ReadOnlyRow label="Article SAP" value={group.article_code ?? '—'} />
                <ReadOnlyRow
                  label="Désignation"
                  value={
                    group.found ? (
                      group.designation_sap || '—'
                    ) : (
                      <span className="italic text-muted-foreground">(non trouvé)</span>
                    )
                  }
                />
                <ReadOnlyRow label="Famille" value={group.famille || '—'} />
                <ReadOnlyRow label="Ø Diamètre" value={group.diameter || '—'} />
                <ReadOnlyRow
                  label="Besoin"
                  value={
                    <span>
                      <span className="tabular-nums">{group.besoin}</span>{' '}
                      {group.unite ?? ''}
                      {group.unit_check && (
                        <span className="ml-1 text-warning" title={group.unit_detail ?? ''}>
                          ⚠ unités hétérogènes
                        </span>
                      )}
                    </span>
                  }
                />
                <ReadOnlyRow
                  label="Disponible"
                  value={<span className="tabular-nums">{group.dispo}</span>}
                />
                <ReadOnlyRow
                  label="Couverture"
                  value={
                    <span className={`tabular-nums font-medium ${mtoStatusTextClass(group.statut)}`}>
                      {group.dispo}/{group.besoin}
                    </span>
                  }
                />
                <ReadOnlyRow label="Emplacements" value={group.emplacements || '—'} />
                <ReadOnlyRow label="Confiance" value={group.confidence || '—'} />
              </DetailFieldGrid>
            </FormSection>

            {/* Table des lignes MTO d'origine (children). */}
            <FormSection title={`Lignes d'origine (${children.length})`} defaultExpanded>
              {children.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Aucune ligne d'origine"
                  size="compact"
                />
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-chrome text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Ligne</th>
                        <th className="px-3 py-1.5 text-left font-medium">Repère</th>
                        <th className="px-3 py-1.5 text-left font-medium">Description</th>
                        <th className="px-3 py-1.5 text-left font-medium">Ø</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qté</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {children.map((c: MtoChild, i: number) => (
                        <tr key={`${id}-c${i}`} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {c.line_num ?? c.row ?? '—'}
                          </td>
                          <td className="px-3 py-1.5 text-foreground">
                            {c.mark ?? c.tag ?? '—'}
                          </td>
                          <td className="px-3 py-1.5 text-foreground">{c.description ?? '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{c.diameter ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                            {c.qte ?? '—'}
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
          <FormSection title="Commentaires" defaultExpanded>
            <NoteManager ownerType={OWNER_TYPE} ownerId={group.id} />
          </FormSection>
        )}

        {activeTab === 'tags' && (
          <FormSection title="Étiquettes" defaultExpanded>
            <TagManager ownerType={OWNER_TYPE} ownerId={group.id} />
          </FormSection>
        )}

        {activeTab === 'documents' && (
          <FormSection title="Documents" defaultExpanded>
            <AttachmentManager ownerType={OWNER_TYPE} ownerId={group.id} />
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
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
