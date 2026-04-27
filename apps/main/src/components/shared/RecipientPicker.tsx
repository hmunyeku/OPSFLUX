/**
 * RecipientPicker — multi-select chip input for email recipients.
 *
 * Combines three input modes in a single field, in line with how every
 * mainstream mail composer works (Gmail, Outlook, Superhuman):
 *
 *   1. Search → pick from existing OpsFlux users
 *   2. Search → pick from tier contacts (with email)
 *   3. Type a free-text email → press Enter / Tab / Comma → chip
 *
 * Output is a list of `Recipient` objects: each chip carries the email,
 * an optional display label, and the source (user / contact / manual).
 * Consumers usually only care about `email` for the API call but can
 * keep the label for friendly UI rendering on the next render pass.
 *
 * Accessibility:
 *   - Backspace on an empty input removes the last chip.
 *   - ArrowDown moves focus into the suggestion menu.
 *   - Escape closes the menu and keeps focus in the input.
 *
 * Used by EmailComposer (To + CC) and can be reused anywhere we need
 * a "people who get this" multi-pick (decision-request invitations,
 * notification target lists, …).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, X, Mail, Users, Contact as ContactIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUsers } from '@/hooks/useUsers'
import { useAllTierContacts } from '@/hooks/useTiers'

export interface Recipient {
  /** Canonical email address — unique within a list. */
  email: string
  /** Optional display label (Full Name "Last, First", etc.). */
  label?: string
  /** Where this recipient came from — drives chip icon. */
  source?: 'user' | 'contact' | 'manual'
}

export interface RecipientPickerProps {
  value: Recipient[]
  onChange: (next: Recipient[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Hide the suggestion source: useful when only one is meaningful. */
  includeUsers?: boolean
  includeContacts?: boolean
  /** Cap number of chips (e.g. 20 to match backend limit). */
  maxRecipients?: number
  /** Additional CSS class for the inner input. */
  inputClassName?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim())
}

/** Split a pasted blob like "a@x.com, b@x.com; c@x.com" into atoms. */
function splitPastedEmails(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

interface Suggestion {
  key: string // unique
  email: string
  label: string
  secondary?: string
  source: 'user' | 'contact'
}

export function RecipientPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  includeUsers = true,
  includeContacts = true,
  maxRecipients = 20,
  inputClassName,
}: RecipientPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // ── Suggestion sources ────────────────────────────────────────
  // Both fire only when the field is open AND the user has typed at
  // least one character — keeps page-load cost down and matches what
  // mail composers do (no full directory dump on focus).
  const usersQ = useUsers({ page: 1, page_size: 50, search: query, active: true })
  const contactsQ = useAllTierContacts({ page: 1, page_size: 50, search: query })

  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = []
    const taken = new Set(value.map((r) => r.email.toLowerCase()))
    const q = query.trim().toLowerCase()

    if (includeUsers) {
      for (const u of usersQ.data?.items ?? []) {
        if (!u.email) continue
        const e = u.email.toLowerCase()
        if (taken.has(e)) continue
        const fullName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
        const hay = `${fullName} ${u.email}`.toLowerCase()
        if (q && !hay.includes(q)) continue
        out.push({
          key: `u:${u.id}`,
          email: u.email,
          label: fullName,
          secondary: u.email,
          source: 'user',
        })
      }
    }
    if (includeContacts) {
      for (const c of contactsQ.data?.items ?? []) {
        if (!c.email) continue
        const e = c.email.toLowerCase()
        if (taken.has(e)) continue
        const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email
        const tierName = (c as { tier_name?: string }).tier_name ?? ''
        const hay = `${fullName} ${c.email} ${tierName}`.toLowerCase()
        if (q && !hay.includes(q)) continue
        out.push({
          key: `c:${c.id}`,
          email: c.email,
          label: fullName,
          secondary: tierName ? `${c.email} · ${tierName}` : c.email,
          source: 'contact',
        })
      }
    }
    // Cap to a sane number — server-side we already limit page_size,
    // but if both lists fill up we don't want a 100-item dropdown.
    return out.slice(0, 30)
  }, [value, query, usersQ.data, contactsQ.data, includeUsers, includeContacts])

  const showFreeTextHint =
    query.length > 0 && isValidEmail(query) && !suggestions.some((s) => s.email.toLowerCase() === query.trim().toLowerCase())

  // Reset active index when suggestion list changes underneath us.
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // ── Mutators ─────────────────────────────────────────────────
  const addRecipient = useCallback(
    (rec: Recipient) => {
      if (value.length >= maxRecipients) return
      const exists = value.some((r) => r.email.toLowerCase() === rec.email.toLowerCase())
      if (exists) return
      onChange([...value, rec])
    },
    [value, onChange, maxRecipients],
  )

  const removeAt = useCallback(
    (idx: number) => {
      const next = value.slice()
      next.splice(idx, 1)
      onChange(next)
    },
    [value, onChange],
  )

  const commitFreeText = useCallback(
    (raw: string): boolean => {
      const atoms = splitPastedEmails(raw)
      const accepted: Recipient[] = []
      for (const atom of atoms) {
        if (!isValidEmail(atom)) continue
        if (
          [...value, ...accepted].some((r) => r.email.toLowerCase() === atom.toLowerCase())
        )
          continue
        accepted.push({ email: atom, source: 'manual' })
      }
      if (accepted.length === 0) return false
      const merged = [...value, ...accepted].slice(0, maxRecipients)
      onChange(merged)
      return true
    },
    [value, onChange, maxRecipients],
  )

  const commitSuggestion = useCallback(
    (s: Suggestion) => {
      addRecipient({ email: s.email, label: s.label, source: s.source })
      setQuery('')
      setActiveIdx(0)
      // Keep focus inside the input so the user can keep typing.
      inputRef.current?.focus()
    },
    [addRecipient],
  )

  // ── Keyboard ─────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      // Enter on a highlighted suggestion → commit it.
      if (open && suggestions.length > 0 && e.key !== ',') {
        e.preventDefault()
        commitSuggestion(suggestions[activeIdx])
        return
      }
      // Otherwise try to commit free text.
      if (query.trim()) {
        const ok = commitFreeText(query)
        if (ok) {
          e.preventDefault()
          setQuery('')
        }
      }
      return
    }
    if (e.key === 'Backspace' && query === '' && value.length > 0) {
      e.preventDefault()
      removeAt(value.length - 1)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const txt = e.clipboardData.getData('text')
    if (!txt) return
    if (txt.includes(',') || txt.includes(';') || txt.includes('\n')) {
      e.preventDefault()
      commitFreeText(txt)
      setQuery('')
    }
  }

  // ── Outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const isLoading = (usersQ.isLoading || contactsQ.isLoading) && open && query.length > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        onClick={() => {
          if (!disabled) inputRef.current?.focus()
        }}
        className={cn(
          'min-h-[34px] w-full rounded-md border border-border bg-background',
          'px-1.5 py-1 flex flex-wrap items-center gap-1 cursor-text',
          'focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {value.map((r, idx) => {
          const Icon =
            r.source === 'user' ? Users
            : r.source === 'contact' ? ContactIcon
            : Mail
          const display = r.label ? `${r.label} <${r.email}>` : r.email
          return (
            <span
              key={`${r.email}-${idx}`}
              className={cn(
                'inline-flex items-center gap-1 max-w-[60ch]',
                'rounded-md border border-border bg-muted/40',
                'pl-1.5 pr-0.5 py-0.5 text-[11px] text-foreground',
              )}
              title={display}
            >
              <Icon size={11} className="text-muted-foreground shrink-0" />
              <span className="truncate">
                {r.label ? (
                  <>
                    {r.label} <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
                  </>
                ) : (
                  r.email
                )}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeAt(idx)
                  }}
                  className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label={t('common.remove', 'Retirer')}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          )
        })}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || value.length >= maxRecipients}
          placeholder={
            value.length === 0
              ? placeholder ?? t('common.recipients_placeholder', 'email@exemple.com ou rechercher…')
              : ''
          }
          className={cn(
            'flex-1 min-w-[10ch] bg-transparent border-0 outline-none px-1 text-xs text-foreground placeholder:text-muted-foreground/60',
            inputClassName,
          )}
        />
      </div>

      {/* Suggestion popover ──────────────────────────────────── */}
      {open && (suggestions.length > 0 || isLoading || showFreeTextHint) && (
        <div
          className={cn(
            'absolute left-0 right-0 top-full mt-1 z-50',
            'rounded-md border border-border bg-popover shadow-lg overflow-hidden',
            'max-h-72 overflow-y-auto',
          )}
        >
          {showFreeTextHint && (
            <button
              type="button"
              onClick={() => {
                commitFreeText(query)
                setQuery('')
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted/40 border-b border-border/40 flex items-center gap-1.5"
            >
              <Mail size={11} className="text-primary" />
              <span>
                {t('common.use_email_as_is', 'Utiliser')}{' '}
                <span className="font-medium">{query.trim()}</span>
              </span>
            </button>
          )}
          {isLoading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              <span>{t('common.loading')}</span>
            </div>
          )}
          {suggestions.map((s, i) => {
            const Icon = s.source === 'user' ? Users : ContactIcon
            const isActive = i === activeIdx
            return (
              <button
                key={s.key}
                type="button"
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => commitSuggestion(s)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 flex items-start gap-2 transition-colors',
                  isActive ? 'bg-primary/10' : 'hover:bg-muted/40',
                )}
              >
                <Icon
                  size={12}
                  className={cn('mt-0.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">{s.label}</div>
                  {s.secondary && (
                    <div className="text-[10px] text-muted-foreground truncate">{s.secondary}</div>
                  )}
                </div>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60 shrink-0 mt-0.5">
                  {s.source === 'user' ? t('common.user', 'Utilisateur') : t('common.contact', 'Contact')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {value.length >= maxRecipients && (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
          {t('common.max_recipients_reached', { count: maxRecipients, defaultValue: `Maximum ${maxRecipients} destinataires.` })}
        </p>
      )}
    </div>
  )
}
