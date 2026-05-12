/**
 * TeamCreateInline — mini-form embarqué de création d'équipe.
 *
 * Bastien (mai 2026): "une equipe n'est pas cree via settings, c'est
 * cree soit dans projects, soit dans activités, soit dans paxlog".
 *
 * Form minimal pour ne pas alourdir le contexte parent (ADS, Projet, etc.).
 * Permet :
 *   * nom + description (optionnelle)
 *   * visibility public/private
 *   * membres initiaux passés en props (pré-sélectionnés depuis le contexte)
 *
 * Au submit, appelle le hook useCreateTeam puis exécute le callback
 * onCreated avec le team créé. Le parent décide quoi faire (e.g. ajouter
 * la team au ADS courant, attacher au projet, etc.).
 */
import { Loader2, Lock, Globe2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useCreateTeam } from '@/hooks/useTeams'
import type { Team, TeamMemberInitial, TeamVisibility } from '@/services/teamsService'
import { panelInputClass } from '@/components/layout/DynamicPanel'

interface TeamCreateInlineProps {
  /** Membres initiaux suggérés (pré-cochés). Generated par le parent depuis
   *  le contexte (e.g. les pax déjà sélectionnés dans un picker). */
  suggestedMembers?: Array<{
    user_id?: string | null
    contact_id?: string | null
    label: string  // nom complet à afficher
  }>
  onCreated?: (team: Team) => void
  onCancel?: () => void
  className?: string
}

export function TeamCreateInline({
  suggestedMembers = [],
  onCreated,
  onCancel,
  className,
}: TeamCreateInlineProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createTeam = useCreateTeam()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<TeamVisibility>('public')
  // Selection map pour les suggestedMembers
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set(
      suggestedMembers.map(
        (m) => (m.user_id ? `u:${m.user_id}` : `c:${m.contact_id}`),
      ),
    ),
  )

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: t('teams.error.name_required') || 'Nom requis',
        variant: 'warning',
      })
      return
    }
    const initial_members: TeamMemberInitial[] = suggestedMembers
      .filter((m) => {
        const k = m.user_id ? `u:${m.user_id}` : `c:${m.contact_id}`
        return selectedKeys.has(k)
      })
      .map((m) => ({
        user_id: m.user_id || undefined,
        contact_id: m.contact_id || undefined,
        role: 'member',
      }))
    try {
      const team = await createTeam.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        initial_members,
      })
      toast({
        title: t('teams.created') || `Équipe « ${team.name} » créée`,
        variant: 'success',
      })
      onCreated?.(team)
    } catch (err: any) {
      toast({
        title: t('teams.error.create') || 'Création échouée',
        description: err?.response?.data?.message || err?.message,
        variant: 'error',
      })
    }
  }

  return (
    <div className={cn('space-y-2 p-2 rounded-md border border-border bg-card', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {t('teams.create_new') || 'Nouvelle équipe'}
        </div>
        {onCancel && (
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={onCancel}
            title={t('common.close')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('teams.field.name') || 'Nom de l\'équipe'} *
          </span>
          <input
            type="text"
            className={panelInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('teams.placeholder.name') || 'Ex. Équipe maintenance EKF3'}
            autoFocus
            maxLength={200}
          />
        </label>

        <label className="block">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('teams.field.description') || 'Description (optionnelle)'}
          </span>
          <textarea
            className={cn(panelInputClass, 'min-h-[44px]')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('teams.placeholder.description') || 'But, périmètre, etc.'}
            rows={2}
          />
        </label>

        <div>
          <span className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
            {t('teams.field.visibility') || 'Visibilité'}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-[11px] border',
                visibility === 'public'
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'border-border hover:bg-accent/40',
              )}
              onClick={() => setVisibility('public')}
            >
              <Globe2 size={11} />
              {t('teams.visibility.public') || 'Publique'}
            </button>
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-[11px] border',
                visibility === 'private'
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'border-border hover:bg-accent/40',
              )}
              onClick={() => setVisibility('private')}
            >
              <Lock size={11} />
              {t('teams.visibility.private') || 'Privée'}
            </button>
          </div>
          <p className="text-[9px] text-muted-foreground mt-1">
            {visibility === 'public'
              ? (t('teams.visibility.public_hint') || 'Visible par tous les utilisateurs de l\'entité.')
              : (t('teams.visibility.private_hint') || 'Visible uniquement par vous et les admins.')}
          </p>
        </div>

        {suggestedMembers.length > 0 && (
          <div>
            <span className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
              {t('teams.field.initial_members') || 'Membres initiaux'} ({selectedKeys.size}/{suggestedMembers.length})
            </span>
            <div className="max-h-[120px] overflow-y-auto space-y-0.5 rounded border border-border bg-muted/20 p-1">
              {suggestedMembers.map((m) => {
                const k = m.user_id ? `u:${m.user_id}` : `c:${m.contact_id}`
                const checked = selectedKeys.has(k)
                return (
                  <label
                    key={k}
                    className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-accent/40 cursor-pointer text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedKeys((s) => {
                          const next = new Set(s)
                          if (e.target.checked) next.add(k)
                          else next.delete(k)
                          return next
                        })
                      }}
                      className="accent-primary"
                    />
                    <span className="truncate">{m.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          className="btn btn-primary h-6 px-2 text-[10px]"
          disabled={createTeam.isPending || !name.trim()}
          onClick={handleSubmit}
        >
          {createTeam.isPending ? (
            <><Loader2 size={10} className="animate-spin mr-1" /> {t('common.creating') || 'Création...'}</>
          ) : (
            <>{t('common.create') || 'Créer'}</>
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn btn-tertiary h-6 px-2 text-[10px]"
            onClick={onCancel}
            disabled={createTeam.isPending}
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}
