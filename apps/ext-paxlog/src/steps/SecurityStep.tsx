import React, { useState } from 'react'
import { Shield, Send, KeyRound, Clock, Hash, Mail } from 'lucide-react'
import { t, getLang } from '../lib/i18n'
import { formatDateTime } from '../lib/utils'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'

interface SecurityStepProps {
  linkInfo: any
  authenticated: boolean
  loading: boolean
  onSendOtp: () => Promise<void>
  onVerifyOtp: (code: string) => Promise<void>
}

export default function SecurityStep({ linkInfo, authenticated, loading, onSendOtp, onVerifyOtp }: SecurityStepProps) {
  const [otpCode, setOtpCode] = useState('')
  const lang = getLang()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode.trim()) return
    onVerifyOtp(otpCode.trim())
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center shrink-0">
            <Hash className="w-4 h-4 text-brand-500" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-tertiary)]">{t('remaining_uses')}</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{linkInfo?.remaining_uses ?? '\u2014'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-brand-500" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-tertiary)]">{t('expires_at')}</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{formatDateTime(linkInfo?.expires_at, lang)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-brand-500" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-tertiary)]">{t('otp_destination')}</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{linkInfo?.otp_destination_masked || '\u2014'}</p>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <StatusBadge status={authenticated ? 'approved' : (linkInfo?.otp_required ? 'pending_check' : 'compliant')} />
        <span className="text-sm text-[var(--text-secondary)]">
          {authenticated ? t('authenticated') : (linkInfo?.otp_required ? t('otp_required') : t('otp_not_required'))}
        </span>
      </div>

      {/* OTP Form */}
      {linkInfo?.otp_required && !authenticated && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('wizard_access_title')}</h4>
              <p className="text-xs text-[var(--text-tertiary)]">{t('wizard_access_text')}</p>
            </div>
          </div>

          {/* Send OTP button */}
          <button
            onClick={onSendOtp}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
            {t('send_code')}
          </button>

          {/* Verify OTP form */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('otp_code')}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all font-mono text-center tracking-[0.3em] text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !otpCode.trim()}
              className="self-end px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Spinner size="sm" /> : <KeyRound className="w-4 h-4" />}
              {t('verify_code')}
            </button>
          </form>
        </div>
      )}

      {/* Already authenticated or no OTP required */}
      {(authenticated || !linkInfo?.otp_required) && (
        <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-xl p-5 flex items-center gap-3">
          <Shield className="w-5 h-5 text-[var(--success-text)]" />
          <p className="text-sm text-[var(--success-text)]">
            {authenticated ? t('authenticated') : t('otp_not_required')}
          </p>
        </div>
      )}
    </div>
  )
}
