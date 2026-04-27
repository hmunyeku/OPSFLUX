/**
 * EmailComposer — reusable modal for sending an email from inside OpsFlux.
 *
 * Built on top of:
 *   - RecipientPicker (To + CC) — user/contact autocomplete + free-text
 *   - RichTextField (HTML body)
 *   - Subject input + attachments hint + Send/Cancel actions
 *
 * The composer is intentionally PURE: it does not know what API to call
 * — the caller passes `onSend({ recipients, cc, subject, body })` which
 * returns a promise. The composer manages its own form state, validation
 * and "sending…" UI; it only closes after `onSend` resolves successfully.
 *
 * Drop-in replacement for the bespoke email modals scattered around the
 * Planner / Projets / Imputations pages — every send-an-email flow should
 * now route through this single surface.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Send, X, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichTextField } from './RichTextField'
import { RecipientPicker, type Recipient } from './RecipientPicker'
import { useToast } from '@/components/ui/Toast'

export interface EmailComposerAttachment {
  /** Short label shown in the "Pièces jointes" strip. */
  label: string
  /** Optional helper line (e.g. file size). */
  hint?: string
}

export interface EmailComposerPayload {
  recipients: string[]
  cc: string[]
  subject: string
  body: string
}

export interface EmailComposerProps {
  open: boolean
  onClose: () => void
  /** Resolves on success. Throw / reject to surface a toast and keep the
   *  modal open so the user can retry without retyping. */
  onSend: (payload: EmailComposerPayload) => Promise<void>
  title?: string
  /** Pre-fill values. Recipient and CC arrays accept either Recipient
   *  objects (with a friendly label) or plain email strings. */
  defaultRecipients?: (Recipient | string)[]
  defaultCc?: (Recipient | string)[]
  defaultSubject?: string
  /** HTML body. */
  defaultBody?: string
  /** Read-only listing of attachments that the backend will inject
   *  (e.g. "PDF d'arbitrage"). The composer never sends file blobs
   *  itself — it just shows the user what's coming. */
  attachments?: EmailComposerAttachment[]
  /** Inline help text shown below the body editor. */
  bodyHint?: string
  /** Disable user/contact autocomplete in the recipient pickers — useful
   *  for purely transactional flows where directory access isn't desired. */
  hideDirectorySuggestions?: boolean
  /** Cap recipients per field. Default 20 (matches backend). */
  maxRecipientsPerField?: number
}

const toRecipient = (x: Recipient | string): Recipient =>
  typeof x === 'string' ? { email: x, source: 'manual' } : x

export function EmailComposer({
  open,
  onClose,
  onSend,
  title,
  defaultRecipients,
  defaultCc,
  defaultSubject,
  defaultBody,
  attachments,
  bodyHint,
  hideDirectorySuggestions,
  maxRecipientsPerField = 20,
}: EmailComposerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  // Local form state. Initialised from defaults on first open and never
  // reset during the lifetime of the modal (caller controls remount via
  // `open` toggling — we don't fight that).
  const [recipients, setRecipients] = useState<Recipient[]>(
    () => (defaultRecipients ?? []).map(toRecipient),
  )
  const [cc, setCc] = useState<Recipient[]>(
    () => (defaultCc ?? []).map(toRecipient),
  )
  const [subject, setSubject] = useState<string>(defaultSubject ?? '')
  const [body, setBody] = useState<string>(defaultBody ?? '')
  const [sending, setSending] = useState(false)
  const [showCc, setShowCc] = useState<boolean>((defaultCc ?? []).length > 0)

  if (!open) return null

  const canSend = recipients.length > 0 && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      await onSend({
        recipients: recipients.map((r) => r.email),
        cc: cc.map((r) => r.email),
        subject: subject.trim(),
        body,
      })
      // Caller's onSent toast / close handles UX feedback.
    } catch (err) {
      // Surface the error inside the composer so the user can retry
      // without losing what they typed.
      const message = (err as { message?: string })?.message
        ?? (typeof err === 'string' ? err : 'Erreur inconnue')
      toast({ title: 'Échec envoi', description: message, variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="gl-modal-backdrop"
      onClick={() => {
        if (!sending) onClose()
      }}
    >
      <div
        className={cn(
          // gl-modal-card already gives `w-full max-w-md`; we widen on
          // tablet+ so the rich-text editor + chip pickers have room.
          // Crucially we DON'T add a fixed pixel/vw width — the card
          // stays inside the backdrop's 12px gutter on mobile and grows
          // up to 720px on desktop without ever creating horizontal
          // overflow.
          'gl-modal-card sm:max-w-xl md:max-w-2xl flex flex-col',
          // Cap height to the viewport so the body is the part that
          // scrolls when content is tall — header + footer stay pinned.
          // `!overflow-hidden` overrides the `overflow-y-auto` baked
          // into `gl-modal-card` (we move the scroll to the body div).
          'max-h-[92dvh] !overflow-hidden',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 min-w-0 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground break-words">
              {title ?? t('common.send_email', 'Envoyer par email')}
            </h3>
            {attachments && attachments.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t(
                  'common.email_attachments_intro',
                  'Les pièces jointes ci-dessous seront ajoutées automatiquement.',
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => !sending && onClose()}
            className="text-muted-foreground hover:text-foreground p-0.5 -m-0.5 shrink-0"
            aria-label={t('common.close', 'Fermer')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Recipients ─────────────────────────────────────────── */}
        {/* Body wrapper takes the remaining vertical space and is the
            ONLY part of the modal that scrolls — header (title) and
            footer (Cancel / Send) stay pinned, which matters most on
            mobile where 92dvh isn't enough to show everything at once. */}
        <div className="space-y-2.5 mt-3 flex-1 min-h-0 overflow-y-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('common.to', 'Destinataires')}
                <span className="text-rose-500 ml-0.5">*</span>
              </label>
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {t('common.add_cc', '+ Ajouter Cc')}
                </button>
              )}
            </div>
            <RecipientPicker
              value={recipients}
              onChange={setRecipients}
              placeholder={t(
                'common.recipients_placeholder',
                'email@exemple.com ou rechercher un utilisateur / contact…',
              )}
              disabled={sending}
              includeUsers={!hideDirectorySuggestions}
              includeContacts={!hideDirectorySuggestions}
              maxRecipients={maxRecipientsPerField}
            />
          </div>

          {showCc && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Cc
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowCc(false)
                    setCc([])
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {t('common.remove', 'Retirer')}
                </button>
              </div>
              <RecipientPicker
                value={cc}
                onChange={setCc}
                placeholder={t(
                  'common.recipients_placeholder',
                  'email@exemple.com ou rechercher un utilisateur / contact…',
                )}
                disabled={sending}
                includeUsers={!hideDirectorySuggestions}
                includeContacts={!hideDirectorySuggestions}
                maxRecipients={maxRecipientsPerField}
              />
            </div>
          )}

          {/* Subject ──────────────────────────────────────────── */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
              {t('common.subject', 'Objet')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
              className={cn(
                'w-full h-8 rounded-md border border-border bg-background px-2 text-xs',
                'focus:border-primary/60 focus:ring-1 focus:ring-primary/30 outline-none',
              )}
              placeholder={t('common.subject_placeholder', 'Objet de l\'email')}
            />
          </div>

          {/* Body — RichTextField ─────────────────────────────── */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
              {t('common.message', 'Message')}
            </label>
            <RichTextField
              value={body}
              onChange={setBody}
              disabled={sending}
              placeholder={t(
                'common.email_body_placeholder',
                'Rédigez votre message — Markdown / formatage supportés.',
              )}
              hint={bodyHint}
              rows={6}
            />
          </div>

          {/* Attachments ──────────────────────────────────────── */}
          {attachments && attachments.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
                {t('common.attachments', 'Pièces jointes')}
              </label>
              <div className="space-y-1">
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded border border-border bg-muted/20 px-2 py-1.5"
                  >
                    <Paperclip size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground truncate">{a.label}</div>
                      {a.hint && (
                        <div className="text-[10px] text-muted-foreground truncate">{a.hint}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={() => !sending && onClose()}
            disabled={sending}
            className="gl-button gl-button-default"
          >
            {t('common.cancel', 'Annuler')}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="gl-button gl-button-primary inline-flex items-center gap-1.5"
            title={
              recipients.length === 0
                ? t('common.add_at_least_one_recipient', 'Ajoutez au moins un destinataire')
                : undefined
            }
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            <span>
              {sending
                ? t('common.sending', 'Envoi…')
                : t('common.send', 'Envoyer')}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
