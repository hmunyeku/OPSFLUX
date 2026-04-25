import React, { useEffect, useRef, useState } from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiCode,
  EuiDescribedFormGroup,
  EuiFieldText,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui'
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

// Backend OTP TTL — kept in sync with the 10-minute window enforced in
// app/api/routes/modules/paxlog.py (otp_expires_at = now + 10 minutes).
// If the backend window changes this constant must follow.
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
  const lang = getLang()

  // ── OTP countdown state ──
  // We track the moment the user requested the OTP (otpSentAt) and a
  // tick-on-second `now` value to recompute the remaining seconds.
  // The backend OTP expires 10 minutes after send; we stop the verify
  // form once the countdown hits zero so the user can't waste time
  // entering a code that the API will reject anyway. A new send resets
  // the timer.
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
      // Clear any digits the user may have typed for a previous code
      // that's now obsolete.
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

  return (
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder hasShadow paddingSize="l">
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem>
              <EuiTitle size="s">
                <h3>{t('wizard_access_title')}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiText size="s" color="subdued">
                <p>{t('wizard_access_text')}</p>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiCode>{linkInfo?.ads_reference || '—'}</EuiCode>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <StatusBadge status={authenticated || !linkInfo?.otp_required ? 'approved' : 'pending_check'} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiFlexGrid columns={3}>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m">
              <EuiStat title={String(linkInfo?.remaining_uses ?? '—')} description={t('remaining_uses')} titleSize="s" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m">
              <EuiText size="s">
                <p><strong>{t('expires_at')}</strong></p>
                <p>{formatDateTime(linkInfo?.expires_at, lang)}</p>
              </EuiText>
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m">
              <EuiText size="s">
                <p><strong>{t('otp_destination')}</strong></p>
                <p>{linkInfo?.otp_destination_masked || '—'}</p>
              </EuiText>
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGrid>
      </EuiFlexItem>

      {authenticated ? (
        <EuiFlexItem grow={false}>
          <EuiCallOut title={t('authenticated')} color="success" iconType="check" />
        </EuiFlexItem>
      ) : !linkInfo?.otp_required ? (
        <EuiFlexItem grow={false}>
          <EuiCallOut title={t('otp_not_required')} color="success" iconType="checkInCircleFilled" />
        </EuiFlexItem>
      ) : (
        <EuiFlexItem grow={false}>
          <EuiCallOut title={t('otp_required')} color="warning" iconType="lock" />
        </EuiFlexItem>
      )}

      {linkInfo?.otp_required && !authenticated ? (
        <EuiFlexItem grow={false}>
          <EuiPanel hasBorder paddingSize="l">
            <EuiDescribedFormGroup
              title={<h4>{t('wizard_access_title')}</h4>}
              description={<p>{t('wizard_access_text')}</p>}
            >
              <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={handleSend} isLoading={loading}>
                    {otpSentAt == null ? t('send_code') : t('send_code')}
                  </EuiButton>
                </EuiFlexItem>
                {otpSentAt != null && remainingSeconds != null && !otpExpired && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow" iconType="clock">
                      {`${formatRemaining(remainingSeconds)} ${t('expires_at')}`}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {otpExpired && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="warning" iconType="alert">
                      {t('otp_required')}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              {sendError && (
                <>
                  <EuiSpacer size="s" />
                  <EuiCallOut size="s" color="danger" iconType="alert" title={sendError} />
                </>
              )}
              <EuiSpacer size="l" />
              <form onSubmit={handleSubmit}>
                <EuiText size="s">
                  <strong>{t('otp_code')}</strong>
                </EuiText>
                <EuiSpacer size="m" />
                <div onPaste={handlePaste}>
                  <EuiFlexGroup gutterSize="s" responsive={false} justifyContent="center">
                    {digits.map((digit, index) => (
                      <EuiFlexItem key={index} grow={false}>
                        <EuiFieldText
                          inputRef={(el) => { inputRefs.current[index] = el }}
                          value={digit}
                          onChange={(event) => handleDigitChange(index, event.target.value)}
                          onKeyDown={(event) => handleKeyDown(index, event)}
                          maxLength={1}
                          compressed={false}
                          style={{ width: 48, textAlign: 'center' }}
                          aria-label={`${t('otp_code')} ${index + 1}`}
                          disabled={otpExpired}
                        />
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                </div>
                <EuiSpacer size="l" />
                <EuiButton
                  type="submit"
                  fill
                  isLoading={loading}
                  isDisabled={otpCode.length !== 6 || otpExpired}
                >
                  {t('verify_code')}
                </EuiButton>
              </form>
            </EuiDescribedFormGroup>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      {loading ? (
        <EuiFlexItem grow={false}>
          <Spinner label={t('loading')} />
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  )
}
