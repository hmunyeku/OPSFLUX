import React from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header — refined editorial */}
      <header className="sticky top-0 z-50 h-14 bg-white/80 backdrop-blur-xl border-b border-stone-200/80">
        <div className="h-full max-w-[1480px] mx-auto px-6 lg:px-12 xl:px-16 flex items-center justify-between">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="relative w-7 h-7 rounded-md bg-stone-900 flex items-center justify-center shadow-sm">
              <span className="text-[10px] font-semibold text-white tracking-[0.05em]">OF</span>
            </div>
            <div className="leading-none flex items-baseline gap-3">
              <span className="text-[13px] font-semibold text-stone-900 tracking-[-0.005em]">OpsFlux</span>
              <span className="hidden sm:inline serif-italic text-[13px] text-stone-400">
                Portail externe
              </span>
            </div>
          </div>

          {/* Right meta */}
          <div className="flex items-center gap-5">
            <span className="hidden md:inline mono text-[10px] text-stone-400 uppercase tracking-[0.12em] tabular">
              Sécurisé · v2
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  )
}
