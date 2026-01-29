'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    Upload,
    Users,
    Mail,
    Settings,
    Loader2,
    Save,
    ArrowRight,
    Eye,
    Send,
    Book,
    Code,
    ArrowLeft,
    Shield
} from 'lucide-react';
import { TemplateTagsGuide } from '@/components/drafts/TemplateTagsGuide';
import { TemplatePreview } from '@/components/drafts/TemplatePreview';
import { TestDraftDialog } from '@/components/drafts/TestDraftDialog';
import { serviceAccountsApi, usersApi, dataListsApi, apiClient } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Account {
    id: number;
    name: string;
    client_email: string;
    domain: string;
    status: string;
    total_users: number;
}

interface User {
    id: number;
    email: string;
    name: string;
    is_active: boolean;
    service_account_id: number;
}

interface ContactList {
    id: number;
    name: string;
    contacts: Array<{ email: string }>;
}

interface DraftConfig {
    name: string;
    subject: string;
    body_html: string;
    from_name: string;
    use_custom_headers: boolean;
    custom_headers: string;
    body_format: string;
    body_template: string;
    test_after_email?: string;
    test_after_count?: number;
    emails_per_user?: number;
}

export default function EditDraftPage() {
    const router = useRouter();
    const params = useParams(); // Get ID from URL
    // const { toast } = useToast(); // REMOVED
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Distribution State
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [contactLists, setContactLists] = useState<ContactList[]>([]);
    const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
    const [userSearch, setUserSearch] = useState('');

    const [config, setConfig] = useState<DraftConfig>({
        name: '',
        subject: '',
        body_html: '',
        from_name: '',
        use_custom_headers: false,
        custom_headers: '', // Initialize empty!
        body_format: 'html',
        body_template: '',
        emails_per_user: 1
    });

    const DEFAULT_HEADERS = `MIME-version: 1.0\nContent-type: text/html\nTo: [to]\nfrom: [from] <[smtp]>\nSubject: [subject]\nDate: [date]\nMessage-ID: [Message-ID]`;

    // Template customization state
    const [showTagsGuide, setShowTagsGuide] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState({ headers: '', body: '' });

    const [showTestDialog, setShowTestDialog] = useState(false);

    const filteredSelectedUsers = useMemo(() => {
        const q = userSearch.trim().toLowerCase();
        const base = users.filter(u => selectedAccounts.includes(u.service_account_id));
        if (!q) return base;
        return base.filter(u => u.email.toLowerCase().includes(q));
    }, [users, selectedAccounts, userSearch]);

    // Data Loading Functions
    const loadAccounts = useCallback(async () => {
        try {
            const response = await apiClient.request('/api/v1/accounts/');
            if (response.error) throw new Error(response.error);
            setAccounts(response.data || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            const response = await apiClient.request('/api/v1/users/');
            if (response.error) throw new Error(response.error);
            setUsers(response.data || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const loadContactLists = useCallback(async () => {
        try {
            const response = await apiClient.request('/api/v1/contacts/lists');
            if (response.error) throw new Error(response.error);
            setContactLists(response.data || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const fetchDraftDetails = useCallback(async (id: string) => {
        setLoading(true);
        try {
            await Promise.all([loadAccounts(), loadUsers(), loadContactLists()]);

            const response = await apiClient.request(`/api/v1/drafts/${id}`);
            if (response.error) throw new Error(response.error);

            const data = response.data;
            setConfig({
                name: data.name,
                subject: data.subject,
                body_html: data.body_html || '',
                from_name: data.from_name || '',
                use_custom_headers: data.use_custom_headers || false,
                custom_headers: data.custom_headers || '',
                body_format: data.body_format || 'html',
                body_template: data.body_template || '',
                test_after_email: data.test_after_email,
                test_after_count: data.test_after_count,
                emails_per_user: data.emails_per_user || 1
            });

            // Set selections
            if (data.selected_accounts) {
                setSelectedAccounts(data.selected_accounts.map((a: any) => a.id));
            }
            if (data.selected_users) {
                setSelectedUsers(data.selected_users.map((u: any) => u.id));
            }
            if (data.selected_contacts) {
                setSelectedContacts(data.selected_contacts.map((c: any) => c.id));
            }

        } catch (err: any) {
            setError(err.message || "Failed to load draft details");
        } finally {
            setLoading(false);
        }
    }, [loadAccounts, loadUsers, loadContactLists]);

    useEffect(() => {
        if (params.id) {
            fetchDraftDetails(params.id as string);
        }
    }, [params.id, fetchDraftDetails]);

    const updateDraft = async () => {
        // Validate
        if (!config.name.trim()) {
            setError("Please enter a draft name.");
            return;
        }

        // If not using custom headers, validate subject
        if (!config.use_custom_headers && !config.subject.trim()) {
            setError("Please enter a subject.");
            return;
        }

        if (!config.body_html.trim()) {
            setError("Please enter email body.");
            return;
        }

        if (selectedUsers.length === 0) {
            setError("Please select at least one user.");
            return;
        }

        if (selectedContacts.length === 0) {
            setError("Please select at least one contact list.");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = {
                ...config,
                selected_account_ids: selectedAccounts,
                selected_user_ids: selectedUsers,
                selected_contact_list_ids: selectedContacts
            };

            const response = await apiClient.request(`/api/v1/drafts/${params.id}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            if (response.error) throw new Error(response.error);

            setSuccess("Draft updated successfully!");

            // Optionally redirect back to list
            // setTimeout(() => router.push('/drafts'), 1000);
        } catch (err: any) {
            setError(err.message || "Failed to update draft");
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = async () => {
        if (!config.body_html.trim()) return;

        try {
            const response = await apiClient.request('/api/v1/drafts/preview', {
                method: 'POST',
                body: JSON.stringify({
                    template_body: config.body_html,
                    template_headers: config.use_custom_headers ? config.custom_headers : undefined,
                    use_custom_headers: config.use_custom_headers,
                    dummy_context: {
                        subject: config.subject,
                        from_name: config.from_name
                    }
                })
            });

            if (response.error) throw new Error(response.error);

            setPreviewData({
                headers: response.data.headers || '',
                body: response.data.body || ''
            });
            setShowPreview(true);
        } catch (err: any) {
            setError(`Preview Failed: ${err.message}`);
        }
    };



    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading draft...</span>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                    <Button variant="ghost" className="mr-4" onClick={() => router.push('/drafts')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <h1 className="text-3xl font-bold">Edit Draft</h1>
                </div>
                <Button onClick={updateDraft} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Changes
                </Button>
            </div>

            {error && (
                <Alert className="mb-6 border-red-200 bg-red-50">
                    <AlertDescription className="text-red-800">{error}</AlertDescription>
                </Alert>
            )}

            {success && (
                <Alert className="mb-6 border-green-200 bg-green-50">
                    <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Draft Content</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                placeholder="Draft Name"
                                value={config.name}
                                onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                            />
                            <Input
                                placeholder="Subject"
                                value={config.subject}
                                onChange={e => setConfig(c => ({ ...c, subject: e.target.value }))}
                            />
                            <Input
                                placeholder="From Name"
                                value={config.from_name}
                                onChange={e => setConfig(c => ({ ...c, from_name: e.target.value }))}
                            />

                            <div className="flex items-center gap-2 mb-2">
                                <Label>Body Format:</Label>
                                <Select
                                    value={config.body_format}
                                    onValueChange={(val) => setConfig(c => ({ ...c, body_format: val }))}
                                >
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Format" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="html">HTML</SelectItem>
                                        <SelectItem value="text">Plain Text</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Button variant="outline" size="sm" onClick={() => setShowTagsGuide(true)}>
                                    <Book className="h-4 w-4 mr-2" />
                                    Template Tags
                                </Button>
                            </div>

                            <Textarea
                                placeholder="Email Body (HTML)"
                                value={config.body_html}
                                onChange={e => setConfig(c => ({ ...c, body_html: e.target.value }))}
                                rows={12}
                                className="font-mono"
                            />

                            <div className="border-t pt-4 mt-4 space-y-4">
                                <h4 className="font-semibold flex items-center gap-2">
                                    <Shield className="h-5 w-5" />
                                    Deliverability & Warming
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Test Email (After X sends)</Label>
                                        <Input
                                            placeholder="monitor@example.com"
                                            value={config.test_after_email || ''}
                                            onChange={e => setConfig(c => ({ ...c, test_after_email: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Send every X emails</Label>
                                        <Input
                                            type="number"
                                            placeholder="e.g. 50"
                                            value={config.test_after_count || 0}
                                            onChange={e => setConfig(c => ({ ...c, test_after_count: parseInt(e.target.value) || 0 }))}
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Automatically sends a copy of the campaign to the test email every X emails to monitor inbox placement.
                                </p>
                            </div>

                            {/* Template Customization Section */}
                            <div className="border-t pt-4 mt-4 space-y-4">
                                <h4 className="font-semibold flex items-center gap-2">
                                    <Code className="h-5 w-5" />
                                    Advanced Template Options
                                </h4>

                                {/* Custom Headers Toggle */}
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="custom-headers"
                                        checked={config.use_custom_headers}
                                        onCheckedChange={(checked) => setConfig(c => ({ ...c, use_custom_headers: !!checked }))}
                                    />
                                    <Label htmlFor="custom-headers">Use Custom Email Headers</Label>
                                </div>

                                {/* Custom Headers Textarea - Always visible for better UX */}
                                <Textarea
                                    placeholder="Custom Email Headers"
                                    value={config.custom_headers}
                                    onChange={e => {
                                        setConfig(c => ({ ...c, custom_headers: e.target.value }));
                                        // Auto-enable checkbox if user is typing custom headers
                                        if (e.target.value.trim() && !config.use_custom_headers) {
                                            setConfig(c => ({ ...c, use_custom_headers: true }));
                                        }
                                    }}
                                    rows={6}
                                    className="font-mono text-sm"
                                />

                                {/* Template Tags & Preview Buttons */}
                                <div className="flex gap-2 flex-wrap">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handlePreview}
                                    >
                                        <Eye className="h-4 w-4 mr-2" />
                                        Preview Template
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowTestDialog(true)}
                                    >
                                        <Send className="h-4 w-4 mr-2" />
                                        Send Test Email
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Distribution Logic
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* User Selection */}
                                <div>
                                    <Label className="text-base font-medium">Select Users</Label>
                                    <div className="max-h-64 overflow-y-auto border rounded-md p-3 mt-2">
                                        {users.filter(u => selectedAccounts.includes(u.service_account_id)).map(user => (
                                            <div key={user.id} className="flex items-center space-x-2 py-1">
                                                <Checkbox
                                                    id={`user-${user.id}`}
                                                    checked={selectedUsers.includes(user.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedUsers(prev => [...prev, user.id]);
                                                        } else {
                                                            setSelectedUsers(prev => prev.filter(id => id !== user.id));
                                                        }
                                                    }}
                                                />
                                                <Label htmlFor={`user-${user.id}`} className="text-sm">
                                                    {user.email}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {selectedUsers.length} users selected
                                    </p>
                                </div>

                                {/* Contact Lists Selection */}
                                <div>
                                    <Label className="text-base font-medium">Select Contact Lists</Label>
                                    <div className="max-h-64 overflow-y-auto border rounded-md p-3 mt-2">
                                        {contactLists.map(list => (
                                            <div key={list.id} className="flex items-center space-x-2 py-1">
                                                <Checkbox
                                                    id={`contact-${list.id}`}
                                                    checked={selectedContacts.includes(list.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedContacts(prev => [...prev, list.id]);
                                                        } else {
                                                            setSelectedContacts(prev => prev.filter(id => id !== list.id));
                                                        }
                                                    }}
                                                />
                                                <Label htmlFor={`contact-${list.id}`} className="text-sm">
                                                    {list.name} ({list.contacts.length} contacts)
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {selectedContacts.length} contact lists selected
                                    </p>
                                </div>
                            </div>

                            {/* Emails Per User */}
                            <div>
                                <Label htmlFor="emails-per-user">Emails Per User</Label>
                                <Input
                                    id="emails-per-user"
                                    type="number"
                                    min="1"
                                    value={config.emails_per_user || 1}
                                    onChange={(e) => setConfig(c => ({ ...c, emails_per_user: parseInt(e.target.value) || 1 }))}
                                    className="w-32"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Each user will receive {config.emails_per_user || 1} draft(s)
                                </p>
                                <p className="text-xs text-blue-600 mt-1">
                                    Total drafts: {selectedUsers.length * (config.emails_per_user || 1)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="xl:col-span-1 space-y-6">
                    {/* Account Selection */}
                    <Card>
                        <CardHeader><CardTitle>Select Accounts</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {accounts.length === 0 ? (
                                    <div className="border rounded-md p-3 bg-muted/30 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span>No accounts found.</span>
                                        </div>
                                        <p className="mt-1 text-muted-foreground">If this persists, ensure service accounts exist via the Accounts page.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="max-h-48 overflow-auto border rounded-md p-2 space-y-2">
                                            {accounts.map(acc => (
                                                <div key={acc.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`acc-${acc.id}`}
                                                        checked={selectedAccounts.includes(acc.id)}
                                                        onCheckedChange={checked => {
                                                            setSelectedAccounts(prev => checked ? [...prev, acc.id] : prev.filter(id => id !== acc.id))
                                                        }}
                                                    />
                                                    <Label htmlFor={`acc-${acc.id}`} className="font-normal text-sm">
                                                        {acc.name || acc.client_email}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{selectedAccounts.length} of {accounts.length} accounts selected.</p>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Users of Selected Accounts */}
                    <Card>
                        <CardHeader><CardTitle>Users of Selected Accounts ({filteredSelectedUsers.length})</CardTitle></CardHeader>
                        <CardContent>
                            <Input placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                            {accounts.length === 0 ? (
                                <div className="text-sm text-muted-foreground mt-2">Select accounts first to view users.</div>
                            ) : (
                                <div className="max-h-48 overflow-auto border rounded-md mt-2">
                                    {filteredSelectedUsers.map(u => (
                                        <div key={u.id} className="flex items-center space-x-2 py-1">
                                            <Checkbox
                                                id={`user-${u.id}`}
                                                checked={selectedUsers.includes(u.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setSelectedUsers(prev => [...prev, u.id]);
                                                    } else {
                                                        setSelectedUsers(prev => prev.filter(id => id !== u.id));
                                                    }
                                                }}
                                            />
                                            <Label htmlFor={`user-${u.id}`} className="text-sm">
                                                {u.email}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                {selectedUsers.length} users selected
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" />Recipients Summary</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Total Recipients:</span>
                                    <span className="font-medium">
                                        {contactLists
                                            .filter(list => selectedContacts.includes(list.id))
                                            .reduce((total, list) => total + list.contacts.length, 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Selected Users:</span>
                                    <span className="font-medium">{selectedUsers.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Emails per User:</span>
                                    <span className="font-medium">{config.emails_per_user || 1}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2">
                                    <span className="font-medium">Total Drafts:</span>
                                    <span className="font-medium text-blue-600">
                                        {selectedUsers.length * (config.emails_per_user || 1)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Template Tags Guide Component */}
            <Dialog open={showTagsGuide} onOpenChange={setShowTagsGuide}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Template Tags Guide</DialogTitle>
                    </DialogHeader>
                    <TemplateTagsGuide
                        showInsertButton={false}
                    />
                </DialogContent>
            </Dialog>

            {/* Template Preview Modal */}
            <TemplatePreview
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                headers={previewData.headers}
                body={previewData.body}
            />

            {/* Test Email Dialog would go here (simplified for this file) */}
        </div>
    );
}
