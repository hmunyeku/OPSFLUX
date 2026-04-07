import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import {
  useCreateDelegation,
  useCurrentActingContext,
  useDelegationCandidates,
  useDeleteDelegation,
  useIncomingDelegations,
  useOutgoingDelegations,
  useSimulationCandidates,
  useUserRoles,
} from '@/hooks/useSettings'
import { useAuthStore } from '@/stores/authStore'

export function DelegationsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { permissions } = usePermission()
  const { data: roles = [] } = useUserRoles()
  const { data: outgoing = [] } = useOutgoingDelegations()
  const { data: incoming = [] } = useIncomingDelegations()
  const { data: currentContext } = useCurrentActingContext()
  const createDelegation = useCreateDelegation()
  const deleteDelegation = useDeleteDelegation()
  const setActingContext = useAuthStore((s) => s.setActingContext)
  const actingContext = useAuthStore((s) => s.actingContext)

  const [candidateSearch, setCandidateSearch] = useState('')
  const [simulationSearch, setSimulationSearch] = useState('')
  const [delegateId, setDelegateId] = useState('')
  const [scopeType, setScopeType] = useState<'all' | 'role' | 'permissions'>('all')
  const [roleCode, setRoleCode] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const { data: candidates = [] } = useDelegationCandidates(candidateSearch)
  const canSimulate = permissions.includes('*') || permissions.includes('admin.system')
  const { data: simulationCandidates = [] } = useSimulationCandidates(simulationSearch, canSimulate)

  const permissionOptions = useMemo(
    () => permissions.filter((code) => code !== '*').sort(),
    [permissions],
  )

  const resetForm = () => {
    setDelegateId('')
    setScopeType('all')
    setRoleCode('')
    setSelectedPermissions([])
    setStartDate('')
    setEndDate('')
    setReason('')
  }

  const submit = async () => {
    if (!delegateId || !startDate || !endDate) {
      toast({ title: t('common.error'), description: t('settings.delegations.validation'), variant: 'error' })
      return
    }
    try {
      await createDelegation.mutateAsync({
        delegate_id: delegateId,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        reason: reason || null,
        scope_type: scopeType,
        role_code: scopeType === 'role' ? roleCode : null,
        permission_codes: scopeType === 'permissions' ? selectedPermissions : [],
      })
      toast({ title: t('common.success'), description: t('settings.delegations.created'), variant: 'success' })
      resetForm()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('common.error'), description: detail || t('settings.delegations.create_error'), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection
        id="delegations-outgoing"
        title={t('settings.delegations.outgoing_title')}
        description={t('settings.delegations.outgoing_description')}
        storageKey="settings.delegations"
      >
        <div className="grid gap-4 md:grid-cols-2 max-w-5xl">
          <div className="space-y-2">
            <label className="gl-label">{t('settings.delegations.delegate')}</label>
            <input value={candidateSearch} onChange={(e) => setCandidateSearch(e.target.value)} className="gl-form-input" placeholder={t('common.search')} />
            <select value={delegateId} onChange={(e) => setDelegateId(e.target.value)} className="gl-form-input">
              <option value="">{t('settings.delegations.select_delegate')}</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.first_name} {candidate.last_name} ({candidate.email})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="gl-label">{t('settings.delegations.scope')}</label>
            <select value={scopeType} onChange={(e) => setScopeType(e.target.value as 'all' | 'role' | 'permissions')} className="gl-form-input">
              <option value="all">{t('settings.delegations.scope_all')}</option>
              <option value="role">{t('settings.delegations.scope_role')}</option>
              <option value="permissions">{t('settings.delegations.scope_permissions')}</option>
            </select>
          </div>

          {scopeType === 'role' && (
            <div className="space-y-2 md:col-span-2">
              <label className="gl-label">{t('settings.delegations.role')}</label>
              <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)} className="gl-form-input">
                <option value="">{t('settings.delegations.select_role')}</option>
                {roles.map((role) => (
                  <option key={role.code} value={role.code}>{role.name}</option>
                ))}
              </select>
            </div>
          )}

          {scopeType === 'permissions' && (
            <div className="space-y-2 md:col-span-2">
              <label className="gl-label">{t('settings.delegations.permissions')}</label>
              <div className="max-h-52 overflow-auto rounded-lg border border-border bg-card p-3 space-y-2">
                {permissionOptions.map((code) => {
                  const checked = selectedPermissions.includes(code)
                  return (
                    <label key={code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedPermissions((prev) =>
                            e.target.checked ? [...prev, code] : prev.filter((item) => item !== code),
                          )
                        }}
                      />
                      <span className="font-mono text-xs">{code}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="gl-label">{t('settings.delegations.start')}</label>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="gl-form-input" />
          </div>

          <div className="space-y-2">
            <label className="gl-label">{t('settings.delegations.end')}</label>
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="gl-form-input" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="gl-label">{t('settings.delegations.reason')}</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="gl-form-input min-h-24" />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={submit} disabled={createDelegation.isPending} className="gl-button-primary">
            {t('settings.delegations.create_action')}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {outgoing.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {item.delegate?.first_name} {item.delegate?.last_name}
                </p>
                <p className="text-xs text-muted-foreground">{item.reason || t('settings.delegations.no_reason')}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.start_date).toLocaleString()} → {new Date(item.end_date).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{item.permissions.length} {t('settings.delegations.permissions_count')}</p>
              </div>
              <button
                onClick={() => deleteDelegation.mutate(item.id)}
                className="gl-button-secondary"
                disabled={deleteDelegation.isPending}
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
          {outgoing.length === 0 && <p className="text-sm text-muted-foreground">{t('settings.delegations.no_outgoing')}</p>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="delegations-incoming"
        title={t('settings.delegations.incoming_title')}
        description={t('settings.delegations.incoming_description')}
        storageKey="settings.delegations"
      >
        <div className="space-y-3">
          {incoming.map((item) => {
            const contextKey = `delegate:${item.delegator_id}`
            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {item.delegator?.first_name} {item.delegator?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.reason || t('settings.delegations.no_reason')}</p>
                  <p className="text-xs text-muted-foreground">{item.permissions.length} {t('settings.delegations.permissions_count')}</p>
                </div>
                <button
                  onClick={() => setActingContext(contextKey)}
                  className={actingContext === contextKey ? 'gl-button-primary' : 'gl-button-secondary'}
                >
                  {actingContext === contextKey ? t('settings.delegations.active_context') : t('settings.delegations.activate_context')}
                </button>
              </div>
            )
          })}
          {incoming.length === 0 && <p className="text-sm text-muted-foreground">{t('settings.delegations.no_incoming')}</p>}
        </div>
      </CollapsibleSection>

      {canSimulate && (
        <CollapsibleSection
          id="delegations-simulation"
          title={t('settings.delegations.simulation_title')}
          description={t('settings.delegations.simulation_description')}
          storageKey="settings.delegations"
        >
          <div className="max-w-4xl space-y-4">
            <div className="flex items-center gap-2">
              <input value={simulationSearch} onChange={(e) => setSimulationSearch(e.target.value)} className="gl-form-input" placeholder={t('common.search')} />
              <button onClick={() => setActingContext('own')} className="gl-button-secondary">
                {t('settings.delegations.back_to_self')}
              </button>
            </div>
            {currentContext?.mode === 'simulate' && currentContext.target_user && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                {t('settings.delegations.current_simulation')}: {currentContext.target_user.first_name} {currentContext.target_user.last_name}
              </div>
            )}
            <div className="space-y-2">
              {simulationCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{candidate.first_name} {candidate.last_name}</p>
                    <p className="text-xs text-muted-foreground">{candidate.email}</p>
                  </div>
                  <button onClick={() => setActingContext(`simulate:${candidate.id}`)} className="gl-button-secondary">
                    {t('settings.delegations.simulate_action')}
                  </button>
                </div>
              ))}
              {simulationCandidates.length === 0 && <p className="text-sm text-muted-foreground">{t('settings.delegations.no_simulation_candidates')}</p>}
            </div>
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
