import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Mail, User, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api";

interface DraftConfig {
    subject: string;
    body_html: string;
    body_template?: string;
    body_format: 'html' | 'text';
    from_name: string;
    use_custom_headers: boolean;
    custom_headers: string;
}

interface TestDraftDialogProps {
    draftId: number | null;
    open: boolean;
    onClose: () => void;
    config?: DraftConfig;
    availableUsers?: Array<{ id: number; email: string }>;
}

interface DraftDetails {
    id: number;
    name: string;
    subject: string;
    from_name: string;
    saved_test_recipients: string[];
    selected_users: Array<{ id: number, email: string }>;
}

export function TestDraftDialog({ draftId, open, onClose, config, availableUsers }: TestDraftDialogProps) {
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [draft, setDraft] = useState<DraftDetails | null>(null);

    const [recipient, setRecipient] = useState('');
    const [senderUserId, setSenderUserId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setRecipient(localStorage.getItem('last_test_recipient') || '');
            setSenderUserId('');
            setError(null);
            setSuccess(null);

            if (draftId) {
                fetchDraftDetails(draftId);
            } else if (config && availableUsers) {
                setDraft({
                    id: 0,
                    name: 'Preview Draft',
                    subject: config.subject,
                    from_name: config.from_name,
                    saved_test_recipients: JSON.parse(localStorage.getItem('saved_test_recipients') || '[]'),
                    selected_users: availableUsers
                });
                if (availableUsers.length > 0) {
                    setSenderUserId(availableUsers[0].id.toString());
                }
            }
        }
    }, [open, draftId, config, availableUsers]);

    const fetchDraftDetails = async (id: number) => {
        setLoading(true);
        try {
            const response = await apiClient.request(`/api/v1/drafts/${id}`);
            if (response.error) throw new Error(response.error);
            setDraft(response.data);

            if (response.data.selected_users?.length > 0) {
                setSenderUserId(response.data.selected_users[0].id.toString());
            }

            if (response.data.saved_test_recipients?.length > 0) {
                setRecipient(response.data.saved_test_recipients[response.data.saved_test_recipients.length - 1]);
            }
        } catch (err: any) {
            setError(err.message || "Failed to load draft details");
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!recipient || !senderUserId) return;

        setSending(true);
        setError(null);
        setSuccess(null);

        try {
            let endpoint = draftId ? `/api/v1/drafts/${draftId}/test-send` : '/api/v1/drafts/test-preview';
            let body = draftId ? {
                recipient,
                sender_user_id: parseInt(senderUserId),
                save_recipient: true
            } : {
                recipient,
                sender_user_id: parseInt(senderUserId),
                save_recipient: true,
                subject: config?.subject,
                body_template: config?.body_format === 'html' ? config?.body_html : config?.body_template,
                from_name: config?.from_name,
                use_custom_headers: config?.use_custom_headers,
                custom_headers: config?.custom_headers
            };

            const response = await apiClient.request(endpoint, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            if (response.error) throw new Error(response.error);

            setSuccess(`Test email dispatched successfully to ${recipient}`);
            localStorage.setItem('last_test_recipient', recipient);

            const saved = JSON.parse(localStorage.getItem('saved_test_recipients') || '[]');
            if (!saved.includes(recipient)) {
                localStorage.setItem('saved_test_recipients', JSON.stringify([...saved, recipient].slice(-5)));
            }

            if (draft && !draft.saved_test_recipients?.includes(recipient)) {
                setDraft({
                    ...draft,
                    saved_test_recipients: [...(draft.saved_test_recipients || []), recipient]
                });
            }

        } catch (err: any) {
            let errorMsg = 'Dispatch failed';
            if (err.message) {
                if (typeof err.message === 'object') {
                    errorMsg = err.message.detail || JSON.stringify(err.message);
                } else {
                    errorMsg = err.message;
                }
            }
            setError(errorMsg);
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-primary" />
                        </div>
                        <DialogTitle className="text-xl font-bold tracking-tight">Dispatch Validation</DialogTitle>
                    </div>
                    <DialogDescription>
                        Transmit a high-fidelity test dispatch via the Gmail API to verify creative rendering and inbox placement.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    {error && (
                        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-xs border border-destructive/20 flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-primary/10 text-primary p-3 rounded-lg text-xs border border-primary/20 flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            {success}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Syncing Workspace...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Test Recipient</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <Input
                                        placeholder="target@delivery.com"
                                        className="h-11 pl-10"
                                        value={recipient}
                                        onChange={(e) => setRecipient(e.target.value)}
                                    />
                                </div>

                                {draft?.saved_test_recipients && draft.saved_test_recipients.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {draft.saved_test_recipients.map((email) => (
                                            <Badge
                                                key={email}
                                                variant="secondary"
                                                className="cursor-pointer hover:bg-muted-foreground/10 transition-colors text-[10px] font-medium py-1"
                                                onClick={() => setRecipient(email)}
                                            >
                                                {email}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Sender Authority</Label>
                                <Select value={senderUserId} onValueChange={setSenderUserId}>
                                    <option value="" disabled>Select Sender Persona</option>
                                    {draft?.selected_users?.map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                            {user.email}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>

                            <div className="p-4 rounded-xl border bg-muted/30 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Subject Line</span>
                                    <Badge variant="outline" className="text-[9px] border-primary/20 text-primary uppercase">Live Header</Badge>
                                </div>
                                <p className="text-sm font-medium truncate opacity-80">{config?.subject || draft?.subject}</p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-4 border-t">
                    <Button variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
                    <Button
                        onClick={handleSend}
                        disabled={loading || sending || !recipient || !senderUserId}
                        className="font-bold px-8"
                    >
                        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {sending ? 'Dispatching...' : 'Fire Test Dispatch'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
