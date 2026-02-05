'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
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
            <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col bg-slate-50/95 backdrop-blur-xl border-white/20 shadow-2xl p-0 gap-0">
                <DialogHeader className="p-6 pb-2 border-b border-slate-200/50 bg-white/50 sticky top-0 z-10 backdrop-blur-md">
                    <DialogTitle className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
                        Settings
                    </DialogTitle>
                    <p className="text-slate-500 font-medium text-sm">Manage your account settings and preferences.</p>
                </DialogHeader>

                <div className="p-6 flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <Tabs defaultValue="general" className="w-full">
                            <TabsList className="bg-white/50 backdrop-blur-sm p-1 rounded-xl border border-white/20 shadow-sm mb-6 w-full justify-start h-auto">
                                <TabsTrigger
                                    value="general"
                                    className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 font-bold text-sm flex-1 md:flex-none"
                                >
                                    <div className="flex items-center gap-2 justify-center">
                                        <User size={16} /> General
                                    </div>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="appearance"
                                    className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 font-bold text-sm flex-1 md:flex-none"
                                >
                                    <div className="flex items-center gap-2 justify-center">
                                        <Palette size={16} /> Appearance
                                    </div>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="security"
                                    className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 font-bold text-sm flex-1 md:flex-none"
                                >
                                    <div className="flex items-center gap-2 justify-center">
                                        <Lock size={16} /> Security
                                    </div>
                                </TabsTrigger>
                            </TabsList>

                            {/* General / Profile Tab */}
                            <TabsContent value="general" className="space-y-6 focus-visible:outline-none">
                                {/* Profile Picture Section */}
                                <div className="flex flex-col md:flex-row items-center gap-8 p-6 bg-white rounded-xl shadow-sm border border-slate-100">
                                    <div className="relative group cursor-pointer" onClick={triggerFileInput}>
                                        <div className="h-24 w-24 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-300 border-4 border-white shadow-lg overflow-hidden ring-4 ring-indigo-50/50 transition-all group-hover:scale-105">
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
                                    <div className="flex-1 space-y-2 text-center md:text-left">
                                        <h3 className="font-bold text-slate-900 text-lg">Profile Picture</h3>
                                        <p className="text-sm text-slate-500">Update your public profile photo. Max size 2MB.</p>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleImageChange}
                                            accept="image/png, image/jpeg, image/gif"
                                            className="hidden"
                                        />
                                        <Button variant="outline" size="sm" onClick={triggerFileInput} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800">
                                            Select New Photo
                                        </Button>
                                    </div>
                                </div>

                                {/* Personal Info Section */}
                                <div className="space-y-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <h3 className="font-bold text-slate-900 border-b pb-2 mb-4">Personal Information</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Type size={14} className="text-indigo-400" /> First Name
                                            </label>
                                            <Input
                                                value={user?.first_name || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                                                placeholder="First Name"
                                                className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
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
                                                className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Fingerprint size={14} className="text-indigo-400" /> Nickname
                                            </label>
                                            <Input
                                                value={user?.nickname || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                                                placeholder="Nickname"
                                                className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <Phone size={14} className="text-indigo-400" /> Phone Number
                                            </label>
                                            <Input
                                                value={user?.phone_number || ''}
                                                onChange={(e) => setUser(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                                                placeholder="+977 98..."
                                                className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <label className="text-sm font-bold text-slate-700">Email Address</label>
                                        <Input
                                            value={user?.email || ''}
                                            onChange={(e) => setUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                            placeholder="your@email.com"
                                            className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Username</label>
                                        <Input value={user?.username || ''} disabled className="bg-slate-100 text-slate-500 font-medium cursor-not-allowed" />
                                    </div>

                                    <div className="pt-4 flex justify-end">
                                        <Button onClick={handleSaveProfile} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                            <Save size={16} className="mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Appearance Tab */}
                            <TabsContent value="appearance" className="focus-visible:outline-none">
                                <div className="space-y-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-slate-800">Theme Preference</div>
                                            <div className="text-sm text-slate-500">Select your preferred interface theme.</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="bg-slate-900 text-white hover:bg-slate-800 hover:text-white border-slate-900 shadow-md">Dark</Button>
                                            <Button variant="outline" size="sm" className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50">Light</Button>
                                            <Button variant="default" size="sm" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 shadow-sm">System</Button>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Security Tab */}
                            <TabsContent value="security" className="focus-visible:outline-none">
                                <div className="space-y-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <h3 className="font-bold text-slate-900 border-b pb-2 mb-4">Password Management</h3>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Current Password</label>
                                        <Input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">New Password</label>
                                        <Input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Confirm New Password</label>
                                        <Input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="bg-slate-50/50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <div className="pt-4 flex justify-end">
                                        <Button onClick={handleUpdatePassword} disabled={passLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                            <Save size={16} className="mr-2" /> {passLoading ? 'Updating...' : 'Update Password'}
                                        </Button>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
