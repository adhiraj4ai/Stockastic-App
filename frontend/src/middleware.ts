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
    } else {
        // Redirect to /login if user is NOT logged in and visits Root /
        if (pathname === '/') {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // 2. Redirect to /login if user is NOT logged in and visits protected routes
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
        '/settings'
    ];

    if (!token) {
        if (protectedRoutes.some(route => pathname.startsWith(route))) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/login',
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
        '/settings/:path*'
    ],
};
