/**
 * FeedbackWidget — Floating button (bottom-right) for quick bug/feedback submission.
 *
 * Features:
 * - Screenshot capture (html2canvas)
 * - Screen recording (getDisplayMedia + MediaRecorder)
 * - File attachment
 * - Auto-captures current URL + browser info
 *
 * Always visible for authenticated users with support.ticket.create permission.
 */
import { useState, useCallback, useRef } from 'react'
import { MessageSquarePlus, X, Send, Bug, Lightbulb, HelpCircle, Loader2, Camera, Paperclip, Video, Square } from 'lucide-react'
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
  const [attachments, setAttachments] = useState<File[]>([])
  const [previews, setPreviews] = useState<{ name: string; url: string | null; type: string }[]>([])
  const [capturing, setCapturing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [form, setForm] = useState<TicketCreate>({
    title: '',
    description: '',
    ticket_type: 'bug',
    priority: 'medium',
  })

  // ── Screenshot capture (html2canvas) ──
  const captureScreenshot = useCallback(async () => {
    setCapturing(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { useCORS: true, scale: 0.5, logging: false })
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
          setAttachments(prev => [...prev, file])
          setPreviews(prev => [...prev, { name: file.name, url: URL.createObjectURL(blob), type: 'image' }])
        }
        setCapturing(false)
      }, 'image/png')
    } catch {
      toast({ title: 'Capture d\'écran impossible', variant: 'error' })
      setCapturing(false)
    }
  }, [toast])

  // ── Screen recording (getDisplayMedia + MediaRecorder) ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1280, height: 720, frameRate: 15 },
        audio: false,
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4'

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_000_000 })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: mimeType })
        setAttachments(prev => [...prev, file])
        setPreviews(prev => [...prev, { name: file.name, url: null, type: 'video' }])
        setRecording(false)
        setRecordingTime(0)
        if (timerRef.current) clearInterval(timerRef.current)

        // Stop all tracks
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      // Auto-stop if user stops screen share via browser UI
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }

      recorder.start(1000) // collect data every second
      setRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)

      toast({ title: 'Enregistrement démarré', description: 'Cliquez sur Stop quand vous avez terminé.', variant: 'success' })
    } catch {
      toast({ title: 'Enregistrement impossible', description: 'L\'accès au partage d\'écran a été refusé.', variant: 'error' })
    }
  }, [toast])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ── File attachment ──
  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachments(prev => [...prev, file])
      const isImage = file.type.startsWith('image/')
      setPreviews(prev => [...prev, {
        name: file.name,
        url: isImage ? URL.createObjectURL(file) : null,
        type: isImage ? 'image' : 'file',
      }])
    }
    e.target.value = ''
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => {
      const p = prev[index]
      if (p?.url) URL.revokeObjectURL(p.url)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // ── Submit ──
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

      // Upload all attachments
      for (const file of attachments) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('owner_type', 'support_ticket')
          fd.append('owner_id', ticket.id)
          fd.append('description', file.type.startsWith('video/') ? 'Enregistrement écran' : 'Capture d\'écran')
          await api.post('/api/v1/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch { /* non-blocking */ }
      }

      toast({ title: 'Feedback envoyé !', description: `Ticket créé avec ${attachments.length} pièce(s) jointe(s).`, variant: 'success' })
      setOpen(false)
      setForm({ title: '', description: '', ticket_type: 'bug', priority: 'medium' })
      setAttachments([])
      setPreviews([])
    } catch {
      toast({ title: 'Erreur lors de l\'envoi', variant: 'error' })
    }
  }, [form, createTicket, toast, attachments])

  if (!canCreate) return null

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <>
      {/* Floating button */}
      {!open && !recording && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[80] h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Signaler un problème"
        >
          <MessageSquarePlus size={18} />
        </button>
      )}

      {/* Recording indicator (always visible when recording) */}
      {recording && !open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[80] h-11 px-4 rounded-full bg-red-600 text-white shadow-lg flex items-center gap-2 animate-pulse"
        >
          <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-semibold">{formatTime(recordingTime)}</span>
        </button>
      )}

      {/* Compact form overlay */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[80] w-80 bg-card border border-border rounded-xl shadow-2xl animate-in slide-in-from-bottom-2 zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-foreground">Signaler un problème</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X size={14} />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3 overflow-y-auto flex-1">
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
              className="gl-form-input text-sm w-full min-h-[60px] resize-y"
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

            {/* Media buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={captureScreenshot}
                disabled={capturing}
                className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]"
                title="Capturer l'écran"
              >
                {capturing ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
                Photo
              </button>
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]"
                  title="Enregistrer l'écran"
                >
                  <Video size={10} /> Vidéo
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="gl-button-sm flex-1 justify-center text-[10px] bg-red-600 text-white hover:bg-red-700"
                  title="Arrêter l'enregistrement"
                >
                  <Square size={8} fill="currentColor" /> Stop {formatTime(recordingTime)}
                </button>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]"
                title="Joindre un fichier"
              >
                <Paperclip size={10} /> Fichier
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileAttach} />
            </div>

            {/* Attachments preview */}
            {previews.length > 0 && (
              <div className="space-y-1.5">
                {previews.map((p, i) => (
                  <div key={i} className="relative">
                    {p.url ? (
                      <div className="relative">
                        <img src={p.url} alt={p.name} className="w-full h-16 object-cover rounded border border-border" />
                        <span className="absolute bottom-0.5 left-1 text-[7px] bg-black/60 text-white px-1 py-0.5 rounded">{p.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border border-border/50">
                        {p.type === 'video' ? <Video size={10} className="text-red-500" /> : <Paperclip size={10} />}
                        <span className="truncate flex-1">{p.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(i)}
                      className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Page info */}
            <p className="text-[9px] text-muted-foreground truncate">
              Page: {window.location.pathname} · {attachments.length} pièce(s) jointe(s)
            </p>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!form.title.trim() || createTicket.isPending || recording}
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
