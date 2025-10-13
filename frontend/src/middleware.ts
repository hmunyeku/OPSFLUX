import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware désactivé car l'authentification est gérée côté client via localStorage
 * La protection des routes est assurée par le hook useAuth dans les composants
 */
export function middleware(_request: NextRequest) {
  // Laisser passer toutes les requêtes
  // L'auth est gérée côté client avec useAuth et localStorage
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)',
  ],
}
