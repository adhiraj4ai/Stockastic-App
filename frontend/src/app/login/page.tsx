'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Eye, EyeOff, AlertCircle, LayoutDashboard, Chrome, Apple, Binary } from 'lucide-react';

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [otpToken, setOtpToken] = useState('');
    const [is2faRequired, setIs2faRequired] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, []);

    const logoSrc = mounted && resolvedTheme === 'dark' ? '/stockastic-logo-dark.png' : '/stockastic-logo-v3.png';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await api.post('/api/account/login/', {
                username: identifier, // Backend handles either username or email in identify logic or use identifier
                password: password,
                token: otpToken
            });

            if (response.data['2fa_required']) {
                setIs2faRequired(true);
                setLoading(false);
                return;
            }

            // The backend sets HttpOnly access/refresh cookies on the login
            // response; the browser stores them automatically. The client must
            // not write its own token cookies — doing so shadows the valid
            // HttpOnly cookie with junk and breaks every authenticated request.
            router.push('/portfolio');
        } catch (err: any) {
            console.error('Login failed', err);
            setError(err.response?.data?.error || 'Invalid credentials');
            setLoading(false);
        }
    };

    const handleSocialLogin = (provider: string) => {
        // Redirect to backend social auth endpoint
        window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/auth/${provider}/`;
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-500">
            <Card className="w-full max-w-md shadow-xl border-none ring-0 bg-white dark:bg-slate-900 overflow-hidden">
                <CardHeader className="space-y-2 text-center pb-2 border-b border-slate-50 dark:border-slate-800 flex flex-col items-center pt-8">
                    <div className="relative w-28 h-14 mb-2">
                        <Image
                            src={logoSrc}
                            alt="Stockastic Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <CardDescription className="font-medium text-slate-500 dark:text-slate-400 text-sm">
                        {is2faRequired ? 'Enter your 2FA security code' : 'Secure access to your trading terminal'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-8 px-8 pb-8">
                    <form onSubmit={handleLogin} className="space-y-5">
                        {!is2faRequired ? (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 ml-1 flex items-center gap-1.5">
                                        <Mail size={12} className="text-slate-400" />
                                        Username or email
                                    </label>
                                    <Input
                                        type="text"
                                        placeholder="Enter your email..."
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        className="h-12 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                                            <Lock size={12} className="text-slate-400" />
                                            Password
                                        </label>
                                        <Link href="/forgot-password" title="Forgot Password" className="text-[10px] font-bold text-primary hover:underline">
                                            Forgot?
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="h-12 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl pr-12"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                                        >
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 ml-1 flex items-center gap-1.5">
                                    <Binary size={12} className="text-slate-400" />
                                    6-digit authenticator code
                                </label>
                                <Input
                                    type="text"
                                    autoFocus
                                    placeholder="000000"
                                    maxLength={6}
                                    value={otpToken}
                                    onChange={(e) => setOtpToken(e.target.value)}
                                    className="h-14 text-center text-2xl tracking-[0.5em] font-mono bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl shadow-inner"
                                    required
                                />
                                <p className="text-[10px] text-slate-400 mt-2 text-center">
                                    Open your authenticator app to see the code.
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-[11px] font-bold p-4 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-all shadow-lg active:scale-[0.98] rounded-xl flex items-center gap-2"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <LayoutDashboard size={16} />
                                    {is2faRequired ? 'Verify & login' : 'Sign in'}
                                </>
                            )}
                        </Button>
                    </form>

                    {!is2faRequired && (
                        <>
                            <div className="relative my-8">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-100 dark:border-slate-800" />
                                </div>
                                <div className="relative flex justify-center text-[10px]">
                                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 font-bold">Or continue with</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => handleSocialLogin('google')}
                                    className="h-12 rounded-xl border-slate-100 dark:border-slate-800 hover:bg-accent hover:text-accent-foreground"
                                >
                                    <Chrome size={20} className="text-slate-600 dark:text-slate-400" />
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleSocialLogin('apple')}
                                    className="h-12 rounded-xl border-slate-100 dark:border-slate-800 hover:bg-accent hover:text-accent-foreground"
                                >
                                    <Apple size={20} className="text-slate-600 dark:text-slate-400" />
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleSocialLogin('microsoft')}
                                    className="h-12 rounded-xl border-slate-100 dark:border-slate-800 hover:bg-accent hover:text-accent-foreground"
                                >
                                    <Binary size={20} className="text-slate-600 dark:text-slate-400" />
                                </Button>
                            </div>

                            <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">
                                Don't have an account?{' '}
                                <Link href="/signup" className="text-primary font-bold hover:underline">
                                    Sign up now
                                </Link>
                            </p>
                        </>
                    )}

                    {is2faRequired && (
                        <button
                            type="button"
                            onClick={() => setIs2faRequired(false)}
                            className="w-full mt-4 text-[10px] font-bold text-slate-400 hover:text-slate-600"
                        >
                            Back to credentials
                        </button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
