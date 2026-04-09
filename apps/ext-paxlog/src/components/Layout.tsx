import React from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="relative min-h-screen flex flex-col" style={{ zIndex: 1 }}>
      {/* Header — minimal, fixed */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14">
        <div className="h-full max-w-screen-xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-xs font-bold text-white tracking-tight">OF</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold text-white">OpsFlux</span>
              <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-[0.15em]">Portail externe</span>
            </div>
          </div>
          <div className="text-[11px] text-[var(--text-faint)] mono hidden sm:block">
            PaxLog External
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pt-14">
        {children}
      </main>
    </div>
  )
}
