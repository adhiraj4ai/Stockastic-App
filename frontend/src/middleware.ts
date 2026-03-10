import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedPaths = [
    '/portfolio',
    '/settings',
    '/chat',
    '/market',
    '/paper-trading',
    '/social',
    '/accumulation',
    '/watchlist',
    '/screener',
    '/smart-money',
];

// Routes that should redirect TO dashboard if already authenticated
const authPaths = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const accessToken = request.cookies.get('access_token')?.value;

    // Check if the path is protected
    const isProtected = protectedPaths.some(path => pathname.startsWith(path));
    const isAuthPage = authPaths.some(path => pathname.startsWith(path));

    // If accessing a protected route without a token, redirect to login
    if (isProtected && !accessToken) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // If accessing auth pages with a valid token, redirect to portfolio
    if (isAuthPage && accessToken) {
        return NextResponse.redirect(new URL('/portfolio', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
    ],
};
