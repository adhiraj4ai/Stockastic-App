'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import Cookies from 'js-cookie';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SocialCallbackPage() {
    const { provider } = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [error, setError] = useState('');

    useEffect(() => {
        const code = searchParams.get('code');

        if (!code) {
            setStatus('error');
            setError('No authentication code received from provider.');
            return;
        }

        const completeSocialLogin = async () => {
            try {
                // Post the code to our backend social login view
                const response = await api.post(`/api/users/auth/${provider}/`, {
                    code: code
                });

                const { access, refresh } = response.data;

                const isSecure = window.location.protocol === 'https:';
                Cookies.set('access_token', access, { expires: 1, secure: isSecure, sameSite: 'lax' });
                Cookies.set('refresh_token', refresh, { expires: 7, secure: isSecure, sameSite: 'lax' });

                setStatus('success');

                // Redirect after a short delay
                setTimeout(() => {
                    router.push('/dashboard');
                }, 1500);

            } catch (err: any) {
                console.error('Social login completion failed', err);
                setStatus('error');
                setError(err.response?.data?.detail || 'Failed to complete social authentication.');
            }
        };

        completeSocialLogin();
    }, [provider, searchParams, router]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-xl border-none bg-white dark:bg-slate-900 overflow-hidden">
                <CardHeader className="space-y-2 text-center pb-2 pt-8">
                    <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100 italic capitalize">
                        {provider} Login
                    </CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">
                        {status === 'loading' && 'Completing authentication...'}
                        {status === 'success' && 'Authentication successful!'}
                        {status === 'error' && 'Authentication failed'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 px-8 pb-8 flex flex-col items-center justify-center min-h-[200px]">
                    {status === 'loading' && (
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
                            <p className="text-sm font-medium text-slate-500">Please wait while we secure your session...</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-4 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-16 w-16" />
                            <p className="text-lg font-bold">Welcome back!</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center"> Redirecting you to your terminal...</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-3">
                                <AlertCircle className="h-6 w-6 shrink-0" />
                                <p className="text-sm font-bold">{error}</p>
                            </div>
                            <button
                                onClick={() => router.push('/login')}
                                className="mt-4 text-blue-600 dark:text-blue-400 font-bold hover:underline text-sm"
                            >
                                Back to Login
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
