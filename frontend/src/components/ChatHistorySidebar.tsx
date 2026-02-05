import { useState, useEffect } from 'react';
import { Plus, MessageSquare, Clock, Calendar, ChevronRight, MoreVertical, Edit2, Trash2, Check, X as CloseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatHistoryItem {
    id: string;
    title: string;
    date: Date;
}

interface ChatHistorySidebarProps {
    history: ChatHistoryItem[];
    activeChatId?: string;
    onSelectChat: (id: string) => void;
    onNewChat: () => void;
    onRenameChat?: (id: string, newTitle: string) => void;
    onDeleteChat?: (id: string) => void;
}

export function ChatHistorySidebar({
    history,
    activeChatId,
    onSelectChat,
    onNewChat,
    onRenameChat,
    onDeleteChat
}: ChatHistorySidebarProps) {
    const [mounted, setMounted] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    // Group history by date
    const groupedHistory = history.reduce((acc: { [key: string]: ChatHistoryItem[] }, item) => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        let section = 'Previous';
        if (item.date.toDateString() === today.toDateString()) {
            section = 'Today';
        } else if (item.date.toDateString() === yesterday.toDateString()) {
            section = 'Yesterday';
        } else if (item.date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
            section = 'Last 7 Days';
        }

        if (!acc[section]) acc[section] = [];
        acc[section].push(item);
        return acc;
    }, {});

    const sectionOrder = ['Today', 'Yesterday', 'Last 7 Days', 'Previous'];

    return (
        <aside className="w-64 bg-white/20 dark:bg-slate-900/20 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800 flex flex-col h-full shrink-0">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                <Button
                    onClick={onNewChat}
                    className="w-full justify-start gap-2 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white rounded-xl py-5 shadow-md active:scale-[0.98] transition-all"
                >
                    <Plus size={18} />
                    <span className="font-semibold text-sm">New Chat</span>
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-1 space-y-1">
                    {sectionOrder.map(section => {
                        const items = groupedHistory[section];
                        if (!items || items.length === 0) return null;

                        return (
                            <div key={section} className="space-y-0.5">
                                <h3 className="px-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 mt-2 first:mt-0">
                                    {section}
                                </h3>
                                <div className="space-y-0.5">
                                    {items.map(item => (
                                        <div key={item.id} className="relative group/item w-full px-1">
                                            {editingId === item.id ? (
                                                <div className="flex items-center gap-2 pl-4 pr-2 py-1.5 bg-white dark:bg-slate-800 rounded-lg w-full border border-indigo-400 shadow-sm ring-2 ring-indigo-50 dark:ring-indigo-900/20">
                                                    <input
                                                        autoFocus
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onBlur={() => setEditingId(null)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                onRenameChat?.(item.id, editValue);
                                                                setEditingId(null);
                                                            } else if (e.key === 'Escape') {
                                                                setEditingId(null);
                                                            }
                                                        }}
                                                        className="flex-1 bg-transparent text-sm border-none focus:ring-0 p-0 font-medium text-slate-900 dark:text-slate-100"
                                                    />
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                onRenameChat?.(item.id, editValue);
                                                                setEditingId(null);
                                                            }}
                                                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 p-0.5"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                setEditingId(null);
                                                            }}
                                                            className="text-gray-400 hover:text-gray-600 p-0.5"
                                                        >
                                                            <CloseIcon size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-0 w-full relative">
                                                    <button
                                                        onClick={() => onSelectChat(item.id)}
                                                        className={`flex-1 text-left pl-4 pr-3 py-1.5 rounded-lg text-sm transition-all duration-200 group flex items-center justify-between min-w-0 ${activeChatId === item.id
                                                            ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-lg'
                                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 overflow-hidden w-full">
                                                            <MessageSquare size={14} className={activeChatId === item.id ? 'text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'} />
                                                            <span className="truncate font-semibold flex-1 tracking-tight">{item.title}</span>
                                                        </div>
                                                        {activeChatId !== item.id && (
                                                            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 shrink-0 ml-1" />
                                                        )}
                                                    </button>

                                                    <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity ${activeChatId === item.id ? 'bg-slate-900/95 dark:bg-indigo-600/95 shadow-lg' : 'bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm'} rounded-md px-0.5 z-10`}>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <button className={`p-1 rounded-md hover:bg-white/10 ${activeChatId === item.id ? 'text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                                                                    <MoreVertical size={14} />
                                                                </button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-32 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl z-[100]">
                                                                <DropdownMenuItem onSelect={() => {
                                                                    setEditingId(item.id);
                                                                    setEditValue(item.title);
                                                                }}>
                                                                    <Edit2 size={14} className="mr-2" />
                                                                    <span>Rename</span>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onSelect={() => onDeleteChat?.(item.id)}
                                                                    className="text-red-600 focus:text-red-700 hover:bg-red-50"
                                                                >
                                                                    <Trash2 size={14} className="mr-2" />
                                                                    <span>Delete</span>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/10 dark:bg-slate-900/10">
                <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100/50 dark:border-indigo-800/30">
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-tight mb-1">Stockastic AI</p>
                    <p className="text-[11px] text-indigo-500 dark:text-indigo-300 leading-snug">
                        Ask about portfolio optimization, risk analysis, or market trends.
                    </p>
                </div>
            </div>
        </aside>
    );
}
