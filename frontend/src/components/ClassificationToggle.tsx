'use client';

import React, { useState } from 'react';
import { Landmark, Repeat } from 'lucide-react';
import api from '@/lib/api';

export type Classification = 'investment' | 'trading';

const META: Record<Classification, { label: string; Icon: typeof Landmark; cls: string }> = {
    investment: { label: 'Investment', Icon: Landmark, cls: 'text-blue-600 dark:text-blue-400' },
    trading: { label: 'Trading', Icon: Repeat, cls: 'text-amber-600 dark:text-amber-400' },
};

interface Props {
    itemId: number;
    classification: Classification;
    onChange?: (id: number, value: Classification) => void;
}

export function ClassificationToggle({ itemId, classification, onChange }: Props) {
    const [value, setValue] = useState<Classification>(classification);
    const [saving, setSaving] = useState(false);

    const toggle = async () => {
        const next: Classification = value === 'investment' ? 'trading' : 'investment';
        const prev = value;
        setValue(next);
        setSaving(true);
        try {
            await api.patch(`/api/stocks/portfolio/${itemId}/update_classification/`, { classification: next });
            onChange?.(itemId, next);
        } catch {
            setValue(prev);
        } finally {
            setSaving(false);
        }
    };

    const { label, Icon, cls } = META[value];
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            disabled={saving}
            aria-label={`${label} — click to switch`}
            title={`${label} — click to switch`}
            className={`p-0.5 rounded transition-all hover:bg-muted/60 ${cls}`}
        >
            <Icon size={14} />
        </button>
    );
}
