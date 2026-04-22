/**
 * AnnouncementCenter — TopBar megaphone button + dropdown panel.
 *
 * Shows active announcements for the current user.
 * Users with messaging.announcement.create can create new announcements.
 * Permission-gated: create/edit/delete require specific permissions.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Megaphone, Plus, Loader2, Pin, X, Check, AlertTriangle, Info, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useActiveAnnouncements, useCreateAnnouncement, useDismissAnnouncement, useDeleteAnnouncement } from '@/hooks/useAnnouncements'
import { useToast } from '@/components/ui/Toast'
import type { Announcement, AnnouncementCreate } from '@/services/announcementService'

const PRIORITY_STYLES: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'Info' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'Attention' },
  critical: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', label: 'Critique' },
  maintenance: { icon: Wrench, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', label: 'Maintenance' },
}

export function AnnouncementCenter() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('messaging.announcement.create')
  const canDelete = hasPermission('messaging.announcement.delete')

  const { data, isLoading } = useActiveAnnouncements()
  const dismiss = useDismissAnnouncement()
  const deleteAnn = useDeleteAnnouncement()
  const { toast } = useToast()

  const announcements = data?.items ?? []
  const unreadCount = announcements.filter(a => !a.is_read).length

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowCreate(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 h-7 px-1.5 rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors relative"
        aria-label="Annonces"
        title={t('common.announcements')}
      >
        <Megaphone size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-96 max-h-[480px] rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-xl shadow-black/5 z-50 flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-accent/30 shrink-0">
            <span className="text-xs font-semibold text-foreground">Annonces</span>
            <div className="flex items-center gap-1">
              {canCreate && (
                <button
                  onClick={() => setShowCreate(!showCreate)}
                  className="gl-button-sm gl-button-confirm"
                >
                  <Plus size={11} /> Nouvelle
                </button>
              )}
            </div>
          </div>

          {/* Create form */}
          {showCreate && canCreate && (
            <CreateAnnouncementForm
              onCreated={() => { setShowCreate(false); toast({ title: 'Annonce publiée', variant: 'success' }) }}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {/* Announcement list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && announcements.length === 0 && (
              <div className="py-8 text-center">
                <Megaphone size={20} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">{t('common.no_active_announcement')}</p>
              </div>
            )}

            {!isLoading && announcements.map((ann) => (
              <AnnouncementItem
                key={ann.id}
                announcement={ann}
                onDismiss={() => dismiss.mutate(ann.id)}
                onDelete={canDelete ? () => { deleteAnn.mutate(ann.id); toast({ title: 'Annonce supprimée', variant: 'success' }) } : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Announcement Item ────────────────────────────────────────

function AnnouncementItem({
  announcement: ann,
  onDismiss,
  onDelete,
}: {
  announcement: Announcement
  onDismiss: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const style = PRIORITY_STYLES[ann.priority] || PRIORITY_STYLES.info
  const Icon = style.icon

  const fmtDate = (d: string | null) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
    catch { return '' }
  }

  return (
    <div className={cn(
      'px-3 py-2.5 border-b border-border/30 hover:bg-accent/20 transition-colors',
      !ann.is_read && 'bg-accent/10',
    )}>
      <div className="flex items-start gap-2">
        <div className={cn('shrink-0 h-6 w-6 rounded flex items-center justify-center mt-0.5', style.bg)}>
          <Icon size={12} className={style.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground truncate">{ann.title}</span>
            {ann.pinned && <Pin size={9} className="text-amber-500 shrink-0" />}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{ann.body}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-muted-foreground">{ann.sender_name || 'Système'}</span>
            <span className="text-[9px] text-muted-foreground">{fmtDate(ann.published_at)}</span>
            {ann.expires_at && <span className="text-[9px] text-amber-500">Expire le {fmtDate(ann.expires_at)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!ann.is_read && (
            <button onClick={onDismiss} className="gl-button gl-button-default" title="Marquer comme lu">
              <Check size={10} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="gl-button gl-button-danger dark:hover:bg-red-900/20" title={t('common.delete')}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create Form ──────────────────────────────────────────────

function CreateAnnouncementForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const create = useCreateAnnouncement()
  const [form, setForm] = useState<AnnouncementCreate>({
    title: '',
    body: '',
    priority: 'info',
    target_type: 'all',
    display_location: 'dashboard',
    pinned: false,
    send_email: false,
  })

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim() || !form.body.trim()) return
    try {
      await create.mutateAsync(form)
      onCreated()
    } catch { /* handled by mutation */ }
  }, [form, create, onCreated])

  return (
    <div className="px-3 py-3 border-b border-border bg-muted/20 space-y-2">
      <input
        type="text"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="Titre de l'annonce..."
        className="gl-form-input text-xs w-full"
        autoFocus
      />
      <textarea
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        placeholder="Contenu de l'annonce..."
        className="gl-form-input text-xs w-full min-h-[60px] resize-y"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          className="gl-form-select text-[10px] h-6"
        >
          <option value="info">{t('announcements.priorities.info')}</option>
          <option value="warning">{t('announcements.priorities.warning')}</option>
          <option value="critical">{t('announcements.priorities.critical')}</option>
          <option value="maintenance">{t('announcements.priorities.maintenance')}</option>
        </select>
        <select
          value={form.target_type}
          onChange={(e) => setForm({ ...form, target_type: e.target.value })}
          className="gl-form-select text-[10px] h-6"
        >
          <option value="all">{t('announcements.targets.all')}</option>
          <option value="entity">{t('announcements.targets.entity')}</option>
        </select>
        <select
          value={form.display_location}
          onChange={(e) => setForm({ ...form, display_location: e.target.value })}
          className="gl-form-select text-[10px] h-6"
        >
          <option value="dashboard">{t('announcements.locations.dashboard')}</option>
          <option value="banner">{t('announcements.locations.banner')}</option>
          <option value="all">{t('announcements.locations.all')}</option>
        </select>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-3 w-3 rounded" />
          {t('announcements.pinned')}
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={form.send_email} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} className="h-3 w-3 rounded" />
          Email
        </label>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="gl-button-sm gl-button-default">Annuler</button>
        <button
          onClick={handleSubmit}
          disabled={!form.title.trim() || !form.body.trim() || create.isPending}
          className="gl-button-sm gl-button-confirm"
        >
          {create.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Publier'}
        </button>
      </div>
    </div>
  )
}
