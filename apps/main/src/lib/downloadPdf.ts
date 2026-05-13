/**
 * downloadPdf — authenticated PDF download helper.
 *
 * Browser-level navigations (`window.location.href`, `<a href>` with
 * `target=_blank`) bypass axios interceptors, so the `Authorization: Bearer`
 * header never reaches the server and authenticated PDF endpoints reply with
 * 401. This helper fetches the PDF as a Blob through the shared `api` axios
 * instance (which DOES attach the JWT), then triggers the download via a
 * programmatic anchor click.
 */
import api from '@/lib/api'

/**
 * Download a PDF from an authenticated API endpoint.
 *
 * Bypasses browser-level navigation (which would lose the Authorization header)
 * by performing the fetch via axios, converting to Blob, and clicking a
 * programmatic anchor.
 *
 * @param url - the URL to fetch (relative or absolute)
 * @param filename - optional filename override; defaults to deriving from the URL
 */
export async function downloadPdf(url: string, filename?: string): Promise<void> {
  const response = await api.get(url, { responseType: 'blob' })
  const blob = response.data as Blob
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename ?? deriveFilenameFromUrl(url) ?? 'export.pdf'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so the browser has a chance to start the download
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function deriveFilenameFromUrl(url: string): string | null {
  try {
    const path = url.split('?')[0]
    const last = path.split('/').pop()
    if (last && last.endsWith('.pdf')) return last
  } catch {
    // ignore
  }
  return null
}
