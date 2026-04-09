import React from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 bg-white border-b border-slate-200">
        <div className="h-full max-w-screen-xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-xs font-bold text-white">OF</span>
            </div>
            <div className="leading-none">
              <span className="text-sm font-semibold text-slate-900">OpsFlux</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-[0.15em] ml-2">Portail externe</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  )
}
