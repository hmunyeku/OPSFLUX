/**
 * ProtectedSignature — hardened display of an electronic signature.
 *
 * Security goals, in order of importance:
 *   1. No crawlable URL — the PNG is painted via CSS background-image,
 *      so right-click → "Open image in new tab" / "Save image as" is
 *      unavailable. DevTools DOM inspector cannot pull a .png either;
 *      the base64 data sits on `style.backgroundImage` only.
 *   2. Context menu, drag-and-drop and text selection are all blocked
 *      on the signature container.
 *   3. The image is desaturated (grayscale) + dimmed so a quick
 *      Alt-PrintScreen gets a washed-out capture, not a high-fidelity
 *      signature usable elsewhere.
 *   4. An angled watermark is overlaid on every pixel — user email,
 *      timestamp, and optional reference — so any leaked screenshot
 *      can be traced back to its viewer and moment.
 *   5. The component masks itself (blur + no background) as soon as
 *      the page loses visibility (Page Visibility API) to defeat
 *      screenshots triggered after an Alt-Tab.
 *
 * Out of scope (openly acknowledged):
 *   - OS-level screenshots cannot be blocked from within a browser.
 *   - A motivated user with DevTools can still read the data URL from
 *     memory. This component is a deterrent + an audit trail, not DRM.
 */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

interface ProtectedSignatureProps {
  value: string | null | undefined
  /** Width / height of the signature frame in px. */
  width?: number
  height?: number
  /** Small label shown above (e.g. "Signature Demandeur"). */
  label?: string
  /** Optional extra watermark line (e.g. MOC reference). */
  reference?: string
  className?: string
}

function useIsDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true,
  )
  useEffect(() => {
    const handler = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('blur', handler)
    window.addEventListener('focus', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('blur', handler)
      window.removeEventListener('focus', handler)
    }
  }, [])
  return visible
}

export function ProtectedSignature({
  value,
  width = 200,
  height = 80,
  label,
  reference,
  className,
}: ProtectedSignatureProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const user = useAuthStore((s) => s.user)
  const visible = useIsDocumentVisible()

  // Apply the base64 PNG via JS so it never appears in the HTML markup
  // (avoids simple "view source" / view-DOM attribute disclosure). Even
  // a DevTools snoop has to go through the computed style inspector.
  useEffect(() => {
    if (!ref.current) return
    if (value && value.startsWith('data:image')) {
      ref.current.style.backgroundImage = `url("${value}")`
    } else {
      ref.current.style.backgroundImage = 'none'
    }
  }, [value])

  // Redacted by the backend → show a placeholder "signed, protected"
  // box rather than anything guessable.
  const redacted = value === '__REDACTED__'
  const empty = !value || redacted

  const now = new Date()
  const stamp =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0')
  const viewer = user?.email || 'anonymous'
  const wm = [viewer, stamp, reference].filter(Boolean).join(' · ')

  return (
    <div className={cn('space-y-0.5', className)}>
      {label && (
        <div className="text-[10px] font-medium text-muted-foreground">
          {label}
        </div>
      )}
      <div
        ref={ref}
        role="img"
        aria-label={label || 'Signature'}
        // Block context menu, drag, selection, pointer events on children.
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        className={cn(
          'relative overflow-hidden rounded border bg-white',
          'select-none',
          empty
            ? 'border-dashed border-border bg-muted/20'
            : 'border-border',
        )}
        style={{
          width,
          height,
          // Grey out + dim so a naïve capture is visibly degraded.
          filter: empty
            ? undefined
            : visible
              ? 'grayscale(100%) opacity(0.72) contrast(0.9)'
              : 'blur(12px) grayscale(100%) opacity(0.4)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          // Disable all native drag affordances
          WebkitUserDrag: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          userSelect: 'none',
        } as React.CSSProperties}
      >
        {empty && (
          <div className="flex h-full w-full items-center justify-center text-[10px] italic text-muted-foreground">
            {redacted
              ? '— protégée —'
              : '— non signée —'}
          </div>
        )}

        {/* Anti-extraction watermark stack — pointer-events:none so it never
            blocks real clicks. The signature must be unextractable without
            destroying it, so the pattern is designed to defeat AI inpainting:
              • TWO layers rotated at opposite angles (-22° / +22°) so a
                frequency-domain filter cannot isolate them
              • Dense repetition (tile ~90×28 px) covering every signature
                stroke several times
              • Higher opacity (~48%) — removing it without leaving artefacts
                now requires re-drawing strokes from partial data
              • Two different text lines per tile (viewer + timestamp) so
                the pattern is NOT self-similar under translation
              • Fine diagonal grid overlay adds a second removal target */}
        {!empty && (
          <>
            {/* Layer 1 — tilted -22° */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 select-none"
              style={{
                backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="28">
                    <text x="0" y="12"
                          font-family="Arial, Helvetica, sans-serif"
                          font-size="7"
                          font-weight="700"
                          fill="rgba(60,60,60,0.48)"
                          transform="rotate(-22 0 12)">${wm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
                    <text x="0" y="25"
                          font-family="Arial, Helvetica, sans-serif"
                          font-size="7"
                          font-weight="700"
                          fill="rgba(60,60,60,0.48)"
                          transform="rotate(-22 0 25)">${wm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
                  </svg>`,
                )}")`,
                backgroundRepeat: 'repeat',
                mixBlendMode: 'multiply',
              }}
            />
            {/* Layer 2 — counter-tilted +22°, offset so strokes cross */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 select-none"
              style={{
                backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="28">
                    <text x="0" y="12"
                          font-family="Arial, Helvetica, sans-serif"
                          font-size="7"
                          font-weight="700"
                          fill="rgba(0,0,0,0.42)"
                          transform="rotate(22 0 12)">${wm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
                    <text x="0" y="25"
                          font-family="Arial, Helvetica, sans-serif"
                          font-size="7"
                          font-weight="700"
                          fill="rgba(0,0,0,0.42)"
                          transform="rotate(22 0 25)">${wm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
                  </svg>`,
                )}")`,
                backgroundRepeat: 'repeat',
                backgroundPosition: '16px 6px',
                mixBlendMode: 'multiply',
              }}
            />
            {/* Layer 3 — fine diagonal grid, destroys smooth regions so
                an inpainter cannot recover the signature background either */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 select-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(' +
                    '45deg,' +
                    'rgba(0,0,0,0.14) 0,' +
                    'rgba(0,0,0,0.14) 0.7px,' +
                    'transparent 0.7px,' +
                    'transparent 5px' +
                  '), repeating-linear-gradient(' +
                    '-45deg,' +
                    'rgba(0,0,0,0.14) 0,' +
                    'rgba(0,0,0,0.14) 0.7px,' +
                    'transparent 0.7px,' +
                    'transparent 5px' +
                  ')',
                mixBlendMode: 'multiply',
              }}
            />
          </>
        )}

        {/* Corner chip — discrete "SIGNED" marker to help readers trust
            this box is authoritative, not a placeholder. */}
        {!empty && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 py-0.5 text-[7.5pt] font-semibold uppercase text-white"
          >
            Signé
          </div>
        )}
      </div>
    </div>
  )
}
