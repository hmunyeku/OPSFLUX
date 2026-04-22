/**
 * MOCCreatePanel — form for creating a new Management of Change request.
 *
 * Mirrors CDC §4.1 fields. Only the minimum initial fields are required
 * here (site, platform, objectives); the rest is filled progressively
 * through the workflow.
 */
import { useState } from 'react'
import { useStagingRef } from '@/hooks/useStagingRef'
import { useTranslation } from 'react-i18next'
import { Save, X, Plus, Trash2, UserPlus } from 'lucide-react'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { RichTextField } from '@/components/shared/RichTextField'
import { SignaturePad } from '@/components/shared/SignaturePad'
import { UserPicker } from '@/components/shared/UserPicker'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useCreateMOC, useMOCTypes } from '@/hooks/useMOC'
import { useUsers } from '@/hooks/useUsers'
import type {
  MOCCreatePayload,
  MOCModificationType,
  MOCNature,
  MOCInitialValidator,
  MOCValidatorRole,
} from '@/services/mocService'

export function MOCCreatePanel() {
  return (
    <SmartFormProvider panelId="create-moc" defaultMode="simple">
      <MOCCreateInner />
    </SmartFormProvider>
  )
}

function MOCCreateInner() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closePanel = useUIStore((s) => s.closeDynamicPanel)
  const create = useCreateMOC()
  const ctx = useSmartForm()

  // Sites & modification types come from the dictionary so admins can customise
  // them per tenant in Settings → Dictionary (category `moc_site`, `moc_modification_type`).
  const siteOptions = useDictionaryOptions('moc_site')
  const modificationTypeOptions = useDictionaryOptions('moc_modification_type')
  // Métier codes — multi-select on the request (Daxium `metier`).
  const metierOptions = useDictionaryOptions('moc_metier')
  // Admin-maintained catalogue of MOC types — each type carries its own
  // validation matrix template that is auto-seeded on create.
  const { data: mocTypes = [] } = useMOCTypes(false)

  // Primary input: installation from asset registry. When present, backend
  // auto-derives site_label + platform_code from the hierarchy.
  // Fallback: free-text Site + Platform for tenants not using asset_registry.
  const [installationId, setInstallationId] = useState<string | null>(null)
  const [manualFallback, setManualFallback] = useState(false)
  const [site, setSite] = useState('')
  const [customSite, setCustomSite] = useState('')
  const [platform, setPlatform] = useState('')
  const [objectives, setObjectives] = useState('')
  const [description, setDescription] = useState('')
  const [currentSituation, setCurrentSituation] = useState('')
  const [proposedChanges, setProposedChanges] = useState('')
  const [impactAnalysis, setImpactAnalysis] = useState('')
  const [modificationType, setModificationType] = useState<MOCModificationType | ''>('')
  const [mocTypeId, setMocTypeId] = useState<string>('')
  // Daxium extras
  const [title, setTitle] = useState('')
  const [nature, setNature] = useState<MOCNature | ''>('')
  const [metiers, setMetiers] = useState<string[]>([])
  const [initiatorEmail, setInitiatorEmail] = useState('')
  const [externalMode, setExternalMode] = useState(false)
  const [externalName, setExternalName] = useState('')
  const [externalFunction, setExternalFunction] = useState('')
  const [initiatorSignature, setInitiatorSignature] = useState<string | null>(null)
  const [durationDays, setDurationDays] = useState('')
  const [temporaryStart, setTemporaryStart] = useState('')
  const [temporaryEnd, setTemporaryEnd] = useState('')
  const [initiatorFn, setInitiatorFn] = useState('')

  // Staging session — generates a client UUID used as owner_id for every
  // polymorphic child (attachments, notes, tags, …) uploaded before the
  // MOC row exists. On submit, `staging_ref` goes in the payload and the
  // backend re-targets those rows to the new MOC via the shared
  // `commit_staging_children` helper.
  const { stagingRef, stagingOwnerType } = useStagingRef('moc')

  // Ad-hoc validators invited at create time, stacked on top of the
  // automatic matrix seeded from moc_type_id. Each entry points to one
  // user + role + optional metier/level override.
  const [initialValidators, setInitialValidators] = useState<MOCInitialValidator[]>([])
  const [validatorUserId, setValidatorUserId] = useState<string | null>(null)
  const [validatorRole, setValidatorRole] = useState<MOCValidatorRole>('hse')
  const [validatorMetier, setValidatorMetier] = useState<string>('')
  const [validatorLevel, setValidatorLevel] = useState<'' | 'DO' | 'DG' | 'DO_AND_DG'>('')
  const { data: usersData } = useUsers({ page: 1, page_size: 200, active: true })
  const usersById = new Map((usersData?.items ?? []).map((u) => [u.id, u]))
  const addValidator = () => {
    if (!validatorUserId) return
    // De-dup per (user_id, role, metier_code)
    const key = `${validatorUserId}|${validatorRole}|${validatorMetier || ''}`
    if (initialValidators.some((v) =>
      `${v.user_id}|${v.role}|${v.metier_code || ''}` === key,
    )) return
    setInitialValidators((prev) => [
      ...prev,
      {
        user_id: validatorUserId,
        role: validatorRole,
        metier_code: validatorRole === 'metier' ? (validatorMetier.trim() || null) : null,
        metier_name: null,
        level: validatorLevel || null,
      },
    ])
    setValidatorUserId(null)
    setValidatorMetier('')
    setValidatorLevel('')
  }
  const removeValidator = (idx: number) =>
    setInitialValidators((prev) => prev.filter((_, i) => i !== idx))

  // Preferred path: installation picker — backend derives site + platform.
  // Fallback path: manual Site dropdown + Platform free-text.
  const siteLabel = site === 'OTHER' ? customSite.trim() : site
  const canSubmit =
    !!objectives.trim() &&
    !create.isPending &&
    (installationId || (siteLabel && platform.trim()))

  const submit = async () => {
    if (!canSubmit) return
    const payload: MOCCreatePayload = {
      installation_id: installationId,
      // Only include manual fields when no installation picked
      site_label: installationId ? null : siteLabel,
      platform_code: installationId ? null : platform.trim().toUpperCase(),
      objectives: objectives.trim() || null,
      description: description.trim() || null,
      current_situation: currentSituation.trim() || null,
      proposed_changes: proposedChanges.trim() || null,
      impact_analysis: impactAnalysis.trim() || null,
      modification_type: modificationType || null,
      temporary_duration_days:
        modificationType === 'temporary' && durationDays
          ? parseInt(durationDays, 10)
          : null,
      temporary_start_date:
        modificationType === 'temporary' && temporaryStart ? temporaryStart : null,
      temporary_end_date:
        modificationType === 'temporary' && temporaryEnd ? temporaryEnd : null,
      initiator_function: initiatorFn.trim() || null,
      moc_type_id: mocTypeId || null,
      title: title.trim() || null,
      nature: nature || null,
      metiers: metiers.length ? metiers : null,
      initiator_email: initiatorEmail.trim() || null,
      initiator_external_name: externalMode ? externalName.trim() || null : null,
      initiator_external_function: externalMode ? externalFunction.trim() || null : null,
      initiator_signature: initiatorSignature,
      staging_ref: stagingRef || null,
      initial_validators: initialValidators,
    }
    try {
      const moc = await create.mutateAsync(payload)
      toast({ title: t('moc.toast.created', { ref: moc.reference }), variant: 'success' })
      closePanel()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail?.message || t('moc.create.failed')
      toast({ title: msg, variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title={t('moc.create.title')}
      subtitle={t('moc.create.subtitle')}
      actions={[
        <PanelActionButton
          key="save"
          icon={<Save size={12} />}
          variant="primary"
          disabled={!canSubmit || create.isPending}
          onClick={submit}
        >
          {t('common.save')}
        </PanelActionButton>,
        <PanelActionButton
          key="cancel"
          icon={<X size={12} />}
          variant="default"
          onClick={closePanel}
        >
          {t('common.cancel')}
        </PanelActionButton>,
      ]}
    >
      <PanelContentLayout>
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection
          id="location"
          title={t('moc.create.section_location')}
          level="essential"
          help={{
            description: t('moc.help.location_description'),
            tips: [
              t('moc.help.location_tip_installation'),
              t('moc.help.location_tip_fallback'),
            ],
          }}
        >
          {/* Primary: installation picker. Site + Platform auto-derived
              backend-side from the asset_registry hierarchy (Installation →
              Site → Field). If the target isn't in the registry yet, tick
              "Saisie manuelle" to enter Site + Platform as free text. */}
          <FormGrid>
            <DynamicPanelField label={t('moc.fields.installation')} span="full">
              <AssetPicker
                value={installationId}
                onChange={(id) => setInstallationId(id)}
                placeholder={t('moc.fields.installation_ph') as string}
                filterTypes={['installation']}
                clearable
              />
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {t('moc.fields.installation_hint_v2')}
              </p>
            </DynamicPanelField>
            <DynamicPanelField label={t('moc.fields.initiator_function')}>
              <input
                className={panelInputClass}
                value={initiatorFn}
                onChange={(e) => setInitiatorFn(e.target.value)}
                placeholder={t('moc.fields.initiator_function_ph') as string}
              />
            </DynamicPanelField>
          </FormGrid>

          {!installationId && (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={manualFallback}
                  onChange={(e) => setManualFallback(e.target.checked)}
                />
                {t('moc.fields.manual_location_toggle')}
              </label>
              {manualFallback && (
                <FormGrid>
                  <DynamicPanelField label={t('moc.fields.site')}>
                    <select
                      className={panelInputClass}
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                    >
                      <option value="">—</option>
                      {siteOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      <option value="OTHER">{t('common.other')}</option>
                    </select>
                  </DynamicPanelField>
                  {site === 'OTHER' && (
                    <DynamicPanelField label={t('moc.fields.site_custom')}>
                      <input
                        className={panelInputClass}
                        value={customSite}
                        onChange={(e) => setCustomSite(e.target.value)}
                        placeholder={t('moc.fields.site_custom_ph') as string}
                      />
                    </DynamicPanelField>
                  )}
                  <DynamicPanelField label={t('moc.fields.platform')}>
                    <input
                      className={panelInputClass}
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      placeholder={t('moc.field.platformPlaceholder') as string}
                    />
                  </DynamicPanelField>
                </FormGrid>
              )}
            </div>
          )}
        </SmartFormSection>

        <SmartFormSection
          id="initiator"
          title={t('moc.create.section_initiator')}
          level="essential"
          help={{
            description: t('moc.help.initiator_description'),
            tips: [
              t('moc.help.initiator_tip_email'),
              t('moc.help.initiator_tip_external'),
              t('moc.help.initiator_tip_signature'),
            ],
          }}
        >
          <FormGrid>
            <DynamicPanelField label={t('moc.fields.initiator_email')}>
              <input
                type="email"
                className={panelInputClass}
                value={initiatorEmail}
                onChange={(e) => setInitiatorEmail(e.target.value)}
                placeholder={t('moc.fields.initiator_email_ph') as string}
              />
            </DynamicPanelField>
            <DynamicPanelField label=" ">
              <label className="flex items-center gap-2 text-xs pt-1.5">
                <input
                  type="checkbox"
                  checked={externalMode}
                  onChange={(e) => setExternalMode(e.target.checked)}
                />
                {t('moc.fields.external_initiator_toggle')}
              </label>
            </DynamicPanelField>
            {externalMode && (
              <>
                <DynamicPanelField label={t('moc.fields.external_name')}>
                  <input
                    className={panelInputClass}
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    placeholder={t('moc.fields.external_name_ph') as string}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('moc.fields.external_function')}>
                  <input
                    className={panelInputClass}
                    value={externalFunction}
                    onChange={(e) => setExternalFunction(e.target.value)}
                    placeholder={t('moc.fields.external_function_ph') as string}
                  />
                </DynamicPanelField>
              </>
            )}
            <DynamicPanelField label={t('moc.fields.initiator_signature')} span="full">
              <SignaturePad
                value={initiatorSignature}
                onChange={setInitiatorSignature}
                width={320}
                height={110}
              />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection
          id="objectives"
          title={t('moc.create.section_objectives')}
          level="essential"
          help={{
            description: t('moc.help.objectives_description'),
            tips: [
              t('moc.help.objectives_tip_title'),
              t('moc.help.objectives_tip_objectives'),
              t('moc.help.objectives_tip_rich'),
            ],
          }}
        >
          {/* Title (nom_moc) — short label for lists. */}
          <DynamicPanelField label={t('moc.fields.title')} span="full">
            <input
              className={panelInputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('moc.fields.title_ph') as string}
            />
          </DynamicPanelField>
          {/* Short one-liner — keep as plain input, no markdown overhead. */}
          <DynamicPanelField label={t('moc.fields.objectives')} span="full">
            <input
              className={panelInputClass}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder={t('moc.fields.objectives_ph') as string}
            />
          </DynamicPanelField>
          {/* Multi-paragraph fields use RichTextField (Tiptap) — rich formatting,
              bullet lists, tables, inline code, etc. */}
          <DynamicPanelField label={t('moc.fields.description')} span="full">
            <RichTextField
              value={description}
              onChange={setDescription}
              rows={5}
              imageOwnerType={stagingOwnerType}
              imageOwnerId={stagingRef}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.current_situation')} span="full">
            <RichTextField
              value={currentSituation}
              onChange={setCurrentSituation}
              rows={4}
              imageOwnerType={stagingOwnerType}
              imageOwnerId={stagingRef}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.proposed_changes')} span="full">
            <RichTextField
              value={proposedChanges}
              onChange={setProposedChanges}
              rows={4}
              imageOwnerType={stagingOwnerType}
              imageOwnerId={stagingRef}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.impact_analysis')} span="full">
            <RichTextField
              value={impactAnalysis}
              onChange={setImpactAnalysis}
              rows={4}
              placeholder={t('moc.fields.impact_analysis_ph') as string}
              imageOwnerType={stagingOwnerType}
              imageOwnerId={stagingRef}
            />
          </DynamicPanelField>
        </SmartFormSection>

        <SmartFormSection
          id="type"
          title={t('moc.create.section_type')}
          level="advanced"
          help={{
            description: t('moc.help.type_description'),
            items: [
              { label: 'OPTIMISATION', text: t('moc.help.nature_optimisation') },
              { label: 'SECURITE', text: t('moc.help.nature_securite') },
              { label: 'PERMANENT', text: t('moc.help.modtype_permanent') },
              { label: 'TEMPORAIRE', text: t('moc.help.modtype_temporary') },
            ],
            tips: [
              t('moc.help.type_tip_metiers'),
            ],
          }}
        >
          <FormGrid>
            {/* Type de MOC — drives the initial validation matrix.
                Admin manages this catalogue in Settings → MOCtrack → Types. */}
            <DynamicPanelField label={t('moc.fields.moc_type')} span="full">
              <select
                className={panelInputClass}
                value={mocTypeId}
                onChange={(e) => setMocTypeId(e.target.value)}
              >
                <option value="">—</option>
                {mocTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {mocTypeId && (
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  {(() => {
                    const chosen = mocTypes.find((x) => x.id === mocTypeId)
                    const n = chosen?.rules?.filter((r) => r.active).length ?? 0
                    return t('moc.fields.moc_type_hint', { count: n })
                  })()}
                </p>
              )}
            </DynamicPanelField>
            <DynamicPanelField label={t('moc.fields.nature')}>
              <select
                className={panelInputClass}
                value={nature}
                onChange={(e) => setNature(e.target.value as MOCNature | '')}
              >
                <option value="">—</option>
                <option value="OPTIMISATION">{t('moc.nature.OPTIMISATION')}</option>
                <option value="SECURITE">{t('moc.nature.SECURITE')}</option>
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('moc.fields.metiers')} span="full">
              <div className="flex flex-wrap gap-1.5">
                {metierOptions.length === 0 && (
                  <span className="text-[10px] text-muted-foreground italic">
                    {t('moc.fields.metiers_empty')}
                  </span>
                )}
                {metierOptions.map((o) => {
                  const checked = metiers.includes(o.value)
                  return (
                    <label
                      key={o.value}
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] cursor-pointer border ${
                        checked
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-muted border-transparent text-muted-foreground'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setMetiers((prev) =>
                            e.target.checked
                              ? [...prev, o.value]
                              : prev.filter((v) => v !== o.value),
                          )
                        }
                        className="hidden"
                      />
                      {o.label}
                    </label>
                  )
                })}
              </div>
            </DynamicPanelField>
            <DynamicPanelField label={t('moc.fields.modification_type')}>
              <select
                className={panelInputClass}
                value={modificationType}
                onChange={(e) =>
                  setModificationType(e.target.value as MOCModificationType | '')
                }
              >
                <option value="">—</option>
                {modificationTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </DynamicPanelField>
            {modificationType === 'temporary' && (
              <>
                <DynamicPanelField label={t('moc.fields.temporary_start_date')}>
                  <input
                    type="date"
                    className={panelInputClass}
                    value={temporaryStart}
                    onChange={(e) => setTemporaryStart(e.target.value)}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('moc.fields.temporary_end_date')}>
                  <input
                    type="date"
                    className={panelInputClass}
                    value={temporaryEnd}
                    onChange={(e) => setTemporaryEnd(e.target.value)}
                    min={temporaryStart || undefined}
                  />
                </DynamicPanelField>
                <DynamicPanelField
                  label={t('moc.fields.duration_days')}
                  span="full"
                >
                  <input
                    type="number"
                    min={1}
                    className={panelInputClass}
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    placeholder={t('moc.fields.duration_days_optional_ph') as string}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {t('moc.fields.duration_days_hint')}
                  </p>
                </DynamicPanelField>
              </>
            )}
          </FormGrid>
        </SmartFormSection>

        {/* ── Validateurs ad-hoc invités à la création ── */}
        <SmartFormSection
          id="validators"
          title={`${t('moc.create.section_validators', 'Validateurs à inviter')} (${initialValidators.length})`}
          level="advanced"
          skippable
          collapsible
          defaultExpanded={false}
          help={{
            description: t('moc.help.validators_description'),
            items: [
              { label: 'HSE', text: t('moc.help.role_hse') },
              { label: 'Lead Process', text: t('moc.help.role_lead_process') },
              { label: 'Production Manager', text: t('moc.help.role_production_manager') },
              { label: 'Gaz Manager', text: t('moc.help.role_gas_manager') },
              { label: 'Maintenance Manager', text: t('moc.help.role_maintenance_manager') },
              { label: 'Process Engineer', text: t('moc.help.role_process_engineer') },
              { label: 'Métier', text: t('moc.help.role_metier') },
            ],
          }}
        >
          {initialValidators.length > 0 && (
            <div className="space-y-1 mb-2">
              {initialValidators.map((v, idx) => {
                const user = usersById.get(v.user_id)
                const displayName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email : v.user_id
                return (
                  <div
                    key={`${v.user_id}-${v.role}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserPlus size={12} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{displayName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {[v.role, v.metier_code, v.level].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeValidator(idx)}
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                      title={t('common.delete') as string}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-2 rounded-md border border-border bg-card p-2">
            <FormGrid>
              <DynamicPanelField label={t('users.user', 'Utilisateur')} required>
                <UserPicker
                  value={validatorUserId}
                  onChange={setValidatorUserId}
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('moc.fields.role', 'Rôle')} required>
                <select
                  value={validatorRole}
                  onChange={(e) => setValidatorRole(e.target.value as MOCValidatorRole)}
                  className={panelInputClass}
                >
                  <option value="hse">HSE</option>
                  <option value="lead_process">Lead Process</option>
                  <option value="production_manager">Production Manager</option>
                  <option value="gas_manager">Gaz Manager</option>
                  <option value="maintenance_manager">Maintenance Manager</option>
                  <option value="process_engineer">Process Engineer</option>
                  <option value="metier">Métier (autre)</option>
                </select>
              </DynamicPanelField>
              {validatorRole === 'metier' && (
                <DynamicPanelField label={t('moc.fields.metier_code', 'Code métier')}>
                  <input
                    type="text"
                    value={validatorMetier}
                    onChange={(e) => setValidatorMetier(e.target.value)}
                    className={panelInputClass}
                    placeholder="elec / instru / piping..."
                  />
                </DynamicPanelField>
              )}
              <DynamicPanelField label={t('moc.fields.level', 'Niveau validation')}>
                <select
                  value={validatorLevel}
                  onChange={(e) => setValidatorLevel(e.target.value as '' | 'DO' | 'DG' | 'DO_AND_DG')}
                  className={panelInputClass}
                >
                  <option value="">—</option>
                  <option value="DO">D.O</option>
                  <option value="DG">D.G</option>
                  <option value="DO_AND_DG">D.O + D.G</option>
                </select>
              </DynamicPanelField>
            </FormGrid>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={addValidator}
                disabled={!validatorUserId}
                className="gl-button-sm gl-button-confirm inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus size={12} /> {t('common.add', 'Ajouter')}
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground italic">
            {t('moc.create.validators_hint', 'Ces validateurs s\u2019ajoutent à la matrice automatique du type de MOC (si défini).')}
          </p>
        </SmartFormSection>

        {ctx?.mode === 'wizard' && (
          <SmartFormWizardNav
            onSubmit={submit}
            onCancel={closePanel}
            submitDisabled={!canSubmit || create.isPending}
            submitLabel={t('common.save')}
          />
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
