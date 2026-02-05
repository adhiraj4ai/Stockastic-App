'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Palette, Save, Camera, Phone, Type, Fingerprint } from 'lucide-react';
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

export default function SettingsPage() {
    const [user, setUser] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // File Upload Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Security Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passLoading, setPassLoading] = useState(false);

    useEffect(() => {
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
    }, []);

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
        return <div className="p-8 flex justify-center">Loading settings...</div>;
    }

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-8">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-slate-800">Settings</h1>
                        <p className="text-slate-500 font-medium mt-1">Manage your account settings and preferences.</p>
                    </div>

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="bg-white/50 backdrop-blur-sm p-1 rounded-xl border border-white/20 shadow-sm mb-6 h-auto">
                            <TabsTrigger
                                value="general"
                                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 font-bold text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    <User size={16} /> General
                                </div>
                            </TabsTrigger>
                            <TabsTrigger
                                value="appearance"
                                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 font-bold text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    <Palette size={16} /> Appearance
                                </div>
                            </TabsTrigger>
                            <TabsTrigger
                                value="security"
                                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 font-bold text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    <Lock size={16} /> Security
                                </div>
                            </TabsTrigger>
                        </TabsList>

                        {/* General / Profile Tab */}
                        <TabsContent value="general" className="space-y-6">
                            {/* Profile Picture Card */}
                            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md overflow-hidden">
                                <CardHeader className="border-b border-indigo-50/50 bg-white/40">
                                    <CardTitle className="text-xl font-bold text-slate-800">Profile Picture</CardTitle>
                                    <CardDescription>Update your public profile photo.</CardDescription>
                                </CardHeader>
                                <CardContent className="flex items-center gap-8 p-8">
                                    <div className="relative group cursor-pointer" onClick={triggerFileInput}>
                                        <div className="h-28 w-28 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-300 border-4 border-white shadow-lg overflow-hidden ring-4 ring-indigo-50/50 transition-all group-hover:scale-105">
                                            {user?.profile_picture ? (
                                                <img src={user.profile_picture} alt="Profile" className="h-full w-full object-cover" />
                                            ) : (
                                                <User size={48} />
                                            )}
                                        </div>
                                        <button className="absolute bottom-1 right-1 p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition-colors shadow-md ring-2 ring-white">
                                            <Camera size={16} />
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-lg">Upload new photo</h3>
                                            <p className="text-sm text-slate-500">Supports JPG, PNG or GIF. Max size 2MB.</p>
                                        </div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleImageChange}
                                            accept="image/png, image/jpeg, image/gif"
                                            className="hidden"
                                        />
                                        <Button variant="outline" onClick={triggerFileInput} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800">
                                            Select File
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Personal Info Card */}
                            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md overflow-hidden">
                                <CardHeader className="border-b border-indigo-50/50 bg-white/40">
                                    <CardTitle className="text-xl font-bold text-slate-800">Personal Information</CardTitle>
                                    <CardDescription>Update your personal details.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Type size={14} className="text-indigo-400" /> First Name
                                            </label>
                                            <Input
                                                value={user?.first_name || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                                                placeholder="First Name"
                                                className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Type size={14} className="text-indigo-400" /> Last Name
                                            </label>
                                            <Input
                                                value={user?.last_name || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                                                placeholder="Last Name"
                                                className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Fingerprint size={14} className="text-indigo-400" /> Nickname
                                            </label>
                                            <Input
                                                value={user?.nickname || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                                                placeholder="Nickname"
                                                className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                            <p className="text-[11px] font-medium text-slate-400">Display name for community interactions.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Phone size={14} className="text-indigo-400" /> Phone Number
                                            </label>
                                            <Input
                                                value={user?.phone_number || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                                                placeholder="+977 98..."
                                                className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-4 border-t border-slate-100">
                                        <label className="text-sm font-bold text-slate-700">Email Address</label>
                                        <Input
                                            value={user?.email || ''}
                                            onChange={(e) => setUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                            placeholder="your@email.com"
                                            className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Username</label>
                                        <Input value={user?.username || ''} disabled className="bg-slate-100/50 text-slate-500 font-medium" />
                                        <p className="text-[11px] font-medium text-slate-400">Usernames cannot be changed.</p>
                                    </div>

                                    <div className="pt-6 flex justify-end">
                                        <Button onClick={handleSaveProfile} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                            <Save size={16} className="mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Appearance Tab */}
                        <TabsContent value="appearance">
                            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md overflow-hidden">
                                <CardHeader className="border-b border-indigo-50/50 bg-white/40">
                                    <CardTitle className="text-xl font-bold text-slate-800">Appearance</CardTitle>
                                    <CardDescription>Customize the look and feel of the application.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <div className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-xl shadow-sm">
                                        <div>
                                            <div className="font-bold text-slate-800">Theme</div>
                                            <div className="text-sm font-medium text-slate-500">Select your preferred interface theme.</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="bg-slate-900 text-white hover:bg-slate-800 hover:text-white border-slate-900 shadow-md">Dark</Button>
                                            <Button variant="outline" className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50">Light</Button>
                                            <Button variant="default" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 shadow-sm">System</Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Security Tab */}
                        <TabsContent value="security">
                            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md overflow-hidden">
                                <CardHeader className="border-b border-indigo-50/50 bg-white/40">
                                    <CardTitle className="text-xl font-bold text-slate-800">Security</CardTitle>
                                    <CardDescription>Manage your password and security settings.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 p-8">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Current Password</label>
                                        <Input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">New Password</label>
                                        <Input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Confirm New Password</label>
                                        <Input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="bg-white/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="pt-4 flex justify-end">
                                        <Button onClick={handleUpdatePassword} disabled={passLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                            <Save size={16} className="mr-2" /> {passLoading ? 'Updating...' : 'Update Password'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </DashboardLayout>
    );
}

