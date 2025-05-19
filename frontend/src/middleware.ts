import { type NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
    if (pathname !== 'api/auth/signin') {
      return NextResponse.redirect(new URL('/api/auth/signin', request.url))
    }
  }

  // Redirect to home if token exists and user is on login page
  if (pathname === 'api/auth/signin' && token) {
    return NextResponse.redirect(new URL('/p3-controls', request.url))
  }

  return NextResponse.next()
}

// Configure middleware to run on specific paths
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon|.*\\.ico$|.*\\.(?:jpg|jpeg|gif|png|svg)$).*)',
  ],
}
