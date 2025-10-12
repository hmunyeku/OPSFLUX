import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Copy, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface BackupCodesDisplayProps {
  codes: string[]
  generatedAt: string
  onClose: () => void
}

export function BackupCodesDisplay({ codes, generatedAt, onClose }: BackupCodesDisplayProps) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const handleCopy = () => {
    const codesText = codes.join('\n')
    navigator.clipboard.writeText(codesText)
    setCopied(true)
    toast({
      title: 'Copied to clipboard',
      description: 'Backup codes have been copied to your clipboard',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const codesText = codes.join('\n')
    const blob = new Blob([codesText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `2fa-backup-codes-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({
      title: 'Downloaded',
      description: 'Backup codes have been downloaded',
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Save Your Backup Codes</h3>
        <p className="text-sm text-muted-foreground">
          Store these codes in a safe place. Each code can only be used once.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important!</AlertTitle>
        <AlertDescription>
          These codes won't be shown again. Save them now in a secure location.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Backup Codes</CardTitle>
          <CardDescription className="text-xs">
            Generated on {new Date(generatedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((code, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded bg-muted"
              >
                <span className="text-muted-foreground mr-2">{index + 1}.</span>
                <span className="flex-1 tracking-wider">{code}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCopy} className="flex-1">
          {copied ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy Codes
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleDownload} className="flex-1">
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={onClose}>I've Saved My Codes</Button>
      </div>
    </div>
  )
}
