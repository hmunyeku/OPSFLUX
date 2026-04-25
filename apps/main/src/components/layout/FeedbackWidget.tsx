/**
 * FeedbackWidget — Floating button (bottom-right) for quick bug/feedback submission.
 *
 * Features:
 * - Screenshot capture (html2canvas)
 * - Screen recording (getDisplayMedia + MediaRecorder)
 * - Console log capture (circular buffer, auto-attached for bug reports)
 * - File attachment
 * - Auto-captures current URL + browser info
 *
 * Always visible for authenticated users with support.ticket.create permission.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { MessageSquarePlus, X, Send, Bug, Lightbulb, HelpCircle, Loader2, Camera, Paperclip, Video, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useCreateTicket } from '@/hooks/useSupport'
import { useToast } from '@/components/ui/Toast'
import api from '@/lib/api'
import type { TicketCreate, TicketType } from '@/services/supportService'

// ── Console Log Capture (circular buffer) ─────────────────────
// Intercepts console.log/warn/error/info and keeps the last N entries.
// Used to auto-attach a .log file when a bug report is submitted.

interface ConsoleLogEntry {
  ts: string
  level: string
  message: string
}

const MAX_LOG_ENTRIES = 500
const consoleLogBuffer: ConsoleLogEntry[] = []
let consoleInterceptInstalled = false

function installConsoleIntercept() {
  if (consoleInterceptInstalled) return
  consoleInterceptInstalled = true

  const levels = ['log', 'warn', 'error', 'info', 'debug'] as const
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        const message = args.map(a => {
          if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`
          if (typeof a === 'object') try { return JSON.stringify(a, null, 0)?.slice(0, 500) } catch { return String(a) }
          return String(a)
        }).join(' ')

        consoleLogBuffer.push({
          ts: new Date().toISOString(),
          level: level.toUpperCase(),
          message: message.slice(0, 1000),
        })
        // Trim buffer
        if (consoleLogBuffer.length > MAX_LOG_ENTRIES) {
          consoleLogBuffer.splice(0, consoleLogBuffer.length - MAX_LOG_ENTRIES)
        }
      } catch { /* never break the app */ }
      original(...args)
    }
  }

  // Also capture unhandled errors and promise rejections
  window.addEventListener('error', (e) => {
    consoleLogBuffer.push({
      ts: new Date().toISOString(),
      level: 'UNCAUGHT_ERROR',
      message: `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`,
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    consoleLogBuffer.push({
      ts: new Date().toISOString(),
      level: 'UNHANDLED_REJECTION',
      message: String(e.reason).slice(0, 1000),
    })
  })
}

function buildConsoleLogFile(): File {
  const header = [
    `=== OpsFlux Console Log ===`,
    `Date: ${new Date().toISOString()}`,
    `URL: ${window.location.href}`,
    `UserAgent: ${navigator.userAgent}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Entries: ${consoleLogBuffer.length}`,
    `${'='.repeat(50)}`,
    '',
  ].join('\n')

  const lines = consoleLogBuffer.map(e =>
    `[${e.ts}] [${e.level.padEnd(7)}] ${e.message}`
  ).join('\n')

  const content = header + lines
  return new File([content], `console-${Date.now()}.log`, { type: 'text/plain' })
}

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

  // Install console intercept once on mount
  useEffect(() => { installConsoleIntercept() }, [])

  // ── Screenshot capture (html2canvas) ──
  // Hides the feedback widget before capturing so it doesn't appear in the screenshot.
  const widgetRef = useRef<HTMLDivElement>(null)
  const captureScreenshot = useCallback(async () => {
    setCapturing(true)
    try {
      // Temporarily hide the widget
      if (widgetRef.current) widgetRef.current.style.visibility = 'hidden'
      // Small delay to let the browser repaint without the widget
      await new Promise(r => setTimeout(r, 100))

      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { useCORS: true, scale: 0.5, logging: false })

      // Restore visibility
      if (widgetRef.current) widgetRef.current.style.visibility = ''

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
          setAttachments(prev => [...prev, file])
          setPreviews(prev => [...prev, { name: file.name, url: URL.createObjectURL(blob), type: 'image' }])
        }
        setCapturing(false)
      }, 'image/png')
    } catch {
      if (widgetRef.current) widgetRef.current.style.visibility = ''
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

      // Build list of files to upload: user attachments + auto console log for bugs
      const filesToUpload: { file: File; description: string }[] = attachments.map(f => ({
        file: f,
        description: f.type.startsWith('video/') ? 'Enregistrement écran' : f.type.startsWith('image/') ? 'Capture d\'écran' : 'Pièce jointe',
      }))

      // Auto-attach console log for bug reports
      if (form.ticket_type === 'bug' && consoleLogBuffer.length > 0) {
        filesToUpload.push({
          file: buildConsoleLogFile(),
          description: 'Console log (auto-capturé)',
        })
      }

      // Upload all files
      for (const { file, description } of filesToUpload) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('owner_type', 'support_ticket')
          fd.append('owner_id', ticket.id)
          fd.append('description', description)
          await api.post('/api/v1/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch { /* non-blocking */ }
      }

      const totalFiles = filesToUpload.length
      const logNote = form.ticket_type === 'bug' ? ' (console log inclus)' : ''
      toast({ title: 'Feedback envoyé !', description: `Ticket créé avec ${totalFiles} pièce(s) jointe(s)${logNote}.`, variant: 'success' })
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
    <div ref={widgetRef}>
      {/* Floating button — hidden on < sm so it doesn't overlap the
          dynamic panel sticky action bar (Cancel/Save buttons) which
          lives in the same bottom-right corner on mobile. The user
          can still report issues via the assistant panel from the
          mobile topbar. */}
      {!open && !recording && (
        <button
          onClick={() => setOpen(true)}
          className="hidden sm:flex fixed bottom-5 right-5 z-[80] h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Signaler un problème"
        >
          <MessageSquarePlus size={18} />
        </button>
      )}

      {/* Recording indicator (always visible when recording) */}
      {recording && !open && (
        <button
          onClick={() => setOpen(true)}
          className="hidden sm:flex fixed bottom-5 right-5 z-[80] h-11 px-4 rounded-full bg-red-600 text-white shadow-lg items-center gap-2 animate-pulse"
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
            <div>
              <input
                className={cn('gl-form-input text-sm w-full', form.title.trim().length > 0 && form.title.trim().length < 10 && 'border-orange-400')}
                placeholder="Titre clair et précis (min. 10 caractères)..."
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
              {form.title.trim().length > 0 && form.title.trim().length < 10 && (
                <p className="text-[9px] text-orange-500 mt-0.5">Titre trop court — soyez précis ({form.title.trim().length}/10)</p>
              )}
            </div>

            {/* Description */}
            <div>
              <textarea
                className={cn(
                  'gl-form-input text-sm w-full min-h-[60px] resize-y',
                  form.ticket_type === 'bug' && (form.description || '').trim().length > 0 && (form.description || '').trim().length < 20 && 'border-orange-400',
                )}
                placeholder={form.ticket_type === 'bug'
                  ? 'Décrivez précisément : que faisiez-vous ? que s\'est-il passé ? qu\'attendiez-vous ? (min. 20 car.)'
                  : 'Décrivez votre demande...'}
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
              {form.ticket_type === 'bug' && (form.description || '').trim().length > 0 && (form.description || '').trim().length < 20 && (
                <p className="text-[9px] text-orange-500 mt-0.5">Description trop courte — décrivez les étapes pour reproduire ({(form.description || '').trim().length}/20)</p>
              )}
            </div>

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
              disabled={
                form.title.trim().length < 10
                || (form.ticket_type === 'bug' && (form.description || '').trim().length < 20)
                || createTicket.isPending
                || recording
              }
              className="gl-button-sm gl-button-confirm w-full justify-center"
            >
              {createTicket.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
