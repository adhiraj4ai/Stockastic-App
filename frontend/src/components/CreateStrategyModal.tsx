'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { X, Lightbulb, TrendingUp, Zap, Target, Activity, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers } from 'lucide-react';

const availableIcons = [
    { name: 'Lightbulb', icon: Lightbulb },
    { name: 'TrendingUp', icon: TrendingUp },
    { name: 'Zap', icon: Zap },
    { name: 'Target', icon: Target },
    { name: 'Activity', icon: Activity },
    { name: 'Shield', icon: Shield },
    { name: 'BarChart3', icon: BarChart3 },
    { name: 'PieChart', icon: PieChart },
    { name: 'Flame', icon: Flame },
    { name: 'Rocket', icon: Rocket },
    { name: 'Cpu', icon: Cpu },
    { name: 'Layers', icon: Layers },
];

interface CreateStrategyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateStrategyModal({ isOpen, onClose, onSuccess }: CreateStrategyModalProps) {
    const router = useRouter();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('Lightbulb');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            const response = await axios.post(
                `${apiUrl}/api/stocks/strategies/`,
                { name, description, icon: selectedIcon },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Reset and close
            setName('');
            setDescription('');
            setSelectedIcon('Lightbulb');
            onSuccess();
            onClose();

            // Navigate to edit page
            if (response.data && response.data.id) {
                router.push(`/strategies/${response.data.id}/editor`);
            }
        } catch (err: any) {
            console.error('Failed to create strategy', err);
            setError('Failed to create strategy. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900">Create New Strategy</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Strategy Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Moving Average Crossover"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-4">
                        <Label>Strategy Icon</Label>
                        <div className="grid grid-cols-6 gap-2 p-1 bg-gray-50 rounded-xl border border-gray-100">
                            {availableIcons.map((item) => {
                                const Icon = item.icon;
                                const isSelected = selectedIcon === item.name;
                                return (
                                    <button
                                        key={item.name}
                                        type="button"
                                        onClick={() => setSelectedIcon(item.name)}
                                        className={`flex items-center justify-center p-2 rounded-lg transition-all ${isSelected
                                            ? 'bg-blue-600 text-white shadow-md scale-110'
                                            : 'bg-white text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                                            }`}
                                        title={item.name}
                                    >
                                        <Icon size={20} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Describe your strategy logic..."
                            className="h-24 resize-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Strategy'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
