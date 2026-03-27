/**
 * Equipment Sub-Model Managers — CRUD list managers for equipment-class-specific
 * child records (crane configs, hook blocks, nozzles, pump curves, etc.).
 *
 * Each manager wraps the generic SubModelManager with typed fields and hooks.
 * Rendered conditionally inside EquipmentDetailPanel based on equipment_class.
 */
import {
  Settings2,
  Anchor,
  Cable,
  Circle,
  FlaskConical,
  TrendingUp,
  Layers,
  BarChart3,
  Radar,
} from 'lucide-react'
import { SubModelManager, type FieldDef } from '@/components/shared/SubModelManager'
import {
  useCraneConfigurations,
  useCreateCraneConfiguration,
  useUpdateCraneConfiguration,
  useDeleteCraneConfiguration,
  useCraneLoadChartPoints,
  useCreateCraneLoadChartPoint,
  useUpdateCraneLoadChartPoint,
  useDeleteCraneLoadChartPoint,
  useCraneLiftZones,
  useCreateCraneLiftZone,
  useUpdateCraneLiftZone,
  useDeleteCraneLiftZone,
  useCraneHookBlocks,
  useCreateCraneHookBlock,
  useUpdateCraneHookBlock,
  useDeleteCraneHookBlock,
  useCraneReevingGuide,
  useCreateCraneReevingGuide,
  useUpdateCraneReevingGuide,
  useDeleteCraneReevingGuide,
  useSeparatorNozzles,
  useCreateSeparatorNozzle,
  useUpdateSeparatorNozzle,
  useDeleteSeparatorNozzle,
  useSeparatorProcessCases,
  useCreateSeparatorProcessCase,
  useUpdateSeparatorProcessCase,
  useDeleteSeparatorProcessCase,
  usePumpCurvePoints,
  useCreatePumpCurvePoint,
  useUpdatePumpCurvePoint,
  useDeletePumpCurvePoint,
  useColumnSections,
  useCreateColumnSection,
  useUpdateColumnSection,
  useDeleteColumnSection,
} from '@/hooks/useAssetRegistry'
import type {
  CraneConfiguration,
  CraneConfigurationCreate,
  CraneConfigurationUpdate,
  CraneLoadChartPoint,
  CraneLoadChartPointCreate,
  CraneLoadChartPointUpdate,
  CraneLiftZone,
  CraneLiftZoneCreate,
  CraneLiftZoneUpdate,
  CraneHookBlock,
  CraneHookBlockCreate,
  CraneHookBlockUpdate,
  CraneReevingGuideEntry,
  CraneReevingGuideCreate,
  CraneReevingGuideUpdate,
  SeparatorNozzle,
  SeparatorNozzleCreate,
  SeparatorNozzleUpdate,
  SeparatorProcessCase,
  SeparatorProcessCaseCreate,
  SeparatorProcessCaseUpdate,
  PumpCurvePoint,
  PumpCurvePointCreate,
  PumpCurvePointUpdate,
  ColumnSection,
  ColumnSectionCreate,
  ColumnSectionUpdate,
} from '@/types/assetRegistry'

// ── Helpers ─────────────────────────────────────────────────────
const fmtNum = (v: unknown, unit?: string) => {
  if (v == null || v === '') return '—'
  return unit ? `${v} ${unit}` : String(v)
}

const fmtBool = (v: unknown) => (v === true || v === 'true') ? 'Oui' : (v === false || v === 'false') ? 'Non' : '—'

// ════════════════════════════════════════════════════════════════
// CRANE — Configurations
// ════════════════════════════════════════════════════════════════

export function CraneConfigurationManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useCraneConfigurations(equipmentId)
  const create = useCreateCraneConfiguration()
  const update = useUpdateCraneConfiguration()
  const del = useDeleteCraneConfiguration()

  const FIELDS: FieldDef<CraneConfigurationCreate>[] = [
    { key: 'config_code', label: 'Code config', required: true, placeholder: 'CFG-01' },
    { key: 'config_name', label: 'Nom', placeholder: 'Main boom 40m' },
    { key: 'boom_length_m', label: 'Flèche (m)', placeholder: '40' },
    { key: 'jib_length_m', label: 'Fléchette (m)', placeholder: '12' },
    { key: 'jib_offset_deg', label: 'Offset fléchette (°)', placeholder: '5' },
    { key: 'counterweight_tonnes', label: 'Contrepoids (t)', placeholder: '20' },
    { key: 'config_max_capacity_tonnes', label: 'Capacité max (t)', placeholder: '50' },
    { key: 'config_max_radius_m', label: 'Rayon max (m)', placeholder: '35' },
    { key: 'notes', label: 'Notes' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'config_code' as const, label: 'Code' },
    { key: 'config_name' as const, label: 'Nom' },
    { key: 'boom_length_m' as const, label: 'Flèche', format: (v: unknown) => fmtNum(v, 'm') },
    { key: 'config_max_capacity_tonnes' as const, label: 'Cap. max', format: (v: unknown) => fmtNum(v, 't') },
  ]

  return (
    <SubModelManager<CraneConfiguration, CraneConfigurationCreate>
      items={items as CraneConfiguration[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune configuration"
      emptyIcon={Settings2}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as CraneConfigurationUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// CRANE — Hook Blocks
// ════════════════════════════════════════════════════════════════

export function CraneHookBlockManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useCraneHookBlocks(equipmentId)
  const create = useCreateCraneHookBlock()
  const update = useUpdateCraneHookBlock()
  const del = useDeleteCraneHookBlock()

  const FIELDS: FieldDef<CraneHookBlockCreate>[] = [
    { key: 'block_reference', label: 'Référence', placeholder: 'HB-001' },
    { key: 'block_tag', label: 'Tag', placeholder: 'HOOK-A' },
    { key: 'rated_capacity_tonnes', label: 'Capacité (t)', required: true, placeholder: '25' },
    { key: 'sheave_count', label: 'Nb réas', placeholder: '4' },
    { key: 'block_weight_kg', label: 'Poids bloc (kg)', placeholder: '1200' },
    { key: 'hook_weight_kg', label: 'Poids crochet (kg)', placeholder: '150' },
    { key: 'rope_diameter_mm', label: 'Diamètre câble (mm)', placeholder: '28' },
    { key: 'certificate_number', label: 'N° certificat', placeholder: 'CERT-2024-001' },
    { key: 'swivel_type', label: 'Type émerillon', placeholder: 'Ball bearing' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'block_reference' as const, label: 'Référence' },
    { key: 'rated_capacity_tonnes' as const, label: 'Capacité', format: (v: unknown) => fmtNum(v, 't') },
    { key: 'sheave_count' as const, label: 'Réas' },
    { key: 'is_main_hook' as const, label: 'Principal', format: (v: unknown) => fmtBool(v) },
  ]

  return (
    <SubModelManager<CraneHookBlock, CraneHookBlockCreate>
      items={items as CraneHookBlock[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun moufle"
      emptyIcon={Anchor}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as CraneHookBlockUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// CRANE — Reeving Guide
// ════════════════════════════════════════════════════════════════

export function CraneReevingGuideManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useCraneReevingGuide(equipmentId)
  const create = useCreateCraneReevingGuide()
  const update = useUpdateCraneReevingGuide()
  const del = useDeleteCraneReevingGuide()

  const FIELDS: FieldDef<CraneReevingGuideCreate>[] = [
    { key: 'reeving_parts', label: 'Brins', required: true, placeholder: '6' },
    { key: 'load_min_tonnes', label: 'Charge min (t)', required: true, placeholder: '0' },
    { key: 'load_max_tonnes', label: 'Charge max (t)', required: true, placeholder: '25' },
    { key: 'boom_config_ref', label: 'Réf. config flèche', placeholder: 'CFG-01' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'reeving_parts' as const, label: 'Brins', format: (v: unknown) => `${v ?? '—'} brins` },
    { key: 'load_min_tonnes' as const, label: 'Min', format: (v: unknown) => fmtNum(v, 't') },
    { key: 'load_max_tonnes' as const, label: 'Max', format: (v: unknown) => fmtNum(v, 't') },
    { key: 'boom_config_ref' as const, label: 'Config' },
  ]

  return (
    <SubModelManager<CraneReevingGuideEntry, CraneReevingGuideCreate>
      items={items as CraneReevingGuideEntry[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun guide de mouflage"
      emptyIcon={Cable}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as CraneReevingGuideUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// CRANE — Load Chart Points (nested under a specific config)
// ════════════════════════════════════════════════════════════════

const HOOK_TYPE_OPTIONS = [
  { value: 'MAIN_HOOK', label: 'Crochet principal' },
  { value: 'AUX_HOOK', label: 'Crochet auxiliaire' },
  { value: 'WHIP_LINE', label: 'Ligne de fouet' },
]

export function CraneLoadChartPointManager({ equipmentId, configId, canEdit }: { equipmentId: string; configId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useCraneLoadChartPoints(equipmentId, configId)
  const create = useCreateCraneLoadChartPoint()
  const update = useUpdateCraneLoadChartPoint()
  const del = useDeleteCraneLoadChartPoint()

  const FIELDS: FieldDef<CraneLoadChartPointCreate>[] = [
    { key: 'radius_m', label: 'Rayon (m)', required: true, placeholder: '12.0' },
    { key: 'max_load_tonnes', label: 'Charge max (t)', required: true, placeholder: '25.0' },
    { key: 'hook_height_m', label: 'Hauteur crochet (m)', placeholder: '30.0' },
    { key: 'boom_angle_deg', label: 'Angle flèche (°)', placeholder: '75' },
    { key: 'hook_type', label: 'Type crochet', type: 'combobox' as const, options: HOOK_TYPE_OPTIONS },
    { key: 'row_order', label: 'Ordre', placeholder: '1' },
    { key: 'is_derated', label: 'Dératé', placeholder: 'false' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'radius_m' as const, label: 'Rayon', format: (v: unknown) => fmtNum(v, 'm') },
    { key: 'max_load_tonnes' as const, label: 'Charge max', format: (v: unknown) => fmtNum(v, 't') },
    { key: 'hook_height_m' as const, label: 'Hauteur', format: (v: unknown) => fmtNum(v, 'm') },
    { key: 'hook_type' as const, label: 'Type', format: (v: unknown) => HOOK_TYPE_OPTIONS.find(o => o.value === v)?.label ?? String(v ?? '—') },
  ]

  return (
    <SubModelManager<CraneLoadChartPoint, CraneLoadChartPointCreate>
      items={items as CraneLoadChartPoint[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun point de courbe"
      emptyIcon={BarChart3}
      onCreate={(p) => create.mutate({ eqId: equipmentId, configId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, configId, id, payload: p as CraneLoadChartPointUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, configId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// CRANE — Lift Zones (nested under a specific config)
// ════════════════════════════════════════════════════════════════

const ANGLE_REFERENCE_OPTIONS = [
  { value: 'BOW', label: 'Proue (Bow)' },
  { value: 'STERN', label: 'Poupe (Stern)' },
  { value: 'PORT', label: 'Bâbord (Port)' },
  { value: 'STARBOARD', label: 'Tribord (Starboard)' },
  { value: 'NORTH', label: 'Nord' },
]

export function CraneLiftZoneManager({ equipmentId, configId, canEdit }: { equipmentId: string; configId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useCraneLiftZones(equipmentId, configId)
  const create = useCreateCraneLiftZone()
  const update = useUpdateCraneLiftZone()
  const del = useDeleteCraneLiftZone()

  const FIELDS: FieldDef<CraneLiftZoneCreate>[] = [
    { key: 'zone_name', label: 'Nom zone', required: true, placeholder: 'Zone port side' },
    { key: 'angle_start_deg', label: 'Angle début (°)', required: true, placeholder: '0' },
    { key: 'angle_end_deg', label: 'Angle fin (°)', required: true, placeholder: '90' },
    { key: 'angle_reference', label: 'Référence angle', type: 'combobox' as const, options: ANGLE_REFERENCE_OPTIONS },
    { key: 'derating_factor', label: 'Facteur réduction', required: true, placeholder: '1.0' },
    { key: 'derating_reason', label: 'Raison réduction', placeholder: 'Obstruction structurelle' },
    { key: 'max_load_override_tonnes', label: 'Charge max override (t)', placeholder: '20' },
    { key: 'max_radius_override_m', label: 'Rayon max override (m)', placeholder: '25' },
    { key: 'notes', label: 'Notes' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'zone_name' as const, label: 'Zone' },
    { key: 'angle_start_deg' as const, label: 'Début', format: (v: unknown) => fmtNum(v, '°') },
    { key: 'angle_end_deg' as const, label: 'Fin', format: (v: unknown) => fmtNum(v, '°') },
    { key: 'derating_factor' as const, label: 'Facteur', format: (v: unknown) => v != null ? `x${v}` : '—' },
  ]

  return (
    <SubModelManager<CraneLiftZone, CraneLiftZoneCreate>
      items={items as CraneLiftZone[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune zone de levage"
      emptyIcon={Radar}
      onCreate={(p) => create.mutate({ eqId: equipmentId, configId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, configId, id, payload: p as CraneLiftZoneUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, configId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// SEPARATOR — Nozzles
// ════════════════════════════════════════════════════════════════

export function SeparatorNozzleManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useSeparatorNozzles(equipmentId)
  const create = useCreateSeparatorNozzle()
  const update = useUpdateSeparatorNozzle()
  const del = useDeleteSeparatorNozzle()

  const FIELDS: FieldDef<SeparatorNozzleCreate>[] = [
    { key: 'nozzle_mark', label: 'Repère', required: true, placeholder: 'N1' },
    { key: 'nozzle_service', label: 'Service', required: true, placeholder: 'Inlet' },
    { key: 'description', label: 'Description', placeholder: 'Entrée fluide brut' },
    { key: 'nominal_size_in', label: 'Taille (in)', required: true, placeholder: '8' },
    { key: 'schedule', label: 'Schedule', placeholder: '40' },
    { key: 'connection_type', label: 'Type raccord', placeholder: 'Flanged RF' },
    { key: 'flange_rating', label: 'Rating bride', placeholder: '300#' },
    { key: 'nozzle_material', label: 'Matériau', placeholder: 'CS A105' },
    { key: 'connected_to_tag', label: 'Connecté à (tag)', placeholder: 'V-1001' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'nozzle_mark' as const, label: 'Repère' },
    { key: 'nozzle_service' as const, label: 'Service' },
    { key: 'nominal_size_in' as const, label: 'Taille', format: (v: unknown) => fmtNum(v, '"') },
    { key: 'flange_rating' as const, label: 'Rating' },
  ]

  return (
    <SubModelManager<SeparatorNozzle, SeparatorNozzleCreate>
      items={items as SeparatorNozzle[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune piquage"
      emptyIcon={Circle}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as SeparatorNozzleUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// SEPARATOR — Process Cases
// ════════════════════════════════════════════════════════════════

export function SeparatorProcessCaseManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useSeparatorProcessCases(equipmentId)
  const create = useCreateSeparatorProcessCase()
  const update = useUpdateSeparatorProcessCase()
  const del = useDeleteSeparatorProcessCase()

  const FIELDS: FieldDef<SeparatorProcessCaseCreate>[] = [
    { key: 'case_name', label: 'Nom du cas', required: true, placeholder: 'Design case' },
    { key: 'case_description', label: 'Description', placeholder: 'Normal operating conditions' },
    { key: 'inlet_pressure_barg', label: 'P entrée (barg)', placeholder: '45' },
    { key: 'inlet_temp_c', label: 'T entrée (°C)', placeholder: '80' },
    { key: 'inlet_gas_flow_mmscfd', label: 'Gaz (MMscfd)', placeholder: '12' },
    { key: 'inlet_oil_flow_sm3d', label: 'Huile (Sm3/d)', placeholder: '500' },
    { key: 'inlet_water_flow_sm3d', label: 'Eau (Sm3/d)', placeholder: '200' },
    { key: 'op_pressure_barg', label: 'P oper. (barg)', placeholder: '40' },
    { key: 'op_temp_c', label: 'T oper. (°C)', placeholder: '75' },
    { key: 'simulation_tool', label: 'Outil simulation', placeholder: 'HYSYS' },
    { key: 'simulation_case_ref', label: 'Réf. simulation', placeholder: 'SIM-001' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'case_name' as const, label: 'Cas' },
    { key: 'inlet_pressure_barg' as const, label: 'P entrée', format: (v: unknown) => fmtNum(v, 'barg') },
    { key: 'inlet_temp_c' as const, label: 'T entrée', format: (v: unknown) => fmtNum(v, '°C') },
    { key: 'op_pressure_barg' as const, label: 'P oper.', format: (v: unknown) => fmtNum(v, 'barg') },
  ]

  return (
    <SubModelManager<SeparatorProcessCase, SeparatorProcessCaseCreate>
      items={items as SeparatorProcessCase[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun cas process"
      emptyIcon={FlaskConical}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as SeparatorProcessCaseUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// PUMP — Curve Points
// ════════════════════════════════════════════════════════════════

const PUMP_SOURCE_OPTIONS = [
  { value: 'MANUFACTURER', label: 'Fabricant' },
  { value: 'FIELD_TEST', label: 'Test terrain' },
  { value: 'CALCULATED', label: 'Calculé' },
  { value: 'ESTIMATED', label: 'Estimé' },
]

export function PumpCurvePointManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = usePumpCurvePoints(equipmentId)
  const create = useCreatePumpCurvePoint()
  const update = useUpdatePumpCurvePoint()
  const del = useDeletePumpCurvePoint()

  const FIELDS: FieldDef<PumpCurvePointCreate>[] = [
    { key: 'flow_m3h', label: 'Débit (m3/h)', required: true, placeholder: '100' },
    { key: 'head_m', label: 'HMT (m)', placeholder: '85' },
    { key: 'efficiency_pct', label: 'Rendement (%)', placeholder: '78' },
    { key: 'power_kw', label: 'Puissance (kW)', placeholder: '55' },
    { key: 'npshr_m', label: 'NPSHr (m)', placeholder: '3.5' },
    { key: 'speed_rpm', label: 'Vitesse (rpm)', placeholder: '2950' },
    { key: 'source', label: 'Source', required: true, type: 'combobox' as const, options: PUMP_SOURCE_OPTIONS },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'flow_m3h' as const, label: 'Débit', format: (v: unknown) => fmtNum(v, 'm3/h') },
    { key: 'head_m' as const, label: 'HMT', format: (v: unknown) => fmtNum(v, 'm') },
    { key: 'efficiency_pct' as const, label: 'Rend.', format: (v: unknown) => fmtNum(v, '%') },
    { key: 'power_kw' as const, label: 'Puissance', format: (v: unknown) => fmtNum(v, 'kW') },
  ]

  return (
    <SubModelManager<PumpCurvePoint, PumpCurvePointCreate>
      items={items as PumpCurvePoint[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun point de courbe"
      emptyIcon={TrendingUp}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as PumpCurvePointUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// COLUMN — Sections
// ════════════════════════════════════════════════════════════════

const INTERNALS_TYPE_OPTIONS = [
  { value: 'TRAYS', label: 'Plateaux' },
  { value: 'PACKING_STRUCTURED', label: 'Garnissage structuré' },
  { value: 'PACKING_RANDOM', label: 'Garnissage vrac' },
  { value: 'MIXED', label: 'Mixte' },
  { value: 'EMPTY', label: 'Vide' },
]

export function ColumnSectionManager({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: items, isLoading } = useColumnSections(equipmentId)
  const create = useCreateColumnSection()
  const update = useUpdateColumnSection()
  const del = useDeleteColumnSection()

  const FIELDS: FieldDef<ColumnSectionCreate>[] = [
    { key: 'section_number', label: 'N° section', required: true, placeholder: '1' },
    { key: 'section_name', label: 'Nom section', placeholder: 'Rectification' },
    { key: 'internals_type', label: 'Type internes', required: true, type: 'combobox' as const, options: INTERNALS_TYPE_OPTIONS },
    { key: 'tray_count', label: 'Nb plateaux', placeholder: '30' },
    { key: 'packing_type', label: 'Type garnissage', placeholder: 'Mellapak 250Y' },
    { key: 'packing_height_m', label: 'Hauteur garnissage (m)', placeholder: '6.0' },
    { key: 'notes', label: 'Notes' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'section_number' as const, label: 'N°', format: (v: unknown) => `Section ${v ?? '—'}` },
    { key: 'section_name' as const, label: 'Nom' },
    { key: 'internals_type' as const, label: 'Type', format: (v: unknown) => INTERNALS_TYPE_OPTIONS.find(o => o.value === v)?.label ?? String(v ?? '—') },
    { key: 'tray_count' as const, label: 'Plateaux', format: (v: unknown) => v != null ? `${v} plateaux` : '—' },
  ]

  return (
    <SubModelManager<ColumnSection, ColumnSectionCreate>
      items={items as ColumnSection[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune section"
      emptyIcon={Layers}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p as ColumnSectionUpdate })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      hideAddButton={!canEdit}
    />
  )
}
