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

export interface FormValidationCopy {
  required: (label: string) => string
  minLength: (label: string, min: number) => string
  maxLength: (label: string, max: number) => string
  invalid: (label: string) => string
  phoneCharacters: (label: string) => string
  phoneMin: (label: string, min: number) => string
  phoneMax: (label: string, max: number) => string
  urlProtocol: (label: string) => string
  number: (label: string) => string
  minValue: (label: string, min: number) => string
  maxValue: (label: string, max: number) => string
}

export type FormValidationCopyInput = Partial<FormValidationCopy>

const defaultCopy: FormValidationCopy = {
  required: (label) => `${label} requis`,
  minLength: (label, min) => `${label} doit contenir au moins ${min} caractères`,
  maxLength: (label, max) => `${label} ne peut excéder ${max} caractères`,
  invalid: (label) => `${label} invalide`,
  phoneCharacters: (label) => `${label} ne doit contenir que des chiffres et + - . ( ) espace`,
  phoneMin: (label, min) => `${label} trop court (minimum ${min} chiffres)`,
  phoneMax: (label, max) => `${label} trop long (maximum ${max} chiffres)`,
  urlProtocol: (label) => `${label} doit commencer par http:// ou https://`,
  number: (label) => `${label} doit être un nombre`,
  minValue: (label, min) => `${label} doit être ≥ ${min}`,
  maxValue: (label, max) => `${label} doit être ≤ ${max}`,
}

function copyOf(copy?: FormValidationCopyInput): FormValidationCopy {
  return copy ? { ...defaultCopy, ...copy } : defaultCopy
}

export function makeFormValidationCopy(t: (key: string, options?: Record<string, unknown>) => string): FormValidationCopyInput {
  return {
    required: (label) => t('validation.required', { label }),
    minLength: (label, min) => t('validation.min_length', { label, min }),
    maxLength: (label, max) => t('validation.max_length', { label, max }),
    invalid: (label) => t('validation.invalid', { label }),
    phoneCharacters: (label) => t('validation.phone_characters', { label }),
    phoneMin: (label, min) => t('validation.phone_min', { label, min }),
    phoneMax: (label, max) => t('validation.phone_max', { label, max }),
    urlProtocol: (label) => t('validation.url_protocol', { label }),
    number: (label) => t('validation.number', { label }),
    minValue: (label, min) => t('validation.min_value', { label, min }),
    maxValue: (label, max) => t('validation.max_value', { label, max }),
  }
}

// ── Generic field validators ────────────────────────────────────

/**
 * Returns an error message if the value is empty / whitespace-only.
 * Returns `undefined` if OK.
 */
export function required(value: unknown, label = 'Champ', copy?: FormValidationCopyInput): string | undefined {
  const c = copyOf(copy)
  if (value == null) return c.required(label)
  if (typeof value === 'string' && value.trim() === '') return c.required(label)
  if (Array.isArray(value) && value.length === 0) return c.required(label)
  return undefined
}

/**
 * Minimum length check on a trimmed string. Allows null/undefined to
 * pass (use `required` first if the field is mandatory).
 */
export function minLength(value: string | null | undefined, min: number, label = 'Champ', copy?: FormValidationCopyInput): string | undefined {
  if (value == null || value === '') return undefined
  if (value.trim().length < min) return copyOf(copy).minLength(label, min)
  return undefined
}

/**
 * Maximum length check.
 */
export function maxLength(value: string | null | undefined, max: number, label = 'Champ', copy?: FormValidationCopyInput): string | undefined {
  if (value == null) return undefined
  if (value.length > max) return copyOf(copy).maxLength(label, max)
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

export function email(value: string | null | undefined, label = 'Email', copy?: FormValidationCopyInput): string | undefined {
  if (value == null || value === '') return undefined
  if (!EMAIL_RE.test(value.trim())) return copyOf(copy).invalid(label)
  return undefined
}

/**
 * Phone number sanity check: minimum 6 digits after stripping
 * spaces / dashes / dots / parentheses / leading +. International
 * formats vary too much to enforce a stricter pattern client-side.
 */
export function phone(value: string | null | undefined, label = 'Téléphone', copy?: FormValidationCopyInput): string | undefined {
  if (value == null || value === '') return undefined
  const digits = value.replace(/[\s.\-()+]/g, '')
  const c = copyOf(copy)
  if (!/^\d+$/.test(digits)) return c.phoneCharacters(label)
  if (digits.length < 6) return c.phoneMin(label, 6)
  if (digits.length > 20) return c.phoneMax(label, 20)
  return undefined
}

/**
 * URL validator using the native URL constructor. Accepts http(s) only
 * to reject mailto:, javascript:, etc.
 */
export function url(value: string | null | undefined, label = 'URL', copy?: FormValidationCopyInput): string | undefined {
  if (value == null || value === '') return undefined
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return copyOf(copy).urlProtocol(label)
    }
    return undefined
  } catch {
    return copyOf(copy).invalid(label)
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
  copy?: FormValidationCopyInput,
): string | undefined {
  if (value == null) return undefined
  const c = copyOf(copy)
  if (typeof value !== 'number' || Number.isNaN(value)) return c.number(label)
  if (min != null && value < min) return c.minValue(label, min)
  if (max != null && value > max) return c.maxValue(label, max)
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

type TierFormField = 'name' | 'email' | 'phone' | 'fax' | 'website' | 'capital'

interface TierFormValidationOptions {
  labels?: Partial<Record<TierFormField, string>>
  copy?: FormValidationCopyInput
}

function fieldLabel<T extends string>(labels: Partial<Record<T, string>> | undefined, field: T, fallback: string): string {
  return labels?.[field] ?? fallback
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
export function validateTierForm(form: TierFormShape, options: TierFormValidationOptions = {}): FormErrors {
  const errors: FormErrors = {}
  const { labels, copy } = options

  const nameLabel = fieldLabel(labels, 'name', 'Nom')
  const nameErr = required(form.name, nameLabel, copy) || minLength(form.name, 2, nameLabel, copy) || maxLength(form.name, 200, nameLabel, copy)
  if (nameErr) errors.name = nameErr

  const emailErr = email(form.email, fieldLabel(labels, 'email', 'Email'), copy)
  if (emailErr) errors.email = emailErr

  const phoneErr = phone(form.phone, fieldLabel(labels, 'phone', 'Téléphone'), copy)
  if (phoneErr) errors.phone = phoneErr

  const faxErr = phone(form.fax, fieldLabel(labels, 'fax', 'Fax'), copy)
  if (faxErr) errors.fax = faxErr

  const urlErr = url(form.website, fieldLabel(labels, 'website', 'Site web'), copy)
  if (urlErr) errors.website = urlErr

  const capitalErr = numberInRange(form.capital ?? undefined, 0, undefined, fieldLabel(labels, 'capital', 'Capital'), copy)
  if (capitalErr) errors.capital = capitalErr

  return errors
}

interface TierContactFormShape {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

type TierContactFormField = 'first_name' | 'last_name' | 'email' | 'phone'

interface TierContactFormValidationOptions {
  labels?: Partial<Record<TierContactFormField, string>>
  copy?: FormValidationCopyInput
}

/**
 * Validate the TierContact create / update form.
 *
 * Rules:
 *   - first_name and last_name are required (2..100 chars)
 *   - email (optional) must be a valid format
 *   - phone (optional) must look like a phone number
 */
export function validateTierContactForm(form: TierContactFormShape, options: TierContactFormValidationOptions = {}): FormErrors {
  const errors: FormErrors = {}
  const { labels, copy } = options

  const firstNameLabel = fieldLabel(labels, 'first_name', 'Prénom')
  const firstErr = required(form.first_name, firstNameLabel, copy) || minLength(form.first_name, 2, firstNameLabel, copy) || maxLength(form.first_name, 100, firstNameLabel, copy)
  if (firstErr) errors.first_name = firstErr

  const lastNameLabel = fieldLabel(labels, 'last_name', 'Nom')
  const lastErr = required(form.last_name, lastNameLabel, copy) || minLength(form.last_name, 2, lastNameLabel, copy) || maxLength(form.last_name, 100, lastNameLabel, copy)
  if (lastErr) errors.last_name = lastErr

  const emailErr = email(form.email, fieldLabel(labels, 'email', 'Email'), copy)
  if (emailErr) errors.email = emailErr

  const phoneErr = phone(form.phone, fieldLabel(labels, 'phone', 'Téléphone'), copy)
  if (phoneErr) errors.phone = phoneErr

  return errors
}
