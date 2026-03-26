/**
 * Legacy AssetsPage — redirects to the Asset Registry.
 *
 * The old flat `assets` table has been migrated to the ar_* hierarchy.
 * All operational modules now reference ar_installations.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function AssetsPage() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/assets', { replace: true }) }, [navigate])
  return null
}
