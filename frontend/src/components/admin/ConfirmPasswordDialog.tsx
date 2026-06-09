'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from 'lucide-react';

interface ConfirmPasswordDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => Promise<void>;
    title?: string;
    description?: string;
    isLoading?: boolean;
}

export function ConfirmPasswordDialog({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Administrative Action",
    description = "This is a sensitive operation. Please enter your terminal password to continue.",
    isLoading = false
}: ConfirmPasswordDialogProps) {
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        
        try {
            await onConfirm(password);
            setPassword('');
        } catch (error) {
            // Error handling is expected to be managed by the parent via toast or similar
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[400px] bg-white dark:bg-slate-950 border-slate-200 dark:border-border shadow-sm">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                            <Lock className="text-amber-500 w-6 h-6" />
                        </div>
                        <DialogTitle className="text-center text-xl font-bold">{title}</DialogTitle>
                        <DialogDescription className="text-center">
                            {description}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="admin-password">Administrative Password</Label>
                            <Input
                                id="admin-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-slate-50 dark:bg-muted border-slate-200 dark:border-border"
                                autoFocus
                                required
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex sm:justify-between gap-2">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            onClick={onClose}
                            className="flex-1"
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-slate-200"
                            disabled={isLoading || !password}
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & Continue"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
