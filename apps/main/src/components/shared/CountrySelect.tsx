/**
 * CountrySelect -- Autocomplete combobox with emoji flags.
 *
 * Searchable country dropdown. Filters by name or ISO alpha-2 code.
 * Keyboard navigable (ArrowUp/Down, Enter, Escape).
 *
 * Usage:
 *   <CountrySelect value={country} onChange={setCountry} />
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ChevronDown, X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────

interface Country {
  code: string
  name: string
  flag: string
  phone: string
}

export interface CountrySelectProps {
  /** ISO alpha-2 code */
  value: string | null
  onChange: (code: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

// ── Country data (~60 most-used countries) ──────────────────────

const COUNTRIES: Country[] = [
  // Africa
  { code: 'CM', name: 'Cameroun', flag: '\u{1F1E8}\u{1F1F2}', phone: '+237' },
  { code: 'GA', name: 'Gabon', flag: '\u{1F1EC}\u{1F1E6}', phone: '+241' },
  { code: 'CG', name: 'Congo-Brazzaville', flag: '\u{1F1E8}\u{1F1EC}', phone: '+242' },
  { code: 'CD', name: 'Congo-Kinshasa', flag: '\u{1F1E8}\u{1F1E9}', phone: '+243' },
  { code: 'GQ', name: 'Guin\u00e9e \u00e9quatoriale', flag: '\u{1F1EC}\u{1F1F6}', phone: '+240' },
  { code: 'NG', name: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}', phone: '+234' },
  { code: 'SN', name: 'S\u00e9n\u00e9gal', flag: '\u{1F1F8}\u{1F1F3}', phone: '+221' },
  { code: 'CI', name: "C\u00f4te d'Ivoire", flag: '\u{1F1E8}\u{1F1EE}', phone: '+225' },
  { code: 'TD', name: 'Tchad', flag: '\u{1F1F9}\u{1F1E9}', phone: '+235' },
  { code: 'CF', name: 'Centrafrique', flag: '\u{1F1E8}\u{1F1EB}', phone: '+236' },
  { code: 'AO', name: 'Angola', flag: '\u{1F1E6}\u{1F1F4}', phone: '+244' },
  { code: 'BJ', name: 'B\u00e9nin', flag: '\u{1F1E7}\u{1F1EF}', phone: '+229' },
  { code: 'BF', name: 'Burkina Faso', flag: '\u{1F1E7}\u{1F1EB}', phone: '+226' },
  { code: 'GH', name: 'Ghana', flag: '\u{1F1EC}\u{1F1ED}', phone: '+233' },
  { code: 'ML', name: 'Mali', flag: '\u{1F1F2}\u{1F1F1}', phone: '+223' },
  { code: 'NE', name: 'Niger', flag: '\u{1F1F3}\u{1F1EA}', phone: '+227' },
  { code: 'TG', name: 'Togo', flag: '\u{1F1F9}\u{1F1EC}', phone: '+228' },
  { code: 'MG', name: 'Madagascar', flag: '\u{1F1F2}\u{1F1EC}', phone: '+261' },
  { code: 'KE', name: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}', phone: '+254' },
  { code: 'TZ', name: 'Tanzanie', flag: '\u{1F1F9}\u{1F1FF}', phone: '+255' },
  { code: 'ZA', name: 'Afrique du Sud', flag: '\u{1F1FF}\u{1F1E6}', phone: '+27' },
  { code: 'EG', name: '\u00c9gypte', flag: '\u{1F1EA}\u{1F1EC}', phone: '+20' },
  { code: 'MA', name: 'Maroc', flag: '\u{1F1F2}\u{1F1E6}', phone: '+212' },
  { code: 'DZ', name: 'Alg\u00e9rie', flag: '\u{1F1E9}\u{1F1FF}', phone: '+213' },
  { code: 'TN', name: 'Tunisie', flag: '\u{1F1F9}\u{1F1F3}', phone: '+216' },
  { code: 'LY', name: 'Libye', flag: '\u{1F1F1}\u{1F1FE}', phone: '+218' },
  { code: 'SD', name: 'Soudan', flag: '\u{1F1F8}\u{1F1E9}', phone: '+249' },

  // Europe
  { code: 'FR', name: 'France', flag: '\u{1F1EB}\u{1F1F7}', phone: '+33' },
  { code: 'GB', name: 'Royaume-Uni', flag: '\u{1F1EC}\u{1F1E7}', phone: '+44' },
  { code: 'DE', name: 'Allemagne', flag: '\u{1F1E9}\u{1F1EA}', phone: '+49' },
  { code: 'ES', name: 'Espagne', flag: '\u{1F1EA}\u{1F1F8}', phone: '+34' },
  { code: 'IT', name: 'Italie', flag: '\u{1F1EE}\u{1F1F9}', phone: '+39' },
  { code: 'BE', name: 'Belgique', flag: '\u{1F1E7}\u{1F1EA}', phone: '+32' },
  { code: 'CH', name: 'Suisse', flag: '\u{1F1E8}\u{1F1ED}', phone: '+41' },
  { code: 'NL', name: 'Pays-Bas', flag: '\u{1F1F3}\u{1F1F1}', phone: '+31' },
  { code: 'PT', name: 'Portugal', flag: '\u{1F1F5}\u{1F1F9}', phone: '+351' },
  { code: 'NO', name: 'Norv\u00e8ge', flag: '\u{1F1F3}\u{1F1F4}', phone: '+47' },
  { code: 'SE', name: 'Su\u00e8de', flag: '\u{1F1F8}\u{1F1EA}', phone: '+46' },
  { code: 'DK', name: 'Danemark', flag: '\u{1F1E9}\u{1F1F0}', phone: '+45' },
  { code: 'AT', name: 'Autriche', flag: '\u{1F1E6}\u{1F1F9}', phone: '+43' },
  { code: 'IE', name: 'Irlande', flag: '\u{1F1EE}\u{1F1EA}', phone: '+353' },
  { code: 'PL', name: 'Pologne', flag: '\u{1F1F5}\u{1F1F1}', phone: '+48' },

  // Americas
  { code: 'US', name: '\u00c9tats-Unis', flag: '\u{1F1FA}\u{1F1F8}', phone: '+1' },
  { code: 'CA', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}', phone: '+1' },
  { code: 'BR', name: 'Br\u00e9sil', flag: '\u{1F1E7}\u{1F1F7}', phone: '+55' },
  { code: 'MX', name: 'Mexique', flag: '\u{1F1F2}\u{1F1FD}', phone: '+52' },

  // Asia / Middle-East
  { code: 'CN', name: 'Chine', flag: '\u{1F1E8}\u{1F1F3}', phone: '+86' },
  { code: 'JP', name: 'Japon', flag: '\u{1F1EF}\u{1F1F5}', phone: '+81' },
  { code: 'IN', name: 'Inde', flag: '\u{1F1EE}\u{1F1F3}', phone: '+91' },
  { code: 'AE', name: '\u00c9mirats arabes unis', flag: '\u{1F1E6}\u{1F1EA}', phone: '+971' },
  { code: 'SA', name: 'Arabie saoudite', flag: '\u{1F1F8}\u{1F1E6}', phone: '+966' },
]

// ── Component ───────────────────────────────────────────────────

export function CountrySelect({
  value,
  onChange,
  placeholder = 'Choisir un pays...',
  className = '',
  disabled = false,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Selected country object
  const selected = useMemo(
    () => (value ? COUNTRIES.find((c) => c.code === value) ?? null : null),
    [value],
  )

  // Filtered list
  const filtered = useMemo(() => {
    if (!query) return COUNTRIES
    const q = query.toLowerCase()
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.phone.includes(q),
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

  const handleSelect = useCallback(
    (country: Country) => {
      onChange(country.code)
      setOpen(false)
      setQuery('')
    },
    [onChange],
  )

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange('')
      setQuery('')
      inputRef.current?.focus()
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
      }
    },
    [open, filtered, highlightIndex, handleSelect],
  )

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input trigger */}
      <div
        className={`gl-form-input flex items-center gap-1.5 cursor-text ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen(true)
            inputRef.current?.focus()
          }
        }}
      >
        {/* Flag of selected country */}
        {selected && !open && (
          <span className="text-base leading-none shrink-0">{selected.flag}</span>
        )}

        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-0 outline-none text-sm p-0 placeholder:text-muted-foreground min-w-0"
          placeholder={selected && !open ? `${selected.flag} ${selected.name} (${selected.code})` : placeholder}
          value={open ? query : ''}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {/* Clear / chevron */}
        <div className="flex items-center gap-0.5 shrink-0">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              onClick={handleClear}
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-border bg-popover shadow-md py-1"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground text-center">
              Aucun pays trouv\u00e9
            </li>
          )}
          {filtered.map((c, idx) => (
            <li
              key={c.code}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                idx === highlightIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              } ${value === c.code ? 'font-semibold' : ''}`}
              onMouseEnter={() => setHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault() // prevent blur before select
                handleSelect(c)
              }}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
              <span className="text-xs text-muted-foreground font-mono">{c.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { COUNTRIES }
export type { Country }
