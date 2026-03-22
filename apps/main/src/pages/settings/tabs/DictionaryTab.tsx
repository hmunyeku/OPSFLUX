/**
 * DictionaryTab — Configurable dropdown lists (visa types, vaccine types, etc.)
 * Registered as a Settings section in category 'general', order 18.
 *
 * Some categories support "metadata columns" — extra fields stored in metadata_json.
 * For example, the "nationality" category has columns: country + nationality,
 * so a single entry can serve both country and nationality selectors.
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Loader2, Check, Pencil, Trash2, BookOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { EmptyState } from '@/components/ui/EmptyState'

interface DictionaryEntry {
  id: string
  category: string
  code: string
  label: string
  sort_order: number
  active: boolean
  metadata_json: Record<string, unknown> | null
  translations: Record<string, string> | null
  created_at: string
  updated_at: string
}

/** Available languages for dictionary translations */
const AVAILABLE_LANGUAGES = [
  { code: 'fr', label: 'Fran\u00E7ais' },
  { code: 'en', label: 'English' },
]

/** Extra metadata columns per category */
interface MetaColumn { key: string; label: string; placeholder?: string }

const CATEGORY_META_COLUMNS: Record<string, MetaColumn[]> = {
  nationality: [
    { key: 'country', label: 'Pays', placeholder: 'France' },
    { key: 'nationality', label: 'Nationalité', placeholder: 'Française' },
  ],
}

const CATEGORIES = [
  { value: 'visa_type', label: 'Types de visa' },
  { value: 'vaccine_type', label: 'Types de vaccin' },
  { value: 'passport_type', label: 'Types de passeport' },
  { value: 'medical_check_type', label: 'Types de visite médicale' },
  { value: 'relationship', label: 'Liens de parenté' },
  { value: 'license_type', label: 'Types de permis' },
  { value: 'proficiency_level', label: 'Niveaux de compétence' },
  { value: 'phone_label', label: 'Type de téléphone' },
  { value: 'email_label', label: "Type d'email" },
  { value: 'gender', label: 'Genre' },
  { value: 'nationality', label: 'Pays / Nationalités' },
  { value: 'address_type', label: "Type d'adresse" },
  { value: 'airport', label: 'Aéroports (IATA)' },
]

function useDictionary(category: string | null) {
  return useQuery({
    queryKey: ['dictionary', category],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (category) params.category = category
      const { data } = await api.get('/api/v1/dictionary', { params })
      return data as DictionaryEntry[]
    },
  })
}

function useCreateDictionaryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { category: string; code: string; label: string; sort_order?: number; metadata_json?: Record<string, unknown> | null; translations?: Record<string, string> | null }) => {
      const { data } = await api.post('/api/v1/dictionary', payload)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dictionary'] }),
  })
}

function useUpdateDictionaryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<{ code: string; label: string; sort_order: number; active: boolean; metadata_json: Record<string, unknown> | null; translations: Record<string, string> | null }> }) => {
      const { data } = await api.patch(`/api/v1/dictionary/${id}`, payload)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dictionary'] }),
  })
}

function useDeleteDictionaryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/dictionary/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dictionary'] }),
  })
}

interface DraftState {
  code: string
  label: string
  sort_order: string
  meta: Record<string, string>
  translations: Record<string, string>
}

const emptyDraft = (): DraftState => ({ code: '', label: '', sort_order: '0', meta: {}, translations: {} })

function draftFromEntry(entry: DictionaryEntry, metaCols: MetaColumn[]): DraftState {
  const meta: Record<string, string> = {}
  for (const col of metaCols) {
    meta[col.key] = (entry.metadata_json?.[col.key] as string) ?? ''
  }
  const translations: Record<string, string> = {}
  for (const lang of AVAILABLE_LANGUAGES) {
    translations[lang.code] = (entry.translations?.[lang.code] as string) ?? ''
  }
  return { code: entry.code, label: entry.label, sort_order: String(entry.sort_order), meta, translations }
}

function buildMetadataJson(meta: Record<string, string>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  let hasValue = false
  for (const [k, v] of Object.entries(meta)) {
    if (v.trim()) { out[k] = v.trim(); hasValue = true }
  }
  return hasValue ? out : null
}

function buildTranslations(translations: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {}
  let hasValue = false
  for (const [k, v] of Object.entries(translations)) {
    if (v.trim()) { out[k] = v.trim(); hasValue = true }
  }
  return hasValue ? out : null
}

export default function DictionaryTab() {
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0].value)
  const { data: entries, isLoading } = useDictionary(selectedCategory)
  const createEntry = useCreateDictionaryEntry()
  const updateEntry = useUpdateDictionaryEntry()
  const deleteEntry = useDeleteDictionaryEntry()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState>(emptyDraft())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const metaCols = CATEGORY_META_COLUMNS[selectedCategory] ?? []
  const hasMetaCols = metaCols.length > 0

  const handleAdd = useCallback(() => {
    setDraft(emptyDraft())
    setShowForm(true)
    setEditingId(null)
  }, [])

  const handleEdit = useCallback((entry: DictionaryEntry) => {
    setDraft(draftFromEntry(entry, CATEGORY_META_COLUMNS[selectedCategory] ?? []))
    setEditingId(entry.id)
    setShowForm(false)
  }, [selectedCategory])

  const handleSave = useCallback(() => {
    if (!draft.code.trim() || !draft.label.trim()) return
    const metadata_json = buildMetadataJson(draft.meta)
    const translations = buildTranslations(draft.translations)
    if (editingId) {
      updateEntry.mutate({ id: editingId, payload: { code: draft.code.trim(), label: draft.label.trim(), sort_order: parseInt(draft.sort_order) || 0, metadata_json, translations } })
      setEditingId(null)
    } else {
      createEntry.mutate({ category: selectedCategory, code: draft.code.trim(), label: draft.label.trim(), sort_order: parseInt(draft.sort_order) || 0, metadata_json, translations })
      setShowForm(false)
    }
    setDraft(emptyDraft())
  }, [draft, editingId, selectedCategory, createEntry, updateEntry])

  const handleCancel = useCallback(() => {
    setShowForm(false)
    setEditingId(null)
    setDraft(emptyDraft())
  }, [])

  const handleToggleActive = useCallback((entry: DictionaryEntry) => {
    updateEntry.mutate({ id: entry.id, payload: { active: !entry.active } })
  }, [updateEntry])

  const categoryLabel = CATEGORIES.find(c => c.value === selectedCategory)?.label ?? selectedCategory

  const filteredEntries = (entries ?? []).filter((e) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    if (e.code.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)) return true
    // Also search in metadata columns
    if (e.metadata_json) {
      for (const val of Object.values(e.metadata_json)) {
        if (typeof val === 'string' && val.toLowerCase().includes(q)) return true
      }
    }
    return false
  })

  const renderDraftForm = (isNew: boolean) => (
    <div className={cn('border border-border rounded-lg p-3 space-y-2 mb-3', isNew ? 'bg-muted/30' : 'bg-primary/5')}>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Code</label>
          <input value={draft.code} onChange={(e) => setDraft(d => ({ ...d, code: e.target.value }))} placeholder="code_unique" className={panelInputClass + ' h-7 text-xs'} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Libellé</label>
          <input value={draft.label} onChange={(e) => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Libellé affiché" className={panelInputClass + ' h-7 text-xs'} />
        </div>
        <div className="w-20">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Ordre</label>
          <input type="number" value={draft.sort_order} onChange={(e) => setDraft(d => ({ ...d, sort_order: e.target.value }))} className={panelInputClass + ' h-7 text-xs'} />
        </div>
      </div>
      {hasMetaCols && (
        <div className="flex gap-2">
          {metaCols.map((col) => (
            <div key={col.key} className="flex-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">{col.label}</label>
              <input
                value={draft.meta[col.key] ?? ''}
                onChange={(e) => setDraft(d => ({ ...d, meta: { ...d.meta, [col.key]: e.target.value } }))}
                placeholder={col.placeholder}
                className={panelInputClass + ' h-7 text-xs'}
              />
            </div>
          ))}
        </div>
      )}
      {/* Translations per language */}
      <div className="border-t border-border/40 pt-2 mt-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1 block">Traductions</label>
        <div className="flex gap-2">
          {AVAILABLE_LANGUAGES.map((lang) => (
            <div key={lang.code} className="flex-1">
              <label className="text-[9px] text-muted-foreground">{lang.label} ({lang.code})</label>
              <input
                value={draft.translations[lang.code] ?? ''}
                onChange={(e) => setDraft(d => ({ ...d, translations: { ...d.translations, [lang.code]: e.target.value } }))}
                placeholder={draft.label || `Traduction ${lang.code}`}
                className={panelInputClass + ' h-7 text-xs'}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={handleCancel} className="gl-button-sm gl-button-default flex items-center gap-1"><X size={12} /> Annuler</button>
        <button onClick={handleSave} disabled={createEntry.isPending || updateEntry.isPending} className="gl-button-sm gl-button-confirm flex items-center gap-1">
          {(createEntry.isPending || updateEntry.isPending) ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Enregistrer
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Dictionnaire</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez les listes déroulantes utilisées dans l'application (types de visa, vaccins, etc.).
        </p>
      </div>

      <div className="flex gap-6">
        {/* Categories sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setSelectedCategory(cat.value); setShowForm(false); setEditingId(null); setSearch('') }}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                selectedCategory === cat.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Entries list */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{categoryLabel}</h3>
              {entries && <span className="text-[10px] text-muted-foreground tabular-nums">{search ? `${filteredEntries.length} / ` : ''}{entries.length}</span>}
            </div>
            <button
              onClick={handleAdd}
              disabled={showForm}
              className="gl-button-sm gl-button-confirm flex items-center gap-1"
            >
              <Plus size={12} /> Ajouter
            </button>
          </div>

          <div className="relative mb-3">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par code ou libellé…"
              className={panelInputClass + ' h-8 text-xs pl-8 w-full'}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

          {showForm && renderDraftForm(true)}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : !entries || entries.length === 0 ? (
            <EmptyState icon={BookOpen} title="Aucune entrée" description={`Ajoutez des valeurs pour ${categoryLabel}.`} />
          ) : filteredEntries.length === 0 ? (
            <EmptyState icon={Search} title="Aucun résultat" description={`Aucune entrée ne correspond à « ${search} ».`} />
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {/* Header row for categories with metadata columns */}
              {hasMetaCols && (
                <div className="flex items-center gap-3 py-2 px-3 bg-muted/40 text-[10px] font-medium text-muted-foreground uppercase">
                  <span className="w-24">Code</span>
                  <span className="flex-1">Libellé</span>
                  {metaCols.map((col) => (
                    <span key={col.key} className="flex-1">{col.label}</span>
                  ))}
                  <span className="w-8 text-center">#</span>
                  <span className="w-14" />
                  <span className="w-16" />
                </div>
              )}
              {filteredEntries.map((entry) => (
                <div key={entry.id}>
                  {editingId === entry.id ? (
                    renderDraftForm(false)
                  ) : deletingId === entry.id ? (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10">
                      <span className="text-xs text-destructive flex-1">Supprimer &quot;{entry.label}&quot; ?</span>
                      <button onClick={() => setDeletingId(null)} className="gl-button-sm gl-button-default text-xs">Non</button>
                      <button onClick={() => { deleteEntry.mutate(entry.id); setDeletingId(null) }} className="gl-button-sm gl-button-danger text-xs">Oui</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-accent/30 group transition-colors">
                      <span className={cn('text-xs font-mono', hasMetaCols ? 'w-24 shrink-0' : '', !entry.active && 'line-through text-muted-foreground')}>{entry.code}</span>
                      <span className={cn('text-sm', hasMetaCols ? 'flex-1 min-w-0 truncate' : 'flex-1', !entry.active && 'text-muted-foreground')}>{entry.label}</span>
                      {hasMetaCols && metaCols.map((col) => (
                        <span key={col.key} className={cn('text-xs flex-1 min-w-0 truncate', !entry.active && 'text-muted-foreground')}>
                          {(entry.metadata_json?.[col.key] as string) ?? <span className="text-muted-foreground/50">—</span>}
                        </span>
                      ))}
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-center">{entry.sort_order}</span>
                      <button
                        onClick={() => handleToggleActive(entry)}
                        className={cn('gl-badge text-[9px]', entry.active ? 'gl-badge-success' : 'gl-badge-neutral')}
                      >
                        {entry.active ? 'Actif' : 'Inactif'}
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(entry)} className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent"><Pencil size={11} className="text-muted-foreground" /></button>
                        <button onClick={() => setDeletingId(entry.id)} className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10"><Trash2 size={11} className="text-destructive" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
