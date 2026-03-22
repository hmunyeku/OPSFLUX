/**
 * Country flag utilities — convert ISO 3166-1 alpha-2 codes to emoji flags.
 *
 * Uses Unicode Regional Indicator Symbols: each letter A-Z maps to
 * U+1F1E6..U+1F1FF. Two regional indicators form a flag emoji.
 *
 * NOTE: On Windows, emoji flags don't render. Use <CountryFlag /> component
 * (flag-icons CSS) for cross-platform flag display.
 */

const REGIONAL_A = 0x1F1E6
const CHAR_A = 'A'.codePointAt(0)!

/**
 * Convert a 2-letter ISO country code to its emoji flag.
 * Returns empty string for invalid codes.
 *
 * @example isoToFlag('FR') // '🇫🇷'
 * @example isoToFlag('US') // '🇺🇸'
 */
export function isoToFlag(iso: string): string {
  if (!iso || iso.length !== 2) return ''
  const upper = iso.toUpperCase()
  const a = upper.codePointAt(0)! - CHAR_A
  const b = upper.codePointAt(1)! - CHAR_A
  if (a < 0 || a > 25 || b < 0 || b > 25) return ''
  return String.fromCodePoint(REGIONAL_A + a, REGIONAL_A + b)
}

/**
 * Format a country code as "🇫🇷 FR" or just the flag.
 */
export function formatCountryCode(iso: string, showCode = false): string {
  const flag = isoToFlag(iso)
  if (!flag) return iso
  return showCode ? `${flag} ${iso.toUpperCase()}` : flag
}

/**
 * Validate that a string is a plausible ISO 3166-1 alpha-2 country code.
 */
export function isValidIso2(iso: string): boolean {
  if (!iso || iso.length !== 2) return false
  const upper = iso.toUpperCase()
  return /^[A-Z]{2}$/.test(upper)
}
