import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch } from 'lucide-react'
import { DynamicPanelShell, DynamicPanelField, panelInputClass, PanelContentLayout } from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useCreateTransfer } from '@/hooks/useConformite'
import { useTiers, useTierContacts } from '@/hooks/useTiers'
import type { TierContactTransferCreate } from '@/types/api'

export function CreateTransferPanel() {
  return (
    <SmartFormProvider panelId="create-transfer" defaultMode="simple">
      <CreateTransferInner />
    </SmartFormProvider>
  )
}

function CreateTransferInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const createTransfer = useCreateTransfer()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()

  // Fetch all tiers for dropdowns
  const { data: tiersData } = useTiers({ page_size: 500 })

  const [selectedContactTierId, setSelectedContactTierId] = useState<string>('')

  // Fetch contacts for the selected tier
  const { data: contactsData } = useTierContacts(selectedContactTierId || undefined)

  const [form, setForm] = useState<TierContactTransferCreate>({
    contact_id: '',
    from_tier_id: '',
    to_tier_id: '',
    transfer_date: new Date().toISOString().split('T')[0],
    reason: null,
  })

  // When a contact is selected, auto-populate from_tier_id with the contact's current tier
  useEffect(() => {
    if (form.contact_id && contactsData?.items) {
      const selectedContact = contactsData.items.find((c) => c.id === form.contact_id)
      if (selectedContact && selectedContact.tier_id) {
        setForm((prev) => ({ ...prev, from_tier_id: selectedContact.tier_id }))
      }
    }
  }, [form.contact_id, contactsData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.contact_id) {
      toast({ title: t('conformite.toast.select_employee'), variant: 'error' })
      return
    }
    if (!form.from_tier_id || !form.to_tier_id) {
      toast({ title: t('conformite.toast.select_tiers'), variant: 'error' })
      return
    }
    if (form.from_tier_id === form.to_tier_id) {
      toast({ title: t('conformite.toast.same_tier_error'), variant: 'error' })
      return
    }

    try {
      await createTransfer.mutateAsync(form)
      closeDynamicPanel()
      toast({ title: t('conformite.toast.transfer_created'), variant: 'success' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('conformite.toast.transfer_creation_error')
      toast({ title: message, variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createTransfer.isPending,
      disabled: createTransfer.isPending,
      onClick: () => (document.getElementById('create-transfer-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createTransfer.isPending])

  const tiers = tiersData?.items ?? []
  const contacts = contactsData?.items ?? []

  return (
    <DynamicPanelShell
      title={t('conformite.transfers.create')}
      subtitle={t('conformite.transfers.create_subtitle')}
      icon={<GitBranch size={14} className="text-blue-500" />}
      actionItems={actionItems}
    >
      <form id="create-transfer-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SmartFormToolbar />
          <SmartFormSimpleHint />
          <SmartFormInlineHelpDrawer />

          <SmartFormSection
            id="select_tier"
            title={t('conformite.transfers.select_tier')}
            level="essential"
            help={{ description: t('conformite.transfers.select_tier_help') }}
          >
            <DynamicPanelField label={t('conformite.transfers.source_company')} required>
              <select
                required
                value={selectedContactTierId}
                onChange={(e) => {
                  setSelectedContactTierId(e.target.value)
                  setForm({ ...form, contact_id: '', from_tier_id: e.target.value })
                }}
                className={panelInputClass}
              >
                <option value="">-- {t('common.select')} --</option>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} ({tier.code})
                  </option>
                ))}
              </select>
            </DynamicPanelField>
          </SmartFormSection>

          <SmartFormSection
            id="select_employee"
            title={t('conformite.transfers.select_employee')}
            level="essential"
            help={{ description: t('conformite.transfers.select_employee_help') }}
          >
            <DynamicPanelField label={t('conformite.columns.employee')} required>
              <select
                required
                value={form.contact_id}
                onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                className={panelInputClass}
                disabled={!selectedContactTierId}
              >
                <option value="">-- {t('common.select')} --</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name} {contact.email ? `(${contact.email})` : ''}
                  </option>
                ))}
              </select>
            </DynamicPanelField>
          </SmartFormSection>

          <SmartFormSection
            id="destination"
            title={t('conformite.transfers.destination')}
            level="essential"
            help={{ description: t('conformite.transfers.destination_help') }}
          >
            <DynamicPanelField label={t('conformite.columns.to')} required>
              <select
                required
                value={form.to_tier_id}
                onChange={(e) => setForm({ ...form, to_tier_id: e.target.value })}
                className={panelInputClass}
              >
                <option value="">-- {t('common.select')} --</option>
                {tiers
                  .filter((tier) => tier.id !== form.from_tier_id)
                  .map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name} ({tier.code})
                    </option>
                  ))}
              </select>
            </DynamicPanelField>
          </SmartFormSection>

          <SmartFormSection
            id="details"
            title={t('conformite.transfers.details')}
            level="essential"
            help={{ description: t('conformite.transfers.details_help') }}
          >
            <DynamicPanelField label={t('conformite.columns.date')} required>
              <input
                type="date"
                required
                value={form.transfer_date}
                onChange={(e) => setForm({ ...form, transfer_date: e.target.value })}
                className={panelInputClass}
              />
            </DynamicPanelField>

            <DynamicPanelField label={t('common.reason')}>
              <textarea
                value={form.reason ?? ''}
                onChange={(e) => setForm({ ...form, reason: e.target.value || null })}
                className={`${panelInputClass} min-h-[80px] resize-y`}
                placeholder={t('conformite.transfers.reason_placeholder')}
                rows={3}
              />
            </DynamicPanelField>
          </SmartFormSection>

          {_ctx?.mode === 'wizard' && (
            <SmartFormWizardNav
              onSubmit={() => document.querySelector('form')?.requestSubmit()}
              onCancel={() => {}}
            />
          )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
