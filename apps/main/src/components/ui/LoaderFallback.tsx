import { Loader2 } from 'lucide-react'

export function LoaderFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={16} className="animate-spin text-muted-foreground" />
    </div>
  )
}
