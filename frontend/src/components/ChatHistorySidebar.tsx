'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, MoreVertical, Edit2, Trash2, ChevronRight, PlusCircle, Clock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from '@/components/ui/input';

interface ChatHistoryItem {
    id: string;
    title: string;
    date: Date;
}

interface ChatHistorySidebarProps {
    history: ChatHistoryItem[];
    activeChatId: string;
    onSelectChat: (id: string) => void;
    onNewChat: () => void;
    onRenameChat?: (id: string, title: string) => void;
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
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredHistory = history.filter(item =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-80 h-full border-r border-border/10 bg-background/20 backdrop-blur-3xl flex flex-col relative z-20 overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-8 pb-6 space-y-6">
                <Button
                    onClick={onNewChat}
                    className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-sm horizon-glow transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] border-none"
                >
                    <PlusCircle className="mr-2" size={18} />
                    New Horizon
                </Button>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={14} />
                    <Input
                        placeholder="Search history..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-11 bg-foreground/5 border-none rounded-2xl text-[13px] font-medium placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-primary/20 transition-all"
                    />
                </div>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
                <div className="px-4 py-2">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-4 px-1 flex items-center gap-2">
                        <Clock size={10} />
                        Recorded Vantages
                    </h4>
                </div>

                <AnimatePresence initial={false}>
                    {filteredHistory.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -5 }}
                            className="relative group/item"
                        >
                            {editingId === item.id ? (
                                <div className="px-2 py-1">
                                    <Input
                                        autoFocus
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => {
                                            if (editValue.trim() && editValue !== item.title) {
                                                onRenameChat?.(item.id, editValue);
                                            }
                                            setEditingId(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                if (editValue.trim() && editValue !== item.title) {
                                                    onRenameChat?.(item.id, editValue);
                                                }
                                                setEditingId(null);
                                            }
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        className="h-10 bg-background border-primary/30 rounded-xl text-sm"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center gap-0 w-full relative">
                                    <button
                                        onClick={() => onSelectChat(item.id)}
                                        className={`flex-1 text-left px-4 py-4 rounded-2xl text-sm transition-all duration-300 flex items-center justify-between min-w-0 ${activeChatId === item.id
                                            ? 'bg-foreground/5 text-foreground font-bold shadow-sm'
                                            : 'text-muted-foreground/60 hover:text-foreground/80 hover:bg-foreground/5'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4 overflow-hidden w-full">
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${activeChatId === item.id ? 'bg-primary horizon-glow' : 'bg-transparent'}`} />
                                            <span className="truncate tracking-tight">{item.title}</span>
                                        </div>
                                        {activeChatId !== item.id && (
                                            <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all text-muted-foreground/30 shrink-0 ml-1" />
                                        )}
                                    </button>

                                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-all duration-200 bg-background/80 backdrop-blur-md border border-border/50 rounded-lg p-0.5 z-10 shadow-xl`}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="p-1.5 rounded-md hover:bg-foreground/10 text-muted-foreground/60 hover:text-foreground">
                                                    <MoreVertical size={14} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="horizon-glass border-border/30 rounded-2xl p-1 z-[100] shadow-2xl">
                                                <DropdownMenuItem
                                                    className="rounded-xl p-3 font-bold text-[11px] uppercase tracking-widest text-muted-foreground/70"
                                                    onSelect={() => { setEditingId(item.id); setEditValue(item.title); }}
                                                >
                                                    <Edit2 size={12} className="mr-3" />
                                                    <span>Rename</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="rounded-xl p-3 font-bold text-[11px] uppercase tracking-widest text-rose-500 focus:text-rose-600 focus:bg-rose-50/10"
                                                    onSelect={() => onDeleteChat?.(item.id)}
                                                >
                                                    <Trash2 size={12} className="mr-3" />
                                                    <span>Delete</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Footer info */}
            <div className="p-6 border-t border-border/5 bg-foreground/[0.02]">
                <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] font-mono">Horizon Stable</span>
                    <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 horizon-glow animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    );
}
