/**
 * Forecast tab (capacity trends) — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import ReactECharts from 'echarts-for-react'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { useForecast } from '@/hooks/usePlanner'
import type { ForecastDay } from '@/types/api'
import {
  ACTIVITY_TYPE_LABELS_FALLBACK,
  PLANNER_ACTIVITY_TYPE_VALUES,
  buildDictionaryOptions,
} from '../shared'

export function ForecastTab() {
  const { t } = useTranslation()
  const [assetId, setAssetId] = useState('')
  const [horizon, setHorizon] = useState(90)
  const [typeFilter, setTypeFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const { data, isLoading } = useForecast(assetId || undefined, horizon, typeFilter || undefined, projectFilter || undefined)

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="text-xs text-muted-foreground mb-2">
        <TrendingUp size={12} className="inline mr-1 text-primary" />
        {t('planner.forecast.description')}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <AssetPicker value={assetId} onChange={v => setAssetId(v || '')} label="Site" />
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Horizon (jours)</label>
          <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} className={`${panelInputClass} text-xs`}>
            <option value={30}>30 jours</option>
            <option value={60}>60 jours</option>
            <option value={90}>90 jours</option>
            <option value={180}>6 mois</option>
            <option value={365}>1 an</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Type d'activité</label>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className={`${panelInputClass} text-xs`}
          >
            <option value="">{t('planner.filters.all_types')}</option>
            {activityTypeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 max-w-[200px]">
          <ProjectPicker
            value={projectFilter}
            onChange={id => setProjectFilter(id)}
            placeholder="Tous projets"
            clearable
          />
        </div>
      </div>

      {!assetId && (
        <div className="text-center py-8 text-xs text-muted-foreground italic">
          Sélectionnez un site pour voir les prévisions de capacité.
        </div>
      )}

      {isLoading && assetId && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className={cn('border rounded p-2 text-center', data.summary.at_risk_days > 0 ? 'border-orange-500/30 bg-orange-500/5' : '')}>
              <div className="text-[9px] uppercase text-muted-foreground">Jours à risque (&gt;80%)</div>
              <div className={cn('text-lg font-semibold tabular-nums', data.summary.at_risk_days > 0 && 'text-orange-600')}>{data.summary.at_risk_days}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Charge moy. projetée</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.avg_projected_load}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">{t('planner.forecast.avg_real_pob')}</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.avg_real_pob}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Pic de charge</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.peak_load}</div>
              {data.summary.peak_date && <div className="text-[9px] text-muted-foreground">{data.summary.peak_date}</div>}
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Capacité max</div>
              <div className="text-lg font-semibold tabular-nums">{data.summary.max_capacity}</div>
            </div>
          </div>

          {/* ── Cumulative trend chart (ECharts) ── */}
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-primary" /> {t('planner.forecast.cumulative_title')}
            </div>
            <ReactECharts
              style={{ height: 300, touchAction: 'pan-y' }}
              option={{
                tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: '#94a3b8' } } },
                legend: {
                  data: [t('planner.forecast.projected_load'), t('planner.forecast.real_pob'), t('planner.forecast.capacity_max')],
                  bottom: 0,
                  textStyle: { fontSize: 11 },
                  icon: 'roundRect',
                  itemWidth: 14,
                  itemHeight: 8,
                },
                grid: { left: 50, right: 20, top: 16, bottom: 70, containLabel: false },
                xAxis: {
                  type: 'category',
                  data: data.forecast.map((d: ForecastDay) => d.date),
                  axisLabel: {
                    fontSize: 10,
                    rotate: 0,
                    interval: Math.max(0, Math.floor(data.forecast.length / 8) - 1),
                    formatter: (value: string) => {
                      const d = new Date(value)
                      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
                    },
                  },
                  axisLine: { lineStyle: { color: '#cbd5e1' } },
                  boundaryGap: false,
                },
                yAxis: {
                  type: 'value',
                  axisLabel: { fontSize: 10 },
                  splitLine: { lineStyle: { opacity: 0.15 } },
                  axisLine: { show: false },
                  axisTick: { show: false },
                },
                series: [
                  {
                    name: t('planner.forecast.projected_load'),
                    type: 'line',
                    data: data.forecast.map((d: ForecastDay) => d.combined_load),
                    smooth: true,
                    lineStyle: { width: 2.5 },
                    areaStyle: { opacity: 0.12 },
                    itemStyle: { color: '#3b82f6' },
                    showSymbol: false,
                  },
                  {
                    name: t('planner.forecast.real_pob'),
                    type: 'line',
                    data: data.forecast.map((d: ForecastDay) => d.real_pob),
                    smooth: true,
                    lineStyle: { width: 1.75, type: 'dashed' },
                    itemStyle: { color: '#10b981' },
                    showSymbol: false,
                  },
                  {
                    name: t('planner.forecast.capacity_max'),
                    type: 'line',
                    data: data.forecast.map((d: ForecastDay) => d.max_capacity),
                    lineStyle: { width: 1.5, type: 'dotted', color: '#ef4444' },
                    itemStyle: { color: '#ef4444' },
                    showSymbol: false,
                  },
                ],
              }}
            />
          </div>

          {/* ── Calendar heatmap — saturation per day (custom React grid) ── */}
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <CalendarRange size={13} className="text-primary" /> Calendrier de saturation
            </div>
            {(() => {
              const monthCount = Math.max(1, Math.ceil(horizon / 30))
              const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
              const DAY_NAMES = ['Lu','Ma','Me','Je','Ve','Sa','Di']

              const dayMap = new Map<string, ForecastDay>()
              data.forecast.forEach((d: ForecastDay) => dayMap.set(d.date, d))

              const getSatColor = (pct: number): string => {
                if (pct <= 0) return '#f0fdf4'
                if (pct < 60) {
                  const t = pct / 60
                  const r = Math.round(220 + (250 - 220) * t)
                  const g = Math.round(252 + (204 - 252) * t)
                  const b = Math.round(231 + (21 - 231) * t)
                  return `rgb(${r},${g},${b})`
                }
                const t = (pct - 60) / 40
                const r = Math.round(250 + (239 - 250) * t)
                const g = Math.round(204 + (68 - 204) * t)
                const b = Math.round(21 + (68 - 21) * t)
                return `rgb(${r},${g},${b})`
              }

              const startDate = new Date(data.forecast[0]?.date || new Date())

              return (
                <div className="space-y-5">
                  {Array.from({ length: monthCount }, (_, mi) => {
                    const firstDay = new Date(startDate.getFullYear(), startDate.getMonth() + mi, 1)
                    const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate()

                    const rawDow = firstDay.getDay()
                    const startOffset = rawDow === 0 ? 6 : rawDow - 1

                    const cells: Array<{ date: string | null; day: number | null }> = []
                    for (let i = 0; i < startOffset; i++) cells.push({ date: null, day: null })
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      cells.push({ date: dateStr, day: d })
                    }

                    return (
                      <div key={mi}>
                        <div className="text-[11px] font-semibold text-foreground mb-1.5 tracking-wide uppercase">
                          {MONTH_NAMES[firstDay.getMonth()]} {firstDay.getFullYear()}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {DAY_NAMES.map(dn => (
                            <div key={dn} className="text-center text-[9px] text-muted-foreground font-medium py-0.5 select-none">
                              {dn}
                            </div>
                          ))}
                          {cells.map((cell, ci) => {
                            if (!cell.date || !cell.day) {
                              return <div key={ci} className="h-7 rounded" />
                            }
                            const fd = dayMap.get(cell.date)
                            const pct = fd && fd.max_capacity > 0
                              ? Math.round((fd.combined_load / fd.max_capacity) * 100)
                              : 0
                            const bg = getSatColor(pct)
                            const textColor = pct > 65 ? '#ffffff' : '#334155'
                            const title = fd
                              ? `${cell.date}\nCharge: ${fd.combined_load} / ${fd.max_capacity}\nSaturation: ${pct}%\nPOB réel: ${fd.real_pob}`
                              : cell.date
                            return (
                              <div
                                key={ci}
                                title={title}
                                className="h-7 flex items-center justify-center text-[10px] font-medium rounded cursor-default select-none transition-opacity hover:opacity-80"
                                style={{ backgroundColor: bg, color: textColor }}
                              >
                                {cell.day}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* Legend */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-muted-foreground shrink-0">0 %</span>
                    <div className="flex flex-1 max-w-[200px] h-3 rounded overflow-hidden gap-px">
                      {[0, 10, 20, 35, 50, 65, 80, 100].map(p => (
                        <div key={p} className="flex-1" style={{ backgroundColor: getSatColor(p) }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">100 %</span>
                    <span className="text-[10px] text-muted-foreground ml-2 shrink-0">— Saturation capacité</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
