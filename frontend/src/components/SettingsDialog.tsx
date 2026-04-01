'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Palette, Save, Camera, Phone, Type, Fingerprint, ShieldCheck, RefreshCw, Eye, Monitor, Smartphone, Tablet, Globe, Trash2, LogOut, History, CheckCircle, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTheme } from "next-themes";

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

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const [user, setUser] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { theme, setTheme } = useTheme();

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

    useEffect(() => {
        if (open) {
            setLoading(true);
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
        }
    }, [open]);

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
            const msg = Array.isArray(errData) ? errData.join(' ') : (errData || "Failed to update password.");
            toast.error(msg);
        } finally {
            setPassLoading(false);
        }
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
                    const updatedUser = { ...user, profile_picture: base64String };
                    setUser(updatedUser);

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


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col bg-slate-50/98 dark:bg-slate-950/98 backdrop-blur-xl border-white/20 dark:border-slate-800 shadow-2xl p-0 gap-0">
                <Tabs defaultValue="general" className="flex-row w-full h-full" orientation="vertical">

                    {/* Left Sidebar (Full Height) */}
                    <div className="w-64 flex-none border-r border-slate-200/60 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col h-full">
                        {/* Header within sidebar */}
                        <div className="p-6 pb-4 border-b border-slate-200/50 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                            <DialogTitle className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                Settings
                            </DialogTitle>
                            <p className="text-slate-500 dark:text-slate-400 font-medium text-xs mt-1">Manage your account preferences.</p>
                        </div>

                        {/* Navigation Items */}
                        <div className="flex-1 overflow-y-auto p-3">
                            <TabsList className="flex flex-col h-auto bg-transparent gap-1 w-full justify-start items-stretch p-0">
                                <TabsTrigger
                                    value="general"
                                    className="w-full justify-start rounded-md px-3 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-950/30 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 data-[state=active]:shadow-none hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <User size={18} className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400" />
                                        <span>General</span>
                                    </div>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="appearance"
                                    className="w-full justify-start rounded-md px-3 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-950/30 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 data-[state=active]:shadow-none hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Palette size={18} className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400" />
                                        <span>Appearance</span>
                                    </div>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="security"
                                    className="w-full justify-start rounded-md px-3 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-950/30 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 data-[state=active]:shadow-none hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Lock size={18} className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400" />
                                        <span>Security</span>
                                    </div>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* User Mini Profile at bottom of sidebar */}
                        <div className="p-4 border-t border-slate-200/50 dark:border-slate-800 bg-slate-100/30 dark:bg-slate-800/30">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                                    {user?.profile_picture ? (
                                        <img src={user.profile_picture} alt={user.username} className="h-full w-full object-cover" />
                                    ) : (
                                        <User size={16} className="text-slate-400 dark:text-slate-500" />
                                    )}
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{user?.first_name || user?.username || 'User'}</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Content Area (Full Height) */}
                    <div className="flex-1 flex flex-col bg-white/30 dark:bg-slate-950/30 h-full overflow-hidden relative">
                        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                            {/* General / Profile Tab */}
                            <TabsContent value="general" className="space-y-6 focus-visible:outline-none mt-0 max-w-4xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                {loading ? (
                                    <div className="flex justify-center items-center h-full min-h-[400px]">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-8">
                                            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">General settings</h2>
                                            <p className="text-slate-500 dark:text-slate-400 mt-1">Update your personal information and profile picture.</p>
                                        </div>

                                        {/* Profile Picture Section */}
                                        <div className="flex flex-col sm:flex-row items-center gap-8 p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                            <div className="relative group cursor-pointer" onClick={triggerFileInput}>
                                                <div className="h-24 w-24 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-300 border-[3px] border-white shadow-lg overflow-hidden ring-4 ring-indigo-50/60 transition-all group-hover:scale-105 group-hover:ring-indigo-100 dark:border-slate-800">
                                                    {user?.profile_picture ? (
                                                        <img src={user.profile_picture} alt="Profile" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <User size={40} />
                                                    )}
                                                </div>
                                                <button className="absolute bottom-0 right-0 p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition-colors shadow-md ring-2 ring-white">
                                                    <Camera size={14} />
                                                </button>
                                            </div>
                                            <div className="flex-1 space-y-2 text-center sm:text-left">
                                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Profile Picture</h3>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto sm:mx-0">
                                                    Supports JPG, PNG and GIF. Max file size 2MB.
                                                </p>
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    onChange={handleImageChange}
                                                    accept="image/png, image/jpeg, image/gif"
                                                    className="hidden"
                                                />
                                                <div className="pt-1">
                                                    <Button variant="outline" size="sm" onClick={triggerFileInput} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 font-semibold dark:border-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300">
                                                        Upload New Photo
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Personal Info Section */}
                                        <div className="space-y-6 bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                            <h3 className="font-bold text-slate-900 dark:text-slate-100 border-b dark:border-slate-800 pb-3 mb-6 text-base">Personal Information</h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="font-semibold tracking-tight text-slate-500 dark:text-slate-400 ml-1">
                                                        First name
                                                    </label>
                                                    <Input
                                                        value={user?.first_name || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                                                        placeholder="e.g. John"
                                                        className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xss tracking-tight font-semibold text-slate-500 dark:text-slate-400 ml-1">
                                                        Last name
                                                    </label>
                                                    <Input
                                                        value={user?.last_name || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                                                        placeholder="e.g. Doe"
                                                        className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xss tracking-tight font-semibold text-slate-500 dark:text-slate-400 ml-1">
                                                        Nickname
                                                    </label>
                                                    <Input
                                                        value={user?.nickname || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                                                        placeholder="e.g. Johnny"
                                                        className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xss tracking-tight font-semibold text-slate-500 dark:text-slate-400 ml-1">
                                                        Phone
                                                    </label>
                                                    <Input
                                                        value={user?.phone_number || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                                                        placeholder="+1 (555) 000-0000"
                                                        className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-2">
                                                <label className="text-xss tracking-tight font-semibold text-slate-500 dark:text-slate-400 ml-1">Email address</label>
                                                <Input
                                                    value={user?.email || ''}
                                                    onChange={(e) => setUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                                    placeholder="your@email.com"
                                                    className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xss tracking-tight font-semibold text-slate-500 dark:text-slate-400 ml-1">Username</label>
                                                <Input value={user?.username || ''} disabled className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium cursor-not-allowed border-slate-200 dark:border-slate-700" />
                                                <p className="text-xs text-slate-400 dark:text-slate-500 ml-1">Username cannot be changed.</p>
                                            </div>

                                            <div className="pt-6 flex justify-end border-t border-slate-100 dark:border-slate-800 mt-2">
                                                <Button onClick={handleSaveProfile} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/20 transition-all hover:scale-[1.02] active:scale-[0.98] px-6">
                                                    <Save size={16} className="mr-2" /> {saving ? 'Saving Changes...' : 'Save Profile Changes'}
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </TabsContent>

                            {/* Appearance Tab */}
                            <TabsContent value="appearance" className="focus-visible:outline-none mt-0 max-w-4xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Appearance</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1">Customize the look and feel of the application.</p>
                                </div>

                                <div className="space-y-6 bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div>
                                            <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">Theme Preference</div>
                                            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-[280px]">Select your preferred interface theme. Setting the system appearance automatically adapts to your OS settings.</div>
                                        </div>
                                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTheme("dark")}
                                                className={`h-10 px-4 font-medium transition-all ${theme === 'dark' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-700 dark:text-indigo-400 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                            >
                                                Dark
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTheme("light")}
                                                className={`h-10 px-4 font-medium transition-all ${theme === 'light' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-700 dark:text-indigo-400 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                            >
                                                Light
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTheme("system")}
                                                className={`h-10 px-4 font-medium transition-all ${theme === 'system' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-700 dark:text-indigo-400 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                            >
                                                System
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Security Tab */}
                            <TabsContent value="security" className="focus-visible:outline-none mt-0 max-w-4xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Security</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your password, 2FA, and active sessions.</p>
                                </div>

                                <div className="space-y-8">
                                    {/* 2FA Card */}
                                    <div className="bg-white dark:bg-slate-900 overflow-hidden rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                        <div className="border-b border-slate-50 dark:border-slate-800 flex flex-row items-center justify-between p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                    <Fingerprint size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Two-Factor Authentication</h3>
                                                    <p className="text-xs font-medium text-slate-400">Enhanced account protection</p>
                                                </div>
                                            </div>
                                            <div className={`px-4 py-1.5 rounded-full text-xs font-bold ${twoFactorEnabled ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                                {twoFactorEnabled ? 'Active' : 'Disabled'}
                                            </div>
                                        </div>
                                        <div className="p-6 md:p-8">
                                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                                <div className="flex-1 max-w-xl">
                                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                                        Two-factor authentication adds an extra layer of security to your account by requiring more than just a password to log in.
                                                    </p>
                                                </div>
                                                {twoFactorEnabled ? (
                                                    <Button
                                                        onClick={handleDisable2FA}
                                                        className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 font-bold px-8 shadow-none border border-rose-100 dark:border-rose-900/30 transition-all"
                                                    >
                                                        Disable 2FA
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        onClick={handleSetup2FA}
                                                        disabled={setupLoading}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/20 transition-all"
                                                    >
                                                        {setupLoading ? 'Loading...' : 'Enable 2FA'}
                                                    </Button>
                                                )}
                                            </div>

                                            {/* 2FA Setup Flow */}
                                            {show2faSetup && !twoFactorEnabled && (
                                                <div className="mt-8 p-8 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center animate-in zoom-in-95 duration-300">
                                                    <div className="max-w-xs text-center space-y-6">
                                                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Scan this QR Code</h4>
                                                        <div className="bg-white p-4 rounded-2xl inline-block shadow-sm border border-slate-100 dark:border-slate-700">
                                                            <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                                                        </div>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                                            Use an app like Google Authenticator or Authy to scan this code, then enter the 6-digit verification token below.
                                                        </p>
                                                        <div className="space-y-4">
                                                            <Input
                                                                placeholder="Enter 6-digit code"
                                                                className="h-12 text-center text-xl font-mono tracking-widest bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl focus:ring-indigo-500 focus:border-indigo-500"
                                                                value={twoFactorToken}
                                                                onChange={(e) => setTwoFactorToken(e.target.value)}
                                                                maxLength={6}
                                                            />
                                                            <div className="flex gap-3">
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => setShow2faSetup(false)}
                                                                    className="flex-1 font-bold dark:border-slate-700 dark:hover:bg-slate-800"
                                                                >
                                                                    Cancel
                                                                </Button>
                                                                <Button
                                                                    onClick={handleVerify2FA}
                                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-200/50 dark:shadow-none"
                                                                >
                                                                    Verify & Enable
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Recovery Codes Card */}
                                    {twoFactorEnabled && (
                                        <div className="bg-white dark:bg-slate-900 overflow-hidden rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="border-b border-slate-50 dark:border-slate-800 flex items-center justify-between p-6 w-full">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                                                        <ShieldCheck size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Recovery Codes</h3>
                                                        <p className="text-xs font-medium text-slate-400">Backup access for your account</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-6 md:p-8">
                                                {!showRecoveryCodes ? (
                                                    <div className="flex flex-col items-center text-center space-y-4 py-4">
                                                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg">
                                                            If you lose access to your authenticator app, you can use these recovery codes to log in. Store them in a safe place.
                                                        </p>
                                                        <Button
                                                            onClick={handleFetchRecoveryCodes}
                                                            disabled={fetchingCodes}
                                                            variant="outline"
                                                            className="font-bold px-8 border-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 flex items-center gap-2"
                                                        >
                                                            {fetchingCodes ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye size={16} />}
                                                            View Recovery Codes
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-6">
                                                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                                            {recoveryCodes.map((code, idx) => (
                                                                <div key={idx} className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3 rounded-lg text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-300 shadow-sm">
                                                                    {code}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                                Keep these codes secure. They each work once.
                                                            </p>
                                                            <div className="flex gap-3 w-full sm:w-auto">
                                                                <Button
                                                                    onClick={handleGenerateRecoveryCodes}
                                                                    disabled={fetchingCodes}
                                                                    variant="outline"
                                                                    className="flex-1 sm:flex-none font-bold border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                                                >
                                                                    Regenerate Codes
                                                                </Button>
                                                                <Button
                                                                    onClick={() => setShowRecoveryCodes(false)}
                                                                    className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold"
                                                                >
                                                                    Hide Codes
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Password Update Card */}
                                    <div className="bg-white dark:bg-slate-900 overflow-hidden rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                        <div className="border-b border-slate-50 dark:border-slate-800 flex flex-row items-center p-6 gap-3">
                                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                <Lock size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Change Password</h3>
                                                <p className="text-xs font-medium text-slate-400">Update your account credentials</p>
                                            </div>
                                        </div>

                                        <div className="p-6 md:p-8 space-y-6">
                                            <div className="grid grid-cols-1 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Current Password</label>
                                                    <Input
                                                        type="password"
                                                        value={currentPassword}
                                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                                        placeholder="Enter your current password"
                                                        className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">New Password</label>
                                                            <Input
                                                                type="password"
                                                                value={newPassword}
                                                                onChange={(e) => setNewPassword(e.target.value)}
                                                                placeholder="Create a new password"
                                                                className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                            />
                                                        </div>
                                                        {newPassword && (
                                                            <div className="space-y-2">
                                                                <div className="flex gap-1.5 h-1.5">
                                                                    {[1, 2, 3, 4, 5].map((level) => (
                                                                        <div
                                                                            key={level}
                                                                            className={`flex-1 rounded-full transition-all duration-300 ${passwordStrength >= level
                                                                                ? strengthColors[passwordStrength]
                                                                                : 'bg-slate-100 dark:bg-slate-800'
                                                                                }`}
                                                                        />
                                                                    ))}
                                                                </div>
                                                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex justify-between">
                                                                    <span>Strength</span>
                                                                    <span className={`${passwordStrength >= 4 ? 'text-emerald-500' : passwordStrength >= 3 ? 'text-yellow-500' : 'text-rose-500'}`}>
                                                                        {strengthLabels[passwordStrength]}
                                                                    </span>
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Confirm New Password</label>
                                                        <Input
                                                            type="password"
                                                            value={confirmPassword}
                                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                                            placeholder="Confirm your new password"
                                                            className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-6 flex justify-end border-t border-slate-100 dark:border-slate-800 mt-2">
                                                <Button onClick={handleUpdatePassword} disabled={passLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/20 transition-all hover:scale-[1.02] active:scale-[0.98] px-6">
                                                    <Save size={16} className="mr-2" /> {passLoading ? 'Updating Password...' : 'Update Password'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Active Sessions Card */}
                                    <div className="bg-white dark:bg-slate-900 overflow-hidden rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                        <div className="border-b border-slate-50 dark:border-slate-800 py-6 px-6 flex items-center justify-between w-full">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                    <Monitor size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Active Sessions</h3>
                                                    <p className="text-xs font-medium text-slate-400">Devices logged into your account</p>
                                                </div>
                                            </div>
                                            {sessions.length > 1 && (
                                                <Button
                                                    onClick={handleRevokeAllSessions}
                                                    disabled={revokingAll}
                                                    variant="outline"
                                                    className="font-bold px-4 md:px-6 border-rose-200 dark:border-rose-900/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                                >
                                                    {revokingAll ? <RefreshCw className="h-4 w-4 animate-spin md:mr-2" /> : <LogOut size={16} className="md:mr-2" />}
                                                    <span className="hidden md:inline">Revoke All Others</span>
                                                </Button>
                                            )}
                                        </div>
                                        <div className="p-0">
                                            {sessionsLoading ? (
                                                <div className="p-8 text-center text-slate-400 font-bold text-sm">Loading sessions...</div>
                                            ) : sessions.length === 0 ? (
                                                <div className="p-8 text-center text-slate-400 font-medium text-sm">No active sessions found.</div>
                                            ) : (
                                                <div className="divide-y divide-slate-50 dark:divide-slate-800/80">
                                                    {sessions.map((session) => (
                                                        <div
                                                            key={session.id}
                                                            className={`flex items-center justify-between px-6 md:px-8 py-5 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${session.is_current ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                                <div className={`p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 ${session.is_current
                                                                    ? 'bg-emerald-100/50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-900/30'
                                                                    : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                                                                    }`}>
                                                                    {getDeviceIcon(session.device)}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                                                                            {session.browser} on {session.os}
                                                                        </span>
                                                                        {session.is_current && (
                                                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                                                                This Device
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 mt-1 text-xs">
                                                                        <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                                                                            <Globe size={12} />
                                                                            {session.ip_address}
                                                                        </span>
                                                                        <span className="text-slate-300 dark:text-slate-700">•</span>
                                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">
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
                                                                    className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl h-10 w-10 p-0 ml-4 flex-shrink-0"
                                                                >
                                                                    {revokingId === session.id ? (
                                                                        <RefreshCw className="h-5 w-5 animate-spin" />
                                                                    ) : (
                                                                        <Trash2 size={18} />
                                                                    )}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Activity Log Card */}
                                    <div className="bg-white dark:bg-slate-900 overflow-hidden rounded-2xl shadow-sm border border-slate-100/80 dark:border-slate-700">
                                        <div className="border-b border-slate-50 dark:border-slate-800 py-6 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                    <History size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Login Activity Log</h3>
                                                    <p className="text-xs font-medium text-slate-400">Recent authentication attempts</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-0">
                                            {loginActivities.length === 0 ? (
                                                <div className="p-8 text-center text-slate-400 font-medium text-sm">No recent activity.</div>
                                            ) : (
                                                <div className="divide-y divide-slate-50 dark:divide-slate-800/80 max-h-[400px] overflow-y-auto">
                                                    {loginActivities.map((activity, i) => (
                                                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-8 py-4 gap-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                            <div className="flex items-center gap-4 min-w-0">
                                                                <div className={`p-2 rounded-full border shadow-sm ${activity.status === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 border-emerald-100 dark:border-emerald-900/30' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 border-rose-100 dark:border-rose-900/30'}`}>
                                                                    {activity.status === 'SUCCESS' ? (
                                                                        <CheckCircle size={16} />
                                                                    ) : (
                                                                        <XCircle size={16} />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1 break-all">
                                                                        {activity.user_agent ? activity.user_agent : 'Unknown Client'}
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">IP: {activity.ip_address || "Unknown"}</span>
                                                                        {activity.location && (
                                                                            <>
                                                                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                                                                <span className="text-slate-500 dark:text-slate-400 font-medium line-clamp-1">{activity.location}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-slate-400 font-medium flex-shrink-0 sm:text-right">
                                                                {formatTimeAgo(activity.timestamp)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </TabsContent>
                        </div>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

