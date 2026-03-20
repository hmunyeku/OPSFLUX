/**
 * Login page — Pajamas-style: clean, no decorative elements.
 * 1px border card, no shadows, semantic color tokens.
 *
 * MFA flow:
 *   Step 1: email + password → submit
 *   Step 2: if MFA enabled, show 6-digit TOTP code input
 *
 * SSO flow:
 *   Detects configured providers → shows SSO buttons
 *   On click → redirects to OAuth2 provider
 *   On callback → receives tokens via URL params
 *
 * Password reset:
 *   "Mot de passe oublié ?" link → /forgot-password page
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, MFARequiredError } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react'
import api from '@/lib/api'

const inputClass = 'gl-form-input h-9'

// SSO provider icon components
const SSO_ICONS: Record<string, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  ),
  okta: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#007DC1" strokeWidth="2"/>
      <circle cx="12" cy="12" r="4" fill="#007DC1"/>
    </svg>
  ),
  keycloak: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#4D4D4D">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18z"/>
    </svg>
  ),
}

interface SSOProvider {
  id: string
  name: string
  icon: string
}

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, verifyMfa, clearMfa, mfaPending, fetchUser } = useAuthStore()

  // Step 1 state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 2 — MFA
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const mfaInputRef = useRef<HTMLInputElement>(null)

  // SSO state
  const [ssoProviders, setSsoProviders] = useState<SSOProvider[]>([])
  const [ssoLoading, setSsoLoading] = useState<string | null>(null)

  // ── Load SSO providers on mount ──────────────────────────
  useEffect(() => {
    api.get('/api/v1/auth/sso/providers')
      .then(res => setSsoProviders(res.data))
      .catch(() => {}) // Silently ignore if no providers
  }, [])

  // ── Handle SSO callback tokens from URL ──────────────────
  useEffect(() => {
    const ssoAccessToken = searchParams.get('sso_access_token')
    const ssoRefreshToken = searchParams.get('sso_refresh_token')
    const ssoError = searchParams.get('sso_error')

    if (ssoError) {
      const errorMessages: Record<string, string> = {
        invalid_state: t('auth.sso_error_invalid_state'),
        unknown_provider: t('auth.sso_error_unknown_provider'),
        provider_config: t('auth.sso_error_config'),
        token_exchange: t('auth.sso_error_token_exchange'),
        userinfo: t('auth.sso_error_userinfo'),
        no_email: t('auth.sso_error_no_email'),
        no_access_token: t('auth.sso_error_token_exchange'),
        account_inactive: t('auth.sso_error_inactive'),
      }
      setError(errorMessages[ssoError] || t('auth.sso_error_generic'))
      // Clean URL
      window.history.replaceState({}, '', '/login')
      return
    }

    if (ssoAccessToken && ssoRefreshToken) {
      // Store tokens and redirect
      localStorage.setItem('access_token', ssoAccessToken)
      localStorage.setItem('refresh_token', ssoRefreshToken)
      useAuthStore.setState({ isAuthenticated: true, mfaToken: null, mfaPending: false })
      fetchUser().then(() => navigate('/dashboard'))
      // Clean URL
      window.history.replaceState({}, '', '/login')
    }
  }, [searchParams, navigate, fetchUser])

  // Focus MFA input when step changes
  useEffect(() => {
    if (mfaPending && mfaInputRef.current) {
      mfaInputRef.current.focus()
    }
  }, [mfaPending])

  // ── Step 1: password submit ───────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof MFARequiredError) {
        // MFA step will show automatically via mfaPending state
        setError('')
      } else {
        setError(t('auth.invalid_credentials'))
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: MFA code submit ───────────────────────────
  const handleMfaSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const code = mfaCode.replace(/\s/g, '')
    if (!code) return
    setMfaError('')
    setMfaLoading(true)
    try {
      await verifyMfa(code)
      navigate('/dashboard')
    } catch {
      setMfaError(t('auth.invalid_mfa_code', 'Code invalide. Veuillez réessayer.'))
      setMfaCode('')
      mfaInputRef.current?.focus()
    } finally {
      setMfaLoading(false)
    }
  }, [mfaCode, verifyMfa, navigate, t])

  // ── Back to login (cancel MFA) ────────────────────────
  const handleBackToLogin = () => {
    clearMfa()
    setMfaCode('')
    setMfaError('')
  }

  // ── Format MFA code input (groups of 3) ───────────────
  const handleMfaCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 8) // allow up to 8 chars (backup codes are hex)
    setMfaCode(digits)
  }

  // ── SSO redirect ────────────────────────────────────────
  const handleSsoLogin = async (providerId: string) => {
    setSsoLoading(providerId)
    setError('')
    try {
      const res = await api.get('/api/v1/auth/sso/authorize', { params: { provider: providerId } })
      window.location.href = res.data.authorize_url
    } catch {
      setError(t('auth.sso_error_generic'))
      setSsoLoading(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-subtle p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-primary">OpsFlux</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('app.tagline')}</p>
        </div>

        {/* ── Step 1: Email + Password ── */}
        {!mfaPending && (
          <div className="rounded border border-border bg-card p-5">
            <h2 className="mb-5 text-sm font-medium text-foreground">{t('auth.login')}</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className={inputClass}
                  placeholder="user@perenco.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-foreground">{t('auth.password')}</label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                  >
                    {t('auth.forgot_password', 'Mot de passe oublié ?')}
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={cn(inputClass, 'pr-9')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="gl-button gl-button-confirm w-full h-9"
              >
                {loading ? <Loader2 size={14} className="mx-auto animate-spin" /> : t('auth.login_button')}
              </button>
            </form>

            {/* SSO section — only show if providers are configured */}
            {ssoProviders.length > 0 && (
              <>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">{t('common.or')}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-2">
                  {ssoProviders.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleSsoLogin(provider.id)}
                      disabled={ssoLoading === provider.id}
                      className="gl-button gl-button-default w-full h-9 flex items-center justify-center gap-2"
                    >
                      {ssoLoading === provider.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        SSO_ICONS[provider.icon] || null
                      )}
                      {t('auth.sso_continue_with', { provider: provider.name })}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 2: MFA Challenge ── */}
        {mfaPending && (
          <div className="rounded border border-border bg-card p-5">
            {/* Header with back button */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleBackToLogin}
                className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={14} />
              </button>
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <h2 className="text-sm font-medium text-foreground">
                  {t('auth.mfa_title')}
                </h2>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              {t('auth.mfa_description')}
            </p>

            <form onSubmit={handleMfaSubmit} className="space-y-3">
              {mfaError && (
                <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {mfaError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  {t('auth.mfa_code_label')}
                </label>
                <input
                  ref={mfaInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => handleMfaCodeChange(e.target.value)}
                  placeholder="000000"
                  maxLength={8}
                  className={cn(inputClass, 'text-center font-mono tracking-[0.3em] text-lg')}
                />
              </div>

              <button
                type="submit"
                disabled={mfaLoading || mfaCode.length < 6}
                className="gl-button gl-button-confirm w-full h-9"
              >
                {mfaLoading ? (
                  <Loader2 size={14} className="mx-auto animate-spin" />
                ) : (
                  t('auth.mfa_verify')
                )}
              </button>
            </form>

            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              {t('auth.mfa_backup_hint')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
