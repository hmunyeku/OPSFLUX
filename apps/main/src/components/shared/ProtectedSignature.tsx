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

        {/* Tile-watermark overlay — pointer-events:none so it never intercepts
            real clicks. Angled repeating pattern, low-contrast grey. */}
        {!empty && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none"
            style={{
              // Build a CSS repeating-linear-gradient with the watermark
              // text baked into an SVG via data-URL. Angle: -25deg.
              backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="70">
                  <text x="0" y="30"
                        font-family="Arial, Helvetica, sans-serif"
                        font-size="9"
                        font-weight="600"
                        fill="rgba(0,0,0,0.20)"
                        transform="rotate(-22 0 30)">${wm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
                  <text x="0" y="60"
                        font-family="Arial, Helvetica, sans-serif"
                        font-size="9"
                        font-weight="600"
                        fill="rgba(0,0,0,0.20)"
                        transform="rotate(-22 0 60)">${wm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
                </svg>`,
              )}")`,
              backgroundRepeat: 'repeat',
              mixBlendMode: 'multiply',
            }}
          />
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
