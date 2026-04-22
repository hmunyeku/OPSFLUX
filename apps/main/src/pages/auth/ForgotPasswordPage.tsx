/**
 * ForgotPasswordPage — Request a password reset link by email.
 *
 * POST /api/v1/auth/forgot-password with email → always shows success
 * message (security: no email enumeration).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import api from '@/lib/api'
import { ROUTES } from '@/lib/routes'

const inputClass = 'gl-form-input h-9'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setError('')
    setLoading(true)
    try {
      await api.post('/api/v1/auth/forgot-password', { email })
      setSent(true)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background-subtle p-4 overflow-hidden">
      {/* Mesh-gradient backdrop — same vocabulary as LoginPage for
          cross-auth coherence. Dims under prefers-reduced-motion. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-primary/30 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
        <div className="absolute -bottom-16 -right-16 h-96 w-96 rounded-full bg-highlight/25 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" style={{ animationDelay: '-4s' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl motion-safe:animate-[pulse_13s_ease-in-out_infinite]" style={{ animationDelay: '-7s' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo — gradient wordmark, consistent with LoginPage */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight font-display bg-gradient-to-br from-primary to-highlight bg-clip-text text-transparent">
            OpsFlux
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('app.tagline')}</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur-md p-6 shadow-xl shadow-primary/5">
          {/* Back link */}
          <Link
            to={ROUTES.login}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={12} />
            {t('auth.back_to_login')}
          </Link>

          {sent ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="mx-auto w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <h2 className="text-sm font-medium text-foreground mb-2">{t('auth.forgot_password_sent')}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {t('auth.forgot_password_sent_description')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('auth.forgot_password_link_expiry')}
              </p>
              <Link
                to={ROUTES.login}
                className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft size={12} />
                {t('auth.back_to_login')}
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="flex items-center gap-2 mb-4">
                <Mail size={16} className="text-primary" />
                <h2 className="text-sm font-medium text-foreground">
                  {t('auth.forgot_password_title')}
                </h2>
              </div>

              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                {t('auth.forgot_password_description')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                {error && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t('auth.email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className={inputClass}
                    placeholder="user@example.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="gl-button gl-button-confirm w-full h-9"
                >
                  {loading ? (
                    <Loader2 size={14} className="mx-auto animate-spin" />
                  ) : (
                    t('auth.forgot_password_send_button')
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
