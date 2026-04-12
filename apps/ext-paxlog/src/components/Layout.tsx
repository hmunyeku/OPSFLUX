import React, { useState } from 'react'
import { EuiBadge } from '@elastic/eui'
import { t, getLang, toggleLang } from '../lib/i18n'

interface LayoutProps {
  children: React.ReactNode
  adsRef?: string | null
  companyName?: string | null
  status?: string | null
  authenticated?: boolean
}

export default function Layout({ children, adsRef, companyName, status, authenticated }: LayoutProps) {
  const [lang, setLangState] = useState(getLang())

  const handleToggleLang = () => {
    const next = toggleLang()
    setLangState(next)
    window.location.reload()
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      {/* ── Compact top header ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          {/* Left: logo + ADS ref */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded bg-gray-900 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">OF</span>
            </div>
            <span className="text-sm font-semibold text-gray-800 truncate">OpsFlux</span>
            {adsRef && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-600 font-mono truncate">{adsRef}</span>
              </>
            )}
            {companyName && (
              <>
                <span className="hidden sm:inline text-gray-300">|</span>
                <span className="hidden sm:inline text-xs text-gray-500 truncate">{companyName}</span>
              </>
            )}
          </div>

          {/* Right: status + lang toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {authenticated && (
              <EuiBadge color="success" className="hidden sm:inline-flex">{t('secure_session')}</EuiBadge>
            )}
            {status && (
              <EuiBadge color="hollow" className="hidden sm:inline-flex">{status}</EuiBadge>
            )}
            <button
              type="button"
              onClick={handleToggleLang}
              className="text-xs font-medium px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
            >
              {lang === 'fr' ? 'EN' : 'FR'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="max-w-5xl mx-auto px-4 py-5">
        {children}
      </main>
    </div>
  )
}
