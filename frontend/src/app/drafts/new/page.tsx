'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { serviceAccountsApi, usersApi, dataListsApi, contactsApi, API_URL, apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Sparkles,
  Layout,
  Target,
  Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateTagsGuide } from '@/components/drafts/TemplateTagsGuide';
import { TemplatePreview } from '@/components/drafts/TemplatePreview';
import { TestDraftDialog } from '@/components/drafts/TestDraftDialog';

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
  body_format: 'html' | 'text';
  body_template: string;
  test_after_email: string;
  test_after_count: number;
}

export default function NewDraftPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [emailsPerUser, setEmailsPerUser] = useState<number>(1);
  const [userSearch, setUserSearch] = useState('');
  const [step, setStep] = useState(1);
  const [notifications, setNotifications] = useState<Array<{ id: string, message: string, type: 'success' | 'error' | 'info' }>>([]);

  const totalReach = useMemo(() => {
    const selectedLists = contactLists.filter(l => selectedContacts.includes(l.id));
    const allEmails = new Set<string>();
    selectedLists.forEach(l => {
      if (l.contacts) {
        l.contacts.forEach(c => allEmails.add(c.email));
      }
    });
    return allEmails.size;
  }, [contactLists, selectedContacts]);

  const [autoInsertTracking, setAutoInsertTracking] = useState(true);
  const [config, setConfig] = useState<DraftConfig>({
    name: '',
    subject: '',
    body_html: '',
    from_name: '',
    use_custom_headers: false,
    custom_headers: '',
    body_format: 'html',
    body_template: '',
    test_after_email: '',
    test_after_count: 0
  });

  const DEFAULT_HEADERS = `MIME-version: 1.0\nContent-type: text/html\nTo: [to]\nfrom: [from] <[smtp]>\nSubject: [subject]\nDate: [date]\nMessage-ID: [Message-ID]`;
  const [showTagsGuide, setShowTagsGuide] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);

  const filteredSelectedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const base = users.filter(u => selectedAccounts.includes(u.service_account_id));
    if (!q) return base;
    return base.filter(u => u.email.toLowerCase().includes(q));
  }, [users, selectedAccounts, userSearch]);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await apiClient.request('/api/v1/accounts/');
      if (response.data && Array.isArray(response.data)) {
        setAccounts(response.data);
      }
    } catch (error: any) {
      showNotification('Failed to load accounts', 'error');
    }
  }, [showNotification]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await apiClient.request('/api/v1/users/');
      if (response.data && Array.isArray(response.data)) {
        setUsers(response.data);
      }
    } catch (error: any) {
      showNotification('Failed to load users', 'error');
    }
  }, [showNotification]);

  const loadContactLists = useCallback(async () => {
    try {
      const response = await apiClient.request('/api/v1/contacts/lists');
      if (response.data && Array.isArray(response.data)) {
        setContactLists(response.data);
      }
    } catch (error: any) {
      showNotification('Failed to load contact lists', 'error');
    }
  }, [showNotification]);

  useEffect(() => {
    loadAccounts();
    loadUsers();
    loadContactLists();
  }, [loadAccounts, loadUsers, loadContactLists]);

  const createDraft = async () => {
    if (!config.name.trim() || !config.subject.trim() || (!config.body_html.trim() && !config.body_template.trim())) {
      showNotification('Please fill in all required fields.', 'error');
      return;
    }
    if (selectedUsers.length === 0 || selectedContacts.length === 0) {
      showNotification('Please select users and contact lists.', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...config,
        selected_account_ids: selectedAccounts,
        selected_user_ids: selectedUsers,
        selected_contact_list_ids: selectedContacts,
        emails_per_user: emailsPerUser
      };

      const response = await apiClient.request('/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (response.error) throw new Error(response.error);

      showNotification('Campaign initialized! Now syncing dispatch queue...', 'success');
      await uploadDrafts(response.data.id);
    } catch (error: any) {
      showNotification(`Failed to create draft: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const uploadDrafts = async (draftId: number) => {
    try {
      const response = await apiClient.request(`/api/v1/drafts/${draftId}/upload`, { method: 'POST' });
      if (response.error) throw new Error(response.error);
      showNotification(`Successfully synced ${response.data.total_drafts} dispatches!`, 'success');
      router.push('/drafts');
    } catch (error: any) {
      showNotification(`Failed to sync drafts: ${error.message}`, 'error');
    }
  };

  const nextStep = () => {
    if (step === 1 && (!config.name.trim() || !config.subject.trim())) {
      showNotification('Missing basic campaign info', 'error');
      return;
    }
    if (step === 2 && (selectedUsers.length === 0 || selectedContacts.length === 0)) {
      showNotification('Select targets and personas first', 'error');
      return;
    }
    if (step < 3) setStep(step + 1);
    else createDraft();
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,rgba(139,92,246,0.1),transparent_50%)] pointer-events-none" />

      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <header className="h-16 border-b border-white/5 bg-black/20 backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Creative Outreach <span className="text-white/40 font-medium">2026</span></h1>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold flex items-center gap-1">
                <Zap className="h-2 w-2 text-indigo-400" /> Professional Grade
              </p>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {[
              { id: 1, label: 'Creative', icon: Sparkles },
              { id: 2, label: 'Target', icon: Target },
              { id: 3, label: 'Launch', icon: Send }
            ].map((s) => (
              <div key={s.id} className={`flex items-center gap-3 transition-all duration-300 ${step === s.id ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${step === s.id ? 'bg-indigo-600 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'border-white/10'
                  }`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="hidden md:block text-left leading-tight">
                  <p className="text-xs font-bold">{s.label}</p>
                  <p className="text-[9px] text-white/40 mt-0.5">Step {s.id}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/drafts')} className="text-white/60 hover:text-white">
              Exit
            </Button>
            <Button size="sm" onClick={nextStep} disabled={loading} className="bg-white text-black hover:bg-white/90 font-bold px-6">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {step === 3 ? 'Finalize' : 'Continue'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[#0a0a0c]">
          <div className="max-w-[1600px] mx-auto p-8 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
              <div className="lg:col-span-8 flex flex-col gap-6">
                <Tabs defaultValue="creative" className="w-full">
                  <TabsList className="bg-white/5 border border-white/10 p-1 rounded-lg self-start mb-6">
                    <TabsTrigger value="creative" className="flex items-center gap-2 px-6">
                      <Sparkles className="h-4 w-4" /> Creative Outreach
                    </TabsTrigger>
                    <TabsTrigger value="strategy" className="flex items-center gap-2 px-6">
                      <Layout className="h-4 w-4" /> Sending Strategy
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="creative" className="mt-0 space-y-6">
                    <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-white/60">Campaign Foundation</CardTitle>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-indigo-400 border-indigo-500/30">Foundation</Badge>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-white/40">Campaign Label</Label>
                            <Input
                              placeholder="e.g. Q1 Sales Push"
                              className="bg-black/40 border-white/10"
                              value={config.name}
                              onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/40">From Name</Label>
                            <Input
                              placeholder="e.g. John from Antigravity"
                              className="bg-black/40 border-white/10"
                              value={config.from_name}
                              onChange={e => setConfig(c => ({ ...c, from_name: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/40">Email Subject</Label>
                          <Input
                            placeholder="Subject line..."
                            className="bg-black/40 border-white/10"
                            value={config.subject}
                            onChange={e => setConfig(c => ({ ...c, subject: e.target.value }))}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-white/5 border-white/10 backdrop-blur-xl overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg font-bold text-white">Email Content</CardTitle>
                        <div className="flex bg-black/40 p-1 rounded-md border border-white/10">
                          {['html', 'text'].map((f) => (
                            <button key={f} onClick={() => setConfig(c => ({ ...c, body_format: f as any }))}
                              className={`px-3 py-1 rounded text-xs font-bold transition-all ${config.body_format === f ? 'bg-white/10 text-white' : 'text-white/40'}`}>
                              {f.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {config.body_format === 'html' ? (
                          <Textarea
                            placeholder="<html>...</html>"
                            className="bg-[#050505] border-white/10 font-mono text-xs min-h-[300px]"
                            value={config.body_html}
                            onChange={e => setConfig(c => ({ ...c, body_html: e.target.value }))}
                          />
                        ) : (
                          <Textarea
                            placeholder="Plain text message..."
                            className="bg-[#050505] border-white/10 text-sm min-h-[300px]"
                            value={config.body_template}
                            onChange={e => setConfig(c => ({ ...c, body_template: e.target.value }))}
                          />
                        )}
                        <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                          <Checkbox id="auto-track" checked={autoInsertTracking} onCheckedChange={(v) => setAutoInsertTracking(!!v)} />
                          <Label htmlFor="auto-track" className="text-sm font-medium">Auto-Optimize for Tracking</Label>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="strategy" className="mt-0 space-y-6">
                    <Card className="bg-white/5 border-white/10">
                      <CardHeader><CardTitle>Distribution Strategy</CardTitle></CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-xs text-white/40 uppercase font-bold">Sender Accounts</Label>
                            <div className="bg-black/40 border border-white/10 rounded-lg p-2 max-h-[200px] overflow-auto">
                              {accounts.map(acc => (
                                <div key={acc.id} className="flex items-center gap-2 p-1">
                                  <Checkbox checked={selectedAccounts.includes(acc.id)} onCheckedChange={(v) => {
                                    setSelectedAccounts(p => v ? [...p, acc.id] : p.filter(i => i !== acc.id))
                                  }} />
                                  <span className="text-xs truncate">{acc.name || acc.client_email}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/40 uppercase font-bold">Contact Lists</Label>
                            <div className="bg-black/40 border border-white/10 rounded-lg p-2 max-h-[200px] overflow-auto">
                              {contactLists.map(list => (
                                <div key={list.id} className="flex items-center gap-2 p-1">
                                  <Checkbox checked={selectedContacts.includes(list.id)} onCheckedChange={(v) => {
                                    setSelectedContacts(p => v ? [...p, list.id] : p.filter(i => i !== list.id))
                                  }} />
                                  <span className="text-xs truncate">{list.name} ({list.contacts?.length || 0})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                          <div className="space-y-1">
                            <Label className="text-xs text-white/40">Emails Per User</Label>
                            <Input type="number" className="w-24 bg-black/40 border-white/10" value={emailsPerUser} onChange={e => setEmailsPerUser(parseInt(e.target.value) || 1)} />
                          </div>
                          <div className="flex-1 bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20 text-center">
                            <p className="text-[10px] text-indigo-400 font-bold uppercase">Total Queue forecast</p>
                            <p className="text-xl font-black">{selectedUsers.length * emailsPerUser}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="lg:col-span-4 space-y-6">
                <Card className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-white/10 backdrop-blur-2xl">
                  <CardHeader><CardTitle className="text-white flex items-center gap-2"><Target className="h-4 w-4" /> Target Reach</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-white/40 uppercase font-bold">Unique Reach</p>
                        <p className="text-3xl font-black">{totalReach.toLocaleString()}</p>
                      </div>
                      <Users className="h-8 w-8 text-indigo-400 opacity-50" />
                    </div>
                    <Button className="w-full h-12 bg-white/5 hover:bg-white/10 border-white/10 font-bold" onClick={() => setShowTestDialog(true)}>
                      <Zap className="h-4 w-4 mr-2 text-yellow-500" /> Send Test Dispatches
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 h-[500px] flex flex-col overflow-hidden">
                  <CardHeader className="py-3 border-b border-white/5"><CardTitle className="text-xs text-white/40">Live Preview</CardTitle></CardHeader>
                  <CardContent className="flex-1 overflow-auto p-4 text-xs text-white/60">
                    {config.body_html || config.body_template ? (
                      <div dangerouslySetInnerHTML={{ __html: config.body_html || config.body_template }} />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20">
                        <Sparkles className="h-10 w-10 mb-2" />
                        <p className="font-bold text-[10px] uppercase tracking-widest">Design Creative</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>

      <TestDraftDialog
        open={showTestDialog}
        draftId={null}
        config={config}
        availableUsers={users.filter(u => selectedAccounts.includes(u.service_account_id))}
        onClose={() => setShowTestDialog(false)}
      />

      {notifications.map(n => (
        <div key={n.id} className={`fixed bottom-8 right-8 px-4 py-3 rounded-lg border backdrop-blur-xl z-50 text-sm font-medium animate-in slide-in-from-right-10 ${n.type === 'success' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200' : 'bg-red-500/10 border-red-500/30 text-red-200'
          }`}>
          {n.message}
        </div>
      ))}
    </div>
  );
}