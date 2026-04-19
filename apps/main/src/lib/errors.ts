/**
 * Client-side decoder for structured backend errors.
 *
 * Backend `StructuredHTTPException` responds with:
 *   { detail: { code: 'PROJECT_NOT_FOUND', message: '...', params: {...} } }
 *
 * This module exposes `describeError(err, t)` that returns a user-facing
 * message resolved (in order):
 *   1. i18n key `errors.<code_lowercased>` if registered
 *   2. backend `detail.message` (English fallback the API author wrote)
 *   3. generic error message from `err.message`
 *
 * Use it in catch blocks / mutation onError handlers:
 *
 *     const { t } = useTranslation()
 *     try {
 *       await api.post(...)
 *     } catch (err) {
 *       toast.error(describeError(err, t))
 *     }
 */

import type { AxiosError } from 'axios'
import type { TFunction } from 'i18next'

interface StructuredDetail {
  code?: string
  message?: string
  params?: Record<string, unknown>
}

function asDetail(err: unknown): StructuredDetail | string | undefined {
  const ax = err as AxiosError<{ detail?: StructuredDetail | string }>
  return ax?.response?.data?.detail
}

/** Describe a backend error for display, preferring i18n over raw text. */
export function describeError(err: unknown, t?: TFunction): string {
  const detail = asDetail(err)

  // Structured — try i18n first.
  if (detail && typeof detail === 'object' && detail.code) {
    if (t) {
      const key = `errors.${detail.code.toLowerCase()}`
      const translated = t(key, { ...(detail.params ?? {}), defaultValue: '' })
      if (translated) return translated
    }
    if (detail.message) return detail.message
  }

  // Legacy string detail — return as-is.
  if (typeof detail === 'string' && detail) return detail

  // Axios/network error.
  const ax = err as AxiosError
  if (ax?.message) return ax.message

  return 'Une erreur est survenue'
}

/** Return the machine-readable code, or null if the error is unstructured. */
export function errorCode(err: unknown): string | null {
  const detail = asDetail(err)
  if (detail && typeof detail === 'object' && detail.code) return detail.code
  return null
}
