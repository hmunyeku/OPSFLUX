/**
 * Types pour l'authentification à deux facteurs (2FA)
 * Basés sur les modèles backend Python (Pydantic)
 */

export interface TwoFactorConfig {
  id: string
  user_id: string
  is_enabled: boolean
  primary_method: 'totp' | 'sms'
  totp_verified_at: string | null
  phone_number: string | null
  phone_verified_at: string | null
  backup_codes_count: number
  last_used_at: string | null
}

export interface TwoFactorSetup {
  totp_secret: string
  totp_uri: string
  qr_code_data_url: string
}

export interface TwoFactorVerify {
  code: string
}

export interface TwoFactorVerifyWithMethod {
  code: string
  method: 'totp' | 'sms' | 'backup'
}

export interface TwoFactorEnable {
  method: 'totp' | 'sms'
  phone_number?: string
  verification_code: string
}

export interface TwoFactorBackupCodes {
  codes: string[]
  generated_at: string
}

export interface TwoFactorEnableResponse {
  config: TwoFactorConfig
  backup_codes: TwoFactorBackupCodes
}

export interface SMSVerificationRequest {
  phone_number: string
  purpose: string
}

export interface TwoFactorResponse {
  message: string
  verified?: boolean
}
