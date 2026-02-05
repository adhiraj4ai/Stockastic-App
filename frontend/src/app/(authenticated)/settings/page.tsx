'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

    // Security Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

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

    if (loading) {
        return <div className="p-8 flex justify-center">Loading settings...</div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
                <p className="text-slate-500">Manage your account settings and preferences.</p>
            </div>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="general" className="flex items-center gap-2">
                        <User size={16} /> General
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="flex items-center gap-2">
                        <Palette size={16} /> Appearance
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2">
                        <Lock size={16} /> Security
                    </TabsTrigger>
                </TabsList>

                {/* General / Profile Tab */}
                <TabsContent value="general">
                    <div className="grid gap-6">
                        {/* Profile Picture Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Profile Picture</CardTitle>
                                <CardDescription>Update your profile photo.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex items-center gap-6">
                                <div className="relative group">
                                    <div className="h-24 w-24 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 border-2 border-slate-200 overflow-hidden">
                                        {user?.profile_picture ? (
                                            <img src={user.profile_picture} alt="Profile" className="h-full w-full object-cover" />
                                        ) : (
                                            <User size={48} />
                                        )}
                                    </div>
                                    <button className="absolute bottom-0 right-0 p-1.5 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition-colors shadow-sm ring-2 ring-white">
                                        <Camera size={14} />
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-medium text-slate-900">Upload new photo</h3>
                                    <p className="text-xs text-slate-500">Supports JPG, PNG or GIF. Max size 2MB.</p>
                                    <Button variant="outline" size="sm" className="mt-2">Select File</Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Personal Info Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Personal Information</CardTitle>
                                <CardDescription>Update your personal details.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                            <Type size={14} className="text-slate-400" /> First Name
                                        </label>
                                        <Input
                                            value={user?.first_name || ''}
                                            onChange={(e) => setUser(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                                            placeholder="Jugal"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                            <Type size={14} className="text-slate-400" /> Last Name
                                        </label>
                                        <Input
                                            value={user?.last_name || ''}
                                            onChange={(e) => setUser(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                                            placeholder="Raj"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                            <Fingerprint size={14} className="text-slate-400" /> Nickname
                                        </label>
                                        <Input
                                            value={user?.nickname || ''}
                                            onChange={(e) => setUser(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                                            placeholder="Jugal"
                                        />
                                        <p className="text-[10px] text-slate-500">Display name for community interactions.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                            <Phone size={14} className="text-slate-400" /> Phone Number
                                        </label>
                                        <Input
                                            value={user?.phone_number || ''}
                                            onChange={(e) => setUser(prev => prev ? { ...prev, phone_number: e.target.value } : null)}
                                            placeholder="+977 98..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100 mt-2">
                                    <label className="text-sm font-medium text-slate-700">Email Address</label>
                                    <Input
                                        value={user?.email || ''}
                                        onChange={(e) => setUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                        placeholder="your@email.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Username</label>
                                    <Input value={user?.username || ''} disabled className="bg-slate-50" />
                                    <p className="text-[10px] text-slate-400">Usernames are permanent.</p>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <Button onClick={handleSaveProfile} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                                        <Save size={16} className="mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Appearance Tab */}
                <TabsContent value="appearance">
                    <Card>
                        <CardHeader>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>Customize the look and feel of the application.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                    <div className="font-medium">Theme</div>
                                    <div className="text-sm text-slate-500">Select your preferred interface theme.</div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" className="bg-slate-900 text-white hover:bg-slate-800 hover:text-white border-slate-900">Dark</Button>
                                    <Button variant="outline" className="bg-white text-slate-900 border-slate-200">Light</Button>
                                    <Button variant="default" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">System</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Security Tab */}
                <TabsContent value="security">
                    <Card>
                        <CardHeader>
                            <CardTitle>Security</CardTitle>
                            <CardDescription>Manage your password and security settings.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Current Password</label>
                                <Input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">New Password</label>
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Confirm New Password</label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                            <div className="pt-2 flex justify-end">
                                <Button className="bg-blue-600 hover:bg-blue-700">
                                    <Save size={16} className="mr-2" /> Update Password
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
