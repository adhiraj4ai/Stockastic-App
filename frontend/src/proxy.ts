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
    ];

    // Auth pages that should redirect away if already logged in
    const authRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

    let response: NextResponse;

    // 1. Redirect to /market if user is logged in and visits Root or auth pages
    if (token && (pathname === '/' || authRoutes.some(route => pathname.startsWith(route)))) {
        response = NextResponse.redirect(new URL('/market', request.url));
    }
    // 2. Redirect to /login if user is NOT logged in and visits protected routes or root
    else if (!token && (pathname === '/' || protectedRoutes.some(route => pathname.startsWith(route)))) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        response = NextResponse.redirect(loginUrl);
    }
    else {
        response = NextResponse.next();
    }

    // --- Inject Security Headers (CSP) ---
    const cspHeader = `
        default-src 'self';
        script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net blob:;
        worker-src 'self' blob:;
        style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
        img-src 'self' blob: data:;
        font-src 'self' data:;
        connect-src 'self' http://localhost:8000 https://api.stockastic.market https://cdn.jsdelivr.net ws: wss:;
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        frame-ancestors 'none';
    `.replace(/\s{2,}/g, ' ').trim();

    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');

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
    ],
};
