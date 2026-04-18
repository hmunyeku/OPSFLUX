import { useState } from 'react'
import {
  FormGrid, DynamicPanelField, panelInputClass,
} from '@/components/layout/DynamicPanel'

// ── Cron Schedule Builder (human-friendly) ──────────────────

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'biweekly', label: 'Toutes les 2 semaines' },
  { value: 'monthly', label: 'Chaque mois' },
]

const DAY_OPTIONS = [
  { value: '1', label: 'Lundi' },
  { value: '2', label: 'Mardi' },
  { value: '3', label: 'Mercredi' },
  { value: '4', label: 'Jeudi' },
  { value: '5', label: 'Vendredi' },
  { value: '6', label: 'Samedi' },
  { value: '0', label: 'Dimanche' },
]

function buildCron(freq: string, day: string, hour: string, minute: string): string {
  const h = hour || '6'
  const m = minute || '0'
  switch (freq) {
    case 'daily': return `${m} ${h} * * *`
    case 'weekly': return `${m} ${h} * * ${day || '1'}`
    case 'biweekly': return `${m} ${h} 1-7,15-21 * ${day || '1'}`
    case 'monthly': return `${m} ${h} ${day || '1'} * *`
    default: return `${m} ${h} * * *`
  }
}

function buildDescription(freq: string, day: string, hour: string, minute: string): string {
  const h = (hour || '6').padStart(2, '0')
  const m = (minute || '0').padStart(2, '0')
  const time = `${h}h${m}`
  const dayLabel = DAY_OPTIONS.find(d => d.value === day)?.label || 'Lundi'
  switch (freq) {
    case 'daily': return `Tous les jours à ${time}`
    case 'weekly': return `Chaque ${dayLabel.toLowerCase()} à ${time}`
    case 'biweekly': return `Un ${dayLabel.toLowerCase()} sur deux à ${time}`
    case 'monthly': return `Le ${day || '1'}e de chaque mois à ${time}`
    default: return `Récurrent à ${time}`
  }
}

export function CronScheduleBuilder({
  value,
  description,
  onChange,
}: {
  value: string | null | undefined
  description: string | null | undefined
  onChange: (cron: string | null, description: string | null) => void
}) {
  const [freq, setFreq] = useState('weekly')
  const [day, setDay] = useState('1')
  const [hour, setHour] = useState('6')
  const [minute, setMinute] = useState('0')

  const update = (f: string, d: string, h: string, m: string) => {
    const cron = buildCron(f, d, h, m)
    const desc = buildDescription(f, d, h, m)
    onChange(cron, desc)
  }

  return (
    <FormGrid>
      <DynamicPanelField label="Frequence">
        <select
          value={freq}
          onChange={(e) => { setFreq(e.target.value); update(e.target.value, day, hour, minute) }}
          className={panelInputClass}
        >
          {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </DynamicPanelField>

      {(freq === 'weekly' || freq === 'biweekly') && (
        <DynamicPanelField label="Jour">
          <select
            value={day}
            onChange={(e) => { setDay(e.target.value); update(freq, e.target.value, hour, minute) }}
            className={panelInputClass}
          >
            {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </DynamicPanelField>
      )}

      {freq === 'monthly' && (
        <DynamicPanelField label="Jour du mois">
          <select
            value={day}
            onChange={(e) => { setDay(e.target.value); update(freq, e.target.value, hour, minute) }}
            className={panelInputClass}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d)}>{d}</option>
            ))}
          </select>
        </DynamicPanelField>
      )}

      <DynamicPanelField label="Heure">
        <div className="flex items-center gap-1.5">
          <select
            value={hour}
            onChange={(e) => { setHour(e.target.value); update(freq, day, e.target.value, minute) }}
            className={panelInputClass}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={String(i)}>{String(i).padStart(2, '0')}</option>
            ))}
          </select>
          <span className="text-muted-foreground text-sm">:</span>
          <select
            value={minute}
            onChange={(e) => { setMinute(e.target.value); update(freq, day, hour, e.target.value) }}
            className={panelInputClass}
          >
            {[0, 15, 30, 45].map(m => (
              <option key={m} value={String(m)}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
      </DynamicPanelField>

      <DynamicPanelField label="Résumé" span="full">
        <p className="text-sm text-foreground font-medium py-1.5">
          {description || buildDescription(freq, day, hour, minute)}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
          CRON: {value || buildCron(freq, day, hour, minute)}
        </p>
      </DynamicPanelField>
    </FormGrid>
  )
}
