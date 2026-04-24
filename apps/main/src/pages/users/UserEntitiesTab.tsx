/**
 * UserEntitiesTab — membership + tier links for a single user.
 *
 * Shown as a tab inside UserDetailPanel. Owns its own data fetching
 * (no props beyond `userId`) and its own pickers for adding to an
 * entity or linking to a tier (enterprise).
 *
 * Extracted from UsersPage.tsx.
 */
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2, X, Building2, Plus, Trash2, KeyRound, CreditCard,
} from 'lucide-react'
import {
  useUserEntities,
  useAssignUserToEntity,
  useRemoveUserFromEntity,
  useUserTierLinks,
  useLinkUserToTier,
  useUnlinkUserFromTier,
} from '@/hooks/useUsers'
import { useAllEntities } from '@/hooks/useEntities'
import { useTiers } from '@/hooks/useTiers'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useUIStore } from '@/stores/uiStore'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { panelInputClass } from '@/components/layout/DynamicPanel'

export function UserEntitiesTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const { data: entities, isLoading } = useUserEntities(userId)
  const assignToEntity = useAssignUserToEntity()
  const removeFromEntity = useRemoveUserFromEntity()
  const { data: tierLinks } = useUserTierLinks(userId)
  const linkToTier = useLinkUserToTier()
  const unlinkFromTier = useUnlinkUserFromTier()
  const confirm = useConfirm()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [showTierPicker, setShowTierPicker] = useState(false)
  const [tierSearch, setTierSearch] = useState('')
  const { data: allEntitiesData } = useAllEntities({ page: 1, page_size: 200 })
  const { data: tiersData } = useTiers({ page: 1, page_size: 200, search: tierSearch || undefined })

  // Filter out entities the user already belongs to
  const availableEntities = useMemo(() => {
    if (!allEntitiesData?.items || !entities) return []
    const assignedIds = new Set(entities.map((e) => e.entity_id))
    return allEntitiesData.items.filter(
      (e) => !assignedIds.has(e.id) && e.active,
    )
  }, [allEntitiesData, entities])

  const filteredAvailable = useMemo(() => {
    if (!pickerSearch) return availableEntities
    const q = pickerSearch.toLowerCase()
    return availableEntities.filter(
      (e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q),
    )
  }, [availableEntities, pickerSearch])

  const handleAssign = useCallback(async (entityId: string) => {
    await assignToEntity.mutateAsync({ userId, entityId })
    setShowPicker(false)
    setPickerSearch('')
  }, [userId, assignToEntity])

  const handleRemove = useCallback(async (entityId: string, entityName: string) => {
    const ok = await confirm({
      title: 'Retirer de l\'entité ?',
      message: `L'utilisateur sera retiré de tous les groupes de l'entité "${entityName}". Cette action est réversible.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (ok) {
      removeFromEntity.mutate({ userId, entityId })
    }
  }, [userId, removeFromEntity, confirm])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Add to entity button / picker */}
      {showPicker ? (
        <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Ajouter à une entité</span>
            <button
              className="gl-button gl-button-default"
              onClick={() => { setShowPicker(false); setPickerSearch('') }}
            >
              <X size={14} />
            </button>
          </div>
          <input
            type="text"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className={panelInputClass}
            placeholder={t('users.rechercher_une_entite')}
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredAvailable.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                {availableEntities.length === 0 ? 'Aucune entité disponible' : 'Aucun résultat'}
              </p>
            ) : (
              filteredAvailable.map((entity) => (
                <button
                  key={entity.id}
                  className="gl-button gl-button-default w-full flex text-left group"
                  onClick={() => handleAssign(entity.id)}
                  disabled={assignToEntity.isPending}
                >
                  <Building2 size={12} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground block truncate">{entity.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{entity.code}</span>
                  </div>
                  <Plus size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <button
          className="gl-button-sm gl-button-default flex items-center gap-1.5"
          onClick={() => setShowPicker(true)}
        >
          <Plus size={12} /> Ajouter à une entité
        </button>
      )}

      {/* Entity cards */}
      {!entities || entities.length === 0 ? (
        <div className="text-center py-6">
          <Building2 size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune entité assignée</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ajoutez cet utilisateur à une entité pour lui donner accès.
          </p>
        </div>
      ) : (
        entities.map((entity) => (
          <div key={entity.entity_id} className="border border-border rounded-lg p-3 space-y-2">
            {/* Entity header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={14} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <CrossModuleLink module="entities" id={entity.entity_id} label={entity.entity_name} showIcon={false} className="text-sm font-semibold" />
                  <span className="text-[10px] text-muted-foreground font-mono">{entity.entity_code}</span>
                </div>
              </div>
              <button
                className="gl-button gl-button-danger"
                title="Retirer de cette entité"
                onClick={() => handleRemove(entity.entity_id, entity.entity_name)}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* Groups & Roles */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Groupes & Roles</span>
              {entity.groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun groupe</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {entity.groups.map((g) => (
                    <button
                      key={g.group_id}
                      onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: 'groups', id: g.group_id })}
                      className="inline-flex items-center gap-1 gl-badge gl-badge-neutral text-[10px] cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                      title={`Groupe: ${g.group_name} | Rôles: ${g.role_names.join(', ') || g.role_codes.join(', ')}`}
                    >
                      <KeyRound size={9} className="shrink-0" />
                      {g.group_name}
                      <span className="text-primary/80 font-semibold">
                        {g.role_names.join(', ') || g.role_codes.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* ── Entreprises liées (Tier Links) ── */}
      <div className="border-t border-border pt-3 mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Entreprises liées</span>
          {!showTierPicker && (
            <button
              className="gl-button-sm gl-button-default flex items-center gap-1"
              onClick={() => setShowTierPicker(true)}
            >
              <Plus size={12} /> Lier une entreprise
            </button>
          )}
        </div>

        {showTierPicker && (
          <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Rechercher une entreprise</span>
              <button
                className="gl-button gl-button-default"
                onClick={() => { setShowTierPicker(false); setTierSearch('') }}
              >
                <X size={14} />
              </button>
            </div>
            <input
              type="text"
              value={tierSearch}
              onChange={(e) => setTierSearch(e.target.value)}
              className={panelInputClass}
              placeholder={t('users.rechercher_par_nom_ou_code')}
              autoFocus
            />
            <div className="max-h-40 overflow-y-auto space-y-1">
              {(() => {
                const linkedIds = new Set((tierLinks ?? []).map((l) => l.tier_id))
                const available = (tiersData?.items ?? []).filter((tier) => !linkedIds.has(tier.id))
                if (available.length === 0) {
                  return <p className="text-xs text-muted-foreground py-2 text-center">Aucune entreprise disponible</p>
                }
                return available.slice(0, 20).map((tier) => (
                  <button
                    key={tier.id}
                    className="gl-button gl-button-default w-full flex text-left group"
                    onClick={async () => {
                      await linkToTier.mutateAsync({ userId, tierId: tier.id })
                      setShowTierPicker(false)
                      setTierSearch('')
                    }}
                    disabled={linkToTier.isPending}
                  >
                    <CreditCard size={12} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground block truncate">{tier.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{tier.code}</span>
                    </div>
                    <Plus size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))
              })()}
            </div>
          </div>
        )}

        {!tierLinks || tierLinks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Aucune entreprise liée</p>
        ) : (
          <div className="space-y-1.5">
            {tierLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
                <CreditCard size={13} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <CrossModuleLink module="tiers" id={link.tier_id} label={link.tier_name} showIcon={false} className="text-sm font-medium truncate block" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">{link.tier_code}</span>
                    {link.tier_type && <span className="gl-badge gl-badge-neutral text-[9px]">{link.tier_type}</span>}
                    <span className="gl-badge gl-badge-info text-[9px]">{link.role}</span>
                  </div>
                </div>
                <button
                  className="gl-button gl-button-danger"
                  title="Retirer le lien"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Retirer le lien ?',
                      message: `L'utilisateur ne sera plus lié à l'entreprise "${link.tier_name}".`,
                      confirmLabel: 'Retirer',
                      variant: 'danger',
                    })
                    if (ok) unlinkFromTier.mutate({ userId, linkId: link.id })
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
