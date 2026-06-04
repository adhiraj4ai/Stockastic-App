import React from 'react';
import { Briefcase, TrendingUp, Zap, Bell } from 'lucide-react';

interface SuggestionGridProps {
    onSelect: (suggestion: string) => void;
}

export const SuggestionGrid: React.FC<SuggestionGridProps> = ({ onSelect }) => {
    const categories = [
        {
            icon: Briefcase,
            title: 'My Portfolio',
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
            border: 'border-blue-400/20',
            questions: ['Analyze my portfolio performance', 'What are my top holdings?']
        },
        {
            icon: TrendingUp,
            title: 'Market',
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10',
            border: 'border-emerald-400/20',
            questions: ['Market summary for today', 'Which sector is performing best?']
        },
        {
            icon: Zap,
            title: 'Strategies',
            color: 'text-purple-400',
            bg: 'bg-purple-400/10',
            border: 'border-purple-400/20',
            questions: ['Show me active buy signals', 'List available strategies']
        },
        {
            icon: Bell,
            title: 'Alerts',
            color: 'text-amber-400',
            bg: 'bg-amber-400/10',
            border: 'border-amber-400/20',
            questions: ['Do I have any new notifications?', 'Check alerts for NABIL']
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-7xl mx-auto px-4">
            {categories.map((cat, idx) => (
                <div
                    key={idx}
                    className={`
                        p-4 rounded-xl border transition-all duration-200
                        hover:bg-white/50 bg-white/30 border-gray-200/50
                        dark:hover:bg-gray-800/40 dark:bg-gray-900/20 ${cat.border}
                    `}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`p-1.5 rounded-lg ${cat.bg} ${cat.color}`}>
                            <cat.icon size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.title}</span>
                    </div>
                    <div className="space-y-2">
                        {cat.questions.map((q, qIdx) => (
                            <button
                                key={qIdx}
                                onClick={() => onSelect(q)}
                                className="w-full text-left text-sm text-gray-600 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800/50 px-3 py-2 rounded-lg transition-colors truncate"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
