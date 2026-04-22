import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export function NameDialog({ title, defaultValue, onConfirm, onCancel }: {
  title: string
  defaultValue?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const handleSubmit = () => { const trimmed = value.trim(); if (trimmed) onConfirm(trimmed) }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-background border border-border rounded-lg shadow-xl p-4 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <input
          ref={inputRef}
          className="gl-form-input w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
          placeholder={t('common.name_ellipsis')}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="gl-button-sm gl-button-default">{t('common.cancel')}</button>
          <button onClick={handleSubmit} disabled={!value.trim()} className="gl-button-sm gl-button-confirm">{t('common.confirm')}</button>
        </div>
      </div>
    </div>
  )
}
