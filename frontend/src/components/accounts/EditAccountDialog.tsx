import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { ServiceAccount } from './AccountCard';

interface EditAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    account: ServiceAccount | null;
    onSave: (id: number, data: any) => Promise<void>;
}

export function EditAccountDialog({
    open,
    onOpenChange,
    account,
    onSave
}: EditAccountDialogProps) {
    const [name, setName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [dailyLimit, setDailyLimit] = useState<number>(2000);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && account) {
            setName(account.name);
            setAdminEmail(account.admin_email || '');
            setDailyLimit(account.quota_limit || 2000);
        }
    }, [open, account]);

    const handleSave = async () => {
        if (!account) return;

        setError(null);
        if (!name.trim()) {
            setError('Account name is required');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSave(account.id, {
                name,
                admin_email: adminEmail,
                quota_limit: dailyLimit
            });
            onOpenChange(false);
        } catch (e: any) {
            console.error(e);
            setError('Failed to update account');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Edit Service Account</DialogTitle>
                    <DialogDescription>
                        Update account details and quotas.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-name">Account Name</Label>
                        <Input
                            id="edit-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-admin-email">Admin Email (for impersonation)</Label>
                        <Input
                            id="edit-admin-email"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                            placeholder="admin@example.com"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-limit">Daily Send Limit</Label>
                        <Input
                            id="edit-limit"
                            type="number"
                            value={dailyLimit}
                            onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
                        />
                    </div>

                    {error && (
                        <div className="text-sm text-red-500 bg-red-50 p-2 rounded border border-red-200">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
