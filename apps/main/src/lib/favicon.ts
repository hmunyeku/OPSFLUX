/**
 * Dynamic favicon — paints a red dot (or count) on top of the
 * existing brand SVG when there are unread notifications. Called
 * from NotificationCenter alongside the document.title update.
 *
 * Approach:
 *   1. Draw the base favicon at 32×32 onto a canvas
 *   2. Overlay a red circle in the top-right corner
 *   3. If count > 0, print the count in white bold (tiny text — at
 *      32px it's barely legible but the red dot itself is the real
 *      signal; the digit is a secondary cue for users at 2× DPI)
 *   4. Update the <link rel="icon"> href to the canvas data URL
 *
 * Restores the original favicon when count drops back to 0.
 */

const DEFAULT_FAVICON = '/favicon.svg'
let originalHref: string | null = null
let currentState: 'default' | 'badged' = 'default'

function getFaviconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')
}

async function drawBadgedFavicon(count: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return DEFAULT_FAVICON

  // Paint the brand square at 64×64
  ctx.fillStyle = '#2563EB' // matches favicon.svg
  ctx.beginPath()
  const r = 16
  ctx.moveTo(r, 0)
  ctx.lineTo(64 - r, 0)
  ctx.quadraticCurveTo(64, 0, 64, r)
  ctx.lineTo(64, 64 - r)
  ctx.quadraticCurveTo(64, 64, 64 - r, 64)
  ctx.lineTo(r, 64)
  ctx.quadraticCurveTo(0, 64, 0, 64 - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fill()

  // Check-mark in white (same shape as the SVG)
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(16, 32)
  ctx.lineTo(28, 44)
  ctx.lineTo(48, 20)
  ctx.stroke()

  // Unread badge — red circle top-right, white digit if fits
  const badgeR = 18
  const cx = 64 - badgeR + 4
  const cy = badgeR - 4
  ctx.fillStyle = '#EF4444' // red-500
  ctx.beginPath()
  ctx.arc(cx, cy, badgeR, 0, Math.PI * 2)
  ctx.fill()
  // White ring around badge for contrast against dark tabs
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.stroke()

  // Count text (up to 9, then "9+")
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = count > 9 ? '9+' : String(count)
  ctx.fillText(label, cx, cy + 1)

  return canvas.toDataURL('image/png')
}

export async function updateFaviconBadge(count: number): Promise<void> {
  const link = getFaviconLink()
  if (!link) return
  if (originalHref === null) originalHref = link.href

  if (count <= 0) {
    if (currentState !== 'default') {
      link.href = originalHref || DEFAULT_FAVICON
      // Force re-fetch of SVG by switching type back.
      link.type = 'image/svg+xml'
      currentState = 'default'
    }
    return
  }

  const dataUrl = await drawBadgedFavicon(count)
  link.type = 'image/png'
  link.href = dataUrl
  currentState = 'badged'
}
