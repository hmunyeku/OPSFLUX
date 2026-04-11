import React, { useRef, useState } from 'react'
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

export default function SecurityStep({ linkInfo, authenticated, loading, onSendOtp, onVerifyOtp }: SecurityStepProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const lang = getLang()

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
              <EuiButton onClick={onSendOtp} isLoading={loading}>
                {t('send_code')}
              </EuiButton>
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
                        />
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                </div>
                <EuiSpacer size="l" />
                <EuiButton type="submit" fill isLoading={loading} isDisabled={otpCode.length !== 6}>
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
