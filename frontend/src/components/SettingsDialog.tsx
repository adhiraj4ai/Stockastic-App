'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Palette, Save, Camera, Phone, Type, Fingerprint } from 'lucide-react';
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

    // Security Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passLoading, setPassLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setLoading(true);
            api.get('/api/users/me/')
                .then(res => {
                    setUser(res.data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Failed to load user", err);
                    toast.error("Failed to load user settings.");
                    setLoading(false);
                });
        }
    }, [open]);

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
            const msg = error.response?.data?.error || "Failed to update password.";
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[70vw] max-w-[70vw] sm:max-w-[70vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col bg-slate-50/95 backdrop-blur-xl border-white/20 shadow-2xl p-0 gap-0">
                <Tabs defaultValue="general" className="flex-row w-full h-full" orientation="vertical">

                    {/* Left Sidebar (Full Height) */}
                    <div className="w-64 flex-none border-r border-slate-200/60 bg-slate-50/50 flex flex-col h-full">
                        {/* Header within sidebar */}
                        <div className="p-6 pb-4 border-b border-slate-200/50 bg-white/50 backdrop-blur-md">
                            <DialogTitle className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                                Settings
                            </DialogTitle>
                            <p className="text-slate-500 font-medium text-xs mt-1">Manage your account preferences.</p>
                        </div>

                        {/* Navigation Items */}
                        <div className="flex-1 overflow-y-auto p-3">
                            <TabsList className="flex flex-col h-auto bg-transparent gap-1 w-full justify-start items-stretch p-0">
                                <TabsTrigger
                                    value="general"
                                    className="w-full justify-start rounded-md px-3 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none hover:bg-slate-100 text-slate-600 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <User size={18} className="text-slate-400 group-hover:text-slate-600 data-[state=active]:text-indigo-600" />
                                        <span>General</span>
                                    </div>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="appearance"
                                    className="w-full justify-start rounded-md px-3 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none hover:bg-slate-100 text-slate-600 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Palette size={18} className="text-slate-400 group-hover:text-slate-600 data-[state=active]:text-indigo-600" />
                                        <span>Appearance</span>
                                    </div>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="security"
                                    className="w-full justify-start rounded-md px-3 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none hover:bg-slate-100 text-slate-600 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Lock size={18} className="text-slate-400 group-hover:text-slate-600 data-[state=active]:text-indigo-600" />
                                        <span>Security</span>
                                    </div>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* User Mini Profile at bottom of sidebar */}
                        <div className="p-4 border-t border-slate-200/50 bg-slate-100/30">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                                    {user?.profile_picture ? (
                                        <img src={user.profile_picture} alt={user.username} className="h-full w-full object-cover" />
                                    ) : (
                                        <User size={16} className="text-slate-400" />
                                    )}
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-bold text-slate-700 truncate">{user?.first_name || user?.username || 'User'}</span>
                                    <span className="text-[10px] text-slate-500 truncate">{user?.email}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Content Area (Full Height) */}
                    <div className="flex-1 flex flex-col bg-white/30 h-full overflow-hidden relative">
                        <div className="flex-1 overflow-y-auto p-8 lg:p-10">
                            {/* General / Profile Tab */}
                            <TabsContent value="general" className="space-y-6 focus-visible:outline-none mt-0 max-w-3xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                {loading ? (
                                    <div className="flex justify-center items-center h-full min-h-[400px]">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-8">
                                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">General Settings</h2>
                                            <p className="text-slate-500 mt-1">Update your personal information and profile picture.</p>
                                        </div>

                                        {/* Profile Picture Section */}
                                        <div className="flex flex-col sm:flex-row items-center gap-8 p-8 bg-white rounded-2xl shadow-sm border border-slate-100/80">
                                            <div className="relative group cursor-pointer" onClick={triggerFileInput}>
                                                <div className="h-24 w-24 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-300 border-[3px] border-white shadow-lg overflow-hidden ring-4 ring-indigo-50/60 transition-all group-hover:scale-105 group-hover:ring-indigo-100">
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
                                                <h3 className="font-bold text-slate-900 text-lg">Profile Picture</h3>
                                                <p className="text-sm text-slate-500 max-w-xs mx-auto sm:mx-0">
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
                                                    <Button variant="outline" size="sm" onClick={triggerFileInput} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 font-semibold">
                                                        Upload New Photo
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Personal Info Section */}
                                        <div className="space-y-6 bg-white p-8 rounded-2xl shadow-sm border border-slate-100/80">
                                            <h3 className="font-bold text-slate-900 border-b pb-3 mb-6 text-base">Personal Information</h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-xss uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1.5 ml-1">
                                                        First Name
                                                    </label>
                                                    <Input
                                                        value={user?.first_name || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                                                        placeholder="e.g. John"
                                                        className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xss uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1.5 ml-1">
                                                        Last Name
                                                    </label>
                                                    <Input
                                                        value={user?.last_name || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                                                        placeholder="e.g. Doe"
                                                        className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xss uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1.5 ml-1">
                                                        Nickname
                                                    </label>
                                                    <Input
                                                        value={user?.nickname || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                                                        placeholder="e.g. Johnny"
                                                        className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xss uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1.5 ml-1">
                                                        Phone
                                                    </label>
                                                    <Input
                                                        value={user?.phone_number || ''}
                                                        onChange={(e) => setUser(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                                                        placeholder="+1 (555) 000-0000"
                                                        className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-2">
                                                <label className="text-xss uppercase tracking-wider font-bold text-slate-500 ml-1">Email Address</label>
                                                <Input
                                                    value={user?.email || ''}
                                                    onChange={(e) => setUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                                    placeholder="your@email.com"
                                                    className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xss uppercase tracking-wider font-bold text-slate-500 ml-1">Username</label>
                                                <Input value={user?.username || ''} disabled className="bg-slate-100 text-slate-500 font-medium cursor-not-allowed border-slate-200" />
                                                <p className="text-xs text-slate-400 ml-1">Username cannot be changed.</p>
                                            </div>

                                            <div className="pt-6 flex justify-end border-t border-slate-100 mt-2">
                                                <Button onClick={handleSaveProfile} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200/50 transition-all hover:scale-[1.02] active:scale-[0.98] px-6">
                                                    <Save size={16} className="mr-2" /> {saving ? 'Saving Changes...' : 'Save Profile Changes'}
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </TabsContent>

                            {/* Appearance Tab */}
                            <TabsContent value="appearance" className="focus-visible:outline-none mt-0 max-w-3xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                <div className="mb-8">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Appearance</h2>
                                    <p className="text-slate-500 mt-1">Customize the look and feel of the application.</p>
                                </div>

                                <div className="space-y-6 bg-white p-8 rounded-2xl shadow-sm border border-slate-100/80">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-slate-800 dark:text-slate-100">Theme Preference</div>
                                            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Select your preferred interface theme.</div>
                                        </div>
                                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTheme("dark")}
                                                className={`h-8 text-xs font-medium hover:shadow-sm ${theme === 'dark' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-600 dark:text-indigo-400 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                            >
                                                Dark
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTheme("light")}
                                                className={`h-8 text-xs font-medium hover:shadow-sm ${theme === 'light' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-600 dark:text-indigo-400 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                            >
                                                Light
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTheme("system")}
                                                className={`h-8 text-xs font-medium hover:shadow-sm ${theme === 'system' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-600 dark:text-indigo-400 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'}`}
                                            >
                                                System
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Security Tab */}
                            <TabsContent value="security" className="focus-visible:outline-none mt-0 max-w-3xl mx-auto animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                <div className="mb-8">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Security</h2>
                                    <p className="text-slate-500 mt-1">Manage your password and security settings.</p>
                                </div>

                                <div className="space-y-6 bg-white p-8 rounded-2xl shadow-sm border border-slate-100/80">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                            <Lock size={20} />
                                        </div>
                                        <h3 className="font-bold text-slate-900 text-lg">Change Password</h3>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 ml-1">Current Password</label>
                                            <Input
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                placeholder="Enter your current password"
                                                className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 ml-1">New Password</label>
                                                <Input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="Create a new password"
                                                    className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 ml-1">Confirm New Password</label>
                                                <Input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="Confirm your new password"
                                                    className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 flex justify-end border-t border-slate-100 mt-2">
                                        <Button onClick={handleUpdatePassword} disabled={passLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200/50 transition-all hover:scale-[1.02] active:scale-[0.98] px-6">
                                            <Save size={16} className="mr-2" /> {passLoading ? 'Updating Password...' : 'Update Password'}
                                        </Button>
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
