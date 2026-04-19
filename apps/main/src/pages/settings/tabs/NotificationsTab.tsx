/**
 * Notifications tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/profile/notifications
 *
 * API-backed: GET/PATCH /api/v1/preferences/notifications
 * Uses user emails for notification email selection.
 * Toast display settings (position, duration, opacity) are stored in localStorage.
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Loader2 } from 'lucide-react'
import { useNotificationPreferences, useUpdateNotificationPreferences, useUserEmails, useUserGroups } from '@/hooks/useSettings'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import {
  useToast,
  TOAST_POSITIONS,
  getToastPosition,
  setToastPosition,
  getToastDuration,
  setToastDuration,
  getToastOpacity,
  setToastOpacity,
  type ToastPosition,
} from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

const notificationLevels = [
  { value: 'participate', label: 'Participer', description: 'Éléments auxquels vous participez' },
  { value: 'watch', label: 'Surveiller', description: 'Toutes les notifications' },
  { value: 'mention', label: 'Mention', description: 'Uniquement quand vous êtes mentionné' },
  { value: 'disabled', label: 'Désactivé', description: 'Aucune notification' },
]

const allLevels = [
  { value: 'global', label: 'Global' },
  ...notificationLevels,
]

const notificationModules = [
  { key: 'paxlog', label: 'PaxLog' },
  { key: 'projects', label: 'Projects' },
  { key: 'planner', label: 'Planner' },
  { key: 'travelwiz', label: 'TravelWiz' },
  { key: 'packlog', label: 'PackLog' },
  { key: 'conformite', label: 'Conformité' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'support', label: 'Support' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'core', label: 'Core' },
]

const defaultNotificationMatrix = Object.fromEntries(
  notificationModules.map((module) => [
    module.key,
    { in_app: true, email: true, digest: true },
  ]),
)

const notificationEvents = [
  { key: 'ads.submitted', label: 'AdS soumise', module: 'PaxLog' },
  { key: 'ads.rejected', label: 'AdS rejetée', module: 'PaxLog' },
  { key: 'ads.compliance_failed', label: 'AdS bloquée en conformité', module: 'PaxLog' },
  { key: 'ads.approved', label: 'AdS approuvée', module: 'PaxLog' },
  { key: 'planner.activity.validated', label: 'Activité validée', module: 'Planner' },
  { key: 'planner.activity.cancelled', label: 'Activité annulée', module: 'Planner' },
  { key: 'planner.conflict.detected', label: 'Conflit de capacité détecté', module: 'Planner' },
  { key: 'planner.revision.requested', label: 'Révision demandée', module: 'Planner' },
  { key: 'planner.revision.responded', label: 'Réponse à une révision', module: 'Planner' },
  { key: 'planner.revision.forced', label: 'Révision forcée', module: 'Planner' },
  { key: 'project.status.changed', label: 'Statut projet modifié', module: 'Projects' },
  { key: 'project.task.assigned', label: 'Tâche assignée', module: 'Projects' },
  { key: 'project.task.planner_sync_required', label: 'Révision Planner suggérée', module: 'Projects' },
  { key: 'conformite.record_verified', label: 'Conformité vérifiée / rejetée', module: 'Conformité' },
  { key: 'conformite.rule.changed', label: 'Règle modifiée', module: 'Conformité' },
  { key: 'conformite.record.expired', label: 'Conformité expirée', module: 'Conformité' },
  { key: 'document.submitted', label: 'Document soumis', module: 'Papyrus' },
  { key: 'document.approved', label: 'Document approuvé', module: 'Papyrus' },
  { key: 'document.rejected', label: 'Document rejeté', module: 'Papyrus' },
  { key: 'document.published', label: 'Document publié', module: 'Papyrus' },
  { key: 'ticket.assigned', label: 'Ticket assigné', module: 'Support' },
  { key: 'ticket.commented', label: 'Ticket commenté', module: 'Support' },
  { key: 'ticket.resolved', label: 'Ticket résolu', module: 'Support' },
  { key: 'travelwiz.pickup_reminder', label: 'Rappel de navette', module: 'TravelWiz' },
] as const

const defaultNotificationEventMatrix = Object.fromEntries(
  notificationEvents.map((event) => [
    event.key,
    { in_app: true, email: true, digest: true, sms: true, whatsapp: true },
  ]),
)

export function NotificationsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: prefs, isLoading: prefsLoading } = useNotificationPreferences()
  const { data: emails } = useUserEmails()
  const { data: groups } = useUserGroups()
  const updatePrefs = useUpdateNotificationPreferences()
  const { getPref, setPref } = useUserPreferences()

  const [globalLevel, setGlobalLevel] = useState('participate')
  const [notifySelf, setNotifySelf] = useState(false)
  const [notificationEmailId, setNotificationEmailId] = useState<string>('')
  const [groupOverrides, setGroupOverrides] = useState<Record<string, { level: string }>>({})
  const [notificationMatrix, setNotificationMatrix] = useState<Record<string, { in_app: boolean; email: boolean; digest: boolean }>>(
    () => getPref('notifications_matrix', defaultNotificationMatrix),
  )
  const [notificationEventMatrix, setNotificationEventMatrix] = useState<Record<string, { in_app: boolean; email: boolean; digest: boolean; sms: boolean; whatsapp: boolean }>>(
    () => getPref('notification_event_matrix', defaultNotificationEventMatrix),
  )

  // Sync state from API data
  useEffect(() => {
    if (prefs) {
      setGlobalLevel(prefs.global_level)
      setNotifySelf(prefs.notify_own_actions)
      setNotificationEmailId(prefs.notification_email_id || '')
      if (prefs.group_overrides) {
        setGroupOverrides(prefs.group_overrides as Record<string, { level: string }>)
      }
    }
  }, [prefs])

  useEffect(() => {
    setNotificationMatrix(getPref('notifications_matrix', defaultNotificationMatrix))
    setNotificationEventMatrix(getPref('notification_event_matrix', defaultNotificationEventMatrix))
  }, [getPref])

  const handleSave = async () => {
    try {
      await updatePrefs.mutateAsync({
        global_level: globalLevel,
        notify_own_actions: notifySelf,
        notification_email_id: notificationEmailId || null,
        group_overrides: Object.keys(groupOverrides).length > 0 ? groupOverrides : null,
      })
      setPref('notifications_matrix', notificationMatrix)
      setPref('notification_event_matrix', notificationEventMatrix)
      toast({ title: t('settings.toast.notifications.prefs_saved'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.notifications.prefs_save_error'), variant: 'error' })
    }
  }

  if (prefsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <CollapsibleSection id="notifications-global" title="Notifications" description={t('settings.configurez_le_niveau_de_notification_par')} storageKey="settings.notifications.collapse">
        {/* Global notification email */}
        <div className="mt-6">
          <label className="gl-label">{t('settings.email_de_notification_global')}</label>
          <select
            className="gl-form-select max-w-md"
            value={notificationEmailId}
            onChange={(e) => setNotificationEmailId(e.target.value)}
          >
            <option value="">Utiliser l'email principal</option>
            {emails?.map((email) => (
              <option key={email.id} value={email.id}>
                {email.email} {email.is_primary ? '(principal)' : ''} {!email.verified ? '(non vérifié)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Global notification level */}
        <div className="mt-5">
          <label className="gl-label">{t('settings.niveau_de_notification_global')}</label>
          <p className="text-sm text-muted-foreground mb-2">
            Par défaut, tous les groupes utilisent le niveau de notification global.
          </p>
          <div className="flex items-center gap-2 max-w-xs">
            <Bell size={14} className="text-muted-foreground shrink-0" />
            <select value={globalLevel} onChange={(e) => setGlobalLevel(e.target.value)} className="gl-form-select">
              {notificationLevels.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Self-notification */}
        <div className="mt-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notifySelf}
              onChange={(e) => setNotifySelf(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">{t('settings.recevoir_les_notifications_de_vos_propre')}</span>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="notifications-groups" title="Groupes & Actions" description={t('settings.personnalisez_les_notifications_par_grou')} storageKey="settings.notifications.collapse">
        {/* Per-group overrides */}
        {groups && groups.length > 0 && (
          <div className="border border-border/60 rounded-lg bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/30 rounded-t-lg">
              <span className="text-sm font-semibold text-foreground">Groupes</span>
              <span className="text-sm text-muted-foreground">{groups.length}</span>
            </div>
            {groups.map((group) => (
              <div key={group.id} className="flex items-center justify-between px-4 py-3 border-b border-border/20 last:border-b-0">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">{group.name}</span>
                </div>
                <select
                  className="gl-form-select text-sm max-w-[180px]"
                  value={groupOverrides[group.id]?.level || 'global'}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'global') {
                      const next = { ...groupOverrides }
                      delete next[group.id]
                      setGroupOverrides(next)
                    } else {
                      setGroupOverrides({ ...groupOverrides, [group.id]: { level: val } })
                    }
                  }}
                >
                  {allLevels.map((level) => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button className="gl-button gl-button-confirm" onClick={handleSave} disabled={updatePrefs.isPending}>
            {updatePrefs.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
            Enregistrer
          </button>
          <button
            className="gl-button gl-button-default"
            onClick={() => {
              if (prefs) {
                setGlobalLevel(prefs.global_level)
                setNotifySelf(prefs.notify_own_actions)
              }
              setNotificationMatrix(getPref('notifications_matrix', defaultNotificationMatrix))
              setNotificationEventMatrix(getPref('notification_event_matrix', defaultNotificationEventMatrix))
            }}
          >
            Annuler
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="notifications-matrix"
        title="Matrice par module"
        description={t('settings.definissez_les_canaux_autorises_par_modu')}
        storageKey="settings.notifications.collapse"
      >
        <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
          <div className="grid grid-cols-[1.5fr_repeat(3,minmax(0,140px))] gap-0 px-4 py-3 border-b border-border/40 bg-muted/30 text-xs font-semibold text-muted-foreground">
            <span>Module</span>
            <span>In-app</span>
            <span>Email</span>
            <span>Digest</span>
          </div>
          {notificationModules.map((module) => {
            const value = notificationMatrix[module.key] || defaultNotificationMatrix[module.key]
            return (
              <div key={module.key} className="grid grid-cols-[1.5fr_repeat(3,minmax(0,140px))] gap-0 px-4 py-3 border-b border-border/20 last:border-b-0 items-center">
                <span className="text-sm text-foreground">{module.label}</span>
                {(['in_app', 'email', 'digest'] as const).map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(value?.[channel])}
                      onChange={(e) => {
                        const next = {
                          ...notificationMatrix,
                          [module.key]: {
                            ...(notificationMatrix[module.key] || defaultNotificationMatrix[module.key]),
                            [channel]: e.target.checked,
                          },
                        }
                        setNotificationMatrix(next)
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{europeanChannelLabel(channel)}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="notifications-events"
        title={t('settings.matrice_par_evenement')}
        description={t('settings.affinez_les_canaux_autorises_pour_les_ev')}
        storageKey="settings.notifications.collapse"
      >
        <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
          <div className="grid grid-cols-[1.1fr_1.5fr_repeat(5,minmax(0,110px))] gap-0 px-4 py-3 border-b border-border/40 bg-muted/30 text-xs font-semibold text-muted-foreground">
            <span>Module</span>
            <span>{t('settings.evenement')}</span>
            <span>In-app</span>
            <span>Email</span>
            <span>Digest</span>
            <span>SMS</span>
            <span>WhatsApp</span>
          </div>
          {notificationEvents.map((event) => {
            const value = notificationEventMatrix[event.key] || defaultNotificationEventMatrix[event.key]
            return (
              <div key={event.key} className="grid grid-cols-[1.1fr_1.5fr_repeat(5,minmax(0,110px))] gap-0 px-4 py-3 border-b border-border/20 last:border-b-0 items-center">
                <span className="text-sm text-muted-foreground">{event.module}</span>
                <span className="text-sm text-foreground">{event.label}</span>
                {(['in_app', 'email', 'digest', 'sms', 'whatsapp'] as const).map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(value?.[channel])}
                      onChange={(e) => {
                        const next = {
                          ...notificationEventMatrix,
                          [event.key]: {
                            ...(notificationEventMatrix[event.key] || defaultNotificationEventMatrix[event.key]),
                            [channel]: e.target.checked,
                          },
                        }
                        setNotificationEventMatrix(next)
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{europeanChannelLabel(channel)}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="notifications-display"
        title={t('settings.affichage_des_notifications')}
        description="Position, durée et opacité des notifications toast. Ces réglages sont personnels et remplacent les valeurs par défaut de l'administrateur."
        storageKey="settings.notifications.collapse"
        showSeparator={false}
      >
        <ToastSettingsSection />
      </CollapsibleSection>
    </>
  )
}

function europeanChannelLabel(channel: 'in_app' | 'email' | 'digest' | 'sms' | 'whatsapp') {
  if (channel === 'in_app') return 'Autorisé'
  if (channel === 'email') return 'Autorisé'
  if (channel === 'sms') return 'Autorisé'
  if (channel === 'whatsapp') return 'Autorisé'
  return 'Autorisé'
}

// ── Toast configuration section ────────────────────────────
function ToastSettingsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [position, setPosition] = useState<ToastPosition>(getToastPosition)
  const [duration, setDuration] = useState(getToastDuration)
  const [opacity, setOpacity] = useState(getToastOpacity)

  const handlePositionChange = (pos: ToastPosition) => {
    setPosition(pos)
    setToastPosition(pos)
    toast({ title: t('settings.toast.notifications.position_updated'), description: t('settings.toast.notifications.position_updated_desc', { position: TOAST_POSITIONS.find(p => p.value === pos)?.label?.toLowerCase() }), variant: 'success' })
  }

  const handleDurationChange = (ms: number) => {
    setDuration(ms)
    setToastDuration(ms)
  }

  const handleDurationCommit = () => {
    toast({ title: t('settings.toast.notifications.duration_updated', { value: (duration / 1000).toFixed(1) }), description: t('settings.toast.notifications.duration_updated_desc'), variant: 'success' })
  }

  const handleOpacityChange = (val: number) => {
    setOpacity(val)
    setToastOpacity(val)
  }

  const handleOpacityCommit = () => {
    toast({ title: t('settings.toast.notifications.opacity_updated', { value: opacity }), description: t('settings.toast.notifications.opacity_updated_desc'), variant: 'success' })
  }

  return (
    <div className="mt-2 space-y-4">
      {/* Position grid */}
      <div>
        <label className="gl-label flex items-center gap-1.5">
          <Bell size={12} className="text-muted-foreground" />
          Position des notifications
        </label>
        <div className="grid grid-cols-3 gap-1.5 mt-2 max-w-xs">
          {TOAST_POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePositionChange(p.value)}
              className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all border ${
                position === p.value
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Cliquez pour changer. Un toast de confirmation s'affichera à la nouvelle position.
        </p>
      </div>

      {/* Duration slider */}
      <div>
        <label className="gl-label">{t('settings.duree_d_affichage')}</label>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="range"
            min={1000}
            max={15000}
            step={500}
            value={duration}
            onChange={(e) => handleDurationChange(parseInt(e.target.value))}
            onMouseUp={handleDurationCommit}
            onTouchEnd={handleDurationCommit}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="text-sm font-mono text-foreground w-12 text-right">
            {(duration / 1000).toFixed(1)}s
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Durée avant disparition automatique (1s à 15s).
        </p>
      </div>

      {/* Opacity slider */}
      <div>
        <label className="gl-label">{t('settings.opacite')}</label>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
            onMouseUp={handleOpacityCommit}
            onTouchEnd={handleOpacityCommit}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="text-sm font-mono text-foreground w-12 text-right">
            {opacity}%
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Transparence des notifications (10% à 100%).
        </p>
      </div>
    </div>
  )
}
