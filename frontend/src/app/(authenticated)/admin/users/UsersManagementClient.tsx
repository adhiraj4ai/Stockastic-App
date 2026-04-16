'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
    CircleHelp,
    Building2,
    LayoutDashboard,
    Zap,
    Activity,
    BarChart3,
    FileText,
    Layers,
    GitMerge,
    Share2,
    Target,
    Briefcase,
    TrendingUp,
    TrendingDown,
    DollarSign,
    History,
    Eye,
    Brain,
    Radar,
    Lightbulb,
    LineChart,
    MessageSquare,
    Lock,
    Unlock,
    Settings2,
    Gamepad2,
    Wallet
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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ConfirmPasswordDialog } from '@/components/admin/ConfirmPasswordDialog';

interface TerminalUser {
    id: number;
    username: string;
    email: string;
    nickname: string;
    first_name: string;
    last_name: string;
    role: 'ADMIN' | 'MANAGER' | 'SUBSCRIBER';
    subscription_tier: 'BASIC' | 'PRO' | 'ULTRA' | 'NONE';
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
    BASIC: { label: 'Basic', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', icon: UserCircle },
    PRO: { label: 'Pro', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', icon: Star },
    ULTRA: { label: 'Ultra', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', icon: Crown },
    NONE: { label: 'No Tier', color: 'bg-slate-500/5 text-slate-400 border-slate-500/10', icon: UserCircle },
};

export default function UsersManagementClient() {
    const [users, setUsers] = useState<TerminalUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('ALL');
    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

    // Password Confirmation State
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [pendingAction, setPendingAction] = useState<{
        type: 'ROLE' | 'PERMISSION' | 'DEACTIVATE' | 'DELETE';
        id: number;
        data: any;
        label?: string;
    } | null>(null);

    // Create User State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        role: 'SUBSCRIBER',
        subscription_tier: 'BASIC',
        password: ''
    });

    const [currentUser, setCurrentUser] = useState<TerminalUser | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Fetch users list
            const usersRes = await api.get('/api/users/admin/management/');
            
            // Defensively handle response structure
            const userData = usersRes.data?.results || usersRes.data;
            if (Array.isArray(userData)) {
                setUsers(userData);
            } else {
                console.warn('User directory API returned non-array data:', userData);
                setUsers([]);
            }
            
            // Try fetching current user profile separately for the greeting
            try {
                const meRes = await api.get('/api/users/me/');
                if (meRes.data) {
                    setCurrentUser(meRes.data);
                }
            } catch (meError) {
                console.warn('Failed to fetch current user profile', meError);
            }
        } catch (error: any) {
            console.error('Failed to fetch user directory', error);
            const errorMsg = error.response?.data?.error || error.response?.data?.detail || 'Failed to load user directory';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchPermissions();
    }, []);

    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [permissionsLoading, setPermissionsLoading] = useState(false);

    const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
            const res = await api.get('/api/users/admin/permissions/');
            setAllPermissions(res.data);
        } catch (error) {
            console.error('Failed to fetch permissions', error);
        } finally {
            setPermissionsLoading(false);
        }
    };

    const handleTogglePermission = (id: number, currentStatus: boolean, moduleKey: string) => {
        setPendingAction({
            type: 'PERMISSION',
            id: id,
            data: { is_enabled: !currentStatus },
            label: `Toggle Permission: ${moduleLabels[moduleKey] || moduleKey}`
        });
        setIsPasswordModalOpen(true);
    };

    const executeTogglePermission = async (id: number, data: any, admin_password: string) => {
        setPasswordLoading(true);
        try {
            await api.patch(`/api/users/admin/permissions/${id}/`, { ...data, admin_password });
            setAllPermissions(prev => prev.map(p => p.id === id ? { ...p, is_enabled: data.is_enabled } : p));
            toast.success('Permission updated');
            setIsPasswordModalOpen(false);
        } catch (error: any) {
            const msg = error.response?.data?.error || error.response?.data?.admin_password || 'Failed to update permission';
            toast.error(msg);
        } finally {
            setPasswordLoading(false);
        }
    };

    const moduleIcons: Record<string, any> = {
        home: LayoutDashboard,
        market_overview: Building2,
        market_movers: Zap,
        market_activity: Activity,
        market_rotation: BarChart3,
        market_floorsheet: FileText,
        market_bulk: Layers,
        market_matching: GitMerge,
        market_social: Share2,
        market_pa_screener: Target,
        market_volume: BarChart3,
        portfolio_main: Briefcase,
        portfolio_performance: TrendingUp,
        portfolio_income: DollarSign,
        portfolio_transactions: History,
        portfolio_watchlist: Eye,
        paper_trading: LayoutDashboard,
        portfolio_optimization: LineChart,
        accumulation_dash: Layers,
        smart_money: Brain,
        broker_trends: BarChart3,
        focus_ranking: Target,
        accumulation_history: History,
        price_study: TrendingUp,
        broker_favorites: Star,
        share_transfer: Share2,
        navigator: Users,
        below_cost: TrendingDown,
        intel_hub: Radar,
        strategies: Lightbulb,
        track_record: History,
        ticker_pa: LineChart,
        ticker_signals: Zap,
        ticker_accumulation: Target,
        ticker_tech: Activity,
        ticker_funds: Building2,
        chat: MessageSquare
    };

    const moduleLabels: Record<string, string> = {
        home: 'Home Dashboard',
        market_overview: 'Market Overview',
        market_movers: 'Movers & Shakers',
        market_activity: 'Market Activity',
        market_rotation: 'Sector Rotation',
        market_floorsheet: 'Floorsheet',
        market_bulk: 'Bulk Transactions',
        market_matching: 'Matching Transactions',
        market_social: 'Social Highlights',
        market_pa_screener: 'Global PA Screener',
        market_volume: 'Volume Profile',
        portfolio_main: 'My Portfolio',
        portfolio_performance: 'Performance Analysis',
        portfolio_income: 'Income Tracker',
        portfolio_transactions: 'Transaction History',
        portfolio_watchlist: 'Watchlist',
        paper_trading: 'Paper Trading',
        portfolio_optimization: 'Portfolio Optimizer',
        accumulation_dash: 'Command Center',
        smart_money: 'Smart Money (Whale)',
        broker_trends: 'Broker Trends',
        focus_ranking: 'Focus Ranking',
        accumulation_history: 'Accumulation Hist',
        price_study: 'Price Study',
        broker_favorites: 'Broker Favorites',
        share_transfer: 'Share Transfer',
        navigator: 'Accumulator Navigator',
        below_cost: 'Below Cost Positions',
        intel_hub: 'Intelligence Hub',
        strategies: 'Strategies Hub',
        track_record: 'Track Record',
        ticker_pa: 'Ticker: Price Action',
        ticker_signals: 'Ticker: Signals',
        ticker_accumulation: 'Ticker: Accumulation',
        ticker_tech: 'Ticker: Technical',
        ticker_funds: 'Ticker: Fundamentals',
        chat: 'Community Chat'
    };

    const permissionGroups = [
        { name: 'Global', keys: ['home', 'chat'] },
        { name: 'Market Suite', keys: ['market_overview', 'market_movers', 'market_activity', 'market_rotation', 'market_pa_screener', 'market_social'] },
        { name: 'Floorsheet Suite', keys: ['market_floorsheet', 'market_bulk', 'market_matching', 'market_volume', 'accumulation_history', 'share_transfer'] },
        { name: 'Finfolio Suite', keys: ['portfolio_main', 'portfolio_performance', 'portfolio_income', 'portfolio_transactions', 'portfolio_watchlist', 'paper_trading', 'portfolio_optimization'] },
        { name: 'Accumulation Suite', keys: ['accumulation_dash', 'smart_money', 'broker_trends', 'focus_ranking', 'price_study', 'broker_favorites', 'navigator', 'below_cost'] },
        { name: 'Strategic Hub', keys: ['intel_hub', 'strategies', 'track_record'] },
        { name: 'Ticker Intelligence', keys: ['ticker_pa', 'ticker_signals', 'ticker_accumulation', 'ticker_tech', 'ticker_funds'] }
    ];

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

    const handleRoleUpdate = (userId: number, field: 'role' | 'subscription_tier', value: string) => {
        setPendingAction({
            type: 'ROLE',
            id: userId,
            data: { [field]: value },
            label: `Change ${field === 'role' ? 'Role' : 'Tier'} to ${value}`
        });
        setIsPasswordModalOpen(true);
    };

    const executeRoleUpdate = async (userId: number, data: any, admin_password: string) => {
        setUpdatingUserId(userId);
        setPasswordLoading(true);
        try {
            await api.patch(`/api/users/admin/management/${userId}/`, { ...data, admin_password });
            toast.success(`${Object.keys(data)[0] === 'role' ? 'Role' : 'Tier'} updated correctly`);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
            setIsPasswordModalOpen(false);
        } catch (error: any) {
            const msg = error.response?.data?.error || error.response?.data?.admin_password || 'Failed to update field';
            toast.error(msg);
        } finally {
            setUpdatingUserId(null);
            setPasswordLoading(false);
        }
    };

    const handleDeactivateUser = (userId: number, currentStatus: boolean) => {
        setPendingAction({
            type: 'DEACTIVATE',
            id: userId,
            data: { is_active: !currentStatus },
            label: `${currentStatus ? 'Deactivate' : 'Activate'} Account`
        });
        setIsPasswordModalOpen(true);
    };

    const executeDeactivateUser = async (userId: number, data: any, admin_password: string) => {
        setUpdatingUserId(userId);
        setPasswordLoading(true);
        try {
            await api.patch(`/api/users/admin/management/${userId}/`, { ...data, admin_password });
            toast.success(`Account ${data.is_active ? 'activated' : 'deactivated'} successfully`);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: data.is_active } : u));
            setIsPasswordModalOpen(false);
        } catch (error: any) {
            const msg = error.response?.data?.error || error.response?.data?.admin_password || 'Failed to update account status';
            toast.error(msg);
        } finally {
            setUpdatingUserId(null);
            setPasswordLoading(false);
        }
    };

    const handleDeleteUser = (user: TerminalUser) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete user "${user.username}"? This action cannot be undone.`)) {
            return;
        }
        setPendingAction({
            type: 'DELETE',
            id: user.id,
            data: {},
            label: `PERMANENTLY Delete User: ${user.username}`
        });
        setIsPasswordModalOpen(true);
    };

    const executeDeleteUser = async (userId: number, admin_password: string) => {
        setUpdatingUserId(userId);
        setPasswordLoading(true);
        try {
            // Delete usually uses data for password in body if allowed, or we can use headers. 
            // In DRF, DELETE body is sometimes ignored. Let's send in body as DRF allows it.
            await api.delete(`/api/users/admin/management/${userId}/`, { data: { admin_password } });
            toast.success('User deleted successfully');
            setUsers(prev => prev.filter(u => u.id !== userId));
            setIsPasswordModalOpen(false);
        } catch (error: any) {
            const msg = error.response?.data?.error || error.response?.data?.admin_password || 'Failed to delete user';
            toast.error(msg);
        } finally {
            setUpdatingUserId(null);
            setPasswordLoading(false);
        }
    };

    const handleConfirmPassword = async (password: string) => {
        if (!pendingAction) return;
        
        const { type, id, data } = pendingAction;
        
        switch (type) {
            case 'ROLE':
                await executeRoleUpdate(id, data, password);
                break;
            case 'PERMISSION':
                await executeTogglePermission(id, data, password);
                break;
            case 'DEACTIVATE':
                await executeDeactivateUser(id, data, password);
                break;
            case 'DELETE':
                await executeDeleteUser(id, password);
                break;
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
                subscription_tier: 'BASIC',
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
            <Tabs defaultValue="directory" className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                    <TabsList className="bg-slate-100/50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 p-1 rounded-xl h-11">
                        <TabsTrigger 
                            value="directory" 
                            className="rounded-lg px-6 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all h-9"
                        >
                            <Users size={14} className="mr-2" />
                            User Directory
                        </TabsTrigger>
                        <TabsTrigger 
                            value="permissions" 
                            className="rounded-lg px-6 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 data-[state=active]:shadow-sm transition-all h-9"
                        >
                            <Shield size={14} className="mr-2" />
                            Permissions & Tiers
                        </TabsTrigger>
                        <TabsTrigger 
                            value="roles" 
                            className="rounded-lg px-6 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:shadow-sm transition-all h-9"
                        >
                            <Settings2 size={14} className="mr-2" />
                            Role Management
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="directory" className="space-y-6 mt-0">
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
                                    {users.filter(u => ['PRO', 'ULTRA'].includes(u.subscription_tier)).length}
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
                </TabsContent>

                <TabsContent value="permissions" className="mt-0">
                    <div className="grid grid-cols-1 gap-6">
                        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-slate-200/50 dark:border-white/5 shadow-xl">
                            <CardHeader>
                                <CardTitle className="text-xl font-bold flex items-center gap-2">
                                    <Lock size={20} className="text-amber-500" />
                                    Subscription Tier Access Matrix
                                </CardTitle>
                                <CardDescription>Define which modules are accessible for each subscription level</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50/50 dark:bg-white/5">
                                            <TableRow>
                                                <TableHead className="w-[300px] font-bold">Terminal Module</TableHead>
                                                {Object.keys(TIER_CONFIG).filter(t => t !== 'NONE').map(tier => (
                                                    <TableHead key={tier} className="text-center font-bold">
                                                        <div className="flex flex-col items-center gap-1">
                                                            {tier}
                                                        </div>
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {permissionGroups.map(group => (
                                                <React.Fragment key={group.name}>
                                                    <TableRow className="bg-slate-200/50 dark:bg-white/[0.05]">
                                                        <TableCell colSpan={Object.keys(TIER_CONFIG).length} className="py-2.5 px-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                                                            {group.name}
                                                        </TableCell>
                                                    </TableRow>
                                                    {group.keys.map(moduleKey => (
                                                        <TableRow key={moduleKey} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                                                            <TableCell className="font-normal">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={cn(
                                                                        "p-2 rounded-lg transition-colors group-hover:bg-white/10 shadow-sm",
                                                                        group.name === 'Global' ? "bg-blue-500/10 dark:bg-blue-500/5 text-blue-500" :
                                                                        group.name === 'Market Suite' ? "bg-slate-500/10 dark:bg-slate-500/5 text-slate-500" :
                                                                        group.name === 'Floorsheet Suite' ? "bg-indigo-500/10 dark:bg-indigo-500/5 text-indigo-500" :
                                                                        group.name === 'Finfolio Suite' ? "bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-500" :
                                                                        group.name === 'Accumulation Suite' ? "bg-orange-500/10 dark:bg-orange-500/5 text-orange-500" :
                                                                        group.name === 'Strategic Hub' ? "bg-pink-500/10 dark:bg-pink-500/5 text-pink-500" :
                                                                        group.name === 'Ticker Intelligence' ? "bg-blue-500/10 dark:bg-blue-500/5 text-blue-500" :
                                                                        "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                                                                    )}>
                                                                        {(() => {
                                                                            const Icon = moduleIcons[moduleKey] || CircleHelp;
                                                                            // Override specific Global icons if needed
                                                                            let iconColor = "";
                                                                            if (group.name === 'Global') {
                                                                                if (moduleKey === 'chat') iconColor = "text-purple-500";
                                                                                if (moduleKey === 'home') iconColor = "text-blue-500";
                                                                            }
                                                                            return <Icon size={16} className={iconColor} />;
                                                                        })()}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{moduleLabels[moduleKey]}</span>
                                                                        <span className="text-[9px] text-slate-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">KEY: {moduleKey}</span>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            {Object.keys(TIER_CONFIG).filter(t => t !== 'NONE').map(tier => {
                                                                const perm = allPermissions.find(p => p.tier === tier && p.module_key === moduleKey);
                                                                return (
                                                                    <TableCell key={`${tier}-${moduleKey}`} className="text-center">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => perm && handleTogglePermission(perm.id, perm.is_enabled, moduleKey)}
                                                                            disabled={permissionsLoading}
                                                                            className={cn(
                                                                                "w-10 h-10 rounded-xl transition-all",
                                                                                perm?.is_enabled 
                                                                                    ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 shadow-sm" 
                                                                                    : "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 shadow-sm"
                                                                            )}
                                                                        >
                                                                            {perm?.is_enabled ? <Unlock size={18} /> : <Lock size={18} />}
                                                                        </Button>
                                                                    </TableCell>
                                                                );
                                                            })}
                                                        </TableRow>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="roles" className="mt-0">
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-slate-200/50 dark:border-white/5 p-12 text-center shadow-xl">
                        <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
                            <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                                <Settings2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold">Role Capabilities</h3>
                            <p className="text-slate-500 text-sm">
                                Management of explicit role-based permissions (Admin, Manager, Subscriber) is currently harmonized with global system policies.
                            </p>
                            <Badge variant="outline" className="mt-4 bg-indigo-500/5 border-indigo-500/20 text-indigo-500 uppercase tracking-widest text-[10px] py-1">
                                System Governed
                            </Badge>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>

            <ConfirmPasswordDialog 
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
                onConfirm={handleConfirmPassword}
                isLoading={passwordLoading}
                title={pendingAction?.label || "Confirm Administrative Action"}
            />
        </DashboardLayout>
    );
}
