'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation'; // Changed from 'next/router' for App Router
import Editor from '@monaco-editor/react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Save, ArrowLeft, Activity, Sun, Moon, AlertTriangle, XOctagon, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

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

    // Editor State
    const [code, setCode] = useState<string>('# Write your strategy logic here\n\ndef next_move(tick):\n    if tick["close"] > tick["ma_50"]:\n        return "BUY"\n    return "HOLD"');
    const [optimizationConfig, setOptimizationConfig] = useState<string>('');
    const [themeMode, setThemeMode] = useState<'default' | 'light' | 'dark'>('default');

    // Sidebar State
    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [originalData, setOriginalData] = useState<{ code: string; config: string; name: string; description: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isPublished, setIsPublished] = useState(false);
    const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
    const [isUnpublishing, setIsUnpublishing] = useState(false);

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
        }
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            const data = response.data;
            setStrategy(data);
            if (data.code) {
                setCode(data.code);
            }

            let initialConfig = data.optimization_config || '';
            let displayConfig = initialConfig;
            try {
                if (initialConfig.trim()) {
                    const parsed = JSON.parse(initialConfig);
                    displayConfig = Object.entries(parsed)
                        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                        .join('\n');
                }
            } catch (e) {
                console.warn('Optimization config is not valid JSON', e);
            }

            setOptimizationConfig(displayConfig);

            setOriginalData({
                code: data.code || '',
                config: displayConfig,
                name: data.name || '',
                description: data.description || ''
            });
            setIsPublished(data.published_experiments && data.published_experiments.length > 0);
        } catch (error: any) {
            console.error('Failed to fetch strategy', error);
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const isDirty = originalData && (
        code !== originalData.code ||
        optimizationConfig !== originalData.config ||
        (strategy?.name !== originalData.name) ||
        (strategy?.description !== originalData.description)
    );

    const handleSave = async () => {
        if (!originalData || !strategy) return;
        setSaving(true);

        // Convert line-by-line back to JSON
        let configToSave = optimizationConfig;
        try {
            const lines = optimizationConfig.split('\n').filter(l => l.trim());
            const obj: any = {};
            lines.forEach(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex > -1) {
                    const key = line.substring(0, colonIndex).trim();
                    const value = line.substring(colonIndex + 1).trim();
                    try {
                        obj[key] = JSON.parse(value);
                    } catch (e) {
                        obj[key] = value;
                    }
                }
            });
            configToSave = JSON.stringify(obj);
        } catch (e) {
            console.error('Failed to parse config lines', e);
        }

        // Construct only modified fields
        const payload: any = {};
        if (code !== originalData.code) payload.code = code;
        if (optimizationConfig !== originalData.config) payload.optimization_config = configToSave;
        if (strategy.name !== originalData.name) payload.name = strategy.name;
        if (strategy.description !== originalData.description) payload.description = strategy.description;

        try {
            await api.patch(`/api/stocks/strategies/${strategyId}/`, payload);
            setOriginalData({
                code,
                config: optimizationConfig,
                name: strategy.name || '',
                description: strategy.description || ''
            });
            toast.success('Strategy saved successfully');
        } catch (error: any) {
            console.error('Failed to save strategy', error);
            // Extract the most descriptive error message
            const errorData = error.response?.data;
            const message = errorData?.detail ||
                (errorData && typeof errorData === 'object' ? Object.values(errorData)[0] : null) ||
                'Failed to save strategy. Please check if the strategy is published.';

            toast.error(typeof message === 'string' ? message : 'Failed to save strategy');
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setIsUnpublishing(true);
        try {
            await api.post(`/api/stocks/strategies/${strategyId}/unpublish/`);
            toast.success('Strategy unpublished successfully. You can now edit the code.');
            setIsPublished(false);
            setUnpublishModalOpen(false);
            // Refresh strategy data to be sure
            fetchStrategy();
        } catch (error: any) {
            console.error('Failed to unpublish strategy', error);
            toast.error('Failed to unpublish strategy');
        } finally {
            setIsUnpublishing(false);
        }
    };

    // Monaco Editor Ref
    const [editorRef, setEditorRef] = useState<any>(null);
    const [monacoRef, setMonacoRef] = useState<any>(null);

    const handleBeforeMount = (monaco: any) => {
        // Define Ayu Light Theme
        monaco.editor.defineTheme('ayu-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: 'comment', foreground: 'ABB0B6', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'FA8D3E' },
                { token: 'string', foreground: '86B300' },
                { token: 'number', foreground: 'A37ACC' },
                { token: 'regexp', foreground: '4CBF99' },
                { token: 'type', foreground: '399EE6' },
                { token: 'function', foreground: 'F29718' },
                { token: 'variable', foreground: '5C6773' },
                { token: 'class', foreground: '399EE6' },
            ],
            colors: {
                'editor.background': '#FAFAFA',
                'editor.foreground': '#5C6773',
                'editor.lineHighlightBackground': '#F2F2F2',
                'editorCursor.foreground': '#FFCC66',
                'editor.selectionBackground': '#F0EEE4',
                'editorIndentGuide.background': '#EDEEF0',
                'editorIndentGuide.activeBackground': '#ABB0B6',
            }
        });

        // Define Ayu Dark Theme
        monaco.editor.defineTheme('ayu-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '5C6773', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'FAEFA5' },
                { token: 'string', foreground: 'ADDB67' },
                { token: 'number', foreground: 'D484FF' },
                { token: 'regexp', foreground: '5FB3B3' },
                { token: 'type', foreground: '73D0FF' },
                { token: 'function', foreground: 'FFB454' },
                { token: 'variable', foreground: 'CCCAC2' },
                { token: 'class', foreground: '73D0FF' },
            ],
            colors: {
                'editor.background': '#0F1419',
                'editor.foreground': '#CCCAC2',
                'editor.lineHighlightBackground': '#151A1E',
                'editorCursor.foreground': '#F29718',
                'editor.selectionBackground': '#253340',
                'editorIndentGuide.background': '#23282D',
                'editorIndentGuide.activeBackground': '#5C6773',
            }
        });
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        setEditorRef(editor);
        setMonacoRef(monaco);
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full">Loading editor...</div>
            </DashboardLayout>
        );
    }

    const handleRun = async () => {
        if (isDirty) {
            await handleSave();
        }
        router.push(`/strategies/${strategyId}/run`);
    };

    const getEditorTheme = () => {
        if (themeMode === 'default') return 'vs-light';
        return themeMode === 'light' ? 'ayu-light' : 'ayu-dark';
    };

    return (
        <DashboardLayout
            showBack={true}
            title={`Edit Strategy - ${strategy?.name || 'Loading...'}`}
        >
            <div className="flex flex-col h-[calc(100vh-100px)] -mt-4">
                {/* Warning Banner if Published */}
                {isPublished && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/50 px-6 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-full">
                                <ShieldAlert size={18} className="text-amber-700 dark:text-amber-500" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 leading-tight">Strategy is Published</h4>
                                <p className="text-xs text-amber-700 dark:text-amber-400/80 mt-0.5">
                                    The code cannot be modified while experiments are published. Unpublish to enable editing.
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUnpublishModalOpen(true)}
                            className="bg-white dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-300 dark:hover:border-amber-700 font-bold text-xs h-8 px-4 rounded-lg shadow-sm"
                        >
                            Unpublish Now
                        </Button>
                    </div>
                )}

                {/* Main Content: Split View */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Editor Area */}
                    <div className={`flex-1 border-r ${themeMode === 'dark' ? 'border-[#151A1E] bg-[#0F1419]' : 'border-gray-200 bg-white'}`}>
                        <Editor
                            height="100%"
                            defaultLanguage="python"
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            beforeMount={handleBeforeMount}
                            onMount={handleEditorDidMount}
                            theme={getEditorTheme()}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 16,
                                fontWeight: '500',
                                wordWrap: 'on',
                                automaticLayout: true,
                                scrollBeyondLastLine: false,
                                lineNumbersMinChars: 3,
                                padding: { top: 20, bottom: 20 },
                                fontFamily: "'SF Mono', 'Geist Mono', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', ui-monospace, monospace",
                                fontLigatures: true,
                                lineHeight: 26,
                                letterSpacing: 0.5,
                                renderLineHighlight: 'all',
                                cursorSmoothCaretAnimation: 'on',
                                smoothScrolling: true,
                            }}
                        />
                    </div>

                    {/* Right Sidebar: Configuration */}
                    <div className="w-80 bg-gray-50 dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Action Buttons */}
                            <div className="space-y-4 pb-8 border-b border-gray-200">
                                <Button
                                    onClick={handleSave}
                                    disabled={saving || !isDirty || isPublished}
                                    variant={isDirty && !isPublished ? "default" : "outline"}
                                    className={`w-full h-12 px-5 gap-2 transition-all font-black rounded-xl text-sm uppercase tracking-widest ${isDirty && !isPublished ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-100 dark:shadow-green-900/20' : 'text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 cursor-not-allowed opacity-60'}`}
                                >
                                    <Save size={18} />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>

                                {isPublished && (
                                    <Button
                                        onClick={() => setUnpublishModalOpen(true)}
                                        className="w-full h-11 px-5 gap-2 bg-white dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/40 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-sm transition-all"
                                    >
                                        <XOctagon size={16} />
                                        Unpublish Strategy
                                    </Button>
                                )}

                                <Button
                                    onClick={handleRun}
                                    className="w-full h-12 px-5 gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black rounded-xl text-sm uppercase tracking-widest shadow-lg shadow-blue-100 dark:shadow-blue-900/20 active:scale-[0.98] transition-all"
                                >
                                    <Play size={18} />
                                    Backtest
                                </Button>
                            </div>

                            <div className="space-y-4 pt-2">
                                <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.15em]">Optimization Config</h3>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed font-medium">
                                    Define parameter ranges (max 10 lines).
                                </p>
                                <textarea
                                    value={optimizationConfig}
                                    onChange={(e) => {
                                        const lines = e.target.value.split('\n');
                                        if (lines.length <= 10) {
                                            setOptimizationConfig(e.target.value);
                                        } else {
                                            setOptimizationConfig(lines.slice(0, 10).join('\n'));
                                        }
                                    }}
                                    className="w-full h-[240px] p-4 text-sm font-mono font-medium bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 text-gray-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none shadow-sm leading-relaxed"
                                    placeholder={'fast_window: [10, 30]\nslow_window: [40, 60]'}
                                />
                            </div>

                            <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl space-y-2">
                                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-[10px] uppercase">
                                    <Activity size={12} />
                                    Tips
                                </div>
                                <p className="text-[10px] text-blue-600/80 dark:text-blue-400/60 leading-relaxed">
                                    Use list format `[min, max]` for continuous ranges or `[1, 2, 3]` for categorical values. Example: `param_name: [start, end]`.
                                </p>
                            </div>
                        </div>

                        {/* Theme Toggle at Bottom */}
                        <div className="p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800">
                            <div className="flex flex-col gap-2">
                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1 text-center">Editor Theme</Label>
                                <div className="flex items-center gap-1 p-1 bg-gray-50 dark:bg-slate-950 rounded-xl border border-gray-100 dark:border-slate-800">
                                    <button
                                        onClick={() => setThemeMode('default')}
                                        className={`flex-1 flex items-center justify-center h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${themeMode === 'default' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
                                    >
                                        Default
                                    </button>
                                    <button
                                        onClick={() => setThemeMode('light')}
                                        className={`flex-1 flex items-center justify-center gap-2 h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${themeMode === 'light' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
                                    >
                                        <Sun size={12} />
                                        Light
                                    </button>
                                    <button
                                        onClick={() => setThemeMode('dark')}
                                        className={`flex-1 flex items-center justify-center gap-2 h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${themeMode === 'dark' ? 'bg-gray-800 dark:bg-slate-800 text-blue-400 shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
                                    >
                                        <Moon size={12} />
                                        Dark
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Unpublish Confirmation Dialog */}
            <Dialog open={unpublishModalOpen} onOpenChange={setUnpublishModalOpen}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                    <DialogHeader>
                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle className="text-amber-600 dark:text-amber-500" size={24} />
                        </div>
                        <DialogTitle className="text-xl font-black text-slate-900 dark:text-slate-100">Unpublish Strategy?</DialogTitle>
                        <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed pt-2">
                            This will stop generating automated recommendations for this strategy.
                            You will be able to edit and save your code changes after unpublishing.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6 gap-3 sm:flex-row sm:gap-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setUnpublishModalOpen(false);
                            }}
                            className="flex-1 sm:flex-none sm:min-w-[120px] h-12 rounded-xl font-bold border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                handleUnpublish();
                            }}
                            disabled={isUnpublishing}
                            className="flex-1 sm:flex-none sm:min-w-[160px] h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-100 transition-all"
                        >
                            {isUnpublishing ? 'Unpublishing...' : 'Confirm Unpublish'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
