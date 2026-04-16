/**
 * Papyrus page — document management with workflow, templates, and doc types.
 *
 * Tabs: Tableau de bord | Documents | Templates | Types de document
 * - Dashboard: KPI cards by status, recent activity
 * - Documents: DataTable with filters (status, doc_type, classification, search)
 * - Templates: list with create button
 * - Types de document: list of doc types
 *
 * Detail panel: metadata, revision info, workflow actions, export, share, revision history
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  FileText, Plus, Loader2, Trash2, LayoutDashboard, Files, FileCode2, FolderCog,
  Send, CheckCircle2, XCircle, Globe, Download, Link2, Clock,
  Archive, PenTool, GitCompare, ChevronDown, ChevronRight, Folder, PanelLeftClose, PanelLeft, Upload,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { usePageSize } from '@/hooks/usePageSize'
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
import { usePermission } from '@/hooks/usePermission'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useToast } from '@/components/ui/Toast'
import {
  useDocuments,
  useDocument,
  useDeleteDocument,
  useArchiveDocument,
  useSubmitDocument,
  useApproveDocument,
  useRejectDocument,
  usePublishDocument,
  useDocumentWorkflowState,
  useDocumentTransition,
  useDocTypes,
  useUpdateDocType,
  useTemplates,
  useUpdateTemplate,
  useCreateShareLink,
  useRevisions,
  useRevision,
  usePapyrusDocument,
  useRenderedPapyrusDocument,
  usePapyrusVersions,
  usePapyrusSchedule,
  useUpdatePapyrusSchedule,
  usePapyrusDispatchRuns,
  useRunPapyrusDispatchNow,
  usePapyrusForms,
  usePapyrusPresets,
  useInstantiatePapyrusPreset,
  useCreatePapyrusForm,
  useUpdatePapyrusForm,
  useImportPapyrusEpiCollect,
  usePapyrusSubmissions,
  useCreatePapyrusExternalLink,
  useExportPapyrusEpiCollect,
  useCreateRevision,
  useSaveDraft,
  useCreateDocument,
  useRevisionDiff,
  useArborescenceNodes,
  useImportMDR,
} from '@/hooks/usePapyrus'
import { papyrusService } from '@/services/papyrusService'
import { DocumentEditor } from '@/components/papyrus/DocumentEditor'
import { PapyrusFormBuilder } from '@/components/papyrus/PapyrusFormBuilder'
import { PapyrusFormRunner } from '@/components/papyrus/PapyrusFormRunner'
import { useProjects } from '@/hooks/useProjets'
import type {
  Document as REDocument,
  DocType,
  Template,
  RevisionSummary,
  RevisionDiff,
  ArborescenceNode,
  PapyrusDocument,
  PapyrusForm,
  PapyrusSchedule,
} from '@/services/papyrusService'

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

// -- Arborescence Tree Node ---------------------------------------------------

function ArborescenceTreeNode({
  node,
  allNodes,
  depth = 0,
  selectedId,
  onSelect,
}: {
  node: ArborescenceNode
  allNodes: ArborescenceNode[]
  depth?: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const children = allNodes.filter((n) => n.parent_id === node.id).sort((a, b) => a.display_order - b.display_order)
  const hasChildren = children.length > 0
  const isSelected = selectedId === node.id

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(isSelected ? null : node.id)
        }}
        className={cn(
          'flex w-full items-center gap-1.5 h-7 text-xs hover:bg-accent transition-colors rounded-sm',
          isSelected && 'bg-primary/10 text-primary font-semibold',
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <span
            role="button"
            className="shrink-0 p-0.5"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          >
            {expanded
              ? <ChevronDown size={11} className="text-muted-foreground" />
              : <ChevronRight size={11} className="text-muted-foreground" />
            }
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Folder size={12} className={cn('shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && children.map((child) => (
        <ArborescenceTreeNode
          key={child.id}
          node={child}
          allNodes={allNodes}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

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

// -- Dynamic Workflow Actions (FSM-driven) ------------------------------------

function WorkflowActions({ docId }: { docId: string }) {
  const { data: wfState, isLoading } = useDocumentWorkflowState(docId)
  const transition = useDocumentTransition()
  const { toast } = useToast()
  const { t } = useTranslation()
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
        onSuccess: () => toast({ title: t('papyrus.toast.transition_success'), variant: 'success' }),
        onError: () => toast({ title: t('papyrus.toast.transition_error'), variant: 'error' }),
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
                      toast({ title: t('papyrus.toast.transition_success'), variant: 'success' })
                    },
                    onError: () => toast({ title: t('papyrus.toast.transition_error'), variant: 'error' }),
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

// -- Revision Diff Viewer -----------------------------------------------------

function RevisionDiffViewer({
  diff,
  isLoading,
  revisions,
  revAId,
  revBId,
}: {
  diff: RevisionDiff | undefined
  isLoading: boolean
  revisions: RevisionSummary[]
  revAId: string
  revBId: string
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 border border-border rounded-md bg-muted/10">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Chargement du diff...</span>
      </div>
    )
  }

  if (!diff) return null

  const revA = revisions.find((r) => r.id === revAId)
  const revB = revisions.find((r) => r.id === revBId)
  const addCount = diff.additions?.length ?? 0
  const delCount = diff.deletions?.length ?? 0
  const modCount = diff.modifications?.length ?? 0

  return (
    <div className="mt-3 border border-border rounded-md overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 text-xs">
          <GitCompare size={12} className="text-primary" />
          <span className="font-medium">Comparaison</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">{revA?.rev_code ?? 'Rev A'}</span>
          <span>vs</span>
          <span className="font-mono">{revB?.rev_code ?? 'Rev B'}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border text-xs">
        {revA && revB && (
          <span className="text-muted-foreground">
            Mots: {revA.word_count} &rarr; {revB.word_count}
            {' '}
            <span className={revB.word_count >= revA.word_count ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              ({revB.word_count >= revA.word_count ? '+' : ''}{revB.word_count - revA.word_count})
            </span>
          </span>
        )}
        <span className="text-green-600 dark:text-green-400">+{addCount} ajout{addCount !== 1 ? 's' : ''}</span>
        <span className="text-red-600 dark:text-red-400">-{delCount} suppression{delCount !== 1 ? 's' : ''}</span>
        <span className="text-amber-600 dark:text-amber-400">{modCount} modification{modCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Diff content */}
      <div className="p-3 space-y-1 max-h-[300px] overflow-y-auto text-xs">
        {addCount === 0 && delCount === 0 && modCount === 0 && (
          <p className="text-muted-foreground py-2 text-center">Aucune difference detectee.</p>
        )}
        {diff.additions?.map((item, i) => (
          <div key={`add-${i}`} className="flex gap-2 px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500">
            <span className="text-green-600 dark:text-green-400 font-mono shrink-0">+</span>
            <span className="text-green-800 dark:text-green-300">{String(item.text ?? item.content ?? JSON.stringify(item))}</span>
          </div>
        ))}
        {diff.deletions?.map((item, i) => (
          <div key={`del-${i}`} className="flex gap-2 px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500">
            <span className="text-red-600 dark:text-red-400 font-mono shrink-0">-</span>
            <span className="text-red-800 dark:text-red-300 line-through">{String(item.text ?? item.content ?? JSON.stringify(item))}</span>
          </div>
        ))}
        {diff.modifications?.map((item, i) => (
          <div key={`mod-${i}`} className="flex gap-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-500">
            <span className="text-amber-600 dark:text-amber-400 font-mono shrink-0">~</span>
            <span className="text-amber-800 dark:text-amber-300">{String(item.text ?? item.content ?? JSON.stringify(item))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// -- Document Detail Panel ----------------------------------------------------

function DocumentDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canDeleteDoc = hasPermission('document.delete')
  const canPublishDoc = hasPermission('document.publish')
  const canApproveDoc = hasPermission('document.approve')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()

  const { data: doc, isLoading: docLoading } = useDocument(id)
  const { data: revisions, isLoading: revisionsLoading } = useRevisions(id)
  const { data: currentRevision } = useRevision(
    id,
    doc?.current_revision_id ?? undefined,
  )
  const { data: papyrusDocument } = usePapyrusDocument(id)
  const { data: renderedPapyrusDocument } = useRenderedPapyrusDocument(id)
  const { data: papyrusVersions } = usePapyrusVersions(id)
  const { data: papyrusSchedule } = usePapyrusSchedule(id)
  const { data: papyrusDispatchRuns } = usePapyrusDispatchRuns(id)
  const { data: papyrusForms } = usePapyrusForms()
  const linkedPapyrusForm = useMemo(
    () => papyrusForms?.find((form: PapyrusForm) => form.document_id === id)
      ?? papyrusForms?.find((form: PapyrusForm) => !form.document_id && form.doc_type_id === doc?.doc_type_id),
    [doc?.doc_type_id, papyrusForms, id],
  )
  const { data: papyrusSubmissions } = usePapyrusSubmissions(linkedPapyrusForm?.id)

  const deleteDocument = useDeleteDocument()
  const archiveDocument = useArchiveDocument()
  const submitDocument = useSubmitDocument()
  const approveDocument = useApproveDocument()
  const rejectDocument = useRejectDocument()
  const publishDocument = usePublishDocument()
  const createShareLink = useCreateShareLink()
  const saveDraft = useSaveDraft()
  const createRevision = useCreateRevision()
  const createPapyrusForm = useCreatePapyrusForm()
  const updatePapyrusForm = useUpdatePapyrusForm()
  const importPapyrusEpiCollect = useImportPapyrusEpiCollect()
  const createPapyrusExternalLink = useCreatePapyrusExternalLink()
  const exportPapyrusEpiCollect = useExportPapyrusEpiCollect()
  const updatePapyrusSchedule = useUpdatePapyrusSchedule()
  const runPapyrusDispatchNow = useRunPapyrusDispatchNow()

  // Dynamic workflow
  const { data: wfState } = useDocumentWorkflowState(id)
  const hasWorkflow = wfState && wfState.current_state !== null

  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [papyrusFormName, setPapyrusFormName] = useState('')
  const [papyrusFormDescription, setPapyrusFormDescription] = useState('')
  const [epicollectImportJson, setEpicollectImportJson] = useState('')
  const [latestExternalUrl, setLatestExternalUrl] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState<PapyrusSchedule>({
    enabled: false,
    cron: '0 6 * * 1-5',
    timezone: 'UTC',
    grace_minutes: 15,
    conditions: [],
    recipients: [],
    channel: { type: 'email', subject: '', format: 'pdf_attached' },
  })
  const [scheduleConditionsJson, setScheduleConditionsJson] = useState('[]')
  const [scheduleRecipientsInput, setScheduleRecipientsInput] = useState('')

  // Revision diff state
  const [selectedRevisions, setSelectedRevisions] = useState<string[]>([])
  const [showDiff, setShowDiff] = useState(false)
  const diffRevA = selectedRevisions.length === 2 ? selectedRevisions[0] : undefined
  const diffRevB = selectedRevisions.length === 2 ? selectedRevisions[1] : undefined
  const { data: revisionDiff, isLoading: diffLoading } = useRevisionDiff(id, diffRevA, diffRevB)

  useEffect(() => {
    if (!papyrusSchedule) return
    setScheduleForm({
      enabled: papyrusSchedule.enabled,
      cron: papyrusSchedule.cron,
      timezone: papyrusSchedule.timezone ?? 'UTC',
      grace_minutes: papyrusSchedule.grace_minutes,
      conditions: papyrusSchedule.conditions ?? [],
      recipients: papyrusSchedule.recipients ?? [],
      channel: {
        type: papyrusSchedule.channel?.type ?? 'email',
        smtp_override: papyrusSchedule.channel?.smtp_override ?? null,
        from_address: papyrusSchedule.channel?.from_address ?? null,
        subject: papyrusSchedule.channel?.subject ?? '',
        format: papyrusSchedule.channel?.format ?? 'pdf_attached',
      },
      last_run_at: papyrusSchedule.last_run_at,
      last_success_at: papyrusSchedule.last_success_at,
      last_status: papyrusSchedule.last_status,
    })
    setScheduleConditionsJson(JSON.stringify(papyrusSchedule.conditions ?? [], null, 2))
    setScheduleRecipientsInput((papyrusSchedule.recipients ?? []).join('\n'))
  }, [papyrusSchedule])

  const handleToggleRevisionSelect = useCallback((revId: string) => {
    setSelectedRevisions((prev) => {
      if (prev.includes(revId)) return prev.filter((r) => r !== revId)
      if (prev.length >= 2) return [prev[1], revId] // Replace oldest
      return [...prev, revId]
    })
    setShowDiff(false)
  }, [])

  const handleEditorChange = useCallback(
    (content: PapyrusDocument) => {
      saveDraft.mutate({
        id,
        payload: { content: content as unknown as Record<string, unknown> },
      })
    },
    [id, saveDraft],
  )

  const handleSaveStructuredFormData = useCallback(async (formData: Record<string, unknown>) => {
    try {
      await saveDraft.mutateAsync({
        id,
        payload: {
          content: (papyrusDocument ?? currentRevision?.content ?? {}) as Record<string, unknown>,
          form_data: formData,
        },
      })
      toast({ title: t('papyrus.structured_form.saved'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.structured_form.save_error'), variant: 'error' })
    }
  }, [currentRevision?.content, id, papyrusDocument, saveDraft, t, toast])

  const handleCreateRevision = useCallback(async () => {
    try {
      await createRevision.mutateAsync(id)
      toast({ title: t('papyrus.toast.new_revision_created'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.new_revision_error'), variant: 'error' })
    }
  }, [id, createRevision, toast])

  const handleDelete = useCallback(async () => {
    try {
      await deleteDocument.mutateAsync(id)
      closeDynamicPanel()
      toast({ title: t('papyrus.toast.document_deleted'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.document_delete_error'), variant: 'error' })
    }
  }, [id, deleteDocument, closeDynamicPanel, toast])

  const handleArchive = useCallback(async () => {
    try {
      await archiveDocument.mutateAsync(id)
      toast({ title: t('papyrus.toast.document_archived'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.document_archive_error'), variant: 'error' })
    }
  }, [id, archiveDocument, toast])

  const handleSubmit = useCallback(async () => {
    try {
      await submitDocument.mutateAsync({ id })
      toast({ title: t('papyrus.toast.document_submitted'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.document_submit_error'), variant: 'error' })
    }
  }, [id, submitDocument, toast])

  const handleApprove = useCallback(async () => {
    try {
      await approveDocument.mutateAsync({ id })
      toast({ title: t('papyrus.toast.document_approved'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.document_approve_error'), variant: 'error' })
    }
  }, [id, approveDocument, toast])

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      toast({ title: t('papyrus.toast.reject_reason_required'), variant: 'error' })
      return
    }
    try {
      await rejectDocument.mutateAsync({ id, reason: rejectReason })
      setShowRejectInput(false)
      setRejectReason('')
      toast({ title: t('papyrus.toast.document_rejected'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.document_reject_error'), variant: 'error' })
    }
  }, [id, rejectReason, rejectDocument, toast])

  const handlePublish = useCallback(async () => {
    try {
      await publishDocument.mutateAsync({ id })
      toast({ title: t('papyrus.toast.document_published'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.document_publish_error'), variant: 'error' })
    }
  }, [id, publishDocument, toast])

  const handleShareLink = useCallback(async () => {
    try {
      const link = await createShareLink.mutateAsync({ docId: id, payload: { expires_days: 30 } })
      await navigator.clipboard.writeText(`${window.location.origin}/share/${link.token}`)
      toast({ title: t('papyrus.toast.share_link_copied'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.share_link_error'), variant: 'error' })
    }
  }, [id, createShareLink, toast])

  const handleExportPdf = useCallback(() => {
    const url = papyrusService.exportPdf(id)
    window.open(url, '_blank')
  }, [id])

  const handleExportDocx = useCallback(() => {
    const url = papyrusService.exportDocx(id)
    window.open(url, '_blank')
  }, [id])

  const handleCreatePapyrusForm = useCallback(async () => {
    try {
      const title = papyrusFormName.trim() || `${doc?.title || 'Document'} - Formulaire`
      await createPapyrusForm.mutateAsync({
        document_id: id,
        doc_type_id: doc?.doc_type_id,
        name: title,
        description: papyrusFormDescription.trim() || undefined,
        schema_json: {
          version: 1,
          fields: [
            { id: 'commentaire', type: 'textarea', label: 'Commentaire', required: false },
          ],
        },
        settings_json: {},
      })
      setPapyrusFormName('')
      setPapyrusFormDescription('')
      toast({ title: t('papyrus.toast.papyrus_form_created'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.papyrus_form_create_error'), variant: 'error' })
    }
  }, [createPapyrusForm, doc?.doc_type_id, doc?.title, id, papyrusFormDescription, papyrusFormName, toast])

  const handleGenerateExternalFormLink = useCallback(async () => {
    if (!linkedPapyrusForm) {
      toast({ title: t('papyrus.toast.papyrus_form_required'), variant: 'error' })
      return
    }
    try {
      const link = await createPapyrusExternalLink.mutateAsync({
        formId: linkedPapyrusForm.id,
        payload: {
          expires_in_hours: 24 * 7,
          max_submissions: 1,
          prefill: { document_number: doc?.number || id, document_title: doc?.title || 'Document' },
          require_identity: true,
        },
      })
      setLatestExternalUrl(link.external_url)
      await navigator.clipboard.writeText(link.external_url)
      toast({ title: t('papyrus.toast.external_link_copied'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.external_link_error'), variant: 'error' })
    }
  }, [createPapyrusExternalLink, doc?.number, doc?.title, id, linkedPapyrusForm, toast])

  const handleImportEpiCollect = useCallback(async () => {
    try {
      const parsed = JSON.parse(epicollectImportJson) as { project?: Record<string, unknown> }
      const project = parsed?.project
      if (!project || typeof project !== 'object') {
        throw new Error('missing project')
      }
      await importPapyrusEpiCollect.mutateAsync({
        document_id: id,
        name: papyrusFormName.trim() || `${doc?.title || 'Document'} - EpiCollect`,
        description: papyrusFormDescription.trim() || 'Imported from EpiCollect5',
        project,
      })
      setEpicollectImportJson('')
      setPapyrusFormName('')
      setPapyrusFormDescription('')
      toast({ title: t('papyrus.toast.epicollect_imported'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.epicollect_invalid_json'), variant: 'error' })
    }
  }, [doc?.title, id, importPapyrusEpiCollect, epicollectImportJson, papyrusFormDescription, papyrusFormName, toast])

  const handleSavePapyrusFormSchema = useCallback(async (schema: Record<string, unknown>) => {
    if (!linkedPapyrusForm) return
    try {
      await updatePapyrusForm.mutateAsync({
        formId: linkedPapyrusForm.id,
        payload: {
          schema_json: schema,
        },
      })
      toast({ title: t('papyrus.toast.papyrus_form_schema_saved'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.papyrus_form_save_error'), variant: 'error' })
    }
  }, [linkedPapyrusForm, toast, updatePapyrusForm])

  const handleExportEpiCollect = useCallback(async () => {
    if (!linkedPapyrusForm) return
    try {
      const payload = await exportPapyrusEpiCollect.mutateAsync(linkedPapyrusForm.id)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${linkedPapyrusForm.name || 'papyrus-form'}.epicollect.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast({ title: t('papyrus.toast.epicollect_export_success'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.epicollect_export_error'), variant: 'error' })
    }
  }, [exportPapyrusEpiCollect, linkedPapyrusForm, toast])

  const handleSaveSchedule = useCallback(async () => {
    try {
      const parsedConditions = JSON.parse(scheduleConditionsJson)
      if (!Array.isArray(parsedConditions)) {
        throw new Error('conditions')
      }
      await updatePapyrusSchedule.mutateAsync({
        docId: id,
        payload: {
          enabled: scheduleForm.enabled,
          cron: scheduleForm.cron,
          timezone: scheduleForm.timezone || null,
          grace_minutes: scheduleForm.grace_minutes,
          conditions: parsedConditions,
          recipients: scheduleRecipientsInput
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          channel: scheduleForm.channel,
        },
      })
      toast({ title: t('papyrus.toast.schedule_saved'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.schedule_invalid'), variant: 'error' })
    }
  }, [id, scheduleConditionsJson, scheduleForm, scheduleRecipientsInput, toast, updatePapyrusSchedule])

  const handleRunDispatchNow = useCallback(async () => {
    try {
      await runPapyrusDispatchNow.mutateAsync(id)
      toast({ title: t('papyrus.toast.dispatch_launched'), variant: 'success' })
    } catch {
      toast({ title: t('papyrus.toast.dispatch_error'), variant: 'error' })
    }
  }, [id, runPapyrusDispatchNow, toast])

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
        canDeleteDoc ? (
          <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
            {t('common.delete')}
          </DangerConfirmButton>
        ) : undefined
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
                content={papyrusDocument ?? currentRevision?.content}
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

        <FormSection title="Historique Papyrus" collapsible>
          {!papyrusVersions || papyrusVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune version technique Papyrus enregistree.</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Version</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Tag workflow</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Message</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {papyrusVersions.map((version) => (
                    <tr key={version.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{version.version}</td>
                      <td className="px-3 py-2">{version.patch_type}</td>
                      <td className="px-3 py-2">{version.workflow_tag || '--'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{version.message || '--'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(version.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>

        <FormSection title="Apercu rendu Papyrus" collapsible>
          {!renderedPapyrusDocument ? (
            <p className="text-sm text-muted-foreground">Rendu Papyrus indisponible.</p>
          ) : (
            <div className="space-y-3">
              <DetailFieldGrid>
                <ReadOnlyRow label="Version" value={String(renderedPapyrusDocument.version)} />
                <ReadOnlyRow label="Rendu le" value={renderedPapyrusDocument.rendered_at ? formatDate(renderedPapyrusDocument.rendered_at) : '--'} />
                <ReadOnlyRow label="Refs resolues" value={String(Object.keys(renderedPapyrusDocument.resolved_refs ?? {}).length)} />
                <ReadOnlyRow label="Blocs" value={String(renderedPapyrusDocument.blocks?.length ?? 0)} />
              </DetailFieldGrid>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">References resolues</div>
                <pre className="rounded-md border border-border bg-muted/20 p-3 text-[11px] overflow-x-auto">
{JSON.stringify(renderedPapyrusDocument.resolved_refs ?? {}, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Blocs rendus</div>
                <pre className="rounded-md border border-border bg-muted/20 p-3 text-[11px] overflow-x-auto">
{JSON.stringify(renderedPapyrusDocument.blocks ?? [], null, 2)}
                </pre>
              </div>
            </div>
          )}
        </FormSection>

        <FormSection title="Formulaire Papyrus" collapsible defaultExpanded={false}>
          {!linkedPapyrusForm ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Aucun formulaire Papyrus n’est encore lie a ce document.
              </p>
              <div className="grid gap-2">
                <input
                  value={papyrusFormName}
                  onChange={(e) => setPapyrusFormName(e.target.value)}
                  className={panelInputClass}
                  placeholder="Nom du formulaire"
                />
                <textarea
                  value={papyrusFormDescription}
                  onChange={(e) => setPapyrusFormDescription(e.target.value)}
                  className={cn(panelInputClass, 'min-h-[90px]')}
                  placeholder="Description optionnelle"
                />
                <textarea
                  value={epicollectImportJson}
                  onChange={(e) => setEpicollectImportJson(e.target.value)}
                  className={cn(panelInputClass, 'min-h-[140px] font-mono text-xs')}
                  placeholder="Coller ici un JSON EpiCollect5 pour import"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gl-button-sm gl-button-confirm"
                  onClick={handleCreatePapyrusForm}
                  disabled={createPapyrusForm.isPending}
                >
                  {createPapyrusForm.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  <span>Creer le formulaire</span>
                </button>
                <button
                  type="button"
                  className="gl-button-sm gl-button-default"
                  onClick={handleImportEpiCollect}
                  disabled={importPapyrusEpiCollect.isPending || !epicollectImportJson.trim()}
                >
                  {importPapyrusEpiCollect.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  <span>Importer EpiCollect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <DetailFieldGrid>
                <ReadOnlyRow label="Nom" value={linkedPapyrusForm.name} />
                <ReadOnlyRow label="Actif" value={linkedPapyrusForm.is_active ? 'Oui' : 'Non'} />
                <ReadOnlyRow label="Cree le" value={formatDate(linkedPapyrusForm.created_at)} />
                <ReadOnlyRow
                  label={t('papyrus.scope')}
                  value={
                    linkedPapyrusForm.document_id
                      ? t('papyrus.scope_values.document')
                      : linkedPapyrusForm.doc_type_id
                        ? t('papyrus.scope_values.doc_type')
                        : '--'
                  }
                />
              </DetailFieldGrid>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t('papyrus.structured_form.title')}</div>
                <PapyrusFormRunner
                  schema={linkedPapyrusForm.schema_json}
                  value={currentRevision?.form_data as Record<string, unknown> | undefined}
                  readOnly={doc.status !== 'draft' || !hasPermission('document.edit')}
                  isSaving={saveDraft.isPending}
                  attachmentOwnerType="document"
                  attachmentOwnerId={doc.id}
                  onSave={handleSaveStructuredFormData}
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Builder de formulaire</div>
                <PapyrusFormBuilder
                  schema={linkedPapyrusForm.schema_json}
                  disabled={!hasPermission('document.update')}
                  isSaving={updatePapyrusForm.isPending}
                  onSave={handleSavePapyrusFormSchema}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gl-button-sm gl-button-default"
                  onClick={handleGenerateExternalFormLink}
                  disabled={createPapyrusExternalLink.isPending}
                >
                  {createPapyrusExternalLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                  <span>Generer un lien externe</span>
                </button>
                <button
                  type="button"
                  className="gl-button-sm gl-button-default"
                  onClick={handleExportEpiCollect}
                  disabled={exportPapyrusEpiCollect.isPending}
                >
                  {exportPapyrusEpiCollect.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  <span>Exporter EpiCollect</span>
                </button>
              </div>
              {latestExternalUrl ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Dernier lien genere</div>
                  <div className="text-xs break-all">{latestExternalUrl}</div>
                </div>
              ) : null}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Soumissions externes{papyrusSubmissions ? ` (${papyrusSubmissions.length})` : ''}
                </div>
                {!papyrusSubmissions || papyrusSubmissions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune soumission recue pour le moment.</p>
                ) : (
                  <div className="space-y-2">
                    {papyrusSubmissions.slice(0, 10).map((submission) => (
                      <div key={submission.id} className="rounded-md border border-border bg-muted/10 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{submission.status}</span>
                          <span className="text-muted-foreground">{formatDate(submission.submitted_at)}</span>
                        </div>
                        <div className="text-muted-foreground break-all">
                          {JSON.stringify(submission.answers)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </FormSection>

        <FormSection title="Rapport automatise" collapsible defaultExpanded={false}>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleForm.enabled}
                  onChange={(e) => setScheduleForm((current) => ({ ...current, enabled: e.target.checked }))}
                />
                <span>Activer la planification</span>
              </label>
              <select
                value={scheduleForm.channel.type}
                onChange={(e) => setScheduleForm((current) => ({
                  ...current,
                  channel: { ...current.channel, type: e.target.value as 'email' | 'in_app' },
                }))}
                className={panelInputClass}
              >
                <option value="email">Email</option>
                <option value="in_app">Notification in-app</option>
              </select>
              <input
                value={scheduleForm.cron ?? ''}
                onChange={(e) => setScheduleForm((current) => ({ ...current, cron: e.target.value }))}
                className={panelInputClass}
                placeholder="0 6 * * 1-5"
              />
              <input
                value={scheduleForm.timezone ?? ''}
                onChange={(e) => setScheduleForm((current) => ({ ...current, timezone: e.target.value }))}
                className={panelInputClass}
                placeholder="Africa/Kinshasa"
              />
              <input
                type="number"
                min={1}
                max={1440}
                value={scheduleForm.grace_minutes}
                onChange={(e) => setScheduleForm((current) => ({ ...current, grace_minutes: Number(e.target.value || 15) }))}
                className={panelInputClass}
                placeholder="Grace minutes"
              />
              <input
                value={scheduleForm.channel.subject ?? ''}
                onChange={(e) => setScheduleForm((current) => ({
                  ...current,
                  channel: { ...current.channel, subject: e.target.value },
                }))}
                className={panelInputClass}
                placeholder="Sujet ex: Rapport {{ document.title }} - {{ date }}"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Destinataires</div>
                <textarea
                  value={scheduleRecipientsInput}
                  onChange={(e) => setScheduleRecipientsInput(e.target.value)}
                  className={cn(panelInputClass, 'min-h-[120px] font-mono text-xs')}
                  placeholder={'user:uuid\ngroup:admin\nemail:ops@example.com'}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Conditions JSON</div>
                <textarea
                  value={scheduleConditionsJson}
                  onChange={(e) => setScheduleConditionsJson(e.target.value)}
                  className={cn(panelInputClass, 'min-h-[120px] font-mono text-xs')}
                  placeholder={'[\n  {"kpi":"kpi://project/uuid/progress","op":"<","value":80}\n]'}
                />
              </div>
            </div>

            <DetailFieldGrid>
              <ReadOnlyRow label="Dernier run" value={papyrusSchedule?.last_run_at ? formatDate(papyrusSchedule.last_run_at) : '--'} />
              <ReadOnlyRow label="Dernier succes" value={papyrusSchedule?.last_success_at ? formatDate(papyrusSchedule.last_success_at) : '--'} />
              <ReadOnlyRow label="Dernier statut" value={papyrusSchedule?.last_status || '--'} />
            </DetailFieldGrid>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="gl-button-sm gl-button-confirm"
                onClick={handleSaveSchedule}
                disabled={updatePapyrusSchedule.isPending}
              >
                {updatePapyrusSchedule.isPending ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                <span>Enregistrer le schedule</span>
              </button>
              <button
                type="button"
                className="gl-button-sm gl-button-default"
                onClick={handleRunDispatchNow}
                disabled={runPapyrusDispatchNow.isPending}
              >
                {runPapyrusDispatchNow.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                <span>Executer maintenant</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Historique des dispatchs{papyrusDispatchRuns ? ` (${papyrusDispatchRuns.length})` : ''}
              </div>
              {!papyrusDispatchRuns || papyrusDispatchRuns.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun dispatch Papyrus enregistre.</p>
              ) : (
                <div className="space-y-2">
                  {papyrusDispatchRuns.slice(0, 10).map((run) => (
                    <div key={run.id} className="rounded-md border border-border bg-muted/10 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{run.status}</span>
                        <span className="text-muted-foreground">{formatDate(run.created_at)}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {run.trigger_type} · {run.channel_type} · {run.trigger_key}
                      </div>
                      {run.error_message ? (
                        <div className="text-red-600 dark:text-red-400 break-all">{run.error_message}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
                  {workflowActions.canApprove && canApproveDoc && (
                    <button
                      onClick={handleApprove}
                      disabled={approveDocument.isPending}
                      className="gl-button-sm gl-button-confirm"
                    >
                      {approveDocument.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      <span>Approuver</span>
                    </button>
                  )}
                  {workflowActions.canReject && canApproveDoc && !showRejectInput && (
                    <button
                      onClick={() => setShowRejectInput(true)}
                      className="gl-button-sm gl-button-danger"
                    >
                      <XCircle size={12} />
                      <span>Rejeter</span>
                    </button>
                  )}
                  {workflowActions.canPublish && canPublishDoc && (
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
            <div className="space-y-2">
              {/* Compare button */}
              {revisions.length >= 2 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      'gl-button-sm',
                      selectedRevisions.length === 2 ? 'gl-button-confirm' : 'gl-button-default opacity-50 cursor-not-allowed',
                    )}
                    disabled={selectedRevisions.length !== 2}
                    onClick={() => setShowDiff(true)}
                  >
                    <GitCompare size={12} />
                    <span>Comparer{selectedRevisions.length === 2 ? '' : ' (selectionnez 2)'}</span>
                  </button>
                  {selectedRevisions.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setSelectedRevisions([]); setShowDiff(false) }}
                    >
                      Reinitialiser
                    </button>
                  )}
                </div>
              )}

              {/* Revision list */}
              <div className="space-y-1">
                {revisions.map((rev: RevisionSummary) => (
                  <div
                    key={rev.id}
                    className={cn(
                      'flex items-center gap-2 py-2 px-2 rounded text-xs',
                      doc.current_revision_id === rev.id ? 'bg-primary/5 border border-primary/20' : 'bg-muted/20',
                      selectedRevisions.includes(rev.id) && 'ring-1 ring-primary/40',
                    )}
                  >
                    {/* Checkbox for diff selection */}
                    {revisions.length >= 2 && (
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-border text-primary accent-primary cursor-pointer shrink-0"
                        checked={selectedRevisions.includes(rev.id)}
                        onChange={() => handleToggleRevisionSelect(rev.id)}
                        title="Selectionner pour comparer"
                      />
                    )}
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

              {/* Diff viewer */}
              {showDiff && selectedRevisions.length === 2 && (
                <RevisionDiffViewer
                  diff={revisionDiff}
                  isLoading={diffLoading}
                  revisions={revisions}
                  revAId={selectedRevisions[0]}
                  revBId={selectedRevisions[1]}
                />
              )}
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
  // ── Permissions ──
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('document.create')
  const canAdminPapyrus = hasPermission('document.admin')
  // canEdit / canDelete / canPublish / canApprove checked in DocumentDetailPanel via its own usePermission() call

  const [activeTab, setActiveTab] = useState<ReportEditorTab>('dashboard')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('papyrus.filters', {})
  const [showTreeSidebar, setShowTreeSidebar] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [presetProjectIds, setPresetProjectIds] = useState<Record<string, string>>({})
  const { t } = useTranslation()

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab, selectedNodeId])

  // ── MDR Import ──
  const mdrFileRef = useRef<HTMLInputElement>(null)
  const importMDR = useImportMDR()
  const { data: papyrusPresets } = usePapyrusPresets()
  const instantiatePapyrusPreset = useInstantiatePapyrusPreset()
  const { toast } = useToast()

  const handleMDRFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const result = await importMDR.mutateAsync({ file })
        const parts: string[] = []
        if (result.created_types > 0) parts.push(t('papyrus.toast.mdr_import_types_created', { count: result.created_types }))
        if (result.updated_types > 0) parts.push(t('papyrus.toast.mdr_import_types_updated', { count: result.updated_types }))
        if (result.created_documents > 0) parts.push(t('papyrus.toast.mdr_import_docs_created', { count: result.created_documents }))
        if (result.errors.length > 0) parts.push(t('papyrus.toast.mdr_import_errors', { count: result.errors.length }))
        toast({
          title: t('papyrus.toast.mdr_import_title'),
          description: parts.join(', ') || t('papyrus.toast.mdr_import_done'),
          variant: result.errors.length > 0 ? 'warning' : 'success',
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('papyrus.toast.mdr_import_error_default')
        toast({ title: t('papyrus.toast.mdr_import_error_title'), description: msg, variant: 'error' })
      } finally {
        // Reset file input so same file can be re-imported
        if (mdrFileRef.current) mdrFileRef.current.value = ''
      }
    },
    [importMDR, toast],
  )

  const handleTabChange = useCallback((tab: ReportEditorTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setSelectedNodeId(null)
    setPage(1)
  }, [])

  const handleInstantiatePreset = useCallback(async (presetKey: string) => {
    const selectedProjectId = presetProjectIds[presetKey]
    if (presetKey === 'field_supervision_report' && !selectedProjectId) {
      toast({ title: t('papyrus.toast.preset_select_project'), variant: 'error' })
      return
    }
    try {
      const result = await instantiatePapyrusPreset.mutateAsync({
        presetKey,
        payload: { create_document: true, project_id: selectedProjectId },
      })
      toast({
        title: t('papyrus.presets.instantiated'),
        description: result.document?.number || result.doc_type.code,
        variant: 'success',
      })
      if (result.document) {
        setActiveTab('documents')
        openDynamicPanel({ type: 'detail', module: 'papyrus', id: result.document.id })
      }
    } catch {
      toast({ title: t('papyrus.presets.instantiate_error'), variant: 'error' })
    }
  }, [instantiatePapyrusPreset, openDynamicPanel, presetProjectIds, t, toast])

  // -- Data -------------------------------------------------------------------

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const docTypeFilter = typeof activeFilters.doc_type_id === 'string' ? activeFilters.doc_type_id : undefined
  const classificationFilter = typeof activeFilters.classification === 'string' ? activeFilters.classification : undefined

  // Paginated fetch for the documents tab
  const { data: docsData, isLoading: docsLoading } = useDocuments({
    page: activeTab === 'documents' ? page : 1,
    page_size: activeTab === 'documents' ? pageSize : 1,
    status: activeTab === 'documents' ? statusFilter : undefined,
    doc_type_id: activeTab === 'documents' ? docTypeFilter : undefined,
    classification: activeTab === 'documents' ? classificationFilter : undefined,
    arborescence_node_id: activeTab === 'documents' ? (selectedNodeId ?? undefined) : undefined,
    search: activeTab === 'documents' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: docTypes, isLoading: docTypesLoading } = useDocTypes()
  const { data: templates, isLoading: templatesLoading } = useTemplates()

  // Arborescence tree: project list + nodes
  const [treeProjectId, setTreeProjectId] = useState<string | undefined>(undefined)
  const { data: projectsData } = useProjects({ page: 1, page_size: 200 })
  const { data: arborescenceNodes } = useArborescenceNodes(treeProjectId)

  // Build root-level nodes for the tree
  const rootNodes = useMemo(() => {
    if (!arborescenceNodes) return []
    return arborescenceNodes
      .filter((n: ArborescenceNode) => !n.parent_id)
      .sort((a: ArborescenceNode, b: ArborescenceNode) => a.display_order - b.display_order)
  }, [arborescenceNodes])

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
      header: t('papyrus.columns.number'),
      size: 140,
      cell: ({ row }) => <span className="font-mono font-medium text-xs">{row.original.number}</span>,
    },
    {
      accessorKey: 'title',
      header: t('papyrus.columns.title'),
      cell: ({ row }) => <span className="text-foreground">{row.original.title}</span>,
    },
    {
      accessorKey: 'doc_type_name',
      header: t('papyrus.columns.type'),
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.doc_type_name || '--'}</span>,
    },
    {
      accessorKey: 'status',
      header: t('papyrus.columns.status'),
      size: 110,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'classification',
      header: t('papyrus.columns.classification'),
      size: 110,
      cell: ({ row }) => <ClassificationBadge classification={row.original.classification} />,
    },
    {
      accessorKey: 'current_rev_code',
      header: t('papyrus.columns.revision'),
      size: 80,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.current_rev_code || '--'}</span>,
    },
    {
      accessorKey: 'updated_at',
      header: t('papyrus.columns.date'),
      size: 100,
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{formatDate(row.original.updated_at)}</span>,
    },
    {
      accessorKey: 'creator_name',
      header: t('papyrus.columns.creator'),
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.creator_name || '--'}</span>,
    },
  ], [])

  // -- Template columns (manual table, not DataTable) -------------------------

  // -- DocType columns (manual table, not DataTable) --------------------------

  const docsPagination: DataTablePagination | undefined = docsData
    ? { page: docsData.page, pageSize, total: docsData.total, pages: docsData.pages }
    : undefined

  const isPapyrusPanel = dynamicPanel?.module === 'papyrus' || dynamicPanel?.module === 'report-editor'
  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && isPapyrusPanel

  // Toolbar action button per tab
  const toolbarAction = useMemo(() => {
    if (activeTab === 'documents') {
      return canCreate ? (
        <ToolbarButton
          icon={Plus}
          label="Nouveau document"
          variant="primary"
          onClick={() => openDynamicPanel({ type: 'create', module: 'papyrus' })}
        />
      ) : null
    }
    if (activeTab === 'templates') {
      return canCreate ? (
        <ToolbarButton
          icon={Plus}
          label="Nouveau template"
          variant="primary"
          onClick={() => openDynamicPanel({ type: 'create', module: 'papyrus', meta: { subtype: 'template' } })}
        />
      ) : null
    }
    if (activeTab === 'doc-types') {
      return (
        <div className="flex items-center gap-2">
          <ToolbarButton
            icon={Upload}
            label="Importer MDR"
            onClick={() => mdrFileRef.current?.click()}
            disabled={importMDR.isPending}
          />
          {canCreate && (
            <ToolbarButton
              icon={Plus}
              label="Nouveau type"
              variant="primary"
              onClick={() => openDynamicPanel({ type: 'create', module: 'papyrus', meta: { subtype: 'doc-type' } })}
            />
          )}
        </div>
      )
    }
    return null
  }, [activeTab, canCreate, openDynamicPanel, importMDR.isPending])

  // -- Tab Content Rendering --------------------------------------------------

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-4 p-4">
            <ModuleDashboard module="papyrus" toolbarPortalId="dash-toolbar-papyrus" />
            <div className="rounded-lg border border-border bg-background">
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-semibold text-foreground">{t('papyrus.presets.title')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('papyrus.presets.description')}
                </div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {(papyrusPresets ?? []).map((preset) => {
                  const presetName = preset.name.fr || preset.name.en || preset.key
                  const presetDescription = preset.description.fr || preset.description.en || '--'
                  return (
                    <div key={preset.key} className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-foreground">{presetName}</div>
                        <div className="text-xs text-muted-foreground">{presetDescription}</div>
                      </div>
                      {preset.key === 'field_supervision_report' ? (
                        <div className="space-y-1">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Projet</div>
                          <select
                            value={presetProjectIds[preset.key] ?? ''}
                            onChange={(event) => setPresetProjectIds((current) => ({ ...current, [preset.key]: event.target.value }))}
                            className={panelInputClass}
                          >
                            <option value="">Sélectionner un projet...</option>
                            {(projectsData?.items ?? []).map((project: { id: string; name: string }) => (
                              <option key={project.id} value={project.id}>{project.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {preset.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="gl-button-sm gl-button-confirm"
                        disabled={!canAdminPapyrus || instantiatePapyrusPreset.isPending}
                        onClick={() => handleInstantiatePreset(preset.key)}
                      >
                        {instantiatePapyrusPreset.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        <span>{t('papyrus.presets.create')}</span>
                      </button>
                    </div>
                  )
                })}
                {papyrusPresets && papyrusPresets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {t('papyrus.presets.none')}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )

      case 'documents':
        return (
          <div className="flex h-full">
            {/* Arborescence tree sidebar — hidden on mobile by default
                because at 390px viewport a fixed 200px sidebar leaves
                too little room for content. Users on mobile can still
                toggle it via the show/hide button. */}
            {showTreeSidebar && (
              <div className="hidden sm:flex w-[200px] shrink-0 border-r border-border flex-col bg-muted/20 overflow-hidden">
                {/* Sidebar header */}
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Arborescence</span>
                  <button
                    type="button"
                    onClick={() => setShowTreeSidebar(false)}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                    title="Masquer l'arborescence"
                  >
                    <PanelLeftClose size={14} />
                  </button>
                </div>

                {/* Project selector */}
                <div className="px-2 py-1.5 border-b border-border">
                  <select
                    value={treeProjectId ?? ''}
                    onChange={(e) => {
                      setTreeProjectId(e.target.value || undefined)
                      setSelectedNodeId(null)
                    }}
                    className="w-full text-xs rounded border border-border bg-background px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Selectionner un projet...</option>
                    {projectsData?.items?.map((p: { id: string; name: string }) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Tree content */}
                <div className="flex-1 overflow-y-auto py-1">
                  {/* "All documents" root option */}
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className={cn(
                      'flex w-full items-center gap-1.5 h-7 text-xs px-2 hover:bg-accent transition-colors rounded-sm',
                      !selectedNodeId && 'bg-primary/10 text-primary font-semibold',
                    )}
                  >
                    <Files size={12} className={cn('shrink-0', !selectedNodeId ? 'text-primary' : 'text-muted-foreground')} />
                    <span>Tous les documents</span>
                  </button>

                  {treeProjectId && rootNodes.length > 0 && (
                    <div className="mt-1 border-t border-border pt-1">
                      {rootNodes.map((node: ArborescenceNode) => (
                        <ArborescenceTreeNode
                          key={node.id}
                          node={node}
                          allNodes={arborescenceNodes ?? []}
                          selectedId={selectedNodeId}
                          onSelect={setSelectedNodeId}
                        />
                      ))}
                    </div>
                  )}

                  {treeProjectId && rootNodes.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Aucun noeud d&apos;arborescence
                    </div>
                  )}

                  {!treeProjectId && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Selectionnez un projet pour voir l&apos;arborescence
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Documents table */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Toggle button when sidebar is hidden */}
              {!showTreeSidebar && (
                <div className="px-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowTreeSidebar(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
                    title="Afficher l'arborescence"
                  >
                    <PanelLeft size={14} />
                    <span>Arborescence</span>
                  </button>
                </div>
              )}
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
                onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'papyrus', id: row.id })}
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
                storageKey="papyrus-documents"
              />
            </div>
          </div>
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
                        onClick={() => openDynamicPanel({ type: 'detail', module: 'papyrus', id: tpl.id, meta: { subtype: 'template' } })}
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
                          onClick={() => openDynamicPanel({ type: 'detail', module: 'papyrus', id: dt.id, meta: { subtype: 'doc-type' } })}
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
      {/* Hidden file input for MDR import */}
      <input
        ref={mdrFileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleMDRFileChange}
      />

      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={FileText} title="Papyrus" subtitle="Redaction, documentation et workflow">
            {toolbarAction}
          </PanelHeader>

          <TabBar
            items={TABS}
            activeId={activeTab}
            onTabChange={handleTabChange}
            rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-papyrus" /> : null}
          />

          <PanelContent scroll={false}>
            {renderTabContent()}
          </PanelContent>
        </div>
      )}

      {/* Dynamic Panel Rendering — detail or create */}
      {isPapyrusPanel && dynamicPanel?.type === 'detail' && !dynamicPanel.meta?.subtype && (
        <DocumentDetailPanel id={dynamicPanel.id} />
      )}
      {isPapyrusPanel && dynamicPanel?.type === 'detail' && dynamicPanel.meta?.subtype === 'doc-type' && (
        <DocTypeDetailPanel id={dynamicPanel.id} />
      )}
      {isPapyrusPanel && dynamicPanel?.type === 'detail' && dynamicPanel.meta?.subtype === 'template' && (
        <TemplateDetailPanel id={dynamicPanel.id} />
      )}
      {isPapyrusPanel && dynamicPanel?.type === 'create' && !dynamicPanel.meta?.subtype && (
        <CreateDocumentPanel />
      )}
      {isPapyrusPanel && dynamicPanel?.type === 'create' && dynamicPanel.meta?.subtype === 'doc-type' && (
        <CreateDocTypePanel />
      )}
      {isPapyrusPanel && dynamicPanel?.type === 'create' && dynamicPanel.meta?.subtype === 'template' && (
        <CreateTemplatePanel />
      )}
    </div>
  )
}

export const PapyrusPage = ReportEditorPage

// -- Create Document Panel ---------------------------------------------------

function CreateDocumentPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { toast } = useToast()
  const { t } = useTranslation()
  const createDoc = useCreateDocument()
  const { data: docTypes } = useDocTypes()
  const [form, setForm] = useState({ title: '', doc_type_id: '', classification: 'INT', language: 'fr' })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.doc_type_id) {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.title_and_type_required'), variant: 'error' })
      return
    }
    try {
      await createDoc.mutateAsync(form)
      toast({ title: t('papyrus.toast.document_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.creation_failed'), variant: 'error' })
    }
  }, [form, createDoc, toast, closeDynamicPanel, t])

  return (
    <DynamicPanelShell
      title="Nouveau document"
      subtitle="Papyrus"
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
            {createDoc.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
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
  const { t } = useTranslation()
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
    if (!form.name_fr.trim() || !form.nomenclature_pattern.trim()) {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.name_and_nomenclature_required'), variant: 'error' })
      return
    }
    try {
      await papyrusService.createDocType({
        code: form.code || '',  // Let backend auto-generate if empty
        name: { fr: form.name_fr, en: form.name_en || form.name_fr },
        nomenclature_pattern: form.nomenclature_pattern,
        discipline: form.discipline || undefined,
        revision_scheme: form.revision_scheme,
        default_language: form.default_language,
      })
      queryClient.invalidateQueries({ queryKey: ['papyrus', 'doc-types'] })
      toast({ title: t('papyrus.toast.doc_type_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.creation_failed'), variant: 'error' })
    }
  }, [form, toast, closeDynamicPanel, queryClient, t])

  return (
    <DynamicPanelShell
      title="Nouveau type de document"
      subtitle="Papyrus"
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
                  <DynamicPanelField label="Code">
                    <input type="text" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={cn(panelInputClass, 'font-mono')} placeholder="Auto-genere" />
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
  const { t } = useTranslation()
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
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.template_name_required'), variant: 'error' })
      return
    }
    try {
      await papyrusService.createTemplate({
        name: form.name,
        description: form.description || undefined,
        doc_type_id: form.doc_type_id || undefined,
        structure: {},
        styles: {},
      })
      queryClient.invalidateQueries({ queryKey: ['papyrus', 'templates'] })
      toast({ title: t('papyrus.toast.template_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.creation_failed'), variant: 'error' })
    }
  }, [form, toast, closeDynamicPanel, queryClient, t])

  return (
    <DynamicPanelShell
      title="Nouveau template"
      subtitle="Papyrus"
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
  const { toast } = useToast()
  const { t } = useTranslation()
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
      toast({ title: t('papyrus.toast.doc_type_updated'), variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.update_failed'), variant: 'error' })
    }
  }, [docType, form, updateDocType, toast, t])

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
  const { toast } = useToast()
  const { t } = useTranslation()
  const { data: templates, isLoading } = useTemplates()
  const { data: docTypes } = useDocTypes()
  const updateTemplate = useUpdateTemplate()

  const template = useMemo(() => templates?.find((tmpl) => tmpl.id === id), [templates, id])
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
      toast({ title: t('papyrus.toast.template_updated'), variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: t('papyrus.toast.error'), description: t('papyrus.toast.update_failed'), variant: 'error' })
    }
  }, [template, form, updateTemplate, toast, t])

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

const renderPapyrusPanel = (view: Parameters<typeof registerPanelRenderer>[1] extends (arg: infer T) => unknown ? T : never) => {
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
}

registerPanelRenderer('papyrus', renderPapyrusPanel)
registerPanelRenderer('report-editor', renderPapyrusPanel)
