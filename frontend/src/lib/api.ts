/**
 * API client for FastAPI backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'

// Debug: Log API URL (will be removed after debugging)
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('[API] Using API URL:', API_URL)
  // eslint-disable-next-line no-console
  console.log('[API] NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL)
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface Token2FARequired {
  requires_2fa: boolean
  temp_token: string
  available_methods: string[]
  masked_phone?: string
}

export interface TwoFactorLoginRequest {
  temp_token: string
  code: string
  method: string
}

export type LoginResponse = TokenResponse | Token2FARequired

export function is2FARequired(response: LoginResponse): response is Token2FARequired {
  return 'requires_2fa' in response && response.requires_2fa === true
}

export interface User {
  id: string
  email: string
  is_active: boolean
  is_superuser: boolean
  full_name?: string
  first_name?: string
  last_name?: string
  initials?: string
  recovery_email?: string
  avatar_url?: string
  phone_numbers?: string[]
  intranet_identifier?: string
}

export interface UserUpdate {
  full_name?: string
  first_name?: string
  last_name?: string
  initials?: string
  email?: string
  recovery_email?: string
  avatar_url?: string | null
  phone_numbers?: string[]
  intranet_identifier?: string
}

export interface PasswordPolicy {
  min_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_digit: boolean
  require_special: boolean
  special_chars: string
}

export interface UpdatePassword {
  current_password: string
  new_password: string
}

export interface AppSettings {
  id: string
  app_name: string
  app_logo?: string | null
  default_theme: string
  default_language: string
  font: string
  company_name?: string | null
  company_logo?: string | null
  company_tax_id?: string | null
  company_address?: string | null
  // Paramètres UI
  auto_save_delay_seconds: number
  // Paramètres de sécurité 2FA
  twofa_max_attempts: number
  twofa_sms_timeout_minutes: number
  twofa_sms_rate_limit: number
  // Configuration SMS Provider
  sms_provider: string
  sms_provider_account_sid?: string | null
  sms_provider_auth_token?: string | null
  sms_provider_phone_number?: string | null
}

export interface AppSettingsUpdate {
  app_name?: string
  app_logo?: string | null
  default_theme?: string
  default_language?: string
  font?: string
  company_name?: string | null
  company_logo?: string | null
  company_tax_id?: string | null
  company_address?: string | null
  // Paramètres de sécurité 2FA
  twofa_max_attempts?: number
  twofa_sms_timeout_minutes?: number
  twofa_sms_rate_limit?: number
  // Configuration SMS Provider
  sms_provider?: string
  sms_provider_account_sid?: string | null
  sms_provider_auth_token?: string | null
  sms_provider_phone_number?: string | null
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(response.status, error.detail || 'Request failed')
  }

  return response.json()
}

export const api = {
  /**
   * Login with email and password
   * Returns either a token or a 2FA requirement
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const formData = new URLSearchParams()
    formData.append('username', credentials.username)
    formData.append('password', credentials.password)

    const response = await fetch(`${API_URL}/api/v1/login/access-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }))
      throw new ApiError(response.status, error.detail || 'Invalid credentials')
    }

    return response.json()
  },

  /**
   * Verify 2FA code and complete login
   */
  async verify2FA(request: TwoFactorLoginRequest): Promise<TokenResponse> {
    return fetchApi('/api/v1/login/verify-2fa', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  /**
   * Get current user profile
   */
  async getMe(token: string): Promise<User> {
    return fetchApi('/api/v1/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },

  /**
   * Test login credentials
   */
  async testToken(token: string): Promise<boolean> {
    try {
      await this.getMe(token)
      return true
    } catch {
      return false
    }
  },

  /**
   * Update current user profile
   */
  async updateMe(token: string, data: UserUpdate): Promise<User> {
    return fetchApi('/api/v1/users/me', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
  },

  /**
   * Get password policy
   */
  async getPasswordPolicy(): Promise<PasswordPolicy> {
    return fetchApi('/api/v1/security/password-policy')
  },

  /**
   * Update current user password
   */
  async updatePassword(token: string, data: UpdatePassword): Promise<{ message: string }> {
    return fetchApi('/api/v1/users/me/password', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
  },

  /**
   * Get application settings
   */
  async getAppSettings(): Promise<AppSettings> {
    return fetchApi('/api/v1/settings/')
  },

  /**
   * Update application settings (superuser only)
   */
  async updateAppSettings(token: string, data: AppSettingsUpdate): Promise<AppSettings> {
    return fetchApi('/api/v1/settings/', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
  },

  /**
   * Generic fetch method with token
   */
  async fetch<T>(endpoint: string, options: RequestInit = {}, token?: string): Promise<T> {
    return fetchApi(endpoint, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  },
}
