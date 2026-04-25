/**
 * ContactEmailManager — Reusable polymorphic contact email management component.
 *
 * Embeddable anywhere: tiers, contacts, users, assets, entities.
 * Supports multiple emails with labels, default flag.
 * Double-click to edit inline.
 *
 * Usage:
 *   <ContactEmailManager ownerType="tier" ownerId={tier.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, X, Loader2, Mail, Star, Check, ShieldCheck, Send } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useContactEmails, useCreateContactEmail, useUpdateContactEmail, useDeleteContactEmail } from '@/hooks/useSettings'
import { useSendEmailVerification } from '@/hooks/useUserSubModels'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import type { ContactEmail } from '@/types/api'

const FALLBACK_EMAIL_LABELS = [
  { value: 'professional', label: 'Professionnel' },
  { value: 'personal', label: 'Personnel' },
  { value: 'other', label: 'Autre' },
]

interface ContactEmailManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
}

export function ContactEmailManager({ ownerType, ownerId, compact }: ContactEmailManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = useContactEmails(ownerType, ownerId)
  const createEmail = useCreateContactEmail()
  const updateEmail = useUpdateContactEmail()
  const deleteEmail = useDeleteContactEmail()
  const sendVerification = useSendEmailVerification()
  const dictEmailLabels = useDictionaryOptions('email_label')
  const EMAIL_LABELS = dictEmailLabels.length > 0 ? dictEmailLabels : FALLBACK_EMAIL_LABELS

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState(EMAIL_LABELS[0]?.value ?? 'professional')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const emails: ContactEmail[] = data ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || !email.trim()) return
    try {
      await createEmail.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        email: email.trim(),
        label,
        is_default: emails.length === 0,
      })
      setEmail('')
      setShowForm(false)
      toast({ title: 'Email ajouté', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [ownerId, ownerType, email, label, emails.length, createEmail, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteEmail.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Email supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [deleteEmail, toast])

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await updateEmail.mutateAsync({ id, payload: { is_default: true } })
      toast({ title: 'Email par défaut défini', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [updateEmail, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && emails.length > 0 && (
        <div className="space-y-1">
          {emails.map((ce) => {
            if (editingId === ce.id) {
              return (
                <InlineEmailEditor
                  key={ce.id}
                  contactEmail={ce}
                  labelOptions={EMAIL_LABELS}
                  onSave={async (updates) => {
                    try {
                      await updateEmail.mutateAsync({ id: ce.id, payload: updates })
                      setEditingId(null)
                      toast({ title: 'Email modifié', variant: 'success' })
                    } catch {
                      toast({ title: 'Erreur', variant: 'error' })
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateEmail.isPending}
                />
              )
            }

            const isConfirming = confirmDeleteId === ce.id
            return (
              <div
                key={ce.id}
                className="flex items-center gap-2 text-sm group"
                onDoubleClick={() => setEditingId(ce.id)}
                title="Double-cliquez pour modifier"
              >
                <Mail size={12} className="text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase w-16 shrink-0">
                  {EMAIL_LABELS.find((l) => l.value === ce.label)?.label ?? ce.label}
                </span>
                <span className="text-foreground text-xs truncate">
                  {ce.email}
                </span>
                {ce.is_default && (
                  <Star size={10} className="text-yellow-500 fill-yellow-500 shrink-0" />
                )}
                {ce.verified ? (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0" title={ce.verified_at ? `Vérifié le ${new Date(ce.verified_at).toLocaleDateString()}` : 'Vérifié'}>
                    <ShieldCheck size={10} />
                  </span>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); sendVerification.mutate(ce.id, { onSuccess: () => toast({ title: 'Email de vérification envoyé', variant: 'success' }), onError: () => toast({ title: 'Erreur d\'envoi', variant: 'error' }) }) }}
                    className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 shrink-0"
                    title="Envoyer un email de vérification"
                    disabled={sendVerification.isPending}
                  >
                    {sendVerification.isPending ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />}
                    <span>Vérifier</span>
                  </button>
                )}
                <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!ce.is_default && (
                    <button
                      onClick={() => handleSetDefault(ce.id)}
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                      title="Définir par défaut"
                    >
                      <Star size={10} />
                    </button>
                  )}
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirmDeleteId(ce.id)}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                      title="Supprimer"
                    >
                      <X size={10} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px]">
                      <button onClick={() => handleDelete(ce.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && emails.length === 0 && !compact && (
        <EmptyState icon={Mail} title="Aucun email" description="Aucun email de contact." size="compact" />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un email
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <input
            type="email"
            className={`${panelInputClass} w-full`}
            placeholder="contact@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            autoFocus
          />
          <select className="gl-form-select text-xs" value={label} onChange={(e) => setLabel(e.target.value)}>
            {EMAIL_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); setEmail('') }} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={!email.trim() || createEmail.isPending} className="gl-button-sm gl-button-confirm">
              {createEmail.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InlineEmailEditor({
  contactEmail,
  labelOptions,
  onSave,
  onCancel,
  isSaving,
}: {
  contactEmail: ContactEmail
  labelOptions: { value: string; label: string }[]
  onSave: (updates: { email?: string; label?: string }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editEmail, setEditEmail] = useState(contactEmail.email)
  const [editLabel, setEditLabel] = useState(contactEmail.label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    const updates: Record<string, string> = {}
    if (editEmail.trim() !== contactEmail.email) updates.email = editEmail.trim()
    if (editLabel !== contactEmail.label) updates.label = editLabel
    if (Object.keys(updates).length === 0) { onCancel(); return }
    onSave(updates)
  }

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-lg border border-primary/30 bg-card">
      <input
        ref={inputRef}
        type="email"
        value={editEmail}
        onChange={(e) => setEditEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
        className="flex-1 px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
        placeholder="email@example.com"
      />
      <select value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="text-[10px] px-1 py-0.5 rounded border border-border/60 bg-card">
        {labelOptions.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <button onClick={handleSave} disabled={isSaving} className="p-0.5 rounded hover:bg-green-100 text-green-600">
        {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
      </button>
      <button onClick={onCancel} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
        <X size={10} />
      </button>
    </div>
  )
}
