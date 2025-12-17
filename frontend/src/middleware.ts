import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Get token from cookies
    const token = request.cookies.get('access_token')?.value;

    const { pathname } = request.nextUrl;

    // 1. Redirect to /home if user is logged in and visits Root / or /login
    if (token) {
        if (pathname === '/' || pathname === '/login') {
            return NextResponse.redirect(new URL('/home', request.url));
        }
    }

    // 2. Redirect to /login if user is NOT logged in and visits protected routes
    // Assuming /home, /portfolio, /stock/* are protected
    const protectedRoutes = ['/home', '/portfolio', '/stock'];

    if (!token) {
        if (protectedRoutes.some(route => pathname.startsWith(route))) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/login', '/home/:path*', '/portfolio/:path*', '/stock/:path*'],
};
