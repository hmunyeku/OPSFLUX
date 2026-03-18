/**
 * Emails tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/profile/emails
 *
 * API-backed: GET /api/v1/emails, POST, DELETE, POST /:id/primary, POST /:id/verify
 */
import { useState } from 'react'
import { Mail, Plus, Check, Loader2, Trash2, Send, Star } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUserEmails, useAddEmail, useRemoveEmail, useSetPrimaryEmail, useResendVerification } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function EmailsTab() {
  const { toast } = useToast()
  const { data: emails, isLoading } = useUserEmails()
  const addEmail = useAddEmail()
  const removeEmail = useRemoveEmail()
  const setPrimary = useSetPrimaryEmail()
  const resendVerification = useResendVerification()
  const [newEmail, setNewEmail] = useState('')

  const handleAddEmail = async () => {
    if (!newEmail.trim()) return
    try {
      await addEmail.mutateAsync(newEmail.trim())
      toast({ title: 'Email ajouté', description: 'Un email de vérification a été envoyé.', variant: 'success' })
      setNewEmail('')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Impossible d\'ajouter cet email.'
      toast({ title: 'Erreur', description: message, variant: 'error' })
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeEmail.mutateAsync(id)
      toast({ title: 'Email supprimé', variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Impossible de supprimer cet email.'
      toast({ title: 'Erreur', description: message, variant: 'error' })
    }
  }

  const handleSetPrimary = async (id: string) => {
    try {
      await setPrimary.mutateAsync(id)
      toast({ title: 'Email principal défini', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de définir l\'email principal.', variant: 'error' })
    }
  }

  const handleResendVerification = async (id: string) => {
    try {
      await resendVerification.mutateAsync(id)
      toast({ title: 'Email envoyé', description: 'Un nouvel email de vérification a été envoyé.', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible d\'envoyer l\'email.', variant: 'error' })
    }
  }

  return (
    <>
      <CollapsibleSection
        id="emails-list"
        title="Adresses email"
        description="Gérez les adresses email liées à votre compte."
        storageKey="settings.emails.collapse"
      >
        {/* Linked emails card */}
        <div className="mt-6 border border-border/60 rounded-lg bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30 rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Emails liés</span>
              <Mail size={14} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{emails?.length || 0}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {emails?.map((email) => (
                <div key={email.id} className="px-4 py-4 border-b border-border/20 last:border-b-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground">{email.email}</span>
                    {email.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <Check size={10} /> Vérifié
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        En attente
                      </span>
                    )}
                  </div>

                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-1">
                    {email.is_primary && (
                      <li>
                        <span className="font-medium text-foreground">Email principal</span>
                        <span className="text-muted-foreground"> — Utilisé pour la connexion et la détection d'avatar.</span>
                      </li>
                    )}
                    {email.is_notification && (
                      <li>
                        <span className="font-medium text-foreground">Email de notification</span>
                        <span className="text-muted-foreground"> — Utilisé pour les notifications par défaut.</span>
                      </li>
                    )}
                  </ul>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2">
                    {!email.is_primary && email.verified && (
                      <button
                        className="gl-button-sm gl-button-default"
                        onClick={() => handleSetPrimary(email.id)}
                        disabled={setPrimary.isPending}
                      >
                        <Star size={12} /> Définir principal
                      </button>
                    )}
                    {!email.verified && (
                      <button
                        className="gl-button-sm gl-button-default"
                        onClick={() => handleResendVerification(email.id)}
                        disabled={resendVerification.isPending}
                      >
                        <Send size={12} /> Renvoyer vérification
                      </button>
                    )}
                    {!email.is_primary && (
                      <button
                        className="gl-button-sm gl-button-danger"
                        onClick={() => handleRemove(email.id)}
                        disabled={removeEmail.isPending}
                      >
                        <Trash2 size={12} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {(!emails || emails.length === 0) && (
                <EmptyState icon={Mail} title="Aucun email" description="Aucune adresse email configurée." size="compact" />
              )}
            </>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="add-email"
        title="Ajouter une adresse email"
        description="Ajoutez une adresse email supplémentaire à votre compte. Un email de vérification sera envoyé."
        storageKey="settings.emails.collapse"
        showSeparator={false}
      >
        <div className="mt-4 flex items-end gap-3 max-w-lg">
          <div className="flex-1">
            <label className="gl-label">Adresse email</label>
            <input
              type="email"
              className="gl-form-input"
              placeholder="nom@exemple.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddEmail() }}
            />
          </div>
          <button
            className="gl-button gl-button-confirm"
            disabled={!newEmail.trim() || addEmail.isPending}
            onClick={handleAddEmail}
          >
            {addEmail.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Ajouter
          </button>
        </div>
      </CollapsibleSection>
    </>
  )
}
