import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Shield, Smartphone } from 'lucide-react'
import { setupTOTP, enable2FA, sendSMSCode } from '@/services/twofa'
import type { TwoFactorSetup, TwoFactorBackupCodes } from '@/types/twofa'
import { useToast } from '@/hooks/use-toast'

interface TwoFactorSetupProps {
  onSuccess: (backupCodes: TwoFactorBackupCodes) => void
  onCancel: () => void
}

type SetupMethod = 'totp' | 'sms'

export function TwoFactorSetup({ onSuccess, onCancel }: TwoFactorSetupProps) {
  const [method, setMethod] = useState<SetupMethod>('totp')
  const [step, setStep] = useState<'method' | 'setup' | 'verify'>('method')
  const [totpData, setTotpData] = useState<TwoFactorSetup | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleMethodSelect = async (selectedMethod: SetupMethod) => {
    setMethod(selectedMethod)
    setStep('setup')

    if (selectedMethod === 'totp') {
      await initiateTOTPSetup()
    }
  }

  const initiateTOTPSetup = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await setupTOTP()
      setTotpData(data)
      setStep('verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup TOTP')
      toast({
        variant: 'destructive',
        title: 'Setup Failed',
        description: err instanceof Error ? err.message : 'Failed to setup TOTP',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSendSMS = async () => {
    if (!phoneNumber) {
      setError('Please enter a phone number')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await sendSMSCode({
        phone_number: phoneNumber,
        purpose: '2fa_setup',
      })
      setStep('verify')
      toast({
        title: 'SMS Sent',
        description: 'A verification code has been sent to your phone',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS')
      toast({
        variant: 'destructive',
        title: 'Failed to Send SMS',
        description: err instanceof Error ? err.message : 'Failed to send SMS',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode) {
      setError('Please enter the verification code')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await enable2FA({
        method,
        phone_number: method === 'sms' ? phoneNumber : undefined,
        verification_code: verificationCode,
      })

      toast({
        title: '2FA Enabled',
        description: 'Two-factor authentication has been successfully enabled',
      })

      onSuccess(response.backup_codes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable 2FA')
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: err instanceof Error ? err.message : 'Invalid verification code',
      })
    } finally {
      setLoading(false)
    }
  }

  if (step === 'method') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">Enable Two-Factor Authentication</h3>
          <p className="text-sm text-muted-foreground">
            Choose your preferred authentication method
          </p>
        </div>

        <div className="grid gap-4">
          <Card
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => handleMethodSelect('totp')}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Authenticator App (Recommended)</CardTitle>
                  <CardDescription className="text-xs">
                    Use Google Authenticator, Authy, or similar apps
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => handleMethodSelect('sms')}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">SMS Verification</CardTitle>
                  <CardDescription className="text-xs">
                    Receive codes via text message
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'setup' && method === 'sms') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">Setup SMS Authentication</h3>
          <p className="text-sm text-muted-foreground">
            Enter your phone number to receive verification codes
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="+1234567890"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Include country code (e.g., +1 for US)
          </p>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setStep('method')}>
            Back
          </Button>
          <Button onClick={handleSendSMS} disabled={loading || !phoneNumber}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Verification Code
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'verify') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">
            {method === 'totp' ? 'Scan QR Code' : 'Enter Verification Code'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {method === 'totp'
              ? 'Scan this QR code with your authenticator app'
              : 'Enter the code sent to your phone'
            }
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {method === 'totp' && totpData && (
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img
                src={totpData.qr_code_data_url}
                alt="TOTP QR Code"
                className="w-48 h-48"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Manual Entry Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={totpData.totp_secret}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(totpData.totp_secret)
                    toast({ title: 'Copied to clipboard' })
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this key if you can't scan the QR code
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="verificationCode">Verification Code</Label>
          <Input
            id="verificationCode"
            type="text"
            placeholder="000000"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            maxLength={6}
            className="text-center text-2xl tracking-widest"
          />
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleEnable2FA} disabled={loading || !verificationCode}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enable 2FA
          </Button>
        </div>
      </div>
    )
  }

  return null
}
