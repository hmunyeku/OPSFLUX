/**
 * Notifications tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/profile/notifications
 *
 * API-backed: GET/PATCH /api/v1/preferences/notifications
 * Uses user emails for notification email selection.
 */
import { useState, useEffect } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { useNotificationPreferences, useUpdateNotificationPreferences, useUserEmails, useUserGroups } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
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

export function NotificationsTab() {
  const { toast } = useToast()
  const { data: prefs, isLoading: prefsLoading } = useNotificationPreferences()
  const { data: emails } = useUserEmails()
  const { data: groups } = useUserGroups()
  const updatePrefs = useUpdateNotificationPreferences()

  const [globalLevel, setGlobalLevel] = useState('participate')
  const [notifySelf, setNotifySelf] = useState(false)
  const [notificationEmailId, setNotificationEmailId] = useState<string>('')
  const [groupOverrides, setGroupOverrides] = useState<Record<string, { level: string }>>({})

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

  const handleSave = async () => {
    try {
      await updatePrefs.mutateAsync({
        global_level: globalLevel,
        notify_own_actions: notifySelf,
        notification_email_id: notificationEmailId || null,
        group_overrides: Object.keys(groupOverrides).length > 0 ? groupOverrides : null,
      })
      toast({ title: 'Préférences enregistrées', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer les préférences.', variant: 'error' })
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
      <CollapsibleSection id="notifications-global" title="Notifications" description="Configurez le niveau de notification par groupe ou globalement." storageKey="settings.notifications.collapse">
        {/* Global notification email */}
        <div className="mt-6">
          <label className="gl-label">Email de notification global</label>
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
          <label className="gl-label">Niveau de notification global</label>
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
            <span className="text-sm text-foreground">Recevoir les notifications de vos propres actions</span>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="notifications-groups" title="Groupes & Actions" description="Personnalisez les notifications par groupe." storageKey="settings.notifications.collapse" showSeparator={false}>
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
          <button className="gl-button gl-button-default" onClick={() => { if (prefs) { setGlobalLevel(prefs.global_level); setNotifySelf(prefs.notify_own_actions) } }}>
            Annuler
          </button>
        </div>
      </CollapsibleSection>
    </>
  )
}
