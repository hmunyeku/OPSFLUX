/**
 * Service API pour l'authentification à deux facteurs (2FA)
 * Gère toutes les opérations 2FA (TOTP, SMS, backup codes)
 */

import type {
  TwoFactorBackupCodes,
  TwoFactorConfig,
  TwoFactorEnable,
  TwoFactorEnableResponse,
  TwoFactorResponse,
  TwoFactorSetup,
  TwoFactorVerifyWithMethod,
  SMSVerificationRequest,
} from '@/types/twofa'

const API_BASE = import.meta.env.VITE_API_URL || ''
const API_V1 = `${API_BASE}/api/v1`

/**
 * Get user's 2FA configuration
 */
export async function get2FAConfig(): Promise<TwoFactorConfig> {
  const response = await fetch(`${API_V1}/2fa/config`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch 2FA configuration')
  }

  return response.json()
}

/**
 * Setup TOTP (generate QR code)
 */
export async function setupTOTP(): Promise<TwoFactorSetup> {
  const response = await fetch(`${API_V1}/2fa/setup-totp`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to setup TOTP')
  }

  return response.json()
}

/**
 * Enable 2FA after verification
 * Returns config + backup codes (shown only once)
 */
export async function enable2FA(data: TwoFactorEnable): Promise<TwoFactorEnableResponse> {
  const response = await fetch(`${API_V1}/2fa/enable`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to enable 2FA')
  }

  return response.json()
}

/**
 * Disable 2FA
 */
export async function disable2FA(): Promise<{ message: string }> {
  const response = await fetch(`${API_V1}/2fa/disable`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to disable 2FA')
  }

  return response.json()
}

/**
 * Verify 2FA code (TOTP, SMS, or backup)
 */
export async function verify2FACode(data: TwoFactorVerifyWithMethod): Promise<TwoFactorResponse> {
  const response = await fetch(`${API_V1}/2fa/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Invalid 2FA code')
  }

  return response.json()
}

/**
 * Regenerate backup codes
 */
export async function regenerateBackupCodes(): Promise<TwoFactorBackupCodes> {
  const response = await fetch(`${API_V1}/2fa/regenerate-backup-codes`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to regenerate backup codes')
  }

  return response.json()
}

/**
 * Send SMS verification code
 */
export async function sendSMSCode(data: SMSVerificationRequest): Promise<{ message: string }> {
  const response = await fetch(`${API_V1}/2fa/send-sms`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to send SMS code')
  }

  return response.json()
}

/**
 * Verify SMS code
 */
export async function verifySMSCode(code: string): Promise<TwoFactorResponse> {
  const response = await fetch(`${API_V1}/2fa/verify-sms`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Invalid SMS code')
  }

  return response.json()
}
