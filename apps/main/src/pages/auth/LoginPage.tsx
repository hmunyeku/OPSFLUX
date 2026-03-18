/**
 * Login page — Pajamas-style: clean, no decorative elements.
 * 1px border card, no shadows, semantic color tokens.
 *
 * MFA flow:
 *   Step 1: email + password → submit
 *   Step 2: if MFA enabled, show 6-digit TOTP code input
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, MFARequiredError } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react'

const inputClass = 'gl-form-input h-9'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login, verifyMfa, clearMfa, mfaPending } = useAuthStore()

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
                <label className="mb-1 block text-xs font-medium text-foreground">{t('auth.password')}</label>
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

            {/* SSO divider */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button className="gl-button gl-button-default w-full h-9">
              {t('auth.login_sso')}
            </button>
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
                  Vérification en deux étapes
                </h2>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              Entrez le code à 6 chiffres de votre application d'authentification,
              ou un code de secours.
            </p>

            <form onSubmit={handleMfaSubmit} className="space-y-3">
              {mfaError && (
                <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {mfaError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Code de vérification
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
                  'Vérifier'
                )}
              </button>
            </form>

            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              Vous pouvez aussi utiliser un code de secours à 8 caractères.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
