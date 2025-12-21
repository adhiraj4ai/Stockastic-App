'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
    Play,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Clock,
    Server,
    Activity
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

interface PipelineTask {
    id: string;
    name: string;
    status: 'idle' | 'running' | 'success' | 'failed';
    last_run: string;
    message: string;
}

export default function PipelinePage() {
    const [tasks, setTasks] = useState<PipelineTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [runningTasks, setRunningTasks] = useState<string[]>([]);

    const fetchStatus = async () => {
        try {
            const res = await api.get('/api/stocks/pipeline/status/');
            setTasks(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch pipeline status");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const handleRunTask = async (taskId: string) => {
        setRunningTasks(prev => [...prev, taskId]);
        try {
            await api.post(`/api/stocks/pipeline/${taskId}/run/`);
            toast.success(`Task triggered successfully`);
            fetchStatus(); // Refresh status immediately
        } catch (err) {
            console.error(err);
            toast.error("Failed to start task");
        } finally {
            // Remove from local running state after a delay or immediately if we trust status
            setTimeout(() => {
                setRunningTasks(prev => prev.filter(id => id !== taskId));
            }, 1000);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running': return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
            case 'success': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case 'failed': return <AlertCircle className="w-5 h-5 text-red-500" />;
            default: return <Clock className="w-5 h-5 text-gray-400" />;
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Server className="w-6 h-6 text-indigo-600" />
                        Data Pipeline
                    </h1>
                    <p className="text-gray-500 mt-1">Manage data ingestion and synchronization tasks</p>
                </div>
                <Button variant="outline" onClick={fetchStatus} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Status
                </Button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">System Tasks</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Activity className="w-4 h-4" />
                        <span>Auto-refreshes every 30s</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                            <tr>
                                <th className="px-6 py-4">Task Name</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Last Run</th>
                                <th className="px-6 py-4">Message</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && tasks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                        Loading pipeline status...
                                    </td>
                                </tr>
                            ) : tasks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                        No tasks found.
                                    </td>
                                </tr>
                            ) : (
                                tasks.map((task) => (
                                    <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {task.name}
                                            <div className="text-xs text-gray-400 font-normal mt-0.5 font-mono">{task.id}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(task.status)}
                                                <span className={`capitalize ${task.status === 'success' ? 'text-green-700' :
                                                        task.status === 'failed' ? 'text-red-700' :
                                                            task.status === 'running' ? 'text-blue-700' : 'text-gray-600'
                                                    }`}>
                                                    {task.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                            {new Date(task.last_run).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 truncate max-w-[200px]" title={task.message}>
                                            {task.message}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button
                                                size="sm"
                                                onClick={() => handleRunTask(task.id)}
                                                disabled={task.status === 'running' || runningTasks.includes(task.id)}
                                                className={`${task.status === 'running' || runningTasks.includes(task.id)
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : 'hover:bg-indigo-600 bg-indigo-50 text-indigo-700 hover:text-white border-indigo-200'
                                                    }`}
                                                variant="outline"
                                            >
                                                {task.status === 'running' || runningTasks.includes(task.id) ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-1.5" />
                                                )}
                                                Run Now
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-blue-800 text-sm">Pipeline Information</h4>
                    <p className="text-sm text-blue-600 mt-1">
                        Tasks listed here are executed asynchronously on the backend.
                        The status updates automatically. 'Idle' indicates the task is ready to run.
                    </p>
                </div>
            </div>
        </div>
    );
}
