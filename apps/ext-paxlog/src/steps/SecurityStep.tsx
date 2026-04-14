import React, { useEffect, useRef, useState } from 'react'
import { EuiButton, EuiCallOut, EuiLoadingSpinner } from '@elastic/eui'
import { t } from '../lib/i18n'

interface SecurityStepProps {
  linkInfo: any
  authenticated: boolean
  loading: boolean
  onSendOtp: () => Promise<void>
  onVerifyOtp: (code: string) => Promise<void>
}

const OTP_TTL_SECONDS = 600

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(safe / 60)).padStart(2, '0')
  const ss = String(safe % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function SecurityStep({ linkInfo, authenticated, loading, onSendOtp, onVerifyOtp }: SecurityStepProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    if (otpSentAt == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [otpSentAt])

  const remainingSeconds = otpSentAt == null
    ? null
    : OTP_TTL_SECONDS - Math.floor((now - otpSentAt) / 1000)
  const otpExpired = remainingSeconds != null && remainingSeconds <= 0

  const handleSend = async () => {
    setSendError(null)
    try {
      await onSendOtp()
      setOtpSentAt(Date.now())
      setDigits(['', '', '', '', '', ''])
    } catch (err: any) {
      setSendError(String(err?.message || err) || t('otp_required'))
    }
  }

  const otpCode = digits.join('')

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (event: React.ClipboardEvent) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const nextDigits = [...digits]
    for (let i = 0; i < 6; i += 1) {
      nextDigits[i] = pasted[i] || ''
    }
    setDigits(nextDigits)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (otpCode.length !== 6) return
    onVerifyOtp(otpCode)
  }

  // ── Already authenticated ──
  if (authenticated) {
    return (
      <div className="flex items-center gap-3 py-4 px-4 rounded-lg bg-green-50 border border-green-200 animate-fade-in">
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#017d73" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm font-medium text-green-800">{t('authenticated')}</p>
      </div>
    )
  }

  // ── OTP not required ──
  if (!linkInfo?.otp_required) {
    return (
      <div className="flex items-center gap-3 py-4 px-4 rounded-lg bg-green-50 border border-green-200 animate-fade-in">
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#017d73" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm font-medium text-green-800">{t('otp_not_required')}</p>
      </div>
    )
  }

  // ── OTP flow ──
  return (
    <div className="flex justify-center animate-fade-in-up">
      <div className="section-card w-full max-w-md">
        {/* Icon + Instruction — inline */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0077cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">
            {t('otp_enter_code')} <span className="font-medium text-gray-800">{linkInfo?.otp_destination_masked || '***'}</span>
          </p>
        </div>

        {/* Send / Resend button */}
        {otpSentAt == null ? (
          <div className="flex justify-center mb-6">
            <EuiButton onClick={handleSend} isLoading={loading}>
              {t('send_code')}
            </EuiButton>
          </div>
        ) : (
          <>
            {/* Timer or expired */}
            <div className="flex justify-center mb-4">
              {otpExpired ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-amber-600 font-medium">{t('otp_expired_resend')}</span>
                  <button type="button" onClick={handleSend} className="text-sm text-blue-600 hover:text-blue-800 font-medium underline">
                    {t('resend_code')}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-500 tabular-nums">
                  {formatRemaining(remainingSeconds!)} {t('otp_timer_remaining')}
                </span>
              )}
            </div>

            {/* 6-digit input */}
            <form onSubmit={handleSubmit}>
              <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    maxLength={1}
                    className="otp-digit-input"
                    aria-label={`${t('otp_code')} ${index + 1}`}
                    disabled={otpExpired}
                  />
                ))}
              </div>

              <div className="flex justify-center">
                <EuiButton
                  type="submit"
                  fill
                  isLoading={loading}
                  isDisabled={otpCode.length !== 6 || otpExpired}
                >
                  {t('verify_code')}
                </EuiButton>
              </div>
            </form>
          </>
        )}

        {sendError && (
          <div className="mt-4">
            <EuiCallOut size="s" color="danger" iconType="alert" title={sendError} />
          </div>
        )}

        {loading && (
          <div className="flex justify-center mt-4">
            <EuiLoadingSpinner size="m" />
          </div>
        )}
      </div>
    </div>
  )
}
