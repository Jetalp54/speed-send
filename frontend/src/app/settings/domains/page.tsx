'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Server,
    Plus,
    Trash2,
    CheckCircle,
    XCircle,
    Loader2,
    Globe,
    RefreshCw
} from 'lucide-react';
import { trackingDomainsApi } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TrackingDomain {
    id: number;
    domain: string;
    ip_address: string;
    status: 'pending' | 'provisioning' | 'active' | 'failed';
    ssl_active: boolean;
    provisioning_log?: string;
    created_at: string;
}

export default function DomainsPage() {
    const [domains, setDomains] = useState<TrackingDomain[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Form State
    const [newDomain, setNewDomain] = useState({
        domain: '',
        ip_address: '',
        root_password: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchDomains();
        // Auto-refresh for provisioning status
        const interval = setInterval(fetchDomains, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchDomains = async () => {
        try {
            const res = await trackingDomainsApi.list();
            if (res.data) setDomains(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddDomain = async () => {
        setError(null);
        setSubmitting(true);
        try {
            if (!newDomain.domain || !newDomain.ip_address || !newDomain.root_password) {
                throw new Error("All fields are required");
            }

            const res = await trackingDomainsApi.create(newDomain);
            if (res.error) throw new Error(res.error);

            setDomains(prev => [res.data, ...prev]);
            setIsAddModalOpen(false);
            setNewDomain({ domain: '', ip_address: '', root_password: '' });
            fetchDomains(); // Immediate refresh
        } catch (err: any) {
            setError(err.message || "Failed to add domain");
        } finally {
            setSubmitting(false);
        }
    };

    const deleteDomain = async (id: number) => {
        if (!confirm("Are you sure? This will break tracking links for any campaigns using this domain.")) return;
        try {
            await trackingDomainsApi.delete(id);
            setDomains(prev => prev.filter(d => d.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    const getStatusBadge = (status: string, ssl: boolean) => {
        if (status === 'active') {
            return <Badge className="bg-green-100 text-green-800 flex gap-1 items-center"><CheckCircle className="w-3 h-3" /> Active {ssl && '(SSL)'}</Badge>;
        }
        if (status === 'failed') {
            return <Badge className="bg-red-100 text-red-800 flex gap-1 items-center"><XCircle className="w-3 h-3" /> Failed</Badge>;
        }
        if (status === 'provisioning') {
            return <Badge className="bg-yellow-100 text-yellow-800 flex gap-1 items-center"><Loader2 className="w-3 h-3 animate-spin" /> Provisioning</Badge>;
        }
        return <Badge className="bg-gray-100 text-gray-800">Pending</Badge>;
    };

    return (
        <div className="container mx-auto p-8 max-w-6xl">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Tracking Domains</h1>
                    <p className="text-gray-500 mt-2">Manage custom domains for open/click tracking. Requires a fresh VPS (Ubuntu).</p>
                </div>
                <Button onClick={() => setIsAddModalOpen(true)} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-2" /> Add Domain
                </Button>
            </div>

            <div className="grid gap-6">
                {domains.map(domain => (
                    <Card key={domain.id} className="overflow-hidden">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-full ${domain.status === 'active' ? 'bg-green-100' : 'bg-gray-100'}`}>
                                        <Globe className={`w-6 h-6 ${domain.status === 'active' ? 'text-green-600' : 'text-gray-500'}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            {domain.domain}
                                            {getStatusBadge(domain.status, domain.ssl_active)}
                                        </h3>
                                        <div className="text-sm text-gray-500 mt-1 flex items-center gap-4">
                                            <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {domain.ip_address}</span>
                                            <span>Added: {new Date(domain.created_at).toLocaleDateString()}</span>
                                        </div>
                                        {domain.provisioning_log && domain.status !== 'active' && (
                                            <div className="mt-3 bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono max-h-32 overflow-y-auto w-[600px]">
                                                {domain.provisioning_log.split('\n').slice(-5).join('\n')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => deleteDomain(domain.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="w-5 h-5" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {domains.length === 0 && !loading && (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <Server className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">No Tracking Domains</h3>
                        <p className="text-gray-500 mb-6 max-w-md mx-auto">Connect a VPS to serve as a white-labeled tracking domain to improve deliverability.</p>
                        <Button onClick={() => setIsAddModalOpen(true)} variant="outline">
                            Connect Server
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Tracking Domain</DialogTitle>
                        <DialogDescription>
                            We will SSH into your server, install Nginx/SSL, and configure it for tracking.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {error && <Alert className="bg-red-50 text-red-800 border-red-200"><AlertDescription>{error}</AlertDescription></Alert>}

                        <div className="grid gap-2">
                            <Label>Domain Name (Subdomain recommended)</Label>
                            <Input
                                placeholder="track.yourbrand.com"
                                value={newDomain.domain}
                                onChange={e => setNewDomain(d => ({ ...d, domain: e.target.value }))}
                            />
                            <p className="text-xs text-gray-500">Ensure DNS A Record points to the IP below.</p>
                        </div>

                        <div className="grid gap-2">
                            <Label>Server IP Address</Label>
                            <Input
                                placeholder="1.2.3.4"
                                value={newDomain.ip_address}
                                onChange={e => setNewDomain(d => ({ ...d, ip_address: e.target.value }))}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label>Root Password</Label>
                            <Input
                                type="password"
                                placeholder="Server Root Password"
                                value={newDomain.root_password}
                                onChange={e => setNewDomain(d => ({ ...d, root_password: e.target.value }))}
                            />
                            <p className="text-xs text-gray-500">Used once for provisioning, never stored.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddDomain} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Provision Server
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
