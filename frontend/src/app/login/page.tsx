'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Cookies from 'js-cookie';
import { User, ShieldCheck, ArrowLeft, Eye, EyeOff, ChevronRight, AlertCircle } from 'lucide-react';

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
            border: 'border-blue-100 hover:border-blue-300'
        },
        {
            id: 'ashmi',
            name: 'Ashmi',
            title: 'Portfolio Manager',
            icon: User,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            border: 'border-purple-100 hover:border-purple-300'
        }
    ];

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        setError('');
        setLoading(true);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await axios.post(`${apiUrl}/api/token/`, {
                username: selectedUser,
                password: password.trim(),
            });

            const { access, refresh } = response.data;

            // Store in LocalStorage (for client-side API calls if needed)
            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);

            // Store in Cookies (for Middleware authentication)
            Cookies.set('access_token', access, { expires: 1, secure: true, sameSite: 'strict' });
            Cookies.set('refresh_token', refresh, { expires: 7, secure: true, sameSite: 'strict' });

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
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-2xl border-0 ring-1 ring-black/5 bg-white/90 backdrop-blur-xl">
                <CardHeader className="space-y-2 text-center pb-2 border-b border-slate-100/50 flex flex-col items-center pt-6">
                    <div className="relative w-44 h-28 mb-1 hover:scale-105 transition-transform duration-500 will-change-transform">
                        <Image
                            src="/stockastic-logo-v3.png"
                            alt="Stockastic Logo"
                            fill
                            className="object-contain drop-shadow-sm"
                            priority
                        />
                    </div>
                    <CardDescription className="font-medium text-slate-500 text-sm">
                        {selectedUser ? `Welcome back, ${users.find(u => u.id === selectedUser)?.name}` : 'Select your workspace'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 px-6 pb-6">
                    {!selectedUser ? (
                        <div className="grid grid-cols-1 gap-3">
                            {users.map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => setSelectedUser(user.id as any)}
                                    className={`group relative flex items-center gap-4 p-3 rounded-lg bg-white border border-slate-100 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${user.id === 'admin' ? 'hover:border-blue-200 hover:bg-blue-50/30' : 'hover:border-purple-200 hover:bg-purple-50/30'
                                        }`}
                                >
                                    <div className={`p-3 rounded-lg ${user.bg} ${user.color} transition-transform group-hover:scale-110 shadow-sm`}>
                                        <user.icon size={22} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-left flex-1 py-1">
                                        <div className="font-bold text-slate-900 text-base">{user.name}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.title}</div>
                                    </div>
                                    <div className="text-slate-200 group-hover:text-slate-400 transition-colors">
                                        <ChevronRight size={18} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-1.5 relative">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <ShieldCheck size={12} className="text-slate-400" />
                                    Security Clearance
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        autoFocus
                                        placeholder="Enter access key..."
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white font-bold text-base pr-12 transition-all rounded-lg shadow-inner"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 text-[10px] font-bold p-3 rounded-lg border border-red-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2 pt-1">
                                <Button
                                    type="submit"
                                    className="w-full h-11 bg-slate-900 hover:bg-black text-white font-bold text-xs tracking-widest uppercase transition-all shadow-md hover:shadow-slate-900/20 active:scale-[0.98] rounded-lg"
                                    disabled={loading}
                                >
                                    {loading ? 'Verifying...' : 'Access Terminal'}
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedUser(null);
                                        setPassword('');
                                        setError('');
                                    }}
                                    className="w-full text-[10px] font-bold text-slate-400 hover:text-slate-600 py-1.5 flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider"
                                >
                                    <ArrowLeft size={10} /> Switch Account
                                </button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
