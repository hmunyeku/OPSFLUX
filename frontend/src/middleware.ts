import { NextResponse, type NextRequest } from 'next/server'

const publicPaths = ['/login', '/register', '/forgot-password']
const authPaths = ['/login', '/register', '/forgot-password']

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')
  const { pathname } = request.nextUrl

  // Check if the path is public
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path))

  // If user is logged in and trying to access auth pages, redirect to dashboard
  if (token && isAuthPath) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // If user is not logged in and trying to access protected pages, redirect to login
  if (!token && !isPublicPath && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Allow user to access root path, dashboard layout will handle auth
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
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
