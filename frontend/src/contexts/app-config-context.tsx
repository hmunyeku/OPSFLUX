"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface AppConfig {
  // Application Settings
  app_name: string
  app_logo?: string
  default_theme: string
  default_language: string
  font: string

  // Company Settings
  company_name?: string
  company_logo?: string
  company_tax_id?: string
  company_address?: string

  // 2FA & Security Settings
  auto_save_delay_seconds: number
  twofa_max_attempts: number
  twofa_sms_timeout_minutes: number
  twofa_sms_rate_limit: number
  sms_provider: string
  sms_provider_account_sid?: string
  sms_provider_auth_token?: string
  sms_provider_phone_number?: string

  // Email Settings
  email_host?: string
  email_port?: number
  email_username?: string
  email_password?: string
  email_from?: string
  email_from_name?: string
  email_use_tls?: boolean
  email_use_ssl?: boolean

  // Intranet Settings
  intranet_url?: string
}

interface AppConfigContextType {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => void
  resetConfig: () => void
  isLoaded: boolean
  refetch: () => Promise<void>
}

const defaultConfig: AppConfig = {
  app_name: "OpsFlux",
  default_theme: "amethyst-haze",
  default_language: "fr",
  font: "inter",
  auto_save_delay_seconds: 3,
  twofa_max_attempts: 3,
  twofa_sms_timeout_minutes: 10,
  twofa_sms_rate_limit: 5,
  sms_provider: "twilio",
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined)

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [isLoaded, setIsLoaded] = useState(false)

  // Fetch config from API
  const fetchConfig = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/settings/`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setConfig({
          app_name: data.app_name || defaultConfig.app_name,
          app_logo: data.app_logo,
          default_theme: data.default_theme || defaultConfig.default_theme,
          default_language: data.default_language || defaultConfig.default_language,
          font: data.font || defaultConfig.font,
          company_name: data.company_name,
          company_logo: data.company_logo,
          company_tax_id: data.company_tax_id,
          company_address: data.company_address,
          auto_save_delay_seconds: data.auto_save_delay_seconds || defaultConfig.auto_save_delay_seconds,
          twofa_max_attempts: data.twofa_max_attempts || defaultConfig.twofa_max_attempts,
          twofa_sms_timeout_minutes: data.twofa_sms_timeout_minutes || defaultConfig.twofa_sms_timeout_minutes,
          twofa_sms_rate_limit: data.twofa_sms_rate_limit || defaultConfig.twofa_sms_rate_limit,
          sms_provider: data.sms_provider || defaultConfig.sms_provider,
          sms_provider_account_sid: data.sms_provider_account_sid,
          sms_provider_auth_token: data.sms_provider_auth_token,
          sms_provider_phone_number: data.sms_provider_phone_number,
          email_host: data.email_host,
          email_port: data.email_port,
          email_username: data.email_username,
          email_password: data.email_password,
          email_from: data.email_from,
          email_from_name: data.email_from_name,
          email_use_tls: data.email_use_tls,
          email_use_ssl: data.email_use_ssl,
          intranet_url: data.intranet_url,
        })
      }
    } catch (_error) {
      // Failed to fetch app config - use default config
    } finally {
      setIsLoaded(true)
    }
  }

  // Load config from API on mount
  useEffect(() => {
    fetchConfig()
  }, [])

  // Update config locally (actual API update is done in the settings form)
  const updateConfig = (updates: Partial<AppConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...updates,
    }))
  }

  // Reset to default config
  const resetConfig = () => {
    setConfig(defaultConfig)
  }

  return (
    <AppConfigContext.Provider value={{ config, updateConfig, resetConfig, isLoaded, refetch: fetchConfig }}>
      {children}
    </AppConfigContext.Provider>
  )
}

export function useAppConfig() {
  const context = useContext(AppConfigContext)
  if (context === undefined) {
    throw new Error('useAppConfig must be used within an AppConfigProvider')
  }
  return context
}
