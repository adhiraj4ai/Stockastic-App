import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    // Get token from cookies
    const token = request.cookies.get('access_token')?.value;

    const { pathname } = request.nextUrl;

    // Protected routes that require authentication
    const protectedRoutes = [
        '/market',
        '/portfolio',
        '/ticker',
        '/chat',
        '/accumulation',
        '/financials',
        '/strategies',
        '/signals',
        '/recommendations',
        '/pipeline',
        '/settings',
        '/social',
        '/watchlist',
        '/screener',
        '/smart-money',
        '/paper-trading',
    ];

    // Auth pages that should redirect away if already logged in
    const authRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

    // 1. Redirect to /market if user is logged in and visits Root or auth pages
    if (token && (pathname === '/' || authRoutes.some(route => pathname.startsWith(route)))) {
        return NextResponse.redirect(new URL('/market', request.url));
    }

    // 2. Redirect to /login if user is NOT logged in and visits protected routes or root
    if (!token) {
        if (pathname === '/' || protectedRoutes.some(route => pathname.startsWith(route))) {
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/market/:path*',
        '/portfolio/:path*',
        '/ticker/:path*',
        '/chat/:path*',
        '/accumulation/:path*',
        '/financials/:path*',
        '/strategies/:path*',
        '/signals/:path*',
        '/recommendations/:path*',
        '/pipeline/:path*',
        '/settings/:path*',
        '/social/:path*',
        '/watchlist/:path*',
        '/screener/:path*',
        '/smart-money/:path*',
        '/paper-trading/:path*',
    ],
};
