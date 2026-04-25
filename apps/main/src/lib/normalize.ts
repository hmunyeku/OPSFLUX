/**
 * Normalise name-like fields before save:
 *   - trim whitespace
 *   - collapse multiple internal spaces to one
 *   - preserve case as entered (do NOT force UPPERCASE — destroys legitimate
 *     casing like "François", "McDonald", "ACME Corp.", etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeNames<T>(form: T): T {
  const nameFields = ['first_name', 'last_name', 'name', 'company_name', 'trade_name', 'alias']
  const result = { ...form } as any
  for (const key of nameFields) {
    if (typeof result[key] === 'string') {
      result[key] = (result[key] as string).trim().replace(/\s+/g, ' ')
    }
  }
  return result as T
}
