import React, { useEffect, useState } from 'react'
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react'
import { cn } from '../lib/utils'

export interface MessageData {
  text: string
  tone: 'success' | 'error' | 'warn' | 'subtle' | 'info'
}

interface MessageProps {
  message: MessageData | null
  onDismiss?: () => void
  autoHide?: boolean
  className?: string
}

const toneConfig = {
  success: {
    bg: 'bg-[var(--success-bg)]',
    border: 'border-[var(--success-border)]',
    text: 'text-[var(--success-text)]',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-[var(--error-bg)]',
    border: 'border-[var(--error-border)]',
    text: 'text-[var(--error-text)]',
    icon: XCircle,
  },
  warn: {
    bg: 'bg-[var(--warning-bg)]',
    border: 'border-[var(--warning-border)]',
    text: 'text-[var(--warning-text)]',
    icon: AlertTriangle,
  },
  subtle: {
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border)]',
    text: 'text-[var(--text-secondary)]',
    icon: Info,
  },
  info: {
    bg: 'bg-[var(--info-bg)]',
    border: 'border-[var(--info-border)]',
    text: 'text-[var(--info-text)]',
    icon: Info,
  },
}

export default function Message({ message, onDismiss, autoHide = false, className }: MessageProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (message) {
      setVisible(true)
      if (autoHide && (message.tone === 'success' || message.tone === 'subtle')) {
        const timer = setTimeout(() => {
          setVisible(false)
          setTimeout(() => onDismiss?.(), 300)
        }, 4000)
        return () => clearTimeout(timer)
      }
    } else {
      setVisible(false)
    }
  }, [message, autoHide, onDismiss])

  if (!message) return null

  const config = toneConfig[message.tone] || toneConfig.info
  const Icon = config.icon

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 px-4 py-3 rounded-xl border text-sm transition-all duration-300',
        config.bg,
        config.border,
        config.text,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
        className,
      )}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="flex-1 leading-relaxed">{message.text}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

/* Toast container for fixed-position notifications */
export function ToastContainer({ messages, onDismiss }: {
  messages: MessageData[]
  onDismiss: (index: number) => void
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {messages.map((msg, i) => (
        <div key={i} className="pointer-events-auto animate-toast-in">
          <Message message={msg} onDismiss={() => onDismiss(i)} autoHide />
        </div>
      ))}
    </div>
  )
}
