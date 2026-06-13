import { Home, CalendarClock, Layers, Radar, Lightbulb, History, Building2, Activity, LayoutDashboard, Zap, BarChart3, Target, Share2, FileText, GitMerge, Wallet, Briefcase, TrendingUp, DollarSign, Eye, Star, Brain, Users, TrendingDown, MessageSquare, NotebookPen, Shield, ClipboardList } from 'lucide-react';

export const navItems = [
    { name: 'Home', href: '/', icon: Home, permission: 'home', color: 'text-blue-500' },
    {
        name: 'Plan',
        icon: ClipboardList,
        color: 'text-orange-500',
        subItems: [
            { name: "Tomorrow's plan", href: '/plan', icon: CalendarClock, permission: 'daily_plan' },
<<<<<<< HEAD
            { name: 'Trade plans', href: '/plan/trade-plans', icon: Layers, permission: 'portfolio_trade_plans' },
            { name: 'Watchlist', href: '/plan/watchlist', icon: Eye, permission: 'portfolio_watchlist' },
=======
            { name: 'Trade plans', href: '/portfolio/plans', icon: Layers, permission: 'portfolio_trade_plans' },
            { name: 'Watchlist', href: '/portfolio/watchlist', icon: Eye, permission: 'portfolio_watchlist' },
>>>>>>> 7e57a1b (feat(nav): add Plan group with tomorrow's plan, trade plans, watchlist; remove from standalone/portfolio)
        ]
    },
    {
        name: 'Signals',
        icon: Layers,
        color: 'text-cyan-500',
        subItems: [
            { name: 'Intel Hub', href: '/signals', icon: Radar, permission: 'intel_hub' },
            { name: 'Strategies', href: '/strategies', icon: Lightbulb, permission: 'strategies' },
            { name: 'Track Record', href: '/signals/track-record', icon: History, permission: 'track_record' },
        ]
    },
    {
        name: 'Market',
        icon: Building2,
        color: 'text-emerald-500',
        subItems: [
            { name: 'Live Market', href: '/market/live', icon: Activity, permission: 'home' },
            { name: 'Terminal', href: '/market', icon: LayoutDashboard, permission: 'market_overview' },
            { name: 'Movers & Shakers', href: '/market/movers', icon: Zap, permission: 'market_movers' },
            { name: 'Market Activity', href: '/market/activity', icon: Activity, permission: 'market_activity' },
            { name: 'Sector Rotation', href: '/market/rotation', icon: BarChart3, permission: 'market_rotation' },
            { name: 'PA Screener', href: '/market/pa-screener', icon: Target, permission: 'market_pa_screener' },
            { name: 'Social Highlights', href: '/social', icon: Share2, permission: 'market_social' },
        ]
    },
    {
        name: 'Floorsheet',
        icon: FileText,
        color: 'text-amber-500',
        subItems: [
            { name: 'Floorsheet', href: '/floorsheet', icon: FileText, permission: 'market_floorsheet' },
            { name: 'Bulk Transactions', href: '/market/bulk', icon: Layers, permission: 'market_bulk' },
            { name: 'Matching Transactions', href: '/market/matching', icon: GitMerge, permission: 'market_matching' },
            { name: 'Volume Profile', href: '/market/volume-profile', icon: BarChart3, permission: 'market_volume' },
        ]
    },
    {
        name: 'Portfolio',
        icon: Wallet,
        color: 'text-violet-500',
        subItems: [
            { name: 'My Portfolio', href: '/portfolio', icon: Briefcase, permission: 'portfolio_main' },
            { name: 'Performance', href: '/portfolio/performance', icon: TrendingUp, permission: 'portfolio_performance' },
            { name: 'Income', href: '/portfolio/income', icon: DollarSign, permission: 'portfolio_income' },
            { name: 'Transactions', href: '/portfolio/transactions', icon: History, permission: 'portfolio_transactions' },
            { name: 'Paper Trading', href: '/paper-trading', icon: LayoutDashboard, permission: 'paper_trading' },
        ]
    },
    {
        name: 'Broker Research',
        icon: Activity,
        color: 'text-rose-500',
        subItems: [
            { name: 'Command Center', href: '/accumulation/dashboard', icon: Layers, permission: 'accumulation_dash' },
            { name: 'Smart Money', href: '/accumulation/smart-money', icon: Brain, permission: 'smart_money' },
            { name: 'Broker Trends', href: '/accumulation/trends', icon: BarChart3, permission: 'broker_trends' },
            { name: 'Focus Ranking', href: '/accumulation/focus-ranking', icon: Target, permission: 'focus_ranking' },
            { name: 'Price Study', href: '/accumulation/price-study', icon: TrendingUp, permission: 'price_study' },
            { name: 'Broker Favorites', href: '/accumulation/favorites', icon: Star, permission: 'broker_favorites' },
            { name: 'Accumulators Navigator', href: '/accumulation/navigator', icon: Users, permission: 'navigator' },
            { name: 'Below Cost Positions', href: '/accumulation/below-cost', icon: TrendingDown, permission: 'below_cost' },
            { name: 'Accumulation History', href: '/accumulation/history', icon: History, permission: 'accumulation_history' },
            { name: 'Share Transfer', href: '/accumulation/share-transfer', icon: Share2, permission: 'share_transfer' },
        ]
    },
    {
        name: 'AI Tools',
        icon: Brain,
        color: 'text-fuchsia-500',
        subItems: [
            { name: 'Chat', href: '/chat', icon: MessageSquare, permission: 'chat' },
            { name: 'Notebooks', href: '/notebook', icon: NotebookPen, permission: 'chat' },
        ]
    },
    {
        name: 'Admin',
        icon: Shield,
        color: 'text-slate-500 dark:text-slate-400',
        subItems: [
            { name: 'Users', href: '/admin/users', icon: Users, permission: 'admin_user_mgmt' },
            { name: 'Financials', href: '/admin/financials', icon: FileText, permission: 'admin_financials' },
            { name: 'Pipeline', href: '/admin/pipeline', icon: GitMerge, permission: 'admin_pipeline' },
        ]
    },
];
