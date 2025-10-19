/**
 * Authentication token management utilities
 * Handles localStorage-based token persistence for client-side authentication
 */

const TOKEN_KEY = 'auth_token'

export const auth = {
  /**
   * Get the current authentication token from localStorage
   * @returns The stored token or null if not found
   */
  getToken(): string | null {
    if (typeof window === 'undefined') {
      return null
    }
    return localStorage.getItem(TOKEN_KEY)
  },

  /**
   * Store an authentication token in localStorage
   * @param token - The token to store
   */
  setToken(token: string): void {
    if (typeof window === 'undefined') {
      return
    }
    localStorage.setItem(TOKEN_KEY, token)
  },

  /**
   * Remove the authentication token from localStorage
   */
  removeToken(): void {
    if (typeof window === 'undefined') {
      return
    }
    localStorage.removeItem(TOKEN_KEY)
  },
}
