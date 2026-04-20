/**
 * consoleCapture — circular-buffer console interceptor for bug reports.
 *
 * Installed once at app root. Intercepts console.log/warn/error/info/debug
 * plus window 'error' and 'unhandledrejection' events, keeping the last
 * MAX_LOG_ENTRIES entries. `buildConsoleLogFile()` produces a .log File
 * ready to attach when the user submits a bug ticket.
 *
 * Extracted from FeedbackWidget so the AssistantPanel's Ticket tab can
 * auto-attach the same context (the floating widget was removed to avoid
 * having two UIs for the same action).
 */

export interface ConsoleLogEntry {
  ts: string
  level: string
  message: string
}

const MAX_LOG_ENTRIES = 500
export const consoleLogBuffer: ConsoleLogEntry[] = []
let consoleInterceptInstalled = false

export function installConsoleIntercept() {
  if (consoleInterceptInstalled) return
  consoleInterceptInstalled = true

  const levels = ['log', 'warn', 'error', 'info', 'debug'] as const
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        const message = args.map(a => {
          if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`
          if (typeof a === 'object') try { return JSON.stringify(a, null, 0)?.slice(0, 500) } catch { return String(a) }
          return String(a)
        }).join(' ')

        consoleLogBuffer.push({
          ts: new Date().toISOString(),
          level: level.toUpperCase(),
          message: message.slice(0, 1000),
        })
        if (consoleLogBuffer.length > MAX_LOG_ENTRIES) {
          consoleLogBuffer.splice(0, consoleLogBuffer.length - MAX_LOG_ENTRIES)
        }
      } catch { /* never break the app */ }
      original(...args)
    }
  }

  window.addEventListener('error', (e) => {
    consoleLogBuffer.push({
      ts: new Date().toISOString(),
      level: 'UNCAUGHT_ERROR',
      message: `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack || ''}`.slice(0, 1500),
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const message = reason instanceof Error
      ? `${reason.name}: ${reason.message}\n${reason.stack || ''}`
      : typeof reason === 'object' ? JSON.stringify(reason) : String(reason)
    consoleLogBuffer.push({
      ts: new Date().toISOString(),
      level: 'UNHANDLED_REJECTION',
      message: message.slice(0, 1500),
    })
  })
}

export function buildConsoleLogFile(): File {
  const header = [
    `# OpsFlux console log (auto-capturé)`,
    `# Timestamp: ${new Date().toISOString()}`,
    `# URL: ${window.location.href}`,
    `# User agent: ${navigator.userAgent}`,
    `# Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `# Entries: ${consoleLogBuffer.length}`,
    ``,
  ].join('\n')
  const body = consoleLogBuffer
    .map(e => `[${e.ts}] ${e.level}: ${e.message}`)
    .join('\n')
  const content = header + body + '\n'
  return new File([content], `console-${Date.now()}.log`, { type: 'text/plain' })
}
