'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Plus, Tag } from 'lucide-react';

const PRESET_TAGS = [
    { label: 'Core', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    { label: 'Swing', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    { label: 'Speculative', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
    { label: 'Dividend', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    { label: 'Value', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 border-teal-200 dark:border-teal-800' },
    { label: 'Growth', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400 border-pink-200 dark:border-pink-800' },
];

function getTagColor(tag: string): string {
    const preset = PRESET_TAGS.find(p => p.label.toLowerCase() === tag.toLowerCase());
    return preset?.color || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
}

interface TagPopoverProps {
    itemId: number;
    tags: string[];
    onTagsUpdate?: (id: number, tags: string[]) => void;
}

export function TagPopover({ itemId, tags, onTagsUpdate }: TagPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [customTag, setCustomTag] = useState('');
    const [localTags, setLocalTags] = useState<string[]>(tags || []);
    const [saving, setSaving] = useState(false);

    const saveTags = async (newTags: string[]) => {
        setSaving(true);
        try {
            await api.patch(`/api/stocks/portfolio/${itemId}/update_tags/`, { tags: newTags });
            setLocalTags(newTags);
            onTagsUpdate?.(itemId, newTags);
        } catch (err) {
            console.error('Failed to update tags', err);
        } finally {
            setSaving(false);
        }
    };

    const addTag = (tag: string) => {
        if (!tag.trim() || localTags.includes(tag)) return;
        const newTags = [...localTags, tag.trim()];
        saveTags(newTags);
        setCustomTag('');
    };

    const removeTag = (tag: string) => {
        const newTags = localTags.filter(t => t !== tag);
        saveTags(newTags);
    };

    return (
        <div className="relative inline-block">
            {/* Inline tag display */}
            <div className="flex flex-wrap gap-1 items-center">
                {localTags.map(tag => (
                    <Badge
                        key={tag}
                        variant="outline"
                        className={`text-[9px] font-bold px-1.5 py-0 cursor-pointer transition-all hover:opacity-70 ${getTagColor(tag)}`}
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {tag}
                    </Badge>
                ))}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-0.5 rounded text-slate-400 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    title="Manage tags"
                >
                    <Tag size={10} />
                </button>
            </div>

            {/* Popover */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Quick Tags</div>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESET_TAGS.map(preset => {
                                const isActive = localTags.includes(preset.label);
                                return (
                                    <button
                                        key={preset.label}
                                        onClick={() => isActive ? removeTag(preset.label) : addTag(preset.label)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all ${isActive
                                            ? `${preset.color} ring-1 ring-offset-1 ring-blue-400 dark:ring-offset-slate-900`
                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                            }`}
                                        disabled={saving}
                                    >
                                        {isActive ? '✓ ' : ''}{preset.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="border-t border-border dark:border-slate-800 pt-2">
                            <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Custom Tag</div>
                            <div className="flex gap-1.5">
                                <Input
                                    placeholder="e.g. Tax Loss"
                                    value={customTag}
                                    onChange={(e) => setCustomTag(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') addTag(customTag);
                                    }}
                                    className="h-7 text-xs bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                />
                                <button
                                    onClick={() => addTag(customTag)}
                                    disabled={!customTag.trim() || saving}
                                    className="h-7 px-2 bg-slate-900 dark:bg-slate-700 text-white rounded-md text-xs font-bold disabled:opacity-30 hover:bg-black dark:hover:bg-slate-600 transition-all"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        </div>

                        {/* Active tags with remove */}
                        {localTags.length > 0 && (
                            <div className="border-t border-border dark:border-slate-800 pt-2 space-y-1">
                                <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Active</div>
                                <div className="flex flex-wrap gap-1">
                                    {localTags.map(tag => (
                                        <Badge
                                            key={tag}
                                            variant="outline"
                                            className={`text-[9px] font-bold px-1.5 py-0 ${getTagColor(tag)} flex items-center gap-1`}
                                        >
                                            {tag}
                                            <button
                                                onClick={() => removeTag(tag)}
                                                className="ml-0.5 hover:text-red-500 transition-colors"
                                                disabled={saving}
                                            >
                                                <X size={8} />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export { PRESET_TAGS, getTagColor };
