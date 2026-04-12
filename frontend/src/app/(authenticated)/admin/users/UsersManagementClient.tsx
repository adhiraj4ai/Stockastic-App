'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import {
    Users,
    Search,
    Filter,
    MoreVertical,
    Shield,
    ShieldCheck,
    UserCircle,
    Mail,
    Calendar,
    ArrowUpDown,
    Check,
    Loader2,
    RefreshCw,
    UserPlus,
    UserMinus,
    ExternalLink,
    Crown,
    Star,
    Award,
    CircleHelp
} from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TerminalUser {
    id: number;
    username: string;
    email: string;
    nickname: string;
    first_name: string;
    last_name: string;
    role: 'ADMIN' | 'MANAGER' | 'SUBSCRIBER';
    subscription_tier: 'SILVER' | 'GOLD' | 'PLATINUM' | 'NONE';
    date_joined: string;
    last_login: string | null;
    profile_picture: string | null;
    is_active: boolean;
    deactivated_at: string | null;
}

const ROLE_CONFIG = {
    ADMIN: { label: 'Admin', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', icon: ShieldCheck },
    MANAGER: { label: 'Manager', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', icon: Shield },
    SUBSCRIBER: { label: 'Subscriber', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', icon: Users },
};

const TIER_CONFIG = {
    SILVER: { label: 'Silver', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', icon: UserCircle },
    GOLD: { label: 'Gold', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', icon: Star },
    PLATINUM: { label: 'Platinum', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', icon: Crown },
    NONE: { label: 'No Tier', color: 'bg-slate-500/5 text-slate-400 border-slate-500/10', icon: UserCircle },
};

export default function UsersManagementClient() {
    const [users, setUsers] = useState<TerminalUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('ALL');
    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

    // Create User State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        role: 'SUBSCRIBER',
        subscription_tier: 'SILVER',
        password: ''
    });

    const [currentUser, setCurrentUser] = useState<TerminalUser | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Fetch users list
            const usersRes = await api.get('/api/users/admin/management/');
            setUsers(usersRes.data.results || usersRes.data);
            
            // Try fetching current user profile separately for the greeting
            try {
                const meRes = await api.get('/api/users/me/');
                setCurrentUser(meRes.data);
            } catch (meError) {
                console.warn('Failed to fetch current user profile', meError);
            }
        } catch (error) {
            console.error('Failed to fetch user directory', error);
            toast.error('Failed to load user directory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const greeting = useMemo(() => {
        if (!currentUser) return "Terminal Account Governance";
        const name = currentUser.nickname || currentUser.first_name || currentUser.username;
        return `Hello, ${name}`;
    }, [currentUser]);

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = 
                user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.last_name?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
            
            return matchesSearch && matchesRole;
        });
    }, [users, searchTerm, roleFilter]);

    const handleRoleUpdate = async (userId: number, field: 'role' | 'subscription_tier', value: string) => {
        setUpdatingUserId(userId);
        try {
            await api.patch(`/api/users/admin/management/${userId}/`, { [field]: value });
            toast.success(`${field === 'role' ? 'Role' : 'Tier'} updated correctly`);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value as any } : u));
        } catch (error) {
            toast.error('Failed to update field');
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleDeactivateUser = async (userId: number, currentStatus: boolean) => {
        setUpdatingUserId(userId);
        try {
            await api.patch(`/api/users/admin/management/${userId}/`, { is_active: !currentStatus });
            toast.success(`Account ${currentStatus ? 'deactivated' : 'activated'} successfully`);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentStatus } : u));
        } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to update account status';
            toast.error(msg);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleDeleteUser = async (user: TerminalUser) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete user "${user.username}"? This action cannot be undone.`)) {
            return;
        }

        setUpdatingUserId(user.id);
        try {
            await api.delete(`/api/users/admin/management/${user.id}/`);
            toast.success('User deleted successfully');
            setUsers(prev => prev.filter(u => u.id !== user.id));
        } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to delete user';
            toast.error(msg);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateLoading(true);
        try {
            const res = await api.post('/api/users/admin/management/', newUser);
            toast.success('User created successfully');
            setUsers(prev => [res.data, ...prev]);
            setIsCreateDialogOpen(false);
            setNewUser({
                username: '',
                email: '',
                first_name: '',
                last_name: '',
                role: 'SUBSCRIBER',
                subscription_tier: 'SILVER',
                password: ''
            });
        } catch (error: any) {
            const errorMsg = error.response?.data?.username?.[0] || error.response?.data?.email?.[0] || 'Failed to create user';
            toast.error(errorMsg);
        } finally {
            setCreateLoading(false);
        }
    };

    return (
        <DashboardLayout 
            title="User Management" 
            subtitle={`${greeting} • Subscription Tier Oversight`}
            hideHeader={true}
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* Stats Header */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-slate-200/50 dark:border-white/5">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                                <Users size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Users</p>
                                <p className="text-2xl font-bold">{users.length}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-slate-200/50 dark:border-white/5">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-violet-500/10 text-violet-500">
                                <Crown size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Premium Tiers</p>
                                <p className="text-2xl font-bold">
                                    {users.filter(u => ['GOLD', 'PLATINUM'].includes(u.subscription_tier)).length}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-slate-200/50 dark:border-white/5">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500">
                                <ShieldCheck size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Admins</p>
                                <p className="text-2xl font-bold">
                                    {users.filter(u => u.role === 'ADMIN').length}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-slate-200/50 dark:border-white/5">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                                <RefreshCw size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recent Activity</p>
                                <p className="text-2xl font-bold">Live</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters & Table */}
                <Card className="bg-white dark:bg-slate-950/40 backdrop-blur-2xl border-slate-200/50 dark:border-white/5 shadow-xl">
                    <CardHeader className="pb-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <CardTitle className="text-xl font-bold">User Directory</CardTitle>
                                <CardDescription>Manage subscriber tiers and system permissions</CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input 
                                        placeholder="Search terminal users..." 
                                        className="pl-9 bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="gap-2 border-slate-200 dark:border-white/10">
                                            <Filter size={14} />
                                            {roleFilter === 'ALL' ? 'All Roles' : ROLE_CONFIG[roleFilter as keyof typeof ROLE_CONFIG]?.label || 'Select Role'}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuLabel>Filter by Role</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setRoleFilter('ALL')}>All Roles</DropdownMenuItem>
                                        {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                                            <DropdownMenuItem key={key} onClick={() => setRoleFilter(key)}>
                                                {config.label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                
                                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="gap-2 bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-slate-200 transition-all">
                                            <UserPlus size={16} />
                                            Add User
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px] bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10">
                                        <form onSubmit={handleCreateUser}>
                                            <DialogHeader>
                                                <DialogTitle>Create Terminal Account</DialogTitle>
                                                <DialogDescription>
                                                    Register a new user and assign their subscription tier.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="username" className="text-right">Username</Label>
                                                    <Input
                                                        id="username"
                                                        value={newUser.username}
                                                        onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                                                        className="col-span-3 bg-slate-50 dark:bg-white/5"
                                                        placeholder="janesmith"
                                                        required
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="email" className="text-right">Email</Label>
                                                    <Input
                                                        id="email"
                                                        type="email"
                                                        value={newUser.email}
                                                        onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                                        className="col-span-3 bg-slate-50 dark:bg-white/5"
                                                        placeholder="jane@example.com"
                                                        required
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 ml-[72px]">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="first_name">First Name</Label>
                                                        <Input
                                                            id="first_name"
                                                            value={newUser.first_name}
                                                            onChange={(e) => setNewUser({...newUser, first_name: e.target.value})}
                                                            className="bg-slate-50 dark:bg-white/5"
                                                            placeholder="Jane"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="last_name">Last Name</Label>
                                                        <Input
                                                            id="last_name"
                                                            value={newUser.last_name}
                                                            onChange={(e) => setNewUser({...newUser, last_name: e.target.value})}
                                                            className="bg-slate-50 dark:bg-white/5"
                                                            placeholder="Smith"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="role" className="text-right">Role</Label>
                                                    <div className="col-span-3">
                                                        <Select 
                                                            value={newUser.role} 
                                                            onValueChange={(val) => setNewUser({...newUser, role: val as any})}
                                                        >
                                                            <SelectTrigger className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10">
                                                                <SelectValue placeholder="Select Role" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                                                                    <SelectItem key={key} value={key}>
                                                                        <div className="flex items-center gap-2">
                                                                            <config.icon size={14} className="text-slate-500" />
                                                                            <span>{config.label}</span>
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4 animate-in slide-in-from-top-2 duration-300">
                                                    <Label htmlFor="tier" className="text-right">Tier</Label>
                                                    <div className="col-span-3">
                                                        <Select 
                                                            value={newUser.subscription_tier} 
                                                            onValueChange={(val) => setNewUser({...newUser, subscription_tier: val as any})}
                                                        >
                                                            <SelectTrigger className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10">
                                                                <SelectValue placeholder="Select Tier" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {Object.entries(TIER_CONFIG).map(([key, config]) => (
                                                                    <SelectItem key={key} value={key}>
                                                                        <div className="flex items-center gap-2">
                                                                            <config.icon size={14} className="text-slate-500" />
                                                                            <span>{config.label}</span>
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="pass" className="text-right">Password</Label>
                                                    <Input
                                                        id="pass"
                                                        type="password"
                                                        value={newUser.password}
                                                        onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                                                        className="col-span-3 bg-slate-50 dark:bg-white/5"
                                                        placeholder="••••••••"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    onClick={() => setIsCreateDialogOpen(false)}
                                                    disabled={createLoading}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button 
                                                    type="submit" 
                                                    className="bg-slate-900 dark:bg-white text-white dark:text-black"
                                                    disabled={createLoading}
                                                >
                                                    {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>

                                <Button size="icon" variant="ghost" onClick={fetchUsers} disabled={loading}>
                                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50/50 dark:bg-white/5">
                                    <TableRow>
                                        <TableHead className="font-bold">User</TableHead>
                                        <TableHead className="font-bold">Contact</TableHead>
                                        <TableHead className="font-bold text-center">Status</TableHead>
                                        <TableHead className="font-bold text-center">Role</TableHead>
                                        <TableHead className="font-bold text-center">Subscription</TableHead>
                                        <TableHead className="font-bold">Joined</TableHead>
                                        <TableHead className="font-bold">Last Activity</TableHead>
                                        <TableHead className="font-bold text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={8} className="h-16 text-center">
                                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-300" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredUsers.length > 0 ? (
                                        filteredUsers.map((user) => {
                                            const roleCfg = ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.SUBSCRIBER;
                                            const tierCfg = TIER_CONFIG[user.subscription_tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.NONE;
                                            const RoleIcon = roleCfg.icon;
                                            const TierIcon = tierCfg.icon;
                                            return (
                                                <TableRow key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 min-w-[40px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs overflow-hidden shadow-md">
                                                                {user.profile_picture ? (
                                                                    <img 
                                                                        src={user.profile_picture} 
                                                                        alt={user.username} 
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <span>{user.username.slice(0, 2).toUpperCase()}</span>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-sm tracking-tight">{user.username}</span>
                                                                <span className="text-[10px] text-slate-500 font-medium">ID: #{user.id}</span>
                                                                {!user.is_active && (
                                                                    <div className="flex flex-col gap-1 mt-1">
                                                                        <Badge variant="destructive" className="text-[8px] px-1 py-0 h-4 w-fit uppercase">Inactive</Badge>
                                                                        {user.deactivated_at && (
                                                                            <span className="text-[8px] text-rose-500 font-bold uppercase tracking-tighter">
                                                                                Grace Period: {90 - Math.floor((new Date().getTime() - new Date(user.deactivated_at).getTime()) / (1000 * 60 * 60 * 24))}d left
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{user.first_name} {user.last_name}</span>
                                                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                                <Mail size={10} />
                                                                {user.email}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge 
                                                            variant="outline" 
                                                            className={cn(
                                                                "px-2 py-0.5 rounded-lg border",
                                                                user.is_active 
                                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" 
                                                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                                            )}
                                                        >
                                                            <div className={cn("w-1.5 h-1.5 rounded-full mr-2 animate-pulse", user.is_active ? "bg-emerald-500" : "bg-rose-500")} />
                                                            {user.is_active ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge 
                                                            variant="outline" 
                                                            className={cn(
                                                                "px-2 py-0.5 rounded-lg border flex items-center justify-center gap-1.5 w-fit mx-auto", 
                                                                roleCfg.color
                                                            )}
                                                        >
                                                            <RoleIcon size={12} />
                                                            {roleCfg.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge 
                                                            variant="outline" 
                                                            className={cn(
                                                                "px-2 py-0.5 rounded-lg border flex items-center justify-center gap-1.5 w-fit mx-auto", 
                                                                tierCfg.color
                                                            )}
                                                        >
                                                            <TierIcon size={12} />
                                                            {tierCfg.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-semibold">{user.date_joined ? format(new Date(user.date_joined), 'MMM dd, yyyy') : 'N/A'}</span>
                                                            <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Joined At</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-semibold">
                                                                {user.last_login ? format(new Date(user.last_login), 'MMM dd, HH:mm') : 'Never'}
                                                            </span>
                                                            <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Last Login</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingUserId === user.id}>
                                                                    {updatingUserId === user.id ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                                                    ) : (
                                                                        <MoreVertical size={16} />
                                                                    )}
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl">
                                                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400">Governance</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                <div className="grid gap-1 mt-1">
                                                                    <p className="text-[10px] px-2 font-bold text-slate-500 uppercase">System Role</p>
                                                                    {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                                                                        const Icon = config.icon;
                                                                        return (
                                                                            <DropdownMenuItem 
                                                                                key={key} 
                                                                                disabled={user.role === key}
                                                                                onClick={() => handleRoleUpdate(user.id, 'role', key)}
                                                                                className="flex items-center justify-between gap-2 cursor-pointer p-2 rounded-lg"
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <Icon size={14} className={cn(key === user.role ? "text-blue-500" : "text-slate-400")} />
                                                                                    <span className={cn("text-sm", key === user.role && "font-bold text-blue-500")}>{config.label}</span>
                                                                                </div>
                                                                                {key === user.role && <Check size={14} className="text-blue-500" />}
                                                                            </DropdownMenuItem>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="grid gap-1 mt-2">
                                                                    <DropdownMenuSeparator />
                                                                    <p className="text-[10px] px-2 font-bold text-slate-500 uppercase mt-1">Subscription Model</p>
                                                                    {Object.entries(TIER_CONFIG).map(([key, config]) => (
                                                                        <DropdownMenuItem 
                                                                            key={key} 
                                                                            disabled={user.subscription_tier === key}
                                                                            onClick={() => handleRoleUpdate(user.id, 'subscription_tier', key)}
                                                                            className="flex items-center justify-between gap-2 cursor-pointer p-2 rounded-lg"
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <config.icon size={14} className={cn(key === user.subscription_tier ? "text-amber-500" : "text-slate-400")} />
                                                                                <span className={cn("text-sm", key === user.subscription_tier && "font-bold text-amber-500")}>{config.label}</span>
                                                                            </div>
                                                                            {key === user.subscription_tier && <Check size={14} className="text-amber-500" />}
                                                                        </DropdownMenuItem>
                                                                    ))}
                                                                </div>
                                                                {user.role !== 'ADMIN' && (
                                                                    <>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem 
                                                                            onClick={() => handleDeactivateUser(user.id, user.is_active)}
                                                                            className={cn(
                                                                                "cursor-pointer p-2 rounded-lg",
                                                                                user.is_active ? "text-amber-500 focus:text-amber-600 focus:bg-amber-500/10" : "text-emerald-500 focus:text-emerald-600 focus:bg-emerald-500/10"
                                                                            )}
                                                                        >
                                                                            {user.is_active ? (
                                                                                <>
                                                                                    <UserMinus size={14} className="mr-2" />
                                                                                    Deactivate Account
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <UserPlus size={14} className="mr-2" />
                                                                                    Activate Account
                                                                                </>
                                                                            )}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem 
                                                                            disabled={user.is_active || (user.deactivated_at ? Math.floor((new Date().getTime() - new Date(user.deactivated_at).getTime()) / (1000 * 60 * 60 * 24)) < 90 : true)}
                                                                            onClick={() => handleDeleteUser(user)}
                                                                            className="text-rose-500 focus:text-rose-600 focus:bg-rose-500/10 cursor-pointer p-2 rounded-lg"
                                                                        >
                                                                            <div className="flex flex-col items-start gap-0.5">
                                                                                <div className="flex items-center">
                                                                                    <UserMinus size={14} className="mr-2" />
                                                                                    <span>Delete Account</span>
                                                                                </div>
                                                                                {user.is_active ? (
                                                                                    <span className="text-[8px] text-slate-400 font-medium ml-6">Must deactivate first</span>
                                                                                ) : user.deactivated_at && Math.floor((new Date().getTime() - new Date(user.deactivated_at).getTime()) / (1000 * 60 * 60 * 24)) < 90 ? (
                                                                                    <span className="text-[8px] text-amber-500 font-medium ml-6">Wait 90 days from deactivation</span>
                                                                                ) : null}
                                                                            </div>
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-slate-400">
                                                    <Users size={32} strokeWidth={1} />
                                                    <p className="text-sm font-medium">No users match your filters</p>
                                                    <Button variant="link" onClick={() => { setSearchTerm(''); setRoleFilter('ALL'); }}>Reset filters</Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
