/**
 * Dedicated post-close satisfaction page.
 *
 * Arrived at via the `survey_link` in `ticket_satisfaction_survey`
 * emails. The user authenticates as normal; the backend enforces
 * "only the reporter can submit". Idempotent — re-submitting after
 * a first answer returns the ticket unchanged.
 */
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Check, Loader2, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

interface Ticket {
  id: string
  reference: string
  title: string
  status: string
  satisfaction_rating: number | null
  satisfaction_feedback: string | null
  satisfaction_submitted_at: string | null
}

export function SatisfactionPage() {
  const { t, i18n } = useTranslation()
  const { ticketId } = useParams<{ ticketId: string }>()
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['satisfaction-ticket', ticketId],
    queryFn: async () => {
      const { data } = await api.get<Ticket>(`/api/v1/support/tickets/${ticketId}`)
      return data
    },
    enabled: Boolean(ticketId),
  })

  const [rating, setRating] = useState<number>(0)
  const [feedback, setFeedback] = useState('')
  const [hoverRating, setHoverRating] = useState<number | null>(null)

  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Ticket>(
        `/api/v1/support/tickets/${ticketId}/satisfaction`,
        { rating, feedback: feedback.trim() || null },
      )
      return data
    },
    onSuccess: () => {
      toast({ variant: 'success', title: t('support.satisfaction.thanks', 'Merci pour votre avis !') })
      void qc.invalidateQueries({ queryKey: ['satisfaction-ticket', ticketId] })
    },
    onError: (e) => {
      toast({ variant: 'error', title: (e as Error).message || t('common.error', 'Erreur') })
    },
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (isError || !ticket) {
    return (
      <div className="max-w-lg mx-auto mt-20 p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">{t('support.satisfaction.not_found_title', 'Ticket introuvable')}</h1>
        <p className="text-sm text-muted-foreground">{t('support.satisfaction.not_found_desc', "Ce lien n'est peut-être plus valide.")}</p>
        <Link to="/support" className="gl-button gl-button-sm gl-button-default mt-4 inline-flex">
          <ArrowLeft size={11} /> {t('support.satisfaction.back', 'Retour au support')}
        </Link>
      </div>
    )
  }

  const alreadySubmitted = Boolean(ticket.satisfaction_submitted_at)
  const ratingLabels = [
    t('support.satisfaction.rating1', 'Très insatisfait'),
    t('support.satisfaction.rating2', 'Insatisfait'),
    t('support.satisfaction.rating3', 'Neutre'),
    t('support.satisfaction.rating4', 'Satisfait'),
    t('support.satisfaction.rating5', 'Très satisfait'),
  ]

  return (
    <div className="max-w-xl mx-auto mt-16 p-6 space-y-6">
      <div>
        <Link to="/support" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft size={11} /> {t('support.satisfaction.back', 'Retour au support')}
        </Link>
        <h1 className="text-2xl font-bold mt-3">{t('support.satisfaction.title', 'Votre avis compte')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('support.satisfaction.ticket_label', 'Ticket')} <span className="font-mono">{ticket.reference}</span> — {ticket.title}
        </p>
      </div>

      {alreadySubmitted ? (
        <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
            <Check size={20} className="text-emerald-600" />
          </div>
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">{t('support.satisfaction.already_title', 'Déjà noté, merci !')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('support.satisfaction.already_desc', 'Vous avez noté ce ticket {{rating}}/5', { rating: ticket.satisfaction_rating })}
            {ticket.satisfaction_submitted_at && ` ${t('support.satisfaction.on_date', 'le {{date}}', { date: new Date(ticket.satisfaction_submitted_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR') })}`}.
          </p>
          {ticket.satisfaction_feedback && (
            <div className="mt-3 text-xs text-foreground bg-background/50 rounded p-3 text-left italic">
              « {ticket.satisfaction_feedback} »
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('support.satisfaction.your_rating', 'Votre note')}
            </label>
            <div className="flex items-center gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = (hoverRating ?? rating) >= n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={t('support.satisfaction.star_aria', '{{count}} étoile', { count: n })}
                  >
                    <Star
                      size={32}
                      className={cn(
                        'transition-colors',
                        filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
                      )}
                    />
                  </button>
                )
              })}
              {rating > 0 && (
                <span className="ml-3 text-sm text-muted-foreground">
                  {ratingLabels[rating - 1]}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('support.satisfaction.comment_label', 'Commentaire (optionnel)')}
            </label>
            <textarea
              className="gl-input w-full mt-2 text-sm"
              rows={4}
              placeholder={t('support.satisfaction.comment_placeholder', "Qu'avez-vous apprécié ou qui pourrait être amélioré ?")}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={2000}
            />
            <div className="text-[10px] text-muted-foreground text-right mt-1">
              {feedback.length} / 2000
            </div>
          </div>

          <button
            type="button"
            className="gl-button gl-button-primary w-full"
            disabled={rating === 0 || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> {t('common.sending', 'Envoi…')}</>
            ) : (
              <>{t('support.satisfaction.submit', 'Envoyer mon avis')}</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
