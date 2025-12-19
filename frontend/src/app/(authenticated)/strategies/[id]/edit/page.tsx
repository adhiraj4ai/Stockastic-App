'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation'; // Changed from 'next/router' for App Router
import Editor from '@monaco-editor/react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Save, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
}

export default function EditStrategyPage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id;

    // Editor State
    const [code, setCode] = useState<string>('# Write your strategy logic here\n\ndef next_move(tick):\n    if tick["close"] > tick["ma_50"]:\n        return "BUY"\n    return "HOLD"');
    const [validationIssues, setValidationIssues] = useState<any[]>([]);

    // Sidebar State
    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [symbol, setSymbol] = useState('NABIL');
    const [startDate, setStartDate] = useState('2023-01-01');
    const [endDate, setEndDate] = useState('2023-12-31');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
        }
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            setStrategy(response.data);
            if (response.data.code) {
                setCode(response.data.code);
            }
        } catch (error: any) {
            console.error('Failed to fetch strategy', error);
            // 401 handled by global interceptor
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch(`/api/stocks/strategies/${strategyId}/`, {
                code,
                name: strategy?.name,
                description: strategy?.description
            });
            toast.success('Strategy saved successfully');
        } catch (error) {
            console.error('Failed to save strategy', error);
            toast.error('Failed to save strategy');
        } finally {
            setSaving(false);
        }
    };

    // Monaco Editor Ref
    const [editorRef, setEditorRef] = useState<any>(null);
    const [monacoRef, setMonacoRef] = useState<any>(null);

    const handleEditorDidMount = (editor: any, monaco: any) => {
        setEditorRef(editor);
        setMonacoRef(monaco);
    };

    const handleValidate = async () => {
        toast.info('Running linter...');
        setValidationIssues([]);

        // Clear existing markers
        if (monacoRef && editorRef) {
            monacoRef.editor.setModelMarkers(editorRef.getModel(), 'owner', []);
        }

        try {
            const response = await api.post('/api/stocks/strategies/validate_code/', { code });

            if (response.data.valid) {
                toast.success('Code looks good!');
            } else {
                toast.warning(`${response.data.issues.length} issues found`);
                setValidationIssues(response.data.issues);

                // Set Markers in Editor
                if (monacoRef && editorRef) {
                    const markers = response.data.issues.map((issue: any) => ({
                        startLineNumber: issue.line,
                        startColumn: 1,
                        endLineNumber: issue.line,
                        endColumn: 1000,
                        message: issue.message,
                        severity: issue.type === 'error' ? monacoRef.MarkerSeverity.Error : monacoRef.MarkerSeverity.Warning,
                    }));
                    monacoRef.editor.setModelMarkers(editorRef.getModel(), 'owner', markers);
                }
            }
        } catch (error) {
            console.error('Validation failed', error);
            toast.error('Validation failed');
        }
    };



    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full">Loading editor...</div>
            </DashboardLayout>
        );
    }

    const handleRun = async () => {
        // Auto-save before running
        await handleSave();
        router.push(`/strategies/${strategyId}/run`);
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col h-[calc(100vh-64px)]">
                {/* Toolbar */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={() => window.location.href = '/strategies'}
                        >
                            <ArrowLeft size={18} />
                        </Button>
                        <div className="flex flex-col flex-1 min-w-0">
                            <input
                                value={strategy?.name || ''}
                                onChange={(e) => strategy && setStrategy({ ...strategy, name: e.target.value })}
                                className="text-xl font-bold text-gray-900 border-none bg-transparent p-0 h-7 w-full focus:ring-0 placeholder:text-gray-300"
                                placeholder="Untitled Strategy"
                            />
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider border border-blue-100">Python 3.10</span>
                                <span className="text-[10px] text-gray-400 font-medium truncate">{strategy?.description || 'No description provided'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content: Split View */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Editor Area */}
                    <div className="flex-1 border-r border-gray-200">
                        <Editor
                            height="100%"
                            defaultLanguage="python"
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            onMount={handleEditorDidMount}
                            theme="vs-light"
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                wordWrap: 'on',
                                automaticLayout: true,
                                scrollBeyondLastLine: false,
                                lineNumbersMinChars: 3,
                                padding: { top: 16 }
                            }}
                        />
                    </div>

                    {/* Right Sidebar: Configuration */}
                    <div className="w-80 bg-gray-50 p-5 border-l border-gray-200 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <h3 className="text-[11px] font-bold text-gray-400 mb-4 uppercase tracking-[0.1em]">Actions</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <Button
                                    onClick={handleValidate}
                                    variant="outline"
                                    className="w-full justify-start gap-3 h-11 border-gray-200 hover:bg-white hover:border-blue-200 hover:text-blue-600 transition-all font-semibold"
                                >
                                    <div className="h-6 w-6 rounded bg-blue-50 flex items-center justify-center text-blue-500">
                                        <CheckCircle size={14} />
                                    </div>
                                    Validate Code
                                </Button>

                                <Button
                                    onClick={handleSave}
                                    disabled={saving}
                                    variant="outline"
                                    className="w-full justify-start gap-3 h-11 border-gray-200 hover:bg-white hover:border-green-200 hover:text-green-600 transition-all font-semibold"
                                >
                                    <div className={`h-6 w-6 rounded flex items-center justify-center ${saving ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-500'}`}>
                                        <Save size={14} />
                                    </div>
                                    {saving ? 'Saving...' : 'Save Strategy'}
                                </Button>

                                <div className="h-px bg-gray-200 my-1"></div>

                                <Button
                                    onClick={handleRun}
                                    disabled={saving}
                                    className="w-full justify-start gap-3 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-100 active:scale-[0.98] transition-all"
                                >
                                    <div className="h-6 w-6 rounded bg-blue-500/50 flex items-center justify-center text-white">
                                        <Play size={14} />
                                    </div>
                                    {saving ? 'Saving...' : 'Run Backtest'}
                                </Button>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed bg-white/50 p-2 rounded border border-gray-100">
                                This will validate and save your current code changes before initializing the backtest runner.
                            </p>
                        </div>

                        <div className="border-t border-gray-200 pt-6">
                            <h3 className="flex items-center justify-between text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">
                                Linter Results
                                {validationIssues.length > 0 && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">{validationIssues.length}</span>}
                            </h3>

                            {validationIssues.length === 0 ? (
                                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center text-gray-400 text-sm">
                                    <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                                    No issues found.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {validationIssues.map((issue, idx) => (
                                        <div key={idx} className="bg-white p-3 rounded-lg border border-red-200 shadow-sm border-l-4 border-l-red-500">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-bold text-red-600 uppercase">{issue.type || 'Error'}</span>
                                                <span className="text-xs text-gray-400">Line {issue.line}</span>
                                            </div>
                                            <p className="text-xs text-gray-700 font-medium">{issue.message}</p>
                                            <p className="text-[10px] text-gray-400 mt-1 font-mono">{issue.symbol}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>


            </div>

        </DashboardLayout >
    );
}
