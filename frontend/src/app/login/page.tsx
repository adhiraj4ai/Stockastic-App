'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Cookies from 'js-cookie';
import { User, ShieldCheck, ArrowLeft, Eye, EyeOff, ChevronRight, AlertCircle, LayoutDashboard } from 'lucide-react';

export default function LoginPage() {
    const [selectedUser, setSelectedUser] = useState<'admin' | 'ashmi' | null>(null);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const users = [
        {
            id: 'admin',
            name: 'Jugal',
            title: 'Administrator',
            icon: ShieldCheck,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            border: 'border-slate-100 hover:border-blue-300'
        },
        {
            id: 'ashmi',
            name: 'Ashmi',
            title: 'Portfolio Manager',
            icon: User,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            border: 'border-slate-100 hover:border-purple-300'
        }
    ];

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        setError('');
        setLoading(true);

        let authSuccess = false;

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            console.log('Attempting login to:', `${apiUrl}/api/token/`);
            const response = await axios.post(`${apiUrl}/api/token/`, {
                username: selectedUser,
                password: password.trim(),
            });

            console.log('Login successful, setting cookies...');

            const { access, refresh } = response.data;

            // Store in LocalStorage (for client-side API calls if needed)
            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);

            // Store in Cookies (for Middleware authentication)
            // secure: false for localhost development
            const isSecure = window.location.protocol === 'https:';
            Cookies.set('access_token', access, { expires: 1, secure: isSecure, sameSite: 'lax' });
            Cookies.set('refresh_token', refresh, { expires: 7, secure: isSecure, sameSite: 'lax' });

            console.log('Redirecting to portfolio...');
            authSuccess = true;
            router.push('/portfolio');
        } catch (err: any) {
            console.error('Login failed', err);
            if (err.response) {
                setError(`Authentication failed: Invalid password.`);
            } else if (err.request) {
                setError(`Network error: System unreachable.`);
            } else {
                setError(`Error: ${err.message}`);
            }
        } finally {
            // Only stop loading if we failed. If success, we are redirecting, so keep "Verifying..." or similar
            // to prevent UI flicker/race conditions with DOM extensions.
            if (!authSuccess) {
                setLoading(false);
            }
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
            <Card className="w-full max-w-md shadow-xl border-none ring-0 bg-white">
                <CardHeader className="space-y-2 text-center pb-2 border-b border-slate-50 flex flex-col items-center pt-8">
                    <div className="relative w-44 h-28 mb-2">
                        <Image
                            src="/stockastic-logo-v3.png"
                            alt="Stockastic Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <CardDescription className="font-medium text-slate-500 text-sm">
                        {selectedUser ? `Welcome back, ${users.find(u => u.id === selectedUser)?.name}` : 'Select your workspace to continue'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-8 px-8 pb-8">
                    {!selectedUser ? (
                        <div className="grid grid-cols-1 gap-4">
                            {users.map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => setSelectedUser(user.id as any)}
                                    className={`group relative flex items-center gap-4 p-4 rounded-xl bg-white border transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${user.border}`}
                                >
                                    <div className={`p-3.5 rounded-xl ${user.bg} ${user.color} transition-transform group-hover:scale-105 shadow-sm`}>
                                        <user.icon size={24} strokeWidth={2} />
                                    </div>
                                    <div className="text-left flex-1 py-0.5">
                                        <div className="font-bold text-slate-900 text-base">{user.name}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.title}</div>
                                    </div>
                                    <div className="text-slate-300 group-hover:text-slate-500 transition-colors">
                                        <ChevronRight size={20} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-1.5 relative">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <ShieldCheck size={12} className="text-slate-400" />
                                    Security Code
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        autoFocus
                                        placeholder="Enter access code..."
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-12 bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 font-bold text-base pr-12 transition-all rounded-xl"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="bg-rose-50 text-rose-600 text-[11px] font-bold p-4 rounded-xl border border-rose-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                                    <AlertCircle className="h-5 w-5 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3 pt-2">
                                <Button
                                    type="submit"
                                    className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold text-xs tracking-widest uppercase transition-all shadow-lg shadow-slate-200 hover:shadow-xl hover:shadow-slate-300 active:scale-[0.98] rounded-xl flex items-center gap-2"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Authenticating...
                                        </>
                                    ) : (
                                        <>
                                            <LayoutDashboard size={16} />
                                            Enter Terminal
                                        </>
                                    )}
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedUser(null);
                                        setPassword('');
                                        setError('');
                                    }}
                                    className="w-full text-[10px] font-bold text-slate-400 hover:text-slate-600 py-2 flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider hover:bg-slate-50 rounded-lg"
                                >
                                    <ArrowLeft size={12} /> Switch Account
                                </button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
