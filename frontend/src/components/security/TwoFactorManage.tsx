import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Shield, Smartphone, KeyRound, ShieldOff, Loader2 } from 'lucide-react'
import { disable2FA, regenerateBackupCodes } from '@/services/twofa'
import type { TwoFactorConfig } from '@/types/twofa'
import { useToast } from '@/hooks/use-toast'
import { BackupCodesDisplay } from './BackupCodesDisplay'

interface TwoFactorManageProps {
  config: TwoFactorConfig
  onDisabled: () => void
  onConfigUpdate: () => void
}

export function TwoFactorManage({ config, onDisabled, onConfigUpdate }: TwoFactorManageProps) {
  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [backupCodesGeneratedAt, setBackupCodesGeneratedAt] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleDisable2FA = async () => {
    try {
      setLoading(true)
      setError(null)
      await disable2FA()
      toast({
        title: '2FA Disabled',
        description: 'Two-factor authentication has been disabled',
      })
      setShowDisableDialog(false)
      onDisabled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA')
      toast({
        variant: 'destructive',
        title: 'Failed to Disable 2FA',
        description: err instanceof Error ? err.message : 'An error occurred',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateBackupCodes = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await regenerateBackupCodes()
      setBackupCodes(data.codes)
      setBackupCodesGeneratedAt(data.generated_at)
      setShowBackupCodes(true)
      toast({
        title: 'Backup Codes Regenerated',
        description: 'New backup codes have been generated',
      })
      onConfigUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate backup codes')
      toast({
        variant: 'destructive',
        title: 'Failed to Regenerate Codes',
        description: err instanceof Error ? err.message : 'An error occurred',
      })
    } finally {
      setLoading(false)
    }
  }

  if (showBackupCodes) {
    return (
      <BackupCodesDisplay
        codes={backupCodes}
        generatedAt={backupCodesGeneratedAt}
        onClose={() => setShowBackupCodes(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">Two-Factor Authentication</h3>
          <p className="text-sm text-muted-foreground">
            Your account is protected with 2FA
          </p>
        </div>
        <Badge variant="default" className="gap-1">
          <Shield className="h-3 w-3" />
          Enabled
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {config.primary_method === 'totp' ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">
                {config.primary_method === 'totp' ? 'Authenticator App' : 'SMS Verification'}
              </CardTitle>
              <CardDescription className="text-xs">
                {config.primary_method === 'totp'
                  ? 'Using TOTP authentication'
                  : `Codes sent to ${config.phone_number}`
                }
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {config.totp_verified_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">TOTP Verified:</span>
                <span>{new Date(config.totp_verified_at).toLocaleDateString()}</span>
              </div>
            )}
            {config.phone_verified_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone Verified:</span>
                <span>{new Date(config.phone_verified_at).toLocaleDateString()}</span>
              </div>
            )}
            {config.last_used_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Used:</span>
                <span>{new Date(config.last_used_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Backup Codes</CardTitle>
              <CardDescription className="text-xs">
                {config.backup_codes_count} backup codes remaining
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleRegenerateBackupCodes}
            disabled={loading}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Regenerate Backup Codes
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Use backup codes if you lose access to your primary method
          </p>
        </CardContent>
      </Card>

      <div className="pt-4 border-t">
        <Button
          variant="destructive"
          onClick={() => setShowDisableDialog(true)}
          className="w-full gap-2"
        >
          <ShieldOff className="h-4 w-4" />
          Disable Two-Factor Authentication
        </Button>
      </div>

      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make your account less secure. You'll need to re-enable 2FA to regain this
              protection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable2FA}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
