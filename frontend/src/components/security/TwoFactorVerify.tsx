import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Shield, Smartphone, KeyRound } from 'lucide-react'
import { verify2FACode, sendSMSCode, verifySMSCode } from '@/services/twofa'
import { useToast } from '@/hooks/use-toast'

interface TwoFactorVerifyProps {
  phoneNumber?: string | null
  onSuccess: () => void
  onCancel?: () => void
}

type VerificationMethod = 'totp' | 'sms' | 'backup'

export function TwoFactorVerify({ phoneNumber, onSuccess, onCancel }: TwoFactorVerifyProps) {
  const [method, setMethod] = useState<VerificationMethod>('totp')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleSendSMS = async () => {
    if (!phoneNumber) return

    try {
      setSmsSending(true)
      setError(null)
      await sendSMSCode({
        phone_number: phoneNumber,
        purpose: '2fa_login',
      })
      setSmsSent(true)
      toast({
        title: 'SMS Sent',
        description: 'A verification code has been sent to your phone',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS')
      toast({
        variant: 'destructive',
        title: 'Failed to Send SMS',
        description: err instanceof Error ? err.message : 'An error occurred',
      })
    } finally {
      setSmsSending(false)
    }
  }

  const handleVerify = async () => {
    if (!code) {
      setError('Please enter a verification code')
      return
    }

    try {
      setLoading(true)
      setError(null)

      if (method === 'sms') {
        await verifySMSCode(code)
      } else {
        await verify2FACode({
          code,
          method,
        })
      }

      toast({
        title: 'Verification Successful',
        description: 'You have been authenticated',
      })

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code')
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: err instanceof Error ? err.message : 'Invalid verification code',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod as VerificationMethod)
    setCode('')
    setError(null)
    setSmsSent(false)
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">Two-Factor Authentication</h3>
        <p className="text-sm text-muted-foreground">
          Enter your verification code to continue
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={method} onValueChange={handleMethodChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="totp" className="gap-2">
            <Shield className="h-4 w-4" />
            App
          </TabsTrigger>
          <TabsTrigger value="sms" disabled={!phoneNumber} className="gap-2">
            <Smartphone className="h-4 w-4" />
            SMS
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2">
            <KeyRound className="h-4 w-4" />
            Backup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="totp" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="totp-code">Authenticator Code</Label>
            <Input
              id="totp-code"
              type="text"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              className="text-center text-2xl tracking-widest"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>
        </TabsContent>

        <TabsContent value="sms" className="space-y-4 mt-4">
          {!smsSent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We'll send a verification code to {phoneNumber}
              </p>
              <Button
                onClick={handleSendSMS}
                disabled={smsSending}
                className="w-full"
              >
                {smsSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send SMS Code
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="sms-code">SMS Code</Label>
              <Input
                id="sms-code"
                type="text"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter the code sent to your phone
              </p>
              <Button
                variant="link"
                onClick={handleSendSMS}
                disabled={smsSending}
                className="w-full"
                size="sm"
              >
                Resend Code
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="backup" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="backup-code">Backup Code</Label>
            <Input
              id="backup-code"
              type="text"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center text-xl tracking-wider font-mono"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Enter one of your backup codes
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          onClick={handleVerify}
          disabled={loading || !code || (method === 'sms' && !smsSent)}
          className={onCancel ? 'flex-1' : 'w-full'}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verify
        </Button>
      </div>
    </div>
  )
}
