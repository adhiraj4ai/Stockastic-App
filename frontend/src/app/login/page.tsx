'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Cookies from 'js-cookie';
import { User, ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';

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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-xl border-slate-100">
                <CardHeader className="space-y-4 text-center pb-8 border-b border-slate-50">
                    <CardTitle className="text-3xl font-black text-slate-900 tracking-tight">
                        Stockastic<span className="text-blue-600">.</span>
                    </CardTitle>
                    <CardDescription className="font-medium text-slate-500">
                        {selectedUser ? `Welcome back, ${users.find(u => u.id === selectedUser)?.name}` : 'Select your account to continue'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-8 px-8 pb-8">
                    {!selectedUser ? (
                        <div className="grid grid-cols-1 gap-4">
                            {users.map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => setSelectedUser(user.id as any)}
                                    className={`group relative flex items-center gap-4 p-5 rounded-2xl bg-white border-2 transition-all duration-200 shadow-sm hover:shadow-md ${user.border}`}
                                >
                                    <div className={`p-4 rounded-xl ${user.bg} ${user.color} transition-transform group-hover:scale-110`}>
                                        <user.icon size={26} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="font-bold text-slate-900 text-lg">{user.name}</div>
                                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{user.title}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-2 relative">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                                    Verify Identity
                                </label>
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    autoFocus
                                    placeholder="Enter authorization key..."
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-12 bg-slate-50 border-slate-200 font-bold text-lg pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-9 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 text-xs font-bold p-4 rounded-xl border border-red-100 flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3">
                                <Button
                                    type="submit"
                                    className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold text-sm tracking-wide transition-all shadow-lg hover:shadow-xl"
                                    disabled={loading}
                                >
                                    {loading ? 'Authenticating...' : 'Access Terminal'}
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedUser(null);
                                        setPassword('');
                                        setError('');
                                    }}
                                    className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 py-2 flex items-center justify-center gap-1 transition-colors"
                                >
                                    <ArrowLeft size={12} /> cancel selection
                                </button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
