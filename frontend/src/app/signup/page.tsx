'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Lock, AlertCircle, Chrome, Apple, Github } from 'lucide-react';

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

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirm_password) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            await api.post('/api/auth/registration/', {
                username: formData.username,
                email: formData.email,
                password: formData.password,
            });

            alert('Account created successfully! Please login.');
            router.push('/login');
        } catch (err: any) {
            console.error('Signup failed', err);
            setError(err.response?.data?.detail || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans">
            <Card className="w-full max-w-md shadow-xl border-none bg-white dark:bg-slate-900 overflow-hidden">
                <CardHeader className="space-y-2 text-center pb-2 pt-8">
                    <div className="flex justify-center mb-4">
                        <div className="relative w-32 h-16">
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
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Username</label>
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
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email</label>
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
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
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
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Confirm Password</label>
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
                            className="w-full h-12 bg-slate-900 dark:bg-slate-100 hover:bg-black dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
                            disabled={loading}
                        >
                            {loading ? 'Creating Account...' : 'Sign Up'}
                        </Button>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-100 dark:border-slate-800" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-500 font-bold">Or continue with</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Button variant="outline" className="h-12 rounded-xl dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                            <Chrome className="h-5 w-5" />
                        </Button>
                        <Button variant="outline" className="h-12 rounded-xl dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                            <Apple className="h-5 w-5" />
                        </Button>
                        <Button variant="outline" className="h-12 rounded-xl dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                            <Github className="h-5 w-5" />
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
