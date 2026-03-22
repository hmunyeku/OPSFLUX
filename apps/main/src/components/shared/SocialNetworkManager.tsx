/**
 * SocialNetworkManager — Reusable polymorphic social network link management component.
 *
 * Embeddable anywhere: tiers, contacts, users, assets, entities.
 * Supports multiple social network links with network type, URL, and optional label.
 * Double-click to edit inline.
 *
 * Usage:
 *   <SocialNetworkManager ownerType="tier" ownerId={tier.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, X, Loader2, Check, Linkedin, Twitter, Facebook, Instagram, Youtube, Globe, Link } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSocialNetworks, useCreateSocialNetwork, useUpdateSocialNetwork, useDeleteSocialNetwork } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { SocialNetworkRead } from '@/services/settingsService'

const NETWORK_TYPES = [
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { value: 'twitter', label: 'Twitter', icon: Twitter },
  { value: 'facebook', label: 'Facebook', icon: Facebook },
  { value: 'instagram', label: 'Instagram', icon: Instagram },
  { value: 'youtube', label: 'YouTube', icon: Youtube },
  { value: 'website', label: 'Site web', icon: Globe },
  { value: 'other', label: 'Autre', icon: Link },
] as const

function getNetworkMeta(network: string) {
  return NETWORK_TYPES.find((n) => n.value === network) ?? NETWORK_TYPES[NETWORK_TYPES.length - 1]
}

// ── SocialNetworkManager (main) ───────────────────────────────────

interface SocialNetworkManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
}

export function SocialNetworkManager({ ownerType, ownerId, compact }: SocialNetworkManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = useSocialNetworks(ownerType, ownerId)
  const createSocial = useCreateSocialNetwork()
  const updateSocial = useUpdateSocialNetwork()
  const deleteSocial = useDeleteSocialNetwork()

  const [showForm, setShowForm] = useState(false)
  const [network, setNetwork] = useState('linkedin')
  const [url, setUrl] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const items: SocialNetworkRead[] = data ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || !url.trim()) return
    try {
      await createSocial.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        network,
        url: url.trim(),
        sort_order: items.length,
      })
      setUrl('')
      setShowForm(false)
      toast({ title: 'Réseau social ajouté', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [ownerId, ownerType, network, url, items.length, createSocial, toast])

  const handleDelete = useCallback(async (id: string) => {
    if (!ownerId) return
    try {
      await deleteSocial.mutateAsync({ id, ownerType, ownerId })
      setConfirmDeleteId(null)
      toast({ title: 'Réseau social supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [ownerId, ownerType, deleteSocial, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-1">
          {items.map((sn) => {
            if (editingId === sn.id) {
              return (
                <InlineSocialEditor
                  key={sn.id}
                  socialNetwork={sn}
                  onSave={async (updates) => {
                    try {
                      await updateSocial.mutateAsync({ id: sn.id, payload: updates })
                      setEditingId(null)
                      toast({ title: 'Réseau social modifié', variant: 'success' })
                    } catch {
                      toast({ title: 'Erreur', variant: 'error' })
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateSocial.isPending}
                />
              )
            }

            const meta = getNetworkMeta(sn.network)
            const Icon = meta.icon
            const isConfirming = confirmDeleteId === sn.id
            return (
              <div
                key={sn.id}
                className="flex items-center gap-2 text-sm group"
                onDoubleClick={() => setEditingId(sn.id)}
                title="Double-cliquez pour modifier"
              >
                <Icon size={12} className="text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase w-16 shrink-0">
                  {meta.label}
                </span>
                <a
                  href={sn.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground text-xs truncate hover:text-primary transition-colors"
                  title={sn.url}
                  onClick={(e) => e.stopPropagation()}
                >
                  {sn.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}
                </a>
                <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirmDeleteId(sn.id)}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                      title="Supprimer"
                    >
                      <X size={10} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px]">
                      <button onClick={() => handleDelete(sn.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && items.length === 0 && !compact && (
        <EmptyState icon={Globe} title="Aucun réseau social" size="compact" />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un réseau social
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <select className="gl-form-select text-xs" value={network} onChange={(e) => setNetwork(e.target.value)}>
            {NETWORK_TYPES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
          <input
            type="url"
            className={`${panelInputClass} w-full`}
            placeholder="https://linkedin.com/company/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); setUrl('') }} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={!url.trim() || createSocial.isPending} className="gl-button-sm gl-button-confirm">
              {createSocial.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── InlineSocialEditor ────────────────────────────────────────────

function InlineSocialEditor({
  socialNetwork,
  onSave,
  onCancel,
  isSaving,
}: {
  socialNetwork: SocialNetworkRead
  onSave: (updates: { network?: string; url?: string }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editNetwork, setEditNetwork] = useState(socialNetwork.network)
  const [editUrl, setEditUrl] = useState(socialNetwork.url)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    const updates: Record<string, string> = {}
    if (editNetwork !== socialNetwork.network) updates.network = editNetwork
    if (editUrl.trim() !== socialNetwork.url) updates.url = editUrl.trim()
    if (Object.keys(updates).length === 0) { onCancel(); return }
    onSave(updates)
  }

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-lg border border-primary/30 bg-card">
      <select value={editNetwork} onChange={(e) => setEditNetwork(e.target.value)} className="text-[10px] px-1 py-0.5 rounded border border-border/60 bg-card">
        {NETWORK_TYPES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
      </select>
      <input
        ref={inputRef}
        type="url"
        value={editUrl}
        onChange={(e) => setEditUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
        className="flex-1 px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
        placeholder="https://..."
      />
      <button onClick={handleSave} disabled={isSaving} className="p-0.5 rounded hover:bg-green-100 text-green-600">
        {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
      </button>
      <button onClick={onCancel} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
        <X size={10} />
      </button>
    </div>
  )
}
