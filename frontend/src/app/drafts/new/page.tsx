'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layout,
  Trash2,
  Plus,
  Send,
  Search,
  Target,
  Zap,
  Mail,
  User,
  ArrowRight,
  Sparkles,
  Eye,
  Code,
  MessageSquare,
  Save,
  LineChart,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TestDraftDialog } from '@/components/drafts/TestDraftDialog';
import { TemplatePreview } from '@/components/drafts/TemplatePreview';
import { Toast } from '@/components/ui/toast'; // Changed from { toast }

interface User {
  id: number;
  email: string;
}

interface Account {
  id: number;
  name: string;
  client_email: string;
}

interface ContactList {
  id: number;
  name: string;
  description: string;
  contact_count: number;
}

interface DraftConfig {
  name: string;
  subject: string;
  body_html: string;
  body_format: 'html' | 'text';
  body_template: string;
  from_name: string;
  selected_account_ids: number[];
  selected_user_ids: number[];
  selected_contact_list_ids: number[];
  use_custom_headers: boolean;
  custom_headers: string;
  distribution_strategy: 'round_robin' | 'even_split';
  emails_per_user: number;
  list_start_index: number;
  list_send_limit: number | null;
  test_after_email: string;
  test_after_count: number;
}

interface TrackingDomain {
  id: number;
  domain: string;
  status: string;
}

const TEMPLATE_TAGS = [
  { tag: '[smtp]', label: 'Sender Email', group: 'System' },
  { tag: '[from]', label: 'Friendly From', group: 'System' },
  { tag: '[subject]', label: 'Subject Line', group: 'System' },
  { tag: '[to]', label: 'Recipient Email', group: 'System' },
  { tag: '[rndn_5]', label: 'Random Digits (5)', group: 'Random' },
  { tag: '[rnda_8]', label: 'Random Alphanumeric (8)', group: 'Random' },
  { tag: '[rndlu_10]', label: 'Random Letters (10)', group: 'Random' },
];

export default function NewDraftPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [trackingDomains, setTrackingDomains] = useState<TrackingDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState('creative');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [tagGuideOpen, setTagGuideOpen] = useState(false);

  // Toast state
  const [activeToast, setActiveToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setActiveToast({ message, type });
  };

  const [config, setConfig] = useState<DraftConfig>({
    name: `Campaign ${new Date().toLocaleDateString()}`,
    subject: '',
    body_html: '',
    body_format: 'html',
    body_template: '',
    from_name: '',
    selected_account_ids: [],
    selected_user_ids: [],
    selected_contact_list_ids: [],
    use_custom_headers: false,
    custom_headers: '',
    distribution_strategy: 'round_robin',
    emails_per_user: 50,
    list_start_index: 0,
    list_send_limit: null,
    test_after_email: '',
    test_after_count: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, contactListsRes, domainsRes] = await Promise.all([
          apiClient.request('/api/v1/accounts'),
          apiClient.request('/api/v1/contacts/lists'),
          apiClient.request('/api/v1/tracking/domains')
        ]);

        setAccounts(accountsRes.data || []);
        setContactLists(contactListsRes.data || []);
        setTrackingDomains(domainsRes.data || []);
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
        showToast('Failed to load accounts or lists', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (config.selected_account_ids.length > 0) {
      const fetchUsers = async () => {
        try {
          const responses = await Promise.all(
            config.selected_account_ids.map(id =>
              apiClient.request(`/api/v1/accounts/${id}/users`)
            )
          );
          const allUsers = responses.flatMap(res => res.data || []);
          setUsers(allUsers);
        } catch (error) {
          console.error('Failed to fetch users:', error);
        }
      };
      fetchUsers();
    } else {
      setUsers([]);
    }
  }, [config.selected_account_ids]);

  const totalReach = useMemo(() => {
    let fullCount = contactLists
      .filter(list => config.selected_contact_list_ids.includes(list.id))
      .reduce((sum, list) => sum + (list.contact_count || 0), 0);

    let slicedCount = fullCount;
    if (config.list_start_index > 0) {
      slicedCount = Math.max(0, slicedCount - config.list_start_index);
    }
    if (config.list_send_limit && config.list_send_limit > 0) {
      slicedCount = Math.min(slicedCount, config.list_send_limit);
    }
    return slicedCount;
  }, [contactLists, config.selected_contact_list_ids, config.list_start_index, config.list_send_limit]);

  const handleCreate = async () => {
    if (!config.name || !config.subject || config.selected_user_ids.length === 0 || config.selected_contact_list_ids.length === 0) {
      showToast('Please fill in all mandatory fields.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.request('/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify({
          ...config,
          selected_contact_list_ids: config.selected_contact_list_ids
        })
      });
      if (response.error) throw new Error(response.error);
      showToast('Campaign draft successfully initialized.', 'success');
      router.push('/drafts');
    } catch (error: any) {
      showToast(error.message || 'Failed to create campaign', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const insertTag = (tag: string) => {
    const target = config.body_format === 'html' ? 'body_html' : 'body_template';
    let tagToInsert = tag;
    if (tag === '[tracking_link]') {
      tagToInsert = '[tracking_link]https://[/tracking_link]';
    }
    setConfig(prev => ({
      ...prev,
      [target]: prev[target as keyof DraftConfig] + tagToInsert
    }));
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Action Bar */}
      <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <Input
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                className="h-8 border-none bg-transparent p-0 text-lg font-bold focus-visible:ring-0 w-64"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                High Velocity Outreach <ChevronRight className="h-3 w-3" /> New Campaign
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
              <Eye className="h-4 w-4" /> Full Preview
            </Button>
            <Button variant="outline" onClick={() => setTestDialogOpen(true)} className="gap-2">
              <Send className="h-4 w-4" /> Send Test
            </Button>
            <Button onClick={handleCreate} disabled={submitting} className="gap-2 px-6">
              {submitting ? <Layout className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Initialize Campaign
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 container grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left & Center: Configuration Workspace */}
        <div className="lg:col-span-8 flex flex-col gap-6 h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="creative" className="gap-2">
                <Sparkles className="h-4 w-4" /> Creative Outreach
              </TabsTrigger>
              <TabsTrigger value="strategy" className="gap-2">
                <Target className="h-4 w-4" /> Distribution Strategy
              </TabsTrigger>
            </TabsList>

            <TabsContent value="creative" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Creative Content</CardTitle>
                      <CardDescription>Design your message and define identity parameters.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 bg-muted p-1 rounded-md">
                      <Button
                        variant={config.body_format === 'html' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, body_format: 'html' }))}
                        className="h-8"
                      >HTML</Button>
                      <Button
                        variant={config.body_format === 'text' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, body_format: 'text' }))}
                        className="h-8"
                      >Text</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Identity Name</Label>
                      <Input
                        placeholder="e.g. John from SpeedSend"
                        value={config.from_name}
                        onChange={(e) => setConfig(prev => ({ ...prev, from_name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subject Line</Label>
                      <Input
                        placeholder="Enter headline..."
                        value={config.subject}
                        onChange={(e) => setConfig(prev => ({ ...prev, subject: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-4 bg-muted/5 p-4 rounded-lg border border-dashed border-primary/20">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          Header Personalization
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/30 text-primary uppercase font-black">Pro</Badge>
                        </Label>
                        <p className="text-[11px] text-muted-foreground">Inject custom MIME headers (X-Prefix/List-Unsubscribe/etc).</p>
                      </div>
                      <Switch
                        checked={config.use_custom_headers}
                        onCheckedChange={(val) => setConfig(prev => ({ ...prev, use_custom_headers: val }))}
                      />
                    </div>
                    {config.use_custom_headers && (
                      <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {[
                            { t: 'From: [from] <[smtp]>', l: 'From Header' },
                            { t: 'Subject: [subject]', l: 'Subject Header' },
                            { t: 'Content-Type: text/html; charset=utf-8', l: 'HTML Type' },
                            { t: 'List-Unsubscribe: <mailto:unsub@domain.com>', l: 'Unsub' },
                            { t: 'X-Campaign-ID: [rndn_5]', l: 'Campaign ID' },
                            { t: 'X-Priority: 1', l: 'High Priority' },
                            { t: 'X-Report-Abuse-To: abuse@domain.com', l: 'Abuse Report' }
                          ].map(htag => (
                            <Button
                              key={htag.l}
                              variant="outline"
                              size="sm"
                              className="h-6 text-[9px] px-2 bg-background/50"
                              onClick={() => setConfig(prev => ({ ...prev, custom_headers: (prev.custom_headers ? prev.custom_headers + '\n' : '') + htag.t }))}
                            >
                              + {htag.l}
                            </Button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="X-Campaign-ID: 123&#10;List-Unsubscribe: <mailto:unsub@domain.com>"
                          className="h-24 font-mono text-xs bg-muted/30 border-primary/10 focus-visible:ring-primary/20"
                          value={config.custom_headers}
                          onChange={(e) => setConfig(prev => ({ ...prev, custom_headers: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 relative pt-4 border-t">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-4">
                        <Label>Message Body ({config.body_format.toUpperCase()})</Label>
                        <div className="flex gap-1 items-center">
                          <Button
                            variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 border-dashed"
                            onClick={() => insertTag('[tracking_pixel]')}
                          >
                            <LineChart className="h-3 w-3" /> PIXEL
                          </Button>
                          <Button
                            variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 border-dashed"
                            onClick={() => insertTag('[tracking_link]')}
                          >
                            <Plus className="h-3 w-3" /> LINK
                          </Button>
                          <Button
                            variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 border-dashed text-destructive border-destructive/20"
                            onClick={() => insertTag('[unsubscribe]')}
                          >
                            <Trash2 className="h-3 w-3" /> UNSUB
                          </Button>
                          {trackingDomains.find(d => d.status === 'active') ? (
                            <Badge variant="outline" className="text-[8px] h-4 bg-green-500/10 text-green-600 border-green-500/20 px-1 gap-1">
                              <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                              {trackingDomains.find(d => d.status === 'active')?.domain}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] h-4 bg-red-500/10 text-red-600 border-red-500/20 px-1 gap-1">
                              <div className="w-1 h-1 rounded-full bg-red-500" />
                              No Active Tracking Domain
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setTagGuideOpen(!tagGuideOpen)} className="h-7 gap-1 text-xs">
                        <HelpCircle className="h-3 w-3" /> Tag Guide
                      </Button>
                    </div>
                    <Textarea
                      placeholder={config.body_format === 'html' ? "Enter HTML source..." : "Enter plain text message..."}
                      className="min-h-[400px] font-mono text-sm leading-relaxed shadow-inner"
                      value={config.body_format === 'html' ? config.body_html : config.body_template}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        [config.body_format === 'html' ? 'body_html' : 'body_template']: e.target.value
                      }))}
                    />
                    {tagGuideOpen && (
                      <div className="absolute top-20 right-4 w-64 bg-card border rounded-lg shadow-xl p-4 z-10 animate-in slide-in-from-right-2">
                        <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2">
                          <Code className="h-3 w-3" /> Tag Insertion
                        </h4>
                        <div className="space-y-1">
                          {TEMPLATE_TAGS.map(tag => (
                            <button
                              key={tag.tag}
                              onClick={() => insertTag(tag.tag)}
                              className="flex justify-between items-center w-full p-2 text-[11px] rounded hover:bg-muted transition-colors"
                            >
                              <code className="text-primary font-bold">{tag.tag}</code>
                              <span className="text-muted-foreground">{tag.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="strategy" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-primary">
                      <User className="h-5 w-5" /> Workspace Source
                    </CardTitle>
                    <CardDescription>Select identity clusters and personas.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest">Service Accounts</Label>
                        <Badge variant="outline" className="text-[10px] h-5">{accounts.length} Available</Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 border rounded-xl p-3 h-44 overflow-y-auto bg-muted/20 shadow-inner scrollbar-thin">
                        {accounts.map(account => (
                          <div key={account.id} className="flex items-center space-x-2 py-1 px-2 rounded-md hover:bg-background/80 transition-all group">
                            <Checkbox
                              id={`acc-${account.id}`}
                              checked={config.selected_account_ids.includes(account.id)}
                              className="border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              onCheckedChange={(checked) => {
                                setConfig(prev => ({
                                  ...prev,
                                  selected_account_ids: checked
                                    ? [...prev.selected_account_ids, account.id]
                                    : prev.selected_account_ids.filter(id => id !== account.id)
                                }));
                              }}
                            />
                            <div className="flex flex-col">
                              <label htmlFor={`acc-${account.id}`} className="text-[11px] font-bold cursor-pointer group-hover:text-primary transition-colors">{account.name || 'Cloud SMT'}</label>
                              <span className="text-[9px] text-muted-foreground leading-tight italic">{account.client_email}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest">Persona Assignment</Label>
                        <div className="flex gap-2 text-[10px] font-black text-primary/60">
                          <button onClick={() => setConfig(prev => ({ ...prev, selected_user_ids: users.map(u => u.id) }))} className="hover:text-primary transition-colors">ALL</button>
                          <span className="opacity-30">|</span>
                          <button onClick={() => setConfig(prev => ({ ...prev, selected_user_ids: [] }))} className="hover:text-primary transition-colors">NONE</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 border rounded-xl p-3 h-52 overflow-y-auto bg-muted/20 shadow-inner scrollbar-thin font-mono">
                        {users.map(user => (
                          <div key={user.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-background/80 transition-all border border-transparent hover:border-primary/10 group">
                            <div className="flex items-center space-x-3">
                              <Checkbox
                                id={`usr-${user.id}`}
                                checked={config.selected_user_ids.includes(user.id)}
                                className="data-[state=checked]:bg-primary"
                                onCheckedChange={(checked) => {
                                  setConfig(prev => ({
                                    ...prev,
                                    selected_user_ids: checked
                                      ? [...prev.selected_user_ids, user.id]
                                      : prev.selected_user_ids.filter(id => id !== user.id)
                                  }));
                                }}
                              />
                              <label htmlFor={`usr-${user.id}`} className="text-[11px] font-medium cursor-pointer flex items-center gap-2">
                                <User className="h-3 w-3 opacity-40 group-hover:opacity-100 group-hover:text-primary" />
                                {user.email}
                              </label>
                            </div>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 opacity-40 group-hover:opacity-100 border-primary/20">Persona</Badge>
                          </div>
                        ))}
                        {users.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-xs">
                            Select an account to load personas
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-primary">
                      <Mail className="h-5 w-5" /> Destination Segments
                    </CardTitle>
                    <CardDescription>Assign recipient clusters to this session.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-1 border rounded-xl p-3 h-[26rem] overflow-y-auto bg-muted/20 shadow-inner scrollbar-thin">
                      {contactLists.map(list => (
                        <div key={list.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-background transition-all border border-transparent hover:border-primary/10 group">
                          <div className="flex items-center space-x-3">
                            <Checkbox
                              id={`list-${list.id}`}
                              checked={config.selected_contact_list_ids.includes(list.id)}
                              className="data-[state=checked]:bg-primary"
                              onCheckedChange={(checked) => {
                                setConfig(prev => ({
                                  ...prev,
                                  selected_contact_list_ids: checked
                                    ? [...prev.selected_contact_list_ids, list.id]
                                    : prev.selected_contact_list_ids.filter(id => id !== list.id)
                                }));
                              }}
                            />
                            <div className="flex flex-col">
                              <label htmlFor={`list-${list.id}`} className="text-[11px] font-bold cursor-pointer transition-colors leading-tight group-hover:text-primary">{list.name}</label>
                              <span className="text-[8px] uppercase tracking-tighter opacity-40 font-black italic">{list.id} :: CONTACT LIST</span>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-[10px] h-5 px-2 bg-primary/5 text-primary border-primary/10 font-black">{list.contact_count} REC.</Badge>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-tighter">List Start Index</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={config.list_start_index}
                          onChange={(e) => setConfig(prev => ({ ...prev, list_start_index: parseInt(e.target.value) || 0 }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-tighter">Send Limit (Slice)</Label>
                        <Input
                          type="number"
                          placeholder="All"
                          value={config.list_send_limit || ''}
                          onChange={(e) => setConfig(prev => ({ ...prev, list_send_limit: e.target.value ? parseInt(e.target.value) : null }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribution Parameters</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4 border-r pr-8">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest">Burst Density</Label>
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Global Limit</Badge>
                    </div>
                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-dashed hover:border-primary/30 transition-colors">
                      <Input
                        type="number"
                        value={config.emails_per_user}
                        onChange={(e) => setConfig(prev => ({ ...prev, emails_per_user: parseInt(e.target.value) || 1 }))}
                        className="w-24 h-10 text-lg font-black text-center bg-background border-primary/20"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">Emails per Persona</span>
                        <span className="text-[10px] text-muted-foreground italic leading-tight">Max drafts to generate per cycle</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest">Automation Parameters</Label>
                      <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-600 bg-orange-500/5">Safety Lock</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 p-4 bg-muted/10 rounded-xl border">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">Test Recovery Email</span>
                          <Input
                            placeholder="audit@domain.com"
                            className="h-8 text-xs font-mono mt-1"
                            value={config.test_after_email}
                            onChange={(e) => setConfig(prev => ({ ...prev, test_after_email: e.target.value }))}
                          />
                        </div>
                        <div className="flex flex-col w-24">
                          <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">Trigger (X)</span>
                          <Input
                            type="number"
                            placeholder="100"
                            className="h-8 text-xs font-mono mt-1"
                            value={config.test_after_count}
                            onChange={(e) => setConfig(prev => ({ ...prev, test_after_count: parseInt(e.target.value) || 0 }))}
                          />
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground italic">Automatically sends a test to the recovery email after every X successful drafts.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Pane: Real-Time Insights & Mini Preview */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">Intelligence Hub</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-3xl font-black tracking-tighter text-foreground">{totalReach.toLocaleString()}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Total Net Reach</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{(config.selected_user_ids.length * config.emails_per_user).toLocaleString()}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Cap Forecast</p>
                </div>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, (config.selected_user_ids.length * config.emails_per_user / (totalReach || 1)) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="h-[calc(100vh-22rem)] flex flex-col overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Live Context Render</CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">Simulation</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-auto bg-muted/10">
              <div className="p-6">
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground w-12">From:</span>
                    <span className="text-xs font-medium">{config.from_name || 'System Identity'} &lt;sender@workspace.com&gt;</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground w-12">Sub:</span>
                    <span className="text-xs font-bold">{config.subject || 'Simulation Subject...'}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-4 min-h-[400px] shadow-sm">
                  {config.body_format === 'html' ? (
                    <div
                      className="text-sm prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: config.body_html || '<div class="opacity-20 flex flex-col items-center justify-center pt-24"><Sparkles class="h-12 w-12 mb-4" /><p class="font-bold uppercase tracking-widest text-[10px]">Awaiting Creative...</p></div>' }}
                    />
                  ) : (
                    <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/80">
                      {config.body_template || 'Awaiting plain text creative input...'}
                    </pre>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <TestDraftDialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        draftId={null}
        config={config}
        availableUsers={users}
      />

      <TemplatePreview
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        headers={config.custom_headers}
        body={config.body_format === 'html' ? config.body_html : config.body_template}
        isLoading={false}
      />

      {activeToast && (
        <Toast
          message={activeToast.message}
          type={activeToast.type}
          onClose={() => setActiveToast(null)}
        />
      )}

      <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: hsl(var(--muted-foreground) / 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--muted-foreground) / 0.4);
                }
            `}</style>
    </div>
  );
}