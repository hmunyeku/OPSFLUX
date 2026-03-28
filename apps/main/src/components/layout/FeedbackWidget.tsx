/**
 * FeedbackWidget — Floating button (bottom-right) for quick bug/feedback submission.
 *
 * Always visible for authenticated users with support.ticket.create permission.
 * Auto-captures current URL + browser info.
 */
import { useState, useCallback } from 'react'
import { MessageSquarePlus, X, Send, Bug, Lightbulb, HelpCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useCreateTicket } from '@/hooks/useSupport'
import { useToast } from '@/components/ui/Toast'
import type { TicketCreate, TicketType } from '@/services/supportService'

const TYPE_OPTIONS: { value: TicketType; label: string; icon: typeof Bug }[] = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'improvement', label: 'Amélioration', icon: Lightbulb },
  { value: 'question', label: 'Question', icon: HelpCircle },
]

export function FeedbackWidget() {
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('support.ticket.create')
  const createTicket = useCreateTicket()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TicketCreate>({
    title: '',
    description: '',
    ticket_type: 'bug',
    priority: 'medium',
  })

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) return
    try {
      await createTicket.mutateAsync({
        ...form,
        source_url: window.location.href,
        browser_info: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          url: window.location.href,
        },
      })
      toast({ title: 'Feedback envoyé !', description: 'Votre ticket a été créé.', variant: 'success' })
      setOpen(false)
      setForm({ title: '', description: '', ticket_type: 'bug', priority: 'medium' })
    } catch {
      toast({ title: 'Erreur lors de l\'envoi', variant: 'error' })
    }
  }, [form, createTicket, toast])

  if (!canCreate) return null

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[80] h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Signaler un problème"
        >
          <MessageSquarePlus size={18} />
        </button>
      )}

      {/* Compact form overlay */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[80] w-80 bg-card border border-border rounded-xl shadow-2xl animate-in slide-in-from-bottom-2 zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Signaler un problème</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X size={14} />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3">
            {/* Type selector */}
            <div className="flex gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm({ ...form, ticket_type: opt.value })}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                    form.ticket_type === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  <opt.icon size={11} />
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Title */}
            <input
              className="gl-form-input text-sm w-full"
              placeholder="Titre du problème..."
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              autoFocus
            />

            {/* Description */}
            <textarea
              className="gl-form-input text-sm w-full min-h-[80px] resize-y"
              placeholder="Décrivez le problème..."
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />

            {/* Priority */}
            <select
              className="gl-form-select text-xs h-7 w-full"
              value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value as TicketCreate['priority'] })}
            >
              <option value="low">Priorité basse</option>
              <option value="medium">Priorité moyenne</option>
              <option value="high">Priorité haute</option>
              <option value="critical">Critique</option>
            </select>

            {/* Page info */}
            <p className="text-[9px] text-muted-foreground truncate">
              Page: {window.location.pathname}
            </p>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!form.title.trim() || createTicket.isPending}
              className="gl-button-sm gl-button-confirm w-full justify-center"
            >
              {createTicket.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Envoyer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
