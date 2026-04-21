/**
 * NotFoundPage — catch-all 404 route shown when no other route
 * matches. Used for typo URLs, bookmarks pointing at removed pages,
 * and deep-links to deleted records.
 *
 * Visual language matches ErrorBoundary + HomePage hero (mesh
 * backdrop, glassy card, Archivo heading) so the user stays on-brand
 * even after a mis-navigation.
 */

import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Compass, ArrowLeft, Home } from 'lucide-react'

export function NotFoundPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="relative flex items-center justify-center min-h-dvh p-4 bg-background overflow-hidden">
      {/* Mesh backdrop — same blobs vocabulary, friendlier colours so the
          404 doesn't read as an error state (it's user navigation, not
          a system failure). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-primary/25 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
        <div className="absolute -bottom-16 -right-16 h-96 w-96 rounded-full bg-highlight/20 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" style={{ animationDelay: '-4s' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl motion-safe:animate-[pulse_13s_ease-in-out_infinite]" style={{ animationDelay: '-7s' }} />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-border/70 bg-card/90 backdrop-blur-md p-8 shadow-xl shadow-primary/5 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/12 to-highlight/12 ring-1 ring-primary/15 shadow-[0_10px_40px_-15px_hsl(var(--primary)/0.3)]">
          <Compass size={32} className="text-primary" strokeWidth={1.8} />
        </div>
        {/* Oversized 404 numeral in Archivo for an editorial feel */}
        <p className="font-display text-6xl font-bold tracking-tighter bg-gradient-to-br from-primary to-highlight bg-clip-text text-transparent">
          404
        </p>
        <h1 className="mt-1 text-xl font-bold font-display tracking-tight text-foreground">
          {t('errors.not_found.title', { defaultValue: 'Page introuvable' })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
          {t('errors.not_found.description', { defaultValue: 'L\'URL que vous avez suivie n\'existe pas ou plus. Retournez à l\'accueil ou revenez à la page précédente.' })}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => navigate(-1)} className="gl-button-sm gl-button-default">
            <ArrowLeft size={13} /> {t('common.back', { defaultValue: 'Retour' })}
          </button>
          <button onClick={() => navigate('/home')} className="gl-button-sm gl-button-confirm">
            <Home size={13} /> {t('nav.home', { defaultValue: 'Accueil' })}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotFoundPage
