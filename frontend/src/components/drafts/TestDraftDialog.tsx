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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Mail, User } from "lucide-react";
import { apiClient } from "@/lib/api";

interface TestDraftDialogProps {
    draftId: number | null;
    open: boolean;
    onClose: () => void;
}

interface DraftDetails {
    id: number;
    name: string;
    subject: string;
    from_name: string;
    saved_test_recipients: string[];
    selected_users: Array<{ id: number, email: string }>;
}

export function TestDraftDialog({ draftId, open, onClose }: TestDraftDialogProps) {
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [draft, setDraft] = useState<DraftDetails | null>(null);

    // Form State
    const [recipient, setRecipient] = useState('');
    const [senderUserId, setSenderUserId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Fetch Details when opened
    useEffect(() => {
        if (open && draftId) {
            fetchDraftDetails(draftId);
            setRecipient('');
            setSenderUserId('');
            setError(null);
            setSuccess(null);
        }
    }, [open, draftId]);

    const fetchDraftDetails = async (id: number) => {
        setLoading(true);
        try {
            const response = await apiClient.request(`/api/v1/drafts/${id}`);
            if (response.error) throw new Error(response.error);
            setDraft(response.data);

            // Auto-select first sender if available
            if (response.data.selected_users && response.data.selected_users.length > 0) {
                setSenderUserId(response.data.selected_users[0].id.toString());
            }

            // Auto-fill last recipient if available
            if (response.data.saved_test_recipients && response.data.saved_test_recipients.length > 0) {
                setRecipient(response.data.saved_test_recipients[response.data.saved_test_recipients.length - 1]);
            }
        } catch (err: any) {
            setError(err.message || "Failed to load draft details");
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!recipient || !senderUserId || !draftId) return;

        setSending(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await apiClient.request(`/api/v1/drafts/${draftId}/test-send`, {
                method: 'POST',
                body: JSON.stringify({
                    recipient,
                    sender_user_id: parseInt(senderUserId),
                    save_recipient: true
                })
            });

            if (response.error) throw new Error(response.error);

            setSuccess(`Test email sent to ${recipient}`);

            // Update local saved list if successful
            if (draft && !draft.saved_test_recipients?.includes(recipient)) {
                setDraft({
                    ...draft,
                    saved_test_recipients: [...(draft.saved_test_recipients || []), recipient]
                });
            }

        } catch (err: any) {
            setError(err.message || "Failed to send test email");
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Send Test Email</DialogTitle>
                    <DialogDescription>
                        Send a single test email to verify formatting and deliverability.
                        This mimics a real campaign send using the Gmail API.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-200">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm border border-green-200 flex items-center gap-2">
                        <div className="h-2 w-2 bg-green-500 rounded-full" />
                        {success}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                ) : !draft ? (
                    <div className="text-center py-4 text-gray-500">Could not load draft details.</div>
                ) : (
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="recipient">Test Recipient</Label>
                            <div className="relative">
                                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                                <Input
                                    id="recipient"
                                    placeholder="name@example.com"
                                    className="pl-9"
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                />
                            </div>

                            {/* Saved Recipients Chips */}
                            {draft.saved_test_recipients && draft.saved_test_recipients.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {draft.saved_test_recipients.map((email) => (
                                        <Badge
                                            key={email}
                                            variant="outline"
                                            className="cursor-pointer hover:bg-gray-100 font-normal text-xs"
                                            onClick={() => setRecipient(email)}
                                        >
                                            {email}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="sender">Sender Account</Label>
                            <Select value={senderUserId} onValueChange={setSenderUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a sender for this test" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                    {draft.selected_users?.map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                            {user.email}
                                        </SelectItem>
                                    ))}
                                    {(!draft.selected_users || draft.selected_users.length === 0) && (
                                        <div className="p-2 text-sm text-gray-500 text-center">
                                            No users selected in this draft.
                                            <br />Please edit the draft to select users.
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                                This email will be sent FROM this user via Gmail API.
                            </p>
                        </div>

                        <div className="bg-gray-50 p-3 rounded-md border text-xs text-gray-600 space-y-1 mt-2">
                            <p><strong>Subject:</strong> {draft.subject}</p>
                            <p><strong>From Name:</strong> {draft.from_name || '(Default)'}</p>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={handleSend} disabled={loading || sending || !recipient || !senderUserId}>
                        {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {sending ? 'Sending...' : 'Send Test Email'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
