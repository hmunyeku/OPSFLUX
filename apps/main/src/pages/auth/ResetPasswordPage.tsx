/**
 * ResetPasswordPage — Set a new password using a valid reset token.
 *
 * URL: /reset-password?token=xxx
 * POST /api/v1/auth/reset-password with { token, new_password }
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, ArrowLeft, Eye, EyeOff, CheckCircle, KeyRound, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { ROUTES } from '@/lib/routes'

const inputClass = 'gl-form-input h-9'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const passwordValid = password.length >= 8
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordValid || !passwordsMatch || !token) return

    setError('')
    setLoading(true)
    try {
      await api.post('/api/v1/auth/reset-password', { token, new_password: password })
      setSuccess(true)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      const detail = axiosErr.response?.data?.detail || ''
      if (detail.includes('expired') || detail.includes('Invalid')) {
        setError(t('auth.reset_password_invalid_link'))
      } else if (detail.includes('8 characters')) {
        setError(t('auth.reset_password_min_chars'))
      } else {
        setError(t('common.error'))
      }
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center bg-background-subtle p-4 overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
          <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-primary/30 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
          <div className="absolute -bottom-16 -right-16 h-96 w-96 rounded-full bg-highlight/25 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" style={{ animationDelay: '-4s' }} />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold tracking-tight font-display bg-gradient-to-br from-primary to-highlight bg-clip-text text-transparent">OpsFlux</h1>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur-md p-6 shadow-xl shadow-primary/5 text-center">
            <AlertTriangle size={24} className="mx-auto text-amber-500 mb-3" />
            <h2 className="text-sm font-medium text-foreground mb-2">{t('auth.reset_password_invalid_link')}</h2>
            <p className="text-xs text-muted-foreground mb-4">
              {t('auth.reset_password_invalid_link')}
            </p>
            <Link
              to={ROUTES.forgotPassword}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {t('auth.forgot_password_send_button')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background-subtle p-4 overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-primary/30 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
        <div className="absolute -bottom-16 -right-16 h-96 w-96 rounded-full bg-highlight/25 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" style={{ animationDelay: '-4s' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl motion-safe:animate-[pulse_13s_ease-in-out_infinite]" style={{ animationDelay: '-7s' }} />
      </div>
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight font-display bg-gradient-to-br from-primary to-highlight bg-clip-text text-transparent">OpsFlux</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('app.tagline')}</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur-md p-6 shadow-xl shadow-primary/5">
          {success ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="mx-auto w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <h2 className="text-sm font-medium text-foreground mb-2">
                {t('auth.reset_password_success')}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {t('auth.reset_password_success_description')}
              </p>
              <Link
                to={ROUTES.login}
                className="gl-button gl-button-confirm inline-flex items-center gap-1.5 h-9 px-4"
              >
                <ArrowLeft size={12} />
                {t('auth.login_button')}
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <Link
                to={ROUTES.login}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <ArrowLeft size={12} />
                {t('auth.back_to_login')}
              </Link>

              <div className="flex items-center gap-2 mb-4">
                <KeyRound size={16} className="text-primary" />
                <h2 className="text-sm font-medium text-foreground">
                  {t('auth.reset_password_title')}
                </h2>
              </div>

              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                {t('auth.reset_password_description')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                {error && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t('auth.reset_password_title')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      minLength={8}
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
                  {password && !passwordValid && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      {t('auth.reset_password_min_chars')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t('auth.reset_password_confirm')}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={inputClass}
                  />
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      {t('auth.reset_password_mismatch')}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !passwordValid || !passwordsMatch}
                  className="gl-button gl-button-confirm w-full h-9"
                >
                  {loading ? (
                    <Loader2 size={14} className="mx-auto animate-spin" />
                  ) : (
                    t('auth.reset_password')
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
