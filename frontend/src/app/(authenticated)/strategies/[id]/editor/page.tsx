'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { StrategyWorkspaceNav } from '../../components/StrategyWorkspaceNav';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Play, Save, Sun, Moon, AlertTriangle, XOctagon, ShieldAlert, Zap, Activity, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { FullPageLoader } from '@/components/ui/StockLoader';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

const Editor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full bg-slate-950 font-mono text-xs text-slate-500 animate-pulse">
            Initializing editor…
        </div>
    ),
});

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
    optimization_config?: string;
    published_experiments?: any[];
}

export default function EditStrategyPage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id;

    const [code, setCode] = useState<string>('');
    const [optimizationConfig, setOptimizationConfig] = useState<string>('');
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [originalData, setOriginalData] = useState<{ code: string; config: string; name: string; description: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isPublished, setIsPublished] = useState(false);
    const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
    const [isUnpublishing, setIsUnpublishing] = useState(false);

    useEffect(() => {
        if (strategyId) fetchStrategy();
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            const data = response.data;
            setStrategy(data);
            if (data.code) setCode(data.code);

            let displayConfig = data.optimization_config || '';
            try {
                if (displayConfig.trim()) {
                    const parsed = JSON.parse(displayConfig);
                    displayConfig = Object.entries(parsed)
                        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                        .join('\n');
                }
            } catch { /* keep raw */ }

            setOptimizationConfig(displayConfig);
            setOriginalData({
                code: data.code || '',
                config: displayConfig,
                name: data.name || '',
                description: data.description || '',
            });
            setIsPublished(data.published_experiments?.length > 0);
        } catch {
            toast.error('Failed to load strategy');
        } finally {
            setTimeout(() => setLoading(false), 300);
        }
    };

    const isDirty = originalData && (
        code !== originalData.code ||
        optimizationConfig !== originalData.config ||
        strategy?.name !== originalData.name ||
        strategy?.description !== originalData.description
    );

    const handleSave = async () => {
        if (!originalData || !strategy) return;
        setSaving(true);

        let configToSave = optimizationConfig;
        try {
            const lines = optimizationConfig.split('\n').filter(l => l.trim());
            const obj: any = {};
            for (const line of lines) {
                const colonIdx = line.indexOf(':');
                if (colonIdx > -1) {
                    const key = line.substring(0, colonIdx).trim();
                    const val = line.substring(colonIdx + 1).trim();
                    try { obj[key] = JSON.parse(val); } catch { obj[key] = val; }
                }
            }
            configToSave = JSON.stringify(obj);
        } catch { /* keep raw */ }

        const payload: any = {};
        if (code !== originalData.code) payload.code = code;
        if (optimizationConfig !== originalData.config) payload.optimization_config = configToSave;
        if (strategy.name !== originalData.name) payload.name = strategy.name;
        if (strategy.description !== originalData.description) payload.description = strategy.description;

        try {
            await api.patch(`/api/stocks/strategies/${strategyId}/`, payload);
            setOriginalData({ code, config: optimizationConfig, name: strategy.name, description: strategy.description });
            toast.success('Strategy saved');
        } catch (error: any) {
            const err = error.response?.data;
            const msg = err?.detail || (err && typeof err === 'object' ? Object.values(err)[0] : null) || 'Failed to save';
            toast.error(typeof msg === 'string' ? msg : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setIsUnpublishing(true);
        try {
            await api.post(`/api/stocks/strategies/${strategyId}/unpublish/`);
            toast.success('Strategy unpublished');
            setIsPublished(false);
            setUnpublishModalOpen(false);
            fetchStrategy();
        } catch {
            toast.error('Failed to unpublish');
        } finally {
            setIsUnpublishing(false);
        }
    };

    const handleBeforeMount = (monaco: any) => {
        const rules = [
            { token: 'comment', foreground: '5C6773', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'FFB454' },
            { token: 'string', foreground: 'ADDB67' },
            { token: 'number', foreground: 'D484FF' },
            { token: 'type', foreground: '73D0FF' },
            { token: 'function', foreground: 'FFB454' },
            { token: 'class', foreground: '73D0FF' },
        ];
        monaco.editor.defineTheme('ayu-light', {
            base: 'vs', inherit: true, rules,
            colors: {
                'editor.background': '#FAFAFA',
                'editor.foreground': '#5C6773',
                'editor.lineHighlightBackground': '#F2F2F2',
                'editorCursor.foreground': '#FFCC66',
                'editor.selectionBackground': '#F0EEE4',
            },
        });
        monaco.editor.defineTheme('ayu-dark', {
            base: 'vs-dark', inherit: true, rules,
            colors: {
                'editor.background': '#020617',
                'editor.foreground': '#E2E8F0',
                'editor.lineHighlightBackground': '#0F172A',
                'editorCursor.foreground': '#3B82F6',
                'editor.selectionBackground': '#1E293B',
            },
        });
    };

    if (loading) return <FullPageLoader />;

    return (
        <DashboardLayout
            showBack={true}
            title={`Edit — ${strategy?.name || 'Strategy'}`}
        >
            <div className="flex flex-col h-[calc(100vh-100px)] -mt-4">
                <StrategyWorkspaceNav strategyId={String(strategyId)} />

                {/* Published warning */}
                {isPublished && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/50 px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-full">
                                <ShieldAlert size={16} className="text-amber-700 dark:text-amber-500" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Strategy is Published</p>
                                <p className="text-[10px] text-amber-700 dark:text-amber-400/80 mt-0.5">
                                    Code cannot be modified while experiments are published.
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setUnpublishModalOpen(true)}
                            className="h-8 px-3 text-xs font-bold bg-white dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg shadow-sm"
                        >
                            Unpublish
                        </Button>
                    </div>
                )}

                <div className="flex flex-1 overflow-hidden">
                    {/* ── Monaco Editor ── */}
                    <div className={`flex-1 border-r ${themeMode === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-gray-200 bg-white'}`}>
                        <Editor
                            height="100%"
                            defaultLanguage="python"
                            value={code}
                            onChange={(v) => setCode(v || '')}
                            beforeMount={handleBeforeMount}
                            theme={themeMode === 'dark' ? 'ayu-dark' : 'ayu-light'}
                            options={{
                                readOnly: isPublished,
                                minimap: { enabled: false },
                                fontSize: 14,
                                fontWeight: '500',
                                wordWrap: 'on',
                                automaticLayout: true,
                                scrollBeyondLastLine: false,
                                lineNumbersMinChars: 3,
                                padding: { top: 20, bottom: 20 },
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace",
                                fontLigatures: true,
                                lineHeight: 24,
                                letterSpacing: 0.3,
                                renderLineHighlight: 'all',
                                cursorSmoothCaretAnimation: 'on',
                                smoothScrolling: true,
                            }}
                        />
                    </div>

                    {/* ── Right Sidebar ── */}
                    <div className="w-72 bg-gray-50 dark:bg-card border-l border-gray-200 dark:border-slate-800 flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-5 space-y-6">

                            {/* Strategy name + description */}
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">Name</Label>
                                    <input
                                        value={strategy?.name || ''}
                                        onChange={e => setStrategy(s => s ? { ...s, name: e.target.value } : s)}
                                        disabled={isPublished}
                                        className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 focus:border-blue-300 dark:focus:border-blue-800 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        placeholder="Strategy name"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">Description</Label>
                                    <textarea
                                        value={strategy?.description || ''}
                                        onChange={e => setStrategy(s => s ? { ...s, description: e.target.value } : s)}
                                        disabled={isPublished}
                                        rows={2}
                                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100 focus:border-blue-300 dark:focus:border-blue-800 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all shadow-sm resize-none disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
                                        placeholder="What does this strategy do?"
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 border-t border-gray-100 dark:border-slate-800/60 space-y-2.5">
                                <Button
                                    onClick={handleSave}
                                    disabled={saving || !isDirty || isPublished}
                                    className={`w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-sm ${isDirty && !isPublished ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-200 dark:shadow-green-900/20' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700 cursor-not-allowed opacity-60 shadow-none'}`}
                                >
                                    <Save size={14} className="mr-2" />
                                    {saving ? 'Saving…' : 'Save Changes'}
                                </Button>

                                <Button
                                    onClick={async () => {
                                        if (isDirty) await handleSave();
                                        router.push(`/strategies/${strategyId}/backtest`);
                                    }}
                                    className="w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900/20 active:scale-95 transition-all"
                                >
                                    <Play size={14} className="mr-2" />
                                    Backtest
                                </Button>

                                <Button
                                    onClick={() => router.push(`/strategies/${strategyId}/optimize`)}
                                    variant="outline"
                                    className="w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl border border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 dark:bg-card hover:border-purple-300 dark:hover:border-purple-800 active:scale-95 transition-all"
                                >
                                    <Zap size={14} className="mr-2" />
                                    Optimize
                                </Button>

                                {isPublished && (
                                    <Button
                                        onClick={() => setUnpublishModalOpen(true)}
                                        variant="outline"
                                        className="w-full h-10 text-xs font-bold uppercase tracking-wider rounded-xl border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 dark:bg-card active:scale-95 transition-all"
                                    >
                                        <XOctagon size={14} className="mr-2" />
                                        Unpublish
                                    </Button>
                                )}
                            </div>

                            {/* Optimization Config */}
                            <div className="pt-4 border-t border-gray-100 dark:border-slate-800/60 space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Optimization Ranges</Label>
                                    {optimizationConfig.trim() && (
                                        <button
                                            onClick={() => setOptimizationConfig('')}
                                            className="flex items-center gap-1 text-[9px] font-semibold text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors uppercase tracking-wide"
                                        >
                                            <RotateCcw size={9} /> Clear
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed">
                                    One param per line: <span className="font-mono">name: [min, max]</span>
                                </p>
                                <textarea
                                    value={optimizationConfig}
                                    onChange={e => {
                                        const lines = e.target.value.split('\n');
                                        setOptimizationConfig(lines.length <= 12 ? e.target.value : lines.slice(0, 12).join('\n'));
                                    }}
                                    disabled={isPublished}
                                    className="w-full h-48 p-3 text-xs font-mono bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 text-gray-800 dark:text-slate-200 rounded-xl focus:border-blue-300 dark:focus:border-blue-800 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all resize-none leading-relaxed shadow-sm disabled:opacity-50"
                                    placeholder={'fast_window: [10, 30]\nslow_window: [40, 60]'}
                                    spellCheck={false}
                                />
                            </div>

                            {/* Tips */}
                            <div className="p-3 bg-blue-50/60 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl space-y-1.5">
                                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold text-[10px] uppercase tracking-wider">
                                    <Activity size={11} /> Tips
                                </div>
                                <p className="text-[10px] text-blue-600/70 dark:text-blue-400/60 leading-relaxed">
                                    Class-level numeric assignments are auto-detected as parameters. Use <span className="font-mono">param = value</span> at the class body level.
                                </p>
                            </div>
                        </div>

                        {/* Theme toggle (pinned to bottom) */}
                        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-card">
                            <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 block text-center">Editor Theme</Label>
                            <div className="flex p-1 bg-gray-100 dark:bg-slate-950 rounded-xl gap-1 border border-gray-200/50 dark:border-slate-800">
                                <button
                                    onClick={() => setThemeMode('light')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${themeMode === 'light' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
                                >
                                    <Sun size={11} /> Light
                                </button>
                                <button
                                    onClick={() => setThemeMode('dark')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${themeMode === 'dark' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
                                >
                                    <Moon size={11} /> Dark
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Unpublish dialog */}
            <Dialog open={unpublishModalOpen} onOpenChange={setUnpublishModalOpen}>
                <DialogContent className="sm:max-w-[400px] rounded-2xl">
                    <DialogHeader>
                        <div className="w-11 h-11 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mb-3">
                            <AlertTriangle className="text-amber-600 dark:text-amber-500" size={20} />
                        </div>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Unpublish Strategy?</DialogTitle>
                        <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                            This stops automated recommendations for this strategy. You can re-publish after editing.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4 gap-2 sm:flex-row">
                        <Button
                            variant="outline"
                            onClick={() => setUnpublishModalOpen(false)}
                            className="flex-1 h-10 rounded-xl font-semibold border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleUnpublish}
                            disabled={isUnpublishing}
                            className="flex-1 h-10 rounded-xl font-semibold text-xs uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                        >
                            {isUnpublishing ? 'Unpublishing…' : 'Confirm Unpublish'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
