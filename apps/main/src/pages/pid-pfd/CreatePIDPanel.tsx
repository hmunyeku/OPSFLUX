/**
 * Create panel for a new PID/PFD document.
 *
 * Extracted from PidPfdPage.tsx to keep the main page reviewable.
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, FilePlus2, Loader2, Trash2, Cpu, Info, Paperclip } from 'lucide-react'
import {
  DynamicPanelShell,
  FormSection,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
  InlineEditableRow,
  InlineEditableTags,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { usePermission } from '@/hooks/usePermission'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import {
  useCreatePIDDocument, useCreateEquipment, useUpdateEquipment,
  useEquipmentDetail, useEquipment, usePIDDocuments, useCreateProcessLine,
  useCreateDCSTag, useDeleteEquipment,
} from '@/hooks/usePidPfd'
import { TagManager } from '@/components/shared/TagManager'
// Constants used by this file — duplicated from PidPfdPage to keep
// this file free of circular imports.
const PID_TYPE_LABELS: Record<string, string> = {
  PID: 'P&ID', PFD: 'PFD', BFD: 'BFD', UFD: 'UFD', PIAD: 'PIAD',
  Isometric: 'Isométrique', SLD: 'SLD', Layout: 'Layout',
}
const EQUIPMENT_TYPE_OPTIONS = [
  { value: 'vessel', label: 'Vessel' }, { value: 'pump', label: 'Pump' },
  { value: 'compressor', label: 'Compressor' }, { value: 'heat_exchanger', label: 'Heat Exchanger' },
  { value: 'tank', label: 'Tank' }, { value: 'valve', label: 'Valve' },
  { value: 'instrument', label: 'Instrument' }, { value: 'other', label: 'Other' },
]
const FLUID_PHASE_OPTIONS = [
  { value: 'liquid', label: 'Liquide' }, { value: 'gas', label: 'Gaz' },
  { value: 'multiphase', label: 'Multiphasique' }, { value: 'solid', label: 'Solide' },
]
const INSULATION_TYPE_OPTIONS = [
  { value: 'none', label: 'Aucune' }, { value: 'hot', label: 'Chaud' },
  { value: 'cold', label: 'Froid' }, { value: 'acoustic', label: 'Acoustique' },
  { value: 'personnel', label: 'Personnel' },
]
const TAG_TYPE_OPTIONS = [
  { value: 'AI', label: 'AI (Analog Input)' }, { value: 'AO', label: 'AO (Analog Output)' },
  { value: 'DI', label: 'DI (Digital Input)' }, { value: 'DO', label: 'DO (Digital Output)' },
  { value: 'FI', label: 'FI' }, { value: 'FY', label: 'FY' },
]


// -- Create PID Panel ---------------------------------------------------------

export function CreatePIDPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createPID = useCreatePIDDocument()
  const [form, setForm] = useState({ title: '', pid_type: 'pid', sheet_format: 'A1', scale: '1:50', drawing_number: '' })

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) {
      toast({ title: t('pidpfd.toast.error'), description: t('pidpfd.toast.title_required'), variant: 'error' })
      return
    }
    try {
      await createPID.mutateAsync(form)
      toast({ title: t('pidpfd.toast.success'), description: t('pidpfd.toast.pid_created') })
      closeDynamicPanel()
    } catch {
      toast({ title: t('pidpfd.toast.error'), description: t('pidpfd.toast.pid_create_error'), variant: 'error' })
    }
  }, [form, createPID, toast, closeDynamicPanel])

  return (
    <DynamicPanelShell title="Nouveau PID" icon={<FilePlus2 size={14} />} onClose={closeDynamicPanel}>
      <PanelContentLayout>
        <FormSection title={t('common.information')}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Titre *</label>
              <input className="gl-form-input text-sm w-full" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Titre du document PID" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select className="gl-form-select text-sm w-full" value={form.pid_type} onChange={(e) => setForm((f) => ({ ...f, pid_type: e.target.value }))}>
                {Object.entries(PID_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Format feuille</label>
              <select className="gl-form-select text-sm w-full" value={form.sheet_format} onChange={(e) => setForm((f) => ({ ...f, sheet_format: e.target.value }))}>
                <option value="A0">A0</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="A3">A3</option>
                <option value="A4">A4</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Échelle</label>
              <input className="gl-form-input text-sm w-full" value={form.scale} onChange={(e) => setForm((f) => ({ ...f, scale: e.target.value }))} placeholder="1:50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Numéro de dessin</label>
              <input className="gl-form-input text-sm w-full" value={form.drawing_number} onChange={(e) => setForm((f) => ({ ...f, drawing_number: e.target.value }))} placeholder="DWG-001" />
            </div>
          </div>
        </FormSection>
        <div className="p-3 border-t border-border">
          <button className="gl-button gl-button-confirm w-full" onClick={handleSubmit} disabled={createPID.isPending}>
            {createPID.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : <FilePlus2 size={12} className="mr-2" />}
            Créer le PID
          </button>
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Equipment Create Panel ----------------------------------------------------

export function CreateEquipmentPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createEquipment = useCreateEquipment()
  const { data: docsData } = usePIDDocuments({ page: 1, page_size: 200 })
  const [form, setForm] = useState({
    tag: '',
    equipment_type: 'vessel',
    description: '',
    pid_document_id: '',
    project_id: '',
    design_pressure_barg: '',
    design_temperature_c: '',
    material_of_construction: '',
    fluid: '',
    fluid_phase: '',
  })

  const handleSubmit = useCallback(async () => {
    if (!form.tag.trim()) {
      toast({ title: t('pidpfd.toast.error'), description: t('pidpfd.toast.tag_required'), variant: 'error' })
      return
    }
    const payload: Record<string, unknown> = {
      tag: form.tag.trim(),
      equipment_type: form.equipment_type,
    }
    if (form.description) payload.description = form.description
    if (form.pid_document_id) payload.pid_document_id = form.pid_document_id
    if (form.project_id) payload.project_id = form.project_id
    if (form.design_pressure_barg) payload.design_pressure_barg = Number(form.design_pressure_barg)
    if (form.design_temperature_c) payload.design_temperature_c = Number(form.design_temperature_c)
    if (form.material_of_construction) payload.material_of_construction = form.material_of_construction
    if (form.fluid) payload.fluid = form.fluid
    if (form.fluid_phase) payload.fluid_phase = form.fluid_phase
    try {
      await createEquipment.mutateAsync(payload)
      toast({ title: t('pidpfd.toast.equipment_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('pidpfd.toast.equipment_create_error'), variant: 'error' })
    }
  }, [form, createEquipment, toast, closeDynamicPanel, t])

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  return (
    <DynamicPanelShell title="Nouvel équipement" icon={<Plus size={14} className="text-primary" />} onClose={closeDynamicPanel}>
      <PanelContentLayout>
        <FormSection title={t('common.identification')}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tag *</label>
              <input className="gl-form-input text-sm w-full font-mono" value={form.tag} onChange={(e) => set('tag', e.target.value)} placeholder="V-1001" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type d'équipement</label>
              <select className="gl-form-select text-sm w-full" value={form.equipment_type} onChange={(e) => set('equipment_type', e.target.value)}>
                {EQUIPMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <input className="gl-form-input text-sm w-full" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description de l'équipement" />
            </div>
          </div>
        </FormSection>

        <FormSection title={t('common.associations')}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Document PID</label>
              <select className="gl-form-select text-sm w-full" value={form.pid_document_id} onChange={(e) => set('pid_document_id', e.target.value)}>
                <option value="">-- Aucun --</option>
                {docsData?.items?.map((d) => <option key={d.id} value={d.id}>{d.number} — {d.title}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection title="Conception" collapsible defaultExpanded={false}>
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Pression design (barg)</label>
                <input type="number" className="gl-form-input text-sm w-full" value={form.design_pressure_barg} onChange={(e) => set('design_pressure_barg', e.target.value)} placeholder="0.0" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Temperature design (C)</label>
                <input type="number" className="gl-form-input text-sm w-full" value={form.design_temperature_c} onChange={(e) => set('design_temperature_c', e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Materiau</label>
              <input className="gl-form-input text-sm w-full" value={form.material_of_construction} onChange={(e) => set('material_of_construction', e.target.value)} placeholder="CS, SS316, etc." />
            </div>
          </div>
        </FormSection>

        <FormSection title={t('common.fluid')} collapsible defaultExpanded={false}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fluide</label>
              <input className="gl-form-input text-sm w-full" value={form.fluid} onChange={(e) => set('fluid', e.target.value)} placeholder="Petrole brut, gaz, etc." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phase</label>
              <select className="gl-form-select text-sm w-full" value={form.fluid_phase} onChange={(e) => set('fluid_phase', e.target.value)}>
                <option value="">-- Non specifie --</option>
                {FLUID_PHASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <div className="p-3 border-t border-border">
          <button className="gl-button gl-button-confirm w-full" onClick={handleSubmit} disabled={createEquipment.isPending}>
            {createEquipment.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : <Plus size={12} className="mr-2" />}
            Créer l'équipement
          </button>
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Equipment Detail Panel ---------------------------------------------------

export function EquipmentDetailPanel({ id }: { id: string }) {
  const { hasPermission } = usePermission()
  const canDeleteEquip = hasPermission('pid.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: equip, isLoading } = useEquipmentDetail(id)
  const updateEquipment = useUpdateEquipment()
  const deleteEquipment = useDeleteEquipment()

  const [detailTab, setDetailTab] = useState<'fiche' | 'documents'>('fiche')

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateEquipment.mutate({ id, payload: { [field]: value } })
  }, [id, updateEquipment])

  const handleDelete = useCallback(async () => {
    try {
      await deleteEquipment.mutateAsync(id)
      toast({ title: t('pidpfd.toast.equipment_deleted'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('pidpfd.toast.equipment_delete_error'), variant: 'error' })
    }
  }, [id, deleteEquipment, toast, closeDynamicPanel])

  const confirmEquip = useConfirm()

  const equipActionItems = useMemo<ActionItem[]>(() => {
    if (!canDeleteEquip) return []
    return [
      {
        id: 'delete',
        label: 'Supprimer',
        icon: Trash2,
        variant: 'danger',
        priority: 70,
        confirm: {
          title: 'Supprimer ?',
          message: '',
          confirmLabel: 'Supprimer ?',
          variant: 'danger',
        },
        onClick: handleDelete,
      },
    ]
  }, [canDeleteEquip, handleDelete])

  if (isLoading || !equip) {
    return (
      <DynamicPanelShell title={t('common.loading_ellipsis')} icon={<Cpu size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={equip.tag}
      subtitle={equip.description || undefined}
      icon={<Cpu size={14} className="text-primary" />}
      actionItems={equipActionItems}
      onActionConfirm={confirmEquip}
    >
      <TabBar
        items={[
          { id: 'fiche', label: 'Informations', icon: Info },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as 'fiche' | 'documents')}
        variant="muted"
        className="px-3 pt-2"
      />
      {detailTab === 'fiche' && (
      <PanelContentLayout>
        {/* -- Identification -- */}
        <FormSection title={t('common.identification')} collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label={t('common.tag_field')} value={<span className="font-mono font-medium text-foreground">{equip.tag}</span>} />
            <InlineEditableRow label="Description" value={equip.description || ''} onSave={(v) => handleInlineSave('description', v)} />
            <InlineEditableTags
              label="Type"
              value={equip.equipment_type}
              options={EQUIPMENT_TYPE_OPTIONS}
              onSave={(v) => handleInlineSave('equipment_type', v)}
            />
            <InlineEditableRow label="Service" value={equip.service || ''} onSave={(v) => handleInlineSave('service', v)} />
          </DetailFieldGrid>
        </FormSection>

        {/* -- Design Conditions -- */}
        <FormSection title="Conditions de conception" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow
              label="Pression design"
              value={equip.design_pressure_barg != null ? `${equip.design_pressure_barg} barg` : '--'}
            />
            <ReadOnlyRow
              label="Temperature design"
              value={equip.design_temperature_c != null ? `${equip.design_temperature_c} °C` : '--'}
            />
            <ReadOnlyRow
              label="Pression service"
              value={equip.operating_pressure_barg != null ? `${equip.operating_pressure_barg} barg` : '--'}
            />
            <ReadOnlyRow
              label="Temperature service"
              value={equip.operating_temperature_c != null ? `${equip.operating_temperature_c} °C` : '--'}
            />
            <InlineEditableRow label="Materiau" value={equip.material_of_construction || ''} onSave={(v) => handleInlineSave('material_of_construction', v)} />
          </DetailFieldGrid>
        </FormSection>

        {/* -- Fluid -- */}
        <FormSection title={t('common.fluid')} collapsible defaultExpanded={false}>
          <DetailFieldGrid>
            <ReadOnlyRow label="Fluide" value={equip.fluid || '--'} />
            <ReadOnlyRow
              label="Phase"
              value={
                equip.fluid_phase
                  ? <span className="gl-badge gl-badge-neutral">{FLUID_PHASE_OPTIONS.find((o) => o.value === equip.fluid_phase)?.label || equip.fluid_phase}</span>
                  : '--'
              }
            />
            {equip.capacity_value != null && (
              <ReadOnlyRow label="Capacite" value={`${equip.capacity_value} ${equip.capacity_unit || ''}`} />
            )}
          </DetailFieldGrid>
        </FormSection>

        {/* -- Associations -- */}
        <FormSection title={t('common.associations')} collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="PID" value={equip.pid_number ? <span className="font-mono text-xs">{equip.pid_number}</span> : '--'} />
            <ReadOnlyRow label={t('common.project')} value={equip.project_name || '--'} />
            <ReadOnlyRow label="Asset" value={equip.asset_name || '--'} />
            <ReadOnlyRow label="Tags DCS" value={<span className="tabular-nums">{equip.dcs_tag_count}</span>} />
          </DetailFieldGrid>
        </FormSection>

        {/* -- Tags & Notes -- */}
        <FormSection title={t('common.tags_notes')} collapsible defaultExpanded={false}>
          <div className="space-y-3">
            <TagManager ownerType="equipment" ownerId={id} compact />
            <NoteManager ownerType="equipment" ownerId={id} compact />
          </div>
        </FormSection>
      </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
      <PanelContentLayout>
        <FormSection title={t('common.attached_files')} collapsible defaultExpanded>
          <AttachmentManager ownerType="equipment" ownerId={id} compact />
        </FormSection>
      </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}

// -- Process Line Create Panel ------------------------------------------------

export function CreateProcessLinePanel() {
  const { closeDynamicPanel } = useUIStore()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createLine = useCreateProcessLine()
  const { data: docsData } = usePIDDocuments({ page: 1, page_size: 200 })
  const [form, setForm] = useState({
    line_number: '',
    pid_document_id: '',
    nominal_diameter_inch: '',
    nominal_diameter_mm: '',
    pipe_schedule: '',
    spec_class: '',
    fluid: '',
    insulation_type: 'none',
    material_of_construction: '',
  })

  const handleSubmit = useCallback(async () => {
    if (!form.line_number.trim()) {
      toast({ title: t('pidpfd.toast.error'), description: t('pidpfd.toast.line_number_required'), variant: 'error' })
      return
    }
    const payload: Record<string, unknown> = {
      line_number: form.line_number.trim(),
    }
    if (form.pid_document_id) payload.pid_document_id = form.pid_document_id
    if (form.nominal_diameter_inch) payload.nominal_diameter_inch = Number(form.nominal_diameter_inch)
    if (form.nominal_diameter_mm) payload.nominal_diameter_mm = Number(form.nominal_diameter_mm)
    if (form.pipe_schedule) payload.pipe_schedule = form.pipe_schedule
    if (form.spec_class) payload.spec_class = form.spec_class
    if (form.fluid) payload.fluid = form.fluid
    if (form.insulation_type !== 'none') payload.insulation_type = form.insulation_type
    if (form.material_of_construction) payload.material_of_construction = form.material_of_construction
    try {
      await createLine.mutateAsync(payload)
      toast({ title: t('pidpfd.toast.process_line_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('pidpfd.toast.process_line_create_error'), variant: 'error' })
    }
  }, [form, createLine, toast, closeDynamicPanel, t])

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  return (
    <DynamicPanelShell title="Nouvelle ligne process" icon={<Plus size={14} className="text-primary" />} onClose={closeDynamicPanel}>
      <PanelContentLayout>
        <FormSection title={t('common.identification')}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Numéro de ligne *</label>
              <input className="gl-form-input text-sm w-full font-mono" value={form.line_number} onChange={(e) => set('line_number', e.target.value)} placeholder="6&quot;-HC-1001-A1A-HI" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Document PID</label>
              <select className="gl-form-select text-sm w-full" value={form.pid_document_id} onChange={(e) => set('pid_document_id', e.target.value)}>
                <option value="">-- Aucun --</option>
                {docsData?.items?.map((d) => <option key={d.id} value={d.id}>{d.number} — {d.title}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('common.dimensions')}>
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Diametre (pouces)</label>
                <input type="number" className="gl-form-input text-sm w-full" value={form.nominal_diameter_inch} onChange={(e) => set('nominal_diameter_inch', e.target.value)} placeholder='6"' />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Diametre (mm)</label>
                <input type="number" className="gl-form-input text-sm w-full" value={form.nominal_diameter_mm} onChange={(e) => set('nominal_diameter_mm', e.target.value)} placeholder="150" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Schedule</label>
              <input className="gl-form-input text-sm w-full" value={form.pipe_schedule} onChange={(e) => set('pipe_schedule', e.target.value)} placeholder="40, 80, STD..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Classe de spec</label>
              <input className="gl-form-input text-sm w-full" value={form.spec_class} onChange={(e) => set('spec_class', e.target.value)} placeholder="A1A, B2B..." />
            </div>
          </div>
        </FormSection>

        <FormSection title="Fluide & Isolation">
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fluide</label>
              <input className="gl-form-input text-sm w-full" value={form.fluid} onChange={(e) => set('fluid', e.target.value)} placeholder="HC, CW, N2..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type d'isolation</label>
              <select className="gl-form-select text-sm w-full" value={form.insulation_type} onChange={(e) => set('insulation_type', e.target.value)}>
                {INSULATION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Materiau de construction</label>
              <input className="gl-form-input text-sm w-full" value={form.material_of_construction} onChange={(e) => set('material_of_construction', e.target.value)} placeholder="CS, SS316L..." />
            </div>
          </div>
        </FormSection>

        <div className="p-3 border-t border-border">
          <button className="gl-button gl-button-confirm w-full" onClick={handleSubmit} disabled={createLine.isPending}>
            {createLine.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : <Plus size={12} className="mr-2" />}
            Créer la ligne
          </button>
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- DCS Tag Create Panel -----------------------------------------------------

export function CreateDCSTagPanel() {
  const { closeDynamicPanel } = useUIStore()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createTag = useCreateDCSTag()
  const { data: equipData } = useEquipment({ page: 1, page_size: 500 })
  const [form, setForm] = useState({
    tag_name: '',
    tag_type: 'PI',
    description: '',
    equipment_id: '',
    engineering_unit: '',
    range_min: '',
    range_max: '',
  })

  const handleSubmit = useCallback(async () => {
    if (!form.tag_name.trim()) {
      toast({ title: t('pidpfd.toast.error'), description: t('pidpfd.toast.tag_name_required'), variant: 'error' })
      return
    }
    const payload: Record<string, unknown> = {
      tag_name: form.tag_name.trim(),
      tag_type: form.tag_type,
    }
    if (form.description) payload.description = form.description
    if (form.equipment_id) payload.equipment_id = form.equipment_id
    if (form.engineering_unit) payload.engineering_unit = form.engineering_unit
    if (form.range_min) payload.range_min = Number(form.range_min)
    if (form.range_max) payload.range_max = Number(form.range_max)
    try {
      await createTag.mutateAsync(payload)
      toast({ title: t('pidpfd.toast.dcs_tag_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('pidpfd.toast.dcs_tag_create_error'), variant: 'error' })
    }
  }, [form, createTag, toast, closeDynamicPanel, t])

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  return (
    <DynamicPanelShell title="Nouveau tag DCS" icon={<Plus size={14} className="text-primary" />} onClose={closeDynamicPanel}>
      <PanelContentLayout>
        <FormSection title={t('common.identification')}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nom du tag *</label>
              <input className="gl-form-input text-sm w-full font-mono" value={form.tag_name} onChange={(e) => set('tag_name', e.target.value)} placeholder="PI-1001" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type ISA</label>
              <select className="gl-form-select text-sm w-full" value={form.tag_type} onChange={(e) => set('tag_type', e.target.value)}>
                {TAG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <input className="gl-form-input text-sm w-full" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description du tag" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Association équipement">
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Equipement</label>
              <select className="gl-form-select text-sm w-full" value={form.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}>
                <option value="">-- Aucun --</option>
                {equipData?.items?.map((eq) => <option key={eq.id} value={eq.id}>{eq.tag} — {eq.description || eq.equipment_type}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('common.measurement')} collapsible defaultExpanded={false}>
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unité d'ingénierie</label>
              <input className="gl-form-input text-sm w-full" value={form.engineering_unit} onChange={(e) => set('engineering_unit', e.target.value)} placeholder="barg, °C, m3/h..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Range min</label>
                <input type="number" className="gl-form-input text-sm w-full" value={form.range_min} onChange={(e) => set('range_min', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Range max</label>
                <input type="number" className="gl-form-input text-sm w-full" value={form.range_max} onChange={(e) => set('range_max', e.target.value)} placeholder="100" />
              </div>
            </div>
          </div>
        </FormSection>

        <div className="p-3 border-t border-border">
          <button className="gl-button gl-button-confirm w-full" onClick={handleSubmit} disabled={createTag.isPending}>
            {createTag.isPending ? <Loader2 size={12} className="animate-spin mr-2" /> : <Plus size={12} className="mr-2" />}
            Créer le tag DCS
          </button>
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
