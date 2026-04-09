import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(value: string | null | undefined, lang: string): string {
  if (!value) return '\u2014'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')
}

export function objectFromFormData(formData: FormData): Record<string, string | null> {
  const payload: Record<string, string | null> = {}
  for (const [key, value] of formData.entries()) {
    const normalized = value.toString().trim()
    payload[key] = normalized === '' ? null : normalized
  }
  return payload
}

export function sessionStorageKey(token: string): string {
  return `opsflux-ext-paxlog-session:${token}`
}
