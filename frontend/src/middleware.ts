import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Decode a JWT's `exp` claim without verifying the signature. Signature
// verification belongs to the backend; the middleware only needs the expiry to
// decide routing. Returns null for anything that isn't a JWT with a numeric exp.
function decodeExpiry(token: string | undefined): number | null {
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    try {
        let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        base64 += '='.repeat((4 - (base64.length % 4)) % 4);
        const claims = JSON.parse(atob(base64));
        return typeof claims.exp === 'number' ? claims.exp : null;
    } catch {
        return null;
    }
}

// A token is "live" only if it exists and its exp is still in the future.
// A present-but-expired cookie (session cookies outlive the JWT inside them)
// must count as logged out, or expired sessions loop between /login and /market.
function isLive(token: string | undefined): boolean {
    const exp = decodeExpiry(token);
    return exp !== null && exp * 1000 > Date.now();
}

export function middleware(request: NextRequest) {
    // The session is alive while the refresh token is valid; the short-lived
    // access token is refreshed via XHR and may briefly be expired mid-session.
    const isAuthenticated =
        isLive(request.cookies.get('refresh_token')?.value) ||
        isLive(request.cookies.get('access_token')?.value);

    const { pathname } = request.nextUrl;

    // Protected routes that require authentication
    const protectedRoutes = [
        '/market',
        '/portfolio',
        '/ticker',
        '/chat',
        '/notebook',
        '/accumulation',
        '/admin/financials',
        '/strategies',
        '/signals',
        '/recommendations',
        '/admin/pipeline',
        '/settings',
        '/social',
        '/watchlist',
        '/screener',
        '/smart-money',
        '/paper-trading',
        '/plan',
    ];

    // Auth pages that should redirect away if already logged in
    const authRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

    let response: NextResponse;

    // 1. Redirect to /market if user is logged in and visits auth pages
    if (isAuthenticated && authRoutes.some(route => pathname.startsWith(route))) {
        response = NextResponse.redirect(new URL('/market', request.url));
    }
    // 2. Redirect to /login if user is NOT logged in and visits protected routes
    else if (!isAuthenticated && protectedRoutes.some(route => pathname.startsWith(route))) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        response = NextResponse.redirect(loginUrl);
    }
    else {
        response = NextResponse.next();
    }

    return response;
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
        '/notebook/:path*',
        '/accumulation/:path*',
        '/admin/financials/:path*',
        '/strategies/:path*',
        '/signals/:path*',
        '/recommendations/:path*',
        '/admin/pipeline/:path*',
        '/settings/:path*',
        '/social/:path*',
        '/watchlist/:path*',
        '/screener/:path*',
        '/smart-money/:path*',
        '/paper-trading/:path*',
        '/plan/:path*',
    ],
};
