/**
 * RbacSettingsTab — 6th sub-tab: default-role-per-user-type + ISO delegation settings.
 *
 * Sections:
 * 1. Default role per user_type (internal / external / tier_contact)
 * 2. ISO delegation settings (note — settings live in global Settings API)
 * 3. Recent RBAC audit panel (last 10 delegation events)
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import {
  useRbacDefaults,
  useSetRbacDefaults,
  useRoles,
  useAuditEvents,
} from '@/hooks/useRbac'
import type { RoleRead } from '@/services/rbacService'

export function RbacSettingsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: defaults, isLoading } = useRbacDefaults()
  const { data: roles = [] } = useRoles({})
  const setMutation = useSetRbacDefaults()
  const { data: auditResp } = useAuditEvents({
    event_type_prefix: 'delegation',
    page_size: 10,
  })

  const [internal, setInternal] = useState('')
  const [external, setExternal] = useState('')
  const [tierContact, setTierContact] = useState('')

  useEffect(() => {
    if (defaults) {
      setInternal(defaults.internal ?? '')
      setExternal(defaults.external ?? '')
      setTierContact(defaults.tier_contact ?? '')
    }
  }, [defaults])

  const handleSave = async () => {
    try {
      await setMutation.mutateAsync({
        internal,
        external,
        tier_contact: tierContact,
      })
      toast({
        title: t('rbac.settings.saved', 'Réglages sauvés'),
        variant: 'success',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast({
        title: t('common.error', 'Erreur'),
        description: message,
        variant: 'error',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      {/* Section 1: Default roles */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t(
            'rbac.settings.defaults.title',
            "Rôles par défaut à la création d'un utilisateur",
          )}
        </h3>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {t(
            'rbac.settings.defaults.help',
            'Quand un admin crée un utilisateur, ce rôle lui est automatiquement attribué (via un groupe "Default {role}").',
          )}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <DefaultRoleSelect
            label={t('rbac.settings.defaults.internal', 'Type interne')}
            value={internal}
            onChange={setInternal}
            roles={roles}
          />
          <DefaultRoleSelect
            label={t('rbac.settings.defaults.external', 'Type externe')}
            value={external}
            onChange={setExternal}
            roles={roles}
          />
          <DefaultRoleSelect
            label={t('rbac.settings.defaults.tier_contact', 'Contact tiers')}
            value={tierContact}
            onChange={setTierContact}
            roles={roles}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={setMutation.isPending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {setMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.saving', 'Sauvegarde…')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t('common.save', 'Enregistrer')}
            </>
          )}
        </button>
      </section>

      {/* Section 2: ISO delegation settings — placeholder note */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t('rbac.settings.iso.title', 'Réglages ISO délégations')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t(
            'rbac.settings.iso.note',
            "La durée maximale des délégations et l'option de notification du SECURITY_OFFICER se règlent via l'onglet Settings global (clés ",
          )}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-700">
            rbac.delegation.max_duration_days
          </code>
          {' '}
          {t('rbac.settings.iso.and', 'et')}
          {' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-700">
            rbac.delegation.notify_security_officer
          </code>
          {t('rbac.settings.iso.endpoint', '). Voir /api/v1/settings.')}
        </p>
      </section>

      {/* Section 3: Recent RBAC audit */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t('rbac.settings.audit.title', 'Audit RBAC récent (délégations)')}
        </h3>
        {auditResp?.items?.length ? (
          <ul className="space-y-2">
            {auditResp.items.map(e => (
              <li key={e.id} className="text-sm">
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {new Date(e.occurred_at).toLocaleString('fr-FR')}
                </span>
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-700">
                  {e.event_type}
                </span>
                {e.target && (
                  <span className="ml-2 text-slate-700 dark:text-slate-300">
                    {e.target}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('rbac.settings.audit.empty', 'Aucun événement récent.')}
          </p>
        )}
      </section>
    </div>
  )
}

function DefaultRoleSelect({
  label,
  value,
  onChange,
  roles,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  roles: RoleRead[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">— Aucun —</option>
        {roles.map(r => (
          <option key={r.code} value={r.code}>
            {r.code} — {r.name}
          </option>
        ))}
      </select>
    </label>
  )
}
