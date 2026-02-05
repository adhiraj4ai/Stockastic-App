import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Get token from cookies
    const token = request.cookies.get('access_token')?.value;

    const { pathname } = request.nextUrl;

    // 1. Redirect to /market if user is logged in and visits Root / or /login
    if (token) {
        if (pathname === '/' || pathname === '/login') {
            return NextResponse.redirect(new URL('/market', request.url));
        }
    }

    // 2. Redirect to /login if user is NOT logged in and visits protected routes
    // Assuming /market, /portfolio, /ticker/* are protected
    const protectedRoutes = ['/market', '/portfolio', '/ticker'];

    if (!token) {
        if (protectedRoutes.some(route => pathname.startsWith(route))) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/login', '/market/:path*', '/portfolio/:path*', '/ticker/:path*'],
};
