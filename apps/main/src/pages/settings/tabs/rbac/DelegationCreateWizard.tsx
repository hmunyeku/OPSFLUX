/**
 * DelegationCreateWizard — 3-step modal to create a delegation.
 *
 * Steps:
 * 1. Choose delegate (user picker)
 * 2. Choose permissions (multi-select from current user's effective perms)
 * 3. Period (datepicker) + Reason (textarea)
 */
import { useState } from 'react'
import { ChevronRight, ChevronLeft, X, Loader2, Search } from 'lucide-react'
import { useCreateDelegation } from '@/hooks/useRbac'
import { useDelegationCandidates } from '@/hooks/useUsers'
import { usePermissions } from '@/hooks/useRbac'
import { useToast } from '@/components/ui/Toast'

interface Props {
  onClose: () => void
  onCreated: () => void
}

type Step = 1 | 2 | 3

export function DelegationCreateWizard({ onClose, onCreated }: Props) {
  const { toast } = useToast()
  const createMutation = useCreateDelegation()
  const [step, setStep] = useState<Step>(1)
  const [delegateId, setDelegateId] = useState<string>('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 16))
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16)
  )
  const [reason, setReason] = useState<string>('')
  const [delegateSearch, setDelegateSearch] = useState<string>('')

  // Backed by GET /api/v1/users/me/delegation-candidates — top 50 active users
  // in current entity, excludes self. Search-aware (server-side filter).
  const { data: users = [], isLoading: usersLoading } = useDelegationCandidates(
    delegateSearch.trim() || undefined
  )
  const { data: allPerms = [] } = usePermissions()

  const canNext1 = !!delegateId
  const canNext2 = permissions.length > 0
  const canSubmit = !!startDate && !!endDate && reason.trim().length >= 10 && new Date(endDate) > new Date(startDate)

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        delegate_id: delegateId,
        permissions,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        reason: reason.trim(),
      })
      toast({
        title: 'Délégation créée',
        description: '2 emails envoyés (vous + délégué)',
        variant: 'success',
      })
      onCreated()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      const errMsg = e?.response?.data?.detail?.message ?? e?.message ?? 'Erreur inconnue'
      toast({ title: 'Échec de la création', description: errMsg, variant: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[600px] max-h-[80vh] overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold">Créer une délégation — Étape {step}/3</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {/* Step 1: Delegate picker */}
          {step === 1 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Délégué (qui reçoit la délégation)
              </label>
              <p className="mb-3 text-xs text-slate-500">
                Top 50 utilisateurs actifs de votre tenant. Tapez pour filtrer par nom/email.
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={delegateSearch}
                  onChange={e => setDelegateSearch(e.target.value)}
                  placeholder="Rechercher un utilisateur…"
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </div>

              {usersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : users.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  Aucun utilisateur ne correspond.
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1 dark:border-slate-700">
                  {users.map(u => {
                    const selected = u.id === delegateId
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setDelegateId(u.id)}
                          className={
                            'flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm ' +
                            (selected
                              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700')
                          }
                        >
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt=""
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-100">
                              {(u.first_name?.[0] ?? '?').toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {u.first_name} {u.last_name}
                            </div>
                            <div className="truncate text-xs text-slate-500">{u.email}</div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Step 2: Permissions */}
          {step === 2 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Permissions à déléguer ({permissions.length} sélectionnées)
              </label>
              <p className="mb-2 text-xs text-slate-500">
                Note : vous ne pouvez déléguer que les permissions que vous possédez effectivement (hors délégations reçues).
              </p>
              <div className="max-h-80 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
                {allPerms.map((p) => (
                  <label
                    key={p.code}
                    className="flex items-center gap-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={permissions.includes(p.code)}
                      onChange={e => {
                        setPermissions(prev =>
                          e.target.checked ? [...prev, p.code] : prev.filter(c => c !== p.code)
                        )
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-mono text-xs text-slate-500">{p.code}</span>
                    <span className="text-slate-700">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Period + reason */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-sm font-medium mb-1">Début</span>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium mb-1">Fin</span>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  />
                </label>
              </div>
              <label>
                <span className="block text-sm font-medium mb-1">
                  Motif (obligatoire, minimum 10 caractères — exigence ISO 27001)
                </span>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  placeholder="Ex: Vacances du 1er au 15 août — déléguer la validation des MOC"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {reason.length}/500 caractères, minimum 10
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setStep(s => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(s => ((s + 1) as Step))}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || createMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Création…
                </>
              ) : (
                'Créer la délégation'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
