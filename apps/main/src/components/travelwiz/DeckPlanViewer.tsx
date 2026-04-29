/**
 * DeckPlanViewer — read-only renderer for a vector's Draw.io deck plan.
 *
 * Loads Draw.io's `viewer-static.min.js` (self-hosted under
 * /drawio-viewer/) and renders the mxGraph XML inline as SVG. No
 * iframe, no toolbar — just the diagram, painted into a div the
 * caller can size freely.
 *
 * Path overrides : the viewer script defaults to viewer.diagrams.net
 * for styles / shapes / mxgraph assets. We rewrite them to our
 * self-hosted instance (drawio.opsflux.io) before the script
 * executes, so nothing leaks to the public Diagrams.net CDN.
 *
 * Coming next : a Konva overlay that owns the same coordinate space
 * and lets the user drag cargo rectangles over this background.
 */
import { useEffect, useRef } from 'react'

const DRAWIO_BASE =
  (import.meta.env.VITE_DRAWIO_URL as string | undefined) || 'http://localhost:8080'
const VIEWER_SCRIPT_SRC = '/drawio-viewer/viewer-static.min.js'

type GraphViewer = {
  // The viewer module exposes `processElements(parent)` to scan a
  // subtree for `.mxgraph` divs and turn each into an SVG diagram.
  processElements: (parent?: Element) => void
}

declare global {
  interface Window {
    GraphViewer?: GraphViewer
    PROXY_URL?: string
    STYLE_PATH?: string
    SHAPES_PATH?: string
    STENCIL_PATH?: string
    IMAGE_PATH?: string
    MXGRAPH_PATH?: string
  }
}

let viewerScriptPromise: Promise<void> | null = null

function ensureViewerScript(): Promise<void> {
  if (window.GraphViewer) return Promise.resolve()
  if (viewerScriptPromise) return viewerScriptPromise

  // The viewer reads these globals at load time, so they MUST be set
  // before the <script> tag executes.
  window.STYLE_PATH = `${DRAWIO_BASE}/styles`
  window.MXGRAPH_PATH = `${DRAWIO_BASE}/mxgraph`
  // The remaining paths are bundled into stencils.min.js by Draw.io
  // itself, but the viewer still references them when a stencil is
  // missing. We point them at our instance to keep the door open.
  window.SHAPES_PATH = `${DRAWIO_BASE}/shapes`
  window.STENCIL_PATH = `${DRAWIO_BASE}/stencils`
  window.IMAGE_PATH = `${DRAWIO_BASE}/images`
  window.PROXY_URL = `${DRAWIO_BASE}/proxy`

  viewerScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${VIEWER_SCRIPT_SRC}"]`,
    )
    if (existing) {
      if (window.GraphViewer) resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = VIEWER_SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load viewer-static.min.js'))
    document.head.appendChild(s)
  })

  return viewerScriptPromise
}

export interface DeckPlanViewerProps {
  /** Draw.io mxGraph XML, e.g. from /vectors/{id}/deck-plan. */
  xml: string
  /** Optional className applied to the host div. */
  className?: string
  /** Optional inline styles applied to the host div. */
  style?: React.CSSProperties
}

export function DeckPlanViewer({ xml, className, style }: DeckPlanViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void ensureViewerScript().then(() => {
      if (cancelled || !hostRef.current || !window.GraphViewer) return
      // Wipe any previous render and let the viewer rebuild from the
      // current XML. Each remount clears its own DOM so the viewer
      // does not stack two diagrams.
      hostRef.current.innerHTML = ''
      const inner = document.createElement('div')
      inner.className = 'mxgraph'
      inner.style.maxWidth = '100%'
      // The viewer expects a JSON blob with at least { xml }.
      inner.setAttribute('data-mxgraph', JSON.stringify({ xml, toolbar: '', highlight: '#0066cc' }))
      hostRef.current.appendChild(inner)
      window.GraphViewer.processElements(hostRef.current)
    })
    return () => {
      cancelled = true
    }
  }, [xml])

  return <div ref={hostRef} className={className} style={style} />
}
