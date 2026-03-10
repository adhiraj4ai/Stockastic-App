'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Palette, Save, Camera, Phone, Type, Fingerprint, ShieldCheck, RefreshCw, Eye, Monitor, Smartphone, Tablet, Globe, Trash2, LogOut, History, CheckCircle, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

interface UserSettings {
    id: number;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    nickname?: string;
    phone_number?: string;
    profile_picture?: string;
}

interface SessionInfo {
    id: number;
    device: string;
    browser: string;
    os: string;
    ip_address: string;
    location: string;
    is_current: boolean;
    created_at: string;
    last_active: string;
}

interface LoginActivity {
    status: 'SUCCESS' | 'FAILED';
    ip_address: string;
    user_agent: string;
    timestamp: string;
    location: string;
}

export default function SettingsPage() {
    const [user, setUser] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // File Upload Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 2FA State
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [show2faSetup, setShow2faSetup] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [setupLoading, setSetupLoading] = useState(false);

    // Security Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passLoading, setPassLoading] = useState(false);

    // Recovery Codes State
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
    const [fetchingCodes, setFetchingCodes] = useState(false);

    // Sessions State
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<number | null>(null);
    const [revokingAll, setRevokingAll] = useState(false);

    // Activity Log State
    const [loginActivities, setLoginActivities] = useState<LoginActivity[]>([]);

    // Password Strength
    const calculatePasswordStrength = (password: string) => {
        let strength = 0;
        if (password.length > 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return strength;
    };
    const passwordStrength = calculatePasswordStrength(newPassword);
    const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    const strengthColors = ['', 'bg-rose-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-400', 'bg-emerald-500'];

    useEffect(() => {
        api.get('/api/users/me/')
            .then(res => {
                setUser(res.data);
                setTwoFactorEnabled(res.data.two_factor_enabled);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load user", err);
                toast.error("Failed to load user settings.");
                setLoading(false);
            });
        fetchSessions();
        fetchActivity();
    }, []);

    const fetchActivity = async () => {
        try {
            const res = await api.get('/api/account/activity/');
            setLoginActivities(res.data.activity);
        } catch (error) {
            console.error("Failed to load activity log", error);
        }
    };

    const fetchSessions = async () => {
        setSessionsLoading(true);
        try {
            const res = await api.get('/api/sessions/');
            setSessions(res.data.sessions);
        } catch (error) {
            console.error("Failed to load sessions", error);
        } finally {
            setSessionsLoading(false);
        }
    };

    const handleRevokeSession = async (sessionId: number) => {
        setRevokingId(sessionId);
        try {
            await api.post(`/api/sessions/${sessionId}/revoke/`);
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            toast.success("Session revoked.");
        } catch (error) {
            toast.error("Failed to revoke session.");
        } finally {
            setRevokingId(null);
        }
    };

    const handleRevokeAllSessions = async () => {
        if (!confirm("Revoke all other sessions? You'll stay logged in on this device only.")) return;
        setRevokingAll(true);
        try {
            const res = await api.post('/api/sessions/revoke-all/');
            toast.success(`${res.data.revoked_count} session(s) revoked.`);
            fetchSessions(); // Refresh the list
        } catch (error) {
            toast.error("Failed to revoke sessions.");
        } finally {
            setRevokingAll(false);
        }
    };

    const getDeviceIcon = (device: string) => {
        switch (device.toLowerCase()) {
            case 'mobile': return <Smartphone size={18} />;
            case 'tablet': return <Tablet size={18} />;
            default: return <Monitor size={18} />;
        }
    };

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const handleSetup2FA = async () => {
        setSetupLoading(true);
        try {
            const res = await api.post('/api/account/2fa/setup/');
            setQrCode(res.data.qr_code);
            setShow2faSetup(true);
        } catch (error) {
            toast.error("Failed to initiate 2FA setup.");
        } finally {
            setSetupLoading(false);
        }
    };

    const handleVerify2FA = async () => {
        if (!twoFactorToken) return;
        try {
            await api.post('/api/account/2fa/verify/', { token: twoFactorToken });
            setTwoFactorEnabled(true);
            setShow2faSetup(false);
            setTwoFactorToken('');
            toast.success("2FA enabled successfully!");
        } catch (error) {
            toast.error("Invalid token. Please try again.");
        }
    };

    const handleDisable2FA = async () => {
        const token = prompt("Enter 2FA token to disable:");
        if (!token) return;
        try {
            await api.post('/api/account/2fa/disable/', { token });
            setTwoFactorEnabled(false);
            setRecoveryCodes([]); // Clear recovery codes locally
            toast.success("2FA disabled.");
        } catch (error) {
            toast.error("Failed to disable 2FA. Invalid token.");
        }
    };

    const handleFetchRecoveryCodes = async () => {
        const password = prompt("Enter your password to view recovery codes:");
        if (!password) return;
        setFetchingCodes(true);
        try {
            const res = await api.get('/api/account/2fa/recovery-codes/', { params: { password } });
            setRecoveryCodes(res.data.codes);
            setShowRecoveryCodes(true);
        } catch (error: any) {
            const msg = error.response?.data?.error || "Failed to fetch recovery codes.";
            toast.error(msg);
        } finally {
            setFetchingCodes(false);
        }
    };

    const handleGenerateRecoveryCodes = async () => {
        if (!confirm("Are you sure? This will invalidate all your previous recovery codes.")) return;
        const password = prompt("Enter your password to regenerate codes:");
        if (!password) return;
        setFetchingCodes(true);
        try {
            const res = await api.post('/api/account/2fa/recovery-codes/', { password });
            setRecoveryCodes(res.data.codes);
            toast.success("New recovery codes generated!");
        } catch (error: any) {
            const msg = error.response?.data?.error || "Failed to generate recovery codes.";
            toast.error(msg);
        } finally {
            setFetchingCodes(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const response = await api.put('/api/users/me/', user);
            setUser(response.data);
            toast.success("Profile updated successfully!");
        } catch (error) {
            console.error("Failed to save profile", error);
            toast.error("Failed to save profile changes.");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error("Please fill in all password fields.");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match.");
            return;
        }

        setPassLoading(true);
        try {
            await api.post('/api/users/change_password/', {
                current_password: currentPassword,
                new_password: newPassword
            });
            toast.success("Password updated successfully!");
            // Clear fields on success
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error("Password update failed", error);
            const errData = error.response?.data?.error;
            // Django validators return an array of error messages
            const msg = Array.isArray(errData) ? errData.join(' ') : (errData || "Failed to update password.");
            toast.error(msg);
        } finally {
            setPassLoading(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check size (2MB limit)
            if (file.size > 2 * 1024 * 1024) {
                toast.error("File size too large. Max 2MB.");
                return;
            }

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;
                if (user) {
                    // Update local state immediately for UI feedback
                    const updatedUser = { ...user, profile_picture: base64String };
                    setUser(updatedUser);

                    // Auto-save to backend
                    try {
                        toast.info("Uploading profile picture...");
                        await api.put('/api/users/me/', updatedUser);
                        toast.success("Profile picture updated!");
                    } catch (error) {
                        console.error("Failed to upload profile picture", error);
                        toast.error("Failed to upload profile picture.");
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    if (loading) {
        return <div className="p-8 flex justify-center font-bold text-slate-400">Loading settings...</div>;
    }

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-500">
                <div className="max-w-5xl mx-auto space-y-8">
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 italic">Settings</h1>
                            <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Refine your trading identity and security.</p>
                        </div>
                    </div>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm mb-8 h-auto flex flex-wrap">
                            <TabsTrigger
                                value="general"
                                className="rounded-xl data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 px-6 py-3 font-bold text-xs uppercase tracking-widest transition-all"
                            >
                                <User size={14} className="mr-2" /> General
                            </TabsTrigger>
                            <TabsTrigger
                                value="security"
                                className="rounded-xl data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 px-6 py-3 font-bold text-xs uppercase tracking-widest transition-all"
                            >
                                <Lock size={14} className="mr-2" /> Security
                            </TabsTrigger>
                        </TabsList>

                        {/* General Tab */}
                        <TabsContent value="general" className="space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Left Column: Avatar */}
                                <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden lg:col-span-1 h-fit">
                                    <CardContent className="p-8 flex flex-col items-center text-center">
                                        <div className="relative group cursor-pointer mb-6" onClick={triggerFileInput}>
                                            <div className="h-32 w-32 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 border-4 border-white dark:border-slate-900 shadow-xl overflow-hidden transition-all group-hover:scale-105">
                                                {user?.profile_picture ? (
                                                    <img src={user.profile_picture} alt="Profile" className="h-full w-full object-cover" />
                                                ) : (
                                                    <User size={64} />
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Camera size={32} className="text-white" />
                                                </div>
                                            </div>
                                        </div>
                                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xl">{user?.nickname || user?.username}</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{user?.email}</p>

                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleImageChange}
                                            accept="image/png, image/jpeg, image/gif"
                                            className="hidden"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={triggerFileInput}
                                            className="mt-6 w-full rounded-xl border-slate-100 dark:border-slate-800 font-bold text-[10px] uppercase tracking-widest"
                                        >
                                            Change Photo
                                        </Button>
                                    </CardContent>
                                </Card>

                                {/* Right Column: Details */}
                                <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden lg:col-span-2">
                                    <CardHeader className="border-b border-slate-50 dark:border-slate-800 pb-6">
                                        <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 italic">Personal Details</CardTitle>
                                        <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Public identity and contact information</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">First Name</label>
                                                <Input
                                                    value={user?.first_name || ''}
                                                    onChange={(e) => setUser(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                                                    className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Last Name</label>
                                                <Input
                                                    value={user?.last_name || ''}
                                                    onChange={(e) => setUser(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                                                    className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nickname</label>
                                                <Input
                                                    value={user?.nickname || ''}
                                                    onChange={(e) => setUser(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                                                    className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Phone Number</label>
                                                <Input
                                                    value={user?.phone_number || ''}
                                                    onChange={(e) => setUser(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                                                    className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-6 flex justify-end">
                                            <Button
                                                onClick={handleSaveProfile}
                                                disabled={saving}
                                                className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold px-8 h-12 shadow-lg hover:shadow-xl active:scale-95 transition-all uppercase text-[10px] tracking-widest"
                                            >
                                                {saving ? 'Saving...' : 'Save Changes'}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* Security Tab */}
                        <TabsContent value="security" className="space-y-6">
                            {/* 2FA Card */}
                            <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
                                <CardHeader className="border-b border-slate-50 dark:border-slate-800 flex flex-row items-center justify-between py-6">
                                    <div>
                                        <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 italic">Two-Factor Authentication</CardTitle>
                                        <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enhanced account protection</CardDescription>
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${twoFactorEnabled ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                                        {twoFactorEnabled ? 'Active' : 'Disabled'}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                        <div className="flex-1 max-w-xl">
                                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                                Two-factor authentication adds an extra layer of security to your account by requiring more than just a password to log in.
                                            </p>
                                        </div>
                                        {twoFactorEnabled ? (
                                            <Button
                                                onClick={handleDisable2FA}
                                                className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-xl font-bold px-8 h-12 shadow-none border border-rose-100 dark:border-rose-900/30 uppercase text-[10px] tracking-widest"
                                            >
                                                Disable 2FA
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={handleSetup2FA}
                                                disabled={setupLoading}
                                                className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold px-8 h-12 shadow-lg uppercase text-[10px] tracking-widest"
                                            >
                                                {setupLoading ? 'Loading...' : 'Enable 2FA'}
                                            </Button>
                                        )}
                                    </div>

                                    {/* 2FA Setup Flow */}
                                    {show2faSetup && !twoFactorEnabled && (
                                        <div className="mt-10 p-8 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col items-center animate-in zoom-in-95 duration-300">
                                            <div className="max-w-xs text-center space-y-6">
                                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Scan this QR Code</h3>
                                                <div className="bg-white p-4 rounded-3xl inline-block shadow-inner ring-8 ring-white/50 dark:ring-slate-800/50">
                                                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                                                </div>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                                    Use an app like Google Authenticator or Authy to scan this code, then enter the 6-digit verification token below.
                                                </p>
                                                <div className="space-y-4">
                                                    <Input
                                                        placeholder="Enter 6-digit code"
                                                        className="h-12 text-center text-xl font-mono tracking-widest bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl"
                                                        value={twoFactorToken}
                                                        onChange={(e) => setTwoFactorToken(e.target.value)}
                                                        maxLength={6}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => setShow2faSetup(false)}
                                                            className="flex-1 rounded-xl uppercase text-[10px] font-bold"
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            onClick={handleVerify2FA}
                                                            className="flex-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl uppercase text-[10px] font-bold"
                                                        >
                                                            Verify & Enable
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Recovery Codes Card */}
                            {twoFactorEnabled && (
                                <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                                    <CardHeader className="border-b border-slate-50 dark:border-slate-800 py-6">
                                        <div className="flex items-center justify-between w-full">
                                            <div>
                                                <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 italic">Recovery Codes</CardTitle>
                                                <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Backup access for your account</CardDescription>
                                            </div>
                                            <ShieldCheck size={24} className="text-emerald-500" />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-8">
                                        {!showRecoveryCodes ? (
                                            <div className="flex flex-col items-center text-center space-y-4 py-4">
                                                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg">
                                                    If you lose access to your authenticator app, you can use these recovery codes to log in. Store them in a safe place.
                                                </p>
                                                <Button
                                                    onClick={handleFetchRecoveryCodes}
                                                    disabled={fetchingCodes}
                                                    variant="outline"
                                                    className="rounded-xl font-bold px-8 h-12 uppercase text-[10px] tracking-widest border-slate-200 dark:border-slate-800 flex items-center gap-2"
                                                >
                                                    {fetchingCodes ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye size={14} />}
                                                    View Recovery Codes
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="space-y-8">
                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                    {recoveryCodes.map((code, idx) => (
                                                        <div key={idx} className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3 rounded-xl text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-300 shadow-inner">
                                                            {code}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-50 dark:border-slate-800">
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                        Keep these codes secure. They each work once.
                                                    </p>
                                                    <div className="flex gap-2 w-full md:w-auto">
                                                        <Button
                                                            onClick={handleGenerateRecoveryCodes}
                                                            disabled={fetchingCodes}
                                                            variant="outline"
                                                            className="flex-1 md:flex-none rounded-xl font-bold px-6 h-10 uppercase text-[10px] tracking-widest border-slate-200 dark:border-slate-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                                        >
                                                            Regenerate Codes
                                                        </Button>
                                                        <Button
                                                            onClick={() => setShowRecoveryCodes(false)}
                                                            className="flex-1 md:flex-none bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold px-6 h-10 uppercase text-[10px] tracking-widest"
                                                        >
                                                            Hide Codes
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Password Change Card */}
                            <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
                                <CardHeader className="border-b border-slate-50 dark:border-slate-800 py-6">
                                    <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 italic">Update Password</CardTitle>
                                    <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Change your security credentials</CardDescription>
                                </CardHeader>
                                <CardContent className="p-8 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Current Password</label>
                                            <Input
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">New Password</label>
                                            <Input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Confirm New Password</label>
                                            <Input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    {/* Password Strength Meter */}
                                    {newPassword && (
                                        <div className="space-y-2">
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4, 5].map((level) => (
                                                    <div
                                                        key={level}
                                                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${passwordStrength >= level
                                                            ? strengthColors[passwordStrength]
                                                            : 'bg-slate-100 dark:bg-slate-800'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                Strength: <span className={`${passwordStrength >= 4 ? 'text-emerald-500' : passwordStrength >= 3 ? 'text-yellow-500' : 'text-rose-500'}`}>{strengthLabels[passwordStrength]}</span>
                                            </p>
                                        </div>
                                    )}
                                    <div className="pt-4 flex justify-end">
                                        <Button
                                            onClick={handleUpdatePassword}
                                            disabled={passLoading}
                                            className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold px-8 h-12 shadow-lg uppercase text-[10px] tracking-widest"
                                        >
                                            {passLoading ? 'Updating...' : 'Update Password'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Active Sessions Card */}
                            <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
                                <CardHeader className="border-b border-slate-50 dark:border-slate-800 py-6">
                                    <div className="flex items-center justify-between w-full">
                                        <div>
                                            <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 italic">Active Sessions</CardTitle>
                                            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Devices logged into your account</CardDescription>
                                        </div>
                                        {sessions.length > 1 && (
                                            <Button
                                                onClick={handleRevokeAllSessions}
                                                disabled={revokingAll}
                                                variant="outline"
                                                className="rounded-xl font-bold px-6 h-10 uppercase text-[10px] tracking-widest border-rose-200 dark:border-rose-900/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                            >
                                                {revokingAll ? <RefreshCw className="h-3 w-3 animate-spin mr-2" /> : <LogOut size={12} className="mr-2" />}
                                                Revoke All Others
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {sessionsLoading ? (
                                        <div className="p-8 text-center text-slate-400 font-bold text-sm">Loading sessions...</div>
                                    ) : sessions.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 font-medium text-sm">No active sessions found.</div>
                                    ) : (
                                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                            {sessions.map((session) => (
                                                <div
                                                    key={session.id}
                                                    className={`flex items-center justify-between px-8 py-5 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${session.is_current ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <div className={`p-2.5 rounded-xl ${session.is_current
                                                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                            }`}>
                                                            {getDeviceIcon(session.device)}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                                                                    {session.browser} on {session.os}
                                                                </span>
                                                                {session.is_current && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                                                                        This Device
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                                                    <Globe size={10} />
                                                                    {session.ip_address}
                                                                </span>
                                                                <span className="text-[11px] text-slate-400 font-medium">
                                                                    Active {formatTimeAgo(session.last_active)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {!session.is_current && (
                                                        <Button
                                                            onClick={() => handleRevokeSession(session.id)}
                                                            disabled={revokingId === session.id}
                                                            variant="ghost"
                                                            className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl h-9 w-9 p-0"
                                                        >
                                                            {revokingId === session.id ? (
                                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Trash2 size={14} />
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Activity Log Card */}
                            <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
                                <CardHeader className="border-b border-slate-50 dark:border-slate-800 py-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">
                                            <History size={18} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 italic">Login Activity Log</CardTitle>
                                            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent authentication attempts</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {loginActivities.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 font-medium text-sm">No recent activity.</div>
                                    ) : (
                                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                            {loginActivities.map((activity, i) => (
                                                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between px-8 py-5 gap-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                    <div className="flex items-center gap-4">
                                                        {activity.status === 'SUCCESS' ? (
                                                            <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                                                        ) : (
                                                            <XCircle size={18} className="text-rose-500 flex-shrink-0" />
                                                        )}
                                                        <div>
                                                            <div className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                                                                {activity.user_agent ? activity.user_agent : 'Unknown Client'}
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                                                <span className="text-[11px] text-slate-400 font-medium">IP: {activity.ip_address || "Unknown"}</span>
                                                                {activity.location && (
                                                                    <>
                                                                        <span className="text-slate-300 dark:text-slate-700">•</span>
                                                                        <span className="text-[11px] text-slate-400 font-medium">{activity.location}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 font-medium flex-shrink-0 sm:text-right">
                                                        {formatTimeAgo(activity.timestamp)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </DashboardLayout>
    );
}

