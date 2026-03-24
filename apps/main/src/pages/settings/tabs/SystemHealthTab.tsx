/**
 * System Health tab — admin system health monitoring dashboard.
 *
 * API-backed:
 * - GET /api/health (public)
 * - GET /api/v1/admin/health (admin, detailed)
 */
import { useTranslation } from 'react-i18next'
import { Database, Server, HardDrive, Clock, MemoryStick, Loader2, RefreshCw, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface ServiceStatus {
  status: 'ok' | 'error'
  latency_ms?: number | null
  active_connections?: number | null
}

interface SystemHealthData {
  status: 'healthy' | 'degraded'
  database: ServiceStatus
  redis: ServiceStatus
  uptime_seconds: number
  memory_mb: number | null
  cpu_percent: number | null
  disk_usage_percent: number | null
  environment: string
  version: string
}

// ── API layer ─────────────────────────────────────────────────

async function fetchSystemHealth(): Promise<SystemHealthData> {
  const { data } = await api.get('/api/v1/admin/health')
  return data
}

function useSystemHealth() {
  return useQuery({
    queryKey: ['admin', 'health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

// ── Helpers ───────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}j ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// ── Status card component ─────────────────────────────────────

function StatusCard({
  icon: Icon,
  title,
  status,
  statusLabel,
  children,
}: {
  icon: LucideIcon
  title: string
  status: 'ok' | 'error' | 'unknown'
  statusLabel: string
  children?: React.ReactNode
}) {
  return (
    <div className="border border-border/60 rounded-lg bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
          status === 'ok' ? 'bg-green-100 dark:bg-green-900/30' : status === 'error' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-muted/50',
        )}>
          <Icon
            size={20}
            className={cn(
              status === 'ok' ? 'text-green-600 dark:text-green-400' : status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <span className={cn(
              'gl-badge text-[10px]',
              status === 'ok' ? 'gl-badge-success' : status === 'error' ? 'gl-badge-danger' : 'gl-badge-neutral',
            )}>
              {statusLabel}
            </span>
          </div>
          {children && <div className="mt-2 space-y-1">{children}</div>}
        </div>
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value ?? '—'}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function SystemHealthTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, dataUpdatedAt } = useSystemHealth()

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'health'] })
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <CollapsibleSection
      id="system-health"
      title={t('settings.system_health.title')}
      description={t('settings.system_health.description')}
      storageKey="settings.system-health.collapse"
      showSeparator={false}
    >
      {/* Header with refresh */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {data && (
            <span className={cn(
              'gl-badge',
              data.status === 'healthy' ? 'gl-badge-success' : 'gl-badge-danger',
            )}>
              {data.status === 'healthy' ? t('settings.system_health.healthy') : t('settings.system_health.degraded')}
            </span>
          )}
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {t('settings.system_health.last_check')}: {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          className="gl-button-sm gl-button-default flex items-center gap-1.5"
          onClick={handleRefresh}
        >
          <RefreshCw size={13} />
          {t('dashboard.refresh')}
        </button>
      </div>

      {/* Status cards grid */}
      {data && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Backend */}
          <StatusCard
            icon={Server}
            title={t('settings.system_health.backend')}
            status={data.status === 'healthy' ? 'ok' : 'error'}
            statusLabel={data.status === 'healthy' ? 'OK' : 'Degraded'}
          >
            <MetricRow label={t('settings.system_health.version')} value={`v${data.version}`} />
            <MetricRow label={t('settings.system_health.environment')} value={data.environment} />
          </StatusCard>

          {/* Database */}
          <StatusCard
            icon={Database}
            title={t('settings.system_health.database_label')}
            status={data.database.status}
            statusLabel={data.database.status === 'ok' ? 'OK' : 'Error'}
          >
            <MetricRow label={t('settings.system_health.latency')} value={data.database.latency_ms != null ? `${data.database.latency_ms} ms` : null} />
            <MetricRow label={t('settings.system_health.connections')} value={data.database.active_connections} />
            <MetricRow label="Taille" value={(data.database as any).size} />
            <MetricRow label="Tables" value={(data.database as any).table_count} />
          </StatusCard>

          {/* Redis */}
          <StatusCard
            icon={Wifi}
            title="Redis"
            status={data.redis.status}
            statusLabel={data.redis.status === 'ok' ? 'OK' : 'Error'}
          >
            <MetricRow label={t('settings.system_health.latency')} value={data.redis.latency_ms != null ? `${data.redis.latency_ms} ms` : null} />
            <MetricRow label="Mémoire" value={(data.redis as any).memory} />
            <MetricRow label="Clés" value={(data.redis as any).keys} />
          </StatusCard>

          {/* Uptime */}
          <StatusCard
            icon={Clock}
            title={t('settings.system_health.uptime')}
            status="ok"
            statusLabel={formatUptime(data.uptime_seconds)}
          >
            <MetricRow label={t('settings.system_health.uptime_raw')} value={`${data.uptime_seconds}s`} />
          </StatusCard>

          {/* Memory */}
          <StatusCard
            icon={MemoryStick}
            title={t('settings.system_health.memory')}
            status={data.memory_mb != null && data.memory_mb < 1024 ? 'ok' : data.memory_mb != null ? 'error' : 'unknown'}
            statusLabel={data.memory_mb != null ? `${data.memory_mb} MB` : '—'}
          >
            <MetricRow label="CPU" value={data.cpu_percent != null ? `${data.cpu_percent}%` : null} />
          </StatusCard>

          {/* Disk */}
          <StatusCard
            icon={HardDrive}
            title={t('settings.system_health.disk')}
            status={data.disk_usage_percent != null && data.disk_usage_percent < 90 ? 'ok' : data.disk_usage_percent != null ? 'error' : 'unknown'}
            statusLabel={data.disk_usage_percent != null ? `${data.disk_usage_percent}%` : '—'}
          >
            <MetricRow label={t('settings.system_health.disk_usage')} value={data.disk_usage_percent != null ? `${data.disk_usage_percent}%` : null} />
          </StatusCard>
        </div>
      )}

      {/* Top tables */}
      {data?.database && (data.database as any).top_tables?.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Tables les plus volumineuses</h4>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase border-b border-border">
              <span>Table</span><span>Taille</span><span>Lignes</span>
            </div>
            {((data.database as any).top_tables as any[]).map((t: any) => (
              <div key={t.name} className="grid grid-cols-3 gap-2 px-3 py-1.5 text-xs border-b border-border/30 last:border-0">
                <span className="font-mono text-foreground">{t.name}</span>
                <span className="text-muted-foreground">{t.size}</span>
                <span className="text-muted-foreground tabular-nums">{t.rows?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runtime info */}
      {data && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Python</p>
            <p className="text-sm font-bold">{(data as any).python_version || '—'}</p>
          </div>
          <div className="border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase">OS</p>
            <p className="text-sm font-bold">{(data as any).os || '—'}</p>
          </div>
          <div className="border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Utilisateurs</p>
            <p className="text-sm font-bold">{(data as any).users?.active ?? '—'} / {(data as any).users?.total ?? '—'}</p>
          </div>
          <div className="border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Environnement</p>
            <p className="text-sm font-bold capitalize">{data.environment}</p>
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}
