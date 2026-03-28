/**
 * FeedbackWidget — Floating button (bottom-right) for quick bug/feedback submission.
 *
 * Always visible for authenticated users with support.ticket.create permission.
 * Auto-captures current URL + browser info.
 */
import { useState, useCallback, useRef } from 'react'
import { MessageSquarePlus, X, Send, Bug, Lightbulb, HelpCircle, Loader2, Camera, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useCreateTicket } from '@/hooks/useSupport'
import { useToast } from '@/components/ui/Toast'
import api from '@/lib/api'
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
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<TicketCreate>({
    title: '',
    description: '',
    ticket_type: 'bug',
    priority: 'medium',
  })

  const captureScreenshot = useCallback(async () => {
    setCapturing(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { useCORS: true, scale: 0.5, logging: false })
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
          setScreenshot(file)
          setScreenshotPreview(URL.createObjectURL(blob))
        }
        setCapturing(false)
      }, 'image/png')
    } catch {
      toast({ title: 'Capture d\'écran impossible', variant: 'error' })
      setCapturing(false)
    }
  }, [toast])

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setScreenshot(file)
      if (file.type.startsWith('image/')) {
        setScreenshotPreview(URL.createObjectURL(file))
      } else {
        setScreenshotPreview(null)
      }
    }
    e.target.value = ''
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) return
    try {
      const ticket = await createTicket.mutateAsync({
        ...form,
        source_url: window.location.href,
        browser_info: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          url: window.location.href,
        },
      })

      // Upload screenshot/file as attachment if present
      if (screenshot && ticket.id) {
        try {
          const fd = new FormData()
          fd.append('file', screenshot)
          fd.append('owner_type', 'support_ticket')
          fd.append('owner_id', ticket.id)
          fd.append('description', 'Capture d\'écran')
          await api.post('/api/v1/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch { /* attachment upload failure is non-blocking */ }
      }

      toast({ title: 'Feedback envoyé !', description: 'Votre ticket a été créé.', variant: 'success' })
      setOpen(false)
      setForm({ title: '', description: '', ticket_type: 'bug', priority: 'medium' })
      setScreenshot(null)
      setScreenshotPreview(null)
    } catch {
      toast({ title: 'Erreur lors de l\'envoi', variant: 'error' })
    }
  }, [form, createTicket, toast, screenshot])

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

            {/* Screenshot / Attachment */}
            <div className="flex items-center gap-2">
              <button
                onClick={captureScreenshot}
                disabled={capturing}
                className="gl-button-sm gl-button-default flex-1 justify-center"
                title="Capturer l'écran"
              >
                {capturing ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                Capture
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="gl-button-sm gl-button-default flex-1 justify-center"
                title="Joindre un fichier"
              >
                <Paperclip size={11} /> Fichier
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileAttach} />
            </div>

            {/* Screenshot preview */}
            {screenshotPreview && (
              <div className="relative">
                <img src={screenshotPreview} alt="Capture" className="w-full h-20 object-cover rounded border border-border" />
                <button
                  onClick={() => { setScreenshot(null); setScreenshotPreview(null) }}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                >
                  <X size={10} />
                </button>
                <span className="absolute bottom-1 left-1 text-[8px] bg-black/50 text-white px-1.5 py-0.5 rounded">
                  {screenshot?.name}
                </span>
              </div>
            )}
            {screenshot && !screenshotPreview && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border border-border/50">
                <Paperclip size={10} />
                <span className="truncate flex-1">{screenshot.name}</span>
                <button onClick={() => { setScreenshot(null); setScreenshotPreview(null) }} className="text-muted-foreground hover:text-destructive">
                  <X size={10} />
                </button>
              </div>
            )}

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
