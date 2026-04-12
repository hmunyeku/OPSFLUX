/**
 * Emails tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/profile/emails
 *
 * API-backed: GET /api/v1/emails, POST, DELETE, POST /:id/primary, POST /:id/verify
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, Plus, Check, Loader2, Trash2, Send, Star } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUserEmails, useAddEmail, useRemoveEmail, useSetPrimaryEmail, useResendVerification } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function EmailsTab() {
  const { t } = useTranslation()
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
      toast({ title: t('settings.toast.emails.added'), description: t('settings.toast.emails.added_desc'), variant: 'success' })
      setNewEmail('')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.emails.add_error')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeEmail.mutateAsync(id)
      toast({ title: t('settings.toast.emails.removed'), variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.emails.remove_error')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleSetPrimary = async (id: string) => {
    try {
      await setPrimary.mutateAsync(id)
      toast({ title: t('settings.toast.emails.primary_set'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.emails.primary_error'), variant: 'error' })
    }
  }

  const handleResendVerification = async (id: string) => {
    try {
      await resendVerification.mutateAsync(id)
      toast({ title: t('settings.toast.emails.verification_sent'), description: t('settings.toast.emails.verification_sent_desc'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.emails.verification_send_error'), variant: 'error' })
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
            <div className="p-3">
              {(!emails || emails.length === 0) ? (
                <EmptyState icon={Mail} title="Aucun email" description="Aucune adresse email configurée." size="compact" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {emails.map((email) => (
                    <div
                      key={email.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        email.is_primary
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border/60 bg-card'
                      }`}
                    >
                      {/* Email address + badges */}
                      <div className="flex items-start gap-2 mb-3">
                        <Mail size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{email.email}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {email.verified ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                <Check size={9} /> Vérifié
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                En attente
                              </span>
                            )}
                            {email.is_primary && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">
                                <Star size={9} /> Principal
                              </span>
                            )}
                            {email.is_notification && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                Notifications
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30">
                        {!email.is_primary && email.verified && (
                          <button
                            className="gl-button-sm gl-button-default"
                            onClick={() => handleSetPrimary(email.id)}
                            disabled={setPrimary.isPending}
                          >
                            <Star size={11} /> Principal
                          </button>
                        )}
                        {!email.verified && (
                          <button
                            className="gl-button-sm gl-button-default"
                            onClick={() => handleResendVerification(email.id)}
                            disabled={resendVerification.isPending}
                          >
                            <Send size={11} /> Vérifier
                          </button>
                        )}
                        {!email.is_primary && (
                          <button
                            className="gl-button-sm gl-button-danger ml-auto"
                            onClick={() => handleRemove(email.id)}
                            disabled={removeEmail.isPending}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Add email — inline within the same section */}
        <div className="mt-4 flex items-end gap-3 max-w-lg">
          <div className="flex-1">
            <label className="gl-label">Ajouter une adresse email</label>
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
