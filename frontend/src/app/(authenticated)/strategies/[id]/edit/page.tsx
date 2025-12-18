'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
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
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await axios.get(`${apiUrl}/api/stocks/strategies/${strategyId}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStrategy(response.data);
            if (response.data.code) {
                setCode(response.data.code);
            }
        } catch (error: any) {
            console.error('Failed to fetch strategy', error);
            if (error.response?.status === 401) {
                window.location.href = '/login';
                return;
            }
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            await axios.patch(`${apiUrl}/api/stocks/strategies/${strategyId}/`,
                {
                    code,
                    name: strategy?.name,
                    description: strategy?.description
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
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
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await axios.post(`${apiUrl}/api/stocks/strategies/validate_code/`,
                { code },
                { headers: { Authorization: `Bearer ${token}` } }
            );

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

    return (
        <DashboardLayout>
            <div className="flex flex-col h-[calc(100vh-64px)]">
                {/* Toolbar */}
                <div className="bg-white border-b border-gray-200 px-4 py-2 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-gray-900 -ml-2"
                            onClick={() => window.location.href = '/strategies'}
                        >
                            <ArrowLeft size={18} />
                        </Button>
                        <div className="h-6 w-px bg-gray-200 mx-1"></div>
                        <Input
                            value={strategy?.name || ''}
                            onChange={(e) => strategy && setStrategy({ ...strategy, name: e.target.value })}
                            className="text-lg font-semibold text-gray-900 border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent px-2 h-9 w-full max-w-md transition-all placeholder:text-gray-400"
                            placeholder="Untitled Strategy"
                        />
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded flex-shrink-0 border border-gray-100">Python 3.10</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={handleValidate} variant="outline" size="sm" className="gap-2">
                            <CheckCircle size={16} className="text-blue-500" /> Validate
                        </Button>
                        <Button onClick={handleSave} size="sm" className="gap-2" disabled={saving}>
                            <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                        </Button>
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
                                fontSize: 13,
                                wordWrap: 'on',
                                automaticLayout: true,
                            }}
                        />
                    </div>

                    {/* Right Sidebar: Configuration */}
                    <div className="w-80 bg-gray-50 p-4 border-l border-gray-200 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Actions</h3>
                            <Button
                                onClick={() => router.push(`/strategies/${strategyId}/run`)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 shadow-sm"
                            >
                                <Play size={16} className="mr-2" /> Run Backtest
                            </Button>
                            <p className="text-xs text-gray-400 mt-2 text-center">
                                Opens backtest runner in a new page.
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
