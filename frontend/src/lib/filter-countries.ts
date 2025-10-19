/**
 * Types and utilities for filtering country/region data
 */

export interface CountryRegion {
  countryName: string
  countryShortCode: string
  regions: Array<{
    name: string
    shortCode: string
  }>
}

/**
 * Filter countries based on various criteria
 * @param data - Raw country region data
 * @param whitelist - List of country codes to include (if empty, include all)
 * @param blacklist - List of country codes to exclude
 * @param labelFilters - Additional label filters
 * @returns Filtered array of countries
 */
export function filterCountries(
  data: CountryRegion[],
  whitelist: string[] = [],
  blacklist: string[] = [],
  labelFilters: string[] = []
): CountryRegion[] {
  let filtered = [...data]

  // Apply whitelist filter
  if (whitelist.length > 0) {
    filtered = filtered.filter((country) =>
      whitelist.includes(country.countryShortCode)
    )
  }

  // Apply blacklist filter
  if (blacklist.length > 0) {
    filtered = filtered.filter(
      (country) => !blacklist.includes(country.countryShortCode)
    )
  }

  // Apply label filters if needed
  if (labelFilters.length > 0) {
    filtered = filtered.filter((country) =>
      labelFilters.some((filter) =>
        country.countryName.toLowerCase().includes(filter.toLowerCase())
      )
    )
  }

  return filtered
}
