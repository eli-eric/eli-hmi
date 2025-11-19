import { type NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isRouteAllowed, getDefaultRoute } from './lib/settings/zone-service'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Set Cache-Control headers for font files
  if (pathname.startsWith('/fonts/')) {
    const response = NextResponse.next()
    // Cache fonts for 1 year (31536000 seconds)
    // immutable means the file won't change over time
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    return response
  }

  // Skip auth check for api routes
  if (pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })
  console.log('Token:', token)

  if (!token) {
    // Redirect to login if no token and not on login page
    if (pathname !== '/auth/signin' && !pathname.startsWith('/api/auth')) {
      return NextResponse.redirect(new URL('/auth/signin', request.url))
    }
  }

  // Zone-based route authorization for authenticated users
  if (token) {
    // Routes that bypass zone checks
    const bypassRoutes = ['/no-access', '/auth/signin']
    const shouldBypassZoneCheck =
      bypassRoutes.includes(pathname) || pathname.startsWith('/api/auth')

    // Check if the route is allowed for the current zone
    if (!shouldBypassZoneCheck && !isRouteAllowed(pathname)) {
      return NextResponse.redirect(new URL('/no-access', request.url))
    }
  }

  // Redirect to default route if token exists and user is on login page
  if (
    (pathname === '/auth/signin' || pathname === '/api/auth/signin') &&
    token
  ) {
    const defaultRoute = getDefaultRoute() ?? '/no-access'
    return NextResponse.redirect(new URL(defaultRoute, request.url))
  }

  return NextResponse.next()
}

// Configure middleware to run on specific paths
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon|.*\\.ico$|.*\\.(?:jpg|jpeg|gif|png|svg)$).*)',
  ],
}
