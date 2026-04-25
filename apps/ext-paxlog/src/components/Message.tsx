import React from 'react'
import { EuiCallOut } from '@elastic/eui'

export interface MessageData {
  text: string
  tone: 'success' | 'error' | 'warn' | 'subtle' | 'info'
}

interface MessageProps {
  message: MessageData | null
  onDismiss?: () => void
  autoHide?: boolean
  marginBottom?: number
}

function toneToColor(tone: MessageData['tone']): 'success' | 'danger' | 'warning' | 'primary' {
  switch (tone) {
    case 'success':
      return 'success'
    case 'error':
      return 'danger'
    case 'warn':
      return 'warning'
    case 'subtle':
    case 'info':
    default:
      return 'primary'
  }
}

function toneToIcon(tone: MessageData['tone']): string {
  switch (tone) {
    case 'success':
      return 'check'
    case 'error':
      return 'alert'
    case 'warn':
      return 'warning'
    case 'subtle':
    case 'info':
    default:
      return 'iInCircle'
  }
}

export default function Message({ message, marginBottom = 0 }: MessageProps) {
  if (!message) return null
  return (
    <div style={{ marginBottom }}>
      <EuiCallOut
        title={message.text}
        color={toneToColor(message.tone)}
        iconType={toneToIcon(message.tone)}
      />
    </div>
  )
}

export function ToastContainer() {
  return null
}
