/**
 * SupportPage — Ticket system for bug reports, feature requests, and questions.
 *
 * User view: own tickets + submit form.
 * Admin view: all tickets + filters + stats + assignment.
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LifeBuoy, Plus, Loader2, Trash2, Bug, Lightbulb, HelpCircle, MoreHorizontal,
  MessageSquare, CheckCircle2, Clock, AlertTriangle,
  BarChart3, ArrowRight, Send, X, Lock, Paperclip, Megaphone,
  Eye, EyeOff, Pin,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTableFilterDef } from '@/components/ui/DataTable/types'
import { BadgeCell, DateCell } from '@/components/ui/DataTable'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid,
  DynamicPanelField, PanelActionButton, DangerConfirmButton, DetailFieldGrid,
  InlineEditableRow, ReadOnlyRow, panelInputClass,
} from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { TabBar } from '@/components/ui/Tabs'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { useToast } from '@/components/ui/Toast'
import {
  useTickets, useTicket, useCreateTicket, useUpdateTicket, useDeleteTicket,
  useResolveTicket, useCloseTicket, useReopenTicket,
  useTicketComments, useAddComment, useTicketStatusHistory, useTicketStats,
} from '@/hooks/useSupport'
import type { SupportTicket, TicketCreate, TicketComment, StatusHistoryEntry } from '@/services/supportService'
import { useAnnouncements, useCreateAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement } from '@/hooks/useAnnouncements'
import type { Announcement, AnnouncementCreate } from '@/services/announcementService'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// ── Constants ────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof Bug> = { bug: Bug, improvement: Lightbulb, question: HelpCircle, other: MoreHorizontal }
const TYPE_LABELS: Record<string, string> = { bug: 'Bug', improvement: 'Amélioration', question: 'Question', other: 'Autre' }
const PRIORITY_LABELS: Record<string, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique' }
const PRIORITY_VARIANTS: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' }
const STATUS_LABELS: Record<string, string> = { open: 'Ouvert', in_progress: 'En cours', waiting_info: 'En attente', resolved: 'Résolu', closed: 'Fermé', rejected: 'Rejeté' }
const STATUS_VARIANTS: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = { open: 'info', in_progress: 'warning', waiting_info: 'neutral', resolved: 'success', closed: 'neutral', rejected: 'danger' }

// ── Column definitions ───────────────────────────────────────

const ticketColumns: ColumnDef<SupportTicket, unknown>[] = [
  {
    accessorKey: 'reference',
    header: 'Réf.',
    cell: ({ getValue }) => <span className="text-xs font-mono font-semibold text-primary">{getValue() as string}</span>,
    size: 90,
  },
  {
    accessorKey: 'title',
    header: 'Titre',
    cell: ({ getValue }) => <span className="text-sm font-medium text-foreground truncate block max-w-[300px]">{getValue() as string}</span>,
    size: 300,
  },
  {
    accessorKey: 'ticket_type',
    header: 'Type',
    cell: ({ getValue }) => {
      const t = getValue() as string
      const Icon = TYPE_ICONS[t] || HelpCircle
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon size={12} />
          {TYPE_LABELS[t] || t}
        </span>
      )
    },
    size: 110,
  },
  {
    accessorKey: 'priority',
    header: 'Priorité',
    cell: ({ getValue }) => <BadgeCell value={PRIORITY_LABELS[getValue() as string] || (getValue() as string)} variant={PRIORITY_VARIANTS[getValue() as string] || 'neutral'} />,
    size: 90,
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ getValue }) => <BadgeCell value={STATUS_LABELS[getValue() as string] || (getValue() as string)} variant={STATUS_VARIANTS[getValue() as string] || 'neutral'} />,
    size: 100,
  },
  {
    accessorKey: 'reporter_name',
    header: 'Rapporté par',
    cell: ({ getValue }) => <span className="text-xs text-muted-foreground truncate">{(getValue() as string) || '—'}</span>,
    size: 130,
  },
  {
    accessorKey: 'assignee_name',
    header: 'Assigné à',
    cell: ({ getValue }) => <span className="text-xs text-muted-foreground truncate">{(getValue() as string) || '—'}</span>,
    size: 130,
  },
  {
    accessorKey: 'comment_count',
    header: '',
    cell: ({ getValue }) => {
      const c = getValue() as number
      return c > 0 ? <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><MessageSquare size={10} />{c}</span> : null
    },
    size: 40,
  },
  {
    accessorKey: 'created_at',
    header: 'Créé le',
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 120,
  },
]

// ── Filter definitions ───────────────────────────────────────

const FILTER_DEFS: DataTableFilterDef[] = [
  {
    id: 'status', label: 'Statut', type: 'select',
    options: [{ value: '', label: 'Tous' }, ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))],
  },
  {
    id: 'priority', label: 'Priorité', type: 'select',
    options: [{ value: '', label: 'Toutes' }, ...Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))],
  },
  {
    id: 'ticket_type', label: 'Type', type: 'select',
    options: [{ value: '', label: 'Tous' }, ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))],
  },
]

// ── Create Ticket Panel ─────────────────────────────────────

function CreateTicketPanel() {
  const createTicket = useCreateTicket()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const [form, setForm] = useState<TicketCreate>({
    title: '',
    description: '',
    ticket_type: 'bug',
    priority: 'medium',
    source_url: window.location.href,
    browser_info: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    },
  })

  const handleSubmit = async () => {
    if (!form.title.trim()) return
    try {
      await createTicket.mutateAsync(form)
      toast({ title: 'Ticket soumis avec succès', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur lors de la soumission', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Soumettre un ticket"
      subtitle="Support & Feedback"
      icon={<LifeBuoy size={14} className="text-primary" />}
      actions={
        <PanelActionButton
          icon={<Send size={12} />}
          onClick={handleSubmit}
          disabled={createTicket.isPending || !form.title.trim()}
        >
          Soumettre
        </PanelActionButton>
      }
    >
      <PanelContentLayout>
        <FormSection title="Informations">
          <FormGrid>
            <DynamicPanelField label="Titre" required>
              <input
                className={panelInputClass}
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Décrivez brièvement le problème..."
                autoFocus
              />
            </DynamicPanelField>
            <DynamicPanelField label="Type">
              <select className={panelInputClass} value={form.ticket_type} onChange={e => setForm({ ...form, ticket_type: e.target.value as TicketCreate['ticket_type'] })}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Priorité">
              <select className={panelInputClass} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as TicketCreate['priority'] })}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title="Description">
          <textarea
            className={cn(panelInputClass, 'min-h-[120px] resize-y')}
            value={form.description || ''}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Décrivez le problème en détail, les étapes pour le reproduire..."
          />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ── Ticket Detail Panel ─────────────────────────────────────

function TicketDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: ticket } = useTicket(id)
  const updateTicket = useUpdateTicket()
  const deleteTicket = useDeleteTicket()
  const resolveTicket = useResolveTicket()
  const closeTicket = useCloseTicket()
  const reopenTicket = useReopenTicket()
  const { data: comments } = useTicketComments(id)
  const { data: history } = useTicketStatusHistory(id)
  const addComment = useAddComment()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { hasPermission } = usePermission()
  const isAdmin = hasPermission('support.ticket.manage')
  const { toast } = useToast()
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [detailTab, setDetailTab] = useState<'details' | 'comments' | 'attachments' | 'history'>('details')

  const handleSave = useCallback((field: string, value: string) => {
    updateTicket.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateTicket])

  const handleDelete = useCallback(async () => {
    await deleteTicket.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Ticket archivé', variant: 'success' })
  }, [id, deleteTicket, closeDynamicPanel, toast])

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim()) return
    await addComment.mutateAsync({ ticketId: id, body: commentText, isInternal })
    setCommentText('')
    toast({ title: 'Commentaire ajouté', variant: 'success' })
  }, [id, commentText, isInternal, addComment, toast])

  if (!ticket) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<LifeBuoy size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={ticket.reference}
      subtitle={ticket.title}
      icon={<LifeBuoy size={14} className="text-primary" />}
      actions={
        <>
          {isAdmin && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <PanelActionButton icon={<CheckCircle2 size={12} />} onClick={() => resolveTicket.mutate({ id })} disabled={resolveTicket.isPending}>
              Résoudre
            </PanelActionButton>
          )}
          {isAdmin && ticket.status === 'resolved' && (
            <PanelActionButton icon={<X size={12} />} onClick={() => closeTicket.mutate(id)} disabled={closeTicket.isPending}>
              Fermer
            </PanelActionButton>
          )}
          {isAdmin && (ticket.status === 'resolved' || ticket.status === 'closed') && (
            <PanelActionButton icon={<ArrowRight size={12} />} onClick={() => reopenTicket.mutate(id)} disabled={reopenTicket.isPending}>
              Rouvrir
            </PanelActionButton>
          )}
          <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Archiver ?">
            {t('common.delete')}
          </DangerConfirmButton>
        </>
      }
    >
      {/* Sub-tabs */}
      <TabBar
        items={[
          { id: 'details' as const, label: 'Détails', icon: LifeBuoy },
          { id: 'comments' as const, label: `Commentaires (${comments?.length ?? 0})`, icon: MessageSquare },
          { id: 'attachments' as const, label: 'Pièces jointes', icon: Paperclip },
          { id: 'history' as const, label: 'Historique', icon: Clock },
        ]}
        activeId={detailTab}
        onTabChange={setDetailTab}
      />

      <PanelContentLayout>
        {detailTab === 'details' && (
          <>
            <FormSection title="Informations">
              <DetailFieldGrid>
                <ReadOnlyRow label="Référence" value={<span className="font-mono font-semibold text-primary">{ticket.reference}</span>} />
                <InlineEditableRow label="Titre" value={ticket.title} onSave={(v) => handleSave('title', v)} />
                <ReadOnlyRow label="Type" value={
                  <span className="flex items-center gap-1.5">
                    {(() => { const Icon = TYPE_ICONS[ticket.ticket_type] || HelpCircle; return <Icon size={12} /> })()}
                    {TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type}
                  </span>
                } />
                <ReadOnlyRow label="Priorité" value={<BadgeCell value={PRIORITY_LABELS[ticket.priority] || ticket.priority} variant={PRIORITY_VARIANTS[ticket.priority] || 'neutral'} />} />
                <ReadOnlyRow label="Statut" value={<BadgeCell value={STATUS_LABELS[ticket.status] || ticket.status} variant={STATUS_VARIANTS[ticket.status] || 'neutral'} />} />
                <ReadOnlyRow label="Rapporté par" value={ticket.reporter_name || '—'} />
                <ReadOnlyRow label="Assigné à" value={ticket.assignee_name || '—'} />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="Description" collapsible defaultExpanded>
              <InlineEditableRow label="Description" value={ticket.description || ''} onSave={(v) => handleSave('description', v)} />
            </FormSection>

            {ticket.resolution_notes && (
              <FormSection title="Notes de résolution" collapsible defaultExpanded>
                <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.resolution_notes}</p>
              </FormSection>
            )}

            {ticket.source_url && (
              <FormSection title="Contexte" collapsible defaultExpanded={false}>
                <ReadOnlyRow label="URL source" value={<a href={ticket.source_url} className="text-xs text-primary hover:underline truncate block max-w-[300px]">{ticket.source_url}</a>} />
                {ticket.browser_info && (
                  <ReadOnlyRow label="Navigateur" value={<span className="text-xs font-mono text-muted-foreground">{(ticket.browser_info as Record<string, string>).userAgent?.slice(0, 80)}...</span>} />
                )}
              </FormSection>
            )}
          </>
        )}

        {detailTab === 'comments' && (
          <div className="space-y-3">
            {/* Comment thread */}
            {(comments ?? []).map((c: TicketComment) => (
              <div key={c.id} className={cn('border rounded-lg p-3', c.is_internal ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-900/10' : 'border-border')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">{c.author_name || 'Utilisateur'}</span>
                  {c.is_internal && <span className="flex items-center gap-0.5 text-[9px] text-amber-600"><Lock size={8} />Interne</span>}
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(c.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}

            {/* Add comment form */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <textarea
                className={cn(panelInputClass, 'min-h-[60px] resize-y')}
                placeholder="Ajouter un commentaire..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <div className="flex items-center justify-between">
                {hasPermission('support.comment.internal') && (
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="h-3 w-3 rounded" />
                    <Lock size={9} /> Note interne
                  </label>
                )}
                <button
                  className="gl-button-sm gl-button-confirm ml-auto"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || addComment.isPending}
                >
                  {addComment.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        )}

        {detailTab === 'attachments' && (
          <AttachmentManager ownerType="support_ticket" ownerId={id} />
        )}

        {detailTab === 'history' && (
          <div className="space-y-2">
            {(history ?? []).map((h: StatusHistoryEntry) => (
              <div key={h.id} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock size={10} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {h.old_status && <BadgeCell value={STATUS_LABELS[h.old_status] || h.old_status} variant={STATUS_VARIANTS[h.old_status] || 'neutral'} />}
                    {h.old_status && <ArrowRight size={10} className="text-muted-foreground" />}
                    <BadgeCell value={STATUS_LABELS[h.new_status] || h.new_status} variant={STATUS_VARIANTS[h.new_status] || 'neutral'} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {h.changed_by_name || 'Système'} · {new Date(h.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {h.note && <p className="text-xs text-muted-foreground mt-0.5 italic">{h.note}</p>}
                </div>
              </div>
            ))}
            {(!history || history.length === 0) && (
              <p className="text-xs text-muted-foreground text-center py-4">Aucun historique</p>
            )}
          </div>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ── Stats Cards (admin) ─────────────────────────────────────

function SupportStatsCards() {
  const { data: stats } = useTicketStats()
  if (!stats) return null

  const cards = [
    { label: 'Total', value: stats.total, icon: LifeBuoy, color: 'text-primary' },
    { label: 'Ouverts', value: stats.open, icon: AlertTriangle, color: 'text-blue-500' },
    { label: 'En cours', value: stats.in_progress, icon: Clock, color: 'text-amber-500' },
    { label: 'Résolus', value: stats.resolved, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Cette semaine', value: stats.resolved_this_week, icon: BarChart3, color: 'text-violet-500' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-3 border-b border-border shrink-0">
      {cards.map(c => (
        <div key={c.label} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/10">
          <c.icon size={16} className={c.color} />
          <div>
            <p className="text-lg font-bold text-foreground">{c.value}</p>
            <p className="text-[10px] text-muted-foreground">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Announcements Admin Tab ──────────────────────────────────

const DISPLAY_LABELS: Record<string, string> = { dashboard: 'Tableau de bord', banner: 'Bannière', login: 'Login', all: 'Partout', modal: 'Modal', logout: 'Déconnexion' }
const PRIORITY_BADGE: Record<string, 'info' | 'warning' | 'danger' | 'neutral'> = { info: 'info', warning: 'warning', critical: 'danger', maintenance: 'neutral' }

function AnnouncementsAdminTab() {
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const { data, isLoading } = useAnnouncements({ page, page_size: pageSize, active_only: false })
  const createAnn = useCreateAnnouncement()
  const updateAnn = useUpdateAnnouncement()
  const deleteAnn = useDeleteAnnouncement()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<AnnouncementCreate>({
    title: '', body: '', priority: 'info', target_type: 'all', display_location: 'banner', pinned: false, send_email: false,
  })

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) return
    await createAnn.mutateAsync(form)
    toast({ title: 'Annonce publiée', variant: 'success' })
    setShowCreate(false)
    setForm({ title: '', body: '', priority: 'info', target_type: 'all', display_location: 'banner', pinned: false, send_email: false })
  }

  const handleToggleActive = async (ann: Announcement) => {
    await updateAnn.mutateAsync({ id: ann.id, body: { active: !ann.active } })
    toast({ title: ann.active ? 'Annonce désactivée' : 'Annonce activée', variant: 'success' })
  }

  const handleDelete = async (ann: Announcement) => {
    const ok = await confirm({ title: 'Supprimer l\'annonce ?', message: ann.title, variant: 'danger', confirmLabel: 'Supprimer' })
    if (ok) {
      await deleteAnn.mutateAsync(ann.id)
      toast({ title: 'Annonce supprimée', variant: 'success' })
    }
  }

  const annColumns: ColumnDef<Announcement, unknown>[] = [
    { accessorKey: 'title', header: 'Titre', cell: ({ getValue }) => <span className="text-sm font-medium truncate block max-w-[250px]">{getValue() as string}</span>, size: 250 },
    { accessorKey: 'priority', header: 'Priorité', cell: ({ getValue }) => <BadgeCell value={String(getValue())} variant={PRIORITY_BADGE[getValue() as string] || 'neutral'} />, size: 90 },
    { accessorKey: 'display_location', header: 'Emplacement', cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{DISPLAY_LABELS[getValue() as string] || String(getValue())}</span>, size: 110 },
    { accessorKey: 'active', header: 'Actif', cell: ({ row }) => (
      <button onClick={(e) => { e.stopPropagation(); handleToggleActive(row.original) }} className="p-0.5">
        {row.original.active ? <Eye size={14} className="text-emerald-500" /> : <EyeOff size={14} className="text-muted-foreground" />}
      </button>
    ), size: 50 },
    { accessorKey: 'pinned', header: '', cell: ({ row }) => row.original.pinned ? <Pin size={11} className="text-amber-500" /> : null, size: 30 },
    { accessorKey: 'created_at', header: 'Créé le', cell: ({ getValue }) => <DateCell value={getValue() as string} />, size: 120 },
    { id: 'actions', header: '', size: 40, cell: ({ row }) => (
      <button onClick={(e) => { e.stopPropagation(); handleDelete(row.original) }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 size={12} />
      </button>
    ) },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Create announcement form */}
      {showCreate && (
        <div className="border-b border-border p-4 space-y-3 bg-muted/10 shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <input className="gl-form-input text-sm col-span-2" placeholder="Titre de l'annonce..." value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
            <textarea className="gl-form-input text-sm col-span-2 min-h-[60px] resize-y" placeholder="Contenu..." value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            <select className="gl-form-select text-xs" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              <option value="info">Info</option><option value="warning">Attention</option><option value="critical">Critique</option><option value="maintenance">Maintenance</option>
            </select>
            <select className="gl-form-select text-xs" value={form.display_location} onChange={e => setForm({ ...form, display_location: e.target.value })}>
              <option value="banner">Bannière</option><option value="dashboard">Tableau de bord</option><option value="all">Partout</option><option value="login">Page login</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} className="h-3 w-3 rounded" /> Épinglée</label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={form.send_email} onChange={e => setForm({ ...form, send_email: e.target.checked })} className="h-3 w-3 rounded" /> Envoyer par email</label>
            <div className="ml-auto flex gap-2">
              <button className="gl-button-sm gl-button-default" onClick={() => setShowCreate(false)}>Annuler</button>
              <button className="gl-button-sm gl-button-confirm" onClick={handleCreate} disabled={!form.title.trim() || !form.body.trim() || createAnn.isPending}>
                {createAnn.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Publier
              </button>
            </div>
          </div>
        </div>
      )}

      <DataTable<Announcement>
        columns={annColumns}
        data={data?.items ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        storageKey="support-announcements"
        pagination={data ? { page: data.page, pageSize: data.page_size, total: data.total, pages: data.pages } : undefined}
        onPaginationChange={(p, size) => { setPage(p); setPageSize(size) }}
        sortable
        emptyIcon={Megaphone}
        emptyTitle="Aucune annonce"
      />
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────

type SupportTab = 'tickets' | 'announcements'

export function SupportPage() {
  useTranslation() // loaded for future i18n
  const [activeTab, setActiveTab] = useState<SupportTab>('tickets')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const { hasPermission } = usePermission()
  const isAdmin = hasPermission('support.ticket.manage')
  const canCreate = hasPermission('support.ticket.create')
  const canManageAnnouncements = hasPermission('messaging.announcement.create')
  const [showCreateAnn, setShowCreateAnn] = useState(false)

  const { data, isLoading } = useTickets({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    ticket_type: typeFilter || undefined,
    search: debouncedSearch || undefined,
  })

  const handleFilterChange = useCallback((id: string, value: unknown) => {
    const v = typeof value === 'string' ? value : Array.isArray(value) ? value[0] || '' : String(value ?? '')
    if (id === 'status') { setStatusFilter(v); setPage(1) }
    if (id === 'priority') { setPriorityFilter(v); setPage(1) }
    if (id === 'ticket_type') { setTypeFilter(v); setPage(1) }
  }, [])

  const toolbarAction = activeTab === 'tickets' && canCreate
    ? <ToolbarButton icon={Plus} label="Soumettre un ticket" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'support' })} />
    : activeTab === 'announcements' && canManageAnnouncements
      ? <ToolbarButton icon={Plus} label="Nouvelle annonce" variant="primary" onClick={() => setShowCreateAnn(v => !v)} />
      : null

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader
          title="Support & Feedback"
          subtitle="Tickets, annonces et communication"
          icon={LifeBuoy}
        >
          {toolbarAction}
        </PanelHeader>

        <TabBar
          items={[
            { id: 'tickets' as const, label: 'Tickets', icon: LifeBuoy },
            ...(canManageAnnouncements ? [{ id: 'announcements' as const, label: 'Annonces', icon: Megaphone }] : []),
          ]}
          activeId={activeTab}
          onTabChange={(id) => setActiveTab(id as SupportTab)}
        />

        {activeTab === 'tickets' && (
          <>
            {isAdmin && <SupportStatsCards />}
            <PanelContent>
              <DataTable<SupportTicket>
                columns={ticketColumns}
                data={data?.items ?? []}
                isLoading={isLoading}
                getRowId={(row) => row.id}
                storageKey="support-tickets"
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Rechercher par référence, titre..."
                pagination={data ? { page: data.page, pageSize: data.page_size, total: data.total, pages: data.pages } : undefined}
                onPaginationChange={(p, size) => { setPage(p); setPageSize(size) }}
                sortable
                columnVisibility
                columnResizing
                filters={FILTER_DEFS}
                activeFilters={{ status: statusFilter, priority: priorityFilter, ticket_type: typeFilter }}
                onFilterChange={handleFilterChange}
                onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'support', id: row.id })}
                emptyIcon={LifeBuoy}
                emptyTitle="Aucun ticket"
              />
            </PanelContent>
          </>
        )}

        {activeTab === 'announcements' && (
          <PanelContent>
            <AnnouncementsAdminTab key={showCreateAnn ? 'show' : 'hide'} />
          </PanelContent>
        )}
      </div>

      {/* Dynamic panel — rendered inline */}
      {dynamicPanel?.module === 'support' && dynamicPanel.type === 'create' && <CreateTicketPanel />}
      {dynamicPanel?.module === 'support' && dynamicPanel.type === 'detail' && 'id' in dynamicPanel && <TicketDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Panel renderer registration ─────────────────────────────

registerPanelRenderer('support', (view) => {
  if (view.type === 'create') return <CreateTicketPanel />
  if (view.type === 'detail' && 'id' in view) return <TicketDetailPanel id={view.id} />
  return null
})

export default SupportPage
