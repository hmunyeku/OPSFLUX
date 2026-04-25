/**
 * Lightweight form validation helpers — pure functions, no dependency.
 *
 * Why not zod / react-hook-form: the validation rules we actually need
 * across OpsFlux forms (Tiers, Contacts, Addresses, etc.) are simple
 * enough that introducing a new schema library and a new form lib
 * would be more code than we save. The 4 helpers below cover ~95% of
 * the cases. Forms can compose them and surface the resulting errors
 * in their existing field render code.
 *
 * Pattern in form components:
 *   const errors = validateTierForm(form)
 *   if (Object.keys(errors).length > 0) {
 *     setFormErrors(errors)
 *     return
 *   }
 *   await mutation.mutateAsync(form)
 */

export type FormErrors<T extends string = string> = Partial<Record<T, string>>

// ── Generic field validators ────────────────────────────────────

/**
 * Returns an error message if the value is empty / whitespace-only.
 * Returns `undefined` if OK.
 */
export function required(value: unknown, label = 'Champ'): string | undefined {
  if (value == null) return `${label} requis`
  if (typeof value === 'string' && value.trim() === '') return `${label} requis`
  if (Array.isArray(value) && value.length === 0) return `${label} requis`
  return undefined
}

/**
 * Minimum length check on a trimmed string. Allows null/undefined to
 * pass (use `required` first if the field is mandatory).
 */
export function minLength(value: string | null | undefined, min: number, label = 'Champ'): string | undefined {
  if (value == null || value === '') return undefined
  if (value.trim().length < min) return `${label} doit contenir au moins ${min} caractères`
  return undefined
}

/**
 * Maximum length check.
 */
export function maxLength(value: string | null | undefined, max: number, label = 'Champ'): string | undefined {
  if (value == null) return undefined
  if (value.length > max) return `${label} ne peut excéder ${max} caractères`
  return undefined
}

/**
 * Loose-but-correct email regex. Allows null/empty values to pass —
 * combine with `required` if the field is mandatory.
 *
 * Why not the "perfect" regex: the perfect email regex is RFC-5321
 * and ~5kB long. The loose pattern below catches typos
 * (missing @, no domain, double dots, trailing space) and rejects
 * the vast majority of bad inputs. The server still validates.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function email(value: string | null | undefined, label = 'Email'): string | undefined {
  if (value == null || value === '') return undefined
  if (!EMAIL_RE.test(value.trim())) return `${label} invalide`
  return undefined
}

/**
 * Phone number sanity check: minimum 6 digits after stripping
 * spaces / dashes / dots / parentheses / leading +. International
 * formats vary too much to enforce a stricter pattern client-side.
 */
export function phone(value: string | null | undefined, label = 'Téléphone'): string | undefined {
  if (value == null || value === '') return undefined
  const digits = value.replace(/[\s.\-()+]/g, '')
  if (!/^\d+$/.test(digits)) return `${label} ne doit contenir que des chiffres et + - . ( ) espace`
  if (digits.length < 6) return `${label} trop court (minimum 6 chiffres)`
  if (digits.length > 20) return `${label} trop long (maximum 20 chiffres)`
  return undefined
}

/**
 * URL validator using the native URL constructor. Accepts http(s) only
 * to reject mailto:, javascript:, etc.
 */
export function url(value: string | null | undefined, label = 'URL'): string | undefined {
  if (value == null || value === '') return undefined
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${label} doit commencer par http:// ou https://`
    }
    return undefined
  } catch {
    return `${label} invalide`
  }
}

/**
 * Number range check.
 */
export function numberInRange(
  value: number | null | undefined,
  min: number | undefined,
  max: number | undefined,
  label = 'Valeur',
): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'number' || Number.isNaN(value)) return `${label} doit être un nombre`
  if (min != null && value < min) return `${label} doit être ≥ ${min}`
  if (max != null && value > max) return `${label} doit être ≤ ${max}`
  return undefined
}

// ── Domain-specific validators ──────────────────────────────────

interface TierFormShape {
  name?: string | null
  email?: string | null
  phone?: string | null
  fax?: string | null
  website?: string | null
  capital?: number | null
  vat_number?: string | null
  tax_id?: string | null
  zip_code?: string | null
}

/**
 * Validate the Tier create / update form. Returns an object with one
 * entry per failing field; an empty object means the form is valid.
 *
 * Rules:
 *   - name is required, 2..200 chars
 *   - email (optional) must be a valid format
 *   - phone, fax (optional) must look like a phone number
 *   - website (optional) must be a valid http(s) URL
 *   - capital (optional) must be ≥ 0
 */
export function validateTierForm(form: TierFormShape): FormErrors {
  const errors: FormErrors = {}

  const nameErr = required(form.name, 'Nom') || minLength(form.name, 2, 'Nom') || maxLength(form.name, 200, 'Nom')
  if (nameErr) errors.name = nameErr

  const emailErr = email(form.email)
  if (emailErr) errors.email = emailErr

  const phoneErr = phone(form.phone)
  if (phoneErr) errors.phone = phoneErr

  const faxErr = phone(form.fax, 'Fax')
  if (faxErr) errors.fax = faxErr

  const urlErr = url(form.website, 'Site web')
  if (urlErr) errors.website = urlErr

  const capitalErr = numberInRange(form.capital ?? undefined, 0, undefined, 'Capital')
  if (capitalErr) errors.capital = capitalErr

  return errors
}

interface TierContactFormShape {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

/**
 * Validate the TierContact create / update form.
 *
 * Rules:
 *   - first_name and last_name are required (2..100 chars)
 *   - email (optional) must be a valid format
 *   - phone (optional) must look like a phone number
 */
export function validateTierContactForm(form: TierContactFormShape): FormErrors {
  const errors: FormErrors = {}

  const firstErr = required(form.first_name, 'Prénom') || minLength(form.first_name, 2, 'Prénom') || maxLength(form.first_name, 100, 'Prénom')
  if (firstErr) errors.first_name = firstErr

  const lastErr = required(form.last_name, 'Nom') || minLength(form.last_name, 2, 'Nom') || maxLength(form.last_name, 100, 'Nom')
  if (lastErr) errors.last_name = lastErr

  const emailErr = email(form.email)
  if (emailErr) errors.email = emailErr

  const phoneErr = phone(form.phone)
  if (phoneErr) errors.phone = phoneErr

  return errors
}
