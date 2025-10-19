/**
 * Utility function to notify submitted form values
 * This is a helper for development/debugging purposes
 */
export function nofitySubmittedValues(data: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.log("Form submitted with values:", data)
  }
}
