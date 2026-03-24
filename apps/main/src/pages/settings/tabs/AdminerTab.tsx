/**
 * AdminerTab — Database management info panel.
 *
 * Shows database connection info and link to Adminer.
 * Adminer runs in a separate container — admin configures access via Dokploy/Traefik.
 * Only visible to admin.system users.
 */
import { useQuery } from '@tanstack/react-query'
import { Database, ExternalLink, Loader2, AlertTriangle, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

export function AdminerTab() {
  const { toast } = useToast()
  const [copied, setCopied] = useState<string | null>(null)

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['adminer-config'],
    queryFn: () => api.get('/api/v1/admin/adminer-config').then(r => r.data),
  })

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    toast({ title: `${label} copié`, variant: 'success' })
    setTimeout(() => setCopied(null), 2000)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
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

  const dbInfo = [
    { label: 'Moteur', value: 'PostgreSQL 16 + pgvector + PostGIS' },
    { label: 'Base', value: config?.database || 'opsflux' },
    { label: 'Driver', value: config?.driver || 'pgsql' },
    { label: 'Hôte interne', value: 'db (réseau Docker)' },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Database size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Base de données</h3>
      </div>

      {/* Connection info */}
      <div className="border border-border rounded-lg divide-y divide-border">
        {dbInfo.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground font-mono">{value}</span>
              <button
                onClick={() => copyToClipboard(value, label)}
                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
              >
                {copied === label ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Adminer access */}
      <div className="border border-border rounded-lg p-4 bg-muted/20">
        <h4 className="text-xs font-semibold text-foreground mb-2">Adminer (interface visuelle)</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Adminer est disponible en tant que service Docker interne. Pour y accéder depuis le navigateur,
          configurez un sous-domaine (ex: db.opsflux.io) dans Dokploy pointant vers le container <code className="text-primary">adminer</code> sur le port <code className="text-primary">8080</code>.
        </p>
        <div className="flex items-center gap-2">
          <a
            href={`https://db.${window.location.hostname.replace('app.', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
          >
            <ExternalLink size={11} />
            Ouvrir Adminer
          </a>
          <span className="text-[10px] text-muted-foreground">(nécessite configuration Traefik)</span>
        </div>
      </div>

      {/* Quick SQL tips */}
      <div className="border border-border rounded-lg p-4">
        <h4 className="text-xs font-semibold text-foreground mb-2">Requêtes utiles</h4>
        <div className="space-y-2">
          {[
            { label: 'Nombre d\'utilisateurs', sql: 'SELECT count(*) FROM users WHERE active = true;' },
            { label: 'Taille de la base', sql: "SELECT pg_size_pretty(pg_database_size('opsflux'));" },
            { label: 'Tables les plus volumineuses', sql: "SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text)) FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(tablename::text) DESC LIMIT 10;" },
          ].map(({ label, sql }) => (
            <div key={label} className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0 w-40">{label}</span>
              <code className="flex-1 text-[10px] font-mono bg-muted px-2 py-1 rounded truncate">{sql}</code>
              <button onClick={() => copyToClipboard(sql, label)} className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                {copied === label ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
