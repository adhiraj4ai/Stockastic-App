'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

function ResetPasswordForm() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();

    const uid = searchParams.get('uid');
    const token = searchParams.get('token');

    const calculatePasswordStrength = (password: string) => {
        let strength = 0;
        if (password.length > 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return strength;
    };

    const passwordStrength = calculatePasswordStrength(password);

    const getStrengthColor = () => {
        if (passwordStrength === 0) return 'bg-slate-200 dark:bg-slate-800';
        if (passwordStrength === 1) return 'bg-rose-500';
        if (passwordStrength === 2) return 'bg-orange-500';
        if (passwordStrength === 3) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const getStrengthText = () => {
        if (password.length === 0) return '';
        if (passwordStrength <= 1) return 'Too Weak';
        if (passwordStrength === 2) return 'Fair';
        if (passwordStrength === 3) return 'Good';
        return 'Strong';
    };

    useEffect(() => {
        if (!uid || !token) {
            setStatus('error');
            setErrorMessage('Invalid or missing reset token. Please request a new link.');
        }
    }, [uid, token]);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match');
            setStatus('error');
            return;
        }

        if (passwordStrength < 2) {
            setErrorMessage('Password is too weak');
            setStatus('error');
            return;
        }

        setStatus('loading');
        setErrorMessage('');

        try {
            await api.post('/api/auth/password/reset/confirm/', {
                uid,
                token,
                new_password: password,
                re_new_password: confirmPassword
            });
            setStatus('success');
            setTimeout(() => router.push('/login'), 3000);
        } catch (err: any) {
            console.error('Password reset failed', err);
            setStatus('error');
            setErrorMessage(err.response?.data?.detail || 'Failed to reset password. The link may have expired.');
        }
    };

    return (
        <Card className="w-full max-w-md shadow-xl border-none bg-white dark:bg-slate-900 overflow-hidden text-center">
            <CardHeader className="space-y-2 pb-2 pt-10">
                <div className="flex justify-center mb-6">
                    <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                        <Lock size={32} />
                    </div>
                </div>
                <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100 italic">Reset Password</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 px-4">
                    Enter your new password below.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 px-10 pb-10">
                {status === 'success' ? (
                    <div className="space-y-6">
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                            <h3 className="text-emerald-800 dark:text-emerald-400 font-bold mb-1">Success!</h3>
                            <p className="text-xs text-emerald-600 dark:text-emerald-500 font-medium text-center">
                                Your password has been successfully reset. Redirecting you to login...
                            </p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-5 text-left">
                        <div className="space-y-1.5 ">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                <ShieldCheck size={12} className="text-slate-400" />
                                New Password
                            </label>
                            <Input
                                type="password"
                                placeholder="••••••••"
                                className="h-12 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                            {/* Strength Meter */}
                            {password.length > 0 && (
                                <div className="mt-2 space-y-1.5 px-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Strength: <span className={getStrengthColor().replace('bg-', 'text-')}>{getStrengthText()}</span></span>
                                    </div>
                                    <div className="flex gap-1 h-1">
                                        {[1, 2, 3, 4].map((step) => (
                                            <div
                                                key={step}
                                                className={`flex-1 rounded-full transition-all duration-500 ${step <= passwordStrength ? getStrengthColor() : 'bg-slate-100 dark:bg-slate-800'}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                <ShieldCheck size={12} className="text-slate-400" />
                                Confirm New Password
                            </label>
                            <Input
                                type="password"
                                placeholder="••••••••"
                                className="h-12 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                        </div>

                        {errorMessage && (
                            <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {errorMessage}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
                            disabled={status === 'loading' || (!uid || !token)}
                        >
                            {status === 'loading' ? 'Resetting Password...' : 'Reset Password'}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-500">
            <Suspense fallback={<div>Loading...</div>}>
                <ResetPasswordForm />
            </Suspense>
        </div>
    );
}
