'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Copy, ClipboardCopy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { formatCardText, type SocialCardData, type SocialTemplateId } from '@/lib/socialCardText';
import { THEMES, type CardTheme } from './SocialCardFrame';

interface ExportToolbarProps {
    captureRef: React.RefObject<HTMLDivElement | null>;
    templateId: SocialTemplateId;
    data: SocialCardData;
    theme: CardTheme;
}

export function ExportToolbar({ captureRef, templateId, data, theme }: ExportToolbarProps) {
    const text = formatCardText(templateId, data);

    const renderCanvas = async () => {
        const el = captureRef.current;
        if (!el) throw new Error('Nothing to capture');
        await new Promise(resolve => setTimeout(resolve, 100));
        return html2canvas(el, {
            scale: 1080 / el.offsetWidth,
            backgroundColor: THEMES[theme].exportBg,
            useCORS: true,
            allowTaint: true,
            logging: false,
        });
    };

    const handleSave = async () => {
        const toastId = toast.loading('Generating image…');
        try {
            const canvas = await renderCanvas();
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `stockastic-${templateId}-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Image saved.', { id: toastId });
        } catch {
            toast.error('Failed to generate image.', { id: toastId });
        }
    };

    const handleCopyImage = async () => {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
            toast.error('Copying images is not supported in this browser — use Save image instead.');
            return;
        }
        const toastId = toast.loading('Copying image…');
        try {
            const canvas = await renderCanvas();
            const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('toBlob failed');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            toast.success('Image copied — paste it into your post.', { id: toastId });
        } catch {
            toast.error('Failed to copy image.', { id: toastId });
        }
    };

    const handleCopyText = () => {
        navigator.clipboard.writeText(text);
        toast.success('Post text copied.');
    };

    const openIntent = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

    return (
        <div className="w-full max-w-md mx-auto space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <Button onClick={handleSave} className="gap-2 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                    <Download size={15} /> Save image
                </Button>
                <Button onClick={handleCopyImage} variant="outline" className="gap-2 h-11 rounded-xl font-semibold">
                    <ClipboardCopy size={15} /> Copy image
                </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <Button onClick={handleCopyText} disabled={!text} variant="outline" className="gap-2 h-10 rounded-xl text-xs font-semibold">
                    <Copy size={13} /> Copy text
                </Button>
                <Button
                    onClick={() => openIntent(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`)}
                    disabled={!text} variant="outline" className="gap-2 h-10 rounded-xl text-xs font-semibold"
                >
                    <ExternalLink size={13} /> Post on X
                </Button>
                <Button
                    onClick={() => openIntent(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`)}
                    disabled={!text} variant="outline" className="gap-2 h-10 rounded-xl text-xs font-semibold"
                >
                    <ExternalLink size={13} /> LinkedIn
                </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
                Platforms can&apos;t accept images via web links — use <span className="font-semibold">Copy image</span> and paste it in the composer.
            </p>
        </div>
    );
}
