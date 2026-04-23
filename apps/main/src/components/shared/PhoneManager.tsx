/**
 * PhoneManager — Reusable polymorphic phone management component.
 *
 * Embeddable anywhere: tiers, contacts, users, assets, entities.
 * Supports multiple phones with labels, country code, default flag.
 * Double-click to edit inline.
 *
 * Features:
 *   - Country combobox with emoji flags + auto-detection from phone prefix
 *   - Flag display next to each phone number in the list
 *
 * Usage:
 *   <PhoneManager ownerType="tier" ownerId={tier.id} />
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Loader2, Phone as PhoneIcon, Star, Check, ChevronDown, ShieldCheck, Send } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePhones, useCreatePhone, useUpdatePhone, useDeletePhone } from '@/hooks/useSettings'
import { useSendPhoneVerification, useVerifyPhone } from '@/hooks/useUserSubModels'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { COUNTRIES } from '@/components/shared/CountrySelect'
import type { Country } from '@/components/shared/CountrySelect'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import type { Phone } from '@/types/api'

const FALLBACK_PHONE_LABELS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'office', label: 'Bureau' },
  { value: 'home', label: 'Domicile' },
  { value: 'fax', label: 'Fax' },
  { value: 'other', label: 'Autre' },
]

/** Look up flag emoji from a phone prefix like "+33" */
function getFlagForCode(countryCode: string | null): string | null {
  if (!countryCode) return null
  const c = COUNTRIES.find((c) => c.phone === countryCode)
  return c?.flag ?? null
}

/** Find the best matching country for a phone prefix (longest match wins). */
function detectCountryByPrefix(prefix: string): Country | null {
  if (!prefix.startsWith('+')) return null
  // Try exact match first, then progressively shorter prefixes
  let best: Country | null = null
  let bestLen = 0
  for (const c of COUNTRIES) {
    if (prefix.startsWith(c.phone) && c.phone.length > bestLen) {
      best = c
      bestLen = c.phone.length
    }
  }
  return best
}

// ── PhoneCountryCombobox ──────────────────────────────────────

interface PhoneCountryComboboxProps {
  value: string // phone prefix like "+33"
  onChange: (prefix: string) => void
  compact?: boolean
}

function PhoneCountryCombobox({ value, onChange, compact }: PhoneCountryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Selected country from current value
  const selected = useMemo(
    () => (value ? COUNTRIES.find((c) => c.phone === value) ?? null : null),
    [value],
  )

  // Filtered list — match by name, ISO code, or phone prefix
  const filtered = useMemo(() => {
    if (!query) return COUNTRIES
    const q = query.toLowerCase()
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.phone.includes(q),
    )
  }, [query])

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [filtered.length])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Auto-detect: when user types a prefix like "+33", detect country
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setQuery(val)
      if (!open) setOpen(true)

      // If user is typing a phone prefix, try to auto-detect
      if (val.startsWith('+')) {
        const match = detectCountryByPrefix(val)
        if (match && match.phone === val) {
          // Exact match — select it
          onChange(match.phone)
          setOpen(false)
          setQuery('')
          return
        }
      }
    },
    [open, onChange],
  )

  const handleSelect = useCallback(
    (country: Country) => {
      onChange(country.phone)
      setOpen(false)
      setQuery('')
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!open) {
          setOpen(true)
        } else {
          setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (open && filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex])
        } else {
          setOpen(true)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      } else if (e.key === 'Tab') {
        setOpen(false)
        setQuery('')
      }
    },
    [open, filtered, highlightIndex, handleSelect],
  )

  const width = compact ? 'w-[5.5rem]' : 'w-28'

  return (
    <div ref={containerRef} className={`relative ${width}`}>
      {/* Trigger */}
      <div
        className={`${panelInputClass} flex items-center gap-1 cursor-text !py-1 !px-1.5`}
        onClick={() => {
          setOpen(true)
          inputRef.current?.focus()
        }}
      >
        {/* Flag of selected country */}
        {selected && !open && (
          <span className="text-sm leading-none shrink-0">{selected.flag}</span>
        )}

        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-0 outline-none text-xs p-0 placeholder:text-muted-foreground min-w-0 font-mono"
          placeholder={selected && !open ? selected.phone : '+...'}
          value={open ? query : (selected ? selected.phone : value)}
          onChange={handleInputChange}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onKeyDown={handleKeyDown}
        />

        <ChevronDown
          size={10}
          className={`text-muted-foreground transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-64 max-h-56 overflow-auto rounded-lg border border-border bg-popover shadow-md py-1"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground text-center">
              Aucun pays trouvé
            </li>
          )}
          {filtered.map((c, idx) => (
            <li
              key={c.code}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                idx === highlightIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              } ${value === c.phone ? 'font-semibold' : ''}`}
              onMouseEnter={() => setHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault() // prevent blur before select
                handleSelect(c)
              }}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span className="flex-1 truncate text-xs">{c.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── PhoneManager (main) ───────────────────────────────────────

interface PhoneManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
  hideAddButton?: boolean
  onAddRef?: (fn: () => void) => void
}

export function PhoneManager({ ownerType, ownerId, compact, hideAddButton, onAddRef }: PhoneManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data, isLoading } = usePhones(ownerType, ownerId)
  const createPhone = useCreatePhone()
  const updatePhone = useUpdatePhone()
  const deletePhone = useDeletePhone()
  const sendVerification = useSendPhoneVerification()
  const verifyPhone = useVerifyPhone()
  const dictPhoneLabels = useDictionaryOptions('phone_label')
  const PHONE_LABELS = dictPhoneLabels.length > 0 ? dictPhoneLabels : FALLBACK_PHONE_LABELS

  const [showForm, setShowForm] = useState(false)
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('mobile')
  const [countryCode, setCountryCode] = useState('+33')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Expose add trigger via ref callback
  const handleAdd = useCallback(() => setShowForm(true), [])
  useEffect(() => { onAddRef?.(handleAdd) }, [onAddRef, handleAdd])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [verifyingPhoneId, setVerifyingPhoneId] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')

  const phones: Phone[] = data ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || !number.trim()) return
    try {
      await createPhone.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        number: number.trim(),
        label,
        country_code: countryCode || undefined,
        is_default: phones.length === 0,
      })
      setNumber('')
      setShowForm(false)
      toast({ title: 'Téléphone ajouté', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [ownerId, ownerType, number, label, countryCode, phones.length, createPhone, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deletePhone.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Téléphone supprimé', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [deletePhone, toast])

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await updatePhone.mutateAsync({ id, payload: { is_default: true } })
      toast({ title: 'Numéro par défaut défini', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [updatePhone, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && phones.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {phones.map((phone) => {
            if (editingId === phone.id) {
              return (
                <div key={phone.id} className="md:col-span-2">
                  <InlinePhoneEditor
                    phone={phone}
                    labelOptions={PHONE_LABELS}
                    onSave={async (updates) => {
                      try {
                        await updatePhone.mutateAsync({ id: phone.id, payload: updates })
                        setEditingId(null)
                        toast({ title: 'Téléphone modifié', variant: 'success' })
                      } catch {
                        toast({ title: t('common.error'), variant: 'error' })
                      }
                    }}
                    onCancel={() => setEditingId(null)}
                    isSaving={updatePhone.isPending}
                  />
                </div>
              )
            }

            const isConfirming = confirmDeleteId === phone.id
            const flag = getFlagForCode(phone.country_code)
            return (
              <div
                key={phone.id}
                className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-2 px-3 rounded-lg border border-border/40 bg-card hover:border-border hover:shadow-sm group cursor-pointer transition-all"
                onDoubleClick={() => setEditingId(phone.id)}
                title={t('common.double_click_to_edit', 'Double-cliquez pour modifier') as string}
              >
                <div className="shrink-0 h-7 w-7 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  {flag ? (
                    <span className="text-xs leading-none">{flag}</span>
                  ) : (
                    <PhoneIcon size={12} className="text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground font-mono break-all">
                    {phone.country_code ? `${phone.country_code} ` : ''}{phone.number}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {PHONE_LABELS.find((l) => l.value === phone.label)?.label ?? phone.label}
                    </span>
                    {phone.is_default && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-yellow-600 dark:text-yellow-400">
                        <Star size={8} className="fill-yellow-500 text-yellow-500" /> défaut
                      </span>
                    )}
                  </div>
                </div>
                {phone.verified ? (
                  <span className="shrink-0 h-5 w-5 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center" title={phone.verified_at ? `Vérifié le ${new Date(phone.verified_at).toLocaleDateString()}` : 'Vérifié'}>
                    <ShieldCheck size={10} className="text-green-500" />
                  </span>
                ) : verifyingPhoneId === phone.id ? (
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && otpCode.length === 6) verifyPhone.mutate({ phoneId: phone.id, code: otpCode }, { onSuccess: () => { setVerifyingPhoneId(null); setOtpCode(''); toast({ title: 'Téléphone vérifié', variant: 'success' }) }, onError: () => toast({ title: t('common.invalid_code'), variant: 'error' }) }) }}
                      placeholder="000000"
                      className="w-14 px-1 py-0.5 text-[10px] font-mono rounded border border-border/60 bg-card focus:outline-none text-center"
                      autoFocus
                    />
                    <button
                      onClick={() => verifyPhone.mutate({ phoneId: phone.id, code: otpCode }, { onSuccess: () => { setVerifyingPhoneId(null); setOtpCode(''); toast({ title: 'Téléphone vérifié', variant: 'success' }) }, onError: () => toast({ title: t('common.invalid_code'), variant: 'error' }) })}
                      disabled={otpCode.length !== 6 || verifyPhone.isPending}
                      className="p-0.5 rounded hover:bg-green-100 text-green-600 disabled:opacity-40"
                    >
                      {verifyPhone.isPending ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />}
                    </button>
                    <button onClick={() => { setVerifyingPhoneId(null); setOtpCode('') }} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
                      <X size={9} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      sendVerification.mutate(phone.id, {
                        onSuccess: (data: any) => {
                          setVerifyingPhoneId(phone.id)
                          setOtpCode('')
                          const msg = data?.debug_code ? `Code : ${data.debug_code} (SMS non configuré)` : 'Code envoyé par SMS'
                          toast({ title: msg, variant: 'success' })
                        },
                        onError: () => toast({ title: "Erreur d'envoi", variant: 'error' }),
                      })
                    }}
                    className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 shrink-0"
                    title="Envoyer un code de vérification par SMS"
                    disabled={sendVerification.isPending}
                  >
                    {sendVerification.isPending ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />}
                    <span>{t('common.verify')}</span>
                  </button>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!phone.is_default && (
                    <button
                      onClick={() => handleSetDefault(phone.id)}
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                      title={t('common.set_default', 'Définir par défaut') as string}
                    >
                      <Star size={10} />
                    </button>
                  )}
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirmDeleteId(phone.id)}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                      title="Supprimer"
                    >
                      <X size={10} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px]">
                      <button onClick={() => handleDelete(phone.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && phones.length === 0 && !compact && (
        <EmptyState icon={PhoneIcon} title="Aucun téléphone" size="compact" />
      )}

      {!hideAddButton && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un téléphone
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <PhoneCountryCombobox
              value={countryCode}
              onChange={setCountryCode}
            />
            <input
              type="tel"
              className={`${panelInputClass} flex-1`}
              placeholder="6 12 34 56 78"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
            />
          </div>
          <select className="gl-form-select text-xs" value={label} onChange={(e) => setLabel(e.target.value)}>
            {PHONE_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); setNumber('') }} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={!number.trim() || createPhone.isPending} className="gl-button-sm gl-button-confirm">
              {createPhone.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── InlinePhoneEditor ─────────────────────────────────────────

function InlinePhoneEditor({
  phone,
  labelOptions,
  onSave,
  onCancel,
  isSaving,
}: {
  phone: Phone
  labelOptions: { value: string; label: string }[]
  onSave: (updates: { number?: string; label?: string; country_code?: string | null }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editNumber, setEditNumber] = useState(phone.number)
  const [editLabel, setEditLabel] = useState(phone.label)
  const [editCode, setEditCode] = useState(phone.country_code ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    const updates: Record<string, string | null | undefined> = {}
    if (editNumber.trim() !== phone.number) updates.number = editNumber.trim()
    if (editLabel !== phone.label) updates.label = editLabel
    if ((editCode || null) !== phone.country_code) updates.country_code = editCode || null
    if (Object.keys(updates).length === 0) { onCancel(); return }
    onSave(updates)
  }

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-lg border border-primary/30 bg-card max-w-lg">
      <PhoneCountryCombobox
        value={editCode}
        onChange={setEditCode}
        compact
      />
      <input
        ref={inputRef}
        type="tel"
        value={editNumber}
        onChange={(e) => setEditNumber(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
        className="w-36 px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
      />
      <select value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="text-[10px] px-1 py-0.5 rounded border border-border/60 bg-card">
        {labelOptions.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <button onClick={handleSave} disabled={isSaving} className="gl-button gl-button-confirm text-green-600">
        {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
      </button>
      <button onClick={onCancel} className="gl-button gl-button-default">
        <X size={10} />
      </button>
    </div>
  )
}
