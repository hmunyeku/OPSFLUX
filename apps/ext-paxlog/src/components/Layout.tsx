import React from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#f8fafc_48%,_#f1f5f9_100%)]">
      <header className="sticky top-0 z-50 h-16 bg-white/88 backdrop-blur-xl border-b border-slate-200/80 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="h-full max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-9 h-9 rounded-xl bg-slate-950 flex items-center justify-center shadow-sm ring-1 ring-slate-900/80">
              <span className="text-[10px] font-semibold text-white tracking-[0.08em]">OF</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-semibold text-slate-950 tracking-[-0.01em]">OpsFlux</span>
                <span className="hidden sm:inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-blue-700">
                  Portail externe
                </span>
              </div>
              <p className="hidden md:block text-[11px] text-slate-500 truncate">
                Parcours guidé de préparation et de suivi des avis de séjour
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden md:inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
              Session sécurisée
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
              Assistance dossier
            </span>
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <span className="mono text-[10px] text-slate-400 uppercase tracking-[0.12em] tabular">
              ext
            </span>
            <span className="hidden lg:inline mono text-[10px] text-slate-400 uppercase tracking-[0.12em] tabular">
              v2
            </span>
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-16 z-0 h-28 bg-[linear-gradient(180deg,rgba(59,130,246,0.06),transparent)]" />

      <main className="relative flex-1">
        <div className="absolute inset-0 pointer-events-none opacity-[0.35] [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
        {children}
      </main>
    </div>
  )
}
