'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleResetRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage('');

        try {
            await api.post('/api/auth/password/reset/', { email });
            setStatus('success');
        } catch (err: any) {
            console.error('Password reset request failed', err);
            setStatus('error');
            setErrorMessage(err.response?.data?.detail || 'Failed to send reset email. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans">
            <Card className="w-full max-w-md shadow-xl border-none bg-white dark:bg-slate-900 overflow-hidden text-center">
                <CardHeader className="space-y-2 pb-2 pt-10">
                    <div className="flex justify-center mb-6">
                        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                            <Mail size={32} />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100 italic">Forgot Password?</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400 px-4">
                        No worries, we'll send you instructions to reset your password.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 px-10 pb-10">
                    {status === 'success' ? (
                        <div className="space-y-6">
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                                <h3 className="text-emerald-800 dark:text-emerald-400 font-bold mb-1">Check your email</h3>
                                <p className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">
                                    We've sent a password reset link to <span className="font-bold">{email}</span>
                                </p>
                            </div>
                            <Button
                                onClick={() => window.location.href = '/login'}
                                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg"
                            >
                                Back to Login
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetRequest} className="space-y-6">
                            <div className="space-y-1.5 text-left">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                                <Input
                                    type="email"
                                    placeholder="Enter your email..."
                                    className="h-12 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            {status === 'error' && (
                                <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-2 text-left">
                                    <AlertCircle className="h-4 w-4" />
                                    {errorMessage}
                                </div>
                            )}

                            <div className="space-y-4">
                                <Button
                                    type="submit"
                                    className="w-full h-12 bg-slate-900 dark:bg-slate-100 hover:bg-black dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
                                    disabled={status === 'loading'}
                                >
                                    {status === 'loading' ? 'Sending Link...' : 'Send Reset Link'}
                                </Button>

                                <Link
                                    href="/login"
                                    className="flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest transition-colors py-2"
                                >
                                    <ArrowLeft size={12} /> Back to Login
                                </Link>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
