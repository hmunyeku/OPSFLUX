/**
 * I18nTab — Server-driven translations management.
 *
 * Lists messages per (language, namespace) pair, lets admins edit values
 * inline, add/delete keys, and manage the set of active languages.
 *
 * Backend: /api/v1/i18n/admin/*
 * Permission: core.settings.manage
 *
 * Architecture:
 *  - Language picker (tabs) — one tab per i18n_language.active = true
 *  - Namespace filter (default: "mobile")
 *  - Search/filter by key prefix + value substring
 *  - Virtual-scrolled list of rows (key, value input, save/delete)
 *  - "Add key" → opens inline row at top
 *  - "Languages..." → opens a side panel for language CRUD
 *  - "Import CSV/JSON" → file input → bulk-upsert
 *  - "Export JSON" → download all messages for the current language
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Download,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import api from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface I18nLanguage {
  code: string
  label: string
  english_label: string
  active: boolean
  rtl: boolean
  sort_order: number
}

interface I18nMessage {
  id: string
  key: string
  language_code: string
  namespace: string
  value: string
  notes: string | null
  updated_at: string
}

const DEFAULT_NAMESPACE = 'app'

/* ── Hooks ──────────────────────────────────────────────────────────── */

function useLanguages() {
  return useQuery({
    queryKey: ['i18n', 'languages', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/i18n/languages', {
        params: { active_only: false },
      })
      return data as I18nLanguage[]
    },
  })
}

function useMessages(language_code: string, namespace: string) {
  return useQuery({
    queryKey: ['i18n', 'messages', language_code, namespace],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/i18n/admin/messages', {
        params: { language_code, namespace, limit: 5000 },
      })
      return data as I18nMessage[]
    },
    enabled: Boolean(language_code),
  })
}

function useUpsertMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      key: string
      language_code: string
      namespace: string
      value: string
      notes?: string | null
    }) => {
      const { data } = await api.post('/api/v1/i18n/admin/messages', body)
      return data as I18nMessage
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['i18n', 'messages', vars.language_code, vars.namespace] })
    },
  })
}

function useDeleteMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/i18n/admin/messages/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['i18n', 'messages'] }),
  })
}

function useCreateLanguage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Omit<I18nLanguage, 'active' | 'rtl' | 'sort_order'> & Partial<Pick<I18nLanguage, 'active' | 'rtl' | 'sort_order'>>) => {
      const { data } = await api.post('/api/v1/i18n/admin/languages', body)
      return data as I18nLanguage
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['i18n', 'languages'] }),
  })
}

function useUpdateLanguage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, payload }: { code: string; payload: Partial<I18nLanguage> }) => {
      const { data } = await api.patch(`/api/v1/i18n/admin/languages/${code}`, payload)
      return data as I18nLanguage
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['i18n', 'languages'] }),
  })
}

function useDeleteLanguage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      await api.delete(`/api/v1/i18n/admin/languages/${code}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['i18n', 'languages'] }),
  })
}

function useBulkUpsert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      language_code: string
      namespace: string
      messages: { key: string; value: string; notes?: string | null }[]
      replace?: boolean
    }) => {
      const { data } = await api.post('/api/v1/i18n/admin/bulk-upsert', body)
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['i18n', 'messages', vars.language_code, vars.namespace] })
    },
  })
}

/* ── Main component ──────────────────────────────────────────────────── */

export default function I18nTab() {
  const { data: languages = [], isLoading: languagesLoading } = useLanguages()
  const activeLanguages = useMemo(
    () => languages.filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order),
    [languages]
  )
  const [currentLang, setCurrentLang] = useState<string>('')
  const [namespace, setNamespace] = useState<string>(DEFAULT_NAMESPACE)
  const [search, setSearch] = useState('')
  const [showLanguagesPanel, setShowLanguagesPanel] = useState(false)
  const [showAddKey, setShowAddKey] = useState(false)

  useEffect(() => {
    if (!currentLang && activeLanguages.length > 0) {
      setCurrentLang(activeLanguages[0].code)
    }
  }, [activeLanguages, currentLang])

  const { data: messages = [], isLoading: messagesLoading } = useMessages(currentLang, namespace)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (m) =>
        m.key.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q) ||
        (m.notes ?? '').toLowerCase().includes(q)
    )
  }, [messages, search])

  if (languagesLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Chargement des langues...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with language tabs + actions */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1">
          {activeLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setCurrentLang(lang.code)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md border transition-colors',
                currentLang === lang.code
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {lang.code.toUpperCase()} · {lang.label}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button
          onClick={() => setShowLanguagesPanel(true)}
          className="gl-button-sm gl-button-default flex items-center gap-1.5"
        >
          <Globe size={14} /> Gérer les langues
        </button>
      </div>

      {/* Filters + actions row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par clé, valeur ou note..."
            className="gl-form-input w-full pl-8"
          />
        </div>

        <select
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          className="gl-form-input w-32"
        >
          <option value="app">Application</option>
          <option value="mobile">Mobile</option>
        </select>

        <button
          onClick={() => setShowAddKey(true)}
          className="gl-button-sm gl-button-confirm flex items-center gap-1.5"
        >
          <Plus size={14} /> Ajouter une clé
        </button>

        <AiTranslateButton
          sourceLang="fr"
          targetLang={currentLang}
          namespace={namespace}
        />

        <ImportExportMenu
          languageCode={currentLang}
          namespace={namespace}
          messages={messages}
        />
      </div>

      {/* Count */}
      <div className="text-xs text-muted-foreground">
        {messagesLoading ? (
          <Loader2 size={12} className="animate-spin inline" />
        ) : (
          <>
            {filtered.length} clé{filtered.length > 1 ? 's' : ''}
            {search ? ` (filtré sur ${messages.length})` : ''}
          </>
        )}
      </div>

      {/* Add key form (always visible when toggled, even if list is empty) */}
      {showAddKey && (
        <div className="border border-border rounded-md overflow-hidden mb-2">
          <AddKeyRow
            languageCode={currentLang}
            namespace={namespace}
            onCancel={() => setShowAddKey(false)}
            onDone={() => setShowAddKey(false)}
          />
        </div>
      )}

      {/* List */}
      {messagesLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Chargement...
        </div>
      ) : messages.length === 0 && !showAddKey ? (
        <EmptyState
          icon={Globe}
          title="Aucune traduction"
          description="Importez un catalogue ou ajoutez des clés manuellement."
        />
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto divide-y divide-border">
            {filtered.map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Aucun résultat pour « {search} ».
              </div>
            )}
          </div>
        </div>
      )}

      {/* Language side panel */}
      {showLanguagesPanel && (
        <LanguagesPanel
          languages={languages}
          onClose={() => setShowLanguagesPanel(false)}
        />
      )}
    </div>
  )
}

/* ── Row components ──────────────────────────────────────────────────── */

function MessageRow({ message }: { message: I18nMessage }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(message.value)
  const [notes, setNotes] = useState(message.notes ?? '')
  const upsert = useUpsertMessage()
  const remove = useDeleteMessage()
  const confirm = useConfirm()

  useEffect(() => {
    setValue(message.value)
    setNotes(message.notes ?? '')
  }, [message.value, message.notes])

  async function save() {
    await upsert.mutateAsync({
      key: message.key,
      language_code: message.language_code,
      namespace: message.namespace,
      value,
      notes: notes || null,
    })
    setEditing(false)
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Supprimer ?',
      message: `Supprimer la clé "${message.key}" ?`,
      variant: 'danger',
      confirmLabel: 'Supprimer',
    })
    if (!ok) return
    await remove.mutateAsync(message.id)
  }

  return (
    <div className="px-4 py-2.5 hover:bg-muted/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-muted-foreground truncate">{message.key}</div>
          {editing ? (
            <div className="mt-1 space-y-1.5">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="gl-form-input w-full text-sm"
                autoFocus
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="gl-form-input w-full text-xs"
                placeholder="Note pour les traducteurs (optionnel)"
              />
            </div>
          ) : (
            <>
              <div className="mt-0.5 text-sm text-foreground whitespace-pre-wrap break-words">
                {message.value || <span className="italic text-muted-foreground">(vide)</span>}
              </div>
              {message.notes && (
                <div className="mt-1 text-xs italic text-muted-foreground">{message.notes}</div>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={upsert.isPending}
                className="gl-button gl-button-confirm text-primary"
                title="Enregistrer"
              >
                {upsert.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setValue(message.value)
                  setNotes(message.notes ?? '')
                }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                title="Annuler"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Modifier"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={handleDelete}
                className="gl-button gl-button-danger"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AddKeyRow({
  languageCode,
  namespace,
  onCancel,
  onDone,
}: {
  languageCode: string
  namespace: string
  onCancel: () => void
  onDone: () => void
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const upsert = useUpsertMessage()

  async function save() {
    if (!key.trim() || !value.trim()) return
    await upsert.mutateAsync({
      key: key.trim(),
      language_code: languageCode,
      namespace,
      value,
      notes: notes || null,
    })
    onDone()
  }

  return (
    <div className="px-4 py-3 bg-primary/5 border-b border-primary/20 space-y-2">
      <input
        type="text"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="nouvelle.cle.en.dot.notation"
        className="gl-form-input w-full text-xs font-mono"
        autoFocus
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Valeur"
        className="gl-form-input w-full text-sm"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note pour les traducteurs (optionnel)"
        className="gl-form-input w-full text-xs"
      />
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="gl-button-sm gl-button-default">
          Annuler
        </button>
        <button
          onClick={save}
          disabled={upsert.isPending || !key.trim() || !value.trim()}
          className="gl-button-sm gl-button-confirm"
        >
          {upsert.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
        </button>
      </div>
    </div>
  )
}

/* ── Import / Export ─────────────────────────────────────────────────── */

function AiTranslateButton({
  sourceLang,
  targetLang,
  namespace,
}: {
  sourceLang: string
  targetLang: string
  namespace: string
}) {
  const qc = useQueryClient()
  const [result, setResult] = useState<{ translated: number; total_missing: number } | null>(null)

  // Check if AI is configured by looking at settings
  const { data: aiConfigured } = useQuery({
    queryKey: ['ai', 'configured'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/api/v1/settings', { params: { scope: 'entity', key_prefix: 'ai.' } })
        const settings = Array.isArray(data) ? data : []
        const apiKey = settings.find((s: Record<string, unknown>) => s.key === 'ai.api_key' || s.key === 'ai.provider')
        return Boolean(apiKey?.value)
      } catch {
        return false
      }
    },
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/v1/i18n/admin/ai-translate', null, {
        params: { source_lang: sourceLang, target_lang: targetLang, namespace },
      })
      return data as { translated: number; total_missing: number }
    },
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['i18n', 'messages'] })
    },
  })

  // Don't show if target is same as source or AI not configured
  if (targetLang === sourceLang || !aiConfigured) return null

  return (
    <div className="relative">
      <button
        onClick={() => { setResult(null); mutation.mutate() }}
        disabled={mutation.isPending}
        className="gl-button-sm gl-button-default flex items-center gap-1.5"
        title={`Traduire automatiquement les clés manquantes du ${sourceLang.toUpperCase()} vers ${targetLang.toUpperCase()} via l'IA`}
      >
        {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Traduire ({sourceLang.toUpperCase()} → {targetLang.toUpperCase()})
      </button>
      {result && (
        <div className="absolute top-full mt-1 right-0 z-10 bg-card border border-border rounded-md shadow-lg px-3 py-2 text-xs whitespace-nowrap">
          <span className="text-green-600 font-medium">{result.translated}</span> clés traduites
          {result.total_missing > result.translated && (
            <span className="text-muted-foreground"> / {result.total_missing} manquantes</span>
          )}
          <button onClick={() => setResult(null)} className="ml-2 text-muted-foreground hover:text-foreground">
            <X size={10} />
          </button>
        </div>
      )}
      {mutation.isError && (
        <div className="absolute top-full mt-1 right-0 z-10 bg-destructive/10 border border-destructive/30 rounded-md shadow-lg px-3 py-2 text-xs text-destructive whitespace-nowrap">
          Erreur de traduction IA
          <button onClick={() => mutation.reset()} className="ml-2 text-destructive/60 hover:text-destructive">
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  )
}

function ImportExportMenu({
  languageCode,
  namespace,
  messages,
}: {
  languageCode: string
  namespace: string
  messages: I18nMessage[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const bulk = useBulkUpsert()
  const { toast } = useToast()
  const confirm = useConfirm()

  function exportJson() {
    const payload = messages.reduce(
      (acc, m) => {
        acc[m.key] = m.value
        return acc
      },
      {} as Record<string, string>
    )
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `i18n-${languageCode}-${namespace}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(file: File) {
    const text = await file.text()
    let parsed: Record<string, string>
    try {
      parsed = JSON.parse(text)
    } catch {
      toast({ title: 'Le fichier doit être un JSON plat { clé: "valeur" }.', variant: 'warning' })
      return
    }
    const entries = Object.entries(parsed)
    if (entries.length === 0) {
      toast({ title: 'Fichier vide.', variant: 'warning' })
      return
    }
    const ok = await confirm({
      title: 'Importer',
      message: `Importer ${entries.length} clé(s) pour ${languageCode}/${namespace} ?`,
      confirmLabel: 'Importer',
    })
    if (!ok) return
    await bulk.mutateAsync({
      language_code: languageCode,
      namespace,
      messages: entries.map(([key, value]) => ({ key, value: String(value) })),
      replace: false,
    })
    toast({ title: 'Import terminé.', variant: 'warning' })
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={exportJson}
        disabled={messages.length === 0}
        className="gl-button-sm gl-button-default flex items-center gap-1.5"
      >
        <Download size={14} /> Exporter
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={bulk.isPending}
        className="gl-button-sm gl-button-default flex items-center gap-1.5"
      >
        {bulk.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        Importer
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ── Languages panel ─────────────────────────────────────────────────── */

function LanguagesPanel({
  languages,
  onClose,
}: {
  languages: I18nLanguage[]
  onClose: () => void
}) {
  const create = useCreateLanguage()
  const update = useUpdateLanguage()
  const remove = useDeleteLanguage()
  const confirm = useConfirm()

  const [showAdd, setShowAdd] = useState(false)
  const [newLang, setNewLang] = useState({
    code: '',
    label: '',
    english_label: '',
    rtl: false,
    sort_order: (languages.at(-1)?.sort_order ?? 0) + 10,
  })

  async function handleCreate() {
    if (!newLang.code.trim() || !newLang.label.trim() || !newLang.english_label.trim()) return
    await create.mutateAsync({
      code: newLang.code.trim().toLowerCase(),
      label: newLang.label,
      english_label: newLang.english_label,
      rtl: newLang.rtl,
      sort_order: newLang.sort_order,
      active: true,
    })
    setNewLang({
      code: '',
      label: '',
      english_label: '',
      rtl: false,
      sort_order: newLang.sort_order + 10,
    })
    setShowAdd(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-lg shadow-lg border border-border w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-medium flex items-center gap-2">
            <Globe size={16} /> Langues
          </div>
          <button onClick={onClose} className="gl-button gl-button-default">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {languages.map((lang) => (
            <div
              key={lang.code}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-md"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {lang.label} <span className="text-muted-foreground">({lang.code})</span>
                </div>
                <div className="text-xs text-muted-foreground">{lang.english_label}</div>
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={lang.active}
                  onChange={(e) =>
                    update.mutate({ code: lang.code, payload: { active: e.target.checked } })
                  }
                />
                actif
              </label>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Supprimer la langue ?',
                    message: `Supprimer ${lang.label} et TOUTES ses traductions ?`,
                    variant: 'danger',
                    confirmLabel: 'Supprimer',
                  })
                  if (!ok) return
                  await remove.mutateAsync(lang.code)
                }}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {showAdd ? (
            <div className="border border-primary/30 bg-primary/5 rounded-md p-3 space-y-2">
              <input
                type="text"
                value={newLang.code}
                onChange={(e) => setNewLang({ ...newLang, code: e.target.value })}
                placeholder="Code ISO (ex: de, ar)"
                maxLength={10}
                className="gl-form-input w-full text-sm"
              />
              <input
                type="text"
                value={newLang.label}
                onChange={(e) => setNewLang({ ...newLang, label: e.target.value })}
                placeholder="Nom natif (ex: Deutsch)"
                className="gl-form-input w-full text-sm"
              />
              <input
                type="text"
                value={newLang.english_label}
                onChange={(e) => setNewLang({ ...newLang, english_label: e.target.value })}
                placeholder="Nom en anglais (ex: German)"
                className="gl-form-input w-full text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={newLang.rtl}
                  onChange={(e) => setNewLang({ ...newLang, rtl: e.target.checked })}
                />
                Langue de droite à gauche (RTL)
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="gl-button-sm gl-button-default">
                  Annuler
                </button>
                <button
                  onClick={handleCreate}
                  disabled={create.isPending}
                  className="gl-button-sm gl-button-confirm"
                >
                  {create.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full p-2 border border-dashed border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> Ajouter une langue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
