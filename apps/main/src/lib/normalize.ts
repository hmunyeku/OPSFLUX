/** Uppercase name fields before save */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeNames<T>(form: T): T {
  const nameFields = ['first_name', 'last_name', 'name', 'company_name']
  const result = { ...form } as any
  for (const key of nameFields) {
    if (typeof result[key] === 'string') {
      result[key] = (result[key] as string).toUpperCase()
    }
  }
  return result as T
}
