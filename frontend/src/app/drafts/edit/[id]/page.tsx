'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
    ArrowLeft
} from 'lucide-react';
import { TemplateTagsGuide } from '@/components/drafts/TemplateTagsGuide';
import { TemplatePreview } from '@/components/drafts/TemplatePreview';
import { serviceAccountsApi, usersApi, dataListsApi, apiClient } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DraftConfig {
    name: string;
    subject: string;
    body_html: string;
    from_name: string;
    use_custom_headers: boolean;
    custom_headers: string;
    body_format: string;
    body_template: string;
}

export default function EditDraftPage() {
    const router = useRouter();
    const params = useParams(); // Get ID from URL
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [config, setConfig] = useState<DraftConfig>({
        name: '',
        subject: '',
        body_html: '',
        from_name: '',
        use_custom_headers: false,
        custom_headers: `MIME-version: 1.0\nContent-type: text/html\nTo: [to]\nfrom: [from] <[smtp]>\nSubject: [subject]\nDate: [date]\nMessage-ID: [Message-ID]`,
        body_format: 'html',
        body_template: ''
    });

    // Template customization state
    const [showTagsGuide, setShowTagsGuide] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState({ headers: '', body: '' });
    const [showTestEmail, setShowTestEmail] = useState(false);
    const [testEmail, setTestEmail] = useState('');

    useEffect(() => {
        if (params.id) {
            fetchDraftDetails(params.id as string);
        }
    }, [params.id]);

    const fetchDraftDetails = async (id: string) => {
        setLoading(true);
        try {
            const response = await apiClient.request(`/api/v1/drafts/${id}`);
            if (response.error) throw new Error(response.error);

            const data = response.data;
            setConfig({
                name: data.name,
                subject: data.subject,
                body_html: data.body_html || '',
                from_name: data.from_name || '',
                use_custom_headers: data.use_custom_headers || false,
                custom_headers: data.custom_headers || config.custom_headers,
                body_format: data.body_format || 'html',
                body_template: data.body_template || ''
            });
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to load draft details",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const updateDraft = async () => {
        // Validate
        if (!config.name.trim()) {
            toast({ title: "Validation Error", description: "Please enter a draft name.", variant: "destructive" });
            return;
        }

        // If not using custom headers, validate subject
        if (!config.use_custom_headers && !config.subject.trim()) {
            toast({ title: "Validation Error", description: "Please enter a subject.", variant: "destructive" });
            return;
        }

        if (!config.body_html.trim()) {
            toast({ title: "Validation Error", description: "Please enter email body.", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const response = await apiClient.request(`/api/v1/drafts/${params.id}`, {
                method: 'PATCH',
                body: JSON.stringify(config)
            });
            if (response.error) throw new Error(response.error);

            toast({
                title: "Success",
                description: "Draft updated successfully!",
            });

            // Optionally redirect back to list
            router.push('/drafts');
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to update draft",
                variant: "destructive"
            });
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
            toast({ title: "Preview Failed", description: err.message, variant: "destructive" });
        }
    };

    const handleSendTest = async () => {
        if (!testEmail || !config.body_html) return;

        try {
            const response = await apiClient.request('/api/v1/drafts/test-email', {
                method: 'POST',
                body: JSON.stringify({
                    recipient: testEmail,
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

            toast({ title: "Test Email Sent", description: `Sent to ${testEmail}` });
            setShowTestEmail(false);
        } catch (err: any) {
            toast({ title: "Test Failed", description: err.message, variant: "destructive" });
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
        <div className="container mx-auto p-6 max-w-5xl">
            <div className="flex items-center mb-6">
                <Button variant="ghost" className="mr-4" onClick={() => router.push('/drafts')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <h1 className="text-3xl font-bold">Edit Draft</h1>
            </div>

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
                                        onClick={() => setShowTestEmail(true)}
                                    >
                                        <Send className="h-4 w-4 mr-2" />
                                        Send Test Email
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => router.push('/drafts')}>Cancel</Button>
                            <Button onClick={updateDraft} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Save Changes
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="xl:col-span-1 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Draft Info</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-500 mb-4">
                                Editing this draft will update the template. To resend or send to new users, please launch or duplicate the campaign.
                            </p>
                            {/* Add more info or stats here if needed */}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Template Tags Guide Component */}
            <TemplateTagsGuide
                open={showTagsGuide}
                onOpenChange={setShowTagsGuide}
            />

            {/* Template Preview Modal */}
            <TemplatePreview
                open={showPreview}
                onOpenChange={setShowPreview}
                headers={previewData.headers}
                body={previewData.body}
            />

            {/* Test Email Dialog would go here (simplified for this file) */}
        </div>
    );
}
