/**
 * AdminerTab — Embedded Adminer database management in an iframe.
 *
 * Only visible to admin.system users. Adminer runs in a separate container
 * and is accessed via internal Docker network proxy.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, ExternalLink, Loader2, AlertTriangle } from 'lucide-react'
import api from '@/lib/api'

export function AdminerTab() {
  const [loaded, setLoaded] = useState(false)

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['adminer-config'],
    queryFn: () => api.get('/api/v1/admin/adminer-config').then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <AlertTriangle size={24} className="text-amber-500" />
        <p className="text-sm font-medium">Accès refusé</p>
        <p className="text-xs">Vous n'avez pas les droits d'accès à la base de données.</p>
      </div>
    )
  }

  // Build Adminer URL with auto-login params
  const apiBase = import.meta.env.VITE_API_URL || window.location.origin.replace('app.', 'api.')
  const adminerUrl = `${apiBase.replace('/api', '').replace('api.', 'api.')}/adminer/?pgsql=${config?.server || 'db'}&username=${config?.username || 'postgres'}&db=${config?.database || 'opsflux'}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Base de données</h3>
          <span className="text-[10px] text-muted-foreground">PostgreSQL · {config?.database}</span>
        </div>
        <a
          href={adminerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
        >
          <ExternalLink size={11} />
          Ouvrir dans un nouvel onglet
        </a>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card" style={{ height: 'calc(100vh - 200px)' }}>
        {!loaded && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          src={adminerUrl}
          className="w-full h-full border-0"
          onLoad={() => setLoaded(true)}
          title="Adminer — Base de données"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </div>
  )
}
