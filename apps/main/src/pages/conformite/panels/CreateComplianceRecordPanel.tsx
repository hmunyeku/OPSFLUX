import { useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCheck, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DynamicPanelShell, DynamicPanelField, FormGrid, TagSelector, panelInputClass, PanelContentLayout } from '@/components/layout/DynamicPanel'
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
import { useComplianceTypes, useCreateComplianceRecord } from '@/hooks/useConformite'
import { attachmentsService } from '@/services/settingsService'
import type { ComplianceRecordCreate } from '@/types/api'
import { useConformiteDictionaryState } from '../shared'
import { SearchableSelect } from '../components'

export function CreateComplianceRecordPanel() {
  return (
    <SmartFormProvider panelId="create-compliance-record" defaultMode="simple">
      <CreateComplianceRecordInner />
    </SmartFormProvider>
  )
}

function CreateComplianceRecordInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const createRecord = useCreateComplianceRecord()
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page: 1, page_size: 200 })
  const { statusOptions } = useConformiteDictionaryState()

  const prefillOwnerType = (dynamicPanel?.meta?.prefill_owner_type as string | undefined) ?? ''
  const prefillOwnerId = (dynamicPanel?.meta?.prefill_owner_id as string | undefined) ?? ''
  const prefillOwnerLabel = (dynamicPanel?.meta?.prefill_owner_label as string | undefined) ?? ''

  const [form, setForm] = useState<ComplianceRecordCreate>({
    compliance_type_id: '',
    owner_type: prefillOwnerType,
    owner_id: prefillOwnerId,
    status: 'pending',
    issued_at: null,
    expires_at: null,
    issuer: null,
    reference_number: null,
    notes: null,
  })
  // Attachment is required at creation — the verification rule enforces
  // 'no PJ = no validation', so we block the form before the backend can
  // reject it. Keeps the workflow linear (no orphan draft records).
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const typeOptions = useMemo(
    () =>
      (typesData?.items ?? []).map((ct) => ({
        value: ct.id,
        label: `${ct.code} — ${ct.name}`,
        group: ct.category,
      })),
    [typesData?.items],
  )

  const ownerTypeOptions = useMemo(
    () => [
      { value: 'user', label: t('conformite.records.owner_types.user') },
      { value: 'tier_contact', label: t('conformite.records.owner_types.tier_contact') },
      { value: 'asset', label: t('conformite.records.owner_types.asset') },
      { value: 'job_position', label: t('conformite.records.owner_types.job_position') },
    ],
    [t],
  )

  const handleCreate = async () => {
    if (!form.compliance_type_id || !form.owner_type || !form.owner_id) {
      toast({ title: t('conformite.records.errors.missing_required'), variant: 'error' })
      return
    }
    if (!file) {
      toast({
        title: t('conformite.records.errors.attachment_required'),
        description: t('conformite.verifications.proof_required_before_verify'),
        variant: 'error',
      })
      return
    }
    try {
      const created = await createRecord.mutateAsync(form)
      // Upload the attachment right after creation so the record never sits
      // in 'pending without PJ' state (which the verify endpoint rejects 422).
      setUploading(true)
      try {
        await attachmentsService.upload('compliance_record', created.id, file)
      } catch (uploadErr) {
        const typed = uploadErr as { response?: { data?: { detail?: string } } }
        toast({
          title: t('conformite.records.errors.attachment_upload_failed'),
          description: typed?.response?.data?.detail || undefined,
          variant: 'warning',
        })
      } finally {
        setUploading(false)
      }
      toast({ title: t('conformite.records.create_success'), variant: 'success' })
      openDynamicPanel({ type: 'detail', module: 'conformite', id: created.id, meta: { subtype: 'record' } })
    } catch (err) {
      const typed = err as { response?: { data?: { detail?: string } } }
      toast({
        title: t('common.error'),
        description: typed?.response?.data?.detail || undefined,
        variant: 'error',
      })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createRecord.isPending || uploading,
      disabled: createRecord.isPending || uploading || !file,
      tooltip: !file ? t('conformite.records.errors.attachment_required') : undefined,
      onClick: handleCreate,
    },
  ], [t, closeDynamicPanel, createRecord.isPending, uploading, file, handleCreate])

  return (
    <DynamicPanelShell
      title={t('conformite.records.create')}
      subtitle={t('conformite.title')}
      icon={<FileCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <PanelContentLayout>
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="t_conformite_records_sections_general" title={t('conformite.records.sections.general')} level="essential" help={{ description: t('conformite.records.sections.general') }}>
          <FormGrid>
            <DynamicPanelField label={t('conformite.records.fields.type')} required span="full">
              <SearchableSelect
                value={form.compliance_type_id}
                onChange={(value) => setForm({ ...form, compliance_type_id: value })}
                options={typeOptions}
                placeholder={t('conformite.records.placeholders.type')}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.owner_type')} required>
              <TagSelector
                options={ownerTypeOptions}
                value={form.owner_type}
                onChange={(value) => setForm({ ...form, owner_type: value })}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.status')}>
              <TagSelector
                options={statusOptions}
                value={form.status || 'pending'}
                onChange={(value) => setForm({ ...form, status: value })}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.owner_id')} required span="full">
              <input
                type="text"
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                className={panelInputClass}
                placeholder={t('conformite.records.placeholders.owner_id')}
              />
              {prefillOwnerLabel && (
                <p className="mt-1 text-[10px] text-muted-foreground">{prefillOwnerLabel}</p>
              )}
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_conformite_records_sections_reference" title={t('conformite.records.sections.reference')} level="essential" help={{ description: t('conformite.records.sections.reference') }}>
          <FormGrid>
            <DynamicPanelField label={t('conformite.records.fields.issued_at')}>
              <input type="date" value={form.issued_at ?? ''} onChange={(e) => setForm({ ...form, issued_at: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.expires_at')}>
              <input type="date" value={form.expires_at ?? ''} onChange={(e) => setForm({ ...form, expires_at: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.issuer')}>
              <input type="text" value={form.issuer ?? ''} onChange={(e) => setForm({ ...form, issuer: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.reference_number')}>
              <input type="text" value={form.reference_number ?? ''} onChange={(e) => setForm({ ...form, reference_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.notes')} span="full">
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                placeholder={t('conformite.records.placeholders.notes')}
              />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_conformite_records_sections_attachment" title={t('conformite.records.sections.attachments')} level="essential" help={{ description: t('conformite.records.sections.attachments') }}>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('conformite.records.attachment_required_hint')}
          </p>
          {file ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background-subtle px-3 py-2">
              <Paperclip size={14} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{file.name}</div>
                <div className="text-[10px] text-muted-foreground">{Math.round(file.size / 1024)} Ko</div>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="gl-button-sm gl-button-default !h-7 !w-7 !p-0 shrink-0"
                aria-label={t('common.remove')}
                disabled={uploading}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 cursor-pointer hover:bg-background-subtle">
              <Paperclip size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">{t('conformite.records.attachment_upload_cta')}</span>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }}
              />
            </label>
          )}
        </SmartFormSection>
      {_ctx?.mode === 'wizard' && (

        <SmartFormWizardNav

          onSubmit={() => document.querySelector('form')?.requestSubmit()}

          onCancel={() => {}}

        />

      )}

      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
