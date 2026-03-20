/**
 * Report Editor page — document management with workflow, templates, and doc types.
 *
 * Tabs: Tableau de bord | Documents | Templates | Types de document
 * - Dashboard: KPI cards by status, recent activity
 * - Documents: DataTable with filters (status, doc_type, classification, search)
 * - Templates: list with create button
 * - Types de document: list of doc types
 *
 * Detail panel: metadata, revision info, workflow actions, export, share, revision history
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  FileText, Plus, Loader2, Trash2, LayoutDashboard, Files, FileCode2, FolderCog,
  Send, CheckCircle2, XCircle, Globe, Download, Link2, Clock, Eye,
  Archive, PenTool,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  FormGrid,
  ReadOnlyRow,
  DangerConfirmButton,
  PanelActionButton,
  PanelContentLayout,
  SectionColumns,
  DetailFieldGrid,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useToast } from '@/components/ui/Toast'
import {
  useDocuments,
  useDocumentCounts,
  useDocument,
  useDeleteDocument,
  useArchiveDocument,
  useSubmitDocument,
  useApproveDocument,
  useRejectDocument,
  usePublishDocument,
  useObsoleteDocument,
  useDocumentWorkflowState,
  useDocumentTransition,
  useDocTypes,
  useUpdateDocType,
  useTemplates,
  useUpdateTemplate,
  useCreateShareLink,
  useRevisions,
  useRevision,
  useCreateRevision,
  useSaveDraft,
  useCreateDocument,
} from '@/hooks/useReportEditor'
import { reportEditorService } from '@/services/reportEditorService'
import { DocumentEditor } from '@/components/report-editor/DocumentEditor'
import type {
  Document as REDocument,
  DocType,
  Template,
  RevisionSummary,
} from '@/services/reportEditorService'

// -- Constants ----------------------------------------------------------------

type ReportEditorTab = 'dashboard' | 'documents' | 'templates' | 'doc-types'

const TABS: { id: ReportEditorTab; label: string; icon: typeof FileText }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', icon: Files },
  { id: 'templates', label: 'Templates', icon: FileCode2 },
  { id: 'doc-types', label: 'Types de document', icon: FolderCog },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'in_review', label: 'En revue' },
  { value: 'approved', label: 'Approuve' },
  { value: 'published', label: 'Publie' },
  { value: 'obsolete', label: 'Obsolete' },
  { value: 'archived', label: 'Archive' },
]

const CLASSIFICATION_OPTIONS = [
  { value: 'INT', label: 'Interne' },
  { value: 'CONF', label: 'Confidentiel' },
  { value: 'REST', label: 'Restreint' },
  { value: 'PUB', label: 'Public' },
]

// -- Badges -------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    in_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    published: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    obsolete: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  }
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', colorMap[status] || 'bg-gray-100 text-gray-700')}>
      {label}
    </span>
  )
}

function ClassificationBadge({ classification }: { classification: string }) {
  const colorMap: Record<string, string> = {
    INT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    CONF: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    REST: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    PUB: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', colorMap[classification] || 'bg-gray-100 text-gray-600')}>
      {classification}
    </span>
  )
}

function formatDate(d: string | null | undefined) {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// -- KPI Card -----------------------------------------------------------------

function KpiCard({ label, count, color, icon: Icon, onClick }: {
  label: string
  count: number
  color: string
  icon: typeof FileText
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left min-w-[140px]',
        onClick && 'cursor-pointer',
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn('flex items-center justify-center w-8 h-8 rounded-md', color)}>
          <Icon size={16} />
        </div>
        <span className="text-2xl font-bold tabular-nums">{count}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  )
}

// -- Dashboard Tab ------------------------------------------------------------

function DashboardView({ documents, counts, onNavigateToDocuments }: {
  documents: REDocument[]
  counts: { draft: number; in_review: number; approved: number; published: number; obsolete: number; archived: number }
  onNavigateToDocuments: (statusFilter?: string) => void
}) {
  const { t } = useTranslation()

  const recentDocs = useMemo(
    () => [...documents].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10),
    [documents],
  )

  return (
    <div className="p-4 space-y-6">
      {/* KPI Cards */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">{t('common.overview', 'Vue d\'ensemble')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Brouillons"
            count={counts.draft}
            color="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            icon={FileText}
            onClick={() => onNavigateToDocuments('draft')}
          />
          <KpiCard
            label="En revue"
            count={counts.in_review}
            color="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
            icon={Eye}
            onClick={() => onNavigateToDocuments('in_review')}
          />
          <KpiCard
            label="Approuves"
            count={counts.approved}
            color="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300"
            icon={CheckCircle2}
            onClick={() => onNavigateToDocuments('approved')}
          />
          <KpiCard
            label="Publies"
            count={counts.published}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
            icon={Globe}
            onClick={() => onNavigateToDocuments('published')}
          />
          <KpiCard
            label="Obsoletes"
            count={counts.obsolete}
            color="bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300"
            icon={XCircle}
            onClick={() => onNavigateToDocuments('obsolete')}
          />
          <KpiCard
            label="Archives"
            count={counts.archived}
            color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            icon={Archive}
            onClick={() => onNavigateToDocuments('archived')}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Activite recente</h2>
        {recentDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Aucun document pour le moment</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Numero</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Titre</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Statut</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Mis a jour</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.map((doc) => (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium text-foreground">{doc.number}</td>
                    <td className="px-3 py-2 text-foreground truncate max-w-[300px]">{doc.title}</td>
                    <td className="px-3 py-2"><StatusBadge status={doc.status} /></td>
                    <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">{formatDate(doc.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// -- Dynamic Workflow Actions (FSM-driven) ------------------------------------

function WorkflowActions({ docId }: { docId: string }) {
  const { data: wfState, isLoading } = useDocumentWorkflowState(docId)
  const transition = useDocumentTransition()
  const { toast } = useToast()
  const [commentFor, setCommentFor] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  if (isLoading || !wfState) return null

  const handleTransition = (toState: string, commentRequired: boolean) => {
    if (commentRequired) {
      setCommentFor(toState)
      return
    }
    transition.mutate(
      { docId, toState },
      {
        onSuccess: () => toast({ title: 'Transition effectuee', variant: 'success' }),
        onError: () => toast({ title: 'Erreur lors de la transition', variant: 'error' }),
      },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {wfState.available_transitions.map((t) => (
          <button
            key={t.to_state}
            onClick={() => handleTransition(t.to_state, t.comment_required)}
            disabled={transition.isPending}
            className={cn(
              'gl-button-sm',
              t.to_state.includes('reject') || t.to_state === 'draft'
                ? 'gl-button-danger'
                : 'gl-button-confirm',
            )}
          >
            {transition.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
            <span>{t.label || t.to_state}</span>
          </button>
        ))}
      </div>
      {/* Comment dialog for transitions that require it */}
      {commentFor && (
        <div className="flex flex-col gap-2 p-2 border border-border rounded-md bg-muted/20">
          <label className="text-xs font-medium text-muted-foreground">Motif (obligatoire)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Motif (obligatoire)..."
            className="w-full min-h-[60px] rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                transition.mutate(
                  { docId, toState: commentFor, comment },
                  {
                    onSuccess: () => {
                      setCommentFor(null)
                      setComment('')
                      toast({ title: 'Transition effectuee', variant: 'success' })
                    },
                    onError: () => toast({ title: 'Erreur lors de la transition', variant: 'error' }),
                  },
                )
              }}
              disabled={!comment.trim() || transition.isPending}
              className="gl-button-sm gl-button-confirm"
            >
              {transition.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              <span>Confirmer</span>
            </button>
            <button
              onClick={() => { setCommentFor(null); setComment('') }}
              className="gl-button-sm gl-button-default"
            >
              <span>Annuler</span>
            </button>
          </div>
        </div>
      )}
      {/* Transition history */}
      {wfState.history?.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Historique</p>
          <div className="space-y-1">
            {wfState.history.map((h, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                <span className="font-medium">{h.actor_name || 'Systeme'}</span>
                {' '}{h.from_state} &rarr; {h.to_state}
                {h.comment && <span className="italic ml-1">&laquo;{h.comment}&raquo;</span>}
                {h.created_at && (
                  <span className="ml-1 tabular-nums">
                    {new Date(h.created_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Document Detail Panel ----------------------------------------------------

function DocumentDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()

  const { data: doc, isLoading: docLoading } = useDocument(id)
  const { data: revisions, isLoading: revisionsLoading } = useRevisions(id)
  const { data: currentRevision } = useRevision(
    id,
    doc?.current_revision_id ?? undefined,
  )

  const deleteDocument = useDeleteDocument()
  const archiveDocument = useArchiveDocument()
  const submitDocument = useSubmitDocument()
  const approveDocument = useApproveDocument()
  const rejectDocument = useRejectDocument()
  const publishDocument = usePublishDocument()
  const createShareLink = useCreateShareLink()
  const saveDraft = useSaveDraft()
  const createRevision = useCreateRevision()

  // Dynamic workflow
  const { data: wfState } = useDocumentWorkflowState(id)
  const hasWorkflow = wfState && wfState.current_state !== null

  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [showEditor, setShowEditor] = useState(false)

  const handleEditorChange = useCallback(
    (content: unknown) => {
      saveDraft.mutate({
        id,
        payload: { content: content as Record<string, unknown> },
      })
    },
    [id, saveDraft],
  )

  const handleCreateRevision = useCallback(async () => {
    try {
      await createRevision.mutateAsync(id)
      toast({ title: 'Nouvelle revision creee', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la creation de revision', variant: 'error' })
    }
  }, [id, createRevision, toast])

  const handleDelete = useCallback(async () => {
    try {
      await deleteDocument.mutateAsync(id)
      closeDynamicPanel()
      toast({ title: 'Document supprime', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'error' })
    }
  }, [id, deleteDocument, closeDynamicPanel, toast])

  const handleArchive = useCallback(async () => {
    try {
      await archiveDocument.mutateAsync(id)
      toast({ title: 'Document archive', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de l\'archivage', variant: 'error' })
    }
  }, [id, archiveDocument, toast])

  const handleSubmit = useCallback(async () => {
    try {
      await submitDocument.mutateAsync({ id })
      toast({ title: 'Document soumis pour revue', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la soumission', variant: 'error' })
    }
  }, [id, submitDocument, toast])

  const handleApprove = useCallback(async () => {
    try {
      await approveDocument.mutateAsync({ id })
      toast({ title: 'Document approuve', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de l\'approbation', variant: 'error' })
    }
  }, [id, approveDocument, toast])

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      toast({ title: 'Veuillez indiquer un motif de rejet', variant: 'error' })
      return
    }
    try {
      await rejectDocument.mutateAsync({ id, reason: rejectReason })
      setShowRejectInput(false)
      setRejectReason('')
      toast({ title: 'Document rejete', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors du rejet', variant: 'error' })
    }
  }, [id, rejectReason, rejectDocument, toast])

  const handlePublish = useCallback(async () => {
    try {
      await publishDocument.mutateAsync({ id })
      toast({ title: 'Document publie', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la publication', variant: 'error' })
    }
  }, [id, publishDocument, toast])

  const handleShareLink = useCallback(async () => {
    try {
      const link = await createShareLink.mutateAsync({ docId: id, payload: { expires_days: 30 } })
      await navigator.clipboard.writeText(`${window.location.origin}/share/${link.token}`)
      toast({ title: 'Lien de partage copie dans le presse-papiers', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la creation du lien', variant: 'error' })
    }
  }, [id, createShareLink, toast])

  const handleExportPdf = useCallback(() => {
    const url = reportEditorService.exportPdf(id)
    window.open(url, '_blank')
  }, [id])

  const handleExportDocx = useCallback(() => {
    const url = reportEditorService.exportDocx(id)
    window.open(url, '_blank')
  }, [id])

  if (docLoading || !doc) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FileText size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  // Determine available workflow actions based on current status
  const workflowActions = {
    canSubmit: doc.status === 'draft',
    canApprove: doc.status === 'in_review',
    canReject: doc.status === 'in_review',
    canPublish: doc.status === 'approved',
    canArchive: doc.status === 'published' || doc.status === 'obsolete',
  }

  return (
    <DynamicPanelShell
      title={doc.number}
      subtitle={doc.title}
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
          {t('common.delete')}
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        {/* Metadata */}
        <FormSection title="Informations" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="Numero" value={<span className="font-mono text-xs">{doc.number}</span>} />
            <ReadOnlyRow label="Titre" value={doc.title} />
            <ReadOnlyRow label="Type" value={doc.doc_type_name || '--'} />
            <ReadOnlyRow label="Statut" value={<StatusBadge status={doc.status} />} />
            <ReadOnlyRow label="Classification" value={<ClassificationBadge classification={doc.classification} />} />
            <ReadOnlyRow label="Revision courante" value={doc.current_rev_code || '--'} />
            <ReadOnlyRow label="Nb revisions" value={String(doc.revision_count)} />
            <ReadOnlyRow label="Projet" value={doc.project_name || '--'} />
            <ReadOnlyRow label="Langue" value={doc.language} />
            <ReadOnlyRow label="Createur" value={doc.creator_name || '--'} />
            <ReadOnlyRow label="Cree le" value={formatDate(doc.created_at)} />
            <ReadOnlyRow label="Mis a jour" value={formatDate(doc.updated_at)} />
          </DetailFieldGrid>
        </FormSection>

        {/* Document Editor */}
        <FormSection title="Editeur de contenu" collapsible defaultExpanded={showEditor}>
          {showEditor ? (
            <div className="space-y-2">
              <DocumentEditor
                content={currentRevision?.content}
                onChange={handleEditorChange}
                readOnly={doc.status !== 'draft'}
              />
              <div className="flex items-center gap-2">
                <button
                  className="gl-button-sm gl-button-confirm"
                  onClick={handleCreateRevision}
                  disabled={createRevision.isPending}
                >
                  {createRevision.isPending ? <Loader2 size={12} className="animate-spin" /> : <PenTool size={12} />}
                  <span>Creer revision</span>
                </button>
                <button
                  className="gl-button-sm gl-button-default"
                  onClick={() => setShowEditor(false)}
                >
                  <span>Fermer l&apos;editeur</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              className="gl-button-sm gl-button-default"
              onClick={() => setShowEditor(true)}
            >
              <PenTool size={12} />
              <span>Ouvrir l&apos;editeur</span>
            </button>
          )}
        </FormSection>

        {/* Workflow Actions */}
        <FormSection title="Actions" collapsible defaultExpanded>
          <div className="space-y-2">
            {/* Dynamic workflow buttons (FSM-driven) — fallback to legacy when no workflow configured */}
            {hasWorkflow && wfState.available_transitions.length > 0 ? (
              <WorkflowActions docId={id} />
            ) : (
              <>
                {/* Legacy hardcoded workflow buttons */}
                <div className="flex flex-wrap gap-2">
                  {workflowActions.canSubmit && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitDocument.isPending}
                      className="gl-button-sm gl-button-confirm"
                    >
                      {submitDocument.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      <span>Soumettre</span>
                    </button>
                  )}
                  {workflowActions.canApprove && (
                    <button
                      onClick={handleApprove}
                      disabled={approveDocument.isPending}
                      className="gl-button-sm gl-button-confirm"
                    >
                      {approveDocument.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      <span>Approuver</span>
                    </button>
                  )}
                  {workflowActions.canReject && !showRejectInput && (
                    <button
                      onClick={() => setShowRejectInput(true)}
                      className="gl-button-sm gl-button-danger"
                    >
                      <XCircle size={12} />
                      <span>Rejeter</span>
                    </button>
                  )}
                  {workflowActions.canPublish && (
                    <button
                      onClick={handlePublish}
                      disabled={publishDocument.isPending}
                      className="gl-button-sm gl-button-confirm"
                    >
                      {publishDocument.isPending ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                      <span>Publier</span>
                    </button>
                  )}
                  {workflowActions.canArchive && (
                    <button
                      onClick={handleArchive}
                      disabled={archiveDocument.isPending}
                      className="gl-button-sm gl-button-default"
                    >
                      {archiveDocument.isPending ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                      <span>Archiver</span>
                    </button>
                  )}
                </div>

                {/* Legacy reject input */}
                {showRejectInput && (
                  <div className="flex flex-col gap-2 p-2 border border-border rounded-md bg-muted/20">
                    <label className="text-xs font-medium text-muted-foreground">Motif du rejet</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full min-h-[60px] rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Indiquez le motif du rejet..."
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleReject}
                        disabled={rejectDocument.isPending}
                        className="gl-button-sm gl-button-danger"
                      >
                        {rejectDocument.isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        <span>Confirmer le rejet</span>
                      </button>
                      <button onClick={() => { setShowRejectInput(false); setRejectReason('') }} className="gl-button-sm gl-button-default">
                        <span>Annuler</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Export & Share */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button onClick={handleExportPdf} className="gl-button-sm gl-button-default">
                <Download size={12} />
                <span>PDF</span>
              </button>
              <button onClick={handleExportDocx} className="gl-button-sm gl-button-default">
                <Download size={12} />
                <span>DOCX</span>
              </button>
              <button
                onClick={handleShareLink}
                disabled={createShareLink.isPending}
                className="gl-button-sm gl-button-default"
              >
                {createShareLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                <span>Lien de partage</span>
              </button>
            </div>
          </div>
        </FormSection>

        {/* Revision History */}
        <FormSection title={`Historique des revisions${revisions ? ` (${revisions.length})` : ''}`} collapsible defaultExpanded={false}>
          {revisionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          ) : !revisions || revisions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Aucune revision enregistree.</p>
          ) : (
            <div className="space-y-1">
              {revisions.map((rev: RevisionSummary) => (
                <div
                  key={rev.id}
                  className={cn(
                    'flex items-center gap-3 py-2 px-2 rounded text-xs',
                    doc.current_revision_id === rev.id ? 'bg-primary/5 border border-primary/20' : 'bg-muted/20',
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-[50px]">
                    <Clock size={10} className="text-muted-foreground" />
                    <span className="font-mono font-medium">{rev.rev_code}</span>
                  </div>
                  <span className="text-muted-foreground flex-1 truncate">
                    {rev.creator_name || 'Systeme'} — {rev.word_count} mots
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">{formatDate(rev.created_at)}</span>
                  {rev.is_locked && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Verrouille
                    </span>
                  )}
                  {doc.current_revision_id === rev.id && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                      Courante
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </FormSection>

        {/* Tags, Notes & Attachments */}
        <FormSection title="Tags, notes & fichiers" collapsible defaultExpanded={false}>
          <div className="space-y-3">
            <TagManager ownerType="document" ownerId={doc.id} compact />
            <AttachmentManager ownerType="document" ownerId={doc.id} compact />
            <NoteManager ownerType="document" ownerId={doc.id} compact />
          </div>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

export function ReportEditorPage() {
  const [activeTab, setActiveTab] = useState<ReportEditorTab>('dashboard')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  const handleTabChange = useCallback((tab: ReportEditorTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setPage(1)
  }, [])

  // Navigate to documents tab with optional status filter (from dashboard KPI cards)
  const navigateToDocuments = useCallback((statusFilter?: string) => {
    setActiveTab('documents')
    setSearch('')
    setPage(1)
    if (statusFilter) {
      setActiveFilters({ status: statusFilter })
    } else {
      setActiveFilters({})
    }
  }, [])

  // -- Data -------------------------------------------------------------------

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const docTypeFilter = typeof activeFilters.doc_type_id === 'string' ? activeFilters.doc_type_id : undefined
  const classificationFilter = typeof activeFilters.classification === 'string' ? activeFilters.classification : undefined

  // Fetch accurate document status counts via dedicated endpoint
  const { data: documentCounts } = useDocumentCounts()

  // Paginated fetch for the documents tab
  const { data: docsData, isLoading: docsLoading } = useDocuments({
    page: activeTab === 'documents' ? page : 1,
    page_size: activeTab === 'documents' ? pageSize : 1,
    status: activeTab === 'documents' ? statusFilter : undefined,
    doc_type_id: activeTab === 'documents' ? docTypeFilter : undefined,
    classification: activeTab === 'documents' ? classificationFilter : undefined,
    search: activeTab === 'documents' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: docTypes, isLoading: docTypesLoading } = useDocTypes()
  const { data: templates, isLoading: templatesLoading } = useTemplates()

  // Update nav items for keyboard navigation in detail panel
  useEffect(() => {
    if (activeTab === 'documents' && docsData?.items) {
      setNavItems(docsData.items.map((i) => i.id))
    }
    return () => setNavItems([])
  }, [activeTab, docsData?.items, setNavItems])

  // -- Filters ----------------------------------------------------------------

  const docTypeFilterOptions = useMemo(() => {
    if (!docTypes) return []
    return docTypes.map((dt) => ({ value: dt.id, label: dt.code }))
  }, [docTypes])

  const documentFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'select', options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
    { id: 'doc_type_id', label: 'Type', type: 'select', options: docTypeFilterOptions },
    { id: 'classification', label: 'Classification', type: 'select', options: CLASSIFICATION_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  ], [docTypeFilterOptions])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // -- Columns ----------------------------------------------------------------

  const documentColumns = useMemo<ColumnDef<REDocument, unknown>[]>(() => [
    {
      accessorKey: 'number',
      header: 'Numero',
      size: 140,
      cell: ({ row }) => <span className="font-mono font-medium text-xs">{row.original.number}</span>,
    },
    {
      accessorKey: 'title',
      header: 'Titre',
      cell: ({ row }) => <span className="text-foreground">{row.original.title}</span>,
    },
    {
      accessorKey: 'doc_type_name',
      header: 'Type',
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.doc_type_name || '--'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'classification',
      header: 'Classification',
      size: 110,
      cell: ({ row }) => <ClassificationBadge classification={row.original.classification} />,
    },
    {
      accessorKey: 'current_rev_code',
      header: 'Revision',
      size: 80,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.current_rev_code || '--'}</span>,
    },
    {
      accessorKey: 'updated_at',
      header: 'Date',
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{formatDate(row.original.updated_at)}</span>,
    },
    {
      accessorKey: 'creator_name',
      header: 'Createur',
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.creator_name || '--'}</span>,
    },
  ], [])

  // -- Template columns (manual table, not DataTable) -------------------------

  // -- DocType columns (manual table, not DataTable) --------------------------

  const docsPagination: DataTablePagination | undefined = docsData
    ? { page: docsData.page, pageSize, total: docsData.total, pages: docsData.pages }
    : undefined

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'report-editor'

  // Toolbar action button per tab
  const toolbarAction = useMemo(() => {
    if (activeTab === 'documents') {
      return (
        <ToolbarButton
          icon={Plus}
          label="Nouveau document"
          variant="primary"
          onClick={() => openDynamicPanel({ type: 'create', module: 'report-editor' })}
        />
      )
    }
    if (activeTab === 'templates') {
      return (
        <ToolbarButton
          icon={Plus}
          label="Nouveau template"
          variant="primary"
          onClick={() => openDynamicPanel({ type: 'create', module: 'report-editor', meta: { subtype: 'template' } })}
        />
      )
    }
    if (activeTab === 'doc-types') {
      return (
        <ToolbarButton
          icon={Plus}
          label="Nouveau type"
          variant="primary"
          onClick={() => openDynamicPanel({ type: 'create', module: 'report-editor', meta: { subtype: 'doc-type' } })}
        />
      )
    }
    return null
  }, [activeTab, openDynamicPanel])

  // -- Tab Content Rendering --------------------------------------------------

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            documents={docsData?.items ?? []}
            counts={documentCounts ?? { draft: 0, in_review: 0, approved: 0, published: 0, obsolete: 0, archived: 0 }}
            onNavigateToDocuments={navigateToDocuments}
          />
        )

      case 'documents':
        return (
          <DataTable<REDocument>
            columns={documentColumns}
            data={docsData?.items ?? []}
            isLoading={docsLoading}
            pagination={docsPagination}
            onPaginationChange={(p, size) => {
              if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p)
            }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par numero ou titre..."
            filters={documentFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'report-editor', id: row.id })}
            emptyIcon={Files}
            emptyTitle="Aucun document"
            importExport={{
              exportFormats: ['csv', 'xlsx'],
              advancedExport: true,
              filenamePrefix: 'documents',
              exportHeaders: {
                number: 'Numero',
                title: 'Titre',
                doc_type_name: 'Type',
                status: 'Statut',
                classification: 'Classification',
                current_rev_code: 'Revision',
                updated_at: 'Date',
                creator_name: 'Createur',
              },
            }}
            columnResizing
            columnVisibility
            storageKey="report-editor-documents"
          />
        )

      case 'templates':
        return (
          <div className="p-4">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileCode2 size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Aucun template</p>
                <p className="text-xs mt-1">Creez votre premier template pour commencer.</p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Nom</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type de document</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Version</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Champs</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Actif</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Cree le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((tpl: Template) => (
                      <tr
                        key={tpl.id}
                        className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer"
                        onClick={() => openDynamicPanel({ type: 'detail', module: 'report-editor', id: tpl.id, meta: { subtype: 'template' } })}
                      >
                        <td className="px-3 py-2 font-medium text-foreground">{tpl.name}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{tpl.doc_type_name || '--'}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">v{tpl.version}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">{tpl.field_count}</td>
                        <td className="px-3 py-2">
                          {tpl.is_active ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Actif</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">Inactif</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">{formatDate(tpl.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )

      case 'doc-types':
        return (
          <div className="p-4">
            {docTypesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : !docTypes || docTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderCog size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Aucun type de document</p>
                <p className="text-xs mt-1">Definissez vos types pour organiser la nomenclature documentaire.</p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Code</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Nom</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Discipline</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Schema de revision</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Nomenclature</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Actif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docTypes.map((dt: DocType) => {
                      // Render the name from the i18n Record — use 'fr' or first key
                      const displayName = dt.name.fr || dt.name.en || Object.values(dt.name)[0] || dt.code
                      return (
                        <tr
                          key={dt.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer"
                          onClick={() => openDynamicPanel({ type: 'detail', module: 'report-editor', id: dt.id, meta: { subtype: 'doc-type' } })}
                        >
                          <td className="px-3 py-2 font-mono font-medium text-foreground text-xs">{dt.code}</td>
                          <td className="px-3 py-2 text-foreground">{displayName}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{dt.discipline || '--'}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{dt.revision_scheme}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs font-mono">{dt.nomenclature_pattern}</td>
                          <td className="px-3 py-2">
                            {dt.is_active ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Actif</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">Inactif</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
    }
  }

  // -- Render -----------------------------------------------------------------

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={FileText} title="Report Editor" subtitle="Gestion documentaire et workflow">
            {toolbarAction}
          </PanelHeader>

          <div className="flex items-center gap-1 px-4 border-b border-border shrink-0 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <PanelContent>
            {renderTabContent()}
          </PanelContent>
        </div>
      )}

      {/* Dynamic Panel Rendering — detail or create */}
      {dynamicPanel?.module === 'report-editor' && dynamicPanel.type === 'detail' && !dynamicPanel.meta?.subtype && (
        <DocumentDetailPanel id={dynamicPanel.id} />
      )}
      {dynamicPanel?.module === 'report-editor' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'doc-type' && (
        <DocTypeDetailPanel id={dynamicPanel.id} />
      )}
      {dynamicPanel?.module === 'report-editor' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'template' && (
        <TemplateDetailPanel id={dynamicPanel.id} />
      )}
      {dynamicPanel?.module === 'report-editor' && dynamicPanel.type === 'create' && !dynamicPanel.meta?.subtype && (
        <CreateDocumentPanel />
      )}
    </div>
  )
}

// -- Create Document Panel ---------------------------------------------------

function CreateDocumentPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const createDoc = useCreateDocument()
  const { data: docTypes } = useDocTypes()
  const [form, setForm] = useState({ title: '', doc_type_id: '', classification: 'INT', language: 'fr' })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.doc_type_id) {
      toast({ title: 'Erreur', description: 'Titre et type de document requis', variant: 'error' })
      return
    }
    try {
      await createDoc.mutateAsync(form)
      toast({ title: 'Document cree' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la creation', variant: 'error' })
    }
  }, [form, createDoc, toast, closeDynamicPanel])

  return (
    <DynamicPanelShell
      title="Nouveau document"
      subtitle="Report Editor"
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            Annuler
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createDoc.isPending}
            onClick={() => (document.getElementById('create-document-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createDoc.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Creer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-document-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            {/* Column 1: Identification */}
            <div className="@container space-y-5">
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label="Titre" required span="full">
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className={panelInputClass}
                      placeholder="Titre du document"
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Type de document" required>
                    <select
                      required
                      value={form.doc_type_id}
                      onChange={(e) => setForm((f) => ({ ...f, doc_type_id: e.target.value }))}
                      className={panelInputClass}
                    >
                      <option value="">Selectionner...</option>
                      {docTypes?.map((dt: DocType) => (
                        <option key={dt.id} value={dt.id}>
                          {dt.code} — {dt.name.fr || dt.name.en || dt.code}
                        </option>
                      ))}
                    </select>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>

            {/* Column 2: Parametres */}
            <div className="@container space-y-5">
              <FormSection title="Parametres">
                <FormGrid>
                  <DynamicPanelField label="Classification">
                    <select
                      value={form.classification}
                      onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                      className={panelInputClass}
                    >
                      <option value="INT">Interne</option>
                      <option value="CONF">Confidentiel</option>
                      <option value="REST">Restreint</option>
                      <option value="PUB">Public</option>
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Langue">
                    <select
                      value={form.language}
                      onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                      className={panelInputClass}
                    >
                      <option value="fr">Francais</option>
                      <option value="en">English</option>
                    </select>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <p className="text-[10px] text-muted-foreground px-1">
                Tags, notes et fichiers joints seront geres dans la fiche apres creation.
              </p>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Create DocType Panel -----------------------------------------------------

function CreateDocTypePanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    code: '',
    name_fr: '',
    name_en: '',
    nomenclature_pattern: '{ENTITY}-{DOCTYPE}-{SEQ:4}',
    discipline: '',
    revision_scheme: 'alpha' as 'alpha' | 'numeric' | 'semver',
    default_language: 'fr',
  })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code.trim() || !form.name_fr.trim() || !form.nomenclature_pattern.trim()) {
      toast({ title: 'Erreur', description: 'Code, nom et nomenclature requis', variant: 'error' })
      return
    }
    try {
      await reportEditorService.createDocType({
        code: form.code,
        name: { fr: form.name_fr, en: form.name_en || form.name_fr },
        nomenclature_pattern: form.nomenclature_pattern,
        discipline: form.discipline || undefined,
        revision_scheme: form.revision_scheme,
        default_language: form.default_language,
      })
      queryClient.invalidateQueries({ queryKey: ['report-editor', 'doc-types'] })
      toast({ title: 'Type de document cree' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la creation', variant: 'error' })
    }
  }, [form, toast, closeDynamicPanel, queryClient])

  return (
    <DynamicPanelShell
      title="Nouveau type de document"
      subtitle="Report Editor"
      icon={<FolderCog size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton
            variant="primary"
            onClick={() => (document.getElementById('create-doctype-form') as HTMLFormElement)?.requestSubmit()}
          >
            Creer
          </PanelActionButton>
        </>
      }
    >
      <form id="create-doctype-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label="Code" required>
                    <input type="text" required value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={panelInputClass} placeholder="NOTE, PROC, RPT..." />
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom (FR)" required>
                    <input type="text" required value={form.name_fr} onChange={(e) => setForm(f => ({ ...f, name_fr: e.target.value }))} className={panelInputClass} placeholder="Note technique" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom (EN)">
                    <input type="text" value={form.name_en} onChange={(e) => setForm(f => ({ ...f, name_en: e.target.value }))} className={panelInputClass} placeholder="Technical Note" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Discipline">
                    <input type="text" value={form.discipline} onChange={(e) => setForm(f => ({ ...f, discipline: e.target.value }))} className={panelInputClass} placeholder="MECA, ELEC, PROC..." />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>
            <div className="@container space-y-5">
              <FormSection title="Nomenclature">
                <FormGrid>
                  <DynamicPanelField label="Pattern de nomenclature" required span="full">
                    <input type="text" required value={form.nomenclature_pattern} onChange={(e) => setForm(f => ({ ...f, nomenclature_pattern: e.target.value }))} className={panelInputClass} placeholder="{ENTITY}-{DOCTYPE}-{SEQ:4}" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Schema de revision">
                    <select value={form.revision_scheme} onChange={(e) => setForm(f => ({ ...f, revision_scheme: e.target.value as 'alpha' | 'numeric' | 'semver' }))} className={panelInputClass}>
                      <option value="alpha">Alphabetique (A, B, C...)</option>
                      <option value="numeric">Numerique (1, 2, 3...)</option>
                      <option value="semver">Semantique (1.0, 1.1...)</option>
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Langue par defaut">
                    <select value={form.default_language} onChange={(e) => setForm(f => ({ ...f, default_language: e.target.value }))} className={panelInputClass}>
                      <option value="fr">Francais</option>
                      <option value="en">English</option>
                    </select>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <p className="text-[10px] text-muted-foreground px-1">
                Tokens : {'{ENTITY}'}, {'{DOCTYPE}'}, {'{DISCIPLINE}'}, {'{PHASE}'}, {'{SEQ:N}'}, {'{YYYY}'}
              </p>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// -- Create Template Panel ----------------------------------------------------

function CreateTemplatePanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: docTypes } = useDocTypes()
  const [form, setForm] = useState({
    name: '',
    description: '',
    doc_type_id: '',
  })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: 'Erreur', description: 'Nom du template requis', variant: 'error' })
      return
    }
    try {
      await reportEditorService.createTemplate({
        name: form.name,
        description: form.description || undefined,
        doc_type_id: form.doc_type_id || undefined,
        structure: {},
        styles: {},
      })
      queryClient.invalidateQueries({ queryKey: ['report-editor', 'templates'] })
      toast({ title: 'Template cree' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la creation', variant: 'error' })
    }
  }, [form, toast, closeDynamicPanel, queryClient])

  return (
    <DynamicPanelShell
      title="Nouveau template"
      subtitle="Report Editor"
      icon={<FileCode2 size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton
            variant="primary"
            onClick={() => (document.getElementById('create-template-form') as HTMLFormElement)?.requestSubmit()}
          >
            Creer
          </PanelActionButton>
        </>
      }
    >
      <form id="create-template-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Nom" required span="full">
                <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={panelInputClass} placeholder="Nom du template" />
              </DynamicPanelField>
              <DynamicPanelField label="Type de document">
                <select value={form.doc_type_id} onChange={(e) => setForm(f => ({ ...f, doc_type_id: e.target.value }))} className={panelInputClass}>
                  <option value="">Tous types</option>
                  {docTypes?.map((dt: DocType) => (
                    <option key={dt.id} value={dt.id}>{dt.code} — {dt.name.fr || dt.name.en || dt.code}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Description" span="full">
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className={panelInputClass + ' min-h-[60px]'} placeholder="Description du template..." rows={3} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <p className="text-[10px] text-muted-foreground px-3 pb-3">
            La structure et les styles seront edites dans le detail du template apres creation.
          </p>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- DocType Detail Panel ------------------------------------------------------

function DocTypeDetailPanel({ id }: { id: string }) {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const { data: docTypes, isLoading } = useDocTypes()
  const updateDocType = useUpdateDocType()

  const docType = useMemo(() => docTypes?.find((dt) => dt.id === id), [docTypes, id])

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name_fr: '', name_en: '', discipline: '', nomenclature_pattern: '' })

  useEffect(() => {
    if (docType) {
      setForm({
        name_fr: docType.name?.fr || '',
        name_en: docType.name?.en || '',
        discipline: docType.discipline || '',
        nomenclature_pattern: docType.nomenclature_pattern || '',
      })
    }
  }, [docType])

  const handleSave = useCallback(async () => {
    if (!docType) return
    try {
      await updateDocType.mutateAsync({
        id: docType.id,
        payload: {
          name: { fr: form.name_fr, en: form.name_en || form.name_fr },
          discipline: form.discipline || undefined,
          nomenclature_pattern: form.nomenclature_pattern,
        },
      })
      toast({ title: 'Type de document mis a jour', variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la mise a jour', variant: 'error' })
    }
  }, [docType, form, updateDocType, toast])

  if (isLoading) {
    return (
      <DynamicPanelShell title="Type de document" subtitle="Chargement..." icon={<FolderCog size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (!docType) {
    return (
      <DynamicPanelShell title="Type de document" subtitle="Non trouve" icon={<FolderCog size={14} className="text-primary" />}>
        <div className="p-4 text-sm text-muted-foreground">Type de document introuvable.</div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={docType.code}
      subtitle="Type de document"
      icon={<FolderCog size={14} className="text-primary" />}
      actions={
        editing ? (
          <>
            <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
            <PanelActionButton variant="primary" disabled={updateDocType.isPending} onClick={handleSave}>
              {updateDocType.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
            </PanelActionButton>
          </>
        ) : (
          <PanelActionButton onClick={() => setEditing(true)}>Modifier</PanelActionButton>
        )
      }
    >
      <PanelContentLayout>
        <FormSection title="Identification">
          <FormGrid>
            <ReadOnlyRow label="Code" value={docType.code} />
            {editing ? (
              <>
                <DynamicPanelField label="Nom (FR)">
                  <input type="text" value={form.name_fr} onChange={(e) => setForm(f => ({ ...f, name_fr: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Nom (EN)">
                  <input type="text" value={form.name_en} onChange={(e) => setForm(f => ({ ...f, name_en: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Discipline">
                  <input type="text" value={form.discipline} onChange={(e) => setForm(f => ({ ...f, discipline: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
              </>
            ) : (
              <>
                <ReadOnlyRow label="Nom (FR)" value={docType.name?.fr || '--'} />
                <ReadOnlyRow label="Nom (EN)" value={docType.name?.en || '--'} />
                <ReadOnlyRow label="Discipline" value={docType.discipline || '--'} />
              </>
            )}
          </FormGrid>
        </FormSection>
        <FormSection title="Nomenclature">
          <FormGrid>
            {editing ? (
              <DynamicPanelField label="Pattern" span="full">
                <input type="text" value={form.nomenclature_pattern} onChange={(e) => setForm(f => ({ ...f, nomenclature_pattern: e.target.value }))} className={panelInputClass} />
              </DynamicPanelField>
            ) : (
              <ReadOnlyRow label="Pattern" value={docType.nomenclature_pattern} />
            )}
            <ReadOnlyRow label="Schema de revision" value={docType.revision_scheme} />
            <ReadOnlyRow label="Langue par defaut" value={docType.default_language} />
            <ReadOnlyRow label="Actif" value={docType.is_active ? 'Oui' : 'Non'} />
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}


// -- Template Detail Panel ----------------------------------------------------

function TemplateDetailPanel({ id }: { id: string }) {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const { data: templates, isLoading } = useTemplates()
  const { data: docTypes } = useDocTypes()
  const updateTemplate = useUpdateTemplate()

  const template = useMemo(() => templates?.find((t) => t.id === id), [templates, id])
  const docTypeName = useMemo(() => {
    if (!template?.doc_type_id || !docTypes) return '--'
    const dt = docTypes.find((d) => d.id === template.doc_type_id)
    return dt ? `${dt.code} — ${dt.name?.fr || dt.code}` : '--'
  }, [template, docTypes])

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name || '',
        description: template.description || '',
      })
    }
  }, [template])

  const handleSave = useCallback(async () => {
    if (!template) return
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        payload: {
          name: form.name,
          description: form.description || undefined,
        },
      })
      toast({ title: 'Template mis a jour', variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: 'Erreur', description: 'Echec de la mise a jour', variant: 'error' })
    }
  }, [template, form, updateTemplate, toast])

  if (isLoading) {
    return (
      <DynamicPanelShell title="Template" subtitle="Chargement..." icon={<FileCode2 size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (!template) {
    return (
      <DynamicPanelShell title="Template" subtitle="Non trouve" icon={<FileCode2 size={14} className="text-primary" />}>
        <div className="p-4 text-sm text-muted-foreground">Template introuvable.</div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={template.name}
      subtitle="Template"
      icon={<FileCode2 size={14} className="text-primary" />}
      actions={
        editing ? (
          <>
            <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
            <PanelActionButton variant="primary" disabled={updateTemplate.isPending} onClick={handleSave}>
              {updateTemplate.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
            </PanelActionButton>
          </>
        ) : (
          <PanelActionButton onClick={() => setEditing(true)}>Modifier</PanelActionButton>
        )
      }
    >
      <PanelContentLayout>
        <FormSection title="Informations">
          <FormGrid>
            {editing ? (
              <>
                <DynamicPanelField label="Nom" span="full">
                  <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Description" span="full">
                  <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className={panelInputClass + ' min-h-[60px]'} rows={3} />
                </DynamicPanelField>
              </>
            ) : (
              <>
                <ReadOnlyRow label="Nom" value={template.name} />
                <ReadOnlyRow label="Description" value={template.description || '--'} />
              </>
            )}
            <ReadOnlyRow label="Type de document" value={docTypeName} />
            <ReadOnlyRow label="Version" value={String(template.version)} />
            <ReadOnlyRow label="Nombre de champs" value={String(template.field_count)} />
            <ReadOnlyRow label="Actif" value={template.is_active ? 'Oui' : 'Non'} />
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}


// -- Panel Renderer Registration ----------------------------------------------

registerPanelRenderer('report-editor', (view) => {
  if (view.type === 'detail' && 'id' in view && !view.meta?.subtype) {
    return <DocumentDetailPanel id={view.id} />
  }
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'doc-type') {
    return <DocTypeDetailPanel id={view.id} />
  }
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'template') {
    return <TemplateDetailPanel id={view.id} />
  }
  if (view.type === 'create' && !view.meta?.subtype) {
    return <CreateDocumentPanel />
  }
  if (view.type === 'create' && view.meta?.subtype === 'doc-type') {
    return <CreateDocTypePanel />
  }
  if (view.type === 'create' && view.meta?.subtype === 'template') {
    return <CreateTemplatePanel />
  }
  return null
})
