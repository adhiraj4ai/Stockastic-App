'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Lock, AlertCircle, Chrome, Apple, Binary, Check, X } from 'lucide-react';

export default function SignupPage() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirm_password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const calculatePasswordStrength = (password: string) => {
        let strength = 0;
        if (password.length > 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return strength;
    };

    const passwordStrength = calculatePasswordStrength(formData.password);

    const getStrengthColor = () => {
        if (passwordStrength === 0) return 'bg-slate-200 dark:bg-slate-800';
        if (passwordStrength === 1) return 'bg-rose-500';
        if (passwordStrength === 2) return 'bg-orange-500';
        if (passwordStrength === 3) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const getStrengthText = () => {
        if (formData.password.length === 0) return '';
        if (passwordStrength <= 1) return 'Too Weak';
        if (passwordStrength === 2) return 'Fair';
        if (passwordStrength === 3) return 'Good';
        return 'Strong';
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirm_password) {
            setError('Passwords do not match');
            return;
        }

        if (passwordStrength < 2) {
            setError('Password is too weak');
            return;
        }

        setLoading(true);

        try {
            await api.post('/api/auth/registration/', {
                username: formData.username,
                email: formData.email,
                password: formData.password,
            });

            alert('Account created successfully! Please check your email for verification.');
            router.push('/login');
        } catch (err: any) {
            console.error('Signup failed', err);
            setError(err.response?.data?.detail || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = (provider: string) => {
        window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/auth/${provider}/`;
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans">
            <Card className="w-full max-w-md shadow-xl border-none bg-white dark:bg-slate-900 overflow-hidden">
                <CardHeader className="space-y-2 text-center pb-2 pt-8">
                    <div className="flex justify-center mb-4">
                        <div className="relative w-28 h-14">
                            <Image
                                src="/stockastic-logo-v3.png"
                                alt="Stockastic"
                                fill
                                className="object-contain dark:hidden"
                            />
                            <Image
                                src="/stockastic-logo-dark.png"
                                alt="Stockastic"
                                fill
                                className="object-contain hidden dark:block"
                            />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100 italic">Create Account</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">
                        Join the future of algorithmic trading
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 px-8 pb-8">
                    <form onSubmit={handleSignup} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 ml-1">Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                                <Input
                                    placeholder="yourname"
                                    className="pl-10 h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                                <Input
                                    type="email"
                                    placeholder="name@example.com"
                                    className="pl-10 h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    className="pl-10 h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                />
                            </div>
                            {/* Strength Meter */}
                            {formData.password.length > 0 && (
                                <div className="mt-2 space-y-1.5 px-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] font-bold text-slate-400">Strength: <span className={getStrengthColor().replace('bg-', 'text-')}>{getStrengthText()}</span></span>
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

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 ml-1">Confirm password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    className="pl-10 h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
                                    value={formData.confirm_password}
                                    onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-12 bg-slate-900 dark:bg-slate-100 hover:bg-black dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] text-[11px]"
                            disabled={loading}
                        >
                            {loading ? 'Creating Account...' : 'Sign Up'}
                        </Button>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-100 dark:border-slate-800" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-500 font-bold">Or continue with</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Button
                            variant="outline"
                            onClick={() => handleSocialLogin('google')}
                            className="h-12 rounded-xl dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <Chrome className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleSocialLogin('apple')}
                            className="h-12 rounded-xl dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <Apple className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleSocialLogin('microsoft')}
                            className="h-12 rounded-xl dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <Binary className="h-5 w-5" />
                        </Button>
                    </div>

                    <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                        Already have an account?{' '}
                        <Link href="/login" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">
                            Log in
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
