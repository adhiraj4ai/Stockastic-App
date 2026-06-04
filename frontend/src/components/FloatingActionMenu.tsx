'use client';

import React, { useState } from 'react';
import { Calculator, MessageSquare, X, Plus } from 'lucide-react';

interface FloatingActionMenuProps {
    onOpenChat?: () => void;
    onOpenCalculator?: () => void;
}

export function FloatingActionMenu({ onOpenChat, onOpenCalculator }: FloatingActionMenuProps) {
    const [isOpen, setIsOpen] = useState(false);

    const actions = [
        {
            icon: MessageSquare,
            label: 'AI Assistant',
            onClick: () => {
                onOpenChat?.();
                setIsOpen(false);
            },
            gradient: 'from-green-600 to-emerald-600'
        },
        {
            icon: Calculator,
            label: 'Position Sizing',
            onClick: () => {
                onOpenCalculator?.();
                setIsOpen(false);
            },
            gradient: 'from-blue-600 to-purple-600'
        }
    ];

    return (
        <div className="fixed bottom-8 right-8 z-50">
            {/* Action Buttons - Appear when menu is open */}
            <div className={`flex flex-col gap-3 mb-3 transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                }`}>
                {actions.map((action, idx) => (
                    <button
                        key={idx}
                        onClick={action.onClick}
                        className={`group relative bg-gradient-to-r ${action.gradient} text-white p-3 rounded-full shadow-xl hover:scale-110 transition-all`}
                        title={action.label}
                    >
                        <action.icon className="h-5 w-5" />
                        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {action.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Main Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`bg-gradient-to-r from-indigo-600 to-pink-600 text-white p-4 rounded-full shadow-sm hover:scale-110 transition-all ${isOpen ? 'rotate-45' : 'rotate-0'
                    }`}
                title={isOpen ? 'Close menu' : 'Quick actions'}
            >
                {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </button>
        </div>
    );
}
