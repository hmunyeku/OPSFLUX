/**
 * Step 3 — Invite the first teammate(s).
 *
 * Adds rows to a local list, then on "Save" creates each one via
 * useCreateUser. Sent users get the current entity as default and
 * receive a password-reset email so they can set their own password.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Plus, Trash2, Loader2, Check, Mail } from 'lucide-react'
import { useCreateUser, useSendPasswordReset } from '@/hooks/useUsers'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'

export interface Step3UserDraft {
  email: string
  first_name: string
  last_name: string
}

interface Props {
  value: Step3UserDraft[]
  onChange: (v: Step3UserDraft[]) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Step3Users({ value, onChange }: Props) {
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const sendReset = useSendPasswordReset()
  const currentEntityId = useAuthStore((s) => s.currentEntityId)
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [createdEmails, setCreatedEmails] = useState<string[]>([])

  const addRow = () => onChange([...value, { email: '', first_name: '', last_name: '' }])
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const updateRow = (i: number, patch: Partial<Step3UserDraft>) => {
    onChange(value.map((u, idx) => (idx === i ? { ...u, ...patch } : u)))
  }

  const handleCreate = async () => {
    const drafts = value.filter((u) => u.email && u.first_name && u.last_name && !createdEmails.includes(u.email))
    if (drafts.length === 0) {
      toast({ title: t('onboarding.step3.error_empty'), variant: 'error' })
      return
    }
    const invalid = drafts.find((u) => !EMAIL_RE.test(u.email))
    if (invalid) {
      toast({ title: t('onboarding.step3.error_invalid_email'), description: invalid.email, variant: 'error' })
      return
    }
    setCreating(true)
    let okCount = 0
    let failCount = 0
    for (const u of drafts) {
      try {
        await createUser.mutateAsync({
          email: u.email,
          first_name: u.first_name,
          last_name: u.last_name,
          default_entity_id: currentEntityId || undefined,
        })
        // Best-effort password reset email — failure here doesn't undo the user.
        try {
          await sendReset.mutateAsync(u.email)
        } catch {
          /* swallow — the admin can resend manually later */
        }
        setCreatedEmails((prev) => [...prev, u.email])
        okCount++
      } catch {
        failCount++
      }
    }
    setCreating(false)
    if (okCount > 0) {
      toast({
        title: t('onboarding.step3.created', { count: okCount }),
        description: failCount > 0 ? t('onboarding.step3.partial_fail', { count: failCount }) : undefined,
        variant: failCount > 0 ? 'warning' : 'success',
      })
    } else {
      toast({ title: t('common.failed'), variant: 'error' })
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Users size={16} className="text-primary" />
          {t('onboarding.step3.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t('onboarding.step3.subtitle')}</p>
      </div>

      <div className="space-y-2">
        {value.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-1 py-3 text-center border border-dashed border-border rounded">
            {t('onboarding.step3.empty')}
          </p>
        )}
        {value.map((u, i) => {
          const isCreated = createdEmails.includes(u.email)
          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-4">
                <label className="gl-label-sm" htmlFor={`ob-user-fn-${i}`}>
                  {t('onboarding.step3.first_name')}
                </label>
                <input
                  id={`ob-user-fn-${i}`}
                  className={panelInputClass}
                  value={u.first_name}
                  onChange={(e) => updateRow(i, { first_name: e.target.value })}
                  disabled={isCreated}
                />
              </div>
              <div className="col-span-12 sm:col-span-4">
                <label className="gl-label-sm" htmlFor={`ob-user-ln-${i}`}>
                  {t('onboarding.step3.last_name')}
                </label>
                <input
                  id={`ob-user-ln-${i}`}
                  className={panelInputClass}
                  value={u.last_name}
                  onChange={(e) => updateRow(i, { last_name: e.target.value })}
                  disabled={isCreated}
                />
              </div>
              <div className="col-span-10 sm:col-span-3">
                <label className="gl-label-sm" htmlFor={`ob-user-em-${i}`}>
                  {t('onboarding.step3.email')}
                </label>
                <input
                  id={`ob-user-em-${i}`}
                  type="email"
                  className={panelInputClass}
                  value={u.email}
                  onChange={(e) => updateRow(i, { email: e.target.value })}
                  disabled={isCreated}
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-end pb-0.5">
                {isCreated ? (
                  <span title={t('onboarding.step3.row_created')} className="text-green-600 dark:text-green-400">
                    <Check size={14} />
                  </span>
                ) : (
                  <button
                    onClick={() => removeRow(i)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-chrome hover:text-destructive transition-colors"
                    aria-label={t('common.remove')}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={addRow} className="btn btn-sm btn-secondary">
          <Plus size={12} />
          {t('onboarding.step3.add_row')}
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || value.length === 0}
          className="btn btn-sm btn-primary"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
          {t('onboarding.step3.invite')}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t('onboarding.step3.hint')}</p>
    </div>
  )
}
