import React from 'react'
import { Shield } from 'lucide-react'
import { t } from '../lib/i18n'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-sunken)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--surface)] border-b border-[var(--border)] backdrop-blur-sm bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[var(--text-primary)] leading-tight">OpsFlux</span>
              <span className="text-[11px] text-[var(--text-tertiary)] leading-tight tracking-wide uppercase">External Portal</span>
            </div>
          </div>
          <div className="text-xs text-[var(--text-tertiary)] hidden sm:block">
            {t('app_title')}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
          <span>OpsFlux &mdash; PaxLog External</span>
          <span className="hidden sm:inline">Powered by OpsFlux ERP</span>
        </div>
      </footer>
    </div>
  )
}
