import React, { useState, useRef, useCallback } from 'react'
import { Shield, Send, KeyRound, Clock, Hash, Mail, CheckCircle2, Lock } from 'lucide-react'
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
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const lang = getLang()

  const otpCode = digits.join('')

  const handleDigitChange = useCallback((index: number, value: string) => {
    // Only accept digits
    const digit = value.replace(/\D/g, '').slice(-1)
    setDigits(prev => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    // Auto-focus next box
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }, [])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }, [digits])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const newDigits = [...digits]
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || ''
    }
    setDigits(newDigits)
    // Focus last filled or next empty
    const focusIndex = Math.min(pasted.length, 5)
    inputRefs.current[focusIndex]?.focus()
  }, [digits])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = digits.join('')
    if (code.length !== 6) return
    onVerifyOtp(code)
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── Hero boarding-pass header ── */}
      <div className="ext-card overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-blue-200 text-[11px] font-semibold uppercase tracking-widest">{t('dossier')}</p>
                <h3 className="text-white text-lg font-bold mono">{linkInfo?.ads_reference || '\u2014'}</h3>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-blue-200 text-[11px] font-semibold uppercase tracking-widest">{t('company')}</p>
              <p className="text-white text-sm font-semibold">{linkInfo?.company_name || '\u2014'}</p>
            </div>
          </div>
        </div>
        {linkInfo?.site_name && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-xs text-blue-700 font-medium">{linkInfo.site_name}</p>
          </div>
        )}
      </div>

      {/* ── Info chips ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
        <div className="ext-card flex items-center gap-3 p-4">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Hash className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{t('remaining_uses')}</p>
            <p className="text-sm font-bold text-slate-900 mono">{linkInfo?.remaining_uses ?? '\u2014'}</p>
          </div>
        </div>
        <div className="ext-card flex items-center gap-3 p-4">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{t('expires_at')}</p>
            <p className="text-sm font-bold text-slate-900">{formatDateTime(linkInfo?.expires_at, lang)}</p>
          </div>
        </div>
        <div className="ext-card flex items-center gap-3 p-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{t('otp_destination')}</p>
            <p className="text-sm font-bold text-slate-900 truncate">{linkInfo?.otp_destination_masked || '\u2014'}</p>
          </div>
        </div>
      </div>

      {/* ── Status banner ── */}
      {authenticated ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 flex items-center gap-4 animate-fade-in-up">
          <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-800">{t('authenticated')}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{t('otp_not_required')}</p>
          </div>
          <StatusBadge status="approved" className="ml-auto" />
        </div>
      ) : !linkInfo?.otp_required ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 flex items-center gap-4 animate-fade-in-up">
          <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-800">{t('otp_not_required')}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{t('authenticated')}</p>
          </div>
          <StatusBadge status="approved" className="ml-auto" />
        </div>
      ) : (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">{t('otp_required')}</p>
            <p className="text-xs text-amber-600">{t('wizard_access_text')}</p>
          </div>
          <StatusBadge status="pending_check" className="ml-auto" />
        </div>
      )}

      {/* ── OTP Form ── */}
      {linkInfo?.otp_required && !authenticated && (
        <div className="ext-card animate-fade-in-up">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">{t('wizard_access_title')}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{t('wizard_access_text')}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Send OTP button */}
            <button
              onClick={onSendOtp}
              disabled={loading}
              className="ext-btn-primary w-full sm:w-auto disabled:opacity-50"
            >
              {loading ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
              {t('send_code')}
            </button>

            {/* 6-digit OTP input boxes */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="ext-label text-center block mb-4">{t('otp_code')}</label>
                <div className="flex items-center justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
                  {digits.map((digit, i) => (
                    <React.Fragment key={i}>
                      {i === 3 && (
                        <div className="w-3 flex items-center justify-center">
                          <div className="w-2 h-0.5 bg-slate-300 rounded-full" />
                        </div>
                      )}
                      <input
                        ref={el => { inputRefs.current[i] = el }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl border-2 border-slate-200 bg-white text-center text-xl sm:text-2xl font-bold text-slate-900 mono
                                   focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10
                                   transition-all duration-150 placeholder:text-slate-200"
                        placeholder="\u2022"
                        aria-label={`${t('otp_code')} ${i + 1}`}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="ext-btn-primary w-full disabled:opacity-50"
              >
                {loading ? <Spinner size="sm" /> : <KeyRound className="w-4 h-4" />}
                {t('verify_code')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
