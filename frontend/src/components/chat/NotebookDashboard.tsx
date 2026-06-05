'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    BookOpen, Plus, Trash2, ArrowRight, Loader2, Clock, Layers,
    Tag, X, Check, Pencil,
    FileText, TrendingUp, BarChart2, Brain, Zap, Globe, Star,
    Target, Briefcase, Activity, Eye, Shield, Search, Radar,
    DollarSign, PieChart, Lightbulb, AlertCircle, Bookmark, Flame
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Config ─────────────────────────────────────────────────────────────────

const NOTEBOOK_COLORS: { name: string; value: string; bg: string; border: string; text: string; iconBg: string; swatch: string }[] = [
    { name: 'Slate',   value: 'slate',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-500',   iconBg: 'bg-slate-500/15',   swatch: 'bg-slate-500' },
    { name: 'Blue',    value: 'blue',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-500',    iconBg: 'bg-blue-500/15',    swatch: 'bg-blue-500' },
    { name: 'Violet',  value: 'violet',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-500',  iconBg: 'bg-violet-500/15',  swatch: 'bg-violet-500' },
    { name: 'Emerald', value: 'emerald', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500', iconBg: 'bg-emerald-500/15', swatch: 'bg-emerald-500' },
    { name: 'Amber',   value: 'amber',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-500',   iconBg: 'bg-amber-500/15',   swatch: 'bg-amber-500' },
    { name: 'Rose',    value: 'rose',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-500',    iconBg: 'bg-rose-500/15',    swatch: 'bg-rose-500' },
    { name: 'Cyan',    value: 'cyan',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    text: 'text-cyan-500',    iconBg: 'bg-cyan-500/15',    swatch: 'bg-cyan-500' },
    { name: 'Orange',  value: 'orange',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  text: 'text-orange-500',  iconBg: 'bg-orange-500/15',  swatch: 'bg-orange-500' },
];

const NOTEBOOK_ICONS: { name: string; value: string; component: React.FC<any> }[] = [
    { name: 'File',      value: 'file-text',   component: FileText },
    { name: 'Trending',  value: 'trending-up', component: TrendingUp },
    { name: 'Chart',     value: 'bar-chart',   component: BarChart2 },
    { name: 'Brain',     value: 'brain',       component: Brain },
    { name: 'Zap',       value: 'zap',         component: Zap },
    { name: 'Globe',     value: 'globe',       component: Globe },
    { name: 'Star',      value: 'star',        component: Star },
    { name: 'Target',    value: 'target',      component: Target },
    { name: 'Briefcase', value: 'briefcase',   component: Briefcase },
    { name: 'Activity',  value: 'activity',    component: Activity },
    { name: 'Eye',       value: 'eye',         component: Eye },
    { name: 'Shield',    value: 'shield',      component: Shield },
    { name: 'Search',    value: 'search',      component: Search },
    { name: 'Radar',     value: 'radar',       component: Radar },
    { name: 'Dollar',    value: 'dollar',      component: DollarSign },
    { name: 'Pie',       value: 'pie-chart',   component: PieChart },
    { name: 'Bulb',      value: 'lightbulb',   component: Lightbulb },
    { name: 'Alert',     value: 'alert',       component: AlertCircle },
    { name: 'Bookmark',  value: 'bookmark',    component: Bookmark },
    { name: 'Flame',     value: 'flame',       component: Flame },
];

export function getColorConfig(value: string) {
    return NOTEBOOK_COLORS.find(c => c.value === value) || NOTEBOOK_COLORS[0];
}

export function getIconComponent(value: string): React.FC<any> {
    return NOTEBOOK_ICONS.find(i => i.value === value)?.component || FileText;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Notebook {
    id: string;
    title: string;
    description: string;
    color: string;
    icon: string;
    tags: string[];
    cell_count: number;
    created_at: string;
    updated_at: string;
}

function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function NotebookDashboard() {
    const router = useRouter();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => { loadNotebooks(); }, []);

    const loadNotebooks = async () => {
        try {
            const res = await api.get('/api/chat/notebooks/');
            setNotebooks(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to load notebooks', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreated = (nb: Notebook) => {
        router.push(`/notebook?id=${nb.id}`);
    };

    const deleteNotebook = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this notebook and all its cells?')) return;
        setDeletingId(id);
        try {
            await api.delete(`/api/chat/notebooks/${id}/`);
            setNotebooks(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            console.error('Failed to delete notebook', err);
        } finally {
            setDeletingId(null);
        }
    };

    const updateNotebook = (updated: Notebook) => {
        setNotebooks(prev => prev.map(n => n.id === updated.id ? updated : n));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading notebooks...</span>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Header row */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground tracking-tight">Research Notebooks</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create, organise, and re-run your AI-powered market research queries.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    id="create-notebook-btn"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 shadow-sm transition-opacity"
                >
                    <Plus size={14} />
                    New Notebook
                </button>
            </div>

            {/* Grid */}
            {notebooks.length === 0 ? (
                <EmptyState onCreate={() => setShowCreateModal(true)} />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {/* New notebook card */}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        id="new-notebook-card"
                        className={cn(
                            "group flex flex-col items-center justify-center gap-3 p-8 rounded-xl min-h-[160px]",
                            "border-2 border-dashed border-border hover:border-foreground/30",
                            "text-muted-foreground hover:text-foreground transition-all duration-200",
                            "hover:bg-accent/30"
                        )}
                    >
                        <Plus size={24} className="group-hover:scale-110 transition-transform duration-200" />
                        <span className="text-sm font-medium">New Notebook</span>
                    </button>

                    {notebooks.map(nb => (
                        <NotebookCard
                            key={nb.id}
                            notebook={nb}
                            deleting={deletingId === nb.id}
                            isEditing={editingId === nb.id}
                            onOpen={() => router.push(`/notebook?id=${nb.id}`)}
                            onDelete={e => deleteNotebook(nb.id, e)}
                            onEditToggle={e => { e.stopPropagation(); setEditingId(editingId === nb.id ? null : nb.id); }}
                            onEditorClose={() => setEditingId(null)}
                            onUpdate={updateNotebook}
                        />
                    ))}
                </div>
            )}

            {/* Create notebook modal */}
            {showCreateModal && (
                <CreateNotebookModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateNotebookModal({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: (nb: Notebook) => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('slate');
    const [icon, setIcon] = useState('file-text');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        titleInputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    const addTag = () => {
        const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
        if (t && !tags.includes(t) && tags.length < 8) setTags(prev => [...prev, t]);
        setTagInput('');
    };

    const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

    const handleCreate = async () => {
        if (!title.trim()) { titleInputRef.current?.focus(); return; }
        setCreating(true);
        try {
            const res = await api.post('/api/chat/notebooks/', {
                title: title.trim(),
                description: description.trim(),
                color,
                icon,
                tags,
            });
            onCreated(res.data);
        } catch (err) {
            console.error('Failed to create notebook', err);
            setCreating(false);
        }
    };

    const col = getColorConfig(color);
    const IconComp = getIconComponent(icon);

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
            <div className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg border", col.iconBg, col.border)}>
                            <IconComp size={18} className={col.text} />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-semibold text-foreground">New Notebook</h2>
                            <p className="text-[12px] text-muted-foreground">Set up your research workspace</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">
                    {/* Title */}
                    <div>
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Notebook Title <span className="text-rose-500">*</span>
                        </label>
                        <input
                            ref={titleInputRef}
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder="e.g. Daily NEPSE Analysis"
                            className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground/60 transition-all"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Description <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What is this notebook for?"
                            rows={2}
                            className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3.5 py-2 outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground/60 resize-none transition-all"
                        />
                    </div>

                    {/* Color + Icon row */}
                    <div className="grid grid-cols-2 gap-5">
                        {/* Color */}
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Color</label>
                            <div className="flex flex-wrap gap-2">
                                {NOTEBOOK_COLORS.map(c => (
                                    <button
                                        key={c.value}
                                        onClick={() => setColor(c.value)}
                                        title={c.name}
                                        className={cn(
                                            "w-7 h-7 rounded-full border-[3px] transition-all duration-150",
                                            c.swatch,
                                            color === c.value
                                                ? "border-foreground scale-110 shadow-sm"
                                                : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Icon */}
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Icon</label>
                            <div className="grid grid-cols-5 gap-1">
                                {NOTEBOOK_ICONS.map(ic => {
                                    const Ic = ic.component;
                                    return (
                                        <button
                                            key={ic.value}
                                            onClick={() => setIcon(ic.value)}
                                            title={ic.name}
                                            className={cn(
                                                "p-2 rounded-lg border transition-all flex items-center justify-center",
                                                icon === ic.value
                                                    ? cn("border", col.border, col.iconBg, col.text)
                                                    : "border-transparent hover:bg-accent text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <Ic size={14} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Tags <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
                        </label>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {tags.map(t => (
                                    <span key={t} className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border", col.bg, col.border, col.text)}>
                                        {t}
                                        <button onClick={() => removeTag(t)} className="hover:opacity-70 transition-opacity ml-0.5">
                                            <X size={9} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                                placeholder="Add tags (Enter to add)"
                                className="flex-1 text-[12px] bg-muted/30 border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground/60"
                            />
                            <button
                                onClick={addTag}
                                disabled={!tagInput.trim() || tags.length >= 8}
                                className="px-3 py-2 rounded-lg bg-muted border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                            >
                                <Tag size={13} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
                    {/* Live preview */}
                    <div className="flex items-center gap-2.5">
                        <div className={cn("p-1.5 rounded-md border", col.iconBg, col.border)}>
                            <IconComp size={13} className={col.text} />
                        </div>
                        <span className="text-[13px] font-medium text-foreground truncate max-w-[180px]">
                            {title.trim() || <span className="text-muted-foreground italic">Untitled Notebook</span>}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-accent border border-border transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={creating || !title.trim()}
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium",
                                "bg-foreground text-background hover:opacity-90 transition-opacity",
                                (creating || !title.trim()) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {creating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Create Notebook
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function NotebookCard({
    notebook, deleting, isEditing,
    onOpen, onDelete, onEditToggle, onEditorClose, onUpdate,
}: {
    notebook: Notebook;
    deleting: boolean;
    isEditing: boolean;
    onOpen: () => void;
    onDelete: (e: React.MouseEvent) => void;
    onEditToggle: (e: React.MouseEvent) => void;
    onEditorClose: () => void;
    onUpdate: (n: Notebook) => void;
}) {
    const color = getColorConfig(notebook.color);
    const IconComponent = getIconComponent(notebook.icon);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isEditing) return;
        const handler = (e: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(e.target as Node)) onEditorClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isEditing, onEditorClose]);

    return (
        <div
            ref={cardRef}
            className={cn(
                "group relative flex flex-col rounded-xl transition-all duration-200",
                "border bg-card shadow-sm",
                isEditing ? "border-border/80 ring-2 ring-ring/20" : "border-border hover:border-border/80 hover:shadow-md",
                deleting && "opacity-50 pointer-events-none"
            )}
        >
            <div
                role="button"
                tabIndex={0}
                id={`notebook-card-${notebook.id}`}
                onClick={onOpen}
                onKeyDown={e => e.key === 'Enter' && onOpen()}
                className="flex flex-col gap-4 p-5 cursor-pointer flex-1"
            >
                <div className="flex items-start justify-between gap-2">
                    <div className={cn("p-2.5 rounded-lg border", color.iconBg, color.border)}>
                        <IconComponent size={18} className={color.text} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={onEditToggle}
                            title="Configure notebook"
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                isEditing ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            <Pencil size={13} />
                        </button>
                        <button
                            onClick={onDelete}
                            title="Delete notebook"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                    </div>
                </div>

                <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-foreground truncate leading-snug">{notebook.title}</h3>
                    {notebook.description && (
                        <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{notebook.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Layers size={11} />
                            {notebook.cell_count} {notebook.cell_count === 1 ? 'cell' : 'cells'}
                        </span>
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Clock size={11} />
                            {timeAgo(notebook.updated_at)}
                        </span>
                    </div>
                </div>

                {notebook.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {notebook.tags.slice(0, 4).map(tag => (
                            <span key={tag} className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium border", color.bg, color.border, color.text)}>
                                {tag}
                            </span>
                        ))}
                        {notebook.tags.length > 4 && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-muted-foreground">
                                +{notebook.tags.length - 4}
                            </span>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="text-[11px] text-muted-foreground/50 font-mono">{notebook.id.slice(0, 8)}</span>
                    <span className={cn("flex items-center gap-1 text-[12px] font-medium opacity-0 group-hover:opacity-100 transition-opacity", color.text)}>
                        Open <ArrowRight size={12} />
                    </span>
                </div>
            </div>

            {isEditing && (
                <NotebookEditor notebook={notebook} onUpdate={onUpdate} onClose={onEditorClose} />
            )}
        </div>
    );
}

// ─── Inline Editor ───────────────────────────────────────────────────────────

function NotebookEditor({ notebook, onUpdate, onClose }: {
    notebook: Notebook;
    onUpdate: (n: Notebook) => void;
    onClose: () => void;
}) {
    const [title, setTitle] = useState(notebook.title);
    const [description, setDescription] = useState(notebook.description || '');
    const [color, setColor] = useState(notebook.color || 'slate');
    const [icon, setIcon] = useState(notebook.icon || 'file-text');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>(notebook.tags || []);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const res = await api.patch(`/api/chat/notebooks/${notebook.id}/`, { title, description, color, icon, tags });
            onUpdate({ ...notebook, ...res.data });
            onClose();
        } catch (err) {
            console.error('Failed to update notebook', err);
        } finally {
            setSaving(false);
        }
    };

    const addTag = () => {
        const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
        if (t && !tags.includes(t) && tags.length < 8) setTags(prev => [...prev, t]);
        setTagInput('');
    };

    const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));
    const col = getColorConfig(color);

    return (
        <div className="border-t border-border bg-muted/30 p-4 rounded-b-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && save()}
                    className="w-full text-sm bg-background border border-border rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-ring text-foreground"
                />
            </div>

            <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What is this notebook for?"
                    rows={2}
                    className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground resize-none"
                />
            </div>

            <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Color</label>
                <div className="flex flex-wrap gap-1.5">
                    {NOTEBOOK_COLORS.map(c => (
                        <button
                            key={c.value}
                            onClick={() => setColor(c.value)}
                            title={c.name}
                            className={cn("w-6 h-6 rounded-full border-2 transition-all", c.swatch, color === c.value ? "border-foreground scale-110" : "border-transparent opacity-60 hover:opacity-100 hover:scale-105")}
                        />
                    ))}
                </div>
            </div>

            <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Icon</label>
                <div className="grid grid-cols-5 gap-1">
                    {NOTEBOOK_ICONS.map(ic => {
                        const Ic = ic.component;
                        return (
                            <button
                                key={ic.value}
                                onClick={() => setIcon(ic.value)}
                                title={ic.name}
                                className={cn(
                                    "p-2 rounded-md border transition-all flex items-center justify-center",
                                    icon === ic.value
                                        ? cn("border", col.border, col.iconBg, col.text)
                                        : "border-transparent hover:bg-accent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Ic size={14} />
                            </button>
                        );
                    })}
                </div>
            </div>

            <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Tags</label>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                    {tags.map(t => (
                        <span key={t} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", col.bg, col.border, col.text)}>
                            {t}
                            <button onClick={() => removeTag(t)} className="hover:opacity-70 transition-opacity"><X size={9} /></button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-1.5">
                    <input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                        placeholder="Add tag, press Enter"
                        className="flex-1 text-[12px] bg-background border border-border rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                    />
                    <button onClick={addTag} disabled={!tagInput.trim()} className="px-2.5 py-1.5 rounded-md bg-muted border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40">
                        <Tag size={12} />
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[12px] text-muted-foreground hover:bg-accent border border-border transition-colors">Cancel</button>
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-60">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Save
                </button>
            </div>
        </div>
    );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
            <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl scale-150" />
                <div className="relative p-5 rounded-2xl bg-card border border-border shadow-sm">
                    <BookOpen size={32} className="text-muted-foreground" />
                </div>
            </div>
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">No notebooks yet</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Create your first notebook to start running and saving AI-powered market research queries.
                </p>
            </div>
            <button
                onClick={onCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm"
            >
                <Plus size={14} />
                Create First Notebook
            </button>
        </div>
    );
}
